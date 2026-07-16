import { getEducationConcept } from "../data/education-content";
import { sha256Canonical } from "./canonical";
import type { GameStateV2 } from "./game-state-v2";
import { computeExposureSnapshotV2 } from "./exposure-v2";
import { projectFinancialGoal } from "./financial-goals-v2";
import type { RiskMetricV1, RiskSnapshotV1 } from "./risk-v1";
import {
  createTeachingFactPacketV2,
  type TeachingFactV2,
  type TeachingFactPacketV2,
  type TeachingFactValueV2,
} from "./teaching-facts-v2";
import { buildTeachingMomentV2, type TeachingMomentV2 } from "./teaching-presentation-v2";

export type TeachingMomentTriggerV2 =
  | Readonly<{ kind: "automatic" }>
  | Readonly<{ kind: "requested_help"; conceptId: string }>;

export type TeachingMomentSelectionV2 = Readonly<{
  moment: TeachingMomentV2 | null;
  facts: TeachingFactPacketV2 | null;
}>;

type RiskRuleV2 = Readonly<{
  owner: "risk";
  conceptId: string;
  metricId: keyof RiskSnapshotV1["metrics"];
  weaknessTag?: string;
}>;

type StateRuleV2 = Readonly<{
  owner: "state";
  conceptId:
    | "dti"
    | "deductible"
    | "employer_match"
    | "compounding"
    | "financial_independence";
}>;

type RelevanceRuleV2 = RiskRuleV2 | StateRuleV2;

const AUTOMATIC_RULES_V2: readonly RelevanceRuleV2[] = Object.freeze([
  { owner: "risk", conceptId: "emergency_fund", metricId: "emergency_fund_months", weaknessTag: "risk.low_emergency_fund" },
  { owner: "state", conceptId: "dti" },
  { owner: "state", conceptId: "deductible" },
  { owner: "state", conceptId: "employer_match" },
  { owner: "risk", conceptId: "diversification", metricId: "portfolio_concentration", weaknessTag: "risk.portfolio_concentration" },
  { owner: "state", conceptId: "compounding" },
  { owner: "risk", conceptId: "job_investment_correlation", metricId: "job_investment_sector_correlation", weaknessTag: "risk.job_investment_correlation" },
  { owner: "risk", conceptId: "restricted_retirement_assets", metricId: "liquid_resource_coverage", weaknessTag: "risk.low_liquid_resources" },
  { owner: "state", conceptId: "financial_independence" },
]);

const REQUESTED_RISK_METRICS: Readonly<Record<string, RiskRuleV2["metricId"]>> = Object.freeze({
  diversification: "portfolio_concentration",
  emergency_fund: "emergency_fund_months",
  job_investment_correlation: "job_investment_sector_correlation",
  restricted_retirement_assets: "liquid_resource_coverage",
});

function riskFactValue(metric: RiskMetricV1): TeachingFactValueV2 {
  if (metric.rawValue === null) return { kind: "enum", value: "unknown" };
  if (metric.unit === "months_ppm") return { kind: "months_ppm", value: metric.rawValue };
  if (metric.unit === "ratio_ppm") return { kind: "rate_ppm", value: metric.rawValue };
  return { kind: "money_cents", value: metric.rawValue };
}

function riskFactPacket(
  state: GameStateV2,
  risk: RiskSnapshotV1,
  metricId: RiskRuleV2["metricId"],
): TeachingFactPacketV2 {
  const metric = risk.metrics[metricId];
  const sourceId = `risk:${risk.asOfMonth}:${risk.version}.${metricId}`;
  const stateSourceId = `state:${state.revision}:${sha256Canonical(state)}`;
  const facts: TeachingFactV2[] = [{
    factId: `risk.${metricId}`,
    labelId: metricId,
    value: riskFactValue(metric),
    source: {
      kind: "risk_snapshot" as const,
      sourceId,
      supportingSourceIds: [sourceId],
      field: `metrics.${metricId}.rawValue`,
      revision: state.revision,
      month: risk.asOfMonth,
    },
  }];
  if (metricId === "liquid_resource_coverage") {
    facts.push({
      factId: "state.restricted_retirement_assets_cents",
      labelId: "restricted_retirement_assets",
      value: { kind: "money_cents" as const, value: state.finances.retirementCents },
      source: {
        kind: "game_state" as const,
        sourceId: stateSourceId,
        supportingSourceIds: [stateSourceId],
        field: "finances.retirementCents",
        revision: state.revision,
        month: state.currentMonth,
      },
    });
  }
  return createTeachingFactPacketV2({
    asOfRevision: state.revision,
    asOfMonth: state.currentMonth,
    facts,
  });
}

function stateFactPacket(
  state: GameStateV2,
  conceptId: StateRuleV2["conceptId"],
): TeachingFactPacketV2 {
  const sourceId = `state:${state.revision}:${sha256Canonical(state)}`;
  if (conceptId === "employer_match") {
    const cumulative = state.gameplay.contributions.employer401kCents;
    const tiers = state.gameplay.catalogSnapshot?.selected.retirementPlan.employerMatchTiers ?? [];
    if (cumulative === 0 && tiers.length > 0) {
      return createTeachingFactPacketV2({
        asOfRevision: state.revision,
        asOfMonth: state.currentMonth,
        facts: tiers.slice(0, 4).flatMap((tier, index) => [
          {
            factId: `state.employer_match_tier.${index}.employee_rate_up_to_ppm`,
            labelId: "employee_contribution_rate_up_to",
            value: { kind: "rate_ppm" as const, value: tier.employeeContributionRateUpToPpm },
            source: {
              kind: "game_state" as const,
              sourceId,
              supportingSourceIds: [sourceId],
              field: `gameplay.catalogSnapshot.selected.retirementPlan.employerMatchTiers.${index}.employeeContributionRateUpToPpm`,
              revision: state.revision,
              month: state.currentMonth,
            },
          },
          {
            factId: `state.employer_match_tier.${index}.employer_rate_ppm`,
            labelId: "employer_match_rate",
            value: { kind: "rate_ppm" as const, value: tier.employerMatchRatePpm },
            source: {
              kind: "game_state" as const,
              sourceId,
              supportingSourceIds: [sourceId],
              field: `gameplay.catalogSnapshot.selected.retirementPlan.employerMatchTiers.${index}.employerMatchRatePpm`,
              revision: state.revision,
              month: state.currentMonth,
            },
          },
        ]),
      });
    }
  }
  let factId: string;
  let labelId: string;
  let field: string;
  let value: TeachingFactValueV2;
  if (conceptId === "dti") {
    const exposure = computeExposureSnapshotV2(state);
    const dti = exposure.debtToIncomePpm;
    factId = "state.debt_to_income_ppm";
    labelId = "debt_to_income";
    field = "debtToIncomePpm";
    value = dti === null
      ? { kind: "enum", value: "unknown" }
      : { kind: "rate_ppm", value: dti };
  } else if (conceptId === "deductible") {
    const snapshot = state.gameplay.catalogSnapshot;
    const plan = snapshot?.selected.healthPlan ?? null;
    const family = (snapshot?.selected.household.dependentCount ?? 0) > 0;
    factId = "state.selected_health_deductible_cents";
    labelId = "deductible";
    field = family
      ? "gameplay.catalogSnapshot.selected.healthPlan.annualDeductibleFamilyCents"
      : "gameplay.catalogSnapshot.selected.healthPlan.annualDeductibleSelfCents";
    value = plan === null
      ? { kind: "enum", value: "unknown" }
      : {
          kind: "money_cents",
          value: family
            ? plan.annualDeductibleFamilyCents
            : plan.annualDeductibleSelfCents,
        };
  } else if (conceptId === "employer_match") {
    factId = "state.employer_401k_match_cents";
    labelId = "employer_match";
    const cumulative = state.gameplay.contributions.employer401kCents;
    const plan = state.gameplay.catalogSnapshot?.selected.retirementPlan;
    field = cumulative > 0
      ? "gameplay.contributions.employer401kCents"
      : "gameplay.catalogSnapshot.selected.retirementPlan.id";
    value = cumulative > 0
      ? { kind: "money_cents", value: cumulative }
      : { kind: "enum", value: plan?.id ?? "unknown" };
  } else if (conceptId === "financial_independence") {
    const goal = projectFinancialGoal(state.finances, state.gameplay.financialGoal);
    factId = "goal.current.progress_ppm";
    labelId = "financial_independence_progress";
    field = "progressPpm";
    value = { kind: "rate_ppm", value: goal.progressPpm };
  } else {
    const employee = state.gameplay.contributions.employee401kCents;
    const usesEmployee = employee > 0;
    const usesTaxable = !usesEmployee && state.finances.taxableInvestmentsCents > 0;
    factId = usesEmployee
      ? "state.employee_401k_contributions_cents"
      : usesTaxable
        ? "state.taxable_investments_cents"
        : "state.retirement_assets_cents";
    labelId = "compounding_asset_base";
    field = usesEmployee
      ? "gameplay.contributions.employee401kCents"
      : usesTaxable
        ? "finances.taxableInvestmentsCents"
        : "finances.retirementCents";
    value = {
      kind: "money_cents",
      value: usesEmployee
        ? employee
        : usesTaxable
          ? state.finances.taxableInvestmentsCents
          : state.finances.retirementCents,
    };
  }
  return createTeachingFactPacketV2({
    asOfRevision: state.revision,
    asOfMonth: state.currentMonth,
    facts: [{
      factId,
      labelId,
      value,
      source: {
        kind: conceptId === "dti"
          ? "exposure_snapshot"
          : conceptId === "financial_independence"
            ? "goal_result"
            : "game_state",
        sourceId: conceptId === "dti"
          ? `exposure:${state.currentMonth}:${sha256Canonical(computeExposureSnapshotV2(state))}`
          : conceptId === "financial_independence"
            ? `goal:${state.revision}:${sha256Canonical(projectFinancialGoal(state.finances, state.gameplay.financialGoal))}`
            : sourceId,
        supportingSourceIds: conceptId === "dti"
          ? [`exposure:${state.currentMonth}:${sha256Canonical(computeExposureSnapshotV2(state))}`]
          : conceptId === "financial_independence"
            ? [`goal:${state.revision}:${sha256Canonical(projectFinancialGoal(state.finances, state.gameplay.financialGoal))}`]
            : [sourceId],
        field,
        revision: state.revision,
        month: state.currentMonth,
      },
    }],
  });
}

function automaticApplicable(
  rule: RelevanceRuleV2,
  state: GameStateV2,
  risk: RiskSnapshotV1,
): boolean {
  if (rule.owner === "risk") {
    if (
      rule.conceptId === "restricted_retirement_assets" &&
      state.finances.retirementCents <= 0
    ) return false;
    return rule.weaknessTag === undefined || risk.weaknessTags.includes(rule.weaknessTag);
  }
  if (rule.conceptId === "dti") {
    return computeExposureSnapshotV2(state).debtToIncomePpm !== null;
  }
  if (rule.conceptId === "deductible") {
    return state.gameplay.catalogSnapshot?.selected.healthPlan !== null &&
      state.gameplay.catalogSnapshot?.selected.healthPlan !== undefined;
  }
  if (rule.conceptId === "employer_match") {
    return state.gameplay.contributions.employer401kCents > 0 ||
      (state.gameplay.catalogSnapshot?.selected.retirementPlan.employerMatchTiers.length ?? 0) > 0;
  }
  if (rule.conceptId === "financial_independence") return true;
  return state.gameplay.contributions.employee401kCents > 0 ||
    state.finances.taxableInvestmentsCents > 0 ||
    state.finances.retirementCents > 0;
}

function requestedRule(conceptId: string): RelevanceRuleV2 | null {
  if (
    conceptId === "dti" ||
    conceptId === "deductible" ||
    conceptId === "employer_match" ||
    conceptId === "compounding" ||
    conceptId === "financial_independence"
  ) {
    return { owner: "state", conceptId };
  }
  const metricId = REQUESTED_RISK_METRICS[conceptId];
  return metricId ? { owner: "risk", conceptId, metricId } : null;
}

export function selectTeachingMomentV2(
  state: GameStateV2,
  risk: RiskSnapshotV1,
  trigger: TeachingMomentTriggerV2,
): TeachingMomentSelectionV2 {
  const presented = state.gameplay.aiLearningMemory?.concepts.map(({ conceptId }) => conceptId) ?? [];
  const rule = trigger.kind === "requested_help"
    ? requestedRule(trigger.conceptId)
    : AUTOMATIC_RULES_V2.find(
        (candidate) =>
          !presented.includes(candidate.conceptId) &&
          automaticApplicable(candidate, state, risk),
      ) ?? null;
  if (!rule) return Object.freeze({ moment: null, facts: null });
  const concept = getEducationConcept(rule.conceptId);
  if (!concept) return Object.freeze({ moment: null, facts: null });
  const facts = rule.owner === "risk"
    ? riskFactPacket(state, risk, rule.metricId)
    : stateFactPacket(state, rule.conceptId);
  return Object.freeze({
    facts,
    moment: buildTeachingMomentV2({
      concept,
      trigger: trigger.kind === "automatic" ? "automatic" : "requested_help",
      previouslyPresentedConceptIds: presented,
      facts,
      triggerFactIds: facts.facts.map(({ factId }) => factId),
    }),
  });
}
