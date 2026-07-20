import {
  divideRoundHalfAwayFromZero,
  safeBigIntToNumber,
} from "./domain/integer";
import type {
  PersonalEventEffectV2,
  PersonalEventMagnitudeV2,
  PersonalEventTemplateV2,
} from "./personal-event-v2";

export const PERSONAL_EVENT_IMPACT_MATRIX_V1_VERSION =
  "personal-event-impact-matrix-v1" as const;

export type PersonalEventResponseImpactV1 = Readonly<{
  eventId: string;
  eventVersion: number;
  classification: PersonalEventTemplateV2["classification"];
  category: PersonalEventTemplateV2["category"];
  responseId: string;
  operationTypes: readonly PersonalEventEffectV2["type"][];
  totalCashFlowMinimumCents: number;
  totalCashFlowMaximumCents: number;
  monthlyObligationDeltaMinimumCents: number;
  monthlyObligationDeltaMaximumCents: number;
  annualLivingCostDeltaMinimumCents: number;
  annualLivingCostDeltaMaximumCents: number;
  happinessDeltaMinimumPpm: number;
  happinessDeltaMaximumPpm: number;
  burnoutDeltaMinimumPpm: number;
  burnoutDeltaMaximumPpm: number;
}>;

export type PersonalEventImpactMatrixV1 = Readonly<{
  version: typeof PERSONAL_EVENT_IMPACT_MATRIX_V1_VERSION;
  eventCount: number;
  responseCount: number;
  classificationCounts: Readonly<Record<
    PersonalEventTemplateV2["classification"],
    number
  >>;
  responses: readonly PersonalEventResponseImpactV1[];
}>;

type Range = Readonly<{ minimum: number; maximum: number }>;

function scale(value: number, multiplierPpm: number): number {
  return safeBigIntToNumber(
    divideRoundHalfAwayFromZero(
      BigInt(value) * BigInt(multiplierPpm),
      BigInt(1_000_000),
    ),
    "personal event impact range",
  );
}

function magnitudeRange(
  template: PersonalEventTemplateV2,
  magnitude: PersonalEventMagnitudeV2,
): Range {
  if (magnitude.source === "fixed") {
    return { minimum: magnitude.value, maximum: magnitude.value };
  }
  const parameter = template.parameters.find(
    ({ id }) => id === magnitude.parameterId,
  );
  if (parameter === undefined) {
    throw new RangeError(
      `missing impact parameter ${template.id}.${magnitude.parameterId}`,
    );
  }
  const endpoints = [
    scale(parameter.minimum, magnitude.multiplierPpm),
    scale(parameter.maximum, magnitude.multiplierPpm),
  ];
  return { minimum: Math.min(...endpoints), maximum: Math.max(...endpoints) };
}

function addRange(target: { minimum: number; maximum: number }, range: Range): void {
  target.minimum += range.minimum;
  target.maximum += range.maximum;
  if (!Number.isSafeInteger(target.minimum) || !Number.isSafeInteger(target.maximum)) {
    throw new RangeError("personal event impact total exceeds safe integer range");
  }
}

function negate(range: Range): Range {
  return { minimum: -range.maximum, maximum: -range.minimum };
}

function multiply(range: Range, count: number): Range {
  return {
    minimum: safeBigIntToNumber(
      BigInt(range.minimum) * BigInt(count),
      "personal event impact duration minimum",
    ),
    maximum: safeBigIntToNumber(
      BigInt(range.maximum) * BigInt(count),
      "personal event impact duration maximum",
    ),
  };
}

function responseImpact(
  template: PersonalEventTemplateV2,
  response: PersonalEventTemplateV2["responses"][number],
): PersonalEventResponseImpactV1 {
  const cash = { minimum: 0, maximum: 0 };
  const obligations = { minimum: 0, maximum: 0 };
  const annualLiving = { minimum: 0, maximum: 0 };
  const happiness = { minimum: 0, maximum: 0 };
  const burnout = { minimum: 0, maximum: 0 };
  for (const effect of response.effects) {
    const magnitude = magnitudeRange(
      template,
      effect.type === "insurance_claim" ? effect.grossAmount : effect.magnitude,
    );
    if (effect.type === "cash_delta") {
      addRange(cash, effect.direction === "add" ? magnitude : negate(magnitude));
    } else if (effect.type === "temporary_income") {
      addRange(cash, multiply(magnitude, effect.durationMonths));
    } else if (
      effect.type === "temporary_expense" ||
      effect.type === "recurring_expense" ||
      effect.type === "financed_expense"
    ) {
      addRange(cash, negate(multiply(magnitude, effect.durationMonths)));
      if (effect.type === "financed_expense") addRange(obligations, magnitude);
    } else if (effect.type === "insurance_claim") {
      addRange(cash, { minimum: -magnitude.maximum, maximum: 0 });
    } else if (effect.type === "required_obligation_delta") {
      addRange(obligations, magnitude);
    } else if (effect.type === "annual_living_cost_delta") {
      addRange(annualLiving, magnitude);
    } else if (effect.type === "wellbeing_delta") {
      if (effect.field === "happinessPpm") addRange(happiness, magnitude);
      else addRange(burnout, magnitude);
    } else {
      throw new RangeError(`unsupported personal event effect ${effect.type}`);
    }
  }
  return Object.freeze({
    eventId: template.id,
    eventVersion: template.version,
    classification: template.classification,
    category: template.category,
    responseId: response.id,
    operationTypes: Object.freeze(response.effects.map(({ type }) => type)),
    totalCashFlowMinimumCents: cash.minimum,
    totalCashFlowMaximumCents: cash.maximum,
    monthlyObligationDeltaMinimumCents: obligations.minimum,
    monthlyObligationDeltaMaximumCents: obligations.maximum,
    annualLivingCostDeltaMinimumCents: annualLiving.minimum,
    annualLivingCostDeltaMaximumCents: annualLiving.maximum,
    happinessDeltaMinimumPpm: happiness.minimum,
    happinessDeltaMaximumPpm: happiness.maximum,
    burnoutDeltaMinimumPpm: burnout.minimum,
    burnoutDeltaMaximumPpm: burnout.maximum,
  });
}

export function buildPersonalEventImpactMatrixV1(
  catalog: readonly PersonalEventTemplateV2[],
): PersonalEventImpactMatrixV1 {
  const identities = new Set<string>();
  for (const template of catalog) {
    const identity = `${template.id}@${template.version}`;
    if (identities.has(identity)) {
      throw new RangeError(`duplicate active personal event ${identity}`);
    }
    identities.add(identity);
  }
  const responses = Object.freeze(
    catalog.flatMap((template) =>
      template.responses.map((response) => responseImpact(template, response)),
    ),
  );
  return Object.freeze({
    version: PERSONAL_EVENT_IMPACT_MATRIX_V1_VERSION,
    eventCount: catalog.length,
    responseCount: responses.length,
    classificationCounts: Object.freeze({
      positive: catalog.filter(({ classification }) => classification === "positive").length,
      neutral: catalog.filter(({ classification }) => classification === "neutral").length,
      negative: catalog.filter(({ classification }) => classification === "negative").length,
    }),
    responses,
  });
}

export function validatePersonalEventRewardPenaltyBalanceV1(
  matrix: PersonalEventImpactMatrixV1,
): readonly string[] {
  const violations: string[] = [];
  if (matrix.eventCount < 20 || matrix.responseCount < matrix.eventCount * 2) {
    violations.push("catalog_requires_broad_multi_choice_coverage");
  }
  const positiveSharePpm = Math.floor(
    (matrix.classificationCounts.positive * 1_000_000) / matrix.eventCount,
  );
  const negativeSharePpm = Math.floor(
    (matrix.classificationCounts.negative * 1_000_000) / matrix.eventCount,
  );
  if (positiveSharePpm < 200_000 || positiveSharePpm > 400_000) {
    violations.push("positive_event_share_outside_20_to_40_percent");
  }
  if (negativeSharePpm < 350_000 || negativeSharePpm > 550_000) {
    violations.push("negative_event_share_outside_35_to_55_percent");
  }
  const byEvent = new Map<string, PersonalEventResponseImpactV1[]>();
  for (const response of matrix.responses) {
    const list = byEvent.get(response.eventId) ?? [];
    list.push(response);
    byEvent.set(response.eventId, list);
  }
  for (const [eventId, responses] of byEvent) {
    const classification = responses[0]!.classification;
    if (
      classification === "positive" &&
      !responses.some(
        (response) =>
          response.totalCashFlowMaximumCents > 0 ||
          response.annualLivingCostDeltaMinimumCents < 0 ||
          response.monthlyObligationDeltaMinimumCents < 0,
      )
    ) {
      violations.push(`${eventId}:positive_event_has_no_financial_reward`);
    }
    if (
      classification === "negative" &&
      !responses.some(
        (response) =>
          response.totalCashFlowMinimumCents < 0 ||
          response.annualLivingCostDeltaMaximumCents > 0 ||
          response.monthlyObligationDeltaMaximumCents > 0 ||
          response.happinessDeltaMinimumPpm < 0 ||
          response.burnoutDeltaMaximumPpm > 0,
      )
    ) {
      violations.push(`${eventId}:negative_event_has_no_penalty`);
    }
  }
  return Object.freeze(violations.toSorted());
}
