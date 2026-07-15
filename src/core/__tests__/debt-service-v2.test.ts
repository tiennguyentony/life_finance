import { describe, expect, it } from "vitest";

import {
  planMonthlyDebtService,
  settleMonthlyDebtService,
} from "../debt-service-v2";
import { moneyCents, ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import type { DebtBreakdown, GameStateV2 } from "../game-state-v2";
import { createNativeGameStateV2 } from "../native-game-state-v2";
import { resolveScenarioCatalogSelection } from "../scenario-catalog";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";

function state(
  termDebts: DebtBreakdown["termDebts"],
  cashCents = 1_000_000,
): GameStateV2 {
  const resolvedScenario = resolveScenarioCatalogSelection(
    US_2026_SCENARIO_CATALOG,
    {
      catalogVersion: US_2026_SCENARIO_CATALOG_VERSION,
      locationId: "location.seattle",
      careerId: "career.software",
      householdId: "household.single",
      benefitsPackageId: "benefits.corporate_flex",
      healthPlanId: "health.hdhp_hsa",
      retirementPlanId: "retirement.401k_standard",
      insuranceCoverageIds: [],
      scenarioId: "scenario.fresh_start",
    },
  );
  return createNativeGameStateV2({
    runId: "run.debt-service",
    playerId: "player.debt-service",
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "debt-service",
    resolvedScenario,
    annualGrossSalaryCents: moneyCents(12_000_000),
    finances: {
      cashCents: moneyCents(cashCents),
      taxableBroadIndexCents: moneyCents(0),
      taxableSectorCents: moneyCents(0),
      taxableSpeculativeCents: moneyCents(0),
      retirement401kCents: moneyCents(0),
      retirementIraCents: moneyCents(0),
      hsaCents: moneyCents(0),
      homeValueCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      termDebts,
      revolvingCreditLimitCents: moneyCents(1_000_000),
      revolvingCreditUsedCents: moneyCents(0),
    },
    wellbeing: {
      burnoutPpm: ratePpm(0),
      happinessPpm: ratePpm(1_000_000),
    },
  });
}

const debts = [
  {
    id: "debt.regular",
    kind: "student_loan" as const,
    principalCents: moneyCents(120_000),
    annualInterestRatePpm: ratePpm(120_000),
    minimumPaymentCents: moneyCents(11_000),
    remainingTermMonths: 12,
  },
  {
    id: "debt.negative_amortization",
    kind: "personal_loan" as const,
    principalCents: moneyCents(100_000),
    annualInterestRatePpm: ratePpm(240_000),
    minimumPaymentCents: moneyCents(1_000),
    remainingTermMonths: 12,
  },
  {
    id: "debt.maturity",
    kind: "auto_loan" as const,
    principalCents: moneyCents(100_000),
    annualInterestRatePpm: ratePpm(120_000),
    minimumPaymentCents: moneyCents(1_000),
    remainingTermMonths: 1,
  },
];

describe("monthly term-debt service", () => {
  it("rounds monthly interest and handles amortizing, negative, and maturity cases", () => {
    const plan = planMonthlyDebtService(state(debts));

    expect(plan.lines).toEqual([
      {
        debtId: "debt.regular",
        openingPrincipalCents: 120_000,
        interestCents: 1_200,
        scheduledPaymentCents: 11_000,
        principalPaidCents: 9_800,
        closingPrincipalCents: 110_200,
        closingMinimumPaymentCents: 11_000,
        closingRemainingTermMonths: 11,
      },
      {
        debtId: "debt.negative_amortization",
        openingPrincipalCents: 100_000,
        interestCents: 2_000,
        scheduledPaymentCents: 1_000,
        principalPaidCents: 0,
        closingPrincipalCents: 101_000,
        closingMinimumPaymentCents: 1_000,
        closingRemainingTermMonths: 11,
      },
      {
        debtId: "debt.maturity",
        openingPrincipalCents: 100_000,
        interestCents: 1_000,
        scheduledPaymentCents: 101_000,
        principalPaidCents: 100_000,
        closingPrincipalCents: 0,
        closingMinimumPaymentCents: 0,
        closingRemainingTermMonths: 0,
      },
    ]);
    expect(plan.totalInterestCents).toBe(4_200);
    expect(plan.totalScheduledPaymentCents).toBe(113_000);
    expect(Object.isFrozen(plan.lines)).toBe(true);
  });

  it("settles interest and payment in balanced journals and updates next obligations", () => {
    const initial = state(debts);
    const result = settleMonthlyDebtService(initial, "turn.2026-07");

    expect(result.state.finances.cashCents).toBe(887_000);
    expect(result.state.finances.nonCreditLiabilitiesCents).toBe(211_200);
    expect(result.state.finances.requiredObligationsCents).toBe(
      initial.finances.requiredObligationsCents - 1_000,
    );
    expect(result.state.gameplay.debts.termDebts.map((debt) => debt.principalCents)).toEqual([
      110_200,
      101_000,
      0,
    ]);
    expect(result.state.ledger.transactions.slice(-2).map(({ reasonCode }) => reasonCode)).toEqual([
      "monthly_term_debt_interest",
      "monthly_term_debt_payment",
    ]);
    expect(initial.finances.nonCreditLiabilitiesCents).toBe(320_000);
  });

  it("requires the orchestrator to fund cash before settlement and mutates nothing", () => {
    const balloon = state([
      {
        id: "debt.balloon",
        kind: "personal_loan",
        principalCents: moneyCents(2_000_000),
        annualInterestRatePpm: ratePpm(120_000),
        minimumPaymentCents: moneyCents(10_000),
        remainingTermMonths: 1,
      },
    ]);

    expect(() => settleMonthlyDebtService(balloon, "turn.balloon")).toThrow(
      expect.objectContaining({ code: "INSUFFICIENT_CASH" }),
    );
    expect(balloon.finances.cashCents).toBe(1_000_000);
    expect(balloon.finances.nonCreditLiabilitiesCents).toBe(2_000_000);
  });

  it("uses half-away rounding at the exact half-cent boundary", () => {
    const halfCent = state([
      {
        id: "debt.half-cent",
        kind: "personal_loan",
        principalCents: moneyCents(6),
        annualInterestRatePpm: ratePpm(1_000_000),
        minimumPaymentCents: moneyCents(1),
        remainingTermMonths: 2,
      },
    ]);
    expect(planMonthlyDebtService(halfCent).lines[0]?.interestCents).toBe(1);
  });
});
