import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "../domain/money";
import {
  calculateGoalInvestableAssets,
  defaultFinancialGoal,
  financialGoalTargetCents,
  projectFinancialGoal,
  projectFinancialGoalV1Compatibility,
  validateFinancialGoal,
  type FinancialGoalV1,
} from "../financial-goals-v2";
import {
  type FinancialSnapshot,
} from "../game-state";

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

  it("subtracts liabilities so borrowed cash cannot increase FI progress", () => {
    const opening = {
      ...finances,
      nonCreditLiabilitiesCents: moneyCents(2_000_000),
      creditLimitCents: moneyCents(1_000_000),
    };
    const borrowed = {
      ...opening,
      cashCents: moneyCents(opening.cashCents + 500_000),
      creditUsedCents: moneyCents(500_000),
    };

    expect(calculateGoalInvestableAssets(opening)).toBe(8_000_000);
    expect(calculateGoalInvestableAssets(borrowed)).toBe(8_000_000);
    expect(projectFinancialGoal(borrowed, goal).progressPpm).toBe(
      projectFinancialGoal(opening, goal).progressPpm,
    );
  });

  it("rejects unsafe rates and target ages", () => {
    expect(() =>
      validateFinancialGoal({ ...goal, safeWithdrawalRatePpm: ratePpm(10_000) }),
    ).toThrow(/withdrawal rate/);
    expect(() => validateFinancialGoal({ ...goal, targetAgeYears: 81 })).toThrow(
      /target age/,
    );
  });

  it("keeps current-lifestyle goals synchronized with authoritative living cost", () => {
    const configured = defaultFinancialGoal(moneyCents(4_000_000));
    const changed = {
      ...finances,
      annualLivingCostCents: moneyCents(5_000_000),
    };

    expect(projectFinancialGoal(changed, configured)).toMatchObject({
      goal: {
        source: "current_lifestyle_default",
        desiredAnnualSpendingCents: 5_000_000,
      },
      targetCents: 125_000_000,
    });
  });

  it("keeps player-selected spending fixed when current living cost changes", () => {
    const changed = {
      ...finances,
      annualLivingCostCents: moneyCents(5_000_000),
    };

    expect(projectFinancialGoal(changed, goal)).toMatchObject({
      goal: {
        source: "player_selected",
        desiredAnnualSpendingCents: 6_000_000,
      },
      targetCents: 150_000_000,
    });
  });

  it("rejects zero annual living cost for current projections", () => {
    expect(() => defaultFinancialGoal(moneyCents(0))).toThrow(/positive annual/);
    expect(() =>
      projectFinancialGoal(
        { ...finances, annualLivingCostCents: moneyCents(0) },
        defaultFinancialGoal(finances.annualLivingCostCents),
      ),
    ).toThrow(/positive annual/);
  });

  it("projects a valid player-selected goal when current living cost is zero", () => {
    expect(
      projectFinancialGoal(
        { ...finances, annualLivingCostCents: moneyCents(0) },
        goal,
      ),
    ).toMatchObject({
      goal: {
        source: "player_selected",
        desiredAnnualSpendingCents: 6_000_000,
      },
      targetCents: 150_000_000,
    });
  });

  it("retains frozen configured-spending projection for historical replay", () => {
    const configured = defaultFinancialGoal(moneyCents(4_000_000));
    const changed = {
      ...finances,
      annualLivingCostCents: moneyCents(5_000_000),
    };

    expect(projectFinancialGoalV1Compatibility(changed, configured)).toMatchObject({
      goal: { desiredAnnualSpendingCents: 4_000_000 },
      targetCents: 100_000_000,
    });
  });
});
