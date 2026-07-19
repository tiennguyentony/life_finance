import { sha256Canonical } from "./canonical";
import type { RuntimeBalancePreparedCandidateV2 } from "./runtime-balance-controller-v2";
import type { ScenarioDirectorInputV2 } from "./scenario-director-v2";
import { SCENARIO_DIRECTOR_POLICY_V1 } from "./scenario-director-policy-v2";

export const OPERATIONAL_EVENT_RANKER_V1_VERSION =
  "operational-event-ranker-v1" as const;
export const OPERATIONAL_EVENT_FEATURES_V1_VERSION =
  "operational-event-features-v1" as const;

const RISK_FEATURES = [
  "emergency_fund_months",
  "monthly_free_cash_flow",
  "debt_service_ratio",
  "fixed_cost_ratio",
  "high_interest_debt_burden",
  "liquid_resource_coverage",
  "insurance_protection_gap",
  "portfolio_concentration",
  "job_investment_sector_correlation",
  "income_stability",
  "lifestyle_rigidity",
  "interest_burden",
  "retirement_readiness",
  "recent_financial_stress",
] as const;
const DIFFICULTIES = ["guided", "normal", "hard"] as const;
const REGIMES = ["expansion", "inflation", "recession", "recovery"] as const;
const CATEGORIES = [
  "maintenance",
  "health",
  "housing",
  "career",
  "caregiving",
  "social",
  "behavioral_trap",
  "opportunity",
] as const;
const TIERS = ["micro", "medium", "large", "catastrophe"] as const;

export const OPERATIONAL_EVENT_FEATURE_NAMES_V1 = Object.freeze([
  ...RISK_FEATURES.map((id) => `risk.${id}`),
  "risk.aggregate",
  ...DIFFICULTIES.map((id) => `difficulty.${id}`),
  ...REGIMES.map((id) => `macro.${id}`),
  ...CATEGORIES.map((id) => `category.${id}`),
  ...TIERS.map((id) => `tier.${id}`),
  "candidate.follow_up",
  "candidate.positive",
  "candidate.negative",
  "candidate.target_severity",
  "candidate.primary_lesson_exposure",
  "candidate.recent_template_count",
  "candidate.recent_category_count",
  "candidate.recent_target_count",
  "candidate.novelty",
  "candidate.target_severity_interaction",
  "candidate.lesson_risk_relevance",
  "impact.score",
  "impact.challenge_fit",
  "impact.burn_months",
  "impact.negative_cash_flow_months",
  "impact.recovery_months",
  "impact.uncovered_cost_share",
  "impact.liquidation_share",
  "impact.credit_use_share",
  "impact.liquidity_stress_interaction",
  "impact.credit_fragility_interaction",
  "impact.reasonable_response_count",
  "impact.choice_separation",
  "impact.bankruptcy_possible",
] as const);

export type OperationalEventFeatureNameV1 =
  (typeof OPERATIONAL_EVENT_FEATURE_NAMES_V1)[number];

export type OperationalEventFeatureVectorV1 = Readonly<{
  version: typeof OPERATIONAL_EVENT_FEATURES_V1_VERSION;
  templateId: string;
  templateVersion: number;
  values: readonly number[];
  checksum: string;
}>;

export type OperationalEventRankerArtifactV1 = Readonly<{
  version: typeof OPERATIONAL_EVENT_RANKER_V1_VERSION;
  featureVersion: typeof OPERATIONAL_EVENT_FEATURES_V1_VERSION;
  rewardPolicyVersion: "operational-event-reward-v1";
  modelKind: "pairwise_linear_int_v1";
  trainedAt: string;
  trainingDatasetChecksum: string;
  featureNames: readonly OperationalEventFeatureNameV1[];
  coefficients: readonly number[];
  intercept: number;
  validation: Readonly<{
    queryCount: number;
    pairCount: number;
    pairwiseAccuracyPpm: number;
    topOneAgreementPpm: number;
  }>;
}>;

export type OperationalEventRankingV1 = Readonly<{
  version: typeof OPERATIONAL_EVENT_RANKER_V1_VERSION;
  status: "ranked" | "fallback";
  artifactChecksum: string;
  featureSetChecksum: string;
  latencyMicros: number;
  fallbackReason?:
    | "invalid_artifact"
    | "no_safe_candidates"
    | "feature_out_of_domain"
    | "score_out_of_bounds";
  ranked: readonly Readonly<{
    templateId: string;
    templateVersion: number;
    score: number;
    featureChecksum: string;
  }>[];
}>;

const PPM = 1_000_000;
const MAX_FEATURE_VALUE = 12_000_000;
const MAX_SCORE = Number.MAX_SAFE_INTEGER;

function clampPpm(value: number): number {
  return Math.max(0, Math.min(PPM, Math.round(value)));
}

function ratioPpm(value: number, denominator: number): number {
  if (value <= 0) return 0;
  if (denominator <= 0) return PPM;
  return clampPpm((value * PPM) / denominator);
}

function oneHot<T extends string>(values: readonly T[], selected: string) {
  return values.map((value) => (value === selected ? PPM : 0));
}

function targetSeverityPpm(
  input: ScenarioDirectorInputV2,
  target: RuntimeBalancePreparedCandidateV2["candidate"]["targetedWeakness"],
): number {
  if (target === "unrelated_hazard") return 0;
  const mapping: Record<Exclude<typeof target, "unrelated_hazard">, readonly (typeof RISK_FEATURES)[number][]> = {
    low_emergency_fund: ["emergency_fund_months", "liquid_resource_coverage"],
    high_credit_utilization: ["high_interest_debt_burden", "interest_burden"],
    job_portfolio_correlation: ["job_investment_sector_correlation"],
    portfolio_concentration: ["portfolio_concentration"],
    uninsured_property: ["insurance_protection_gap"],
    high_fixed_costs: ["debt_service_ratio", "fixed_cost_ratio"],
    lifestyle_fragility: ["monthly_free_cash_flow", "income_stability", "lifestyle_rigidity"],
    market_timing: ["portfolio_concentration"],
  };
  return Math.max(...mapping[target].map((id) => input.riskSnapshot.metrics[id].severityPpm));
}

function choiceSeparationPpm(
  prepared: RuntimeBalancePreparedCandidateV2,
): number {
  const responses = prepared.impact?.responses ?? [];
  if (responses.length < 2) return 0;
  const scores = responses.map(({ impactScorePpm }) => impactScorePpm);
  return clampPpm(Math.max(...scores) - Math.min(...scores));
}

function challengeFitPpm(
  difficulty: ScenarioDirectorInputV2["difficulty"],
  impactScorePpm: number,
): number {
  const ideal = difficulty === "guided" ? 300_000 : difficulty === "normal" ? 450_000 : 600_000;
  return clampPpm(PPM - Math.abs(impactScorePpm - ideal) * 2);
}

function lessonRiskRelevancePpm(
  input: ScenarioDirectorInputV2,
  prepared: RuntimeBalancePreparedCandidateV2,
): number {
  const lessons = new Set([
    prepared.candidate.template.lessonTags.primary,
    ...prepared.candidate.template.lessonTags.secondary,
  ]);
  let relevance = 0;
  for (const [metricId, mapping] of Object.entries(
    SCENARIO_DIRECTOR_POLICY_V1.riskMetricMappings,
  ) as Array<
    [
      keyof typeof SCENARIO_DIRECTOR_POLICY_V1.riskMetricMappings,
      (typeof SCENARIO_DIRECTOR_POLICY_V1.riskMetricMappings)[keyof typeof SCENARIO_DIRECTOR_POLICY_V1.riskMetricMappings],
    ]
  >) {
    if (mapping.lessonTags.some((lesson) => lessons.has(lesson))) {
      relevance = Math.max(
        relevance,
        input.riskSnapshot.metrics[metricId].severityPpm,
      );
    }
  }
  return relevance;
}

function interactionPpm(leftPpm: number, rightPpm: number): number {
  return clampPpm((leftPpm * rightPpm) / PPM);
}

export function extractOperationalEventFeaturesV1(
  input: ScenarioDirectorInputV2,
  prepared: RuntimeBalancePreparedCandidateV2,
): OperationalEventFeatureVectorV1 {
  if (prepared.impact === null || prepared.parameters === null) {
    throw new RangeError("operational ranker requires prepared impact evidence");
  }
  const { candidate, impact } = prepared;
  const recentTemplateCount = input.recentEvents.filter(
    ({ templateId, templateVersion }) =>
      templateId === candidate.template.id && templateVersion === candidate.template.version,
  ).length;
  const recentCategoryCount = input.recentEvents.filter(
    ({ category }) => category === candidate.template.category,
  ).length;
  const recentTargetCount = input.recentEvents.filter(
    ({ targetedWeakness }) => targetedWeakness === candidate.targetedWeakness,
  ).length;
  const primaryLessonExposure = input.lessonExposureCounts.find(
    ({ lessonTag }) => lessonTag === candidate.template.lessonTags.primary,
  )?.count ?? 0;
  const monthlyResourceCents = Math.max(
    1,
    ...impact.responses.map(({ firstMonthRequiredCashCents }) =>
      Math.max(1, firstMonthRequiredCashCents),
    ),
  );
  const uncoveredCostShare = ratioPpm(
    impact.minimumUncoveredCostCents,
    monthlyResourceCents,
  );
  const liquidationShare = ratioPpm(
    impact.likelyLiquidationCents,
    monthlyResourceCents,
  );
  const creditUseShare = ratioPpm(
    impact.likelyCreditUseCents,
    monthlyResourceCents,
  );
  const liquiditySeverity = Math.max(
    input.riskSnapshot.metrics.emergency_fund_months.severityPpm,
    input.riskSnapshot.metrics.liquid_resource_coverage.severityPpm,
  );
  const creditFragility = Math.max(
    input.riskSnapshot.metrics.high_interest_debt_burden.severityPpm,
    input.riskSnapshot.metrics.interest_burden.severityPpm,
  );
  const values = [
    ...RISK_FEATURES.map((id) => input.riskSnapshot.metrics[id].severityPpm),
    input.riskSnapshot.aggregateSeverityPpm,
    ...oneHot(DIFFICULTIES, input.difficulty),
    ...oneHot(REGIMES, input.macro.regime),
    ...oneHot(CATEGORIES, candidate.template.category),
    ...oneHot(TIERS, candidate.template.severityTier),
    candidate.followUpSourceEventId === undefined ? 0 : PPM,
    candidate.template.classification === "positive" ? PPM : 0,
    candidate.template.classification === "negative" ? PPM : 0,
    targetSeverityPpm(input, candidate.targetedWeakness),
    Math.min(MAX_FEATURE_VALUE, primaryLessonExposure * PPM),
    Math.min(MAX_FEATURE_VALUE, recentTemplateCount * PPM),
    Math.min(MAX_FEATURE_VALUE, recentCategoryCount * PPM),
    Math.min(MAX_FEATURE_VALUE, recentTargetCount * PPM),
    recentTemplateCount === 0 && recentCategoryCount === 0 ? PPM : 0,
    clampPpm(
      (targetSeverityPpm(input, candidate.targetedWeakness) *
        (candidate.targetedWeakness === "unrelated_hazard" ? 0 : PPM)) /
        PPM,
    ),
    lessonRiskRelevancePpm(input, prepared),
    impact.impactScorePpm,
    challengeFitPpm(input.difficulty, impact.impactScorePpm),
    impact.burnMonthsPpm,
    Math.min(MAX_FEATURE_VALUE, impact.negativeCashFlowDurationMonths * PPM),
    Math.min(MAX_FEATURE_VALUE, impact.recoveryTimeMonths * PPM),
    uncoveredCostShare,
    liquidationShare,
    creditUseShare,
    interactionPpm(uncoveredCostShare, liquiditySeverity),
    interactionPpm(creditUseShare, creditFragility),
    Math.min(MAX_FEATURE_VALUE, impact.reasonableResponseIds.length * PPM),
    choiceSeparationPpm(prepared),
    impact.bankruptcyRisk === "possible" ? PPM : 0,
  ];
  if (
    values.length !== OPERATIONAL_EVENT_FEATURE_NAMES_V1.length ||
    values.some((value) =>
      !Number.isSafeInteger(value) || value < 0 || value > MAX_FEATURE_VALUE
    )
  ) {
    throw new RangeError("operational event feature is outside its frozen domain");
  }
  const identity = {
    version: OPERATIONAL_EVENT_FEATURES_V1_VERSION,
    templateId: candidate.template.id,
    templateVersion: candidate.template.version,
    values: Object.freeze(values),
  };
  return Object.freeze({ ...identity, checksum: sha256Canonical(identity) });
}

/** Offline weak-supervision policy. It labels training examples only and is
 * never called by production ranking. Values are integer-scaled so identical
 * evidence always produces identical labels across platforms. */
export function scoreOperationalEventTrainingLabelV1(
  feature: OperationalEventFeatureVectorV1,
): number {
  const value = (name: OperationalEventFeatureNameV1) =>
    feature.values[OPERATIONAL_EVENT_FEATURE_NAMES_V1.indexOf(name)]!;
  const utility =
    value("impact.challenge_fit") * 5 +
    value("impact.choice_separation") * 4 +
    value("candidate.target_severity_interaction") * 3 +
    value("candidate.lesson_risk_relevance") * 3 +
    value("candidate.novelty") * 2 +
    Math.min(PPM * 4, value("impact.reasonable_response_count")) -
    value("candidate.recent_template_count") * 4 -
    value("candidate.recent_category_count") * 2 -
    value("candidate.recent_target_count") -
    value("impact.bankruptcy_possible") * 8 -
    value("impact.credit_use_share") * 2 -
    value("impact.liquidity_stress_interaction") * 3 -
    value("impact.credit_fragility_interaction") * 3 -
    value("impact.liquidation_share") -
    value("impact.uncovered_cost_share") -
    value("impact.burn_months") -
    Math.floor(value("impact.negative_cash_flow_months") / 2) -
    Math.floor(value("impact.recovery_months") / 3);
  if (!Number.isSafeInteger(utility)) {
    throw new RangeError("operational event training label exceeded safe integer range");
  }
  return utility;
}

function validArtifact(artifact: OperationalEventRankerArtifactV1): boolean {
  return artifact.version === OPERATIONAL_EVENT_RANKER_V1_VERSION &&
    artifact.featureVersion === OPERATIONAL_EVENT_FEATURES_V1_VERSION &&
    artifact.modelKind === "pairwise_linear_int_v1" &&
    artifact.featureNames.length === OPERATIONAL_EVENT_FEATURE_NAMES_V1.length &&
    artifact.featureNames.every(
      (name, index) => name === OPERATIONAL_EVENT_FEATURE_NAMES_V1[index],
    ) &&
    artifact.coefficients.length === artifact.featureNames.length &&
    artifact.coefficients.every(Number.isSafeInteger) &&
    Number.isSafeInteger(artifact.intercept);
}

export function rankPreparedEventsOperationallyV1(
  input: ScenarioDirectorInputV2,
  preparedCandidates: readonly RuntimeBalancePreparedCandidateV2[],
  artifact: OperationalEventRankerArtifactV1,
): OperationalEventRankingV1 {
  const started = performance.now();
  const artifactChecksum = sha256Canonical(artifact);
  const safe = preparedCandidates.filter(
    ({ impact, rejectionCodes }) => impact !== null && rejectionCodes.length === 0,
  );
  const fallback = (
    fallbackReason: NonNullable<OperationalEventRankingV1["fallbackReason"]>,
  ): OperationalEventRankingV1 => Object.freeze({
    version: OPERATIONAL_EVENT_RANKER_V1_VERSION,
    status: "fallback" as const,
    artifactChecksum,
    featureSetChecksum: sha256Canonical([]),
    latencyMicros: Math.max(0, Math.round((performance.now() - started) * 1_000)),
    fallbackReason,
    ranked: Object.freeze([]),
  });
  if (!validArtifact(artifact)) return fallback("invalid_artifact");
  if (safe.length === 0) return fallback("no_safe_candidates");
  let features: readonly OperationalEventFeatureVectorV1[];
  try {
    features = safe.map((candidate) => extractOperationalEventFeaturesV1(input, candidate));
  } catch {
    return fallback("feature_out_of_domain");
  }
  const ranked = features.map((feature) => {
    let score = artifact.intercept;
    for (let index = 0; index < feature.values.length; index += 1) {
      score += feature.values[index]! * artifact.coefficients[index]!;
      if (!Number.isSafeInteger(score) || Math.abs(score) > MAX_SCORE) {
        return null;
      }
    }
    return {
      templateId: feature.templateId,
      templateVersion: feature.templateVersion,
      score,
      featureChecksum: feature.checksum,
    };
  });
  if (ranked.some((candidate) => candidate === null)) {
    return fallback("score_out_of_bounds");
  }
  const ordered = (ranked as Exclude<(typeof ranked)[number], null>[]).toSorted(
    (left, right) =>
      right.score - left.score ||
      left.templateId.localeCompare(right.templateId) ||
      left.templateVersion - right.templateVersion,
  );
  return Object.freeze({
    version: OPERATIONAL_EVENT_RANKER_V1_VERSION,
    status: "ranked" as const,
    artifactChecksum,
    featureSetChecksum: sha256Canonical(features.map(({ checksum }) => checksum)),
    latencyMicros: Math.max(0, Math.round((performance.now() - started) * 1_000)),
    ranked: Object.freeze(ordered.map((candidate) => Object.freeze({ ...candidate }))),
  });
}
