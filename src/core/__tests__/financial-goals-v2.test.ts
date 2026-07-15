import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "../domain/money";
import {
  financialGoalTargetCents,
  projectFinancialGoal,
  validateFinancialGoal,
  type FinancialGoalV1,
} from "../financial-goals-v2";
import type { FinancialSnapshot } from "../game-state";

const goal: FinancialGoalV1 = {
  version: "financial-goal-v1",
  desiredAnnualSpendingCents: moneyCents(6_000_000),
  safeWithdrawalRatePpm: ratePpm(40_000),
  targetAgeYears: 50,
  source: "player_selected",
};

const finances = {
  cashCents: moneyCents(2_000_000),
  taxableInvestmentsCents: moneyCents(3_000_000),
  retirementCents: moneyCents(4_000_000),
  otherInvestableAssetsCents: moneyCents(1_000_000),
  homeValueCents: moneyCents(50_000_000),
  otherAssetsCents: moneyCents(0),
  nonCreditLiabilitiesCents: moneyCents(0),
  creditLimitCents: moneyCents(0),
  creditUsedCents: moneyCents(0),
  annualLivingCostCents: moneyCents(4_000_000),
  requiredObligationsCents: moneyCents(0),
} satisfies FinancialSnapshot;

describe("financial goals v2", () => {
  it("derives the exact FI finish line from spending and withdrawal rate", () => {
    expect(financialGoalTargetCents(goal)).toBe(150_000_000);
  });

  it("excludes home equity and reports exact bounded progress", () => {
    expect(projectFinancialGoal(finances, goal)).toMatchObject({
      investableAssetsCents: 10_000_000,
      targetCents: 150_000_000,
      progressPpm: 66_666,
      remainingCents: 140_000_000,
    });
  });

  it("rejects unsafe rates and target ages", () => {
    expect(() =>
      validateFinancialGoal({ ...goal, safeWithdrawalRatePpm: ratePpm(10_000) }),
    ).toThrow(/withdrawal rate/);
    expect(() => validateFinancialGoal({ ...goal, targetAgeYears: 81 })).toThrow(
      /target age/,
    );
  });
});
