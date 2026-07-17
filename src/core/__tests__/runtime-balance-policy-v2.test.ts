import { describe, expect, it } from "vitest";

import {
  runtimeBalanceDifficultyPolicyV2,
  validateRuntimeBalanceDifficultyPolicyV2,
  type RuntimeBalanceDifficultyPolicyV2,
} from "../runtime-balance-policy-v2";

describe("Runtime Balance policy v2", () => {
  it.each(["guided", "normal", "hard"] as const)(
    "validates the frozen %s tuning profile at startup",
    (difficulty) => {
      const policy = runtimeBalanceDifficultyPolicyV2(difficulty);
      expect(Object.isFrozen(policy)).toBe(true);
      expect(validateRuntimeBalanceDifficultyPolicyV2(policy)).toEqual([]);
    },
  );

  it("rejects unsafe pressure, cooldown, recovery, impact, limit, and weight tuning", () => {
    const valid = runtimeBalanceDifficultyPolicyV2("normal");
    const invalid = {
      ...valid,
      initialPressureUnits: 11,
      maximumPressureUnits: 10,
      monthlyPressureRegenerationUnits: -1,
      minimumTierPressureCostUnits: { ...valid.minimumTierPressureCostUnits, large: 0 },
      tierCooldownMonths: { ...valid.tierCooldownMonths, catastrophe: -1 },
      minimumEventCooldownMonths: -1,
      recoveryDurationMonths: { ...valid.recoveryDurationMonths, large: 0 },
      maximumCatastrophes: -1,
      maximumImpactScorePpm: 1_000_001,
      maximumBurnMonthsPpm: -1,
      maximumNegativeCashFlowDurationMonths: -1,
      maximumRecoveryTimeMonths: -1,
      warningStrength: "invented",
      repeatedEventPenalty: -1,
    } as unknown as RuntimeBalanceDifficultyPolicyV2;

    expect(
      validateRuntimeBalanceDifficultyPolicyV2(invalid).map(({ code }) => code),
    ).toEqual(
      expect.arrayContaining([
        "invalid_pressure",
        "invalid_regeneration",
        "invalid_tier_cost",
        "invalid_cooldown",
        "invalid_recovery",
        "invalid_catastrophe_limit",
        "invalid_impact_band",
        "invalid_warning_strength",
        "invalid_weight",
      ]),
    );
  });

  it("configures distinct impact bands and warning strength by difficulty", () => {
    const guided = runtimeBalanceDifficultyPolicyV2("guided");
    const normal = runtimeBalanceDifficultyPolicyV2("normal");
    const hard = runtimeBalanceDifficultyPolicyV2("hard");

    expect(guided.maximumBurnMonthsPpm).toBeLessThan(normal.maximumBurnMonthsPpm);
    expect(normal.maximumBurnMonthsPpm).toBeLessThan(hard.maximumBurnMonthsPpm);
    expect(guided.maximumNegativeCashFlowDurationMonths).toBeLessThan(
      normal.maximumNegativeCashFlowDurationMonths,
    );
    expect(normal.maximumRecoveryTimeMonths).toBeLessThan(
      hard.maximumRecoveryTimeMonths,
    );
    expect(guided.minimumEventCooldownMonths).toBeGreaterThan(
      hard.minimumEventCooldownMonths,
    );
    expect([guided.warningStrength, normal.warningStrength, hard.warningStrength]).toEqual([
      "strong",
      "standard",
      "limited",
    ]);
  });
});
