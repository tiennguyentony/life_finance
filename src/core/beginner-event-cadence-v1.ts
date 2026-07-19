import {
  PERSONAL_EVENT_PRESENTATIONS_V1,
  type PersonalEventPresentationToneV1,
  type PersonalEventPresentationV1,
} from "../data/personal-event-presentation-v1";
import { addMonths, compareMonths, monthsBetween } from "./domain/month";
import type { GameStateV2, ResolvedEventEvidenceV2 } from "./game-state-v2";
import type { DeclarativePersonalEventCandidateV2 } from "./personal-event-v2";

export const BEGINNER_EVENT_CADENCE_V1_VERSION =
  "beginner-event-cadence-v1" as const;

export const ACTIVE_BEGINNER_EVENT_CADENCE_VERSION:
  typeof BEGINNER_EVENT_CADENCE_V1_VERSION | null = null;

export type BeginnerEventCadenceModeV1 =
  | "inactive"
  | "pending_or_terminal"
  | "follow_up_due"
  | "positive_due"
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

export function applyBeginnerEventCadenceV1(
  assessment: BeginnerEventCadenceAssessmentV1,
  candidates: readonly DeclarativePersonalEventCandidateV2[],
  presentations: readonly PersonalEventPresentationV1[] =
    PERSONAL_EVENT_PRESENTATIONS_V1,
): Readonly<{
  candidates: readonly DeclarativePersonalEventCandidateV2[];
  preferredCandidateIds: readonly string[];
}> {
  const lookup = presentationLookup(presentations);
  const withoutAdjacentAbsurd = candidates.filter((candidate) => {
    const presentation = presentationForCandidate(candidate, lookup);
    return assessment.previousRootTone !== "absurd_comedy" ||
      isFollowUpCandidate(candidate, lookup) ||
      presentation?.tone !== "absurd_comedy";
  });
  let filtered: readonly DeclarativePersonalEventCandidateV2[];
  let preferred: readonly DeclarativePersonalEventCandidateV2[] = [];

  switch (assessment.mode) {
    case "inactive":
    case "pending_or_terminal":
      filtered = [];
      break;
    case "follow_up_due":
      filtered = withoutAdjacentAbsurd.filter((candidate) =>
        isFollowUpCandidate(candidate, lookup)
      );
      preferred = filtered;
      break;
    case "recovery_preferred":
      filtered = withoutAdjacentAbsurd.filter((candidate) =>
        isFollowUpCandidate(candidate, lookup)
      );
      break;
    case "positive_due": {
      const positive = withoutAdjacentAbsurd.filter(
        ({ template }) => template.classification === "positive",
      );
      filtered = positive.length > 0 ? positive : withoutAdjacentAbsurd;
      preferred = positive;
      break;
    }
    case "engagement_due": {
      const engaging = withoutAdjacentAbsurd.filter((candidate) => {
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
