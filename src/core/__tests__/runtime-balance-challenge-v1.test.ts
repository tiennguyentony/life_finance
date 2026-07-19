import { describe, expect, it } from "vitest";

import {
  RUNTIME_BALANCE_CHALLENGE_POLICY_V1,
  assessRuntimeBalanceChallengeV1,
  type RuntimeBalanceChallengeImpactV1,
  type RuntimeBalanceChallengeLimitsV1,
} from "../runtime-balance-challenge-v1";

const LIMITS: RuntimeBalanceChallengeLimitsV1 = Object.freeze({
  maximumImpactScorePpm: 1_000_000,
  maximumBurnMonthsPpm: 1_000_000,
  maximumNegativeCashFlowDurationMonths: 100,
  maximumRecoveryTimeMonths: 100,
});

function impact(
  values: Partial<RuntimeBalanceChallengeImpactV1> = {},
): RuntimeBalanceChallengeImpactV1 {
  return Object.freeze({
    impactScorePpm: 0,
    burnMonthsPpm: 0,
    negativeCashFlowDurationMonths: 0,
    recoveryTimeMonths: 0,
    ...values,
  });
}

describe("Runtime Balance Challenge Assessment V1", () => {
  it.each([
    ["impact_score", { impactScorePpm: 750_000 }],
    ["burn_months", { burnMonthsPpm: 750_000 }],
    ["negative_cash_flow", { negativeCashFlowDurationMonths: 75 }],
    ["recovery_time", { recoveryTimeMonths: 75 }],
  ] as const)("selects %s as the limiting dimension", (dimension, values) => {
    expect(assessRuntimeBalanceChallengeV1(impact(values), LIMITS)).toMatchObject({
      version: "runtime-balance-challenge-v1",
      scorePpm: 750_000,
      band: "crisis",
      limitingDimension: dimension,
    });
  });

  it("uses documented first-dimension tie order and freezes nested evidence", () => {
    const result = assessRuntimeBalanceChallengeV1(impact({
      impactScorePpm: 600_000,
      burnMonthsPpm: 600_000,
      negativeCashFlowDurationMonths: 60,
      recoveryTimeMonths: 60,
    }), LIMITS);

    expect(result.limitingDimension).toBe("impact_score");
    expect(result.ratios).toEqual({
      impactScorePpm: 600_000,
      burnMonthsPpm: 600_000,
      negativeCashFlowPpm: 600_000,
      recoveryTimePpm: 600_000,
    });
    expect(Object.isFrozen(RUNTIME_BALANCE_CHALLENGE_POLICY_V1)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.ratios)).toBe(true);
  });

  it.each([
    [0, "light"],
    [349_999, "light"],
    [350_000, "meaningful"],
    [699_999, "meaningful"],
    [700_000, "crisis"],
    [899_999, "crisis"],
    [900_000, "extreme"],
    [1_000_000, "extreme"],
    [1_000_001, "above_limit"],
  ] as const)("maps score %i to %s", (scorePpm, band) => {
    expect(assessRuntimeBalanceChallengeV1(
      impact({ impactScorePpm: scorePpm }),
      LIMITS,
    )).toMatchObject({ scorePpm, band });
  });

  it("rounds half away from zero and caps retained above-limit evidence", () => {
    const rounded = assessRuntimeBalanceChallengeV1(
      impact({ recoveryTimeMonths: 1 }),
      { ...LIMITS, maximumRecoveryTimeMonths: 128 },
    );
    expect(rounded.ratios.recoveryTimePpm).toBe(7_813);

    const capped = assessRuntimeBalanceChallengeV1(
      impact({ impactScorePpm: 20_000_000 }),
      LIMITS,
    );
    expect(capped.scorePpm).toBe(10_000_000);
    expect(capped.band).toBe("above_limit");
  });

  it("does not mutate inputs and rejects unsafe, negative, or zero-bound evidence", () => {
    const originalImpact = impact({ recoveryTimeMonths: 45 });
    const originalLimits = { ...LIMITS };
    assessRuntimeBalanceChallengeV1(originalImpact, originalLimits);
    expect(originalImpact).toEqual(impact({ recoveryTimeMonths: 45 }));
    expect(originalLimits).toEqual(LIMITS);

    expect(() => assessRuntimeBalanceChallengeV1(
      impact({ burnMonthsPpm: -1 }),
      LIMITS,
    )).toThrowError(RangeError);
    expect(() => assessRuntimeBalanceChallengeV1(
      impact(),
      { ...LIMITS, maximumRecoveryTimeMonths: 0 },
    )).toThrowError(RangeError);
    expect(() => assessRuntimeBalanceChallengeV1(
      impact({ impactScorePpm: Number.MAX_SAFE_INTEGER + 1 }),
      LIMITS,
    )).toThrowError(RangeError);
  });
});
