import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import type { FinancialShortfallV2 } from "../financial-kernel-v2";
import { createInitialGameState, type FinancialSnapshot } from "../game-state";
import {
  finalizeGameStateV2,
  migrateGameStateV1ToV2,
} from "../game-state-v2";
import type { FinancialGoalV1 } from "../financial-goals-v2";
import {
  assessTerminalOutcomeV2,
  assessRequiredObligationLiquidity,
  calculateAgeYearsAtMonth,
  evaluateTerminalOutcome,
  evaluateTerminalOutcomeV2,
  fundRequiredObligations,
  gradeRetirementProgress,
} from "../outcomes";
import {
  OUTCOME_POLICY_V1_VERSION,
} from "../outcome-policy-v2";

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

function completedMonthEvidence(
  requiredCashCents = moneyCents(220_00),
  residualShortfallCents = moneyCents(0),
) {
  const automaticLiquidityCents = moneyCents(
    requiredCashCents - residualShortfallCents,
  );
  const fundingPlan = Object.freeze({
    requiredCashCents,
    cashAvailableCents: automaticLiquidityCents,
    cashUsedCents: moneyCents(0),
    taxableLiquidations: [],
    grossLiquidationCents: moneyCents(0),
    liquidationCostCents: moneyCents(0),
    netLiquidationProceedsCents: moneyCents(0),
    remainingCreditCents: moneyCents(0),
    creditUsedCents: moneyCents(0),
    residualShortfallCents,
    fullyFunded: residualShortfallCents === 0,
  });
  return Object.freeze({
    requiredCashCents,
    closingAutomaticLiquidityCents: automaticLiquidityCents,
    fundingPlan,
    shortfall:
      residualShortfallCents === 0
        ? null
        : financialShortfall(residualShortfallCents),
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

describe("outcome policy 1.0.0 assessment", () => {
  it("ends at the exact FI boundary and stays active one cent below it", () => {
    const exact = migrateGameStateV1ToV2(
      state({
        cashCents: moneyCents(0),
        taxableInvestmentsCents: moneyCents(25_000_00),
      }),
    );
    const below = migrateGameStateV1ToV2(
      state({
        cashCents: moneyCents(0),
        taxableInvestmentsCents: moneyCents(24_999_99),
      }),
    );

    expect(
      assessTerminalOutcomeV2(
        exact,
        completedMonthEvidence(),
        OUTCOME_POLICY_V1_VERSION,
      ),
    ).toMatchObject({
      kind: "financial_independence",
      grade: "S",
      reasonCodes: ["financial_independence_target_reached"],
      financialIndependence: { progressPpm: 1_000_000 },
    });
    expect(
      assessTerminalOutcomeV2(
        below,
        completedMonthEvidence(),
        OUTCOME_POLICY_V1_VERSION,
      ),
    ).toBeNull();
  });

  it("gives an actual shortfall precedence over simultaneous FI and retirement", () => {
    const wealthyButIlliquid = migrateGameStateV1ToV2(
      state(
        {
          cashCents: moneyCents(0),
          taxableInvestmentsCents: moneyCents(0),
          retirementCents: moneyCents(25_000_00),
          homeValueCents: moneyCents(100_000_00),
          creditLimitCents: moneyCents(0),
          requiredObligationsCents: moneyCents(1),
        },
        "1960-01",
      ),
    );

    expect(
      assessTerminalOutcomeV2(
        wealthyButIlliquid,
        completedMonthEvidence(moneyCents(1), moneyCents(1)),
        OUTCOME_POLICY_V1_VERSION,
      ),
    ).toMatchObject({
      outcomePolicyVersion: OUTCOME_POLICY_V1_VERSION,
      kind: "bankruptcy",
      grade: "F",
      reasonCode: "actual_required_obligation_shortfall",
      reasonCodes: [
        "actual_required_obligation_shortfall",
        "automatic_liquidity_exhausted",
      ],
      financialIndependence: {
        targetCents: 25_000_00,
        progressPpm: 1_000_000,
      },
      displayedNetWorthCents: 125_000_00,
      automaticLiquidSolvency: {
        requiredCashCents: 1,
        automaticLiquidityCents: 0,
        residualShortfallCents: 1,
        isSolvent: false,
      },
      retirementReadiness: {
        retirementAgeYears: 65,
        reachedRetirementAge: true,
        gradeIfRetiredNow: "A",
      },
    });
  });

  it("uses configured retirement age instead of the player FI target age", () => {
    const playerGoal: FinancialGoalV1 = {
      version: "financial-goal-v1",
      desiredAnnualSpendingCents: moneyCents(2_000_00),
      safeWithdrawalRatePpm: ratePpm(40_000),
      targetAgeYears: 40,
      source: "player_selected",
    };
    const ageForty = migrateGameStateV1ToV2(
      state({}, "1986-01", "2026-07"),
    );
    const configured = finalizeGameStateV2({
      ...ageForty,
      gameplay: { ...ageForty.gameplay, financialGoal: playerGoal },
    });

    expect(
      assessTerminalOutcomeV2(
        configured,
        completedMonthEvidence(),
        OUTCOME_POLICY_V1_VERSION,
      ),
    ).toBeNull();

  });

  it("reports all eligible automatic liquidity, not only liquidation actually used", () => {
    const atRetirement = migrateGameStateV1ToV2(
      state({}, "1961-07", "2026-07"),
    );
    const evidence = completedMonthEvidence(moneyCents(1));

    expect(
      assessTerminalOutcomeV2(atRetirement, {
        ...evidence,
        closingAutomaticLiquidityCents: moneyCents(777_00),
        fundingPlan: {
          ...evidence.fundingPlan,
          cashAvailableCents: moneyCents(1),
          netLiquidationProceedsCents: moneyCents(0),
          remainingCreditCents: moneyCents(0),
        },
      }, OUTCOME_POLICY_V1_VERSION),
    ).toMatchObject({
      automaticLiquidSolvency: {
        automaticLiquidityCents: 777_00,
        isSolvent: true,
      },
    });
  });

  it("returns a complete deterministic retirement assessment at the exact boundary", () => {
    const atRetirement = migrateGameStateV1ToV2(
      state(
        {
          cashCents: moneyCents(0),
          taxableInvestmentsCents: moneyCents(15_000_00),
          homeValueCents: moneyCents(20_000_00),
          nonCreditLiabilitiesCents: moneyCents(5_000_00),
        },
        "1961-07",
        "2026-07",
      ),
    );

    expect(
      assessTerminalOutcomeV2(
        atRetirement,
        completedMonthEvidence(),
        OUTCOME_POLICY_V1_VERSION,
      ),
    ).toEqual({
      outcomePolicyVersion: "1.0.0",
      kind: "retirement_age",
      grade: "B",
      reachedMonth: "2026-07",
      reasonCode: "configured_retirement_age_reached",
      reasonCodes: [
        "configured_retirement_age_reached",
        "financial_independence_target_not_reached",
      ],
      financialIndependence: {
        goalSource: "current_lifestyle_default",
        investableAssetsCents: 15_000_00,
        targetCents: 25_000_00,
        progressPpm: 600_000,
      },
      displayedNetWorthCents: 30_000_00,
      automaticLiquidSolvency: {
        requiredCashCents: 220_00,
        automaticLiquidityCents: 220_00,
        residualShortfallCents: 0,
        isSolvent: true,
      },
      retirementReadiness: {
        retirementAgeYears: 65,
        currentAgeYears: 65,
        reachedRetirementAge: true,
        gradeIfRetiredNow: "B",
      },
    });
  });

  it("uses one canonical month-based age calculation", () => {
    expect(
      calculateAgeYearsAtMonth(
        simulationMonth("1961-07"),
        simulationMonth("2026-06"),
      ),
    ).toBe(64);
    expect(
      calculateAgeYearsAtMonth(
        simulationMonth("1961-07"),
        simulationMonth("2026-07"),
      ),
    ).toBe(65);
  });
});
