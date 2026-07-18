import type { GameStateV2 } from "@/core/game-state-v2";
import {
  calculateInvestableAssets,
  calculateNetWorth,
} from "@/core/game-state";
import { projectFinancialGoal } from "@/core/financial-goals-v2";
import { analyzeRiskV1 } from "@/core/risk-v1";

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
  pendingInteraction:
    | Readonly<{ kind: "none" }>
    | Readonly<{
        kind: "event";
        eventId: string;
        templateId: string;
        choiceIds: readonly string[];
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
    pendingInteraction:
      pending === null
        ? Object.freeze({ kind: "none" as const })
        : Object.freeze({
            kind: "event" as const,
            eventId: pending.eventId,
            templateId: pending.templateId,
            choiceIds: pending.choiceIds,
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
