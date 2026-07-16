import {
  divideRoundHalfAwayFromZero,
  safeBigIntToNumber,
} from "./domain/integer";
import { moneyCents, type MoneyCents, type RatePpm } from "./domain/money";
import type { GameStateV2 } from "./game-state-v2";
import { planV2ObligationFunding } from "./obligation-funding-v2";
import {
  PersonalEventEffectV2Error,
  resolvePersonalEventResponseV2,
} from "./personal-event-effects-v2";
import type { PersonalEventTemplateV2 } from "./personal-event-v2";

export type PersonalEventResponseImpactV2 = Readonly<{
  responseId: string;
  grossCostCents: MoneyCents;
  projectedPlanCostCents: MoneyCents;
  lostIncomeCents: MoneyCents;
  temporaryCostCents: MoneyCents;
  temporaryCostDurationMonths: number;
  coverageBenefitCents: MoneyCents;
  otherBenefitCents: MoneyCents;
  uncoveredCostCents: MoneyCents;
  firstMonthRequiredCashCents: MoneyCents;
  liquidResourceUseCents: MoneyCents;
  likelyLiquidationCents: MoneyCents;
  likelyCreditUseCents: MoneyCents;
  immediateBankruptcyRisk: boolean;
  bankruptcyRisk: "none" | "possible" | "immediate";
  negativeCashFlowDurationMonths: number;
  impactScorePpm: number;
}>;

export type PersonalEventImpactEstimateV2 = Readonly<{
  templateId: string;
  templateVersion: number;
  grossParameterCostCents: MoneyCents;
  directCostCents: MoneyCents;
  projectedPlanCostCents: MoneyCents;
  lostIncomeCents: MoneyCents;
  minimumUncoveredCostCents: MoneyCents;
  minimumTemporaryCostCents: MoneyCents;
  temporaryCostDurationMonths: number;
  coverageBenefitCents: MoneyCents;
  otherBenefitCents: MoneyCents;
  liquidResourceUseCents: MoneyCents;
  likelyLiquidationCents: MoneyCents;
  likelyCreditUseCents: MoneyCents;
  burnMonthsPpm: number;
  negativeCashFlowDurationMonths: number;
  recoveryTimeMonths: number;
  immediateBankruptcyRisk: boolean;
  bankruptcyRisk: "none" | "possible" | "immediate";
  inexpensiveGoalDelayMonths: null;
  impactScorePpm: number;
  reasonableResponseIds: readonly string[];
  responses: readonly PersonalEventResponseImpactV2[];
}>;

export type RuntimeBalanceMonthlyCashFlowEvidenceV2 = Readonly<{
  monthlyCashInflowCents: MoneyCents;
  requiredCashCents: MoneyCents;
}>;

export class RuntimeBalanceImpactV2Error extends Error {
  readonly code:
    | "PARAMETER_OUT_OF_BOUNDS"
    | "NO_AVAILABLE_RESPONSE"
    | "INVALID_MONTHLY_CASH_FLOW_EVIDENCE";

  constructor(code: RuntimeBalanceImpactV2Error["code"], message: string) {
    super(message);
    this.name = "RuntimeBalanceImpactV2Error";
    this.code = code;
  }
}

const IMPACT_HORIZON_MONTHS = 120;

function safeAdd(left: number, right: number, label: string): number {
  return safeBigIntToNumber(BigInt(left) + BigInt(right), label);
}

function safeMultiply(value: number, multiplier: number, label: string): number {
  return safeBigIntToNumber(BigInt(value) * BigInt(multiplier), label);
}

function boundedPpm(numerator: number, denominator: number): number {
  if (numerator <= 0) return 0;
  if (denominator <= 0) return 1_000_000;
  return Math.min(
    1_000_000,
    safeBigIntToNumber(
      divideRoundHalfAwayFromZero(
        BigInt(numerator) * BigInt(1_000_000),
        BigInt(denominator),
      ),
      "runtime balance impact PPM",
    ),
  );
}

function responseImpact(
  state: GameStateV2,
  template: PersonalEventTemplateV2,
  responseId: string,
  parameters: Readonly<Record<string, number>>,
  liquidationCostRatePpm: RatePpm,
  monthlyCashFlowEvidence: RuntimeBalanceMonthlyCashFlowEvidenceV2,
): PersonalEventResponseImpactV2 | null {
  let resolution: ReturnType<typeof resolvePersonalEventResponseV2>;
  try {
    resolution = resolvePersonalEventResponseV2(
      state,
      template,
      {
        eventId: `preflight.${state.currentMonth}.${template.id}.v${template.version}`,
        templateId: template.id,
        templateVersion: template.version,
        parameters,
      },
      responseId,
      `preflight.${state.currentMonth}`,
    );
  } catch (error) {
    if (
      error instanceof PersonalEventEffectV2Error &&
      error.code === "MITIGATION_UNAVAILABLE"
    ) {
      return null;
    }
    throw error;
  }
  let temporaryCost = 0;
  let temporaryCostDurationMonths = 0;
  let otherBenefit = 0;
  let firstMonthScheduledExpense = 0;
  let firstMonthScheduledIncome = 0;
  for (const flow of resolution.scheduledCashFlows) {
    const total = safeMultiply(
      flow.amountCents,
      flow.durationMonths,
      "runtime balance scheduled flow",
    );
    if (flow.kind === "temporary_income") {
      otherBenefit = safeAdd(otherBenefit, total, "runtime balance benefit");
      firstMonthScheduledIncome = safeAdd(
        firstMonthScheduledIncome,
        flow.amountCents,
        "runtime balance first-month income",
      );
    } else {
      temporaryCost = safeAdd(
        temporaryCost,
        total,
        "runtime balance temporary cost",
      );
      temporaryCostDurationMonths = Math.max(
        temporaryCostDurationMonths,
        flow.durationMonths,
      );
      firstMonthScheduledExpense = safeAdd(
        firstMonthScheduledExpense,
        flow.amountCents,
        "runtime balance first-month expense",
      );
    }
  }
  const annualLivingCostIncrease = Math.max(
    0,
    resolution.finances.annualLivingCostCents -
      state.finances.annualLivingCostCents,
  );
  const monthlyObligationIncrease = Math.max(
    0,
    resolution.finances.requiredObligationsCents -
      state.finances.requiredObligationsCents,
  );
  const projectedPlanCost = safeAdd(
    annualLivingCostIncrease,
    safeMultiply(
      monthlyObligationIncrease,
      11,
      "runtime balance eleven additional obligation months",
    ),
    "runtime balance annual plan cost",
  );
  const directPlayerCost = safeAdd(
    resolution.playerCostCents,
    projectedPlanCost,
    "runtime balance projected direct cost",
  );
  const firstMonthPlanCost = safeAdd(
    Math.ceil(annualLivingCostIncrease / 12),
    monthlyObligationIncrease,
    "runtime balance first-month plan cost",
  );
  const firstMonthRequiredCash = moneyCents(
    Math.max(
      0,
      safeAdd(
        firstMonthScheduledExpense,
        firstMonthPlanCost,
        "runtime balance first-month required cash",
      ) - firstMonthScheduledIncome,
    ),
  );
  let negativeCashFlowDurationMonths = 0;
  for (let monthOffset = 0; monthOffset < IMPACT_HORIZON_MONTHS; monthOffset += 1) {
    let eventExpense = firstMonthPlanCost;
    let eventIncome = 0;
    for (const flow of resolution.scheduledCashFlows) {
      if (monthOffset >= flow.durationMonths) continue;
      if (flow.kind === "temporary_income") {
        eventIncome = safeAdd(
          eventIncome,
          flow.amountCents,
          "runtime balance monthly event income",
        );
      } else {
        eventExpense = safeAdd(
          eventExpense,
          flow.amountCents,
          "runtime balance monthly event expense",
        );
      }
    }
    const cashInflow = safeAdd(
      monthlyCashFlowEvidence.monthlyCashInflowCents,
      eventIncome,
      "runtime balance verified monthly cash inflow",
    );
    const requiredCash = safeAdd(
      monthlyCashFlowEvidence.requiredCashCents,
      eventExpense,
      "runtime balance verified monthly required cash",
    );
    if (cashInflow < requiredCash) negativeCashFlowDurationMonths += 1;
  }
  const uncovered = moneyCents(
    Math.max(0, directPlayerCost - otherBenefit),
  );
  const funding = planV2ObligationFunding(
    state,
    firstMonthRequiredCash,
    liquidationCostRatePpm,
  );
  const resourceBase = safeAdd(
    safeAdd(
      funding.cashAvailableCents,
      funding.netLiquidationProceedsCents,
      "runtime balance liquid resources",
    ),
    funding.remainingCreditCents,
    "runtime balance automatic resources",
  );
  const baseScore = boundedPpm(
    uncovered,
    safeAdd(uncovered, resourceBase, "runtime balance impact denominator"),
  );
  const impactScorePpm = Math.min(
    1_000_000,
    baseScore +
      (funding.grossLiquidationCents > 0 ? 75_000 : 0) +
      (funding.creditUsedCents > 0 ? 150_000 : 0) +
      (funding.residualShortfallCents > 0 ? 400_000 : 0),
  );
  const bankruptcyRisk = funding.residualShortfallCents > 0
    ? "immediate"
    : funding.creditUsedCents > 0 || funding.grossLiquidationCents > 0
      ? "possible"
      : "none";
  return Object.freeze({
    responseId,
    grossCostCents: moneyCents(
      safeAdd(
        directPlayerCost,
        resolution.insurerCostCents,
        "runtime balance gross resolved cost",
      ),
    ),
    projectedPlanCostCents: moneyCents(projectedPlanCost),
    lostIncomeCents: moneyCents(0),
    temporaryCostCents: moneyCents(temporaryCost),
    temporaryCostDurationMonths,
    coverageBenefitCents: resolution.insurerCostCents,
    otherBenefitCents: moneyCents(otherBenefit),
    uncoveredCostCents: uncovered,
    firstMonthRequiredCashCents: firstMonthRequiredCash,
    liquidResourceUseCents: funding.cashUsedCents,
    likelyLiquidationCents: funding.grossLiquidationCents,
    likelyCreditUseCents: funding.creditUsedCents,
    immediateBankruptcyRisk: funding.residualShortfallCents > 0,
    bankruptcyRisk,
    negativeCashFlowDurationMonths,
    impactScorePpm,
  });
}

export function estimatePersonalEventImpactV2(
  state: GameStateV2,
  template: PersonalEventTemplateV2,
  parameters: Readonly<Record<string, number>>,
  liquidationCostRatePpm: RatePpm,
  monthlyCashFlowEvidence: RuntimeBalanceMonthlyCashFlowEvidenceV2,
): PersonalEventImpactEstimateV2 {
  if (
    !Number.isSafeInteger(monthlyCashFlowEvidence.monthlyCashInflowCents) ||
    monthlyCashFlowEvidence.monthlyCashInflowCents < 0 ||
    !Number.isSafeInteger(monthlyCashFlowEvidence.requiredCashCents) ||
    monthlyCashFlowEvidence.requiredCashCents < 0
  ) {
    throw new RuntimeBalanceImpactV2Error(
      "INVALID_MONTHLY_CASH_FLOW_EVIDENCE",
      "verified monthly cash-flow evidence must contain non-negative safe-integer cents",
    );
  }
  for (const parameter of template.parameters) {
    const value = parameters[parameter.id];
    if (
      !Number.isSafeInteger(value) ||
      value! < parameter.minimum ||
      value! > parameter.maximum
    ) {
      throw new RuntimeBalanceImpactV2Error(
        "PARAMETER_OUT_OF_BOUNDS",
        `event parameter ${parameter.id} is outside hard bounds`,
      );
    }
  }
  if (
    Object.keys(parameters).some(
      (id) => !template.parameters.some((parameter) => parameter.id === id),
    )
  ) {
    throw new RuntimeBalanceImpactV2Error(
      "PARAMETER_OUT_OF_BOUNDS",
      "event parameters contain an undeclared value",
    );
  }
  const responses = template.responses
    .map(({ id }) => responseImpact(
      state,
      template,
      id,
      parameters,
      liquidationCostRatePpm,
      monthlyCashFlowEvidence,
    ))
    .filter((response): response is PersonalEventResponseImpactV2 => response !== null)
    .toSorted(
      (left, right) =>
        left.impactScorePpm - right.impactScorePpm ||
        left.responseId.localeCompare(right.responseId),
    );
  if (responses.length === 0) {
    throw new RuntimeBalanceImpactV2Error(
      "NO_AVAILABLE_RESPONSE",
      "event has no response available to the player",
    );
  }
  const best = responses[0]!;
  const grossParameterCost = template.parameters
    .filter(({ kind }) => kind === "money_cents")
    .reduce(
      (sum, parameter) =>
        safeAdd(sum, parameters[parameter.id] ?? 0, "runtime balance gross parameters"),
      0,
    );
  const monthlyLivingCost = Math.max(
    1,
    Math.ceil(state.finances.annualLivingCostCents / 12),
  );
  const burnMonthsPpm = safeBigIntToNumber(
    divideRoundHalfAwayFromZero(
      BigInt(best.uncoveredCostCents) * BigInt(1_000_000),
      BigInt(monthlyLivingCost),
    ),
    "runtime balance burn months",
  );
  return Object.freeze({
    templateId: template.id,
    templateVersion: template.version,
    grossParameterCostCents: moneyCents(grossParameterCost),
    directCostCents: best.grossCostCents,
    projectedPlanCostCents: best.projectedPlanCostCents,
    lostIncomeCents: best.lostIncomeCents,
    minimumUncoveredCostCents: best.uncoveredCostCents,
    minimumTemporaryCostCents: best.temporaryCostCents,
    temporaryCostDurationMonths: best.temporaryCostDurationMonths,
    coverageBenefitCents: best.coverageBenefitCents,
    otherBenefitCents: best.otherBenefitCents,
    liquidResourceUseCents: best.liquidResourceUseCents,
    likelyLiquidationCents: best.likelyLiquidationCents,
    likelyCreditUseCents: best.likelyCreditUseCents,
    burnMonthsPpm,
    negativeCashFlowDurationMonths: best.negativeCashFlowDurationMonths,
    recoveryTimeMonths: Math.max(
      template.recovery.durationMonths,
      best.negativeCashFlowDurationMonths,
    ),
    immediateBankruptcyRisk: best.immediateBankruptcyRisk,
    bankruptcyRisk: best.bankruptcyRisk,
    inexpensiveGoalDelayMonths: null,
    impactScorePpm: best.impactScorePpm,
    reasonableResponseIds: Object.freeze(
      responses
        .filter(({ immediateBankruptcyRisk }) => !immediateBankruptcyRisk)
        .map(({ responseId }) => responseId),
    ),
    responses: Object.freeze(responses),
  });
}
