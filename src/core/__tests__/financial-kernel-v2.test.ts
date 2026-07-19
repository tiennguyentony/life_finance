import { describe, expect, it } from "vitest";

import { sha256Canonical } from "../canonical";
import {
  calculateMonthlyCashFlowDeficitV2,
  FINANCIAL_KERNEL_V2_VERSION,
  simulateFinancialMonthV2,
  type FinancialMonthInputV2,
} from "../financial-kernel-v2";
import {
  addMoney,
  moneyCents,
  ratePpm,
  type MoneyCents,
} from "../domain/money";
import { simulationMonth, type SimulationMonth } from "../domain/month";
import { finalizeGameStateV2 } from "../game-state-v2";
import {
  marketSimulationState,
  marketSimulationStateV2,
  simulateMarketMonth,
  simulateMarketMonthV2,
} from "../market";
import {
  createNativeGameStateV2,
  type NativeGameStateV2Input,
} from "../native-game-state-v2";
import { setRecurringStrategy } from "../recurring-strategy-v2";
import { resolveScenarioCatalogSelection } from "../scenario-catalog";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";

describe("financial warning selector", () => {
  it("returns only the exact funded monthly cash-flow deficit", () => {
    expect(
      calculateMonthlyCashFlowDeficitV2({
        afterTaxCashIncomeCents: moneyCents(730_000),
        resolvedIncomeCents: moneyCents(25_000),
        requiredCashCents: moneyCents(800_000),
      }),
    ).toBe(45_000);
    expect(
      calculateMonthlyCashFlowDeficitV2({
        afterTaxCashIncomeCents: moneyCents(800_000),
        resolvedIncomeCents: moneyCents(0),
        requiredCashCents: moneyCents(800_000),
      }),
    ).toBeNull();
  });
});

type ConfiguredStateOptions = Readonly<{
  startMonth?: SimulationMonth;
  annualGrossSalaryCents?: MoneyCents;
  finances?: Partial<NativeGameStateV2Input["finances"]>;
  scenarioSelection?: Partial<
    Parameters<typeof resolveScenarioCatalogSelection>[1]
  >;
  strategy?: Partial<
    Parameters<typeof setRecurringStrategy>[1]["payload"]["strategy"]
  >;
}>;

function configuredState(options: ConfiguredStateOptions = {}) {
  const scenarioSelection: Parameters<
    typeof resolveScenarioCatalogSelection
  >[1] = {
    catalogVersion: US_2026_SCENARIO_CATALOG_VERSION,
    locationId: "location.seattle",
    careerId: "career.software",
    householdId: "household.single",
    benefitsPackageId: "benefits.corporate_flex",
    healthPlanId: "health.hdhp_hsa",
    retirementPlanId: "retirement.401k_standard",
    insuranceCoverageIds: ["insurance.renters"],
    scenarioId: "scenario.fresh_start",
    ...options.scenarioSelection,
  };
  const resolvedScenario = resolveScenarioCatalogSelection(
    US_2026_SCENARIO_CATALOG,
    scenarioSelection,
  );
  const initial = createNativeGameStateV2({
    runId: "run.financial-kernel-v2",
    playerId: "player.financial-kernel-v2",
    birthMonth: simulationMonth("1995-01"),
    startMonth: options.startMonth ?? simulationMonth("2026-07"),
    randomSeed: "financial-kernel-v2-golden",
    resolvedScenario,
    annualGrossSalaryCents:
      options.annualGrossSalaryCents ?? moneyCents(12_000_000),
    finances: {
      cashCents: moneyCents(2_000_000),
      taxableBroadIndexCents: moneyCents(1_000_000),
      taxableSectorCents: moneyCents(200_000),
      taxableSpeculativeCents: moneyCents(100_000),
      retirement401kCents: moneyCents(500_000),
      retirementIraCents: moneyCents(100_000),
      hsaCents: moneyCents(50_000),
      homeValueCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      termDebts: [
        {
          id: "debt.student.1",
          kind: "student_loan",
          principalCents: moneyCents(120_000),
          annualInterestRatePpm: ratePpm(120_000),
          minimumPaymentCents: moneyCents(11_000),
          remainingTermMonths: 12,
        },
      ],
      revolvingCreditLimitCents: moneyCents(1_000_000),
      revolvingCreditUsedCents: moneyCents(0),
      ...options.finances,
    },
    wellbeing: {
      burnoutPpm: ratePpm(100_000),
      happinessPpm: ratePpm(900_000),
    },
  });
  return setRecurringStrategy(initial, {
    schemaVersion: 2,
    id: "cmd.strategy.financial-kernel-v2",
    type: "set_recurring_strategy",
    expectedRevision: 0,
    effectiveMonth: initial.currentMonth,
    payload: {
      strategy: {
        preTax401kSalaryRatePpm: ratePpm(50_000),
        preTaxHsaSalaryRatePpm: ratePpm(20_000),
        afterTaxBroadIndexRatePpm: ratePpm(200_000),
        afterTaxSectorRatePpm: ratePpm(0),
        afterTaxSpeculativeRatePpm: ratePpm(0),
        afterTaxIraRatePpm: ratePpm(100_000),
        afterTaxExtraDebtRatePpm: ratePpm(200_000),
        ...options.strategy,
      },
    },
  });
}

const ZERO_STRATEGY = Object.freeze({
  preTax401kSalaryRatePpm: ratePpm(0),
  preTaxHsaSalaryRatePpm: ratePpm(0),
  afterTaxBroadIndexRatePpm: ratePpm(0),
  afterTaxSectorRatePpm: ratePpm(0),
  afterTaxSpeculativeRatePpm: ratePpm(0),
  afterTaxIraRatePpm: ratePpm(0),
  afterTaxExtraDebtRatePpm: ratePpm(0),
});

function deepFreezeFixture<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreezeFixture(nested);
    Object.freeze(value);
  }
  return value;
}

function creditBoundaryInput(extraExpenseCents = 0): FinancialMonthInputV2 {
  const state = configuredState({
    finances: {
      cashCents: moneyCents(100_000),
      taxableBroadIndexCents: moneyCents(0),
      taxableSectorCents: moneyCents(0),
      taxableSpeculativeCents: moneyCents(0),
      revolvingCreditLimitCents: moneyCents(34_467),
    },
  });
  const input = successfulInput(state);
  return {
    ...input,
    resolvedCashFlows: [
      {
        id: "flow.subscription",
        kind: "recurring_expense",
        amountCents: moneyCents(115_000 + extraExpenseCents),
        sourceSystem: "boundary_fixture",
      },
    ],
  };
}

function zeroMarketStep(state = configuredState()) {
  const generated = simulateMarketMonth(
    marketSimulationState(
      state.marketRegime,
      state.random,
      state.gameplay.market.monthsInRegime,
    ),
  );
  return Object.freeze({
    ...generated,
    month: Object.freeze({
      ...generated.month,
      equityReturnPpm: ratePpm(0),
      bondReturnPpm: ratePpm(0),
      cashReturnPpm: ratePpm(0),
      housingReturnPpm: ratePpm(0),
      inflationPpm: ratePpm(0),
    }),
  });
}

function marketStepWithReturns(
  state: ReturnType<typeof configuredState>,
  returns: Readonly<{
    equityReturnPpm?: number;
    bondReturnPpm?: number;
    cashReturnPpm?: number;
    housingReturnPpm?: number;
    inflationPpm?: number;
  }>,
) {
  const step = zeroMarketStep(state);
  return Object.freeze({
    ...step,
    month: Object.freeze({
      ...step.month,
      equityReturnPpm: ratePpm(returns.equityReturnPpm ?? 0),
      bondReturnPpm: ratePpm(returns.bondReturnPpm ?? 0),
      cashReturnPpm: ratePpm(returns.cashReturnPpm ?? 0),
      housingReturnPpm: ratePpm(returns.housingReturnPpm ?? 0),
      inflationPpm: ratePpm(returns.inflationPpm ?? 0),
    }),
  });
}

function successfulInput(state = configuredState()): FinancialMonthInputV2 {
  return {
    version: FINANCIAL_KERNEL_V2_VERSION,
    commandId: "cmd.financial-kernel-v2.2026-07",
    state,
    marketStep: zeroMarketStep(state),
    taxableLiquidationCostRatePpm: ratePpm(10_000),
    insuranceClaim: {
      type: "health",
      grossAmountCents: moneyCents(200_000),
      covered: true,
    },
    resolvedCashFlows: [
      {
        id: "flow.freelance",
        kind: "other_income",
        amountCents: moneyCents(500_000),
        sourceSystem: "golden_fixture",
      },
      {
        id: "flow.subscription",
        kind: "recurring_expense",
        amountCents: moneyCents(15_000),
        sourceSystem: "golden_fixture",
      },
    ],
    taxEvidence: {
      schemaVersion: 1,
      traceId: "tax.financial-kernel-v2.2026-07",
      economicYear: 2026,
      policyYear: 2026,
      stateCode: "WA",
      filingStatus: "single",
      provider: "PolicyEngine US",
      bundleVersion: "4.21.0",
      rulesVersion: "1.764.6",
      projectedFromFrozenPolicy: false,
      grossIncomeCents: moneyCents(1_000_000),
      employee401kContributionCents: moneyCents(50_000),
      employeeHsaContributionCents: moneyCents(20_000),
      totalTaxCents: 200_000,
      afterTaxCashIncomeCents: moneyCents(730_000),
    },
  };
}

describe("simulateFinancialMonthV2", () => {
  it("does not charge a historical debt minimum above the exact payoff", () => {
    const native = configuredState({
      finances: {
        termDebts: [
          {
            id: "debt.historical-payoff",
            kind: "personal_loan",
            principalCents: moneyCents(500),
            annualInterestRatePpm: ratePpm(0),
            minimumPaymentCents: moneyCents(600),
            remainingTermMonths: 2,
          },
        ],
      },
      strategy: ZERO_STRATEGY,
    });
    const historical = finalizeGameStateV2({
      ...native,
      finances: {
        ...native.finances,
        requiredObligationsCents: addMoney(
          native.finances.requiredObligationsCents,
          moneyCents(100),
        ),
      },
      gameplay: {
        ...native.gameplay,
        debts: {
          ...native.gameplay.debts,
          termDebts: [
            {
              ...native.gameplay.debts.termDebts[0]!,
              minimumPaymentCents: moneyCents(600),
            },
          ],
        },
      },
    });
    const input = successfulInput(historical);
    const taxEvidence = {
      ...input.taxEvidence,
      employee401kContributionCents: moneyCents(0),
      employeeHsaContributionCents: moneyCents(0),
      afterTaxCashIncomeCents: moneyCents(800_000),
    };
    const result = simulateFinancialMonthV2({
      ...input,
      taxEvidence,
      insuranceClaim: undefined,
      resolvedCashFlows: [],
    });
    const expectedNonDebtObligations = moneyCents(
      historical.finances.requiredObligationsCents - 600,
    );
    const nonDebtTransaction = result.state.ledger.transactions.find(
      ({ reasonCode }) => reasonCode === "monthly_non_debt_obligations_v2",
    );
    const debtPaymentTransaction = result.state.ledger.transactions.find(
      ({ reasonCode }) => reasonCode === "monthly_term_debt_payment",
    );

    expect(result.record.baseNonDebtObligationsCents).toBe(
      expectedNonDebtObligations,
    );
    expect(result.record.debtService.totalScheduledPaymentCents).toBe(500);
    expect(nonDebtTransaction?.postings).toEqual([
      {
        accountId: "expense.living",
        debitCents: expectedNonDebtObligations,
        creditCents: 0,
      },
      {
        accountId: "asset.cash",
        debitCents: 0,
        creditCents: expectedNonDebtObligations,
      },
    ]);
    expect(debtPaymentTransaction?.postings).toEqual([
      {
        accountId: "liability.non_credit",
        debitCents: 500,
        creditCents: 0,
      },
      {
        accountId: "asset.cash",
        debitCents: 0,
        creditCents: 500,
      },
    ]);
    expect(result.state.finances.cashCents).toBe(
      historical.finances.cashCents +
        taxEvidence.afterTaxCashIncomeCents -
        expectedNonDebtObligations -
        500,
    );
  });

  it("fully funds when required cash exactly exhausts remaining credit", () => {
    const result = simulateFinancialMonthV2(creditBoundaryInput());

    expect(result.shortfall).toBeNull();
    expect(result.record.fundingPlan).toMatchObject({
      requiredCashCents: 864_467,
      cashAvailableCents: 830_000,
      remainingCreditCents: 34_467,
      creditUsedCents: 34_467,
      residualShortfallCents: 0,
      fullyFunded: true,
    });
    expect(result.state.finances.creditUsedCents).toBe(34_467);
  });

  it("returns a one-cent typed shortfall when required cash exceeds remaining credit", () => {
    const boundary = creditBoundaryInput(1);
    const input = structuredClone({
      ...boundary,
      resolvedCashFlows: [
        {
          id: "flow.shortfall-income",
          kind: "temporary_income" as const,
          amountCents: moneyCents(10_000),
          sourceSystem: "boundary_fixture",
        },
        {
          ...boundary.resolvedCashFlows![0]!,
          amountCents: moneyCents(125_001),
        },
      ],
    });
    const inputChecksum = sha256Canonical(input);
    const openingLedgerLength = input.state.ledger.transactions.length;
    const observedInputs = [
      input,
      input.state,
      input.state.ledger,
      input.state.gameplay,
      input.marketStep,
    ];
    const openingOwnership = observedInputs.map((value) => ({
      frozen: Object.isFrozen(value),
      extensible: Object.isExtensible(value),
    }));
    const result = simulateFinancialMonthV2(input);

    expect(result.shortfall).toEqual({
      requiredCashCents: 874_468,
      residualShortfallCents: 1,
      fundingPlan: result.record.fundingPlan,
      netWorthCents: 1_480_000,
      automaticLiquidityCents: 874_467,
    });
    expect(result.record.shortfall).toBe(result.shortfall);
    expect(result.shortfall?.fundingPlan).toBe(result.record.fundingPlan);
    expect(result.record).toMatchObject({
      processedMonth: "2026-07",
      nextMonth: "2026-08",
      openingNetWorthCents: 630_000,
      closingNetWorthCents: 1_480_000,
      openingAutomaticLiquidityCents: 134_467,
      closingAutomaticLiquidityCents: 874_467,
      resolvedIncomeCents: 10_000,
      resolvedExpenseCents: 125_001,
      nonDebtObligationsPaidCents: 0,
      requiredCashCents: 874_468,
      funding: null,
      recurringAllocations: null,
    });
    expect(result.record.fundingPlan).toEqual({
      requiredCashCents: 874_468,
      cashAvailableCents: 840_000,
      cashUsedCents: 840_000,
      taxableLiquidations: [],
      grossLiquidationCents: 0,
      liquidationCostCents: 0,
      netLiquidationProceedsCents: 0,
      remainingCreditCents: 34_467,
      creditUsedCents: 34_467,
      residualShortfallCents: 1,
      fullyFunded: false,
    });
    expect(result.record.debtService).toMatchObject({
      totalInterestCents: 1_200,
      totalScheduledPaymentCents: 11_000,
    });
    expect(result.state).toMatchObject({
      closingStateKind: "financial_closing_v2",
      currentMonth: "2026-08",
      finances: {
        cashCents: 840_000,
        taxableInvestmentsCents: 0,
        retirementCents: 690_000,
        otherInvestableAssetsCents: 70_000,
        nonCreditLiabilitiesCents: 120_000,
        creditUsedCents: 0,
      },
      gameplay: {
        debts: {
          termDebts: input.state.gameplay.debts.termDebts,
          revolvingCreditUsedCents: 0,
        },
        contributions: {
          employee401kCents: 50_000,
          employer401kCents: 40_000,
          iraCents: 0,
          hsaCents: 20_000,
        },
        insurance: {
          healthDeductiblePaidCents: 180_000,
          healthOutOfPocketPaidCents: 184_000,
        },
        exposure: input.state.gameplay.exposure,
        employment: input.state.gameplay.employment,
        careerDevelopment: input.state.gameplay.careerDevelopment,
        eventLifecycle: input.state.gameplay.eventLifecycle,
      },
    });
    expect(result.state).not.toHaveProperty("revision");
    expect(result.state).not.toHaveProperty("acceptedCommandIds");
    expect(result.state).not.toHaveProperty("outcome");
    expect(
      result.state.ledger.transactions
        .slice(openingLedgerLength)
        .map(({ reasonCode }) => reasonCode),
    ).toEqual(["monthly_payroll_v2", "monthly_resolved_income_v2"]);
    expect(
      result.state.ledger.transactions.find(
        ({ causalReference }) =>
          causalReference?.id === "flow.shortfall-income",
      )?.postings,
    ).toEqual([
      { accountId: "asset.cash", debitCents: 10_000, creditCents: 0 },
      { accountId: "income.other", debitCents: 0, creditCents: 10_000 },
    ]);
    expect(
      result.state.ledger.transactions.some(
        ({ id }) => id === `txn.${input.commandId}.flow.flow.subscription`,
      ),
    ).toBe(false);
    expect(Object.isFrozen(result.shortfall)).toBe(true);
    expect(Object.isFrozen(result.shortfall?.fundingPlan)).toBe(true);
    expect(Object.isFrozen(result.record)).toBe(true);
    expect(Object.isFrozen(result.state)).toBe(true);
    expect(sha256Canonical(input)).toBe(inputChecksum);
    expect(
      observedInputs.map((value) => ({
        frozen: Object.isFrozen(value),
        extensible: Object.isExtensible(value),
      })),
    ).toEqual(openingOwnership);
  });

  it("funds a zero-after-tax-income month through cash, taxable assets, then credit", () => {
    const state = configuredState({
      finances: {
        cashCents: moneyCents(100_000),
        taxableBroadIndexCents: moneyCents(300_000),
        taxableSectorCents: moneyCents(0),
        taxableSpeculativeCents: moneyCents(0),
        revolvingCreditLimitCents: moneyCents(200_000),
      },
    });
    const base = successfulInput(state);
    const result = simulateFinancialMonthV2({
      ...base,
      insuranceClaim: undefined,
      resolvedCashFlows: [],
      taxEvidence: {
        ...base.taxEvidence,
        totalTaxCents: 930_000,
        afterTaxCashIncomeCents: moneyCents(0),
      },
    });

    expect(result.shortfall).toBeNull();
    expect(result.record.afterTaxCashIncomeCents).toBe(0);
    expect(result.record.fundingPlan).toEqual({
      requiredCashCents: 565_467,
      cashAvailableCents: 100_000,
      cashUsedCents: 100_000,
      taxableLiquidations: [
        {
          bucket: "taxableBroadIndexCents",
          grossCents: 300_000,
          costCents: 3_000,
          netCents: 297_000,
        },
      ],
      grossLiquidationCents: 300_000,
      liquidationCostCents: 3_000,
      netLiquidationProceedsCents: 297_000,
      remainingCreditCents: 200_000,
      creditUsedCents: 168_467,
      residualShortfallCents: 0,
      fullyFunded: true,
    });
    expect(result.record.funding).toMatchObject({
      grossLiquidationCents: 300_000,
      liquidationCostCents: 3_000,
      netLiquidationProceedsCents: 297_000,
      creditDrawnCents: 168_467,
    });
    expect(result.state.finances).toMatchObject({
      cashCents: 0,
      taxableInvestmentsCents: 0,
      creditUsedCents: 168_467,
    });
    expect(result.record.recurringAllocations).toMatchObject({
      afterTaxDiscretionaryCents: 0,
      afterTax: { extraDebtPayments: [] },
    });
  });

  it.each([
    {
      direction: "gain",
      returns: {
        equityReturnPpm: 100_000,
        bondReturnPpm: 200_000,
        cashReturnPpm: 50_000,
      },
      marketValueChangeCents: 300_000,
      portfolio: {
        taxableBroadIndexCents: 1_100_000,
        taxableSectorCents: 220_000,
        taxableSpeculativeCents: 110_000,
        retirement401kCents: 550_000,
        retirementIraCents: 110_000,
        hsaCents: 60_000,
      },
      postings: [
        { accountId: "asset.cash", debitCents: 100_000, creditCents: 0 },
        {
          accountId: "asset.taxable_investments",
          debitCents: 130_000,
          creditCents: 0,
        },
        {
          accountId: "asset.retirement",
          debitCents: 60_000,
          creditCents: 0,
        },
        {
          accountId: "asset.other_investable",
          debitCents: 10_000,
          creditCents: 0,
        },
        {
          accountId: "equity.adjustment",
          debitCents: 0,
          creditCents: 300_000,
        },
      ],
    },
    {
      direction: "loss",
      returns: {
        equityReturnPpm: -100_000,
        bondReturnPpm: -200_000,
        cashReturnPpm: -50_000,
      },
      marketValueChangeCents: -300_000,
      portfolio: {
        taxableBroadIndexCents: 900_000,
        taxableSectorCents: 180_000,
        taxableSpeculativeCents: 90_000,
        retirement401kCents: 450_000,
        retirementIraCents: 90_000,
        hsaCents: 40_000,
      },
      postings: [
        { accountId: "asset.cash", debitCents: 0, creditCents: 100_000 },
        {
          accountId: "asset.taxable_investments",
          debitCents: 0,
          creditCents: 130_000,
        },
        {
          accountId: "asset.retirement",
          debitCents: 0,
          creditCents: 60_000,
        },
        {
          accountId: "asset.other_investable",
          debitCents: 0,
          creditCents: 10_000,
        },
        {
          accountId: "equity.adjustment",
          debitCents: 300_000,
          creditCents: 0,
        },
      ],
    },
  ])("applies an exact supplied market $direction", ({
    returns,
    marketValueChangeCents,
    portfolio,
    postings,
  }) => {
    const state = configuredState({ strategy: ZERO_STRATEGY });
    const base = successfulInput(state);
    const result = simulateFinancialMonthV2({
      ...base,
      marketStep: marketStepWithReturns(state, returns),
      insuranceClaim: undefined,
      resolvedCashFlows: [],
      taxEvidence: {
        ...base.taxEvidence,
        filingStatus: state.player.filingStatus,
        employee401kContributionCents: moneyCents(0),
        employeeHsaContributionCents: moneyCents(0),
        afterTaxCashIncomeCents: moneyCents(800_000),
      },
    });
    const marketTransaction = result.state.ledger.transactions.find(
      ({ id }) => id === `txn.${base.commandId}.market`,
    );

    expect(result.record.marketValueChangeCents).toBe(marketValueChangeCents);
    expect(result.state.gameplay.portfolio).toMatchObject(portfolio);
    expect(marketTransaction).toMatchObject({
      reasonCode: "monthly_market_revaluation_v2",
      category: "asset.market_revaluation",
      sourceSystem: "financial_kernel_v2",
      causalReference: { kind: "command", id: base.commandId },
      postings,
    });
  });

  it("forces a taxable sale from the post-loss balance with exact transaction cost", () => {
    const state = configuredState({
      strategy: ZERO_STRATEGY,
      finances: {
        cashCents: moneyCents(100_000),
        taxableBroadIndexCents: moneyCents(1_000_000),
        taxableSectorCents: moneyCents(0),
        taxableSpeculativeCents: moneyCents(0),
        revolvingCreditLimitCents: moneyCents(100_000),
      },
    });
    const base = successfulInput(state);
    const result = simulateFinancialMonthV2({
      ...base,
      taxableLiquidationCostRatePpm: ratePpm(100_000),
      marketStep: marketStepWithReturns(state, {
        equityReturnPpm: -500_000,
      }),
      insuranceClaim: undefined,
      resolvedCashFlows: [],
      taxEvidence: {
        ...base.taxEvidence,
        filingStatus: state.player.filingStatus,
        employee401kContributionCents: moneyCents(0),
        employeeHsaContributionCents: moneyCents(0),
        totalTaxCents: 1_000_000,
        afterTaxCashIncomeCents: moneyCents(0),
      },
    });
    const fundingTransaction = result.state.ledger.transactions.find(
      ({ id }) => id === `txn.${base.commandId}.liquidity`,
    );

    expect(result.record.fundingPlan).toMatchObject({
      cashAvailableCents: 100_000,
      grossLiquidationCents: 500_000,
      liquidationCostCents: 50_000,
      netLiquidationProceedsCents: 450_000,
      creditUsedCents: 15_467,
      residualShortfallCents: 0,
    });
    expect(result.record.fundingPlan.taxableLiquidations).toEqual([
      {
        bucket: "taxableBroadIndexCents",
        grossCents: 500_000,
        costCents: 50_000,
        netCents: 450_000,
      },
    ]);
    expect(result.state.finances.taxableInvestmentsCents).toBe(0);
    expect(fundingTransaction?.postings).toEqual([
      { accountId: "asset.cash", debitCents: 465_467, creditCents: 0 },
      { accountId: "expense.living", debitCents: 50_000, creditCents: 0 },
      {
        accountId: "asset.taxable_investments",
        debitCents: 0,
        creditCents: 500_000,
      },
      { accountId: "liability.credit", debitCents: 0, creditCents: 15_467 },
    ]);
  });

  it("returns shortfall for positive net worth held only in restricted assets", () => {
    const configured = configuredState({
      startMonth: simulationMonth("2026-01"),
      scenarioSelection: {
        householdId: "household.married",
        scenarioId: "scenario.established_household",
      },
      strategy: ZERO_STRATEGY,
      finances: {
        cashCents: moneyCents(500_000),
        taxableBroadIndexCents: moneyCents(0),
        taxableSectorCents: moneyCents(0),
        taxableSpeculativeCents: moneyCents(0),
        retirement401kCents: moneyCents(10_000_000),
        retirementIraCents: moneyCents(5_000_000),
        hsaCents: moneyCents(1_000_000),
        homeValueCents: moneyCents(50_000_000),
        otherAssetsCents: moneyCents(5_000_000),
        termDebts: [],
        revolvingCreditLimitCents: moneyCents(0),
      },
    });
    const state = finalizeGameStateV2({
      ...configured,
      gameplay: {
        ...configured.gameplay,
        contributions: {
          policyYear: 2025,
          employee401kCents: moneyCents(1_000_000),
          employer401kCents: moneyCents(500_000),
          iraCents: moneyCents(250_000),
          hsaCents: moneyCents(200_000),
        },
        insurance: {
          policyYear: 2025,
          healthDeductiblePaidCents: moneyCents(100_000),
          healthOutOfPocketPaidCents: moneyCents(120_000),
          coverageUsage: [
            { coverageId: "insurance.renters", usedCents: moneyCents(12_345) },
          ],
        },
      },
    });
    const base = successfulInput(state);
    const marketStep = marketStepWithReturns(state, {
      cashReturnPpm: -1_000_000,
      inflationPpm: 100_000,
    });
    const result = simulateFinancialMonthV2({
      ...base,
      marketStep,
      insuranceClaim: undefined,
      resolvedCashFlows: [],
      taxEvidence: {
        ...base.taxEvidence,
        filingStatus: state.player.filingStatus,
        employee401kContributionCents: moneyCents(0),
        employeeHsaContributionCents: moneyCents(0),
        totalTaxCents: 1_000_000,
        afterTaxCashIncomeCents: moneyCents(0),
      },
    });

    expect(result.shortfall).not.toBeNull();
    expect(result.processedMonth).toBe("2026-01");
    expect(result.nextMonth).toBe("2026-02");
    expect(result.shortfall?.netWorthCents).toBe(71_000_000);
    expect(result.shortfall?.automaticLiquidityCents).toBe(0);
    expect(result.shortfall?.residualShortfallCents).toBe(
      result.record.requiredCashCents,
    );
    expect(result.record.closingNetWorthCents).toBe(71_000_000);
    expect(result.record.marketValueChangeCents).toBe(-500_000);
    expect(result.record.cumulativePriceIndexPpm).toBe(1_100_000);
    expect(result.record.annualInflationIncreaseCents).toBeGreaterThan(0);
    expect(result.record.fundingPlan).toMatchObject({
      cashAvailableCents: 0,
      grossLiquidationCents: 0,
      netLiquidationProceedsCents: 0,
      remainingCreditCents: 0,
      creditUsedCents: 0,
      fullyFunded: false,
    });
    expect(result.state.finances).toMatchObject({
      cashCents: 0,
      taxableInvestmentsCents: 0,
      retirementCents: 15_000_000,
      otherInvestableAssetsCents: 1_000_000,
      homeValueCents: 50_000_000,
      otherAssetsCents: 5_000_000,
      creditLimitCents: 0,
    });
    expect(result.state.finances.annualLivingCostCents).toBeGreaterThan(
      state.finances.annualLivingCostCents,
    );
    expect(result.state.random).toEqual(marketStep.nextState.random);
    expect(result.state.marketRegime).toBe(marketStep.nextState.regime);
    expect(result.state.gameplay.market).toEqual({
      modelVersion: "regime-v1",
      monthsInRegime: marketStep.nextState.monthsInRegime,
      cumulativePriceIndexPpm: 1_100_000,
    });
    expect(result.state.gameplay.contributions).toEqual({
      policyYear: 2026,
      employee401kCents: 0,
      employer401kCents: 0,
      iraCents: 0,
      hsaCents: 0,
    });
    expect(result.state.gameplay.insurance).toEqual({
      policyYear: 2026,
      healthDeductiblePaidCents: 0,
      healthOutOfPocketPaidCents: 0,
      coverageUsage: [
        { coverageId: "insurance.renters", usedCents: 12_345 },
      ],
    });
    expect(result.record.funding).toBeNull();
    expect(result.record.nonDebtObligationsPaidCents).toBe(0);
  });

  it.each([
    {
      boundary: "below",
      afterTaxCashIncomeCents: 615_467,
      optionalPaymentCents: 50_000,
      closingPrincipalCents: 60_200,
      unallocatedAfterTaxCents: 0,
    },
    {
      boundary: "exact",
      afterTaxCashIncomeCents: 675_667,
      optionalPaymentCents: 110_200,
      closingPrincipalCents: 0,
      unallocatedAfterTaxCents: 0,
    },
    {
      boundary: "above",
      afterTaxCashIncomeCents: 765_467,
      optionalPaymentCents: 110_200,
      closingPrincipalCents: 0,
      unallocatedAfterTaxCents: 89_800,
    },
  ])("caps a $boundary debt-payoff request through the kernel", ({
    afterTaxCashIncomeCents,
    optionalPaymentCents,
    closingPrincipalCents,
    unallocatedAfterTaxCents,
  }) => {
    const state = configuredState({
      strategy: {
        ...ZERO_STRATEGY,
        afterTaxExtraDebtRatePpm: ratePpm(1_000_000),
      },
    });
    const base = successfulInput(state);
    const result = simulateFinancialMonthV2({
      ...base,
      insuranceClaim: undefined,
      resolvedCashFlows: [],
      taxEvidence: {
        ...base.taxEvidence,
        employee401kContributionCents: moneyCents(0),
        employeeHsaContributionCents: moneyCents(0),
        totalTaxCents: 1_000_000 - afterTaxCashIncomeCents,
        afterTaxCashIncomeCents: moneyCents(afterTaxCashIncomeCents),
      },
    });
    const optionalTransaction = result.state.ledger.transactions.find(
      ({ id }) => id === `txn.${base.commandId}.after-tax-strategy`,
    );
    const mandatoryTransaction = result.state.ledger.transactions.find(
      ({ id }) => id === `txn.${base.commandId}.debt-payment`,
    );

    expect(result.record.debtService.lines[0]).toMatchObject({
      openingPrincipalCents: 120_000,
      interestCents: 1_200,
      scheduledPaymentCents: 11_000,
      principalPaidCents: 9_800,
      closingPrincipalCents: 110_200,
    });
    expect(result.record.recurringAllocations?.afterTax.extraDebtPayments).toEqual(
      [{ debtId: "debt.student.1", amountCents: optionalPaymentCents }],
    );
    expect(result.record.recurringAllocations?.unallocatedAfterTaxCents).toBe(
      unallocatedAfterTaxCents,
    );
    expect(result.state.gameplay.debts.termDebts[0]?.principalCents ?? 0).toBe(
      closingPrincipalCents,
    );
    expect(result.state.finances.nonCreditLiabilitiesCents).toBe(
      closingPrincipalCents,
    );
    expect(mandatoryTransaction?.postings).toEqual([
      {
        accountId: "liability.non_credit",
        debitCents: 11_000,
        creditCents: 0,
      },
      { accountId: "asset.cash", debitCents: 0, creditCents: 11_000 },
    ]);
    expect(optionalTransaction?.postings).toEqual([
      {
        accountId: "liability.non_credit",
        debitCents: optionalPaymentCents,
        creditCents: 0,
      },
      {
        accountId: "asset.cash",
        debitCents: 0,
        creditCents: optionalPaymentCents,
      },
    ]);
    expect(optionalPaymentCents).toBeLessThanOrEqual(110_200);
    expect(closingPrincipalCents).toBeGreaterThanOrEqual(0);
  });

  it("keeps employee, employer, HSA, and IRA contributions at annual caps", () => {
    const configured = configuredState({
      strategy: {
        ...ZERO_STRATEGY,
        preTax401kSalaryRatePpm: ratePpm(500_000),
        preTaxHsaSalaryRatePpm: ratePpm(500_000),
        afterTaxIraRatePpm: ratePpm(1_000_000),
      },
    });
    const state = finalizeGameStateV2({
      ...configured,
      gameplay: {
        ...configured.gameplay,
        contributions: {
          policyYear: 2026,
          employee401kCents: moneyCents(2_449_900),
          employer401kCents: moneyCents(4_749_900),
          iraCents: moneyCents(749_900),
          hsaCents: moneyCents(439_900),
        },
      },
    });
    const base = successfulInput(state);
    const result = simulateFinancialMonthV2({
      ...base,
      insuranceClaim: undefined,
      resolvedCashFlows: [],
      taxEvidence: {
        ...base.taxEvidence,
        employee401kContributionCents: moneyCents(100),
        employeeHsaContributionCents: moneyCents(100),
        afterTaxCashIncomeCents: moneyCents(799_800),
      },
    });

    expect(result.record.recurringAllocations).toMatchObject({
      preTax: {
        employee401kCents: 100,
        employer401kMatchCents: 100,
        hsaCents: 100,
      },
      afterTax: { iraCents: 100 },
    });
    expect(result.state.gameplay.contributions).toEqual({
      policyYear: 2026,
      employee401kCents: 2_450_000,
      employer401kCents: 4_750_000,
      iraCents: 750_000,
      hsaCents: 440_000,
    });
    expect(
      result.state.gameplay.contributions.employee401kCents +
        result.state.gameplay.contributions.employer401kCents,
    ).toBe(7_200_000);
  });

  it("resets prior-year counters before January payroll and health claim", () => {
    const configured = configuredState({
      startMonth: simulationMonth("2026-01"),
      strategy: {
        ...ZERO_STRATEGY,
        preTax401kSalaryRatePpm: ratePpm(50_000),
        preTaxHsaSalaryRatePpm: ratePpm(20_000),
      },
    });
    const state = finalizeGameStateV2({
      ...configured,
      gameplay: {
        ...configured.gameplay,
        contributions: {
          policyYear: 2025,
          employee401kCents: moneyCents(2_000_000),
          employer401kCents: moneyCents(1_000_000),
          iraCents: moneyCents(500_000),
          hsaCents: moneyCents(400_000),
        },
        insurance: {
          policyYear: 2025,
          healthDeductiblePaidCents: moneyCents(100_000),
          healthOutOfPocketPaidCents: moneyCents(120_000),
          coverageUsage: configured.gameplay.insurance.coverageUsage.map(
            ({ coverageId }) => ({
              coverageId,
              usedCents: moneyCents(12_345),
            }),
          ),
        },
      },
    });
    const base = successfulInput(state);
    const result = simulateFinancialMonthV2({
      ...base,
      commandId: "cmd.financial-kernel-v2.2026-01",
      resolvedCashFlows: [],
    });

    expect(result.processedMonth).toBe("2026-01");
    expect(result.nextMonth).toBe("2026-02");
    expect(result.state.gameplay.contributions).toEqual({
      policyYear: 2026,
      employee401kCents: 50_000,
      employer401kCents: 40_000,
      iraCents: 0,
      hsaCents: 20_000,
    });
    expect(result.record.insurancePlayerCostCents).toBe(184_000);
    expect(result.state.gameplay.insurance).toEqual({
      policyYear: 2026,
      healthDeductiblePaidCents: 180_000,
      healthOutOfPocketPaidCents: 184_000,
      coverageUsage: [
        { coverageId: "insurance.renters", usedCents: 12_345 },
      ],
    });
  });

  it("applies every resolved flow kind once with stable balanced evidence", () => {
    const state = configuredState({
      strategy: {
        ...ZERO_STRATEGY,
        afterTaxBroadIndexRatePpm: ratePpm(1_000_000),
      },
    });
    const base = successfulInput(state);
    const flows = [
      {
        id: "flow.other",
        kind: "other_income" as const,
        amountCents: moneyCents(10_000),
        sourceSystem: "resolved_flow_fixture",
      },
      {
        id: "flow.temporary-income",
        kind: "temporary_income" as const,
        amountCents: moneyCents(20_000),
        sourceSystem: "resolved_flow_fixture",
      },
      {
        id: "flow.recurring-expense",
        kind: "recurring_expense" as const,
        amountCents: moneyCents(3_000),
        sourceSystem: "resolved_flow_fixture",
      },
      {
        id: "flow.temporary-expense",
        kind: "temporary_expense" as const,
        amountCents: moneyCents(4_000),
        sourceSystem: "resolved_flow_fixture",
      },
      {
        id: "flow.zero",
        kind: "temporary_expense" as const,
        amountCents: moneyCents(0),
        sourceSystem: "resolved_flow_fixture",
      },
    ];
    const result = simulateFinancialMonthV2({
      ...base,
      insuranceClaim: undefined,
      resolvedCashFlows: flows,
      taxEvidence: {
        ...base.taxEvidence,
        employee401kContributionCents: moneyCents(0),
        employeeHsaContributionCents: moneyCents(0),
        afterTaxCashIncomeCents: moneyCents(800_000),
      },
    });
    const flowTransactions = result.state.ledger.transactions.filter(
      ({ reasonCode }) =>
        reasonCode === "monthly_resolved_income_v2" ||
        reasonCode === "monthly_resolved_expense_v2",
    );

    expect(result.record).toMatchObject({
      resolvedIncomeCents: 30_000,
      resolvedExpenseCents: 7_000,
      requiredCashCents: 572_467,
      nonDebtObligationsPaidCents: 554_467,
      recurringAllocations: {
        afterTaxDiscretionaryCents: 257_533,
        afterTax: { broadIndexCents: 257_533 },
      },
    });
    expect(flowTransactions).toHaveLength(4);
    for (const flow of flows.filter(({ amountCents }) => amountCents > 0)) {
      const matches = flowTransactions.filter(
        ({ causalReference }) => causalReference?.id === flow.id,
      );
      const transaction = matches[0]!;
      const income =
        flow.kind === "other_income" || flow.kind === "temporary_income";
      expect(matches).toHaveLength(1);
      expect(transaction).toMatchObject({
        commandId: base.commandId,
        sourceSystem: flow.sourceSystem,
        category: income
          ? "income.resolved_cash_flow"
          : "expense.resolved_cash_flow",
        causalReference: { kind: "system", id: flow.id },
        postings: income
          ? [
              {
                accountId: "asset.cash",
                debitCents: flow.amountCents,
                creditCents: 0,
              },
              {
                accountId: "income.other",
                debitCents: 0,
                creditCents: flow.amountCents,
              },
            ]
          : [
              {
                accountId: "expense.living",
                debitCents: flow.amountCents,
                creditCents: 0,
              },
              {
                accountId: "asset.cash",
                debitCents: 0,
                creditCents: flow.amountCents,
              },
            ],
      });
      expect(transaction.id).toMatch(
        /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/,
      );
      expect(transaction.id.length).toBeLessThanOrEqual(128);
      expect(
        transaction.postings.reduce(
          (total, posting) =>
            total + posting.debitCents - posting.creditCents,
          0,
        ),
      ).toBe(0);
    }
    expect(
      result.state.ledger.transactions.some(
        ({ causalReference }) => causalReference?.id === "flow.zero",
      ),
    ).toBe(false);
  });

  it("bounds a resolved-flow transaction id at maximum valid input lengths", () => {
    const commandId = `c${"x".repeat(95)}`;
    const flowId = `f${"y".repeat(63)}`;
    const base = successfulInput();
    let result: ReturnType<typeof simulateFinancialMonthV2> | undefined;

    expect(commandId).toHaveLength(96);
    expect(flowId).toHaveLength(64);
    expect(() => {
      result = simulateFinancialMonthV2({
        ...base,
        commandId,
        resolvedCashFlows: [
          {
            id: flowId,
            kind: "other_income",
            amountCents: moneyCents(1),
            sourceSystem: "resolved_flow_fixture",
          },
        ],
      });
    }).not.toThrow();

    const transaction = result?.state.ledger.transactions.find(
      ({ causalReference }) => causalReference?.id === flowId,
    );
    expect(transaction).toMatchObject({
      commandId,
      causalReference: { kind: "system", id: flowId },
    });
    expect(transaction?.id).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/);
    expect(transaction?.id.length).toBeLessThanOrEqual(128);
  });

  it("uses distinct deterministic ids for delimiter-ambiguous flow pairs", () => {
    function transactionId(commandId: string, flowId: string): string {
      const base = successfulInput(configuredState());
      const result = simulateFinancialMonthV2({
        ...base,
        commandId,
        resolvedCashFlows: [
          {
            id: flowId,
            kind: "temporary_income",
            amountCents: moneyCents(1),
            sourceSystem: "resolved_flow_fixture",
          },
        ],
      });
      return result.state.ledger.transactions.find(
        ({ causalReference }) => causalReference?.id === flowId,
      )!.id;
    }

    const first = transactionId("a", "b.flow.c");
    const rerun = transactionId("a", "b.flow.c");
    const second = transactionId("a.flow.b", "c");

    expect(rerun).toBe(first);
    expect(second).not.toBe(first);
  });

  it("processes one fully funded native month from supplied evidence", () => {
    const initial = configuredState();
    const input = successfulInput(initial);
    const inputChecksum = sha256Canonical(input);
    const result = simulateFinancialMonthV2(input);

    expect(initial.finances).toEqual({
      cashCents: 2_000_000,
      taxableInvestmentsCents: 1_300_000,
      retirementCents: 600_000,
      homeValueCents: 0,
      otherInvestableAssetsCents: 50_000,
      otherAssetsCents: 0,
      nonCreditLiabilitiesCents: 120_000,
      creditLimitCents: 1_000_000,
      creditUsedCents: 0,
      annualLivingCostCents: 6_500_000,
      requiredObligationsCents: 565_467,
    });
    expect(initial.gameplay.portfolio).toEqual({
      taxableBroadIndexCents: 1_000_000,
      taxableSectorCents: 200_000,
      taxableSpeculativeCents: 100_000,
      taxableLegacyUnclassifiedCents: 0,
      retirement401kCents: 500_000,
      retirementIraCents: 100_000,
      retirementLegacyUnclassifiedCents: 0,
      hsaCents: 50_000,
      otherInvestableLegacyUnclassifiedCents: 0,
    });
    expect(initial.gameplay.debts.termDebts).toEqual([
      {
        id: "debt.student.1",
        kind: "student_loan",
        principalCents: 120_000,
        annualInterestRatePpm: 120_000,
        minimumPaymentCents: 11_000,
        remainingTermMonths: 12,
      },
    ]);

    expect(result).toMatchObject({
      version: FINANCIAL_KERNEL_V2_VERSION,
      processedMonth: "2026-07",
      nextMonth: "2026-08",
      shortfall: null,
      state: {
        currentMonth: "2026-08",
      },
    });
    expect(result.record).toEqual({
      version: FINANCIAL_KERNEL_V2_VERSION,
      commandId: "cmd.financial-kernel-v2.2026-07",
      processedMonth: "2026-07",
      nextMonth: "2026-08",
      openingNetWorthCents: 3_830_000,
      closingNetWorthCents: 4_415_333,
      openingAutomaticLiquidityCents: 4_287_000,
      closingAutomaticLiquidityCents: 4_611_942,
      taxTraceId: "tax.financial-kernel-v2.2026-07",
      grossIncomeCents: 1_000_000,
      totalTaxCents: 200_000,
      afterTaxCashIncomeCents: 730_000,
      resolvedIncomeCents: 500_000,
      resolvedExpenseCents: 15_000,
      market: {
        modelVersion: "regime-v1",
        regime: "expansion",
        nextRegime: "expansion",
        equityReturnPpm: 0,
        bondReturnPpm: 0,
        cashReturnPpm: 0,
        housingReturnPpm: 0,
        inflationPpm: 0,
        laborDemandChangePpm: 3_000,
        appliedReturnModifiersPpm: {
          equity: 0,
          bonds: 0,
          cash: 0,
          housing: 0,
        },
        shocks: {
          macro: 0,
          equityIdiosyncratic: 1,
          bondIdiosyncratic: 1,
          housingIdiosyncratic: 0,
        },
      },
      marketValueChangeCents: 0,
      annualInflationIncreaseCents: 0,
      monthlyObligationInflationIncreaseCents: 0,
      cumulativePriceIndexPpm: 1_000_000,
      insurancePlayerCostCents: 184_000,
      baseNonDebtObligationsCents: 554_467,
      nonDebtObligationsPaidCents: 738_467,
      debtService: {
        lines: [
          {
            debtId: "debt.student.1",
            openingPrincipalCents: 120_000,
            interestCents: 1_200,
            scheduledPaymentCents: 11_000,
            principalPaidCents: 9_800,
            closingPrincipalCents: 110_200,
            closingMinimumPaymentCents: 11_000,
            closingRemainingTermMonths: 11,
          },
        ],
        revolving: {
          version: "revolving-credit-policy-v2",
          openingPrincipalCents: 0,
          interestCents: 0,
          scheduledPaymentCents: 0,
          principalPaidCents: 0,
          closingPrincipalBeforeNewDrawsCents: 0,
        },
        totalInterestCents: 1_200,
        totalScheduledPaymentCents: 11_000,
      },
      requiredCashCents: 764_467,
      fundingPlan: {
        requiredCashCents: 764_467,
        cashAvailableCents: 3_230_000,
        cashUsedCents: 764_467,
        taxableLiquidations: [],
        grossLiquidationCents: 0,
        liquidationCostCents: 0,
        netLiquidationProceedsCents: 0,
        remainingCreditCents: 1_000_000,
        creditUsedCents: 0,
        residualShortfallCents: 0,
        fullyFunded: true,
      },
      funding: {
        grossLiquidationCents: 0,
        liquidationCostCents: 0,
        netLiquidationProceedsCents: 0,
        creditDrawnCents: 0,
        liquidatedBuckets: {
          taxableLegacyUnclassifiedCents: 0,
          taxableSpeculativeCents: 0,
          taxableSectorCents: 0,
          taxableBroadIndexCents: 0,
        },
      },
      recurringAllocations: {
        grossSalaryCents: 1_000_000,
        afterTaxDiscretionaryCents: 465_533,
        preTax: {
          employee401kCents: 50_000,
          employer401kMatchCents: 40_000,
          hsaCents: 20_000,
        },
        afterTax: {
          broadIndexCents: 93_107,
          sectorCents: 0,
          speculativeCents: 0,
          iraCents: 46_553,
          extraDebtPayments: [
            { debtId: "debt.student.1", amountCents: 93_107 },
          ],
        },
        unallocatedAfterTaxCents: 232_766,
      },
      shortfall: null,
    });

    expect(result.state.finances).toEqual({
      cashCents: 2_232_766,
      taxableInvestmentsCents: 1_393_107,
      retirementCents: 736_553,
      homeValueCents: 0,
      otherInvestableAssetsCents: 70_000,
      otherAssetsCents: 0,
      nonCreditLiabilitiesCents: 17_093,
      creditLimitCents: 1_000_000,
      creditUsedCents: 0,
      annualLivingCostCents: 6_500_000,
      requiredObligationsCents: 565_467,
    });
    expect(result.state.gameplay.portfolio).toEqual({
      taxableBroadIndexCents: 1_093_107,
      taxableSectorCents: 200_000,
      taxableSpeculativeCents: 100_000,
      taxableLegacyUnclassifiedCents: 0,
      retirement401kCents: 590_000,
      retirementIraCents: 146_553,
      retirementLegacyUnclassifiedCents: 0,
      hsaCents: 70_000,
      otherInvestableLegacyUnclassifiedCents: 0,
    });
    expect(result.state.gameplay.debts).toEqual({
      termDebts: [
        {
          id: "debt.student.1",
          kind: "student_loan",
          principalCents: 17_093,
          annualInterestRatePpm: 120_000,
          minimumPaymentCents: 11_000,
          remainingTermMonths: 11,
        },
      ],
      legacyUnclassifiedPrincipalCents: 0,
      revolvingCreditLimitCents: 1_000_000,
      revolvingCreditUsedCents: 0,
    });
    expect(result.state.gameplay.contributions).toEqual({
      policyYear: 2026,
      employee401kCents: 50_000,
      employer401kCents: 40_000,
      iraCents: 46_553,
      hsaCents: 20_000,
    });
    expect(result.state.gameplay.insurance).toEqual({
      policyYear: 2026,
      healthDeductiblePaidCents: 180_000,
      healthOutOfPocketPaidCents: 184_000,
      coverageUsage: [{ coverageId: "insurance.renters", usedCents: 0 }],
    });
    expect(result.state.gameplay.market).toEqual({
      modelVersion: "regime-v1",
      monthsInRegime: 1,
      cumulativePriceIndexPpm: 1_000_000,
    });
    expect(result.state.random).toEqual({
      algorithm: "mulberry32-v1",
      value: 2_637_419_378,
    });
    expect(result.state.random).not.toEqual(initial.random);

    expect(result.state).toMatchObject({
      closingStateKind: "financial_closing_v2",
    });
    expect(result.state).not.toHaveProperty("revision");
    expect(result.state).not.toHaveProperty("acceptedCommandIds");
    expect(result.state).not.toHaveProperty("outcome");
    expect(result.state.gameplay.exposure).toEqual(initial.gameplay.exposure);
    expect(result.state.gameplay.employment).toEqual(initial.gameplay.employment);
    expect(result.state.gameplay.careerDevelopment).toEqual(
      initial.gameplay.careerDevelopment,
    );
    expect(result.state.gameplay.eventLifecycle).toEqual(
      initial.gameplay.eventLifecycle,
    );

    const newTransactions = result.state.ledger.transactions.slice(
      initial.ledger.transactions.length,
    );
    expect(
      newTransactions.map(
        ({ reasonCode, category, sourceSystem, causalReference, postings }) => ({
          reasonCode,
          category,
          sourceSystem,
          causalReference,
          postings,
        }),
      ),
    ).toEqual([
      {
        reasonCode: "monthly_payroll_v2",
        category: "income.payroll",
        sourceSystem: "payroll_v2",
        causalReference: {
          kind: "command",
          id: "cmd.financial-kernel-v2.2026-07",
        },
        postings: [
          { accountId: "asset.cash", debitCents: 730_000, creditCents: 0 },
          {
            accountId: "asset.retirement",
            debitCents: 90_000,
            creditCents: 0,
          },
          {
            accountId: "asset.other_investable",
            debitCents: 20_000,
            creditCents: 0,
          },
          { accountId: "expense.tax", debitCents: 200_000, creditCents: 0 },
          {
            accountId: "income.employment",
            debitCents: 0,
            creditCents: 1_000_000,
          },
          { accountId: "income.other", debitCents: 0, creditCents: 40_000 },
        ],
      },
      {
        reasonCode: "monthly_resolved_income_v2",
        category: "income.resolved_cash_flow",
        sourceSystem: "golden_fixture",
        causalReference: { kind: "system", id: "flow.freelance" },
        postings: [
          { accountId: "asset.cash", debitCents: 500_000, creditCents: 0 },
          { accountId: "income.other", debitCents: 0, creditCents: 500_000 },
        ],
      },
      {
        reasonCode: "monthly_resolved_expense_v2",
        category: "expense.resolved_cash_flow",
        sourceSystem: "golden_fixture",
        causalReference: { kind: "system", id: "flow.subscription" },
        postings: [
          { accountId: "expense.living", debitCents: 15_000, creditCents: 0 },
          { accountId: "asset.cash", debitCents: 0, creditCents: 15_000 },
        ],
      },
      {
        reasonCode: "monthly_non_debt_obligations_v2",
        category: "expense.non_debt_obligations",
        sourceSystem: "financial_kernel_v2",
        causalReference: {
          kind: "command",
          id: "cmd.financial-kernel-v2.2026-07",
        },
        postings: [
          {
            accountId: "expense.living",
            debitCents: 738_467,
            creditCents: 0,
          },
          { accountId: "asset.cash", debitCents: 0, creditCents: 738_467 },
        ],
      },
      {
        reasonCode: "monthly_term_debt_interest",
        category: "expense.debt_interest",
        sourceSystem: "debt_service_v2",
        causalReference: {
          kind: "command",
          id: "cmd.financial-kernel-v2.2026-07",
        },
        postings: [
          { accountId: "expense.interest", debitCents: 1_200, creditCents: 0 },
          {
            accountId: "liability.non_credit",
            debitCents: 0,
            creditCents: 1_200,
          },
        ],
      },
      {
        reasonCode: "monthly_term_debt_payment",
        category: "liability.debt_payment",
        sourceSystem: "debt_service_v2",
        causalReference: {
          kind: "command",
          id: "cmd.financial-kernel-v2.2026-07",
        },
        postings: [
          {
            accountId: "liability.non_credit",
            debitCents: 11_000,
            creditCents: 0,
          },
          { accountId: "asset.cash", debitCents: 0, creditCents: 11_000 },
        ],
      },
      {
        reasonCode: "monthly_after_tax_strategy_v2",
        category: "allocation.after_tax_strategy",
        sourceSystem: "financial_kernel_v2",
        causalReference: {
          kind: "command",
          id: "cmd.financial-kernel-v2.2026-07",
        },
        postings: [
          {
            accountId: "asset.taxable_investments",
            debitCents: 93_107,
            creditCents: 0,
          },
          {
            accountId: "asset.retirement",
            debitCents: 46_553,
            creditCents: 0,
          },
          {
            accountId: "liability.non_credit",
            debitCents: 93_107,
            creditCents: 0,
          },
          { accountId: "asset.cash", debitCents: 0, creditCents: 232_767 },
        ],
      },
    ]);
    for (const transaction of newTransactions) {
      const debits = transaction.postings.reduce(
        (total, posting) => total + posting.debitCents,
        0,
      );
      const credits = transaction.postings.reduce(
        (total, posting) => total + posting.creditCents,
        0,
      );
      expect(debits).toBe(credits);
      expect(transaction.commandId).toBe(input.commandId);
      expect(transaction.effectiveMonth).toBe("2026-07");
    }

    expect(sha256Canonical(input)).toBe(inputChecksum);
    expect(initial.currentMonth).toBe("2026-07");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.record)).toBe(true);
    expect(Object.isFrozen(result.state)).toBe(true);
  });

  it("produces equivalent output from deep, mutable, and shallow-frozen inputs", () => {
    const base = successfulInput();
    const inputs = [
      deepFreezeFixture(structuredClone(base)),
      structuredClone(base),
      Object.freeze(structuredClone(base)),
    ];
    const observedNodes = inputs.map((input) => [
      input,
      input.state,
      input.state.ledger,
      input.state.ledger.transactions,
      input.state.gameplay,
      input.marketStep,
      input.marketStep.month,
      input.taxEvidence,
      input.resolvedCashFlows!,
    ]);
    const openingOwnership = observedNodes.map((nodes) =>
      nodes.map((value) => ({
        frozen: Object.isFrozen(value),
        extensible: Object.isExtensible(value),
      })),
    );
    const openingChecksums = inputs.map(sha256Canonical);

    const results = inputs.map(simulateFinancialMonthV2);

    expect(results[1]!.record).toEqual(results[0]!.record);
    expect(results[2]!.record).toEqual(results[0]!.record);
    expect(results.map(({ record }) => sha256Canonical(record))).toEqual([
      sha256Canonical(results[0]!.record),
      sha256Canonical(results[0]!.record),
      sha256Canonical(results[0]!.record),
    ]);
    expect(results.map(({ state }) => sha256Canonical(state))).toEqual([
      sha256Canonical(results[0]!.state),
      sha256Canonical(results[0]!.state),
      sha256Canonical(results[0]!.state),
    ]);
    expect(inputs.map(sha256Canonical)).toEqual(openingChecksums);
    expect(
      observedNodes.map((nodes) =>
        nodes.map((value) => ({
          frozen: Object.isFrozen(value),
          extensible: Object.isExtensible(value),
        })),
      ),
    ).toEqual(openingOwnership);
  });

  it("reruns deterministically from fresh equivalent native inputs", () => {
    const firstInput = successfulInput(configuredState());
    const secondInput = successfulInput(configuredState());
    expect(firstInput).not.toBe(secondInput);
    expect(firstInput.state).not.toBe(secondInput.state);
    expect(sha256Canonical(firstInput)).toBe(sha256Canonical(secondInput));

    const first = simulateFinancialMonthV2(firstInput);
    const second = simulateFinancialMonthV2(secondInput);

    expect(second.record).toEqual(first.record);
    expect(second.state.ledger.transactions).toEqual(
      first.state.ledger.transactions,
    );
    expect(
      second.state.ledger.transactions.map(({ id }) => id),
    ).toEqual(first.state.ledger.transactions.map(({ id }) => id));
    expect(sha256Canonical(second.state)).toBe(sha256Canonical(first.state));
  });

  it("does not freeze a mutable deserialized state input", () => {
    const mutableState = structuredClone(configuredState());
    const observedNodes = [
      mutableState,
      mutableState.ledger,
      mutableState.ledger.transactions,
      mutableState.ledger.transactions[0]!,
      mutableState.gameplay,
      mutableState.gameplay.portfolio,
    ];
    const openingOwnership = observedNodes.map((value) => ({
      frozen: Object.isFrozen(value),
      extensible: Object.isExtensible(value),
    }));
    const openingChecksum = sha256Canonical(mutableState);

    simulateFinancialMonthV2(successfulInput(mutableState));

    expect(
      observedNodes.map((value) => ({
        frozen: Object.isFrozen(value),
        extensible: Object.isExtensible(value),
      })),
    ).toEqual(openingOwnership);
    expect(sha256Canonical(mutableState)).toBe(openingChecksum);
  });

  it("does not freeze mutable descendants of a shallow-frozen state input", () => {
    const shallowState = Object.freeze(structuredClone(configuredState()));
    const openingReferences = {
      ledger: shallowState.ledger,
      transactions: shallowState.ledger.transactions,
      gameplay: shallowState.gameplay,
      portfolio: shallowState.gameplay.portfolio,
    };
    const observedNodes = [
      shallowState,
      shallowState.ledger,
      shallowState.ledger.transactions,
      shallowState.ledger.transactions[0]!,
      shallowState.gameplay,
      shallowState.gameplay.portfolio,
    ];
    const openingOwnership = observedNodes.map((value) => ({
      frozen: Object.isFrozen(value),
      extensible: Object.isExtensible(value),
    }));
    const openingChecksum = sha256Canonical(shallowState);

    simulateFinancialMonthV2(successfulInput(shallowState));

    expect(
      observedNodes.map((value) => ({
        frozen: Object.isFrozen(value),
        extensible: Object.isExtensible(value),
      })),
    ).toEqual(openingOwnership);
    expect(shallowState.ledger).toBe(openingReferences.ledger);
    expect(shallowState.ledger.transactions).toBe(
      openingReferences.transactions,
    );
    expect(shallowState.gameplay).toBe(openingReferences.gameplay);
    expect(shallowState.gameplay.portfolio).toBe(openingReferences.portfolio);
    expect(sha256Canonical(shallowState)).toBe(openingChecksum);
  });

  it("owns and deeply freezes mutable supplied market output", () => {
    const base = successfulInput();
    const mutableMarketStep = structuredClone(base.marketStep);
    const observedNodes = [
      mutableMarketStep,
      mutableMarketStep.month,
      mutableMarketStep.month.appliedReturnModifiersPpm,
      mutableMarketStep.month.shocks,
      mutableMarketStep.nextState,
      mutableMarketStep.nextState.random,
    ];
    const openingOwnership = observedNodes.map((value) => ({
      frozen: Object.isFrozen(value),
      extensible: Object.isExtensible(value),
    }));
    const openingChecksum = sha256Canonical(mutableMarketStep);

    const result = simulateFinancialMonthV2({
      ...base,
      marketStep: mutableMarketStep,
    });

    expect(
      observedNodes.map((value) => ({
        frozen: Object.isFrozen(value),
        extensible: Object.isExtensible(value),
      })),
    ).toEqual(openingOwnership);
    expect(sha256Canonical(mutableMarketStep)).toBe(openingChecksum);
    expect(result.record.market).not.toBe(mutableMarketStep.month);
    expect(result.state.random).not.toBe(mutableMarketStep.nextState.random);
    expect(Object.isFrozen(result.record.market)).toBe(true);
    expect(Object.isFrozen(result.record.market.appliedReturnModifiersPpm)).toBe(
      true,
    );
    expect(Object.isFrozen(result.record.market.shocks)).toBe(true);
    const originalMacroShock = result.record.market.shocks.macro;
    expect(
      Reflect.set(result.record.market.shocks, "macro", originalMacroShock + 1),
    ).toBe(false);
    expect(result.record.market.shocks.macro).toBe(originalMacroShock);
  });

  it("rejects a bad kernel version", () => {
    const input = successfulInput();
    expect(() =>
      simulateFinancialMonthV2({ ...input, version: "1.0.0" as never }),
    ).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
  });

  it("rejects duplicate resolved cash-flow ids", () => {
    const input = successfulInput();
    const flow = input.resolvedCashFlows![0]!;
    expect(() =>
      simulateFinancialMonthV2({
        ...input,
        resolvedCashFlows: [flow, { ...flow }],
      }),
    ).toThrow(
      expect.objectContaining({ code: "INVALID_RESOLVED_CASH_FLOW" }),
    );
  });

  it("rejects a negative resolved cash-flow amount", () => {
    const input = successfulInput();
    const flow = input.resolvedCashFlows![0]!;
    expect(() =>
      simulateFinancialMonthV2({
        ...input,
        resolvedCashFlows: [{ ...flow, amountCents: -1 as never }],
      }),
    ).toThrow(
      expect.objectContaining({ code: "INVALID_RESOLVED_CASH_FLOW" }),
    );
  });

  it("rejects an inconsistent supplied market next state", () => {
    const input = successfulInput();
    expect(() =>
      simulateFinancialMonthV2({
        ...input,
        marketStep: {
          ...input.marketStep,
          nextState: {
            ...input.marketStep.nextState,
            monthsInRegime: input.marketStep.nextState.monthsInRegime + 1,
          },
        },
      }),
    ).toThrow(expect.objectContaining({ code: "INVALID_MARKET_STEP" }));
  });

  it("rejects regime-v2 fixed evidence outside the accepted calibration", () => {
    const input = successfulInput();
    const sampled = simulateMarketMonthV2(
      marketSimulationStateV2(
        input.state.marketRegime,
        input.state.random,
        "normal",
        input.state.gameplay.market.monthsInRegime,
      ),
    );
    expect(() =>
      simulateFinancialMonthV2({
        ...input,
        marketStep: {
          ...sampled,
          month: {
            ...sampled.month,
            sectorReturnPpm: ratePpm(900_000),
          },
        },
      }),
    ).toThrow(expect.objectContaining({ code: "INVALID_MARKET_STEP" }));
  });
});
