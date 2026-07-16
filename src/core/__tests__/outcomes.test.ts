import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "../domain/money";
import type { FinancialShortfallV2 } from "../financial-kernel-v2";
import { createInitialGameState, type FinancialSnapshot } from "../game-state";
import {
  finalizeGameStateV2,
  migrateGameStateV1ToV2,
} from "../game-state-v2";
import type { FinancialGoalV1 } from "../financial-goals-v2";
import {
  assessRequiredObligationLiquidity,
  evaluateTerminalOutcome,
  evaluateTerminalOutcomeV2,
  fundRequiredObligations,
  gradeRetirementProgress,
} from "../outcomes";

function finances(
  overrides: Partial<FinancialSnapshot> = {},
): FinancialSnapshot {
  return {
    cashCents: moneyCents(100_00),
    taxableInvestmentsCents: moneyCents(100_00),
    retirementCents: moneyCents(0),
    homeValueCents: moneyCents(0),
    otherInvestableAssetsCents: moneyCents(0),
    otherAssetsCents: moneyCents(0),
    nonCreditLiabilitiesCents: moneyCents(0),
    creditLimitCents: moneyCents(50_00),
    creditUsedCents: moneyCents(0),
    annualLivingCostCents: moneyCents(1_000_00),
    requiredObligationsCents: moneyCents(220_00),
    ...overrides,
  };
}

function state(
  overrides: Partial<FinancialSnapshot> = {},
  birthMonth = "1990-01",
  currentMonth = "2026-07",
) {
  return createInitialGameState({
    runId: "run_outcome",
    startMonth: currentMonth,
    randomSeed: "outcome",
    player: {
      playerId: "player_outcome",
      birthMonth,
      locationId: "US-CA",
      careerTrackId: "engineer",
      filingStatus: "single",
    },
    finances: finances(overrides),
    wellbeing: {
      burnoutPpm: ratePpm(100_000),
      happinessPpm: ratePpm(900_000),
    },
  });
}

function financialShortfall(
  residualShortfallCents = moneyCents(1),
): FinancialShortfallV2 {
  const requiredCashCents = residualShortfallCents;
  const fundingPlan = Object.freeze({
    requiredCashCents,
    cashAvailableCents: moneyCents(0),
    cashUsedCents: moneyCents(0),
    taxableLiquidations: [],
    grossLiquidationCents: moneyCents(0),
    liquidationCostCents: moneyCents(0),
    netLiquidationProceedsCents: moneyCents(0),
    remainingCreditCents: moneyCents(0),
    creditUsedCents: moneyCents(0),
    residualShortfallCents,
    fullyFunded: false,
  });
  return Object.freeze({
    requiredCashCents,
    residualShortfallCents,
    fundingPlan,
    netWorthCents: moneyCents(0),
    automaticLiquidityCents: moneyCents(0),
  });
}

describe("historical v1 bankruptcy liquidity", () => {
  it("excludes retirement and home equity from automatic liquidity", () => {
    const assessment = assessRequiredObligationLiquidity(
      finances({
        cashCents: moneyCents(0),
        taxableInvestmentsCents: moneyCents(0),
        retirementCents: moneyCents(10_000_000_00),
        homeValueCents: moneyCents(10_000_000_00),
        creditLimitCents: moneyCents(0),
        requiredObligationsCents: moneyCents(1),
      }),
      ratePpm(0),
    );

    expect(assessment.totalAutomaticLiquidityCents).toBe(0);
    expect(assessment.shortfallCents).toBe(1);
    expect(assessment.isBankrupt).toBe(true);
  });

  it("does not declare bankruptcy at exact liquidity equality", () => {
    const assessment = assessRequiredObligationLiquidity(
      finances(),
      ratePpm(100_000),
    );

    expect(assessment.totalAutomaticLiquidityCents).toBe(240_00);
    expect(assessment.shortfallCents).toBe(0);
    expect(assessment.isBankrupt).toBe(false);
  });

  it("funds obligations strictly from cash, taxable assets, then credit", () => {
    const before = state();
    const funded = fundRequiredObligations(
      before,
      "cmd.obligations.1",
      before.currentMonth,
      ratePpm(100_000),
    );

    expect(funded.cashUsedCents).toBe(100_00);
    expect(funded.taxableInvestmentsLiquidatedCents).toBe(100_00);
    expect(funded.liquidationCostCents).toBe(10_00);
    expect(funded.creditDrawnCents).toBe(30_00);
    expect(funded.finances.cashCents).toBe(0);
    expect(funded.finances.taxableInvestmentsCents).toBe(0);
    expect(funded.finances.creditUsedCents).toBe(30_00);
  });

  it("liquidates only the minimum gross investment amount needed", () => {
    const before = state({ requiredObligationsCents: moneyCents(150_00) });
    const funded = fundRequiredObligations(
      before,
      "cmd.obligations.2",
      before.currentMonth,
      ratePpm(100_000),
    );

    expect(funded.cashUsedCents).toBe(100_00);
    expect(funded.taxableInvestmentsLiquidatedCents).toBe(55_56);
    expect(funded.liquidationCostCents).toBe(5_56);
    expect(funded.creditDrawnCents).toBe(0);
    expect(funded.finances.taxableInvestmentsCents).toBe(44_44);
  });

  it("preserves the historical full-sale result at exact maximum-net equality", () => {
    const before = state({ requiredObligationsCents: moneyCents(190_00) });
    const funded = fundRequiredObligations(
      before,
      "cmd.obligations.maximum-net",
      before.currentMonth,
      ratePpm(100_000),
    );

    expect(funded.taxableInvestmentsLiquidatedCents).toBe(100_00);
    expect(funded.liquidationCostCents).toBe(10_00);
    expect(funded.creditDrawnCents).toBe(0);
  });
});

describe("terminal outcomes", () => {
  const playerGoal: FinancialGoalV1 = {
    version: "financial-goal-v1",
    desiredAnnualSpendingCents: moneyCents(2_000_00),
    safeWithdrawalRatePpm: ratePpm(40_000),
    targetAgeYears: 40,
    source: "player_selected",
  };

  it("awards immediate S for FI before considering liquidity", () => {
    const outcome = evaluateTerminalOutcome(
      state({
        cashCents: moneyCents(0),
        taxableInvestmentsCents: moneyCents(0),
        retirementCents: moneyCents(25_000_00),
        creditLimitCents: moneyCents(0),
        requiredObligationsCents: moneyCents(1),
      }),
      ratePpm(0),
    );

    expect(outcome).toMatchObject({
      kind: "financial_independence",
      grade: "S",
    });
  });

  it("grades bankruptcy F before the age-65 progress grade", () => {
    const outcome = evaluateTerminalOutcome(
      state(
        {
          cashCents: moneyCents(0),
          taxableInvestmentsCents: moneyCents(0),
          creditLimitCents: moneyCents(0),
          requiredObligationsCents: moneyCents(1),
        },
        "1960-01",
        "2026-07",
      ),
      ratePpm(0),
    );

    expect(outcome).toMatchObject({ kind: "bankruptcy", grade: "F" });
  });

  it.each([
    [20_000_00, "A"],
    [15_000_00, "B"],
    [10_000_00, "C"],
    [5_000_00, "D"],
    [4_999_99, "E"],
  ])("grades age-65 progress at exact boundaries", (investable, grade) => {
    const snapshot = finances({
      cashCents: moneyCents(0),
      taxableInvestmentsCents: moneyCents(investable),
      annualLivingCostCents: moneyCents(1_000_00),
    });
    expect(gradeRetirementProgress(snapshot)).toBe(grade);
  });

  it("keeps a solvent player under age 65 active", () => {
    expect(
      evaluateTerminalOutcome(
        state({ requiredObligationsCents: moneyCents(1_00) }),
        ratePpm(0),
      ),
    ).toBeNull();
  });

  it("uses the player finish line and target age when configured", () => {
    const reachedFi = evaluateTerminalOutcome(
      state({
        cashCents: moneyCents(0),
        taxableInvestmentsCents: moneyCents(5_000_000),
        annualLivingCostCents: moneyCents(10_000_000),
        requiredObligationsCents: moneyCents(1),
      }),
      ratePpm(0),
      playerGoal,
    );
    expect(reachedFi).toMatchObject({
      kind: "financial_independence",
      reasonCode: "investable_assets_reached_player_fi_goal",
    });

    const missedAtTargetAge = evaluateTerminalOutcome(
      state(
        {
          cashCents: moneyCents(100_00),
          taxableInvestmentsCents: moneyCents(100_00),
          requiredObligationsCents: moneyCents(1),
        },
        "1986-01",
        "2026-07",
      ),
      ratePpm(0),
      playerGoal,
    );
    expect(missedAtTargetAge).toMatchObject({
      kind: "retirement_age",
      reasonCode: "reached_player_target_age",
    });
  });
});

describe("v2 terminal outcomes from kernel evidence", () => {
  it("gives an actual shortfall precedence over FI and retirement age", () => {
    const wealthyButRestricted = migrateGameStateV1ToV2(
      state(
        {
          cashCents: moneyCents(0),
          taxableInvestmentsCents: moneyCents(0),
          retirementCents: moneyCents(25_000_000),
          homeValueCents: moneyCents(100_000_000),
          creditLimitCents: moneyCents(0),
          requiredObligationsCents: moneyCents(1),
        },
        "1960-01",
      ),
    );

    expect(
      evaluateTerminalOutcomeV2(
        wealthyButRestricted,
        financialShortfall(),
      ),
    ).toMatchObject({ kind: "bankruptcy", grade: "F" });
  });

  it("does not predict bankruptcy after a fully paid current month", () => {
    const cannotPrefundAnotherMonth = migrateGameStateV1ToV2(
      state({
        cashCents: moneyCents(0),
        taxableInvestmentsCents: moneyCents(0),
        creditLimitCents: moneyCents(0),
        requiredObligationsCents: moneyCents(1),
      }),
    );

    expect(
      evaluateTerminalOutcomeV2(cannotPrefundAnotherMonth, null),
    ).toBeNull();
  });

  it("does not infer bankruptcy from negative net worth when the month is funded", () => {
    const liquidButNegative = migrateGameStateV1ToV2(
      state({
        cashCents: moneyCents(100_000),
        taxableInvestmentsCents: moneyCents(0),
        retirementCents: moneyCents(0),
        homeValueCents: moneyCents(0),
        nonCreditLiabilitiesCents: moneyCents(1_000_000),
        creditLimitCents: moneyCents(100_000),
        creditUsedCents: moneyCents(0),
        requiredObligationsCents: moneyCents(50_000),
      }),
    );

    expect(evaluateTerminalOutcomeV2(liquidButNegative, null)).toBeNull();
  });

  it("keeps an existing terminal outcome immutable", () => {
    const active = migrateGameStateV1ToV2(state());
    const terminal = finalizeGameStateV2({
      ...active,
      outcome: {
        kind: "financial_independence",
        grade: "S",
        reachedMonth: active.currentMonth,
        reasonCode: "existing_terminal",
      },
    });

    expect(evaluateTerminalOutcomeV2(terminal, financialShortfall())).toBe(
      terminal.outcome,
    );
  });
});
