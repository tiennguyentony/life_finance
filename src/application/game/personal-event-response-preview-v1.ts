import type { GameStateV2 } from "../../core/game-state-v2";
import type { PersonalEventTemplateV2 } from "../../core/personal-event-v2";
import {
  isPersonalEventMitigationAvailableV2,
  resolvePersonalEventResponseV2,
} from "../../core/personal-event-effects-v2";
import { PERSONAL_EVENT_TEMPLATES_V2 } from "../../data/personal-event-templates-v2";
import { deepFreeze } from "../../data/personal-event-template-helpers";

export type PersonalEventResponsePreviewV1 = Readonly<{
  version: "personal-event-response-preview-v1";
  status: "available" | "unavailable" | "error";
  immediateCashChangeCents: number;
  recurringCashFlows: readonly Readonly<{
    direction: "expense" | "income";
    monthlyCents: number;
    durationMonths: number;
    totalCents: number;
  }>[];
  financing?: readonly Readonly<{
    principalCents: number;
    monthlyPaymentCents: number;
    termMonths: number;
    annualInterestRatePpm: number;
  }>[];
  annualLivingCostChangeCents: number;
  wellbeingChangesPpm: Readonly<{
    happiness: number;
    burnout: number;
  }>;
  followUps: readonly Readonly<{
    templateId: string;
    templateVersion: number;
    delayMonths: number;
    parameterRanges: Readonly<Record<string, Readonly<{
      minimum: number;
      maximum: number;
    }>>>;
  }>[];
  netOutcomeCents: number | null;
  unavailableReason: string | null;
  summary: string;
}>;

export function projectPersonalEventResponsePreviewV1(
  state: GameStateV2,
  pending: NonNullable<GameStateV2["gameplay"]["eventLifecycle"]["pending"]>,
  template: PersonalEventTemplateV2,
  responseId: string,
  completeCatalog: readonly PersonalEventTemplateV2[] = PERSONAL_EVENT_TEMPLATES_V2,
): PersonalEventResponsePreviewV1 {
  const empty = (
    status: "unavailable" | "error",
    unavailableReason: string,
  ): PersonalEventResponsePreviewV1 => deepFreeze({
    version: "personal-event-response-preview-v1",
    status,
    immediateCashChangeCents: 0,
    recurringCashFlows: [],
    financing: [],
    annualLivingCostChangeCents: 0,
    wellbeingChangesPpm: { happiness: 0, burnout: 0 },
    followUps: [],
    netOutcomeCents: null,
    unavailableReason,
    summary: unavailableReason,
  });

  const response = template.responses.find(({ id }) => id === responseId);
  if (response === undefined) return empty("error", "Response preview is unavailable");
  const unavailableMitigationId = response.requiresMitigationIds.find(
    (mitigationId) =>
      !isPersonalEventMitigationAvailableV2(state, template, mitigationId),
  );
  if (unavailableMitigationId !== undefined) {
    const mitigation = template.mitigations.find(({ id }) => id === unavailableMitigationId);
    return empty(
      "unavailable",
      mitigation?.type === "health_insurance"
        ? "Requires active health coverage"
        : "Requires active coverage",
    );
  }

  try {
    const resolution = resolvePersonalEventResponseV2(
      state,
      template,
      {
        eventId: pending.eventId,
        templateId: pending.templateId,
        templateVersion: pending.templateVersion,
        parameters: pending.parameters,
      },
      responseId,
      `preview.${pending.eventId}.${responseId}`,
    );
    let immediateCashChangeCents = 0;
    const recurringCashFlows: Array<{
      direction: "expense" | "income";
      monthlyCents: number;
      durationMonths: number;
      totalCents: number;
    }> = [];
    const financing = resolution.originatedDebts.map((debt) => ({
      principalCents: debt.principalCents,
      monthlyPaymentCents: debt.minimumPaymentCents,
      termMonths: debt.termMonths,
      annualInterestRatePpm: debt.annualInterestRatePpm,
    }));
    for (const flow of resolution.scheduledCashFlows) {
      const direction = flow.kind === "temporary_income" ? "income" : "expense";
      if (flow.durationMonths === 1) {
        immediateCashChangeCents += direction === "income"
          ? flow.amountCents
          : -flow.amountCents;
      } else {
        recurringCashFlows.push({
          direction,
          monthlyCents: flow.amountCents,
          durationMonths: flow.durationMonths,
          totalCents: flow.amountCents * flow.durationMonths,
        });
      }
    }
    const followUps = template.followUps
      .filter(({ whenResponseIds }) => whenResponseIds.includes(responseId))
      .map(({ templateId, templateVersion, delayMonths }) => {
        const target = completeCatalog.find(
          ({ id, version }) => id === templateId && version === templateVersion,
        );
        if (target === undefined) {
          throw new RangeError(`missing exact follow-up template ${templateId}@${templateVersion}`);
        }
        return {
          templateId,
          templateVersion,
          delayMonths,
          parameterRanges: Object.fromEntries(
            target.parameters.map(({ id, minimum, maximum }) => [
              id,
              { minimum, maximum },
            ]),
          ),
        };
      });
    const source = pending.followUpSourceEventId === undefined
      ? undefined
      : state.gameplay.eventLifecycle.history.find(
          ({ eventId }) => eventId === pending.followUpSourceEventId,
        );
    const netOutcomeCents = template.id === "personal.lamp_market_followup" &&
        source?.templateId === "personal.rare_yard_sale_lamp"
      ? (pending.parameters.resale_proceeds_cents ?? 0) -
        (source.parameters.purchase_price_cents ?? 0) -
        (source.parameters.restoration_cost_cents ?? 0)
      : null;
    const money = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const parts: string[] = [];
    if (immediateCashChangeCents < 0) {
      parts.push(`Schedules ${money.format(-immediateCashChangeCents / 100)} to be paid this month.`);
    } else if (immediateCashChangeCents > 0) {
      parts.push(`Schedules ${money.format(immediateCashChangeCents / 100)} to be received this month.`);
    }
    for (const flow of recurringCashFlows) {
      parts.push(
        `${flow.direction === "expense" ? "Pay" : "Receive"} ${money.format(flow.monthlyCents / 100)} per month for ${flow.durationMonths} months (${money.format(flow.totalCents / 100)} total).`,
      );
    }
    for (const debt of financing) {
      parts.push(
        `Creates ${money.format(debt.principalCents / 100)} of installment debt with ${money.format(debt.monthlyPaymentCents / 100)} due per month for ${debt.termMonths} months.`,
      );
    }
    const annualLivingCostChangeCents =
      resolution.finances.annualLivingCostCents - state.finances.annualLivingCostCents;
    if (annualLivingCostChangeCents !== 0) {
      parts.push(
        `Annual living costs ${annualLivingCostChangeCents < 0 ? "decrease" : "increase"} by ${money.format(Math.abs(annualLivingCostChangeCents) / 100)}.`,
      );
    }
    const happiness = resolution.wellbeing.happinessPpm - state.wellbeing.happinessPpm;
    const burnout = resolution.wellbeing.burnoutPpm - state.wellbeing.burnoutPpm;
    if (happiness !== 0) parts.push(`Happiness ${happiness > 0 ? "improves" : "declines"}.`);
    if (burnout !== 0) parts.push(`Burnout ${burnout > 0 ? "increases" : "decreases"}.`);
    for (const followUp of followUps) {
      parts.push(`Schedules ${followUp.templateId} in ${followUp.delayMonths} months.`);
    }
    if (netOutcomeCents !== null) {
      parts.push(
        netOutcomeCents === 0
          ? "The sale breaks even."
          : `The sale produces a ${netOutcomeCents > 0 ? "gain" : "loss"} of ${money.format(Math.abs(netOutcomeCents) / 100)}.`,
      );
    }
    return deepFreeze({
      version: "personal-event-response-preview-v1",
      status: "available",
      immediateCashChangeCents,
      recurringCashFlows,
      financing,
      annualLivingCostChangeCents,
      wellbeingChangesPpm: { happiness, burnout },
      followUps,
      netOutcomeCents,
      unavailableReason: null,
      summary: parts.join(" "),
    });
  } catch {
    return empty("error", "Response preview is unavailable");
  }
}
