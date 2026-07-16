import { describe, expect, it } from "vitest";

import {
  ACTION_POLICY_V1_VERSION,
  actionPolicyForVersionV2,
  resolveDetailedActionPolicyV2,
} from "../action-policy-v2";
import { ratePpm } from "../domain/money";

describe("action policy v2", () => {
  it("resolves the frozen 1.0.0 policy from the registry", () => {
    const policy = actionPolicyForVersionV2(ACTION_POLICY_V1_VERSION);

    expect(policy).toEqual({
      version: "1.0.0",
      taxableLiquidationCostRatePpm: 10_000,
      retirementWithholdingRatePpm: 200_000,
      earlyRetirementPenaltyRatePpm: 100_000,
      earlyRetirementAgeMonths: 714,
      homePurchaseClosingCostRatePpm: 30_000,
      homeSaleCostRatePpm: 60_000,
      homeRefinanceCostRatePpm: 20_000,
      newMortgageSpreadPpm: 20_000,
    });
    expect(Object.isFrozen(policy)).toBe(true);
    expect(() => actionPolicyForVersionV2("invented" as "1.0.0")).toThrow(
      "action policy version is unsupported",
    );
  });

  it("preserves an absent-version historical liquidation rate", () => {
    expect(resolveDetailedActionPolicyV2(undefined, ratePpm(123_456))).toEqual({
      actionPolicyVersion: null,
      taxableLiquidationCostRatePpm: 123_456,
      retirementWithholdingRatePpm: 200_000,
      earlyRetirementPenaltyRatePpm: 100_000,
      earlyRetirementAgeMonths: 714,
      homePurchaseClosingCostRatePpm: 30_000,
      homeSaleCostRatePpm: 60_000,
      homeRefinanceCostRatePpm: 20_000,
      newMortgageSpreadPpm: 20_000,
    });
  });
});
