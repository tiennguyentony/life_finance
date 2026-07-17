import type { EventTier } from "./events";

export const RUNTIME_BALANCE_CONTROLLER_V1_VERSION =
  "runtime-balance-v1" as const;
export const RUNTIME_BALANCE_POLICY_V1_VERSION =
  "runtime-balance-policy-v1" as const;
export const RUNTIME_BALANCE_IMPACT_ESTIMATOR_V1_VERSION =
  "runtime-balance-impact-v1" as const;

export type RuntimeBalanceDifficultyV2 = "guided" | "normal" | "hard";

export type RuntimeBalanceDifficultyPolicyV2 = Readonly<{
  difficulty: RuntimeBalanceDifficultyV2;
  initialPressureUnits: number;
  maximumPressureUnits: number;
  monthlyPressureRegenerationUnits: number;
  minimumTierPressureCostUnits: Readonly<
    Record<Exclude<EventTier, "ambient">, number>
  >;
  tierCooldownMonths: Readonly<Record<Exclude<EventTier, "ambient">, number>>;
  minimumEventCooldownMonths: number;
  minimumCategoryCooldownMonths: number;
  minimumLessonCooldownMonths: number;
  recoveryDurationMonths: Readonly<Record<"large" | "catastrophe", number>>;
  maximumCatastrophes: number;
  maximumImpactScorePpm: number;
  maximumBurnMonthsPpm: number;
  maximumNegativeCashFlowDurationMonths: number;
  maximumRecoveryTimeMonths: number;
  warningStrength: "strong" | "standard" | "limited";
  rejectImmediateUnavoidableFailure: boolean;
  baseRankStep: number;
  repeatedEventPenalty: number;
  repeatedCategoryPenalty: number;
  repeatedLessonPenalty: number;
  underrepresentedLessonBonus: number;
}>;

export type RuntimeBalancePolicyViolationV2 = Readonly<{
  path: string;
  code: string;
  message: string;
}>;

const POLICIES: Readonly<
  Record<RuntimeBalanceDifficultyV2, RuntimeBalanceDifficultyPolicyV2>
> = Object.freeze({
  guided: Object.freeze({
    difficulty: "guided",
    initialPressureUnits: 4,
    maximumPressureUnits: 8,
    monthlyPressureRegenerationUnits: 2,
    minimumTierPressureCostUnits: Object.freeze({
      micro: 1,
      medium: 2,
      large: 4,
      catastrophe: 7,
    }),
    tierCooldownMonths: Object.freeze({
      micro: 0,
      medium: 3,
      large: 10,
      catastrophe: 24,
    }),
    minimumEventCooldownMonths: 2,
    minimumCategoryCooldownMonths: 1,
    minimumLessonCooldownMonths: 1,
    recoveryDurationMonths: Object.freeze({ large: 6, catastrophe: 12 }),
    maximumCatastrophes: 1,
    maximumImpactScorePpm: 650_000,
    maximumBurnMonthsPpm: 24_000_000,
    maximumNegativeCashFlowDurationMonths: 12,
    maximumRecoveryTimeMonths: 24,
    warningStrength: "strong",
    rejectImmediateUnavoidableFailure: true,
    baseRankStep: 100,
    repeatedEventPenalty: 250,
    repeatedCategoryPenalty: 60,
    repeatedLessonPenalty: 40,
    underrepresentedLessonBonus: 100,
  }),
  normal: Object.freeze({
    difficulty: "normal",
    initialPressureUnits: 4,
    maximumPressureUnits: 10,
    monthlyPressureRegenerationUnits: 1,
    minimumTierPressureCostUnits: Object.freeze({
      micro: 1,
      medium: 2,
      large: 4,
      catastrophe: 7,
    }),
    tierCooldownMonths: Object.freeze({
      micro: 0,
      medium: 2,
      large: 8,
      catastrophe: 18,
    }),
    minimumEventCooldownMonths: 1,
    minimumCategoryCooldownMonths: 1,
    minimumLessonCooldownMonths: 1,
    recoveryDurationMonths: Object.freeze({ large: 4, catastrophe: 9 }),
    maximumCatastrophes: 2,
    maximumImpactScorePpm: 800_000,
    maximumBurnMonthsPpm: 48_000_000,
    maximumNegativeCashFlowDurationMonths: 24,
    maximumRecoveryTimeMonths: 48,
    warningStrength: "standard",
    rejectImmediateUnavoidableFailure: true,
    baseRankStep: 100,
    repeatedEventPenalty: 250,
    repeatedCategoryPenalty: 60,
    repeatedLessonPenalty: 40,
    underrepresentedLessonBonus: 100,
  }),
  hard: Object.freeze({
    difficulty: "hard",
    initialPressureUnits: 5,
    maximumPressureUnits: 12,
    monthlyPressureRegenerationUnits: 1,
    minimumTierPressureCostUnits: Object.freeze({
      micro: 1,
      medium: 2,
      large: 4,
      catastrophe: 7,
    }),
    tierCooldownMonths: Object.freeze({
      micro: 0,
      medium: 1,
      large: 6,
      catastrophe: 14,
    }),
    minimumEventCooldownMonths: 0,
    minimumCategoryCooldownMonths: 0,
    minimumLessonCooldownMonths: 0,
    recoveryDurationMonths: Object.freeze({ large: 3, catastrophe: 7 }),
    maximumCatastrophes: 3,
    maximumImpactScorePpm: 950_000,
    maximumBurnMonthsPpm: 120_000_000,
    maximumNegativeCashFlowDurationMonths: 60,
    maximumRecoveryTimeMonths: 120,
    warningStrength: "limited",
    rejectImmediateUnavoidableFailure: false,
    baseRankStep: 100,
    repeatedEventPenalty: 250,
    repeatedCategoryPenalty: 60,
    repeatedLessonPenalty: 40,
    underrepresentedLessonBonus: 100,
  }),
});

export const RUNTIME_BALANCE_CANDIDATE_LIMIT_V2 = 5;
export const RUNTIME_BALANCE_RECENT_EVENT_LIMIT_V2 = 24;
export const RUNTIME_BALANCE_LESSON_LIMIT_V2 = 64;
export const RUNTIME_BALANCE_EVENT_LESSON_LIMIT_V2 = 8;
export const RUNTIME_BALANCE_REJECTION_LIMIT_V2 = 64;

function policyViolation(
  path: string,
  code: string,
  message: string,
): RuntimeBalancePolicyViolationV2 {
  return { path, code, message };
}

function nonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function validateRuntimeBalanceDifficultyPolicyV2(
  policy: RuntimeBalanceDifficultyPolicyV2,
): readonly RuntimeBalancePolicyViolationV2[] {
  const violations: RuntimeBalancePolicyViolationV2[] = [];
  if (
    !nonNegativeSafeInteger(policy.initialPressureUnits) ||
    !nonNegativeSafeInteger(policy.maximumPressureUnits) ||
    policy.maximumPressureUnits === 0 ||
    policy.initialPressureUnits > policy.maximumPressureUnits
  ) {
    violations.push(
      policyViolation("initialPressureUnits", "invalid_pressure", "initial pressure must fit the positive maximum"),
    );
  }
  if (
    !nonNegativeSafeInteger(policy.monthlyPressureRegenerationUnits) ||
    policy.monthlyPressureRegenerationUnits === 0
  ) {
    violations.push(
      policyViolation("monthlyPressureRegenerationUnits", "invalid_regeneration", "must be positive"),
    );
  }
  for (const [tier, cost] of Object.entries(policy.minimumTierPressureCostUnits)) {
    if (!nonNegativeSafeInteger(cost) || cost === 0 || cost > policy.maximumPressureUnits) {
      violations.push(
        policyViolation(`minimumTierPressureCostUnits.${tier}`, "invalid_tier_cost", "must fit the pressure budget"),
      );
    }
  }
  for (const [tier, months] of Object.entries(policy.tierCooldownMonths)) {
    if (!nonNegativeSafeInteger(months)) {
      violations.push(
        policyViolation(`tierCooldownMonths.${tier}`, "invalid_cooldown", "must be non-negative"),
      );
    }
  }
  for (const field of [
    "minimumEventCooldownMonths",
    "minimumCategoryCooldownMonths",
    "minimumLessonCooldownMonths",
  ] as const) {
    if (!nonNegativeSafeInteger(policy[field])) {
      violations.push(
        policyViolation(field, "invalid_cooldown", "must be non-negative"),
      );
    }
  }
  for (const [tier, months] of Object.entries(policy.recoveryDurationMonths)) {
    if (!nonNegativeSafeInteger(months) || months === 0) {
      violations.push(
        policyViolation(`recoveryDurationMonths.${tier}`, "invalid_recovery", "must be positive"),
      );
    }
  }
  if (!nonNegativeSafeInteger(policy.maximumCatastrophes)) {
    violations.push(
      policyViolation("maximumCatastrophes", "invalid_catastrophe_limit", "must be non-negative"),
    );
  }
  if (
    !nonNegativeSafeInteger(policy.maximumImpactScorePpm) ||
    policy.maximumImpactScorePpm > 1_000_000 ||
    !nonNegativeSafeInteger(policy.maximumBurnMonthsPpm) ||
    policy.maximumBurnMonthsPpm === 0 ||
    !nonNegativeSafeInteger(policy.maximumNegativeCashFlowDurationMonths) ||
    policy.maximumNegativeCashFlowDurationMonths === 0 ||
    !nonNegativeSafeInteger(policy.maximumRecoveryTimeMonths) ||
    policy.maximumRecoveryTimeMonths === 0
  ) {
    violations.push(
      policyViolation("maximumImpactScorePpm", "invalid_impact_band", "must be bounded PPM"),
    );
  }
  if (!new Set(["strong", "standard", "limited"]).has(policy.warningStrength)) {
    violations.push(
      policyViolation(
        "warningStrength",
        "invalid_warning_strength",
        "must be strong, standard, or limited",
      ),
    );
  }
  for (const field of [
    "baseRankStep",
    "repeatedEventPenalty",
    "repeatedCategoryPenalty",
    "repeatedLessonPenalty",
    "underrepresentedLessonBonus",
  ] as const) {
    if (!nonNegativeSafeInteger(policy[field])) {
      violations.push(policyViolation(field, "invalid_weight", "must be non-negative"));
    }
  }
  return Object.freeze(violations);
}

for (const policy of Object.values(POLICIES)) {
  const violations = validateRuntimeBalanceDifficultyPolicyV2(policy);
  if (violations.length > 0) {
    throw new Error(
      `invalid Runtime Balance policy: ${violations[0]!.path}:${violations[0]!.code}`,
    );
  }
}

export function runtimeBalanceDifficultyPolicyV2(
  difficulty: RuntimeBalanceDifficultyV2,
): RuntimeBalanceDifficultyPolicyV2 {
  return POLICIES[difficulty];
}
