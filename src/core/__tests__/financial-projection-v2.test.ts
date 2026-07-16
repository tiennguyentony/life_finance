import { describe, expect, it } from "vitest";

import { sha256Canonical } from "../canonical";
import { moneyCents, ratePpm } from "../domain/money";
import { addMonths, simulationMonth } from "../domain/month";
import { reduceDetailedFinanceCommand } from "../detailed-actions-v2";
import { queueScheduledPersonalEventV2 } from "../event-lifecycle-v2";
import { schedulePersonalEventV2 } from "../event-scheduler-v2";
import { recordExposureSnapshotV2 } from "../exposure-v2";
import {
  finalizeGameStateV2,
  validateGameStateV2,
  type GameStateV2,
} from "../game-state-v2";
import { reconcileFinancesWithLedger } from "../game-state";
import { manageLifeMilestoneV2 } from "../life-milestones-v2";
import {
  FinancialProjectionV2Error,
  MAX_FINANCIAL_PROJECTION_MONTHS_V2,
  projectWithoutEventsV2,
  type FinancialProjectionInputV2,
} from "../financial-projection-v2";
import {
  marketSimulationState,
  simulateMarketMonth,
  type MarketReturnModifiers,
  type MarketSimulationResult,
} from "../market";
import {
  createNativeGameStateV2,
  type NativeGameStateV2Input,
} from "../native-game-state-v2";
import { setRecurringStrategy } from "../recurring-strategy-v2";
import { advanceMacroStoriesV2 } from "../macro-story-v2";
import { validateLedger } from "../ledger";
import { resolveScenarioCatalogSelection } from "../scenario-catalog";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";

function goldenState(
  finances: Partial<NativeGameStateV2Input["finances"]> = {},
  strategy: Partial<
    Omit<GameStateV2["gameplay"]["recurringStrategy"], "effectiveMonth">
  > = {},
) {
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
    runId: "run.financial-projection-v2",
    playerId: "player.financial-projection-v2",
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
      ...finances,
    },
    wellbeing: {
      burnoutPpm: ratePpm(100_000),
      happinessPpm: ratePpm(900_000),
    },
  });
  return setRecurringStrategy(initial, {
    schemaVersion: 2,
    id: "cmd.strategy.financial-projection-v2",
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
        ...strategy,
      },
    },
  });
}

function fixedGoldenInput(): FinancialProjectionInputV2 {
  const state = goldenState();
  const sampled = simulateMarketMonth(
    marketSimulationState(
      state.marketRegime,
      state.random,
      state.gameplay.market.monthsInRegime,
    ),
  );
  const marketStep = Object.freeze({
    ...sampled,
    month: Object.freeze({
      ...sampled.month,
      equityReturnPpm: ratePpm(0),
      bondReturnPpm: ratePpm(0),
      cashReturnPpm: ratePpm(0),
      housingReturnPpm: ratePpm(0),
      inflationPpm: ratePpm(0),
    }),
  });
  return {
    state,
    months: 1,
    assumptions: {
      version: 1,
      taxableLiquidationCostRatePpm: ratePpm(10_000),
      taxEvidenceByMonth: [
        {
          schemaVersion: 1,
          traceId: "tax.financial-projection-v2.2026-07",
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
      ],
      insuranceClaimsByMonth: [
        {
          type: "health",
          grossAmountCents: moneyCents(200_000),
          covered: true,
        },
      ],
      resolvedCashFlowsByMonth: [
        [
          {
            id: "flow.freelance",
            kind: "other_income",
            amountCents: moneyCents(500_000),
            sourceSystem: "projection_fixture",
          },
          {
            id: "flow.subscription",
            kind: "recurring_expense",
            amountCents: moneyCents(15_000),
            sourceSystem: "projection_fixture",
          },
        ],
      ],
      market: { kind: "fixed", steps: [marketStep] },
    },
  };
}

function stateSeededInput(
  months: number,
  returnModifiersPpm: MarketReturnModifiers,
): FinancialProjectionInputV2 {
  const base = fixedGoldenInput();
  const tax = base.assumptions.taxEvidenceByMonth[0]!;
  return {
    state: base.state,
    months,
    assumptions: {
      version: 1,
      taxableLiquidationCostRatePpm:
        base.assumptions.taxableLiquidationCostRatePpm,
      taxEvidenceByMonth: Array.from({ length: months }, (_, monthIndex) => ({
        ...tax,
        traceId: `tax.financial-projection-v2.seeded.${monthIndex}`,
      })),
      insuranceClaimsByMonth: Array.from({ length: months }, () => null),
      resolvedCashFlowsByMonth: Array.from({ length: months }, () => []),
      market: { kind: "state_seeded", returnModifiersPpm },
    },
  };
}

function shortfallInput(): FinancialProjectionInputV2 {
  const base = fixedGoldenInput();
  const state = goldenState({
    cashCents: moneyCents(100_000),
    taxableBroadIndexCents: moneyCents(0),
    taxableSectorCents: moneyCents(0),
    taxableSpeculativeCents: moneyCents(0),
    revolvingCreditLimitCents: moneyCents(34_467),
  });
  const market = base.assumptions.market;
  if (market.kind !== "fixed") throw new Error("fixed fixture required");
  const firstStep = {
    ...market.steps[0]!,
    nextState: {
      ...market.steps[0]!.nextState,
      regime: state.marketRegime,
      monthsInRegime: state.gameplay.market.monthsInRegime + 1,
      random: market.steps[0]!.nextState.random,
    },
  };
  const tax = base.assumptions.taxEvidenceByMonth[0]!;
  return {
    state,
    months: 3,
    assumptions: {
      version: 1,
      taxableLiquidationCostRatePpm: ratePpm(10_000),
      taxEvidenceByMonth: [
        tax,
        { ...tax, grossIncomeCents: moneyCents(-1) },
        { ...tax, grossIncomeCents: moneyCents(-1) },
      ],
      insuranceClaimsByMonth: [
        {
          type: "health",
          grossAmountCents: moneyCents(200_000),
          covered: true,
        },
        { type: "health", grossAmountCents: moneyCents(-1), covered: true },
        { type: "health", grossAmountCents: moneyCents(-1), covered: true },
      ],
      resolvedCashFlowsByMonth: [
        [
          {
            id: "flow.subscription",
            kind: "recurring_expense",
            amountCents: moneyCents(115_001),
            sourceSystem: "shortfall_fixture",
          },
        ],
        [
          {
            id: "flow.later.invalid",
            kind: "invalid" as never,
            amountCents: moneyCents(1),
            sourceSystem: "must_not_run",
          },
        ],
        [],
      ],
      market: {
        kind: "fixed",
        steps: [firstStep, firstStep, firstStep],
      },
    },
  };
}

function withOpeningState(
  input: FinancialProjectionInputV2,
  state: GameStateV2,
): FinancialProjectionInputV2 {
  return { ...input, state };
}

function withPendingCertificate(state: GameStateV2): GameStateV2 {
  return reduceDetailedFinanceCommand(state, {
    schemaVersion: 2,
    id: "cmd.projection.upskill",
    type: "take_detailed_action",
    expectedRevision: state.revision,
    effectiveMonth: state.currentMonth,
    payload: {
      action: { type: "start_upskill", programId: "upskill.certificate" },
    },
  });
}

function withScheduledMilestone(
  state: GameStateV2,
  targetMonth: string,
): GameStateV2 {
  return manageLifeMilestoneV2(state, {
    schemaVersion: 2,
    id: `cmd.projection.milestone.${targetMonth}`,
    type: "manage_life_milestone",
    expectedRevision: state.revision,
    effectiveMonth: state.currentMonth,
    payload: {
      action: "schedule",
      milestoneId: `milestone.projection.${targetMonth}`,
      kind: "travel",
      label: "Projection horizon fixture",
      targetMonth: simulationMonth(targetMonth),
      estimatedCostCents: moneyCents(100_000),
    },
  });
}

function taxEvidenceForMonth(
  month: string,
  traceId: string,
  employee401kContributionCents = 50_000,
  employeeHsaContributionCents = 20_000,
) {
  const grossIncomeCents = 1_000_000;
  const totalTaxCents = 200_000;
  return {
    schemaVersion: 1 as const,
    traceId,
    economicYear: Number(month.slice(0, 4)),
    policyYear: 2026,
    stateCode: "WA",
    filingStatus: "single",
    provider: "PolicyEngine US" as const,
    bundleVersion: "4.21.0",
    rulesVersion: "1.764.6",
    projectedFromFrozenPolicy: Number(month.slice(0, 4)) !== 2026,
    grossIncomeCents: moneyCents(grossIncomeCents),
    employee401kContributionCents: moneyCents(
      employee401kContributionCents,
    ),
    employeeHsaContributionCents: moneyCents(
      employeeHsaContributionCents,
    ),
    totalTaxCents,
    afterTaxCashIncomeCents: moneyCents(
      grossIncomeCents -
        employee401kContributionCents -
        employeeHsaContributionCents -
        totalTaxCents,
    ),
  };
}

const ZERO_MARKET_MODIFIERS: MarketReturnModifiers = Object.freeze({
  equity: ratePpm(0),
  bonds: ratePpm(0),
  cash: ratePpm(0),
  housing: ratePpm(0),
});

function longRunSeededInput(
  state: GameStateV2,
  months: number,
  tracePrefix: string,
  withMonthlyClaim: boolean,
): FinancialProjectionInputV2 {
  return {
    state,
    months,
    assumptions: {
      version: 1,
      taxableLiquidationCostRatePpm: ratePpm(10_000),
      taxEvidenceByMonth: Array.from({ length: months }, (_, index) => {
        const month = addMonths(state.currentMonth, index);
        return taxEvidenceForMonth(month, `${tracePrefix}.${index}`);
      }),
      insuranceClaimsByMonth: Array.from({ length: months }, () =>
        withMonthlyClaim
          ? {
              type: "health" as const,
              grossAmountCents: moneyCents(50_000),
              covered: true,
            }
          : null,
      ),
      resolvedCashFlowsByMonth: Array.from({ length: months }, () => []),
      market: {
        kind: "state_seeded",
        returnModifiersPpm: ZERO_MARKET_MODIFIERS,
      },
    },
  };
}

function oneMonthInvariantInput(
  state: GameStateV2,
  monthIndex: number,
): FinancialProjectionInputV2 {
  return {
    state,
    months: 1,
    assumptions: {
      version: 1,
      taxableLiquidationCostRatePpm: ratePpm(10_000),
      taxEvidenceByMonth: [
        taxEvidenceForMonth(
          state.currentMonth,
          `tax.projection.invariant.${monthIndex}`,
        ),
      ],
      insuranceClaimsByMonth: [
        {
          type: "health",
          grossAmountCents: moneyCents(50_000),
          covered: true,
        },
      ],
      resolvedCashFlowsByMonth: [[]],
      market: {
        kind: "state_seeded",
        returnModifiersPpm: ZERO_MARKET_MODIFIERS,
      },
    },
  };
}

function assertFinancialStateInvariants(state: GameStateV2): void {
  expect(validateGameStateV2(state)).toEqual([]);
  expect(validateLedger(state.ledger)).toEqual([]);
  expect(reconcileFinancesWithLedger(state.finances, state.ledger)).toEqual(
    state.finances,
  );
  expect(
    Object.values(state.finances).every(Number.isSafeInteger),
  ).toBe(true);
  expect(
    Object.values(state.gameplay.portfolio).every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    ),
  ).toBe(true);
  expect(
    state.gameplay.debts.termDebts.every(
      ({ principalCents, minimumPaymentCents, remainingTermMonths }) =>
        Number.isSafeInteger(principalCents) &&
        principalCents >= 0 &&
        Number.isSafeInteger(minimumPaymentCents) &&
        minimumPaymentCents >= 0 &&
        Number.isSafeInteger(remainingTermMonths) &&
        remainingTermMonths >= 0,
    ),
  ).toBe(true);
  expect(state.finances.creditUsedCents).toBeGreaterThanOrEqual(0);
  expect(state.finances.creditUsedCents).toBeLessThanOrEqual(
    state.finances.creditLimitCents,
  );
  expect(state.finances.cashCents).toBeGreaterThanOrEqual(0);
  expect(state.finances.taxableInvestmentsCents).toBeGreaterThanOrEqual(0);
  expect(state.finances.retirementCents).toBeGreaterThanOrEqual(0);
  expect(state.finances.homeValueCents).toBeGreaterThanOrEqual(0);
  expect(state.finances.otherInvestableAssetsCents).toBeGreaterThanOrEqual(0);
  expect(state.finances.otherAssetsCents).toBeGreaterThanOrEqual(0);
}

function performanceState(): GameStateV2 {
  return goldenState(
    {
      taxableBroadIndexCents: moneyCents(0),
      taxableSectorCents: moneyCents(0),
      taxableSpeculativeCents: moneyCents(0),
      retirement401kCents: moneyCents(0),
      retirementIraCents: moneyCents(0),
      hsaCents: moneyCents(0),
      termDebts: [],
    },
    {
      preTax401kSalaryRatePpm: ratePpm(0),
      preTaxHsaSalaryRatePpm: ratePpm(0),
      afterTaxBroadIndexRatePpm: ratePpm(0),
      afterTaxSectorRatePpm: ratePpm(0),
      afterTaxSpeculativeRatePpm: ratePpm(0),
      afterTaxIraRatePpm: ratePpm(0),
      afterTaxExtraDebtRatePpm: ratePpm(0),
    },
  );
}

function fixedZeroMarketSteps(
  state: GameStateV2,
  months: number,
): readonly MarketSimulationResult[] {
  const steps: MarketSimulationResult[] = [];
  let marketState = marketSimulationState(
    state.marketRegime,
    state.random,
    state.gameplay.market.monthsInRegime,
  );
  for (let index = 0; index < months; index += 1) {
    const sampled = simulateMarketMonth(marketState);
    steps.push({
      ...sampled,
      month: {
        ...sampled.month,
        equityReturnPpm: ratePpm(0),
        bondReturnPpm: ratePpm(0),
        cashReturnPpm: ratePpm(0),
        housingReturnPpm: ratePpm(0),
        inflationPpm: ratePpm(0),
      },
    });
    marketState = sampled.nextState;
  }
  return steps;
}

function performanceInput(months: number): FinancialProjectionInputV2 {
  const state = performanceState();
  return {
    state,
    months,
    assumptions: {
      version: 1,
      taxableLiquidationCostRatePpm: ratePpm(10_000),
      taxEvidenceByMonth: Array.from({ length: months }, (_, index) => {
        const month = addMonths(state.currentMonth, index);
        return taxEvidenceForMonth(
          month,
          `tax.projection.performance.${index}`,
          0,
          0,
        );
      }),
      insuranceClaimsByMonth: Array.from({ length: months }, () => null),
      resolvedCashFlowsByMonth: Array.from({ length: months }, () => []),
      market: { kind: "fixed", steps: fixedZeroMarketSteps(state, months) },
    },
  };
}

describe("projectWithoutEventsV2", () => {
  it("projects one fixed supplied month through the production financial kernel", () => {
    const input = fixedGoldenInput();
    const result = projectWithoutEventsV2(input);

    expect(result).toMatchObject({
      requestedMonths: 1,
      completedMonths: 1,
      stopReason: "completed",
      shortfall: null,
      projectedState: {
        kind: "projected_financial_state_v2",
        state: {
          currentMonth: "2026-08",
          revision: 2,
          outcome: null,
          finances: {
            cashCents: 2_232_766,
            taxableInvestmentsCents: 1_393_107,
            retirementCents: 736_553,
            otherInvestableAssetsCents: 70_000,
            nonCreditLiabilitiesCents: 17_093,
          },
        },
      },
    });
    const commandId = result.generatedCommandIds[0]!;
    expect(result.records).toEqual([{
      version: "2.0.0",
      commandId,
      processedMonth: "2026-07",
      nextMonth: "2026-08",
      openingNetWorthCents: 3_830_000,
      closingNetWorthCents: 4_415_333,
      openingAutomaticLiquidityCents: 4_287_000,
      closingAutomaticLiquidityCents: 4_611_942,
      taxTraceId: "tax.financial-projection-v2.2026-07",
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
    }]);
    expect(result.projectedState.state.finances).toEqual({
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
    expect(result.projectedState.state.gameplay.portfolio).toEqual({
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
    expect(result.projectedState.state.gameplay.debts).toEqual({
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
    expect(result.projectedState.state.gameplay.contributions).toEqual({
      policyYear: 2026,
      employee401kCents: 50_000,
      employer401kCents: 40_000,
      iraCents: 46_553,
      hsaCents: 20_000,
    });
    expect(result.projectedState.state.gameplay.insurance).toEqual({
      policyYear: 2026,
      healthDeductiblePaidCents: 180_000,
      healthOutOfPocketPaidCents: 184_000,
      coverageUsage: [{ coverageId: "insurance.renters", usedCents: 0 }],
    });
    expect(result.projectedState.state.gameplay.market).toEqual({
      modelVersion: "regime-v1",
      monthsInRegime: 1,
      cumulativePriceIndexPpm: 1_000_000,
    });
    expect(result.projectedState.state.random).toEqual({
      algorithm: "mulberry32-v1",
      value: 2_637_419_378,
    });
    expect(result.projectedState.state.acceptedCommandIds).toEqual([
      "cmd.strategy.financial-projection-v2",
      commandId,
    ]);
    expect(result.projectedState.state).not.toHaveProperty(
      "closingStateKind",
    );
    expect(Object.isFrozen(result.records)).toBe(true);
    expect(Object.isFrozen(result.projectedState.state)).toBe(true);
    expect(result.generatedCommandIds).toEqual([
      result.projectedState.state.acceptedCommandIds.at(-1),
    ]);
    expect(result.projectedState.generatedCommandIds).toEqual(
      result.generatedCommandIds,
    );
    expect(result.projectedState.assumptionFingerprint).toBe(
      result.assumptionFingerprint,
    );
    expect(result.projectedState.state.gameplay.exposure).toEqual(
      input.state.gameplay.exposure,
    );
    expect(result.projectedState.state.gameplay.careerDevelopment).toEqual(
      input.state.gameplay.careerDevelopment,
    );
    expect(result.projectedState.state.gameplay.eventLifecycle).toEqual(
      input.state.gameplay.eventLifecycle,
    );
  });

  it.each([
    [
      "unsupported assumption version",
      (input: FinancialProjectionInputV2) => ({
        ...input,
        assumptions: { ...input.assumptions, version: 2 as never },
      }),
      "UNSUPPORTED_ASSUMPTION_VERSION",
    ],
    [
      "negative month count",
      (input: FinancialProjectionInputV2) => ({ ...input, months: -1 }),
      "INVALID_MONTH_COUNT",
    ],
    [
      "fractional month count",
      (input: FinancialProjectionInputV2) => ({ ...input, months: 1.5 }),
      "INVALID_MONTH_COUNT",
    ],
    [
      "month count above the public bound",
      (input: FinancialProjectionInputV2) => ({
        ...input,
        months: MAX_FINANCIAL_PROJECTION_MONTHS_V2 + 1,
      }),
      "INVALID_MONTH_COUNT",
    ],
    [
      "missing tax evidence",
      (input: FinancialProjectionInputV2) => ({
        ...input,
        assumptions: { ...input.assumptions, taxEvidenceByMonth: [] },
      }),
      "TAX_EVIDENCE_LENGTH_MISMATCH",
    ],
    [
      "extra tax evidence",
      (input: FinancialProjectionInputV2) => ({
        ...input,
        assumptions: {
          ...input.assumptions,
          taxEvidenceByMonth: [
            ...input.assumptions.taxEvidenceByMonth,
            input.assumptions.taxEvidenceByMonth[0]!,
          ],
        },
      }),
      "TAX_EVIDENCE_LENGTH_MISMATCH",
    ],
    [
      "missing claim evidence",
      (input: FinancialProjectionInputV2) => ({
        ...input,
        assumptions: { ...input.assumptions, insuranceClaimsByMonth: [] },
      }),
      "INSURANCE_CLAIM_LENGTH_MISMATCH",
    ],
    [
      "extra claim evidence",
      (input: FinancialProjectionInputV2) => ({
        ...input,
        assumptions: {
          ...input.assumptions,
          insuranceClaimsByMonth: [
            ...input.assumptions.insuranceClaimsByMonth,
            null,
          ],
        },
      }),
      "INSURANCE_CLAIM_LENGTH_MISMATCH",
    ],
    [
      "missing resolved-flow evidence",
      (input: FinancialProjectionInputV2) => ({
        ...input,
        assumptions: { ...input.assumptions, resolvedCashFlowsByMonth: [] },
      }),
      "RESOLVED_FLOW_LENGTH_MISMATCH",
    ],
    [
      "extra resolved-flow evidence",
      (input: FinancialProjectionInputV2) => ({
        ...input,
        assumptions: {
          ...input.assumptions,
          resolvedCashFlowsByMonth: [
            ...input.assumptions.resolvedCashFlowsByMonth,
            [],
          ],
        },
      }),
      "RESOLVED_FLOW_LENGTH_MISMATCH",
    ],
    [
      "missing fixed market step",
      (input: FinancialProjectionInputV2) => ({
        ...input,
        assumptions: {
          ...input.assumptions,
          market: { kind: "fixed" as const, steps: [] },
        },
      }),
      "FIXED_MARKET_LENGTH_MISMATCH",
    ],
    [
      "extra fixed market step",
      (input: FinancialProjectionInputV2) => {
        const market = input.assumptions.market;
        if (market.kind !== "fixed") throw new Error("fixed fixture required");
        return {
          ...input,
          assumptions: {
            ...input.assumptions,
            market: {
              kind: "fixed" as const,
              steps: [...market.steps, market.steps[0]!],
            },
          },
        };
      },
      "FIXED_MARKET_LENGTH_MISMATCH",
    ],
    [
      "negative liquidation rate",
      (input: FinancialProjectionInputV2) => ({
        ...input,
        assumptions: {
          ...input.assumptions,
          taxableLiquidationCostRatePpm: -1 as never,
        },
      }),
      "INVALID_LIQUIDATION_RATE",
    ],
    [
      "liquidation rate above one million",
      (input: FinancialProjectionInputV2) => ({
        ...input,
        assumptions: {
          ...input.assumptions,
          taxableLiquidationCostRatePpm: 1_000_001 as never,
        },
      }),
      "INVALID_LIQUIDATION_RATE",
    ],
    [
      "invalid state-seeded return modifier",
      (input: FinancialProjectionInputV2) => ({
        ...input,
        assumptions: {
          ...input.assumptions,
          market: {
            kind: "state_seeded" as const,
            returnModifiersPpm: {
              equity: 500_001 as never,
              bonds: ratePpm(0),
              cash: ratePpm(0),
              housing: ratePpm(0),
            },
          },
        },
      }),
      "INVALID_MARKET_POLICY",
    ],
    [
      "malformed state-seeded return modifiers",
      (input: FinancialProjectionInputV2) => ({
        ...input,
        assumptions: {
          ...input.assumptions,
          market: {
            kind: "state_seeded" as const,
            returnModifiersPpm: {
              equity: ratePpm(0),
              bonds: ratePpm(0),
              cash: ratePpm(0),
              wrong: ratePpm(0),
            } as never,
          },
        },
      }),
      "INVALID_MARKET_POLICY",
    ],
    [
      "unknown market policy",
      (input: FinancialProjectionInputV2) => ({
        ...input,
        assumptions: {
          ...input.assumptions,
          market: { kind: "callback" } as never,
        },
      }),
      "INVALID_MARKET_POLICY",
    ],
  ] as const)("rejects %s before projection", (_label, mutate, code) => {
    const invalid = mutate(fixedGoldenInput());

    expect(() => projectWithoutEventsV2(invalid)).toThrow(
      FinancialProjectionV2Error,
    );
    expect(() => projectWithoutEventsV2(invalid)).toThrow(
      expect.objectContaining({ code }),
    );
  });

  it("canonically fingerprints the complete fixed assumption packet and emits bounded deterministic ids", () => {
    const input = fixedGoldenInput();
    const first = projectWithoutEventsV2(input);
    const second = projectWithoutEventsV2(fixedGoldenInput());

    expect(first.assumptionFingerprint).toBe(
      "d976973f211e2c09fd7c292453fb37ffd13ddcdc413fc7dc8cfdee2db761cdef",
    );
    expect(first.generatedCommandIds).toEqual([
      "cmd.projection.e1d2b283fd0a31977bfef4803422ee2a031d737910344b653e6d76770371f48e",
    ]);
    expect(first.assumptionFingerprint).toBe(second.assumptionFingerprint);
    expect(first.generatedCommandIds).toEqual(second.generatedCommandIds);
    expect(first.records).toEqual(second.records);
    expect(first.projectedState.state.ledger).toEqual(
      second.projectedState.state.ledger,
    );
    expect(first.projectedState.state.random).toEqual(
      second.projectedState.state.random,
    );
    expect(sha256Canonical(first.projectedState.state)).toBe(
      sha256Canonical(second.projectedState.state),
    );
    expect(first.generatedCommandIds[0]).toMatch(
      /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,95}$/,
    );
    expect(first.generatedCommandIds[0]!.length).toBeLessThanOrEqual(96);
  });

  it.each([
    [
      "tax line",
      (input: FinancialProjectionInputV2) => ({
        ...input,
        assumptions: {
          ...input.assumptions,
          taxEvidenceByMonth: [
            {
              ...input.assumptions.taxEvidenceByMonth[0]!,
              traceId: "tax.financial-projection-v2.changed",
            },
          ],
        },
      }),
    ],
    [
      "claim",
      (input: FinancialProjectionInputV2) => ({
        ...input,
        assumptions: {
          ...input.assumptions,
          insuranceClaimsByMonth: [
            {
              type: "health" as const,
              grossAmountCents: moneyCents(200_001),
              covered: true,
            },
          ],
        },
      }),
    ],
    [
      "resolved flow",
      (input: FinancialProjectionInputV2) => ({
        ...input,
        assumptions: {
          ...input.assumptions,
          resolvedCashFlowsByMonth: [
            [
              {
                ...input.assumptions.resolvedCashFlowsByMonth[0]![0]!,
                amountCents: moneyCents(500_001),
              },
              input.assumptions.resolvedCashFlowsByMonth[0]![1]!,
            ],
          ],
        },
      }),
    ],
    [
      "fixed market step",
      (input: FinancialProjectionInputV2) => {
        const market = input.assumptions.market;
        if (market.kind !== "fixed") throw new Error("fixed fixture required");
        return {
          ...input,
          assumptions: {
            ...input.assumptions,
            market: {
              kind: "fixed" as const,
              steps: [
                {
                  ...market.steps[0]!,
                  month: {
                    ...market.steps[0]!.month,
                    equityReturnPpm: ratePpm(1),
                  },
                },
              ],
            },
          },
        };
      },
    ],
    [
      "liquidation rate",
      (input: FinancialProjectionInputV2) => ({
        ...input,
        assumptions: {
          ...input.assumptions,
          taxableLiquidationCostRatePpm: ratePpm(10_001),
        },
      }),
    ],
  ] as const)("changes the fingerprint when one %s changes", (_label, mutate) => {
    const base = projectWithoutEventsV2(fixedGoldenInput());
    const changed = projectWithoutEventsV2(mutate(fixedGoldenInput()));

    expect(changed.assumptionFingerprint).not.toBe(base.assumptionFingerprint);
    expect(changed.generatedCommandIds).not.toEqual(base.generatedCommandIds);
    expect(changed.records).not.toEqual(base.records);
  });

  it("does not mutate or freeze caller-owned mutable projection input", () => {
    const input = structuredClone(fixedGoldenInput());
    const checksum = sha256Canonical(input);
    const ownership = {
      state: Object.isFrozen(input.state),
      ledger: Object.isFrozen(input.state.ledger),
      gameplay: Object.isFrozen(input.state.gameplay),
      portfolio: Object.isFrozen(input.state.gameplay.portfolio),
      assumptions: Object.isFrozen(input.assumptions),
      tax: Object.isFrozen(input.assumptions.taxEvidenceByMonth),
      taxEntry: Object.isFrozen(input.assumptions.taxEvidenceByMonth[0]),
      claims: Object.isFrozen(input.assumptions.insuranceClaimsByMonth),
      claimEntry: Object.isFrozen(input.assumptions.insuranceClaimsByMonth[0]),
      flows: Object.isFrozen(input.assumptions.resolvedCashFlowsByMonth),
      flowMonth: Object.isFrozen(
        input.assumptions.resolvedCashFlowsByMonth[0],
      ),
      flowEntry: Object.isFrozen(
        input.assumptions.resolvedCashFlowsByMonth[0]![0],
      ),
      market: Object.isFrozen(input.assumptions.market),
      marketSteps:
        input.assumptions.market.kind === "fixed"
          ? Object.isFrozen(input.assumptions.market.steps)
          : null,
      marketStep:
        input.assumptions.market.kind === "fixed"
          ? Object.isFrozen(input.assumptions.market.steps[0])
          : null,
      marketMonth:
        input.assumptions.market.kind === "fixed"
          ? Object.isFrozen(input.assumptions.market.steps[0]!.month)
          : null,
      marketRandom:
        input.assumptions.market.kind === "fixed"
          ? Object.isFrozen(input.assumptions.market.steps[0]!.nextState.random)
          : null,
    };

    const result = projectWithoutEventsV2(input);

    expect(sha256Canonical(input)).toBe(checksum);
    expect({
      state: Object.isFrozen(input.state),
      ledger: Object.isFrozen(input.state.ledger),
      gameplay: Object.isFrozen(input.state.gameplay),
      portfolio: Object.isFrozen(input.state.gameplay.portfolio),
      assumptions: Object.isFrozen(input.assumptions),
      tax: Object.isFrozen(input.assumptions.taxEvidenceByMonth),
      taxEntry: Object.isFrozen(input.assumptions.taxEvidenceByMonth[0]),
      claims: Object.isFrozen(input.assumptions.insuranceClaimsByMonth),
      claimEntry: Object.isFrozen(input.assumptions.insuranceClaimsByMonth[0]),
      flows: Object.isFrozen(input.assumptions.resolvedCashFlowsByMonth),
      flowMonth: Object.isFrozen(
        input.assumptions.resolvedCashFlowsByMonth[0],
      ),
      flowEntry: Object.isFrozen(
        input.assumptions.resolvedCashFlowsByMonth[0]![0],
      ),
      market: Object.isFrozen(input.assumptions.market),
      marketSteps:
        input.assumptions.market.kind === "fixed"
          ? Object.isFrozen(input.assumptions.market.steps)
          : null,
      marketStep:
        input.assumptions.market.kind === "fixed"
          ? Object.isFrozen(input.assumptions.market.steps[0])
          : null,
      marketMonth:
        input.assumptions.market.kind === "fixed"
          ? Object.isFrozen(input.assumptions.market.steps[0]!.month)
          : null,
      marketRandom:
        input.assumptions.market.kind === "fixed"
          ? Object.isFrozen(input.assumptions.market.steps[0]!.nextState.random)
          : null,
    }).toEqual(ownership);
    expect(result.projectedState.state).not.toBe(input.state);
  });

  it("returns an immutable branded state for a zero-month mutable projection", () => {
    const oneMonth = fixedGoldenInput();
    const mutableState = structuredClone(oneMonth.state);
    const input: FinancialProjectionInputV2 = {
      state: mutableState,
      months: 0,
      assumptions: {
        version: 1,
        taxableLiquidationCostRatePpm: ratePpm(10_000),
        taxEvidenceByMonth: [],
        insuranceClaimsByMonth: [],
        resolvedCashFlowsByMonth: [],
        market: { kind: "fixed", steps: [] },
      },
    };

    const result = projectWithoutEventsV2(input);

    expect(result).toMatchObject({
      requestedMonths: 0,
      completedMonths: 0,
      records: [],
      generatedCommandIds: [],
      stopReason: "completed",
      shortfall: null,
      projectedState: {
        kind: "projected_financial_state_v2",
        state: {
          currentMonth: mutableState.currentMonth,
          revision: mutableState.revision,
        },
      },
    });
    expect(Object.isFrozen(mutableState)).toBe(false);
    expect(Object.isFrozen(mutableState.ledger)).toBe(false);
    expect(Object.isFrozen(result.projectedState.state)).toBe(true);
    expect(Object.isFrozen(result.projectedState.state.ledger)).toBe(true);
    expect(result.projectedState.state).not.toBe(mutableState);
  });

  it("rejects an invalid opening state with a projection-owned structured error", () => {
    const input = fixedGoldenInput();
    const invalid = {
      ...input,
      state: { ...input.state, runId: "" },
    } as FinancialProjectionInputV2;

    expect(() => projectWithoutEventsV2(invalid)).toThrow(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });

  it("rejects non-serializable assumption data before completing a month", () => {
    const input = fixedGoldenInput();
    const invalid = {
      ...input,
      assumptions: {
        ...input.assumptions,
        unsupportedCallback: () => 1,
      },
    } as FinancialProjectionInputV2;

    expect(() => projectWithoutEventsV2(invalid)).toThrow(
      expect.objectContaining({ code: "INVALID_ASSUMPTION_PACKET" }),
    );
  });

  it("delegates month-specific tax validation to the production kernel atomically", () => {
    const input = fixedGoldenInput();
    const invalid: FinancialProjectionInputV2 = {
      ...input,
      assumptions: {
        ...input.assumptions,
        taxEvidenceByMonth: [
          {
            ...input.assumptions.taxEvidenceByMonth[0]!,
            grossIncomeCents: moneyCents(999_999),
          },
        ],
      },
    };
    const openingChecksum = sha256Canonical(invalid.state);

    let error: unknown = null;
    try {
      projectWithoutEventsV2(invalid);
    } catch (cause) {
      error = cause;
    }

    expect(error).toMatchObject({
      code: "INVALID_MONTH_EVIDENCE",
      cause: { code: "INVALID_TAX_EVIDENCE" },
    });
    expect(sha256Canonical(invalid.state)).toBe(openingChecksum);
    expect(invalid.state.currentMonth).toBe("2026-07");
    expect(invalid.state.revision).toBe(1);
  });

  it.each([
    [
      "claim",
      (input: FinancialProjectionInputV2) => ({
        ...input,
        assumptions: {
          ...input.assumptions,
          insuranceClaimsByMonth: [
            {
              type: "health" as const,
              grossAmountCents: moneyCents(-1),
              covered: true,
            },
          ],
        },
      }),
    ],
    [
      "resolved cash flow",
      (input: FinancialProjectionInputV2) => ({
        ...input,
        assumptions: {
          ...input.assumptions,
          resolvedCashFlowsByMonth: [
            [
              {
                id: "flow.invalid",
                kind: "invalid" as never,
                amountCents: moneyCents(1),
                sourceSystem: "projection_fixture",
              },
            ],
          ],
        },
      }),
    ],
    [
      "fixed market step",
      (input: FinancialProjectionInputV2) => {
        const market = input.assumptions.market;
        if (market.kind !== "fixed") throw new Error("fixed fixture required");
        return {
          ...input,
          assumptions: {
            ...input.assumptions,
            market: {
              kind: "fixed" as const,
              steps: [
                {
                  ...market.steps[0]!,
                  month: {
                    ...market.steps[0]!.month,
                    regime: "recession" as const,
                  },
                },
              ],
            },
          },
        };
      },
    ],
  ] as const)(
    "delegates invalid %s evidence to a production boundary",
    (_label, mutate) => {
      const input = mutate(fixedGoldenInput());
      const checksum = sha256Canonical(input.state);

      expect(() => projectWithoutEventsV2(input)).toThrow(
        expect.objectContaining({ code: "INVALID_MONTH_EVIDENCE" }),
      );
      expect(sha256Canonical(input.state)).toBe(checksum);
    },
  );

  it("matches the production seeded market sampler and advances its RNG exactly once per completed month", () => {
    const modifiers: MarketReturnModifiers = {
      equity: ratePpm(2_000),
      bonds: ratePpm(-1_000),
      cash: ratePpm(500),
      housing: ratePpm(1_500),
    };
    const input = stateSeededInput(3, modifiers);
    const expectedSteps = [];
    let expectedMarketState = marketSimulationState(
      input.state.marketRegime,
      input.state.random,
      input.state.gameplay.market.monthsInRegime,
    );
    for (let monthIndex = 0; monthIndex < input.months; monthIndex += 1) {
      const step = simulateMarketMonth(expectedMarketState, modifiers);
      expectedSteps.push(step);
      expectedMarketState = step.nextState;
    }

    const result = projectWithoutEventsV2(input);
    const addedTransactions = result.projectedState.state.ledger.transactions.slice(
      input.state.ledger.transactions.length,
    );

    expect(result.records.map(({ market }) => market)).toEqual(
      expectedSteps.map(({ month }) => month),
    );
    expect(result.projectedState.state.random).toEqual(
      expectedMarketState.random,
    );
    expect(result.projectedState.state.marketRegime).toBe(
      expectedMarketState.regime,
    );
    expect(result.projectedState.state.gameplay.market.monthsInRegime).toBe(
      expectedMarketState.monthsInRegime,
    );
    expect(result.completedMonths).toBe(3);
    expect(result.projectedState.state.revision).toBe(input.state.revision + 3);
    expect(result.generatedCommandIds).toHaveLength(3);
    expect(new Set(result.generatedCommandIds).size).toBe(3);
    expect(
      addedTransactions.filter(
        ({ reasonCode }) => reasonCode === "monthly_payroll_v2",
      ),
    ).toHaveLength(3);
  });

  it("includes state-seeded return modifiers in the canonical fingerprint", () => {
    const zero = {
      equity: ratePpm(0),
      bonds: ratePpm(0),
      cash: ratePpm(0),
      housing: ratePpm(0),
    };
    const changed = { ...zero, equity: ratePpm(1) };

    const first = projectWithoutEventsV2(stateSeededInput(1, zero));
    const second = projectWithoutEventsV2(stateSeededInput(1, changed));

    expect(second.assumptionFingerprint).not.toBe(first.assumptionFingerprint);
    expect(second.generatedCommandIds).not.toEqual(first.generatedCommandIds);
    expect(second.records[0]!.market.appliedReturnModifiersPpm).toEqual(
      changed,
    );
  });

  it("includes the requested horizon in deterministic fingerprint and id generation", () => {
    const oneMonth = projectWithoutEventsV2(
      stateSeededInput(1, ZERO_MARKET_MODIFIERS),
    );
    const twoMonths = projectWithoutEventsV2(
      stateSeededInput(2, ZERO_MARKET_MODIFIERS),
    );

    expect(twoMonths.assumptionFingerprint).not.toBe(
      oneMonth.assumptionFingerprint,
    );
    expect(twoMonths.generatedCommandIds[0]).not.toBe(
      oneMonth.generatedCommandIds[0],
    );
    expect(twoMonths.completedMonths).toBe(2);
  });

  it("accepts and records an exact one-cent shortfall month, then stops before later evidence", () => {
    const input = shortfallInput();
    const result = projectWithoutEventsV2(input);
    const addedTransactions = result.projectedState.state.ledger.transactions.slice(
      input.state.ledger.transactions.length,
    );

    expect(result).toMatchObject({
      requestedMonths: 3,
      completedMonths: 1,
      stopReason: "shortfall",
      shortfall: {
        requiredCashCents: 864_468,
        residualShortfallCents: 1,
        fundingPlan: {
          cashAvailableCents: 830_000,
          remainingCreditCents: 34_467,
          creditUsedCents: 34_467,
          residualShortfallCents: 1,
          fullyFunded: false,
        },
      },
      projectedState: {
        state: {
          currentMonth: "2026-08",
          revision: 2,
          outcome: null,
          finances: {
            cashCents: 830_000,
            creditUsedCents: 0,
            nonCreditLiabilitiesCents: 120_000,
          },
        },
      },
    });
    expect(result.records).toHaveLength(1);
    expect(result.generatedCommandIds).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      processedMonth: "2026-07",
      nextMonth: "2026-08",
      resolvedExpenseCents: 115_001,
      requiredCashCents: 864_468,
      nonDebtObligationsPaidCents: 0,
      funding: null,
      recurringAllocations: null,
      shortfall: { residualShortfallCents: 1 },
    });
    expect(result.records[0]!.shortfall).toBe(result.shortfall);
    expect(addedTransactions.map(({ reasonCode }) => reasonCode)).toEqual([
      "monthly_payroll_v2",
    ]);
    expect(
      addedTransactions.some(
        ({ sourceSystem }) => sourceSystem === "must_not_run",
      ),
    ).toBe(false);
    expect(result.projectedState.state.gameplay.exposure).toEqual(
      input.state.gameplay.exposure,
    );
    expect(result.projectedState.state.gameplay.eventLifecycle).toEqual(
      input.state.gameplay.eventLifecycle,
    );
  });

  it.each([
    [
      "pending personal event",
      (state: GameStateV2) => {
        const exposed = recordExposureSnapshotV2(state, state.currentMonth);
        const scheduled = schedulePersonalEventV2(exposed, {
          version: "fairness-v1",
          minimumChancePpm: 1_000_000,
          maximumChancePpm: 1_000_000,
        });
        if (!scheduled.event) throw new Error("event fixture was not scheduled");
        const randomized = finalizeGameStateV2({
          ...exposed,
          random: scheduled.nextRandom,
        });
        return queueScheduledPersonalEventV2(randomized, scheduled.event);
      },
    ],
    [
      "terminal outcome",
      (state: GameStateV2) =>
        finalizeGameStateV2({
          ...state,
          outcome: {
            kind: "bankruptcy",
            grade: "F",
            reachedMonth: state.currentMonth,
            reasonCode: "projection_fixture",
          },
        }),
    ],
  ] as const)("rejects unsupported %s before partial work", (_label, prepare) => {
    const base = fixedGoldenInput();
    const state = prepare(base.state);
    const openingChecksum = sha256Canonical(state);

    expect(() =>
      projectWithoutEventsV2(withOpeningState(base, state)),
    ).toThrow(
      expect.objectContaining({ code: "UNSUPPORTED_NONFINANCIAL_LIFECYCLE" }),
    );
    expect(sha256Canonical(state)).toBe(openingChecksum);
    expect(state.currentMonth).toBe("2026-07");
  });

  it("retains pending career work that completes after the projection horizon", () => {
    const base = fixedGoldenInput();
    const state = withPendingCertificate(base.state);

    const result = projectWithoutEventsV2(withOpeningState(base, state));

    expect(result.completedMonths).toBe(1);
    expect(result.projectedState.state.currentMonth).toBe("2026-08");
    expect(result.projectedState.state.gameplay.careerDevelopment).toEqual(
      state.gameplay.careerDevelopment,
    );
    expect(
      result.projectedState.state.gameplay.careerDevelopment.pending[0]
        ?.completesMonth,
    ).toBe("2026-10");
  });

  it("rejects a career completion inside the projection horizon before partial work", () => {
    const base = stateSeededInput(3, ZERO_MARKET_MODIFIERS);
    const state = withPendingCertificate(base.state);
    const openingChecksum = sha256Canonical(state);

    expect(() =>
      projectWithoutEventsV2(withOpeningState(base, state)),
    ).toThrow(
      expect.objectContaining({ code: "UNSUPPORTED_NONFINANCIAL_LIFECYCLE" }),
    );
    expect(sha256Canonical(state)).toBe(openingChecksum);
    expect(state.currentMonth).toBe("2026-07");
    expect(state.revision).toBe(2);
  });

  it("retains an active macro story that remains valid through the projection horizon", () => {
    const base = fixedGoldenInput();
    const state = advanceMacroStoriesV2(base.state, {
      version: "macro-story-v1",
      monthlyChancePpm: 1_000_000,
      minimumDurationMonths: 2,
      maximumDurationMonths: 2,
    });

    const result = projectWithoutEventsV2(withOpeningState(base, state));

    expect(result.completedMonths).toBe(1);
    expect(result.projectedState.state.currentMonth).toBe("2026-08");
    expect(result.projectedState.state.gameplay.eventLifecycle).toEqual(
      state.gameplay.eventLifecycle,
    );
    expect(
      result.projectedState.state.gameplay.eventLifecycle.macroStories[0]
        ?.expiresMonth,
    ).toBe("2026-08");
  });

  it("rejects a macro story that expires inside the projection horizon", () => {
    const base = stateSeededInput(2, ZERO_MARKET_MODIFIERS);
    const state = advanceMacroStoriesV2(base.state, {
      version: "macro-story-v1",
      monthlyChancePpm: 1_000_000,
      minimumDurationMonths: 2,
      maximumDurationMonths: 2,
    });
    const openingChecksum = sha256Canonical(state);

    expect(() =>
      projectWithoutEventsV2(withOpeningState(base, state)),
    ).toThrow(
      expect.objectContaining({ code: "UNSUPPORTED_NONFINANCIAL_LIFECYCLE" }),
    );
    expect(sha256Canonical(state)).toBe(openingChecksum);
    expect(state.currentMonth).toBe("2026-07");
  });

  it("rejects a life milestone decision due inside the projection horizon", () => {
    const base = fixedGoldenInput();
    const state = withScheduledMilestone(base.state, "2026-08");
    const openingChecksum = sha256Canonical(state);

    expect(() =>
      projectWithoutEventsV2(withOpeningState(base, state)),
    ).toThrow(
      expect.objectContaining({ code: "UNSUPPORTED_NONFINANCIAL_LIFECYCLE" }),
    );
    expect(sha256Canonical(state)).toBe(openingChecksum);
    expect(state.currentMonth).toBe("2026-07");
  });

  it("retains a scheduled life milestone beyond the projection horizon", () => {
    const base = fixedGoldenInput();
    const state = withScheduledMilestone(base.state, "2026-09");

    const result = projectWithoutEventsV2(withOpeningState(base, state));

    expect(result.completedMonths).toBe(1);
    expect(result.projectedState.state.currentMonth).toBe("2026-08");
    expect(result.projectedState.state.gameplay.lifeMilestones).toEqual(
      state.gameplay.lifeMilestones,
    );
  });

  it("retains valid historical lifecycle cooldown evidence without orchestrating it", () => {
    const base = fixedGoldenInput();
    const state = finalizeGameStateV2({
      ...base.state,
      gameplay: {
        ...base.state.gameplay,
        eventLifecycle: {
          ...base.state.gameplay.eventLifecycle,
          cooldowns: [
            {
              templateId: "personal.medical_bill",
              eligibleAgainMonth: simulationMonth("2027-01"),
            },
          ],
        },
      },
    });

    const result = projectWithoutEventsV2(withOpeningState(base, state));

    expect(result.projectedState.state.gameplay.eventLifecycle.cooldowns).toEqual(
      state.gameplay.eventLifecycle.cooldowns,
    );
    expect(result.projectedState.state.gameplay.eventLifecycle.pending).toBeNull();
    expect(result.projectedState.state.gameplay.eventLifecycle.macroStories).toEqual(
      [],
    );
  });

  it("preserves financial invariants and annual resets across sixty accepted months", () => {
    const initial = fixedGoldenInput().state;
    let state = initial;
    let previousContributions = state.gameplay.contributions;
    let previousInsurance = state.gameplay.insurance;

    for (let monthIndex = 0; monthIndex < 60; monthIndex += 1) {
      const openingMonth = state.currentMonth;
      const openingRevision = state.revision;
      const openingAcceptedIds = state.acceptedCommandIds;
      const result = projectWithoutEventsV2(
        oneMonthInvariantInput(state, monthIndex),
      );
      const accepted = result.projectedState.state;
      const snapshot = accepted.gameplay.catalogSnapshot!;
      const contributions = accepted.gameplay.contributions;
      const insurance = accepted.gameplay.insurance;
      const year = Number(openingMonth.slice(0, 4));

      expect(result).toMatchObject({
        requestedMonths: 1,
        completedMonths: 1,
        stopReason: "completed",
        shortfall: null,
      });
      expect(result.records).toHaveLength(1);
      expect(result.records[0]).toMatchObject({
        processedMonth: openingMonth,
        nextMonth: addMonths(openingMonth, 1),
        commandId: result.generatedCommandIds[0],
        shortfall: null,
        fundingPlan: { fullyFunded: true, residualShortfallCents: 0 },
      });
      expect(accepted.currentMonth).toBe(addMonths(openingMonth, 1));
      expect(accepted.revision).toBe(openingRevision + 1);
      expect(accepted.acceptedCommandIds).toEqual([
        ...openingAcceptedIds,
        result.generatedCommandIds[0],
      ]);
      expect(accepted.outcome).toBeNull();
      expect(accepted.gameplay.exposure).toEqual(initial.gameplay.exposure);
      expect(accepted.gameplay.careerDevelopment).toEqual(
        initial.gameplay.careerDevelopment,
      );
      expect(accepted.gameplay.eventLifecycle).toEqual(
        initial.gameplay.eventLifecycle,
      );
      assertFinancialStateInvariants(accepted);

      expect(contributions.policyYear).toBe(year);
      expect(insurance.policyYear).toBe(year);
      expect(contributions.employee401kCents).toBeLessThanOrEqual(
        snapshot.selected.benefitPolicy
          .employeeRetirementContributionLimitCents,
      );
      expect(contributions.iraCents).toBeLessThanOrEqual(
        snapshot.selected.benefitPolicy.iraContributionLimitCents,
      );
      expect(contributions.hsaCents).toBeLessThanOrEqual(
        snapshot.derived.hsaAnnualContributionLimitCents!,
      );
      expect(
        contributions.employee401kCents + contributions.employer401kCents,
      ).toBeLessThanOrEqual(
        snapshot.selected.benefitPolicy.definedContributionAdditionLimitCents,
      );
      if (openingMonth.endsWith("-01")) {
        expect(contributions).toMatchObject({
          employee401kCents: 50_000,
          employer401kCents: 40_000,
          hsaCents: 20_000,
        });
        expect(contributions.employee401kCents).toBeLessThan(
          previousContributions.employee401kCents,
        );
        expect(insurance).toMatchObject({
          healthDeductiblePaidCents: 50_000,
          healthOutOfPocketPaidCents: 50_000,
        });
        expect(insurance.healthOutOfPocketPaidCents).toBeLessThan(
          previousInsurance.healthOutOfPocketPaidCents,
        );
      }

      previousContributions = contributions;
      previousInsurance = insurance;
      state = accepted;
    }

    expect(state.currentMonth).toBe(addMonths(initial.currentMonth, 60));
    expect(state.revision).toBe(initial.revision + 60);
    expect(state.acceptedCommandIds).toHaveLength(
      initial.acceptedCommandIds.length + 60,
    );

    const combined = projectWithoutEventsV2(
      longRunSeededInput(initial, 60, "tax.projection.long", true),
    );
    expect(combined.completedMonths).toBe(60);
    expect(combined.records).toHaveLength(60);
    expect(combined.generatedCommandIds).toHaveLength(60);
    expect(new Set(combined.generatedCommandIds).size).toBe(60);
    expect(combined.records.map(({ processedMonth }) => processedMonth)).toEqual(
      Array.from({ length: 60 }, (_, index) =>
        addMonths(initial.currentMonth, index),
      ),
    );
    expect(combined.projectedState.state).toMatchObject({
      currentMonth: state.currentMonth,
      revision: state.revision,
      finances: state.finances,
      random: state.random,
      marketRegime: state.marketRegime,
      gameplay: {
        portfolio: state.gameplay.portfolio,
        debts: state.gameplay.debts,
        contributions: state.gameplay.contributions,
        insurance: state.gameplay.insurance,
        market: state.gameplay.market,
      },
    });
    assertFinancialStateInvariants(combined.projectedState.state);
  }, 15_000);

  it(
    "projects 480 headless fixed-evidence months within budget",
    { timeout: 15_000 },
    () => {
      projectWithoutEventsV2(performanceInput(3));
      const input = performanceInput(480);

      const started = performance.now();
      const result = projectWithoutEventsV2(input);
      const elapsedMs = performance.now() - started;

      expect(result.completedMonths).toBe(480);
      expect(result.records).toHaveLength(480);
      expect(result.stopReason).toBe("completed");
      expect(result.shortfall).toBeNull();
      expect(result.projectedState.state.currentMonth).toBe(
        addMonths(input.state.currentMonth, 480),
      );
      expect(result.projectedState.state.revision).toBe(
        input.state.revision + 480,
      );
      expect(result.generatedCommandIds).toHaveLength(480);
      expect(new Set(result.generatedCommandIds).size).toBe(480);
      assertFinancialStateInvariants(result.projectedState.state);
      expect(elapsedMs).toBeLessThan(8_000);
    },
  );
});
