import type { EventTargetV2 } from "./events";
import type { GameStateV2 } from "./game-state-v2";
import type { PersonalEventCategoryV2 } from "./personal-event-v2";
import {
  RISK_METRIC_POLICIES_V1,
  type RiskMetricId,
} from "./risk-policy-v1";
import type { RuntimeBalanceDifficultyV2 } from "./runtime-balance-policy-v2";

export const SCENARIO_DIRECTOR_V2_VERSION = "scenario-director-v2" as const;
export const SCENARIO_DIRECTOR_POLICY_V1_VERSION =
  "scenario-director-policy-v1" as const;

export const SCENARIO_DIRECTOR_REASON_CODES_V2 = Object.freeze([
  "weakness_relevance",
  "lesson_relevance",
  "macro_coherence",
  "recent_decision_relevance",
  "novel_template",
  "novel_category",
  "underrepresented_lesson",
  "difficulty_fit",
  "narrative_continuity",
  "recent_template_repetition",
  "recent_category_repetition",
  "recent_target_repetition",
  "recent_lesson_repetition",
] as const);

export type ScenarioDirectorReasonCodeV2 =
  (typeof SCENARIO_DIRECTOR_REASON_CODES_V2)[number];

export const SCENARIO_DIRECTOR_NARRATIVE_SETUP_IDS_V2 = Object.freeze([
  "setup.routine_warning",
  "setup.deadline_approaching",
  "setup.market_shift",
  "setup.life_transition",
  "setup.recovery_choice",
  "setup.protection_review",
] as const);

export type ScenarioDirectorNarrativeSetupIdV2 =
  (typeof SCENARIO_DIRECTOR_NARRATIVE_SETUP_IDS_V2)[number];

type DirectorTierV2 = "micro" | "medium" | "large" | "catastrophe";

export type ScenarioDirectorRiskMetricMappingV2 = Readonly<{
  targetedWeakness: Exclude<EventTargetV2, "unrelated_hazard"> | null;
  lessonTags: readonly string[];
}>;

export type ScenarioDirectorPolicyV2 = Readonly<{
  version: typeof SCENARIO_DIRECTOR_POLICY_V1_VERSION;
  maximumCandidates: number;
  maximumRecentDecisions: number;
  maximumRecentEvents: number;
  maximumLessonCount: number;
  maximumTagsPerRecord: number;
  maximumAbsoluteScore: number;
  severityStepPpm: number;
  weights: Readonly<{
    weaknessSeverityStep: number;
    lessonMatch: number;
    macroAffinityUnit: number;
    recentDecisionTagMatch: number;
    novelTemplate: number;
    novelCategory: number;
    lessonCoverageStep: number;
    maximumLessonCoverageSteps: number;
    difficultyAffinityUnit: number;
    narrativeTagMatch: number;
    repeatedTemplate: number;
    repeatedCategory: number;
    repeatedTarget: number;
    repeatedLesson: number;
  }>;
  riskMetricMappings: Readonly<
    Record<RiskMetricId, ScenarioDirectorRiskMetricMappingV2>
  >;
  macroCategoryAffinity: Readonly<
    Record<
      GameStateV2["marketRegime"],
      Readonly<Record<PersonalEventCategoryV2, number>>
    >
  >;
  difficultyTierAffinity: Readonly<
    Record<
      RuntimeBalanceDifficultyV2,
      Readonly<Record<DirectorTierV2, number>>
    >
  >;
}>;

export type ScenarioDirectorPolicyViolationV2 = Readonly<{
  path: string;
  code:
    | "unsupported_policy_version"
    | "invalid_limit"
    | "invalid_severity_step"
    | "invalid_weight"
    | "incomplete_risk_mapping"
    | "invalid_risk_mapping"
    | "incomplete_macro_affinity"
    | "invalid_macro_affinity"
    | "incomplete_difficulty_affinity"
    | "invalid_difficulty_affinity"
    | "unsafe_score_bound";
  message: string;
}>;

const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const CATEGORIES = [
  "maintenance",
  "health",
  "housing",
  "career",
  "caregiving",
  "social",
  "behavioral_trap",
  "opportunity",
] as const satisfies readonly PersonalEventCategoryV2[];
const REGIMES = ["expansion", "inflation", "recession", "recovery"] as const;
const DIFFICULTIES = ["guided", "normal", "hard"] as const;
const TIERS = ["micro", "medium", "large", "catastrophe"] as const;
const TARGETS = new Set<Exclude<EventTargetV2, "unrelated_hazard">>([
  "low_emergency_fund",
  "high_credit_utilization",
  "job_portfolio_correlation",
  "portfolio_concentration",
  "uninsured_property",
  "high_fixed_costs",
  "lifestyle_fragility",
  "market_timing",
]);

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

export const SCENARIO_DIRECTOR_POLICY_V1 = deepFreeze({
  version: SCENARIO_DIRECTOR_POLICY_V1_VERSION,
  maximumCandidates: 64,
  maximumRecentDecisions: 24,
  maximumRecentEvents: 24,
  maximumLessonCount: 10_000,
  maximumTagsPerRecord: 16,
  maximumAbsoluteScore: 1_000_000,
  severityStepPpm: 100_000,
  weights: {
    weaknessSeverityStep: 6,
    lessonMatch: 18,
    macroAffinityUnit: 4,
    recentDecisionTagMatch: 7,
    novelTemplate: 10,
    novelCategory: 5,
    lessonCoverageStep: 2,
    maximumLessonCoverageSteps: 6,
    difficultyAffinityUnit: 4,
    narrativeTagMatch: 3,
    repeatedTemplate: 12,
    repeatedCategory: 4,
    repeatedTarget: 3,
    repeatedLesson: 2,
  },
  riskMetricMappings: {
    emergency_fund_months: {
      targetedWeakness: "low_emergency_fund",
      lessonTags: ["lesson.emergency_fund", "lesson.liquidity"],
    },
    monthly_free_cash_flow: {
      targetedWeakness: "lifestyle_fragility",
      lessonTags: ["lesson.cash_flow_margin"],
    },
    debt_service_ratio: {
      targetedWeakness: "high_fixed_costs",
      lessonTags: ["lesson.debt_capacity"],
    },
    fixed_cost_ratio: {
      targetedWeakness: "high_fixed_costs",
      lessonTags: ["lesson.fixed_cost_flexibility"],
    },
    high_interest_debt_burden: {
      targetedWeakness: "high_credit_utilization",
      lessonTags: ["lesson.high_interest_debt"],
    },
    liquid_resource_coverage: {
      targetedWeakness: "low_emergency_fund",
      lessonTags: ["lesson.liquidity"],
    },
    insurance_protection_gap: {
      targetedWeakness: "uninsured_property",
      lessonTags: ["lesson.insurance_protection"],
    },
    portfolio_concentration: {
      targetedWeakness: "portfolio_concentration",
      lessonTags: ["lesson.diversification"],
    },
    job_investment_sector_correlation: {
      targetedWeakness: "job_portfolio_correlation",
      lessonTags: ["lesson.correlated_risk"],
    },
    income_stability: {
      targetedWeakness: "lifestyle_fragility",
      lessonTags: ["lesson.income_resilience"],
    },
    lifestyle_rigidity: {
      targetedWeakness: "lifestyle_fragility",
      lessonTags: ["lesson.lifestyle_flexibility"],
    },
    interest_burden: {
      targetedWeakness: "high_credit_utilization",
      lessonTags: ["lesson.interest_cost"],
    },
    retirement_readiness: {
      targetedWeakness: null,
      lessonTags: ["lesson.retirement_readiness"],
    },
    recent_financial_stress: {
      targetedWeakness: "lifestyle_fragility",
      lessonTags: ["lesson.recovery"],
    },
  },
  macroCategoryAffinity: {
    expansion: {
      maintenance: 1,
      health: 1,
      housing: 2,
      career: 2,
      caregiving: 1,
      social: 2,
      behavioral_trap: 2,
      opportunity: 4,
    },
    inflation: {
      maintenance: 3,
      health: 2,
      housing: 4,
      career: 2,
      caregiving: 2,
      social: 1,
      behavioral_trap: 3,
      opportunity: 1,
    },
    recession: {
      maintenance: 2,
      health: 1,
      housing: 3,
      career: 4,
      caregiving: 2,
      social: 1,
      behavioral_trap: 3,
      opportunity: 0,
    },
    recovery: {
      maintenance: 1,
      health: 1,
      housing: 2,
      career: 3,
      caregiving: 1,
      social: 3,
      behavioral_trap: 1,
      opportunity: 4,
    },
  },
  difficultyTierAffinity: {
    guided: { micro: 4, medium: 3, large: 1, catastrophe: 0 },
    normal: { micro: 2, medium: 4, large: 3, catastrophe: 1 },
    hard: { micro: 1, medium: 2, large: 4, catastrophe: 3 },
  },
} satisfies ScenarioDirectorPolicyV2) as ScenarioDirectorPolicyV2;

function violation(
  path: string,
  code: ScenarioDirectorPolicyViolationV2["code"],
  message: string,
): ScenarioDirectorPolicyViolationV2 {
  return { path, code, message };
}

function isBoundedInteger(value: unknown, minimum: number, maximum: number) {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function validateExactKeys(
  value: unknown,
  expected: readonly string[],
): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === [...expected].sort()[index])
  );
}

export function validateScenarioDirectorPolicyV2(
  policy: ScenarioDirectorPolicyV2,
): readonly ScenarioDirectorPolicyViolationV2[] {
  const violations: ScenarioDirectorPolicyViolationV2[] = [];
  if (policy.version !== SCENARIO_DIRECTOR_POLICY_V1_VERSION) {
    violations.push(
      violation("version", "unsupported_policy_version", "unsupported policy version"),
    );
  }

  for (const [key, value] of Object.entries({
    maximumCandidates: policy.maximumCandidates,
    maximumRecentDecisions: policy.maximumRecentDecisions,
    maximumRecentEvents: policy.maximumRecentEvents,
    maximumLessonCount: policy.maximumLessonCount,
    maximumTagsPerRecord: policy.maximumTagsPerRecord,
  })) {
    if (!isBoundedInteger(value, 1, key === "maximumLessonCount" ? 1_000_000 : 10_000)) {
      violations.push(violation(key, "invalid_limit", `${key} must be a bounded positive integer`));
    }
  }
  if (!isBoundedInteger(policy.maximumAbsoluteScore, 1, Number.MAX_SAFE_INTEGER)) {
    violations.push(violation("maximumAbsoluteScore", "unsafe_score_bound", "score bound must be a positive safe integer"));
  }
  if (!isBoundedInteger(policy.severityStepPpm, 1, 1_000_000)) {
    violations.push(violation("severityStepPpm", "invalid_severity_step", "severity step must be between one and one million PPM"));
  }

  for (const [key, value] of Object.entries(policy.weights)) {
    if (!isBoundedInteger(value, 0, 10_000)) {
      violations.push(violation(`weights.${key}`, "invalid_weight", "weights must be bounded non-negative integers"));
    }
  }

  const riskMetricIds = Object.keys(RISK_METRIC_POLICIES_V1).sort();
  if (
    !validateExactKeys(policy.riskMetricMappings, riskMetricIds) ||
    riskMetricIds.some(
      (metricId) =>
        policy.riskMetricMappings[metricId as RiskMetricId] === undefined,
    )
  ) {
    violations.push(violation("riskMetricMappings", "incomplete_risk_mapping", "risk mapping must cover every Risk v1 metric exactly once"));
  } else {
    for (const metricId of riskMetricIds as RiskMetricId[]) {
      const mapping = policy.riskMetricMappings[metricId];
      if (
        !mapping ||
        (mapping.targetedWeakness !== null && !TARGETS.has(mapping.targetedWeakness)) ||
        !Array.isArray(mapping.lessonTags) ||
        mapping.lessonTags.length === 0 ||
        mapping.lessonTags.length > policy.maximumTagsPerRecord ||
        new Set(mapping.lessonTags).size !== mapping.lessonTags.length ||
        mapping.lessonTags.some((tag) => !IDENTIFIER.test(tag))
      ) {
        violations.push(violation(`riskMetricMappings.${metricId}`, "invalid_risk_mapping", "risk mappings require a known target or null and unique lesson identifiers"));
      }
    }
  }

  if (!validateExactKeys(policy.macroCategoryAffinity, REGIMES)) {
    violations.push(violation("macroCategoryAffinity", "incomplete_macro_affinity", "macro affinity must cover every regime"));
  } else {
    for (const regime of REGIMES) {
      const row = policy.macroCategoryAffinity[regime];
      if (!validateExactKeys(row, CATEGORIES)) {
        violations.push(violation(`macroCategoryAffinity.${regime}`, "incomplete_macro_affinity", "macro affinity must cover every category"));
      } else if (CATEGORIES.some((category) => !isBoundedInteger(row[category], 0, 20))) {
        violations.push(violation(`macroCategoryAffinity.${regime}`, "invalid_macro_affinity", "macro affinity values must be bounded non-negative integers"));
      }
    }
  }

  if (!validateExactKeys(policy.difficultyTierAffinity, DIFFICULTIES)) {
    violations.push(violation("difficultyTierAffinity", "incomplete_difficulty_affinity", "difficulty affinity must cover every difficulty"));
  } else {
    for (const difficulty of DIFFICULTIES) {
      const row = policy.difficultyTierAffinity[difficulty];
      if (!validateExactKeys(row, TIERS)) {
        violations.push(violation(`difficultyTierAffinity.${difficulty}`, "incomplete_difficulty_affinity", "difficulty affinity must cover every tier"));
      } else if (TIERS.some((tier) => !isBoundedInteger(row[tier], 0, 20))) {
        violations.push(violation(`difficultyTierAffinity.${difficulty}`, "invalid_difficulty_affinity", "difficulty affinity values must be bounded non-negative integers"));
      }
    }
  }

  return Object.freeze(violations);
}

const startupViolations = validateScenarioDirectorPolicyV2(
  SCENARIO_DIRECTOR_POLICY_V1,
);
if (startupViolations.length > 0) {
  throw new Error(
    `Invalid Scenario Director v2 policy: ${startupViolations
      .map(({ path, code }) => `${path}:${code}`)
      .join(", ")}`,
  );
}
