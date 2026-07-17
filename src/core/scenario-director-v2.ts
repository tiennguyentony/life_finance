import { sha256Canonical } from "./canonical";
import {
  compareMonths,
  simulationMonth,
  type SimulationMonth,
} from "./domain/month";
import type { EventTargetV2, EventTier } from "./events";
import type { GameStateV2 } from "./game-state-v2";
import type { PersonalEventCategoryV2 } from "./personal-event-v2";
import { RISK_ANALYZER_V1_VERSION, type RiskSnapshotV1 } from "./risk-v1";
import type { RuntimeBalanceDifficultyV2 } from "./runtime-balance-policy-v2";
import {
  SCENARIO_DIRECTOR_POLICY_V1,
  SCENARIO_DIRECTOR_POLICY_V1_VERSION,
  SCENARIO_DIRECTOR_NARRATIVE_SETUP_IDS_V2,
  SCENARIO_DIRECTOR_REASON_CODES_V2,
  SCENARIO_DIRECTOR_V2_VERSION,
  validateScenarioDirectorPolicyV2,
  type ScenarioDirectorPolicyV2,
  type ScenarioDirectorNarrativeSetupIdV2,
  type ScenarioDirectorReasonCodeV2,
} from "./scenario-director-policy-v2";

export type ScenarioDirectorCandidateV2 = Readonly<{
  templateId: string;
  templateVersion: number;
  category: PersonalEventCategoryV2;
  tier: Exclude<EventTier, "ambient">;
  targetedWeakness: EventTargetV2;
  lessonTags: Readonly<{ primary: string; secondary: readonly string[] }>;
  directorTags: readonly string[];
  narrativeSetupId?: ScenarioDirectorNarrativeSetupIdV2;
}>;

export type ScenarioDirectorRecentDecisionV2 = Readonly<{
  decisionId: string;
  month: SimulationMonth;
  reasonCode: string;
  semanticTags: readonly string[];
}>;

export type ScenarioDirectorRecentEventV2 = Readonly<{
  templateId: string;
  templateVersion: number;
  category: PersonalEventCategoryV2;
  tier: Exclude<EventTier, "ambient">;
  targetedWeakness: EventTargetV2;
  lessonTags: readonly string[];
  month: SimulationMonth;
}>;

export type ScenarioDirectorInputV2 = Readonly<{
  version: typeof SCENARIO_DIRECTOR_V2_VERSION;
  month: SimulationMonth;
  riskSnapshot: RiskSnapshotV1;
  macro: Readonly<{
    regime: GameStateV2["marketRegime"];
    tags: readonly string[];
  }>;
  candidates: readonly ScenarioDirectorCandidateV2[];
  recentDecisions: readonly ScenarioDirectorRecentDecisionV2[];
  recentEvents: readonly ScenarioDirectorRecentEventV2[];
  lessonExposureCounts: readonly Readonly<{
    lessonTag: string;
    count: number;
  }>[];
  difficulty: RuntimeBalanceDifficultyV2;
  storyArc?: Readonly<{ arcId: string; tags: readonly string[] }>;
}>;

export type ScenarioDirectorScoreComponentsV2 = Readonly<{
  weaknessRelevance: number;
  lessonRelevance: number;
  macroCoherence: number;
  recentDecisionRelevance: number;
  novelty: number;
  lessonCoverage: number;
  difficultyFit: number;
  narrativeContinuity: number;
  repetitionPenalty: number;
}>;

export type ScenarioDirectorRankedCandidateV2 = Readonly<{
  rank: number;
  templateId: string;
  templateVersion: number;
  intendedLesson: string;
  scoreComponents: ScenarioDirectorScoreComponentsV2;
  totalScore: number;
  reasonCodes: readonly ScenarioDirectorReasonCodeV2[];
  narrativeSetupId?: ScenarioDirectorNarrativeSetupIdV2;
}>;

export type ScenarioDirectorDecisionV2 = Readonly<{
  version: typeof SCENARIO_DIRECTOR_V2_VERSION;
  policyVersion: typeof SCENARIO_DIRECTOR_POLICY_V1_VERSION;
  riskVersion: typeof RISK_ANALYZER_V1_VERSION;
  riskAsOfMonth: SimulationMonth;
  difficulty: RuntimeBalanceDifficultyV2;
  macroRegime: GameStateV2["marketRegime"];
  storyArcId?: string;
  rankingSource: "deterministic_fallback";
  candidateSetChecksum: string;
  rankingInputChecksum: string;
  ranked: readonly ScenarioDirectorRankedCandidateV2[];
}>;

export type ScenarioDirectorInputErrorCodeV2 =
  | "unsupported_director_version"
  | "invalid_policy"
  | "risk_snapshot_month_mismatch"
  | "invalid_risk_snapshot"
  | "candidate_limit_exceeded"
  | "invalid_candidate_identity"
  | "duplicate_candidate"
  | "invalid_candidate_metadata"
  | "invalid_structured_context"
  | "unsafe_narrative_setup"
  | "score_out_of_bounds";

export class ScenarioDirectorInputErrorV2 extends Error {
  constructor(
    readonly code: ScenarioDirectorInputErrorCodeV2,
    readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = "ScenarioDirectorInputErrorV2";
  }
}

export type ScenarioDirectorPermutationViolationV2 = Readonly<{
  code:
    | "unknown_ranked_candidate"
    | "duplicate_ranked_candidate"
    | "missing_ranked_candidate";
  candidateIdentity: string;
}>;

type CandidateIdentity = Readonly<{
  templateId: string;
  templateVersion: number;
}>;

const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const CATEGORIES = new Set<PersonalEventCategoryV2>([
  "maintenance",
  "health",
  "housing",
  "career",
  "caregiving",
  "social",
  "behavioral_trap",
  "opportunity",
]);
const TIERS = new Set<Exclude<EventTier, "ambient">>([
  "micro",
  "medium",
  "large",
  "catastrophe",
]);
const TARGETS = new Set<EventTargetV2>([
  "low_emergency_fund",
  "high_credit_utilization",
  "job_portfolio_correlation",
  "portfolio_concentration",
  "uninsured_property",
  "high_fixed_costs",
  "lifestyle_fragility",
  "market_timing",
  "unrelated_hazard",
]);
const REGIMES = new Set<GameStateV2["marketRegime"]>([
  "expansion",
  "inflation",
  "recession",
  "recovery",
]);
const DIFFICULTIES = new Set<RuntimeBalanceDifficultyV2>([
  "guided",
  "normal",
  "hard",
]);
const NARRATIVE_SETUP_IDS = new Set<string>(
  SCENARIO_DIRECTOR_NARRATIVE_SETUP_IDS_V2,
);

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function identity({ templateId, templateVersion }: CandidateIdentity): string {
  return `${templateId}@${templateVersion}`;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function unique<T>(values: readonly T[]): readonly T[] {
  return [...new Set(values)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCanonicalMonth(value: unknown): value is SimulationMonth {
  if (typeof value !== "string") return false;
  try {
    return simulationMonth(value) === value;
  } catch {
    return false;
  }
}

function isIdentifierList(values: unknown, maximum: number): values is readonly string[] {
  return (
    Array.isArray(values) &&
    values.length <= maximum &&
    new Set(values).size === values.length &&
    values.every((value) => typeof value === "string" && IDENTIFIER.test(value))
  );
}

function validateNarrativeSetupId(
  value: string | undefined,
  path: string,
) {
  if (value === undefined) return;
  if (!NARRATIVE_SETUP_IDS.has(value)) {
    throw new ScenarioDirectorInputErrorV2(
      "unsafe_narrative_setup",
      path,
      "narrative setup must use an allow-listed structured identifier",
    );
  }
}

function validateCandidate(
  candidate: ScenarioDirectorCandidateV2,
  index: number,
  policy: ScenarioDirectorPolicyV2,
) {
  const path = `candidates.${index}`;
  if (
    candidate === null ||
    typeof candidate !== "object" ||
    candidate.lessonTags === null ||
    typeof candidate.lessonTags !== "object" ||
    !Array.isArray(candidate.lessonTags.secondary)
  ) {
    throw new ScenarioDirectorInputErrorV2(
      "invalid_candidate_metadata",
      path,
      "candidate metadata must use allow-listed values and unique identifiers",
    );
  }
  if ("narrativeSetup" in candidate) {
    throw new ScenarioDirectorInputErrorV2(
      "unsafe_narrative_setup",
      `${path}.narrativeSetup`,
      "caller-provided narrative prose is not accepted; use a setup identifier",
    );
  }
  if (
    typeof candidate.templateId !== "string" ||
    !IDENTIFIER.test(candidate.templateId) ||
    !Number.isSafeInteger(candidate.templateVersion) ||
    candidate.templateVersion <= 0
  ) {
    throw new ScenarioDirectorInputErrorV2(
      "invalid_candidate_identity",
      path,
      "candidate requires a stable identifier and positive integer version",
    );
  }
  const lessons = [candidate.lessonTags.primary, ...candidate.lessonTags.secondary];
  if (
    !CATEGORIES.has(candidate.category) ||
    !TIERS.has(candidate.tier) ||
    !TARGETS.has(candidate.targetedWeakness) ||
    !isIdentifierList(lessons, policy.maximumTagsPerRecord) ||
    !isIdentifierList(candidate.directorTags, policy.maximumTagsPerRecord)
  ) {
    throw new ScenarioDirectorInputErrorV2(
      "invalid_candidate_metadata",
      path,
      "candidate metadata must use allow-listed values and unique identifiers",
    );
  }
  validateNarrativeSetupId(
    candidate.narrativeSetupId,
    `${path}.narrativeSetupId`,
  );
}

function validateRiskSnapshot(
  input: ScenarioDirectorInputV2,
  policy: ScenarioDirectorPolicyV2,
) {
  if (!isRecord(input.riskSnapshot) || !isRecord(input.riskSnapshot.metrics)) {
    throw new ScenarioDirectorInputErrorV2(
      "invalid_risk_snapshot",
      "riskSnapshot",
      "risk evidence must be a complete structured object",
    );
  }
  if (input.riskSnapshot.version !== RISK_ANALYZER_V1_VERSION) {
    throw new ScenarioDirectorInputErrorV2(
      "invalid_risk_snapshot",
      "riskSnapshot.version",
      "Scenario Director v2 requires Risk v1 evidence",
    );
  }
  if (input.riskSnapshot.asOfMonth !== input.month) {
    throw new ScenarioDirectorInputErrorV2(
      "risk_snapshot_month_mismatch",
      "riskSnapshot.asOfMonth",
      "risk evidence must describe the current simulation month",
    );
  }
  for (const metricId of Object.keys(policy.riskMetricMappings) as Array<
    keyof typeof policy.riskMetricMappings
  >) {
    const metric = input.riskSnapshot.metrics[metricId];
    if (
      !isRecord(metric) ||
      metric.id !== metricId ||
      !Number.isSafeInteger(metric.severityPpm) ||
      metric.severityPpm < 0 ||
      metric.severityPpm > 1_000_000
    ) {
      throw new ScenarioDirectorInputErrorV2(
        "invalid_risk_snapshot",
        `riskSnapshot.metrics.${metricId}`,
        "risk evidence is incomplete or unbounded",
      );
    }
  }
}

function validateInput(
  input: ScenarioDirectorInputV2,
  policy: ScenarioDirectorPolicyV2,
) {
  if (!isRecord(input)) {
    throw new ScenarioDirectorInputErrorV2(
      "invalid_structured_context",
      "input",
      "director input must be a structured object",
    );
  }
  if (input.version !== SCENARIO_DIRECTOR_V2_VERSION) {
    throw new ScenarioDirectorInputErrorV2(
      "unsupported_director_version",
      "version",
      "unsupported Scenario Director version",
    );
  }
  if (
    !isCanonicalMonth(input.month) ||
    !Array.isArray(input.candidates) ||
    !isRecord(input.macro) ||
    !Array.isArray(input.macro.tags) ||
    !Array.isArray(input.recentDecisions) ||
    !Array.isArray(input.recentEvents) ||
    !Array.isArray(input.lessonExposureCounts) ||
    (input.storyArc !== undefined && !isRecord(input.storyArc))
  ) {
    throw new ScenarioDirectorInputErrorV2(
      "invalid_structured_context",
      "input",
      "director input arrays, months, and nested context must be structured",
    );
  }
  const policyViolations = validateScenarioDirectorPolicyV2(policy);
  if (policyViolations.length > 0) {
    throw new ScenarioDirectorInputErrorV2(
      "invalid_policy",
      policyViolations[0]?.path ?? "policy",
      "Scenario Director policy is invalid",
    );
  }
  validateRiskSnapshot(input, policy);
  if (input.candidates.length > policy.maximumCandidates) {
    throw new ScenarioDirectorInputErrorV2(
      "candidate_limit_exceeded",
      "candidates",
      "candidate set exceeds the configured bound",
    );
  }

  const seenCandidates = new Set<string>();
  input.candidates.forEach((candidate, index) => {
    validateCandidate(candidate, index, policy);
    const key = identity(candidate);
    if (seenCandidates.has(key)) {
      throw new ScenarioDirectorInputErrorV2(
        "duplicate_candidate",
        `candidates.${index}`,
        `duplicate candidate ${key}`,
      );
    }
    seenCandidates.add(key);
  });

  if (
    !REGIMES.has(input.macro.regime) ||
    !isIdentifierList(input.macro.tags, policy.maximumTagsPerRecord) ||
    !DIFFICULTIES.has(input.difficulty) ||
    input.recentDecisions.length > policy.maximumRecentDecisions ||
    input.recentEvents.length > policy.maximumRecentEvents ||
    input.lessonExposureCounts.length > policy.maximumLessonCount
  ) {
    throw new ScenarioDirectorInputErrorV2(
      "invalid_structured_context",
      "context",
      "structured director context exceeds its allow-listed bounds",
    );
  }

  let previousDecisionMonth: SimulationMonth | undefined;
  for (const [index, decision] of input.recentDecisions.entries()) {
    if (
      !isRecord(decision) ||
      typeof decision.decisionId !== "string" ||
      typeof decision.reasonCode !== "string" ||
      !IDENTIFIER.test(decision.decisionId) ||
      !IDENTIFIER.test(decision.reasonCode) ||
      !isIdentifierList(decision.semanticTags, policy.maximumTagsPerRecord) ||
      !isCanonicalMonth(decision.month) ||
      compareMonths(decision.month, input.month) > 0 ||
      (previousDecisionMonth !== undefined &&
        compareMonths(previousDecisionMonth, decision.month) > 0)
    ) {
      throw new ScenarioDirectorInputErrorV2(
        "invalid_structured_context",
        `recentDecisions.${index}`,
        "recent decision context must be structured identifiers",
      );
    }
    previousDecisionMonth = decision.month;
  }

  let previousEventMonth: SimulationMonth | undefined;
  for (const [index, event] of input.recentEvents.entries()) {
    if (
      !isRecord(event) ||
      typeof event.templateId !== "string" ||
      typeof event.templateVersion !== "number" ||
      typeof event.category !== "string" ||
      typeof event.tier !== "string" ||
      typeof event.targetedWeakness !== "string" ||
      !IDENTIFIER.test(event.templateId) ||
      !Number.isSafeInteger(event.templateVersion) ||
      event.templateVersion <= 0 ||
      !CATEGORIES.has(event.category as PersonalEventCategoryV2) ||
      !TIERS.has(event.tier as Exclude<EventTier, "ambient">) ||
      !TARGETS.has(event.targetedWeakness as EventTargetV2) ||
      !isIdentifierList(event.lessonTags, policy.maximumTagsPerRecord) ||
      !isCanonicalMonth(event.month) ||
      compareMonths(event.month, input.month) > 0 ||
      (previousEventMonth !== undefined &&
        compareMonths(previousEventMonth, event.month) > 0)
    ) {
      throw new ScenarioDirectorInputErrorV2(
        "invalid_structured_context",
        `recentEvents.${index}`,
        "recent event context must be bounded structured metadata",
      );
    }
    previousEventMonth = event.month;
  }

  const lessonCounts = new Set<string>();
  for (const [index, exposure] of input.lessonExposureCounts.entries()) {
    if (
      !isRecord(exposure) ||
      typeof exposure.lessonTag !== "string" ||
      typeof exposure.count !== "number" ||
      !IDENTIFIER.test(exposure.lessonTag) ||
      !Number.isSafeInteger(exposure.count) ||
      exposure.count < 0 ||
      exposure.count > policy.maximumLessonCount ||
      lessonCounts.has(exposure.lessonTag)
    ) {
      throw new ScenarioDirectorInputErrorV2(
        "invalid_structured_context",
        `lessonExposureCounts.${index}`,
        "lesson exposure must be a unique identifier with a bounded count",
      );
    }
    lessonCounts.add(exposure.lessonTag);
  }

  if (
    input.storyArc !== undefined &&
    (typeof input.storyArc.arcId !== "string" ||
      !IDENTIFIER.test(input.storyArc.arcId) ||
      !isIdentifierList(input.storyArc.tags, policy.maximumTagsPerRecord))
  ) {
    throw new ScenarioDirectorInputErrorV2(
      "invalid_structured_context",
      "storyArc",
      "story arc must contain structured identifiers only",
    );
  }
}

function candidateChecksum(candidates: readonly ScenarioDirectorCandidateV2[]) {
  return sha256Canonical(
    [...candidates]
      .sort((left, right) => {
        const byId = compareText(left.templateId, right.templateId);
        return byId || left.templateVersion - right.templateVersion;
      })
      .map((candidate) => ({
        templateId: candidate.templateId,
        templateVersion: candidate.templateVersion,
        category: candidate.category,
        tier: candidate.tier,
        targetedWeakness: candidate.targetedWeakness,
        lessonTags: candidate.lessonTags,
        directorTags: candidate.directorTags,
        ...(candidate.narrativeSetupId === undefined
          ? {}
          : { narrativeSetupId: candidate.narrativeSetupId }),
      })),
  );
}

function rankingInputChecksum(
  input: ScenarioDirectorInputV2,
  policy: ScenarioDirectorPolicyV2,
) {
  const riskMetrics = Object.keys(policy.riskMetricMappings)
    .sort(compareText)
    .map((metricId) => {
      const metric = input.riskSnapshot.metrics[
        metricId as keyof typeof input.riskSnapshot.metrics
      ];
      return { metricId, severityPpm: metric.severityPpm };
    });
  return sha256Canonical({
    version: input.version,
    month: input.month,
    riskSnapshot: {
      version: input.riskSnapshot.version,
      asOfMonth: input.riskSnapshot.asOfMonth,
      metrics: riskMetrics,
    },
    macro: {
      regime: input.macro.regime,
      tags: input.macro.tags,
    },
    candidates: input.candidates.map((candidate) => ({
      templateId: candidate.templateId,
      templateVersion: candidate.templateVersion,
      category: candidate.category,
      tier: candidate.tier,
      targetedWeakness: candidate.targetedWeakness,
      lessonTags: candidate.lessonTags,
      directorTags: candidate.directorTags,
      narrativeSetupId: candidate.narrativeSetupId ?? null,
    })),
    recentDecisions: input.recentDecisions.map((decision) => ({
      decisionId: decision.decisionId,
      month: decision.month,
      reasonCode: decision.reasonCode,
      semanticTags: decision.semanticTags,
    })),
    recentEvents: input.recentEvents.map((event) => ({
      templateId: event.templateId,
      templateVersion: event.templateVersion,
      category: event.category,
      tier: event.tier,
      targetedWeakness: event.targetedWeakness,
      lessonTags: event.lessonTags,
      month: event.month,
    })),
    lessonExposureCounts: input.lessonExposureCounts,
    difficulty: input.difficulty,
    storyArc:
      input.storyArc === undefined
        ? null
        : { arcId: input.storyArc.arcId, tags: input.storyArc.tags },
    policy,
  });
}

function scoreCandidate(
  candidate: ScenarioDirectorCandidateV2,
  input: ScenarioDirectorInputV2,
  policy: ScenarioDirectorPolicyV2,
): Omit<ScenarioDirectorRankedCandidateV2, "rank"> {
  const candidateLessons = [
    candidate.lessonTags.primary,
    ...candidate.lessonTags.secondary,
  ];
  const riskLessonTags = new Set<string>();
  let maximumTargetSeverityPpm = 0;
  for (const [metricId, mapping] of Object.entries(policy.riskMetricMappings) as Array<
    [keyof typeof policy.riskMetricMappings, (typeof policy.riskMetricMappings)[keyof typeof policy.riskMetricMappings]]
  >) {
    const severityPpm = input.riskSnapshot.metrics[metricId].severityPpm;
    if (severityPpm > 0) {
      for (const lessonTag of mapping.lessonTags) riskLessonTags.add(lessonTag);
    }
    if (
      candidate.targetedWeakness !== "unrelated_hazard" &&
      mapping.targetedWeakness === candidate.targetedWeakness
    ) {
      maximumTargetSeverityPpm = Math.max(maximumTargetSeverityPpm, severityPpm);
    }
  }

  const weaknessSteps =
    maximumTargetSeverityPpm === 0
      ? 0
      : Math.ceil(maximumTargetSeverityPpm / policy.severityStepPpm);
  const weaknessRelevance =
    weaknessSteps * policy.weights.weaknessSeverityStep;
  const lessonMatches = candidateLessons.filter((tag) => riskLessonTags.has(tag)).length;
  const lessonRelevance = lessonMatches * policy.weights.lessonMatch;
  const macroCoherence =
    policy.macroCategoryAffinity[input.macro.regime][candidate.category] *
    policy.weights.macroAffinityUnit;

  const candidateSemanticTags = new Set([
    ...candidateLessons,
    ...candidate.directorTags,
  ]);
  const recentDecisionMatches = unique(
    input.recentDecisions.flatMap(({ semanticTags }) =>
      semanticTags.filter((tag) => candidateSemanticTags.has(tag)),
    ),
  ).length;
  const recentDecisionRelevance =
    recentDecisionMatches * policy.weights.recentDecisionTagMatch;

  const repeatedTemplateCount = input.recentEvents.filter(
    (event) =>
      event.templateId === candidate.templateId &&
      event.templateVersion === candidate.templateVersion,
  ).length;
  const repeatedCategoryCount = input.recentEvents.filter(
    (event) => event.category === candidate.category,
  ).length;
  const repeatedTargetCount =
    candidate.targetedWeakness === "unrelated_hazard"
      ? 0
      : input.recentEvents.filter(
          (event) => event.targetedWeakness === candidate.targetedWeakness,
        ).length;
  const repeatedLessonCount = input.recentEvents.reduce(
    (sum, event) =>
      sum +
      unique(event.lessonTags.filter((tag) => candidateLessons.includes(tag))).length,
    0,
  );

  const novelty =
    (repeatedTemplateCount === 0 ? policy.weights.novelTemplate : 0) +
    (repeatedCategoryCount === 0 ? policy.weights.novelCategory : 0);
  const lessonCountByTag = new Map(
    input.lessonExposureCounts.map(({ lessonTag, count }) => [lessonTag, count]),
  );
  const maximumExposure = Math.max(0, ...lessonCountByTag.values());
  const intendedLessonExposure =
    lessonCountByTag.get(candidate.lessonTags.primary) ?? 0;
  const lessonCoverageSteps = Math.min(
    policy.weights.maximumLessonCoverageSteps,
    Math.max(0, maximumExposure - intendedLessonExposure),
  );
  const lessonCoverage =
    lessonCoverageSteps * policy.weights.lessonCoverageStep;
  const difficultyFit =
    policy.difficultyTierAffinity[input.difficulty][candidate.tier] *
    policy.weights.difficultyAffinityUnit;
  const narrativeMatches = input.storyArc
    ? unique(
        input.storyArc.tags.filter((tag) => candidateSemanticTags.has(tag)),
      ).length
    : 0;
  const narrativeContinuity =
    narrativeMatches * policy.weights.narrativeTagMatch;
  const repetitionPenalty = -(
    repeatedTemplateCount * policy.weights.repeatedTemplate +
    repeatedCategoryCount * policy.weights.repeatedCategory +
    repeatedTargetCount * policy.weights.repeatedTarget +
    repeatedLessonCount * policy.weights.repeatedLesson
  );

  const scoreComponents: ScenarioDirectorScoreComponentsV2 = {
    weaknessRelevance,
    lessonRelevance,
    macroCoherence,
    recentDecisionRelevance,
    novelty,
    lessonCoverage,
    difficultyFit,
    narrativeContinuity,
    repetitionPenalty,
  };
  const totalScore = Object.values(scoreComponents).reduce(
    (sum, component) => sum + component,
    0,
  );
  if (
    !Number.isSafeInteger(totalScore) ||
    Math.abs(totalScore) > policy.maximumAbsoluteScore
  ) {
    throw new ScenarioDirectorInputErrorV2(
      "score_out_of_bounds",
      `candidates.${identity(candidate)}`,
      "candidate score exceeds the frozen safe integer bound",
    );
  }

  const reasonSet = new Set<ScenarioDirectorReasonCodeV2>();
  if (weaknessRelevance > 0) reasonSet.add("weakness_relevance");
  if (lessonRelevance > 0) reasonSet.add("lesson_relevance");
  if (macroCoherence > 0) reasonSet.add("macro_coherence");
  if (recentDecisionRelevance > 0) reasonSet.add("recent_decision_relevance");
  if (repeatedTemplateCount === 0) reasonSet.add("novel_template");
  if (repeatedCategoryCount === 0) reasonSet.add("novel_category");
  if (lessonCoverage > 0) reasonSet.add("underrepresented_lesson");
  if (difficultyFit > 0) reasonSet.add("difficulty_fit");
  if (narrativeContinuity > 0) reasonSet.add("narrative_continuity");
  if (repeatedTemplateCount > 0) reasonSet.add("recent_template_repetition");
  if (repeatedCategoryCount > 0) reasonSet.add("recent_category_repetition");
  if (repeatedTargetCount > 0) reasonSet.add("recent_target_repetition");
  if (repeatedLessonCount > 0) reasonSet.add("recent_lesson_repetition");
  const reasonCodes = SCENARIO_DIRECTOR_REASON_CODES_V2.filter((reason) =>
    reasonSet.has(reason),
  );

  return {
    templateId: candidate.templateId,
    templateVersion: candidate.templateVersion,
    intendedLesson: candidate.lessonTags.primary,
    scoreComponents,
    totalScore,
    reasonCodes,
    ...(candidate.narrativeSetupId === undefined
      ? {}
      : { narrativeSetupId: candidate.narrativeSetupId }),
  };
}

export function validateScenarioDirectorPermutationV2(
  candidates: readonly CandidateIdentity[],
  ranking: readonly CandidateIdentity[],
): readonly ScenarioDirectorPermutationViolationV2[] {
  const candidateKeys = new Set(candidates.map(identity));
  const rankedKeys = new Set<string>();
  const violations: ScenarioDirectorPermutationViolationV2[] = [];

  for (const ranked of ranking) {
    const key = identity(ranked);
    if (!candidateKeys.has(key)) {
      violations.push({ code: "unknown_ranked_candidate", candidateIdentity: key });
    }
    if (rankedKeys.has(key)) {
      violations.push({ code: "duplicate_ranked_candidate", candidateIdentity: key });
    }
    rankedKeys.add(key);
  }
  for (const key of [...candidateKeys].sort(compareText)) {
    if (!rankedKeys.has(key)) {
      violations.push({ code: "missing_ranked_candidate", candidateIdentity: key });
    }
  }
  return deepFreeze(violations);
}

export function rankScenarioCandidatesV2(
  input: ScenarioDirectorInputV2,
  policy: ScenarioDirectorPolicyV2 = SCENARIO_DIRECTOR_POLICY_V1,
): ScenarioDirectorDecisionV2 {
  validateInput(input, policy);
  const scored = input.candidates.map((candidate) =>
    scoreCandidate(candidate, input, policy),
  );
  scored.sort((left, right) => {
    if (left.totalScore !== right.totalScore) {
      return right.totalScore - left.totalScore;
    }
    const byId = compareText(left.templateId, right.templateId);
    return byId || left.templateVersion - right.templateVersion;
  });
  const ranked = scored.map((candidate, index) => ({
    rank: index + 1,
    ...candidate,
  }));
  const permutationViolations = validateScenarioDirectorPermutationV2(
    input.candidates,
    ranked,
  );
  if (permutationViolations.length > 0) {
    throw new ScenarioDirectorInputErrorV2(
      "invalid_candidate_metadata",
      "ranked",
      "internal ranking did not preserve the candidate set",
    );
  }

  return deepFreeze({
    version: SCENARIO_DIRECTOR_V2_VERSION,
    policyVersion: policy.version,
    riskVersion: input.riskSnapshot.version,
    riskAsOfMonth: input.riskSnapshot.asOfMonth,
    difficulty: input.difficulty,
    macroRegime: input.macro.regime,
    ...(input.storyArc === undefined
      ? {}
      : { storyArcId: input.storyArc.arcId }),
    rankingSource: "deterministic_fallback",
    candidateSetChecksum: candidateChecksum(input.candidates),
    rankingInputChecksum: rankingInputChecksum(input, policy),
    ranked,
  });
}
