import type { RatePpm } from "./domain/money";
import type { FinalGrade } from "./game-state";

export const OUTCOME_POLICY_V1_VERSION = "1.0.0" as const;
export const LEGACY_UNVERSIONED_OUTCOME_POLICY = "legacy-unversioned" as const;

export type RetirementProgressGrade = Exclude<FinalGrade, "S" | "F">;

export type RetirementGradeThresholdV1 = Readonly<{
  minimumProgressPpm: RatePpm;
  grade: RetirementProgressGrade;
}>;

export type OutcomePolicyV1 = Readonly<{
  version: typeof OUTCOME_POLICY_V1_VERSION;
  retirementAgeYears: number;
  retirementGradeThresholds: readonly RetirementGradeThresholdV1[];
}>;

export const DEFAULT_OUTCOME_POLICY_V1 = Object.freeze({
  version: OUTCOME_POLICY_V1_VERSION,
  retirementAgeYears: 65,
  retirementGradeThresholds: Object.freeze([
    Object.freeze({ minimumProgressPpm: 800_000 as RatePpm, grade: "A" as const }),
    Object.freeze({ minimumProgressPpm: 600_000 as RatePpm, grade: "B" as const }),
    Object.freeze({ minimumProgressPpm: 400_000 as RatePpm, grade: "C" as const }),
    Object.freeze({ minimumProgressPpm: 200_000 as RatePpm, grade: "D" as const }),
    Object.freeze({ minimumProgressPpm: 0 as RatePpm, grade: "E" as const }),
  ]),
}) satisfies OutcomePolicyV1;

export const OUTCOME_POLICY_REGISTRY_V2 = Object.freeze({
  [OUTCOME_POLICY_V1_VERSION]: DEFAULT_OUTCOME_POLICY_V1,
});

export function outcomePolicyForVersionV2(version: string): OutcomePolicyV1 {
  const policy = OUTCOME_POLICY_REGISTRY_V2[
    version as keyof typeof OUTCOME_POLICY_REGISTRY_V2
  ];
  if (policy === undefined) {
    throw new RangeError("outcome policy version is unsupported");
  }
  return policy;
}

export function gradeRetirementProgressV1(
  progressPpm: RatePpm,
  outcomePolicyVersion: typeof OUTCOME_POLICY_V1_VERSION,
): RetirementProgressGrade {
  const policy = outcomePolicyForVersionV2(outcomePolicyVersion);
  if (
    !Number.isSafeInteger(progressPpm) ||
    progressPpm < 0 ||
    progressPpm > 1_000_000
  ) {
    throw new RangeError("FI progress must be between 0 and 1,000,000 PPM");
  }
  return policy.retirementGradeThresholds.find(
    ({ minimumProgressPpm }) => progressPpm >= minimumProgressPpm,
  )!.grade;
}
