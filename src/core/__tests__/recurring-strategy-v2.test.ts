import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import { finalizeGameStateV2, type GameStateV2 } from "../game-state-v2";
import { createNativeGameStateV2 } from "../native-game-state-v2";
import {
  calculateEmployerMatchV2,
  planRecurringAllocations,
  setRecurringStrategy,
  type SetRecurringStrategyCommand,
} from "../recurring-strategy-v2";
import { resolveScenarioCatalogSelection } from "../scenario-catalog";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";

function initialState(): GameStateV2 {
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
    runId: "run.strategy",
    playerId: "player.strategy",
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "strategy",
    resolvedScenario,
    annualGrossSalaryCents: moneyCents(12_000_000),
    finances: {
      cashCents: moneyCents(1_000_000),
      taxableBroadIndexCents: moneyCents(0),
      taxableSectorCents: moneyCents(0),
      taxableSpeculativeCents: moneyCents(0),
      retirement401kCents: moneyCents(0),
      retirementIraCents: moneyCents(0),
      hsaCents: moneyCents(0),
      homeValueCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      termDebts: [
        {
          id: "debt.low",
          kind: "student_loan",
          principalCents: moneyCents(1_000_000),
          annualInterestRatePpm: ratePpm(40_000),
          minimumPaymentCents: moneyCents(20_000),
          remainingTermMonths: 60,
        },
        {
          id: "debt.high",
          kind: "personal_loan",
          principalCents: moneyCents(80_000),
          annualInterestRatePpm: ratePpm(120_000),
          minimumPaymentCents: moneyCents(10_000),
          remainingTermMonths: 12,
        },
      ],
      revolvingCreditLimitCents: moneyCents(1_000_000),
      revolvingCreditUsedCents: moneyCents(0),
    },
    wellbeing: {
      burnoutPpm: ratePpm(200_000),
      happinessPpm: ratePpm(800_000),
    },
  });
}

function strategyCommand(
  state: GameStateV2,
  overrides: Partial<SetRecurringStrategyCommand["payload"]["strategy"]> = {},
): SetRecurringStrategyCommand {
  return {
    schemaVersion: 2,
    id: "cmd.strategy",
    type: "set_recurring_strategy",
    expectedRevision: state.revision,
    effectiveMonth: state.currentMonth,
    payload: {
      strategy: {
        preTax401kSalaryRatePpm: ratePpm(50_000),
        preTaxHsaSalaryRatePpm: ratePpm(20_000),
        afterTaxBroadIndexRatePpm: ratePpm(200_000),
        afterTaxSectorRatePpm: ratePpm(100_000),
        afterTaxSpeculativeRatePpm: ratePpm(50_000),
        afterTaxIraRatePpm: ratePpm(100_000),
        afterTaxExtraDebtRatePpm: ratePpm(200_000),
        ...overrides,
      },
    },
  };
}

describe("v2 recurring strategy planning", () => {
  it.each([
    [20_000, 20_000],
    [30_000, 30_000],
    [40_000, 35_000],
    [50_000, 40_000],
    [100_000, 40_000],
  ])(
    "applies employer-match tiers to an employee contribution of %i cents",
    (employeeContributionCents, expectedMatchCents) => {
      expect(
        calculateEmployerMatchV2(
          initialState(),
          moneyCents(1_000_000),
          moneyCents(employeeContributionCents),
        ),
      ).toBe(expectedMatchCents);
    },
  );

  it("caps employee plus employer additions at the defined-contribution limit", () => {
    const initial = initialState();
    const nearAdditionLimit = {
      ...initial,
      gameplay: {
        ...initial.gameplay,
        contributions: {
          ...initial.gameplay.contributions,
          employee401kCents: moneyCents(2_400_000),
          employer401kCents: moneyCents(4_790_000),
        },
      },
    } as GameStateV2;

    expect(
      calculateEmployerMatchV2(
        nearAdditionLimit,
        moneyCents(1_000_000),
        moneyCents(8_000),
      ),
    ).toBe(2_000);
  });

  it("caps the employee deferral at the remaining combined addition limit", () => {
    const initial = initialState();
    const configured = setRecurringStrategy(
      initial,
      strategyCommand(initial, {
        preTax401kSalaryRatePpm: ratePpm(20_000),
        preTaxHsaSalaryRatePpm: ratePpm(0),
        afterTaxBroadIndexRatePpm: ratePpm(0),
        afterTaxSectorRatePpm: ratePpm(0),
        afterTaxSpeculativeRatePpm: ratePpm(0),
        afterTaxIraRatePpm: ratePpm(0),
        afterTaxExtraDebtRatePpm: ratePpm(0),
      }),
    );
    const nearAdditionLimit = {
      ...configured,
      gameplay: {
        ...configured.gameplay,
        contributions: {
          ...configured.gameplay.contributions,
          employee401kCents: moneyCents(2_400_000),
          employer401kCents: moneyCents(4_790_000),
        },
      },
    } as GameStateV2;

    const plan = planRecurringAllocations(
      nearAdditionLimit,
      moneyCents(1_000_000),
      moneyCents(0),
    );

    expect(plan.preTax.employee401kCents).toBe(10_000);
    expect(plan.preTax.employer401kMatchCents).toBe(0);
  });

  it("uses gross and after-obligation bases, tiered match, and debt avalanche", () => {
    const initial = initialState();
    const configured = setRecurringStrategy(initial, strategyCommand(initial));
    const plan = planRecurringAllocations(
      configured,
      moneyCents(1_000_000),
      moneyCents(500_000),
    );

    expect(configured.revision).toBe(1);
    expect(plan.preTax).toEqual({
      employee401kCents: 50_000,
      employer401kMatchCents: 40_000,
      hsaCents: 20_000,
    });
    expect(plan.afterTax).toEqual({
      broadIndexCents: 100_000,
      sectorCents: 50_000,
      speculativeCents: 25_000,
      iraCents: 50_000,
      extraDebtPayments: [
        { debtId: "debt.high", amountCents: 80_000 },
        { debtId: "debt.low", amountCents: 20_000 },
      ],
    });
    expect(plan.unallocatedAfterTaxCents).toBe(175_000);
    expect(Object.isFrozen(plan.afterTax.extraDebtPayments)).toBe(true);
  });

  it("clamps every policy-year contribution without exceeding annual limits", () => {
    const configured = setRecurringStrategy(
      initialState(),
      strategyCommand(initialState()),
    );
    const nearLimits = finalizeGameStateV2({
      ...configured,
      gameplay: {
        ...configured.gameplay,
        contributions: {
          ...configured.gameplay.contributions,
          employee401kCents: moneyCents(2_440_000),
          iraCents: moneyCents(749_000),
          hsaCents: moneyCents(435_000),
        },
      },
    });
    const plan = planRecurringAllocations(
      nearLimits,
      moneyCents(1_000_000),
      moneyCents(500_000),
    );

    expect(plan.preTax.employee401kCents).toBe(10_000);
    expect(plan.preTax.employer401kMatchCents).toBe(10_000);
    expect(plan.preTax.hsaCents).toBe(5_000);
    expect(plan.afterTax.iraCents).toBe(1_000);
    expect(plan.unallocatedAfterTaxCents).toBe(224_000);
  });

  it("trims independent half-away rounding so allocations never exceed cash", () => {
    const initial = initialState();
    const configured = setRecurringStrategy(
      initial,
      strategyCommand(initial, {
        preTax401kSalaryRatePpm: ratePpm(0),
        preTaxHsaSalaryRatePpm: ratePpm(0),
        afterTaxBroadIndexRatePpm: ratePpm(500_000),
        afterTaxSectorRatePpm: ratePpm(500_000),
        afterTaxSpeculativeRatePpm: ratePpm(0),
        afterTaxIraRatePpm: ratePpm(0),
        afterTaxExtraDebtRatePpm: ratePpm(0),
      }),
    );
    const plan = planRecurringAllocations(configured, moneyCents(0), moneyCents(1));

    expect(plan.afterTax.broadIndexCents).toBe(1);
    expect(plan.afterTax.sectorCents).toBe(0);
    expect(plan.unallocatedAfterTaxCents).toBe(0);
  });

  it("rejects over-allocation and extra-debt strategy without active debt", () => {
    const initial = initialState();
    expect(() =>
      setRecurringStrategy(
        initial,
        strategyCommand(initial, {
          afterTaxBroadIndexRatePpm: ratePpm(900_000),
          afterTaxSectorRatePpm: ratePpm(200_000),
        }),
      ),
    ).toThrow(expect.objectContaining({ code: "INVALID_ALLOCATION" }));

    const noDebt = finalizeGameStateV2({
      ...initial,
      finances: {
        ...initial.finances,
        nonCreditLiabilitiesCents: moneyCents(0),
        requiredObligationsCents: moneyCents(
          initial.finances.requiredObligationsCents - 30_000,
        ),
      },
      gameplay: {
        ...initial.gameplay,
        debts: { ...initial.gameplay.debts, termDebts: [] },
      },
      ledger: {
        ...initial.ledger,
        transactions: [
          ...initial.ledger.transactions,
          {
            id: "txn.test.clear-debt",
            commandId: "test.clear-debt",
            effectiveMonth: initial.currentMonth,
            reasonCode: "test_clear_debt",
            description: "Clear debt for strategy validation fixture",
            postings: [
              {
                accountId: "liability.non_credit",
                debitCents: moneyCents(1_080_000),
                creditCents: moneyCents(0),
              },
              {
                accountId: "equity.adjustment",
                debitCents: moneyCents(0),
                creditCents: moneyCents(1_080_000),
              },
            ],
          },
        ],
      },
    });
    expect(() => setRecurringStrategy(noDebt, strategyCommand(noDebt))).toThrow(
      expect.objectContaining({ code: "NO_ACTIVE_DEBT" }),
    );
  });
});
