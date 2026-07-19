import {
  PERSONAL_EVENT_PRESENTATIONS_V1,
  type PersonalEventPresentationToneV1,
  type PersonalEventPresentationV1,
} from "../data/personal-event-presentation-v1";
import { addMonths, compareMonths, monthsBetween } from "./domain/month";
import { UNRELATED_HAZARD_TARGET } from "./events";
import type { GameStateV2, ResolvedEventEvidenceV2 } from "./game-state-v2";
import {
  personalEventEligibilityReasonsV2,
  personalEventHistoryAvailabilityReasonsV2,
  validatePersonalEventTemplateV2,
  type DeclarativePersonalEventCandidateV2,
  type PersonalEventTemplateV2,
} from "./personal-event-v2";

export const BEGINNER_EVENT_CADENCE_V1_VERSION =
  "beginner-event-cadence-v1" as const;

export const ACTIVE_BEGINNER_EVENT_CADENCE_VERSION:
  typeof BEGINNER_EVENT_CADENCE_V1_VERSION | null = null;

export type BeginnerEventCadenceModeV1 =
  | "inactive"
  | "pending_or_terminal"
  | "follow_up_due"
  | "positive_due"
  | "absurd_due"
  | "challenge_due"
  | "engagement_due"
  | "open"
  | "recovery_preferred";

export type BeginnerEventCadenceAssessmentV1 = Readonly<{
  version: typeof BEGINNER_EVENT_CADENCE_V1_VERSION;
  mode: BeginnerEventCadenceModeV1;
  chapterMonth: number;
  quietEligibleStreak: number;
  eventMonthStreak: number;
  rootEventStreak: number;
  positiveObserved: boolean;
  previousRootTone: PersonalEventPresentationToneV1 | null;
  reasonCodes: readonly string[];
}>;

export type BeginnerEventCadenceEvidenceV1 = Readonly<{
  assessment: BeginnerEventCadenceAssessmentV1;
  inputCandidateIds: readonly string[];
  outputCandidateIds: readonly string[];
  preferredCandidateIds: readonly string[];
  scheduledTemplateId: string | null;
  safetyOverride: boolean;
}>;

type PresentationLookup = ReadonlyMap<string, PersonalEventPresentationV1>;

function identity(templateId: string, templateVersion: number): string {
  return `${templateId}@${templateVersion}`;
}

function presentationLookup(
  presentations: readonly PersonalEventPresentationV1[],
): PresentationLookup {
  return new Map(
    presentations.map((presentation) => [
      identity(presentation.templateId, presentation.templateVersion),
      presentation,
    ]),
  );
}

function presentationForHistory(
  event: ResolvedEventEvidenceV2,
  lookup: PresentationLookup,
): PersonalEventPresentationV1 | undefined {
  return lookup.get(identity(event.templateId, event.templateVersion));
}

function isFollowUpHistory(
  event: ResolvedEventEvidenceV2,
  lookup: PresentationLookup,
): boolean {
  return event.followUpSourceEventId !== undefined ||
    presentationForHistory(event, lookup)?.cadenceRole === "follow_up";
}

function trailingMonthStreak(
  state: GameStateV2,
  months: ReadonlySet<string>,
): number {
  let cursor = months.has(state.currentMonth)
    ? state.currentMonth
    : addMonths(state.currentMonth, -1);
  let streak = 0;
  while (months.has(cursor)) {
    streak += 1;
    cursor = addMonths(cursor, -1);
  }
  return streak;
}

function latestRoot(
  history: readonly ResolvedEventEvidenceV2[],
  lookup: PresentationLookup,
): ResolvedEventEvidenceV2 | undefined {
  return history.reduce<ResolvedEventEvidenceV2 | undefined>((latest, event) => {
    if (isFollowUpHistory(event, lookup)) return latest;
    if (latest === undefined) return event;
    return compareMonths(event.scheduledMonth, latest.scheduledMonth) >= 0
      ? event
      : latest;
  }, undefined);
}

function quietEligibleStreak(
  state: GameStateV2,
  chapterMonth: number,
): number {
  const lastEvent = state.gameplay.eventLifecycle.history.reduce<
    ResolvedEventEvidenceV2 | undefined
  >((latest, event) => {
    if (latest === undefined) return event;
    return compareMonths(event.scheduledMonth, latest.scheduledMonth) >= 0
      ? event
      : latest;
  }, undefined);
  if (lastEvent === undefined) return Math.max(0, chapterMonth - 1);
  return Math.max(0, monthsBetween(lastEvent.scheduledMonth, state.currentMonth));
}

function frozenAssessment(
  input: Omit<BeginnerEventCadenceAssessmentV1, "version" | "reasonCodes"> &
    Readonly<{ reasonCodes: readonly string[] }>,
): BeginnerEventCadenceAssessmentV1 {
  return Object.freeze({
    version: BEGINNER_EVENT_CADENCE_V1_VERSION,
    ...input,
    reasonCodes: Object.freeze([...input.reasonCodes]),
  });
}

export function assessBeginnerEventCadenceV1(
  state: GameStateV2,
  presentations: readonly PersonalEventPresentationV1[] =
    PERSONAL_EVENT_PRESENTATIONS_V1,
): BeginnerEventCadenceAssessmentV1 {
  const lookup = presentationLookup(presentations);
  const chapterMonth = monthsBetween(state.startMonth, state.currentMonth) + 1;
  const history = state.gameplay.eventLifecycle.history;
  const eventMonths = new Set(history.map(({ scheduledMonth }) => scheduledMonth));
  const rootMonths = new Set(
    history
      .filter((event) => !isFollowUpHistory(event, lookup))
      .map(({ scheduledMonth }) => scheduledMonth),
  );
  const eventMonthStreak = trailingMonthStreak(state, eventMonths);
  const rootEventStreak = trailingMonthStreak(state, rootMonths);
  const positiveObserved = history.some(
    ({ classification }) => classification === "positive",
  );
  const absurdRootObserved = history.some(
    (event) =>
      !isFollowUpHistory(event, lookup) &&
      presentationForHistory(event, lookup)?.tone === "absurd_comedy",
  );
  const challengeRootCount = history.filter(
    (event) =>
      !isFollowUpHistory(event, lookup) &&
      presentationForHistory(event, lookup)?.cadenceRole === "challenge",
  ).length;
  const previousRoot = latestRoot(history, lookup);
  const previousRootTone = previousRoot === undefined
    ? null
    : presentationForHistory(previousRoot, lookup)?.tone ?? "serious";
  const quietStreak = quietEligibleStreak(state, chapterMonth);
  const base = {
    chapterMonth,
    quietEligibleStreak: quietStreak,
    eventMonthStreak,
    rootEventStreak,
    positiveObserved,
    previousRootTone,
  } as const;

  if (chapterMonth < 1 || chapterMonth > 12) {
    return frozenAssessment({
      ...base,
      mode: "inactive",
      reasonCodes: ["outside_beginner_chapter"],
    });
  }
  if (state.gameplay.eventLifecycle.pending !== null || state.outcome !== null) {
    return frozenAssessment({
      ...base,
      mode: "pending_or_terminal",
      reasonCodes: ["interaction_or_outcome_blocks_schedule"],
    });
  }
  const dueFollowUp = (state.gameplay.eventLifecycle.scheduledFollowUps ?? [])
    .some(({ eligibleMonth }) => compareMonths(eligibleMonth, state.currentMonth) <= 0);
  if (dueFollowUp) {
    return frozenAssessment({
      ...base,
      mode: "follow_up_due",
      reasonCodes: ["declared_follow_up_due"],
    });
  }
  if (eventMonthStreak >= 2) {
    return frozenAssessment({
      ...base,
      mode: "recovery_preferred",
      reasonCodes: ["two_consecutive_event_months"],
    });
  }
  if (chapterMonth >= 9 && !positiveObserved) {
    return frozenAssessment({
      ...base,
      mode: "positive_due",
      reasonCodes: ["positive_beat_missing_after_month_8"],
    });
  }
  const requiredChallengeRoots = Math.floor(chapterMonth / 3);
  if (challengeRootCount < requiredChallengeRoots) {
    return frozenAssessment({
      ...base,
      mode: "challenge_due",
      reasonCodes: ["financial_challenge_quota_due"],
    });
  }
  if (chapterMonth >= 7 && !absurdRootObserved) {
    return frozenAssessment({
      ...base,
      mode: "absurd_due",
      reasonCodes: ["absurd_comedy_beat_missing_after_month_6"],
    });
  }
  if (quietStreak >= 1) {
    return frozenAssessment({
      ...base,
      mode: "engagement_due",
      reasonCodes: ["one_or_more_quiet_eligible_months"],
    });
  }
  return frozenAssessment({
    ...base,
    mode: "open",
    reasonCodes: ["cadence_open"],
  });
}

function presentationForCandidate(
  candidate: DeclarativePersonalEventCandidateV2,
  lookup: PresentationLookup,
): PersonalEventPresentationV1 | undefined {
  return lookup.get(identity(candidate.template.id, candidate.template.version));
}

function isFollowUpCandidate(
  candidate: DeclarativePersonalEventCandidateV2,
  lookup: PresentationLookup,
): boolean {
  return candidate.followUpSourceEventId !== undefined ||
    presentationForCandidate(candidate, lookup)?.cadenceRole === "follow_up";
}

export function beginnerEventCadenceFallbackCandidatesV1(
  state: GameStateV2,
  activeCatalog: readonly PersonalEventTemplateV2[],
  exactCatalog: readonly PersonalEventTemplateV2[] = activeCatalog,
): readonly DeclarativePersonalEventCandidateV2[] {
  if (state.outcome !== null || state.gameplay.eventLifecycle.pending !== null) {
    return Object.freeze([]);
  }
  return Object.freeze(
    activeCatalog
      .filter((template) => validatePersonalEventTemplateV2(template).length === 0)
      .filter((template) => personalEventEligibilityReasonsV2(template, state).length === 0)
      .filter((template) =>
        personalEventHistoryAvailabilityReasonsV2(template, state, exactCatalog).length === 0
      )
      .toSorted(
        (left, right) =>
          left.id.localeCompare(right.id) || left.version - right.version,
      )
      .map((template) => Object.freeze({
        template,
        targetedWeakness: UNRELATED_HAZARD_TARGET,
      })),
  );
}

export function applyBeginnerEventCadenceV1(
  assessment: BeginnerEventCadenceAssessmentV1,
  candidates: readonly DeclarativePersonalEventCandidateV2[],
  presentations: readonly PersonalEventPresentationV1[] =
    PERSONAL_EVENT_PRESENTATIONS_V1,
  fallbackCandidates: readonly DeclarativePersonalEventCandidateV2[] = [],
): Readonly<{
  candidates: readonly DeclarativePersonalEventCandidateV2[];
  preferredCandidateIds: readonly string[];
}> {
  const lookup = presentationLookup(presentations);
  const filterAdjacentAbsurd = (
    source: readonly DeclarativePersonalEventCandidateV2[],
  ) => source.filter((candidate) => {
    const presentation = presentationForCandidate(candidate, lookup);
    return assessment.previousRootTone !== "absurd_comedy" ||
      isFollowUpCandidate(candidate, lookup) ||
      presentation?.tone !== "absurd_comedy";
  });
  const withoutAdjacentAbsurd = filterAdjacentAbsurd(candidates);
  const candidateIdentities = new Set(
    candidates.map(({ template }) => identity(template.id, template.version)),
  );
  const eligibleFallbacks = filterAdjacentAbsurd(fallbackCandidates).filter(
    ({ template }) => !candidateIdentities.has(identity(template.id, template.version)),
  );
  const dueCandidates = (
    predicate: (candidate: DeclarativePersonalEventCandidateV2) => boolean,
  ): readonly DeclarativePersonalEventCandidateV2[] => {
    const available = withoutAdjacentAbsurd.filter(predicate);
    return available.length > 0 ? available : eligibleFallbacks.filter(predicate);
  };
  let filtered: readonly DeclarativePersonalEventCandidateV2[];
  let preferred: readonly DeclarativePersonalEventCandidateV2[] = [];

  switch (assessment.mode) {
    case "inactive":
    case "pending_or_terminal":
      filtered = [];
      break;
    case "follow_up_due":
      preferred = withoutAdjacentAbsurd.filter((candidate) =>
        isFollowUpCandidate(candidate, lookup)
      );
      filtered = [
        ...preferred,
        ...eligibleFallbacks.filter((candidate) =>
          !isFollowUpCandidate(candidate, lookup)
        ),
      ];
      break;
    case "recovery_preferred":
      filtered = withoutAdjacentAbsurd.filter((candidate) =>
        isFollowUpCandidate(candidate, lookup)
      );
      break;
    case "positive_due": {
      const positive = dueCandidates(
        (candidate) =>
          !isFollowUpCandidate(candidate, lookup) &&
          candidate.template.classification === "positive",
      );
      filtered = positive.length > 0 ? positive : withoutAdjacentAbsurd;
      preferred = positive;
      break;
    }
    case "absurd_due": {
      const absurd = dueCandidates((candidate) => {
        const presentation = presentationForCandidate(candidate, lookup);
        return !isFollowUpCandidate(candidate, lookup) &&
          presentation?.tone === "absurd_comedy";
      });
      filtered = absurd.length > 0 ? absurd : withoutAdjacentAbsurd;
      preferred = absurd;
      break;
    }
    case "challenge_due": {
      const challenges = dueCandidates((candidate) => {
        const presentation = presentationForCandidate(candidate, lookup);
        return !isFollowUpCandidate(candidate, lookup) &&
          presentation?.cadenceRole === "challenge" &&
          candidate.template.severityTier !== "micro";
      });
      filtered = challenges.length > 0 ? challenges : withoutAdjacentAbsurd;
      preferred = challenges;
      break;
    }
    case "engagement_due": {
      const engaging = dueCandidates((candidate) => {
        const presentation = presentationForCandidate(candidate, lookup);
        return !isFollowUpCandidate(candidate, lookup) &&
          presentation?.cadenceRole === "engagement" &&
          presentation.tone !== "serious";
      });
      filtered = engaging.length > 0 ? engaging : withoutAdjacentAbsurd;
      preferred = engaging;
      break;
    }
    case "open":
      filtered = withoutAdjacentAbsurd;
      break;
  }

  return Object.freeze({
    candidates: Object.freeze([...filtered]),
    preferredCandidateIds: Object.freeze(
      preferred.map(({ template }) => template.id),
    ),
  });
}
