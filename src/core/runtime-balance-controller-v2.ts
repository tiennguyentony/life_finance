import { canonicalJson, sha256Canonical } from "./canonical";
import { PERSONAL_EVENT_PRESENTATIONS_V1 } from "../data/personal-event-presentation-v1";
import { NumericDomainError } from "./domain/integer";
import type { RatePpm } from "./domain/money";
import { monthsBetween } from "./domain/month";
import { nextInt, type RandomState } from "./domain/rng";
import { UNRELATED_HAZARD_TARGET, type EventTargetV2 } from "./events";
import type { GameStateV2 } from "./game-state-v2";
import {
  personalEventEligibilityReasonsV2,
  personalEventHistoryAvailabilityReasonsV2,
  validatePersonalEventTemplateV2,
  type PersonalEventTemplateV2,
  type ScheduledDeclarativePersonalEventV2,
} from "./personal-event-v2";
import {
  estimatePersonalEventImpactV2,
  RuntimeBalanceImpactV2Error,
  type PersonalEventImpactEstimateV2,
  type RuntimeBalanceMonthlyCashFlowEvidenceV2,
} from "./runtime-balance-impact-v2";
import { PersonalEventEffectV2Error } from "./personal-event-effects-v2";
import { ObligationFundingV2Error } from "./obligation-funding-v2";
import { analyzeRiskV1 } from "./risk-v1";
import {
  projectScenarioDirectorStateContextV2,
  scenarioDirectorTagsForCandidateV2,
} from "./scenario-director-context-v2";
import {
  RUNTIME_BALANCE_CANDIDATE_LIMIT_V2,
  RUNTIME_BALANCE_CONTROLLER_V1_VERSION,
  RUNTIME_BALANCE_IMPACT_ESTIMATOR_V1_VERSION,
  RUNTIME_BALANCE_LESSON_LIMIT_V2,
  RUNTIME_BALANCE_POLICY_V1_VERSION,
  RUNTIME_BALANCE_REJECTION_LIMIT_V2,
  RUNTIME_BALANCE_RECENT_EVENT_LIMIT_V2,
  runtimeBalanceDifficultyPolicyV2,
} from "./runtime-balance-policy-v2";
import {
  regenerateRuntimeBalancePressureV2,
  type RuntimeBalanceRejectionCodeV2,
  type RuntimeBalanceStateV2,
} from "./runtime-balance-state-v2";
import { assessRuntimeBalanceChallengeV1 } from "./runtime-balance-challenge-v1";
import {
  rankScenarioCandidatesV2,
  validateScenarioDirectorPermutationV2,
  type ScenarioDirectorDecisionV2,
  type ScenarioDirectorInputV2,
} from "./scenario-director-v2";

export type RuntimeBalanceCandidateV2 = Readonly<{
  template: PersonalEventTemplateV2;
  targetedWeakness: EventTargetV2;
  followUpSourceEventId?: string;
}>;

function isHumorousRootCandidateV2(
  candidate: RuntimeBalanceCandidateV2,
): boolean {
  if (candidate.followUpSourceEventId !== undefined) return false;
  const presentation = PERSONAL_EVENT_PRESENTATIONS_V1.find(
    ({ templateId, templateVersion }) =>
      templateId === candidate.template.id &&
      templateVersion === candidate.template.version,
  );
  return presentation !== undefined &&
    presentation.cadenceRole !== "follow_up" &&
    presentation.tone !== "serious";
}

export type RuntimeBalanceCandidateDecisionV2 = Readonly<{
  templateId: string;
  templateVersion: number;
  rank: number;
  adjustedRank: number;
  repetitionPenalty: number;
  lessonCoverageBonus: number;
  evaluated: boolean;
  rejectionCodes: readonly RuntimeBalanceRejectionCodeV2[];
  warningCodes: readonly RuntimeBalanceWarningCodeV2[];
  parameters?: Readonly<Record<string, number>>;
  impactScorePpm?: number;
  impact?: RuntimeBalanceCandidateImpactSummaryV2;
}>;

export type RuntimeBalanceWarningCodeV2 =
  | "impact_score_near_limit"
  | "burn_months_near_limit"
  | "negative_cash_flow_near_limit"
  | "recovery_time_near_limit";

export type RuntimeBalanceCandidateImpactSummaryV2 = Readonly<{
  minimumUncoveredCostCents: number;
  likelyLiquidationCents: number;
  likelyCreditUseCents: number;
  burnMonthsPpm: number;
  negativeCashFlowDurationMonths: number;
  recoveryTimeMonths: number;
  bankruptcyRisk: PersonalEventImpactEstimateV2["bankruptcyRisk"];
  inexpensiveGoalDelayMonths: number | null;
  reasonableResponseIds: readonly string[];
}>;

export type RuntimeBalanceDecisionV2 = Readonly<{
  version: "runtime-balance-decision-v1";
  controllerVersion: typeof RUNTIME_BALANCE_CONTROLLER_V1_VERSION;
  policyVersion: typeof RUNTIME_BALANCE_POLICY_V1_VERSION;
  impactEstimatorVersion: typeof RUNTIME_BALANCE_IMPACT_ESTIMATOR_V1_VERSION;
  difficulty: RuntimeBalanceStateV2["difficulty"];
  candidateLimit: typeof RUNTIME_BALANCE_CANDIDATE_LIMIT_V2;
  warningStrength: ReturnType<typeof runtimeBalanceDifficultyPolicyV2>["warningStrength"];
  impactBands: Readonly<{
    maximumImpactScorePpm: number;
    maximumBurnMonthsPpm: number;
    maximumNegativeCashFlowDurationMonths: number;
    maximumRecoveryTimeMonths: number;
  }>;
  month: GameStateV2["currentMonth"];
  status: "approved" | "none";
  nullReason?: "no_candidates" | "all_rejected";
  pressureBeforeUnits: number;
  pressureAfterUnits: number;
  evaluatedCandidateCount: number;
  candidates: readonly RuntimeBalanceCandidateDecisionV2[];
  scenarioDirector?: Readonly<{
    version: ScenarioDirectorDecisionV2["version"];
    policyVersion: ScenarioDirectorDecisionV2["policyVersion"];
    rankingSource: ScenarioDirectorDecisionV2["rankingSource"];
    candidateSetChecksum: string;
    rankingInputChecksum: string;
  }>;
  approved?: Readonly<{
    eventId: string;
    templateId: string;
    templateVersion: number;
    parameters: Readonly<Record<string, number>>;
    impact: PersonalEventImpactEstimateV2;
    pressureCostUnits: number;
    warningCodes: readonly RuntimeBalanceWarningCodeV2[];
  }>;
}>;

export type RuntimeBalanceChoiceV2 = Readonly<{
  event: ScheduledDeclarativePersonalEventV2 | null;
  nextRandom: RandomState;
  runtimeBalance: RuntimeBalanceStateV2;
  decision: RuntimeBalanceDecisionV2;
}>;

export type RuntimeBalanceChoiceOptionsV2 = Readonly<{
  developmentMode?: boolean;
  eventCatalog: readonly PersonalEventTemplateV2[];
  monthlyCashFlowEvidence: RuntimeBalanceMonthlyCashFlowEvidenceV2;
  estimateImpact?: typeof estimatePersonalEventImpactV2;
  scenarioDirectorInput?: ScenarioDirectorInputV2;
  scenarioDirectorDecision?: ScenarioDirectorDecisionV2;
  preferredChallengeBands?: readonly ("meaningful" | "crisis")[];
  /** Named-world mode supplies gross keyed parameters without consuming the legacy cursor. */
  parameterSampler?: (
    template: PersonalEventTemplateV2,
  ) => Readonly<Record<string, number>>;
}>;

type ScoredCandidate = Readonly<{
  candidate: RuntimeBalanceCandidateV2;
  rank: number;
  adjustedRank: number;
  repetitionPenalty: number;
  lessonCoverageBonus: number;
}>;

function compactImpact(
  impact: PersonalEventImpactEstimateV2,
): RuntimeBalanceCandidateImpactSummaryV2 {
  return Object.freeze({
    minimumUncoveredCostCents: impact.minimumUncoveredCostCents,
    likelyLiquidationCents: impact.likelyLiquidationCents,
    likelyCreditUseCents: impact.likelyCreditUseCents,
    burnMonthsPpm: impact.burnMonthsPpm,
    negativeCashFlowDurationMonths: impact.negativeCashFlowDurationMonths,
    recoveryTimeMonths: impact.recoveryTimeMonths,
    bankruptcyRisk: impact.bankruptcyRisk,
    inexpensiveGoalDelayMonths: impact.inexpensiveGoalDelayMonths,
    reasonableResponseIds: Object.freeze([...impact.reasonableResponseIds]),
  });
}

function allLessonTags(template: PersonalEventTemplateV2): readonly string[] {
  return [template.lessonTags.primary, ...template.lessonTags.secondary];
}

function effectivePressureCost(
  template: PersonalEventTemplateV2,
  policy: ReturnType<typeof runtimeBalanceDifficultyPolicyV2>,
): number {
  if (template.classification === "positive") return 0;
  return Math.max(
    template.pressureCost,
    policy.minimumTierPressureCostUnits[template.severityTier],
  );
}

function scoreRuntimeBalanceCandidatesV2(
  balance: RuntimeBalanceStateV2,
  candidates: readonly RuntimeBalanceCandidateV2[],
  preserveInputOrder: boolean,
): readonly ScoredCandidate[] {
  const policy = runtimeBalanceDifficultyPolicyV2(balance.difficulty);
  const lessonCounts = new Map(
    balance.lessonExposureCounts.map(({ lessonTag, count }) => [lessonTag, count]),
  );
  const maximumExposure = Math.max(0, ...lessonCounts.values());
  const scored = candidates
    .slice(0, RUNTIME_BALANCE_CANDIDATE_LIMIT_V2)
    .map((candidate, index) => {
      const lessons = new Set(allLessonTags(candidate.template));
      const repeatedEventCount = balance.recentEvents.filter(
        ({ templateId }) => templateId === candidate.template.id,
      ).length;
      const repeatedCategoryCount = balance.recentEvents.filter(
        ({ category }) => category === candidate.template.category,
      ).length;
      const repeatedLessonCount = balance.recentEvents.filter(({ lessonTags }) =>
        lessonTags.some((lesson) => lessons.has(lesson)),
      ).length;
      const repetitionPenalty =
        repeatedEventCount * policy.repeatedEventPenalty +
        repeatedCategoryCount * policy.repeatedCategoryPenalty +
        repeatedLessonCount * policy.repeatedLessonPenalty;
      const primaryExposure = lessonCounts.get(
        candidate.template.lessonTags.primary,
      ) ?? 0;
      const lessonCoverageBonus =
        (maximumExposure - primaryExposure) *
        policy.underrepresentedLessonBonus;
      const rank = candidates.length - index;
      return {
        candidate,
        rank,
        adjustedRank:
          rank * policy.baseRankStep + lessonCoverageBonus - repetitionPenalty,
        repetitionPenalty,
        lessonCoverageBonus,
      };
    });
  return preserveInputOrder
    ? scored
    : scored.toSorted(
        (left, right) => right.adjustedRank - left.adjustedRank,
      );
}

export function prioritizeRuntimeBalanceCandidatesV2(
  balance: RuntimeBalanceStateV2,
  candidates: readonly RuntimeBalanceCandidateV2[],
): readonly ScoredCandidate[] {
  return scoreRuntimeBalanceCandidatesV2(balance, candidates, false);
}

function directorOrderedCandidatesV2(
  state: GameStateV2,
  balance: RuntimeBalanceStateV2,
  candidates: readonly RuntimeBalanceCandidateV2[],
  input: ScenarioDirectorInputV2,
  decision: ScenarioDirectorDecisionV2,
  eventCatalog: readonly PersonalEventTemplateV2[],
): readonly RuntimeBalanceCandidateV2[] {
  const projectedContext = projectScenarioDirectorStateContextV2(state, {
    personalEventCatalog: eventCatalog,
  });
  if (
    input.month !== state.currentMonth ||
    input.macro.regime !== state.marketRegime ||
    input.difficulty !== balance.difficulty ||
    decision.riskAsOfMonth !== state.currentMonth ||
    decision.difficulty !== balance.difficulty
  ) {
    throw new RangeError(
      "Scenario Director evidence must match the current month and Runtime Balance difficulty",
    );
  }
  if (
    sha256Canonical(input.riskSnapshot) !==
      sha256Canonical(analyzeRiskV1(state)) ||
    sha256Canonical(input.macro) !==
      sha256Canonical(projectedContext.macro) ||
    sha256Canonical(input.recentDecisions) !==
      sha256Canonical(projectedContext.recentDecisions) ||
    sha256Canonical(input.storyArc ?? null) !==
      sha256Canonical(projectedContext.storyArc ?? null) ||
    sha256Canonical(input.recentEvents) !==
      sha256Canonical(projectedContext.recentEvents) ||
    sha256Canonical(input.lessonExposureCounts) !==
      sha256Canonical(projectedContext.lessonExposureCounts)
  ) {
    throw new RangeError(
      "Scenario Director input must use verified production Risk and Runtime Balance evidence",
    );
  }
  const violations = validateScenarioDirectorPermutationV2(
    candidates.map(({ template }) => ({
      templateId: template.id,
      templateVersion: template.version,
    })),
    input.candidates,
  );
  if (violations.length > 0) {
    throw new RangeError(
      `Scenario Director input must be an exact candidate permutation: ${violations
        .map(({ code, candidateIdentity }) => `${code}:${candidateIdentity}`)
        .join(",")}`,
    );
  }
  const candidatesByIdentity = new Map(
    candidates.map((candidate) => [
      `${candidate.template.id}@${candidate.template.version}`,
      candidate,
    ]),
  );
  for (const candidate of input.candidates) {
    const expected = candidatesByIdentity.get(
      `${candidate.templateId}@${candidate.templateVersion}`,
    );
    if (
      expected === undefined ||
      candidate.category !== expected.template.category ||
      candidate.tier !== expected.template.severityTier ||
      candidate.targetedWeakness !== expected.targetedWeakness ||
      candidate.lessonTags.primary !== expected.template.lessonTags.primary ||
      sha256Canonical(candidate.lessonTags.secondary) !==
        sha256Canonical(expected.template.lessonTags.secondary) ||
      sha256Canonical(candidate.directorTags) !== sha256Canonical(
        scenarioDirectorTagsForCandidateV2(
          expected.template,
          expected.targetedWeakness,
        ),
      )
    ) {
      throw new RangeError(
        "Scenario Director input must preserve immutable Event System metadata",
      );
    }
  }
  const verifiedDecision = rankScenarioCandidatesV2(input);
  if (
    decision.candidateSetChecksum !== verifiedDecision.candidateSetChecksum ||
    decision.rankingInputChecksum !== verifiedDecision.rankingInputChecksum ||
    decision.version !== verifiedDecision.version ||
    decision.policyVersion !== verifiedDecision.policyVersion ||
    decision.riskVersion !== verifiedDecision.riskVersion ||
    decision.riskAsOfMonth !== verifiedDecision.riskAsOfMonth ||
    decision.difficulty !== verifiedDecision.difficulty ||
    decision.macroRegime !== verifiedDecision.macroRegime ||
    decision.storyArcId !== verifiedDecision.storyArcId ||
    validateScenarioDirectorPermutationV2(
      verifiedDecision.ranked,
      decision.ranked,
    ).length > 0
  ) {
    throw new RangeError(
      "Scenario Director decision must preserve verified deterministic input evidence and candidate identity",
    );
  }
  const verifiedByIdentity = new Map(
    verifiedDecision.ranked.map((candidate) => [
      `${candidate.templateId}@${candidate.templateVersion}`,
      candidate,
    ]),
  );
  const ordered = decision.ranked.map((ranked) => {
      const candidate = candidatesByIdentity.get(
        `${ranked.templateId}@${ranked.templateVersion}`,
      );
      const verified = verifiedByIdentity.get(
        `${ranked.templateId}@${ranked.templateVersion}`,
      );
      if (
        candidate === undefined ||
        verified === undefined ||
        ranked.intendedLesson !== candidate.template.lessonTags.primary ||
        sha256Canonical({ ...ranked, rank: 0 }) !==
          sha256Canonical({ ...verified, rank: 0 })
      ) {
        throw new RangeError(
          "Scenario Director ranking must preserve immutable candidate lesson metadata",
        );
      }
      return candidate;
    });
  return Object.freeze([
    ...ordered.filter(({ followUpSourceEventId }) => followUpSourceEventId !== undefined),
    ...ordered.filter(({ followUpSourceEventId }) => followUpSourceEventId === undefined),
  ]);
}

function scenarioDirectorEvidenceV2(
  decision: ScenarioDirectorDecisionV2 | undefined,
): RuntimeBalanceDecisionV2["scenarioDirector"] {
  return decision === undefined
    ? undefined
    : Object.freeze({
        version: decision.version,
        policyVersion: decision.policyVersion,
        rankingSource: decision.rankingSource,
        candidateSetChecksum: decision.candidateSetChecksum,
        rankingInputChecksum: decision.rankingInputChecksum,
      });
}

function elapsedMonths(
  state: GameStateV2,
  approvedMonth: GameStateV2["currentMonth"],
): number {
  return Math.max(0, monthsBetween(approvedMonth, state.currentMonth));
}

export function assessCandidatePacingV2(
  state: GameStateV2,
  balance: RuntimeBalanceStateV2,
  candidate: RuntimeBalanceCandidateV2,
  eventCatalog: readonly PersonalEventTemplateV2[],
): RuntimeBalanceRejectionCodeV2[] {
  const { template } = candidate;
  const policy = runtimeBalanceDifficultyPolicyV2(balance.difficulty);
  const reasons: RuntimeBalanceRejectionCodeV2[] = [];
  const canonicalTemplate = eventCatalog.find(
    ({ id, version }) => id === template.id && version === template.version,
  );
  if (
    canonicalTemplate === undefined ||
    canonicalJson(canonicalTemplate) !== canonicalJson(template) ||
    validatePersonalEventTemplateV2(template).length > 0 ||
    personalEventEligibilityReasonsV2(template, state).length > 0 ||
    personalEventHistoryAvailabilityReasonsV2(template, state, eventCatalog).length > 0
  ) {
    reasons.push("ineligible");
  }
  if (candidate.targetedWeakness !== UNRELATED_HAZARD_TARGET) {
    reasons.push("ineligible");
  }
  const cost = effectivePressureCost(template, policy);
  if (cost > balance.pressureUnits) reasons.push("insufficient_pressure");
  const lessons = new Set(allLessonTags(template));
  for (const recent of balance.recentEvents) {
    const elapsed = elapsedMonths(state, recent.approvedMonth);
    if (
      recent.templateId === template.id &&
      elapsed < Math.max(
        template.cooldowns.eventMonths,
        policy.minimumEventCooldownMonths,
      ) &&
      !reasons.includes("event_cooldown")
    ) reasons.push("event_cooldown");
    if (
      recent.category === template.category &&
      elapsed < Math.max(
        template.cooldowns.categoryMonths,
        policy.minimumCategoryCooldownMonths,
      ) &&
      !reasons.includes("category_cooldown")
    ) reasons.push("category_cooldown");
    if (
      recent.lessonTags.some((tag) => lessons.has(tag)) &&
      elapsed < Math.max(
        template.cooldowns.lessonMonths,
        policy.minimumLessonCooldownMonths,
      ) &&
      !reasons.includes("lesson_cooldown")
    ) reasons.push("lesson_cooldown");
  }
  const monthsSinceTier = template.severityTier === "medium"
    ? balance.monthsSinceMediumEvent
    : template.severityTier === "large"
      ? balance.monthsSinceLargeEvent
      : template.severityTier === "catastrophe"
        ? balance.monthsSinceCatastrophicEvent
        : null;
  if (
    monthsSinceTier !== null &&
    monthsSinceTier < policy.tierCooldownMonths[template.severityTier]
  ) reasons.push("tier_cooldown");
  if (balance.recovery !== null) {
    if (
      template.severityTier === "large" ||
      template.severityTier === "catastrophe"
    ) reasons.push("recovery_block");
    if (
      template.classification === "negative" &&
      candidate.targetedWeakness !== "unrelated_hazard" &&
      candidate.targetedWeakness === balance.recovery.targetedWeakness
    ) reasons.push("recovery_retarget");
  }
  if (
    template.severityTier === "catastrophe" &&
    balance.catastropheCount >= policy.maximumCatastrophes
  ) reasons.push("catastrophe_limit");
  return reasons;
}

export type RuntimeBalanceImpactBandInputV2 = Readonly<{
  impactScorePpm: number;
  burnMonthsPpm: number;
  negativeCashFlowDurationMonths: number;
  recoveryTimeMonths: number;
}>;

export function assessRuntimeBalanceImpactV2(
  difficulty: RuntimeBalanceStateV2["difficulty"],
  impact: RuntimeBalanceImpactBandInputV2,
): Readonly<{
  rejectionCodes: readonly RuntimeBalanceRejectionCodeV2[];
  warningCodes: readonly RuntimeBalanceWarningCodeV2[];
}> {
  const policy = runtimeBalanceDifficultyPolicyV2(difficulty);
  const rejectionCodes: RuntimeBalanceRejectionCodeV2[] = [];
  if (
    impact.impactScorePpm > policy.maximumImpactScorePpm ||
    impact.burnMonthsPpm > policy.maximumBurnMonthsPpm ||
    impact.negativeCashFlowDurationMonths >
      policy.maximumNegativeCashFlowDurationMonths ||
    impact.recoveryTimeMonths > policy.maximumRecoveryTimeMonths
  ) rejectionCodes.push("impact_above_band");

  const warningThresholdPpm = policy.warningStrength === "strong"
    ? 500_000
    : policy.warningStrength === "standard"
      ? 700_000
      : 900_000;
  const warningCodes: RuntimeBalanceWarningCodeV2[] = [];
  const nearLimit = (value: number, maximum: number) =>
    value * 1_000_000 >= maximum * warningThresholdPpm;
  if (nearLimit(impact.impactScorePpm, policy.maximumImpactScorePpm)) {
    warningCodes.push("impact_score_near_limit");
  }
  if (nearLimit(impact.burnMonthsPpm, policy.maximumBurnMonthsPpm)) {
    warningCodes.push("burn_months_near_limit");
  }
  if (
    nearLimit(
      impact.negativeCashFlowDurationMonths,
      policy.maximumNegativeCashFlowDurationMonths,
    )
  ) warningCodes.push("negative_cash_flow_near_limit");
  if (nearLimit(impact.recoveryTimeMonths, policy.maximumRecoveryTimeMonths)) {
    warningCodes.push("recovery_time_near_limit");
  }
  return Object.freeze({
    rejectionCodes: Object.freeze(rejectionCodes),
    warningCodes: Object.freeze(warningCodes),
  });
}

function sampleParameters(
  template: PersonalEventTemplateV2,
  random: RandomState,
): Readonly<{
  parameters: Readonly<Record<string, number>>;
  nextRandom: RandomState;
}> {
  let cursor = random;
  const parameters: Record<string, number> = {};
  for (const parameter of template.parameters) {
    const draw = nextInt(cursor, parameter.minimum, parameter.maximum);
    parameters[parameter.id] = draw.value;
    cursor = draw.nextState;
  }
  return Object.freeze({
    parameters: Object.freeze(parameters),
    nextRandom: cursor,
  });
}

function boundedRecentEvents(
  events: readonly RuntimeBalanceStateV2["recentEvents"][number][],
): readonly RuntimeBalanceStateV2["recentEvents"][number][] {
  const requiredEventIds = new Set(
    events
      .filter(({ tier }) => tier === "catastrophe")
      .map(({ eventId }) => eventId),
  );
  for (const tier of ["medium", "large"] as const) {
    const latest = events.findLast((event) => event.tier === tier);
    if (latest !== undefined) requiredEventIds.add(latest.eventId);
  }
  for (let index = events.length - 1;
    index >= 0 && requiredEventIds.size < RUNTIME_BALANCE_RECENT_EVENT_LIMIT_V2;
    index -= 1) {
    requiredEventIds.add(events[index]!.eventId);
  }
  return Object.freeze(
    events.filter(({ eventId }) => requiredEventIds.has(eventId)),
  );
}

function approvedBalance(
  state: GameStateV2,
  balance: RuntimeBalanceStateV2,
  candidate: RuntimeBalanceCandidateV2,
  eventId: string,
  impact: PersonalEventImpactEstimateV2,
  pressureCostUnits: number,
  developmentRejections: RuntimeBalanceStateV2["developmentLastRejections"],
): RuntimeBalanceStateV2 {
  const { template } = candidate;
  const {
    developmentLastRejections: _priorDevelopmentRejections,
    ...persistentBalance
  } = balance;
  void _priorDevelopmentRejections;
  const policy = runtimeBalanceDifficultyPolicyV2(balance.difficulty);
  const tags = allLessonTags(template);
  const currentTags = new Set(tags);
  const retainedPriorCounts = balance.lessonExposureCounts
    .filter(({ lessonTag }) => !currentTags.has(lessonTag))
    .toSorted((left, right) => left.lessonTag.localeCompare(right.lessonTag))
    .slice(0, Math.max(0, RUNTIME_BALANCE_LESSON_LIMIT_V2 - currentTags.size));
  const counts = new Map(
    retainedPriorCounts.map(({ lessonTag, count }) => [lessonTag, count]),
  );
  for (const tag of tags) {
    const priorCount = balance.lessonExposureCounts.find(
      ({ lessonTag }) => lessonTag === tag,
    )?.count ?? 0;
    counts.set(tag, priorCount + 1);
  }
  const recentEvents = boundedRecentEvents([
    ...balance.recentEvents,
    {
      eventId,
      templateId: template.id,
      templateVersion: template.version,
      category: template.category,
      lessonTags: tags,
      tier: template.severityTier,
      targetedWeakness: candidate.targetedWeakness,
      approvedMonth: state.currentMonth,
    },
  ]);
  const recovery = template.severityTier === "large" ||
      template.severityTier === "catastrophe"
      ? {
        sourceEventId: eventId,
        sourceTier: template.severityTier,
        targetedWeakness: candidate.targetedWeakness,
        remainingMonths: Math.max(
          template.recovery.durationMonths,
          policy.recoveryDurationMonths[template.severityTier],
        ),
      }
    : balance.recovery;
  return Object.freeze({
    ...persistentBalance,
    pressureUnits: balance.pressureUnits - pressureCostUnits,
    monthsSinceAnyEvent: 0,
    monthsSinceMediumEvent:
      template.severityTier === "medium" ? 0 : balance.monthsSinceMediumEvent,
    monthsSinceLargeEvent:
      template.severityTier === "large" ? 0 : balance.monthsSinceLargeEvent,
    monthsSinceCatastrophicEvent:
      template.severityTier === "catastrophe"
        ? 0
        : balance.monthsSinceCatastrophicEvent,
    catastropheCount: balance.catastropheCount +
      (template.severityTier === "catastrophe" ? 1 : 0),
    recovery,
    recentEvents: Object.freeze(recentEvents),
    lessonExposureCounts: Object.freeze(
      [...counts.entries()]
        .map(([lessonTag, count]) => Object.freeze({ lessonTag, count }))
        .toSorted((left, right) => left.lessonTag.localeCompare(right.lessonTag)),
    ),
    lastApprovedImpactScorePpm: impact.impactScorePpm,
    ...(developmentRejections === undefined
      ? {}
      : { developmentLastRejections: developmentRejections }),
  });
}

export function chooseBalancedEventV2(
  state: GameStateV2,
  rankedCandidates: readonly RuntimeBalanceCandidateV2[],
  random: RandomState,
  liquidationCostRatePpm: RatePpm,
  options: RuntimeBalanceChoiceOptionsV2,
): RuntimeBalanceChoiceV2 {
  const balance = state.gameplay.runtimeBalance as unknown as RuntimeBalanceStateV2;
  if (balance?.version !== 2) {
    throw new RangeError("Runtime Balance controller requires state version 2");
  }
  const policy = runtimeBalanceDifficultyPolicyV2(balance.difficulty);
  const eventCatalog = options.eventCatalog;
  const estimateImpact = options.estimateImpact ?? estimatePersonalEventImpactV2;
  if (
    (options.scenarioDirectorDecision === undefined) !==
    (options.scenarioDirectorInput === undefined)
  ) {
    throw new RangeError(
      "Scenario Director input and decision must be supplied together",
    );
  }
  const directorOrderedCandidates =
    options.scenarioDirectorDecision === undefined ||
    options.scenarioDirectorInput === undefined
      ? rankedCandidates
      : directorOrderedCandidatesV2(
          state,
          balance,
          rankedCandidates,
          options.scenarioDirectorInput,
          options.scenarioDirectorDecision,
          eventCatalog,
        );
  const scored = scoreRuntimeBalanceCandidatesV2(
    balance,
    directorOrderedCandidates,
    options.scenarioDirectorDecision !== undefined,
  );
  const scenarioDirector = scenarioDirectorEvidenceV2(
    options.scenarioDirectorDecision,
  );
  const evidence: Array<{
    templateId: string;
    templateVersion: number;
    rank: number;
    adjustedRank: number;
    repetitionPenalty: number;
    lessonCoverageBonus: number;
    evaluated: boolean;
    rejectionCodes: RuntimeBalanceRejectionCodeV2[];
    warningCodes: RuntimeBalanceWarningCodeV2[];
    parameters?: Readonly<Record<string, number>>;
    impactScorePpm?: number;
    impact?: RuntimeBalanceCandidateImpactSummaryV2;
  }> = scored.map(({ candidate, ...score }) => ({
    templateId: candidate.template.id,
    templateVersion: candidate.template.version,
    ...score,
    evaluated: false,
    rejectionCodes: [],
    warningCodes: [],
  }));
  let cursor = random;
  let evaluatedCandidateCount = 0;
  for (const [index, scoredCandidate] of scored.entries()) {
    const { candidate } = scoredCandidate;
    const item = evidence[index]!;
    item.evaluated = true;
    evaluatedCandidateCount += 1;
    item.rejectionCodes.push(
      ...assessCandidatePacingV2(state, balance, candidate, eventCatalog),
    );
    if (item.rejectionCodes.length > 0) continue;
    const sampled = options.parameterSampler === undefined
      ? sampleParameters(candidate.template, cursor)
      : Object.freeze({
          parameters: Object.freeze({
            ...options.parameterSampler(candidate.template),
          }),
          nextRandom: cursor,
        });
    cursor = sampled.nextRandom;
    item.parameters = sampled.parameters;
    let impact: PersonalEventImpactEstimateV2;
    try {
      impact = estimateImpact(
        state,
        candidate.template,
        sampled.parameters,
        liquidationCostRatePpm,
        options.monthlyCashFlowEvidence,
      );
    } catch (error) {
      if (error instanceof RuntimeBalanceImpactV2Error) {
        item.rejectionCodes.push(
          error.code === "PARAMETER_OUT_OF_BOUNDS"
            ? "parameter_out_of_bounds"
            : error.code === "NO_AVAILABLE_RESPONSE"
              ? "no_reasonable_response"
              : "estimator_error",
        );
        continue;
      }
      if (
        error instanceof PersonalEventEffectV2Error ||
        error instanceof ObligationFundingV2Error ||
        error instanceof NumericDomainError
      ) {
        item.rejectionCodes.push("estimator_error");
        continue;
      }
      throw error;
    }
    item.impactScorePpm = impact.impactScorePpm;
    item.impact = compactImpact(impact);
    const impactBand = assessRuntimeBalanceImpactV2(balance.difficulty, impact);
    item.warningCodes.push(...impactBand.warningCodes);
    item.rejectionCodes.push(...impactBand.rejectionCodes);
    if (isHumorousRootCandidateV2(candidate)) {
      const guidedChallenge = assessRuntimeBalanceChallengeV1(
        impact,
        runtimeBalanceDifficultyPolicyV2("guided"),
      );
      if (["crisis", "extreme", "above_limit"].includes(guidedChallenge.band)) {
        item.rejectionCodes.push("FUNNY_ROOT_ABOVE_MEANINGFUL");
      }
    }
    if (
      policy.rejectImmediateUnavoidableFailure &&
      (impact.immediateBankruptcyRisk || impact.reasonableResponseIds.length === 0)
    ) item.rejectionCodes.push("unavoidable_failure");
    const preferredChallengeBands = options.preferredChallengeBands;
    const challengeBand = assessRuntimeBalanceChallengeV1(impact, policy).band;
    if (
      item.rejectionCodes.length === 0 &&
      preferredChallengeBands !== undefined &&
      !preferredChallengeBands.some((preferred) => preferred === challengeBand)
    ) item.rejectionCodes.push("cadence_challenge_below_target");
    if (item.rejectionCodes.length > 0) continue;
    const eventId = candidate.followUpSourceEventId === undefined
      ? `evt.${state.currentMonth}.${candidate.template.id}.v${candidate.template.version}`
      : `evt.followup.${state.currentMonth}.${candidate.followUpSourceEventId}.${candidate.template.id}.v${candidate.template.version}`;
    const pressureCostUnits = effectivePressureCost(candidate.template, policy);
    const developmentRejections = options.developmentMode
      ? Object.freeze(
          evidence
            .flatMap(({ templateId, rejectionCodes }) =>
              rejectionCodes.map((code) => Object.freeze({ templateId, code })),
            )
            .slice(-RUNTIME_BALANCE_REJECTION_LIMIT_V2),
        )
      : undefined;
    const nextBalance = approvedBalance(
      state,
      balance,
      candidate,
      eventId,
      impact,
      pressureCostUnits,
      developmentRejections,
    );
    const event = Object.freeze({
      proposal: Object.freeze({
        eventId,
        templateId: candidate.template.id,
        templateVersion: candidate.template.version,
        parameters: sampled.parameters,
      }),
      template: candidate.template,
      targetedWeakness: UNRELATED_HAZARD_TARGET,
      ...(candidate.followUpSourceEventId === undefined
        ? {}
        : { followUpSourceEventId: candidate.followUpSourceEventId }),
    });
    const frozenEvidence = Object.freeze(
      evidence.map((candidateEvidence) =>
        Object.freeze({
          ...candidateEvidence,
          rejectionCodes: Object.freeze([...candidateEvidence.rejectionCodes]),
          warningCodes: Object.freeze([...candidateEvidence.warningCodes]),
        }),
      ),
    );
    const decision = Object.freeze({
      version: "runtime-balance-decision-v1" as const,
      controllerVersion: RUNTIME_BALANCE_CONTROLLER_V1_VERSION,
      policyVersion: RUNTIME_BALANCE_POLICY_V1_VERSION,
      impactEstimatorVersion: RUNTIME_BALANCE_IMPACT_ESTIMATOR_V1_VERSION,
      difficulty: balance.difficulty,
      candidateLimit: RUNTIME_BALANCE_CANDIDATE_LIMIT_V2,
      warningStrength: policy.warningStrength,
      impactBands: Object.freeze({
        maximumImpactScorePpm: policy.maximumImpactScorePpm,
        maximumBurnMonthsPpm: policy.maximumBurnMonthsPpm,
        maximumNegativeCashFlowDurationMonths:
          policy.maximumNegativeCashFlowDurationMonths,
        maximumRecoveryTimeMonths: policy.maximumRecoveryTimeMonths,
      }),
      month: state.currentMonth,
      status: "approved" as const,
      pressureBeforeUnits: balance.pressureUnits,
      pressureAfterUnits: nextBalance.pressureUnits,
      evaluatedCandidateCount,
      candidates: frozenEvidence,
      ...(scenarioDirector === undefined ? {} : { scenarioDirector }),
      approved: Object.freeze({
        eventId,
        templateId: candidate.template.id,
        templateVersion: candidate.template.version,
        parameters: sampled.parameters,
        impact,
        pressureCostUnits,
        warningCodes: Object.freeze([...item.warningCodes]),
      }),
    });
    return Object.freeze({
      event,
      nextRandom: cursor,
      runtimeBalance: nextBalance,
      decision,
    });
  }
  const nextBalanceBase = regenerateRuntimeBalancePressureV2(balance);
  const {
    developmentLastRejections: _priorDevelopmentRejections,
    ...persistentNextBalanceBase
  } = nextBalanceBase;
  void _priorDevelopmentRejections;
  const developmentRejections = options.developmentMode
    ? Object.freeze(
        evidence.flatMap(({ templateId, rejectionCodes }) =>
          rejectionCodes.map((code) => Object.freeze({ templateId, code })),
        ).slice(-RUNTIME_BALANCE_REJECTION_LIMIT_V2),
      )
    : undefined;
  const nextBalance = Object.freeze({
    ...persistentNextBalanceBase,
    ...(developmentRejections === undefined
      ? {}
      : { developmentLastRejections: developmentRejections }),
  });
  const frozenEvidence = Object.freeze(
    evidence.map((candidateEvidence) =>
      Object.freeze({
        ...candidateEvidence,
        rejectionCodes: Object.freeze([...candidateEvidence.rejectionCodes]),
        warningCodes: Object.freeze([...candidateEvidence.warningCodes]),
      }),
    ),
  );
  return Object.freeze({
    event: null,
    nextRandom: cursor,
    runtimeBalance: nextBalance,
    decision: Object.freeze({
      version: "runtime-balance-decision-v1" as const,
      controllerVersion: RUNTIME_BALANCE_CONTROLLER_V1_VERSION,
      policyVersion: RUNTIME_BALANCE_POLICY_V1_VERSION,
      impactEstimatorVersion: RUNTIME_BALANCE_IMPACT_ESTIMATOR_V1_VERSION,
      difficulty: balance.difficulty,
      candidateLimit: RUNTIME_BALANCE_CANDIDATE_LIMIT_V2,
      warningStrength: policy.warningStrength,
      impactBands: Object.freeze({
        maximumImpactScorePpm: policy.maximumImpactScorePpm,
        maximumBurnMonthsPpm: policy.maximumBurnMonthsPpm,
        maximumNegativeCashFlowDurationMonths:
          policy.maximumNegativeCashFlowDurationMonths,
        maximumRecoveryTimeMonths: policy.maximumRecoveryTimeMonths,
      }),
      month: state.currentMonth,
      status: "none" as const,
      nullReason: scored.length === 0 ? "no_candidates" as const : "all_rejected" as const,
      pressureBeforeUnits: balance.pressureUnits,
      pressureAfterUnits: nextBalance.pressureUnits,
      evaluatedCandidateCount,
      candidates: frozenEvidence,
      ...(scenarioDirector === undefined ? {} : { scenarioDirector }),
    }),
  });
}
