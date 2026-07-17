import { projectFinancialGoal } from "../../core/financial-goals-v2";
import { calculateNetWorth } from "../../core/game-state";
import type { GameStateV2 } from "../../core/game-state-v2";
import { lifeMilestoneState } from "../../core/life-milestones-v2";
import { calculateAgeYears } from "../../core/outcomes";
import { analyzeRiskV1, type RiskSnapshotV1 } from "../../core/risk-v1";
import type { AiEvidenceFact } from "./game-context-types";

export const AI_GAME_CONTEXT_VERSION = "ai-game-context-v2" as const;

export type AiGameContextV2 = Readonly<{
  version: typeof AI_GAME_CONTEXT_VERSION;
  revision: number;
  month: string;
  player: Readonly<{ ageYears: number; locationId: string; careerId: string; householdId: string }>;
  goal: Readonly<{ desiredAnnualSpendingCents: number; safeWithdrawalRatePpm: number; targetAgeYears: number; targetCents: number; progressPpm: number }>;
  finances: Readonly<{ cashCents: number; investableAssetsCents: number; netWorthCents: number; annualGrossIncomeCents: number; annualLivingCostCents: number; requiredMonthlyObligationsCents: number; nonCreditLiabilitiesCents: number; creditUsedCents: number }>;
  strategy: GameStateV2["gameplay"]["recurringStrategy"];
  risk: RiskSnapshotV1;
  upcomingMilestones: readonly Readonly<{ milestoneId: string; kind: string; targetMonth: string; estimatedCostCents: number }>[];
  recentEventDecisions: readonly Readonly<{ eventId: string; choiceId: string; resolvedMonth: string; playerCostCents: number }>[];
  learning: Readonly<{ audienceLevel: "beginner" | "intermediate"; concepts: readonly Readonly<{ conceptId: string; exposureCount: number; confidence: string }>[] }>;
}>;

export function buildAiGameContext(state: GameStateV2): AiGameContextV2 {
  const goal = projectFinancialGoal(state.finances, state.gameplay.financialGoal);
  const terminalOutcome =
    state.outcome && "outcomePolicyVersion" in state.outcome
      ? state.outcome
      : null;
  const terminalFinancialIndependence =
    terminalOutcome?.financialIndependence ?? null;
  const learning = state.gameplay.aiLearningMemory;
  return Object.freeze({
    version: AI_GAME_CONTEXT_VERSION,
    revision: state.revision,
    month: state.currentMonth,
    player: Object.freeze({
      ageYears: calculateAgeYears({ ...state, schemaVersion: 1, engineVersion: "4.0.0" }),
      locationId: state.player.locationId,
      careerId: state.player.careerTrackId,
      householdId: state.gameplay.catalogs.household.id,
    }),
    goal: Object.freeze({
      desiredAnnualSpendingCents: goal.goal.desiredAnnualSpendingCents,
      safeWithdrawalRatePpm: goal.goal.safeWithdrawalRatePpm,
      targetAgeYears: goal.goal.targetAgeYears,
      targetCents: terminalFinancialIndependence?.targetCents ?? goal.targetCents,
      progressPpm:
        terminalFinancialIndependence?.progressPpm ?? goal.progressPpm,
    }),
    finances: Object.freeze({
      cashCents: state.finances.cashCents,
      investableAssetsCents:
        terminalFinancialIndependence?.investableAssetsCents ??
        goal.investableAssetsCents,
      netWorthCents:
        terminalOutcome?.displayedNetWorthCents ??
        calculateNetWorth(state.finances),
      annualGrossIncomeCents: state.gameplay.employment.annualGrossSalaryCents ?? 0,
      annualLivingCostCents: state.finances.annualLivingCostCents,
      requiredMonthlyObligationsCents: state.finances.requiredObligationsCents,
      nonCreditLiabilitiesCents: state.finances.nonCreditLiabilitiesCents,
      creditUsedCents: state.finances.creditUsedCents,
    }),
    strategy: state.gameplay.recurringStrategy,
    risk: analyzeRiskV1(state),
    upcomingMilestones: Object.freeze(lifeMilestoneState(state).scheduled.slice(0, 5).map((milestone) => Object.freeze({
      milestoneId: milestone.milestoneId,
      kind: milestone.kind,
      targetMonth: milestone.targetMonth,
      estimatedCostCents: milestone.estimatedCostCents,
    }))),
    recentEventDecisions: Object.freeze(state.gameplay.eventLifecycle.history.slice(-5).map((event) => Object.freeze({
      eventId: event.eventId,
      choiceId: event.choiceId,
      resolvedMonth: event.resolvedMonth,
      playerCostCents: event.playerCostCents,
    }))),
    learning: Object.freeze({
      audienceLevel: learning?.audienceLevel ?? "beginner",
      concepts: Object.freeze((learning?.concepts ?? []).slice(-16).map((concept) => Object.freeze({
        conceptId: concept.conceptId,
        exposureCount: concept.exposureCount,
        confidence: concept.confidence,
      }))),
    }),
  });
}

export function contextEvidence(context: AiGameContextV2): readonly AiEvidenceFact[] {
  const facts: AiEvidenceFact[] = [
    { id: "context.cash", label: "Cash", value: `${context.finances.cashCents} cents` },
    { id: "context.investable", label: "Investable assets", value: `${context.finances.investableAssetsCents} cents` },
    { id: "context.fi_target", label: "FI target", value: `${context.goal.targetCents} cents` },
    { id: "context.fi_progress", label: "FI progress", value: `${context.goal.progressPpm} ppm` },
    { id: "context.net_worth", label: "Displayed net worth", value: `${context.finances.netWorthCents} cents` },
    { id: "context.living_cost", label: "Annual living cost", value: `${context.finances.annualLivingCostCents} cents` },
    { id: "context.required_cash", label: "Monthly required cash", value: `${context.finances.requiredMonthlyObligationsCents} cents` },
    { id: "context.liabilities", label: "Term liabilities", value: `${context.finances.nonCreditLiabilitiesCents} cents` },
  ];
  const emergencyFund = context.risk.metrics.emergency_fund_months;
  facts.push(
    {
      id: "context.risk.emergency_fund_months",
      label: "Risk v1 emergency fund months",
      value: `${emergencyFund.rawValue ?? "unknown"} ${emergencyFund.unit}`,
    },
    {
      id: "context.risk.aggregate_severity",
      label: "Risk v1 aggregate severity",
      value: `${context.risk.aggregateSeverityPpm} ratio_ppm`,
    },
  );
  return Object.freeze(facts.map((fact) => Object.freeze(fact)));
}
