import {
  compareMonths,
  monthsBetween,
  simulationMonth,
  type SimulationMonth,
} from "./domain/month";
import type { EventTargetV2, EventTier } from "./events";
import type { PersonalEventCategoryV2 } from "./personal-event-v2";
import {
  RUNTIME_BALANCE_RECENT_EVENT_LIMIT_V2,
  RUNTIME_BALANCE_EVENT_LESSON_LIMIT_V2,
  RUNTIME_BALANCE_LESSON_LIMIT_V2,
  RUNTIME_BALANCE_REJECTION_LIMIT_V2,
  runtimeBalanceDifficultyPolicyV2,
  type RuntimeBalanceDifficultyV2,
} from "./runtime-balance-policy-v2";
import type { RuntimeBalanceStateV1 } from "./runtime-balance-state-v1";

type BalanceEventTierV2 = Exclude<EventTier, "ambient">;

export type RuntimeBalanceRecentEventV2 = Readonly<{
  eventId: string;
  templateId: string;
  templateVersion: number;
  category: PersonalEventCategoryV2;
  lessonTags: readonly string[];
  tier: BalanceEventTierV2;
  targetedWeakness: EventTargetV2;
  approvedMonth: SimulationMonth;
}>;

export type RuntimeBalanceRejectionCodeV2 =
  | "ineligible"
  | "insufficient_pressure"
  | "event_cooldown"
  | "category_cooldown"
  | "lesson_cooldown"
  | "tier_cooldown"
  | "recovery_block"
  | "recovery_retarget"
  | "catastrophe_limit"
  | "parameter_out_of_bounds"
  | "impact_above_band"
  | "unavoidable_failure"
  | "no_reasonable_response"
  | "estimator_error";

export type RuntimeBalanceRejectionV2 = Readonly<{
  templateId: string;
  code: RuntimeBalanceRejectionCodeV2;
}>;

export type RuntimeBalanceStateV2 = Readonly<{
  version: 2;
  difficulty: RuntimeBalanceDifficultyV2;
  pressureUnits: number;
  maximumPressureUnits: number;
  monthlyPressureRegenerationUnits: number;
  monthsSinceAnyEvent: number | null;
  monthsSinceMediumEvent: number | null;
  monthsSinceLargeEvent: number | null;
  monthsSinceCatastrophicEvent: number | null;
  catastropheCount: number;
  legacyCarryover?: Readonly<{
    lastApprovedEventMonth: SimulationMonth | null;
    catastropheCount: number;
  }>;
  recovery: Readonly<{
    sourceEventId: string;
    sourceTier: "large" | "catastrophe";
    targetedWeakness: EventTargetV2;
    remainingMonths: number;
  }> | null;
  recentEvents: readonly RuntimeBalanceRecentEventV2[];
  lessonExposureCounts: readonly Readonly<{
    lessonTag: string;
    count: number;
  }>[];
  recentNegativeCashFlowMonths: number;
  lastApprovedImpactScorePpm: number | null;
  developmentLastRejections?: readonly RuntimeBalanceRejectionV2[];
}>;

export type RuntimeBalanceStateV2Violation = Readonly<{
  path: string;
  code: string;
  message: string;
}>;

const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const CATEGORIES = new Set<string>([
  "maintenance",
  "health",
  "housing",
  "career",
  "caregiving",
  "social",
  "behavioral_trap",
  "opportunity",
]);
const TIERS = new Set<string>(["micro", "medium", "large", "catastrophe"]);
const TARGETS = new Set<string>([
  "unrelated_hazard",
  "low_emergency_fund",
  "high_credit_utilization",
  "job_portfolio_correlation",
  "portfolio_concentration",
  "uninsured_property",
  "high_fixed_costs",
  "lifestyle_fragility",
  "market_timing",
]);
const REJECTION_CODES = new Set<string>([
  "ineligible",
  "insufficient_pressure",
  "event_cooldown",
  "category_cooldown",
  "lesson_cooldown",
  "tier_cooldown",
  "recovery_block",
  "recovery_retarget",
  "catastrophe_limit",
  "parameter_out_of_bounds",
  "impact_above_band",
  "unavoidable_failure",
  "no_reasonable_response",
  "estimator_error",
]);

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function violation(
  path: string,
  code: string,
  message: string,
): RuntimeBalanceStateV2Violation {
  return { path, code, message };
}

function validCounter(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function incrementNullable(value: number | null): number | null {
  return value === null ? null : value + 1;
}

export function createInitialRuntimeBalanceStateV2(
  difficulty: RuntimeBalanceDifficultyV2,
): RuntimeBalanceStateV2 {
  const policy = runtimeBalanceDifficultyPolicyV2(difficulty);
  return deepFreeze({
    version: 2,
    difficulty,
    pressureUnits: policy.initialPressureUnits,
    maximumPressureUnits: policy.maximumPressureUnits,
    monthlyPressureRegenerationUnits:
      policy.monthlyPressureRegenerationUnits,
    monthsSinceAnyEvent: null,
    monthsSinceMediumEvent: null,
    monthsSinceLargeEvent: null,
    monthsSinceCatastrophicEvent: null,
    catastropheCount: 0,
    recovery: null,
    recentEvents: [],
    lessonExposureCounts: [],
    recentNegativeCashFlowMonths: 0,
    lastApprovedImpactScorePpm: null,
  }) as RuntimeBalanceStateV2;
}

export function runtimeBalanceStateV2(
  stored: RuntimeBalanceStateV1 | RuntimeBalanceStateV2 | undefined,
  difficulty: RuntimeBalanceDifficultyV2,
  currentMonth: SimulationMonth,
): RuntimeBalanceStateV2 {
  if (stored?.version === 2) return stored;
  const initial = createInitialRuntimeBalanceStateV2(difficulty);
  if (!stored) return initial;
  const elapsed = stored.lastApprovedEventMonth === null
    ? null
    : Math.max(0, monthsBetween(stored.lastApprovedEventMonth, currentMonth));
  const remainingRecovery = stored.recoveryUntilMonth === null
    ? 0
    : Math.max(0, monthsBetween(currentMonth, stored.recoveryUntilMonth));
  const hasLegacyCarryover = stored.lastApprovedEventMonth !== null ||
    stored.catastropheCount > 0;
  return deepFreeze({
    ...initial,
    pressureUnits: Math.round(
      (stored.pressurePpm * initial.maximumPressureUnits) / 1_000_000,
    ),
    monthsSinceAnyEvent: elapsed,
    catastropheCount: stored.catastropheCount,
    ...(hasLegacyCarryover
      ? {
          legacyCarryover: {
            lastApprovedEventMonth: stored.lastApprovedEventMonth,
            catastropheCount: stored.catastropheCount,
          },
        }
      : {}),
    recovery: remainingRecovery > 0
      ? {
          sourceEventId: "legacy.runtime-balance-v1",
          sourceTier: "large",
          targetedWeakness: "unrelated_hazard",
          remainingMonths: remainingRecovery,
        }
      : null,
  }) as RuntimeBalanceStateV2;
}

export function advanceRuntimeBalanceMonthV2(
  state: RuntimeBalanceStateV2,
  negativeCashFlow: boolean,
): RuntimeBalanceStateV2 {
  return recordRuntimeBalanceCashFlowV2(
    advanceRuntimeBalanceCalendarMonthV2(state),
    negativeCashFlow,
  );
}

export function advanceRuntimeBalanceCalendarMonthV2(
  state: RuntimeBalanceStateV2,
): RuntimeBalanceStateV2 {
  return deepFreeze({
    ...state,
    monthsSinceAnyEvent: incrementNullable(state.monthsSinceAnyEvent),
    monthsSinceMediumEvent: incrementNullable(state.monthsSinceMediumEvent),
    monthsSinceLargeEvent: incrementNullable(state.monthsSinceLargeEvent),
    monthsSinceCatastrophicEvent: incrementNullable(
      state.monthsSinceCatastrophicEvent,
    ),
    recovery:
      state.recovery === null || state.recovery.remainingMonths <= 1
        ? null
        : { ...state.recovery, remainingMonths: state.recovery.remainingMonths - 1 },
  }) as RuntimeBalanceStateV2;
}

export function recordRuntimeBalanceCashFlowV2(
  state: RuntimeBalanceStateV2,
  negativeCashFlow: boolean,
): RuntimeBalanceStateV2 {
  return deepFreeze({
    ...state,
    recentNegativeCashFlowMonths: negativeCashFlow
      ? state.recentNegativeCashFlowMonths + 1
      : 0,
  }) as RuntimeBalanceStateV2;
}

export function regenerateRuntimeBalancePressureV2(
  state: RuntimeBalanceStateV2,
): RuntimeBalanceStateV2 {
  return deepFreeze({
    ...state,
    pressureUnits: Math.min(
      state.maximumPressureUnits,
      state.pressureUnits + state.monthlyPressureRegenerationUnits,
    ),
  }) as RuntimeBalanceStateV2;
}

export function validateRuntimeBalanceStateV2(
  state: RuntimeBalanceStateV2,
): readonly RuntimeBalanceStateV2Violation[] {
  if (state === null || typeof state !== "object" || Array.isArray(state)) {
    return [violation("", "invalid_runtime_balance_state", "must be a structured object")];
  }
  const violations: RuntimeBalanceStateV2Violation[] = [];
  if (state.version !== 2) {
    violations.push(violation("version", "unsupported_version", "must be version 2"));
  }
  const policy = ["guided", "normal", "hard"].includes(state.difficulty)
    ? runtimeBalanceDifficultyPolicyV2(state.difficulty)
    : null;
  if (policy === null) {
    violations.push(violation("difficulty", "invalid_difficulty", "must be supported"));
  } else {
    if (
      state.maximumPressureUnits !== policy.maximumPressureUnits ||
      state.monthlyPressureRegenerationUnits !==
        policy.monthlyPressureRegenerationUnits
    ) {
      violations.push(
        violation(
          "maximumPressureUnits",
          "profile_mismatch",
          "stored pressure limits must match the versioned difficulty profile",
        ),
      );
    }
  }
  if (
    !validCounter(state.pressureUnits) ||
    state.pressureUnits > state.maximumPressureUnits
  ) {
    violations.push(
      violation(
        "pressureUnits",
        "pressure_out_of_bounds",
        "must be within the stored pressure budget",
      ),
    );
  }
  if (!validCounter(state.maximumPressureUnits) || state.maximumPressureUnits === 0) {
    violations.push(violation("maximumPressureUnits", "invalid_count", "must be positive"));
  }
  if (
    !validCounter(state.monthlyPressureRegenerationUnits) ||
    state.monthlyPressureRegenerationUnits === 0
  ) {
    violations.push(
      violation("monthlyPressureRegenerationUnits", "invalid_count", "must be positive"),
    );
  }
  const counters: readonly [keyof RuntimeBalanceStateV2, unknown][] = [
    ["monthsSinceAnyEvent", state.monthsSinceAnyEvent],
    ["monthsSinceMediumEvent", state.monthsSinceMediumEvent],
    ["monthsSinceLargeEvent", state.monthsSinceLargeEvent],
    ["monthsSinceCatastrophicEvent", state.monthsSinceCatastrophicEvent],
    ["catastropheCount", state.catastropheCount],
    ["recentNegativeCashFlowMonths", state.recentNegativeCashFlowMonths],
  ];
  for (const [path, value] of counters) {
    if (value !== null && !validCounter(value)) {
      violations.push(violation(path, "invalid_count", "must be null or non-negative"));
    }
  }
  if (policy !== null && state.catastropheCount > policy.maximumCatastrophes) {
    violations.push(
      violation(
        "catastropheCount",
        "catastrophe_limit_exceeded",
        "must not exceed the selected difficulty limit",
      ),
    );
  }
  if (state.legacyCarryover !== undefined) {
    if (
      state.legacyCarryover === null ||
      typeof state.legacyCarryover !== "object" ||
      Array.isArray(state.legacyCarryover)
    ) {
      violations.push(
        violation("legacyCarryover", "invalid_legacy_carryover", "must be structured"),
      );
    } else {
      if (!validCounter(state.legacyCarryover.catastropheCount)) {
        violations.push(
          violation(
            "legacyCarryover.catastropheCount",
            "invalid_count",
            "must be non-negative",
          ),
        );
      }
      if (state.legacyCarryover.lastApprovedEventMonth !== null) {
        try {
          simulationMonth(state.legacyCarryover.lastApprovedEventMonth);
        } catch {
          violations.push(
            violation(
              "legacyCarryover.lastApprovedEventMonth",
              "invalid_month",
              "must be null or YYYY-MM",
            ),
          );
        }
      }
    }
  }
  if (
    state.lastApprovedImpactScorePpm !== null &&
    (!validCounter(state.lastApprovedImpactScorePpm) ||
      state.lastApprovedImpactScorePpm > 1_000_000)
  ) {
    violations.push(
      violation(
        "lastApprovedImpactScorePpm",
        "rate_out_of_bounds",
        "must be null or bounded PPM",
      ),
    );
  }
  if (state.recovery !== null) {
    if (
      state.recovery === undefined ||
      typeof state.recovery !== "object" ||
      Array.isArray(state.recovery)
    ) {
      violations.push(
        violation("recovery", "invalid_recovery", "must be null or a structured recovery window"),
      );
    } else {
    if (!IDENTIFIER.test(state.recovery.sourceEventId)) {
      violations.push(
        violation("recovery.sourceEventId", "invalid_identifier", "must be canonical"),
      );
    }
    if (!new Set(["large", "catastrophe"]).has(state.recovery.sourceTier)) {
      violations.push(
        violation("recovery.sourceTier", "invalid_recovery_tier", "must be large or catastrophe"),
      );
    }
    if (!TARGETS.has(state.recovery.targetedWeakness)) {
      violations.push(
        violation("recovery.targetedWeakness", "invalid_target", "must be a known target"),
      );
    }
    if (!validCounter(state.recovery.remainingMonths) || state.recovery.remainingMonths === 0) {
      violations.push(
        violation("recovery.remainingMonths", "invalid_count", "must be positive"),
      );
    }
    }
  }
  if (!Array.isArray(state.recentEvents) || state.recentEvents.length > RUNTIME_BALANCE_RECENT_EVENT_LIMIT_V2) {
    violations.push(violation("recentEvents", "invalid_collection", "must be a bounded array"));
  } else {
    const eventIds = new Set<string>();
    let previousEvent: RuntimeBalanceRecentEventV2 | null = null;
    state.recentEvents.forEach((event, index) => {
      const prefix = `recentEvents.${index}`;
      if (event === null || typeof event !== "object" || Array.isArray(event)) {
        violations.push(violation(prefix, "invalid_entry", "must be a structured recent event"));
        return;
      }
      if (!IDENTIFIER.test(event.eventId) || eventIds.has(event.eventId)) {
        violations.push(violation(`${prefix}.eventId`, "duplicate_value", "must be unique"));
      }
      eventIds.add(event.eventId);
      if (!IDENTIFIER.test(event.templateId)) {
        violations.push(violation(`${prefix}.templateId`, "invalid_identifier", "must be canonical"));
      }
      if (!Number.isSafeInteger(event.templateVersion) || event.templateVersion < 1) {
        violations.push(
          violation(`${prefix}.templateVersion`, "invalid_version", "must be positive"),
        );
      }
      if (!CATEGORIES.has(event.category)) {
        violations.push(violation(`${prefix}.category`, "invalid_category", "must be known"));
      }
      if (!TIERS.has(event.tier)) {
        violations.push(violation(`${prefix}.tier`, "invalid_tier", "must be known"));
      }
      if (!TARGETS.has(event.targetedWeakness)) {
        violations.push(violation(`${prefix}.targetedWeakness`, "invalid_target", "must be known"));
      }
      let approvedMonthIsValid = false;
      try {
        simulationMonth(event.approvedMonth);
        approvedMonthIsValid = true;
        if (
          previousEvent !== null &&
          (compareMonths(event.approvedMonth, previousEvent.approvedMonth) < 0 ||
            (event.approvedMonth === previousEvent.approvedMonth &&
              event.eventId.localeCompare(previousEvent.eventId) <= 0))
        ) {
          violations.push(
            violation(`${prefix}.approvedMonth`, "invalid_order", "must be canonically ordered"),
          );
        }
      } catch {
        violations.push(violation(`${prefix}.approvedMonth`, "invalid_month", "must be YYYY-MM"));
      }
      if (
        !Array.isArray(event.lessonTags) ||
        event.lessonTags.length > RUNTIME_BALANCE_EVENT_LESSON_LIMIT_V2 ||
        new Set(event.lessonTags).size !== event.lessonTags.length
      ) {
        violations.push(violation(`${prefix}.lessonTags`, "duplicate_value", "must be unique"));
      }
      if (
        Array.isArray(event.lessonTags) &&
        event.lessonTags.some(
          (lessonTag: unknown) =>
            typeof lessonTag !== "string" || !IDENTIFIER.test(lessonTag),
        )
      ) {
        violations.push(
          violation(`${prefix}.lessonTags`, "invalid_identifier", "must contain canonical IDs"),
        );
      }
      if (approvedMonthIsValid) previousEvent = event;
    });
  }
  if (
    !Array.isArray(state.lessonExposureCounts) ||
    state.lessonExposureCounts.length > RUNTIME_BALANCE_LESSON_LIMIT_V2
  ) {
    violations.push(violation("lessonExposureCounts", "invalid_collection", "must be an array"));
  }
  if (Array.isArray(state.lessonExposureCounts)) {
    const lessons = new Set<string>();
    let previousLessonTag: string | null = null;
    state.lessonExposureCounts.forEach((entry, index) => {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        violations.push(
          violation(`lessonExposureCounts.${index}`, "invalid_entry", "must be a structured lesson count"),
        );
        return;
      }
      if (lessons.has(entry.lessonTag)) {
        violations.push(
          violation(`lessonExposureCounts.${index}.lessonTag`, "duplicate_value", "must be unique"),
        );
      }
      lessons.add(entry.lessonTag);
      if (!IDENTIFIER.test(entry.lessonTag)) {
        violations.push(
          violation(`lessonExposureCounts.${index}.lessonTag`, "invalid_identifier", "must be canonical"),
        );
      }
      if (
        previousLessonTag !== null &&
        entry.lessonTag.localeCompare(previousLessonTag) <= 0
      ) {
        violations.push(
          violation(
            `lessonExposureCounts.${index}.lessonTag`,
            "invalid_order",
            "must be canonically ordered",
          ),
        );
      }
      if (!validCounter(entry.count)) {
        violations.push(
          violation(`lessonExposureCounts.${index}.count`, "invalid_count", "must be non-negative"),
        );
      }
      previousLessonTag = entry.lessonTag;
    });
  }
  if (state.developmentLastRejections !== undefined) {
    if (
      !Array.isArray(state.developmentLastRejections) ||
      state.developmentLastRejections.length > RUNTIME_BALANCE_REJECTION_LIMIT_V2
    ) {
      violations.push(
        violation("developmentLastRejections", "invalid_collection", "must be an array"),
      );
    }
    if (Array.isArray(state.developmentLastRejections)) {
      state.developmentLastRejections.forEach((entry, index) => {
        if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
          violations.push(
            violation(`developmentLastRejections.${index}`, "invalid_entry", "must be structured"),
          );
          return;
        }
        if (!IDENTIFIER.test(entry.templateId)) {
          violations.push(
            violation(`developmentLastRejections.${index}.templateId`, "invalid_identifier", "must be canonical"),
          );
        }
        if (!REJECTION_CODES.has(entry.code)) {
          violations.push(
            violation(`developmentLastRejections.${index}.code`, "invalid_rejection_code", "must be supported"),
          );
        }
      });
    }
  }
  return Object.freeze(violations);
}
