import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "./domain/money";
import { createInitialGameState, type FinancialSnapshot } from "./game-state";
import {
  assessRequiredObligationLiquidity,
  evaluateTerminalOutcome,
  fundRequiredObligations,
  gradeRetirementProgress,
} from "./outcomes";

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

describe("bankruptcy liquidity", () => {
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
});

describe("terminal outcomes", () => {
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
});
