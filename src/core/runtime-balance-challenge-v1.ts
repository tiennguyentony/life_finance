import {
  divideRoundHalfAwayFromZero,
  safeBigIntToNumber,
} from "./domain/integer";
import type { PersonalEventImpactEstimateV2 } from "./runtime-balance-impact-v2";
import type { RuntimeBalanceDifficultyPolicyV2 } from "./runtime-balance-policy-v2";

const PPM = 1_000_000;

export const RUNTIME_BALANCE_CHALLENGE_V1_VERSION =
  "runtime-balance-challenge-v1" as const;

export const RUNTIME_BALANCE_CHALLENGE_POLICY_V1 = Object.freeze({
  version: RUNTIME_BALANCE_CHALLENGE_V1_VERSION,
  evidenceCeilingPpm: 10_000_000,
});

export type RuntimeBalanceChallengeImpactV1 = Pick<
  PersonalEventImpactEstimateV2,
  | "impactScorePpm"
  | "burnMonthsPpm"
  | "negativeCashFlowDurationMonths"
  | "recoveryTimeMonths"
>;

export type RuntimeBalanceChallengeLimitsV1 = Pick<
  RuntimeBalanceDifficultyPolicyV2,
  | "maximumImpactScorePpm"
  | "maximumBurnMonthsPpm"
  | "maximumNegativeCashFlowDurationMonths"
  | "maximumRecoveryTimeMonths"
>;

export type RuntimeBalanceChallengeBandV1 =
  | "light"
  | "meaningful"
  | "crisis"
  | "extreme"
  | "above_limit";

export type RuntimeBalanceChallengeLimitingDimensionV1 =
  | "impact_score"
  | "burn_months"
  | "negative_cash_flow"
  | "recovery_time";

export type RuntimeBalanceChallengeAssessmentV1 = Readonly<{
  version: typeof RUNTIME_BALANCE_CHALLENGE_V1_VERSION;
  scorePpm: number;
  band: RuntimeBalanceChallengeBandV1;
  limitingDimension: RuntimeBalanceChallengeLimitingDimensionV1;
  ratios: Readonly<{
    impactScorePpm: number;
    burnMonthsPpm: number;
    negativeCashFlowPpm: number;
    recoveryTimePpm: number;
  }>;
}>;

function requireNonNegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
  return value as number;
}

function requirePositiveSafeInteger(value: unknown, label: string): number {
  const result = requireNonNegativeSafeInteger(value, label);
  if (result === 0) throw new RangeError(`${label} must be positive`);
  return result;
}

function ratio(value: number, maximum: number, label: string): number {
  const unbounded = safeBigIntToNumber(
    divideRoundHalfAwayFromZero(
      BigInt(value) * BigInt(PPM),
      BigInt(maximum),
    ),
    `${label} challenge ratio`,
  );
  return Math.min(
    RUNTIME_BALANCE_CHALLENGE_POLICY_V1.evidenceCeilingPpm,
    unbounded,
  );
}

function bandFor(scorePpm: number): RuntimeBalanceChallengeBandV1 {
  if (scorePpm < 350_000) return "light";
  if (scorePpm < 700_000) return "meaningful";
  if (scorePpm < 900_000) return "crisis";
  if (scorePpm <= PPM) return "extreme";
  return "above_limit";
}

export function assessRuntimeBalanceChallengeV1(
  impact: RuntimeBalanceChallengeImpactV1,
  limits: RuntimeBalanceChallengeLimitsV1,
): RuntimeBalanceChallengeAssessmentV1 {
  const impactScorePpm = requireNonNegativeSafeInteger(
    impact?.impactScorePpm,
    "impact score",
  );
  const burnMonthsPpm = requireNonNegativeSafeInteger(
    impact?.burnMonthsPpm,
    "burn months",
  );
  const negativeCashFlowDurationMonths = requireNonNegativeSafeInteger(
    impact?.negativeCashFlowDurationMonths,
    "negative cash-flow duration",
  );
  const recoveryTimeMonths = requireNonNegativeSafeInteger(
    impact?.recoveryTimeMonths,
    "recovery time",
  );
  const maximumImpactScorePpm = requirePositiveSafeInteger(
    limits?.maximumImpactScorePpm,
    "maximum impact score",
  );
  const maximumBurnMonthsPpm = requirePositiveSafeInteger(
    limits?.maximumBurnMonthsPpm,
    "maximum burn months",
  );
  const maximumNegativeCashFlowDurationMonths = requirePositiveSafeInteger(
    limits?.maximumNegativeCashFlowDurationMonths,
    "maximum negative cash-flow duration",
  );
  const maximumRecoveryTimeMonths = requirePositiveSafeInteger(
    limits?.maximumRecoveryTimeMonths,
    "maximum recovery time",
  );

  const ratios = Object.freeze({
    impactScorePpm: ratio(
      impactScorePpm,
      maximumImpactScorePpm,
      "impact score",
    ),
    burnMonthsPpm: ratio(
      burnMonthsPpm,
      maximumBurnMonthsPpm,
      "burn months",
    ),
    negativeCashFlowPpm: ratio(
      negativeCashFlowDurationMonths,
      maximumNegativeCashFlowDurationMonths,
      "negative cash flow",
    ),
    recoveryTimePpm: ratio(
      recoveryTimeMonths,
      maximumRecoveryTimeMonths,
      "recovery time",
    ),
  });
  const ordered = [
    ["impact_score", ratios.impactScorePpm],
    ["burn_months", ratios.burnMonthsPpm],
    ["negative_cash_flow", ratios.negativeCashFlowPpm],
    ["recovery_time", ratios.recoveryTimePpm],
  ] as const;
  const scorePpm = Math.max(...ordered.map(([, value]) => value));
  const limitingDimension = ordered.find(([, value]) => value === scorePpm)![0];

  return Object.freeze({
    version: RUNTIME_BALANCE_CHALLENGE_V1_VERSION,
    scorePpm,
    band: bandFor(scorePpm),
    limitingDimension,
    ratios,
  });
}
