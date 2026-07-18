import type { GameStateV2 } from "@/core/game-state-v2";
import {
  calculateInvestableAssets,
  calculateNetWorth,
} from "@/core/game-state";
import { projectFinancialGoal } from "@/core/financial-goals-v2";
import { analyzeRiskV1 } from "@/core/risk-v1";
import type {
  PersonalEventEffectV2,
  PersonalEventMagnitudeV2,
} from "@/core/personal-event-v2";
import { getEventTemplate } from "@/data/event-templates";
import { getPersonalEventTemplateV2 } from "@/data/personal-event-templates-v2";

export type RunView = Readonly<{
  runId: string;
  revision: number;
  currentMonth: string;
  status: "active" | "completed";
  player: Readonly<{
    playerId: string;
    birthMonth: string;
    locationId: string;
    careerId: string;
    filingStatus: GameStateV2["player"]["filingStatus"];
  }>;
  finances: Readonly<{
    cashCents: number;
    taxableInvestmentsCents: number;
    retirementCents: number;
    homeValueCents: number;
    otherInvestableAssetsCents: number;
    otherAssetsCents: number;
    nonCreditLiabilitiesCents: number;
    creditLimitCents: number;
    creditUsedCents: number;
    annualLivingCostCents: number;
    requiredObligationsCents: number;
    investableAssetsCents: number;
    netWorthCents: number;
  }>;
  income: Readonly<{
    annualGrossSalaryCents: number | null;
  }>;
  wellbeing: Readonly<{
    burnoutPpm: number;
    happinessPpm: number;
  }>;
  goal: Readonly<{
    source: "player_selected" | "current_lifestyle_default";
    desiredAnnualSpendingCents: number;
    safeWithdrawalRatePpm: number;
    targetAgeYears: number;
    targetCents: number;
    progressPpm: number;
  }>;
  risk: Readonly<{
    aggregateSeverityPpm: number;
    weaknessTags: readonly string[];
  }>;
  strategy: Readonly<{
    effectiveMonth: string;
    emergencyFundTargetMonthsPpm?: number;
    insuranceCoverageIds?: readonly string[];
    preTax401kSalaryRatePpm: number;
    preTaxHsaSalaryRatePpm: number;
    afterTaxBroadIndexRatePpm: number;
    afterTaxSectorRatePpm: number;
    afterTaxSpeculativeRatePpm: number;
    afterTaxIraRatePpm: number;
    afterTaxExtraDebtRatePpm: number;
  }>;
  market: Readonly<{
    regime: GameStateV2["marketRegime"];
    modelVersion: GameStateV2["gameplay"]["market"]["modelVersion"];
  }>;
  career: Readonly<{
    pendingProgramIds: readonly string[];
  }>;
  pendingInteraction:
    | Readonly<{ kind: "none" }>
    | Readonly<{
        kind: "event";
        eventId: string;
        templateId: string;
        choiceIds: readonly string[];
        choices: readonly Readonly<{
          id: string;
          label: string;
          description: string;
        }>[];
        parameters: Readonly<Record<string, number>>;
        headline: string | null;
        body: string | null;
      }>;
  outcome: unknown | null;
  capabilities: Readonly<{
    canAdvance: boolean;
    canAct: boolean;
    canRequestTeaching: boolean;
  }>;
}>;

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function titleCaseIdentifier(id: string): string {
  return id.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function resolveMagnitude(
  magnitude: PersonalEventMagnitudeV2,
  parameters: Readonly<Record<string, number>>,
): number | null {
  if (magnitude.source === "fixed") return magnitude.value;
  const value = parameters[magnitude.parameterId];
  return value === undefined
    ? null
    : Math.round((value * magnitude.multiplierPpm) / 1_000_000);
}

function formatMoneyCents(value: number): string {
  return money.format(value / 100);
}

function formatDurationMonths(durationMonths: number): string {
  return `${durationMonths} ${durationMonths === 1 ? "month" : "months"}`;
}

function describePersonalEventEffect(
  effect: PersonalEventEffectV2,
  parameters: Readonly<Record<string, number>>,
): string {
  switch (effect.type) {
    case "required_obligation_delta": {
      const amount = resolveMagnitude(effect.magnitude, parameters);
      return amount === null
        ? ""
        : `Required obligations change by ${formatMoneyCents(amount)}.`;
    }
    case "temporary_expense": {
      const amount = resolveMagnitude(effect.magnitude, parameters);
      return amount === null ? "" : `Creates a temporary expense of ${formatMoneyCents(amount)}.`;
    }
    case "recurring_expense": {
      const amount = resolveMagnitude(effect.magnitude, parameters);
      return amount === null
        ? ""
        : `Adds a recurring expense of ${formatMoneyCents(amount)} for ${formatDurationMonths(effect.durationMonths)}.`;
    }
    case "temporary_income": {
      const amount = resolveMagnitude(effect.magnitude, parameters);
      return amount === null
        ? ""
        : `Adds temporary income of ${formatMoneyCents(amount)} for ${formatDurationMonths(effect.durationMonths)}.`;
    }
    case "cash_delta": {
      const amount = resolveMagnitude(effect.magnitude, parameters);
      if (amount === null) return "";
      const kind = effect.direction === "add" ? "income" : "expense";
      return `Adds ${formatMoneyCents(amount)} of ${kind} in the next processed month.`;
    }
    case "annual_living_cost_delta": {
      const amount = resolveMagnitude(effect.magnitude, parameters);
      return amount === null ? "" : `Annual spending changes by ${formatMoneyCents(amount)}.`;
    }
    case "insurance_claim":
      return "Coverage limits the bill according to the active policy.";
    case "wellbeing_delta": {
      const amount = resolveMagnitude(effect.magnitude, parameters);
      if (amount === null) return "";
      const field = effect.field === "burnoutPpm" ? "Burnout" : "Happiness";
      const direction = amount < 0 ? "decreases" : amount > 0 ? "increases" : "stays the same";
      return `${field} ${direction}.`;
    }
    default:
      return "";
  }
}

function describePersonalEventResponse(
  response: Readonly<{ effects: readonly PersonalEventEffectV2[] }>,
  parameters: Readonly<Record<string, number>>,
): string {
  return response.effects
    .map((effect) => describePersonalEventEffect(effect, parameters))
    .filter((description) => description.length > 0)
    .join(" ");
}

function projectEventChoices(
  pending: NonNullable<GameStateV2["gameplay"]["eventLifecycle"]["pending"]>,
): readonly Readonly<{ id: string; label: string; description: string }>[] {
  try {
    if (pending.eventSchemaVersion === 2) {
      const template = getPersonalEventTemplateV2(
        pending.templateId,
        pending.templateVersion,
      );
      return Object.freeze(pending.choiceIds.map((id) => {
        const response = template.responses.find((candidate) => candidate.id === id);
        return Object.freeze({
          id,
          label: response?.label ?? titleCaseIdentifier(id),
          description:
            response === undefined
              ? ""
              : describePersonalEventResponse(response, pending.parameters),
        });
      }));
    }
    const template = getEventTemplate(pending.templateId, pending.templateVersion);
    return Object.freeze(pending.choiceIds.map((id) => {
      const choice = template.choices.find((candidate) => candidate.id === id);
      return Object.freeze({
        id,
        label: titleCaseIdentifier(id),
        description: choice?.principle ?? "",
      });
    }));
  } catch {
    return Object.freeze(pending.choiceIds.map((id) => Object.freeze({
      id,
      label: titleCaseIdentifier(id),
      description: "",
    })));
  }
}

export function projectRunView(state: GameStateV2): RunView {
  const financialGoal = projectFinancialGoal(
    state.finances,
    state.gameplay.financialGoal,
  );
  const risk = analyzeRiskV1(state);
  const pending = state.gameplay.eventLifecycle.pending;
  const active = state.outcome === null;

  return Object.freeze({
    runId: state.runId,
    revision: state.revision,
    currentMonth: state.currentMonth,
    status: active ? "active" : "completed",
    player: Object.freeze({
      playerId: state.player.playerId,
      birthMonth: state.player.birthMonth,
      locationId: state.player.locationId,
      careerId: state.player.careerTrackId,
      filingStatus: state.player.filingStatus,
    }),
    finances: Object.freeze({
      cashCents: state.finances.cashCents,
      taxableInvestmentsCents: state.finances.taxableInvestmentsCents,
      retirementCents: state.finances.retirementCents,
      homeValueCents: state.finances.homeValueCents,
      otherInvestableAssetsCents: state.finances.otherInvestableAssetsCents,
      otherAssetsCents: state.finances.otherAssetsCents,
      nonCreditLiabilitiesCents: state.finances.nonCreditLiabilitiesCents,
      creditLimitCents: state.finances.creditLimitCents,
      creditUsedCents: state.finances.creditUsedCents,
      annualLivingCostCents: state.finances.annualLivingCostCents,
      requiredObligationsCents: state.finances.requiredObligationsCents,
      investableAssetsCents: calculateInvestableAssets(state.finances),
      netWorthCents: calculateNetWorth(state.finances),
    }),
    income: Object.freeze({
      annualGrossSalaryCents: state.gameplay.employment.annualGrossSalaryCents,
    }),
    wellbeing: Object.freeze({
      burnoutPpm: state.wellbeing.burnoutPpm,
      happinessPpm: state.wellbeing.happinessPpm,
    }),
    goal: Object.freeze({
      source: financialGoal.goal.source,
      desiredAnnualSpendingCents:
        financialGoal.goal.desiredAnnualSpendingCents,
      safeWithdrawalRatePpm: financialGoal.goal.safeWithdrawalRatePpm,
      targetAgeYears: financialGoal.goal.targetAgeYears,
      targetCents: financialGoal.targetCents,
      progressPpm: financialGoal.progressPpm,
    }),
    risk: Object.freeze({
      aggregateSeverityPpm: risk.aggregateSeverityPpm,
      weaknessTags: risk.weaknessTags,
    }),
    strategy: state.gameplay.recurringStrategy,
    market: Object.freeze({
      regime: state.marketRegime,
      modelVersion: state.gameplay.market.modelVersion,
    }),
    career: Object.freeze({
      pendingProgramIds: Object.freeze(
        state.gameplay.careerDevelopment.pending.map(({ programId }) => programId),
      ),
    }),
    pendingInteraction:
      pending === null
        ? Object.freeze({ kind: "none" as const })
        : Object.freeze({
            kind: "event" as const,
            eventId: pending.eventId,
            templateId: pending.templateId,
            choiceIds: pending.choiceIds,
            choices: projectEventChoices(pending),
            parameters: Object.freeze({ ...pending.parameters }),
            headline:
              pending.aiNarrative?.headline ??
              pending.fallbackNarrative?.headline ??
              null,
            body:
              pending.aiNarrative?.narrative ??
              pending.fallbackNarrative?.body ??
              null,
          }),
    outcome: state.outcome,
    capabilities: Object.freeze({
      canAdvance: active && pending === null,
      canAct: active && pending === null,
      canRequestTeaching: true,
    }),
  });
}
