import { describe, expect, it } from "vitest";

import {
  applyDebtPaymentV2,
  calculateMonthlyDebtInterestV2,
  calculateTotalMinimumDebtPaymentV2,
  planMonthlyDebtService,
  settleMonthlyDebtService,
} from "../debt-service-v2";
import { moneyCents, ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import {
  finalizeGameStateV2,
  type DebtBreakdown,
  type GameStateV2,
} from "../game-state-v2";
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
  it("calculates positive and exact half-cent monthly interest", () => {
    expect(
      calculateMonthlyDebtInterestV2(
        moneyCents(120_000),
        ratePpm(120_000),
      ),
    ).toBe(1_200);
    expect(
      calculateMonthlyDebtInterestV2(moneyCents(6), ratePpm(1_000_000)),
    ).toBe(1);
  });

  it.each([
    [moneyCents(400), moneyCents(400), moneyCents(700), moneyCents(500), 12],
    [moneyCents(1_100), moneyCents(1_100), moneyCents(0), moneyCents(0), 0],
    [moneyCents(1_200), moneyCents(1_100), moneyCents(0), moneyCents(0), 0],
  ])(
    "caps a requested debt payment at payoff without negative principal",
    (
      requestedPaymentCents,
      appliedPaymentCents,
      principalCents,
      minimumPaymentCents,
      remainingTermMonths,
    ) => {
      const result = applyDebtPaymentV2(
        {
          id: "debt.payment-boundary",
          kind: "personal_loan",
          principalCents: moneyCents(1_000),
          annualInterestRatePpm: ratePpm(120_000),
          minimumPaymentCents: moneyCents(500),
          remainingTermMonths: 12,
        },
        moneyCents(100),
        requestedPaymentCents,
      );

      expect(result.appliedPaymentCents).toBe(appliedPaymentCents);
      expect(result.debt).toEqual({
        id: "debt.payment-boundary",
        kind: "personal_loan",
        principalCents,
        annualInterestRatePpm: 120_000,
        minimumPaymentCents,
        remainingTermMonths,
      });
    },
  );

  it("caps each minimum payment at that debt's payoff boundary", () => {
    expect(
      calculateTotalMinimumDebtPaymentV2([
        {
          id: "debt.small",
          kind: "auto_loan",
          principalCents: moneyCents(500),
          annualInterestRatePpm: ratePpm(0),
          minimumPaymentCents: moneyCents(600),
          remainingTermMonths: 1,
        },
        {
          id: "debt.large",
          kind: "student_loan",
          principalCents: moneyCents(1_000),
          annualInterestRatePpm: ratePpm(0),
          minimumPaymentCents: moneyCents(400),
          remainingTermMonths: 2,
        },
      ]),
    ).toBe(900);
  });

  it("caps native opening obligations at each debt payoff boundary", () => {
    const noDebt = state([]);
    const withSmallDebt = state([
      {
        id: "debt.opening-payoff-boundary",
        kind: "personal_loan",
        principalCents: moneyCents(500),
        annualInterestRatePpm: ratePpm(0),
        minimumPaymentCents: moneyCents(600),
        remainingTermMonths: 2,
      },
    ]);

    expect(withSmallDebt.finances.requiredObligationsCents).toBe(
      noDebt.finances.requiredObligationsCents + 500,
    );
  });

  it("preserves raw minimum accounting for a historical persisted debt", () => {
    const native = state([
      {
        id: "debt.historical-minimum",
        kind: "personal_loan",
        principalCents: moneyCents(500),
        annualInterestRatePpm: ratePpm(0),
        minimumPaymentCents: moneyCents(600),
        remainingTermMonths: 2,
      },
    ]);
    const historical = finalizeGameStateV2({
      ...native,
      finances: {
        ...native.finances,
        requiredObligationsCents: moneyCents(
          native.finances.requiredObligationsCents + 100,
        ),
      },
    });

    const settled = settleMonthlyDebtService(
      historical,
      "turn.historical-minimum",
    ).state;

    expect(settled.finances.requiredObligationsCents).toBe(
      historical.finances.requiredObligationsCents - 600,
    );
  });

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
