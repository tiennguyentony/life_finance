import { describe, expect, it } from "vitest";

import { sha256Canonical } from "../canonical";
import {
  FINANCIAL_KERNEL_V2_VERSION,
  simulateFinancialMonthV2,
  type FinancialMonthInputV2,
} from "../financial-kernel-v2";
import { moneyCents, ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import { marketSimulationState, simulateMarketMonth } from "../market";
import { createNativeGameStateV2 } from "../native-game-state-v2";
import { setRecurringStrategy } from "../recurring-strategy-v2";
import { resolveScenarioCatalogSelection } from "../scenario-catalog";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";

function configuredState() {
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
      insuranceCoverageIds: ["insurance.renters"],
      scenarioId: "scenario.fresh_start",
    },
  );
  const initial = createNativeGameStateV2({
    runId: "run.financial-kernel-v2",
    playerId: "player.financial-kernel-v2",
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "financial-kernel-v2-golden",
    resolvedScenario,
    annualGrossSalaryCents: moneyCents(12_000_000),
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
      },
    },
  });
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

    expect(result.state.revision).toBe(initial.revision);
    expect(result.state.acceptedCommandIds).toEqual(initial.acceptedCommandIds);
    expect(result.state.outcome).toBe(initial.outcome);
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
});
