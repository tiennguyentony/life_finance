import { describe, expect, it } from "vitest";

import { sha256Canonical } from "../canonical";
import { ACTION_POLICY_V1_VERSION } from "../action-policy-v2";
import { reduceDetailedFinanceCommand } from "../detailed-actions-v2";
import { moneyCents, multiplyMoneyByRate, ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import { validateLedger } from "../ledger";
import { MACRO_MARKET_MODEL_V2_VERSION } from "../market";
import { finalizeGameStateV2 } from "../game-state-v2";
import {
  FINANCIAL_KERNEL_V2_VERSION,
  processMonthlyTurnV2,
} from "../monthly-turn-v2";
import { createNativeGameStateV2 } from "../native-game-state-v2";
import { setRecurringStrategy } from "../recurring-strategy-v2";
import { resolveScenarioCatalogSelection } from "../scenario-catalog";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";
import { decodePersistedGameCommandV2 } from "../../server/db/persisted-command-v2";

function integratedState() {
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
    runId: "run.kernel-v2.integration",
    playerId: "player.kernel-v2.integration",
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "kernel-v2-real-integration",
    resolvedScenario,
    annualGrossSalaryCents: moneyCents(12_000_000),
    finances: {
      cashCents: moneyCents(1_000_000),
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
          id: "debt.kernel-v2.integration",
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
    id: "cmd.kernel-v2.integration.strategy",
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

const resolvedCashFlows = [
  {
    id: "flow.integration.other-income",
    kind: "other_income",
    amountCents: 11_000,
    sourceSystem: "policy.integration",
  },
  {
    id: "flow.integration.recurring-expense",
    kind: "recurring_expense",
    amountCents: 7_000,
    sourceSystem: "subscription.integration",
  },
  {
    id: "flow.integration.temporary-income",
    kind: "temporary_income",
    amountCents: 13_000,
    sourceSystem: "event.integration",
  },
  {
    id: "flow.integration.temporary-expense",
    kind: "temporary_expense",
    amountCents: 5_000,
    sourceSystem: "event.integration",
  },
] as const;

function taxEvidence(traceId: string) {
  return {
    schemaVersion: 1 as const,
    traceId,
    economicYear: 2026,
    policyYear: 2026,
    stateCode: "WA",
    filingStatus: "single" as const,
    provider: "PolicyEngine US",
    bundleVersion: "4.21.0",
    rulesVersion: "1.764.6",
    projectedFromFrozenPolicy: false,
    grossIncomeCents: 1_000_000,
    employee401kContributionCents: 50_000,
    employeeHsaContributionCents: 20_000,
    totalTaxCents: 200_000,
    afterTaxCashIncomeCents: 730_000,
  };
}

describe("Prompt 02 real core integration", () => {
  it("composes persisted inputs through the wrapper, kernel, ledger, outcome, exposure, macro, and event systems", () => {
    const initial = integratedState();
    const command = decodePersistedGameCommandV2({
      schemaVersion: 2,
      id: "cmd.kernel-v2.integration.month",
      type: "process_month_v2",
      expectedRevision: initial.revision,
      effectiveMonth: initial.currentMonth,
      payload: {
        financialKernelVersion: FINANCIAL_KERNEL_V2_VERSION,
        taxEvidence: {
          schemaVersion: 1,
          traceId: "tax.kernel-v2.integration",
          economicYear: 2026,
          policyYear: 2026,
          stateCode: "WA",
          filingStatus: "single",
          provider: "PolicyEngine US",
          bundleVersion: "4.21.0",
          rulesVersion: "1.764.6",
          projectedFromFrozenPolicy: false,
          grossIncomeCents: 1_000_000,
          employee401kContributionCents: 50_000,
          employeeHsaContributionCents: 20_000,
          totalTaxCents: 200_000,
          afterTaxCashIncomeCents: 730_000,
        },
        taxableLiquidationCostRatePpm: 10_000,
        insuranceClaim: {
          type: "health",
          grossAmountCents: 200_000,
          covered: true,
        },
        resolvedCashFlows,
      },
    });
    if (command.type !== "process_month_v2") {
      throw new Error("persisted integration fixture did not decode as a month");
    }
    const dependencies = {
      eventSchedulingPolicy: {
        version: "fairness-v1" as const,
        minimumChancePpm: 1_000_000,
        maximumChancePpm: 1_000_000,
      },
      macroStoryPolicy: {
        version: "macro-story-v1" as const,
        monthlyChancePpm: 1_000_000,
        minimumDurationMonths: 2,
        maximumDurationMonths: 2,
      },
    };

    const result = processMonthlyTurnV2(initial, command, dependencies);
    const repeated = processMonthlyTurnV2(initial, command, dependencies);
    const flowTransactions = result.state.ledger.transactions.filter(
      (transaction) =>
        transaction.causalReference?.kind === "system" &&
        resolvedCashFlows.some(
          (flow) => flow.id === transaction.causalReference?.id,
        ),
    );

    expect(result).toEqual(repeated);
    expect(sha256Canonical(result.state)).toBe(
      sha256Canonical(repeated.state),
    );
    expect(result.state).toMatchObject({
      revision: initial.revision + 1,
      currentMonth: "2026-08",
      acceptedCommandIds: [
        ...initial.acceptedCommandIds,
        command.id,
      ],
      outcome: null,
      gameplay: {
        exposure: { current: { month: "2026-08" } },
        eventLifecycle: {
          pending: expect.objectContaining({ scheduledMonth: "2026-08" }),
          macroStories: [
            expect.objectContaining({
              startedMonth: "2026-08",
              expiresMonth: "2026-09",
            }),
          ],
        },
      },
    });
    expect(result.record).toMatchObject({
      financialKernelVersion: FINANCIAL_KERNEL_V2_VERSION,
      taxTraceId: "tax.kernel-v2.integration",
      grossIncomeCents: 1_000_000,
      totalTaxCents: 200_000,
      afterTaxCashIncomeCents: 730_000,
      resolvedIncomeCents: 24_000,
      resolvedExpenseCents: 12_000,
      insurancePlayerCostCents: expect.any(Number),
      market: { modelVersion: "regime-v1" },
      debtService: {
        lines: [
          expect.objectContaining({
            debtId: "debt.kernel-v2.integration",
            interestCents: expect.any(Number),
            scheduledPaymentCents: expect.any(Number),
          }),
        ],
      },
      fundingPlan: { fullyFunded: true, residualShortfallCents: 0 },
      recurringAllocations: {
        preTax: {
          employee401kCents: 50_000,
          employer401kMatchCents: 40_000,
          hsaCents: 20_000,
        },
      },
      shortfall: null,
      scheduledEvent: expect.objectContaining({ scheduledMonth: "2026-08" }),
      outcome: null,
    });
    expect(result.record.insurancePlayerCostCents).toBeGreaterThan(0);
    expect(
      result.state.gameplay.insurance.healthDeductiblePaidCents,
    ).toBeGreaterThan(
      initial.gameplay.insurance.healthDeductiblePaidCents,
    );
    expect(flowTransactions).toHaveLength(4);
    for (const flow of resolvedCashFlows) {
      expect(
        flowTransactions.filter(
          (transaction) => transaction.causalReference?.id === flow.id,
        ),
      ).toEqual([
        expect.objectContaining({
          commandId: command.id,
          sourceSystem: flow.sourceSystem,
          causalReference: { kind: "system", id: flow.id },
        }),
      ]);
    }
    expect(validateLedger(result.state.ledger)).toEqual([]);
  });

  it("integrates regime-v2 through persistence, monthly orchestration, differentiated assets, inflation, debt, and ledger evidence", () => {
    const base = integratedState();
    const initial = finalizeGameStateV2({
      ...base,
      gameplay: {
        ...base.gameplay,
        market: { ...base.gameplay.market, monthsInRegime: 59 },
      },
    });
    const openingDebtRate =
      initial.gameplay.debts.termDebts[0]!.annualInterestRatePpm;
    const decoded = decodePersistedGameCommandV2({
      schemaVersion: 2,
      id: "cmd.macro-v2.integration.month",
      type: "process_month_v2",
      expectedRevision: initial.revision,
      effectiveMonth: initial.currentMonth,
      payload: {
        financialKernelVersion: FINANCIAL_KERNEL_V2_VERSION,
        marketModelVersion: MACRO_MARKET_MODEL_V2_VERSION,
        macroDifficulty: "normal",
        taxEvidence: {
          schemaVersion: 1,
          traceId: "tax.macro-v2.integration",
          economicYear: 2026,
          policyYear: 2026,
          stateCode: "WA",
          filingStatus: "single",
          provider: "PolicyEngine US",
          bundleVersion: "4.21.0",
          rulesVersion: "1.764.6",
          projectedFromFrozenPolicy: false,
          grossIncomeCents: 1_000_000,
          employee401kContributionCents: 50_000,
          employeeHsaContributionCents: 20_000,
          totalTaxCents: 200_000,
          afterTaxCashIncomeCents: 730_000,
        },
        taxableLiquidationCostRatePpm: 10_000,
        resolvedCashFlows: [],
      },
    });
    if (decoded.type !== "process_month_v2") {
      throw new Error("macro integration fixture did not decode as a month");
    }

    const result = processMonthlyTurnV2(initial, decoded, {
      eventSchedulingPolicy: {
        version: "fairness-v1",
        minimumChancePpm: 0,
        maximumChancePpm: 0,
      },
      macroStoryPolicy: {
        version: "macro-story-v1",
        monthlyChancePpm: 0,
        minimumDurationMonths: 1,
        maximumDurationMonths: 1,
      },
    });
    const month = result.record.market;
    expect(month.modelVersion).toBe(MACRO_MARKET_MODEL_V2_VERSION);
    if (month.modelVersion !== MACRO_MARKET_MODEL_V2_VERSION) {
      throw new Error("expected regime-v2 market evidence");
    }
    expect(result.state.gameplay.market).toMatchObject({
      modelVersion: MACRO_MARKET_MODEL_V2_VERSION,
      calibrationVersion: month.calibrationVersion,
      macroDifficulty: "normal",
      observedRegime: month.regime,
      observedMonth: initial.currentMonth,
      borrowingRatePpm: month.borrowingRatePpm,
      laborDemandChangePpm: month.laborDemandChangePpm,
      volatilityPpm: month.volatilityPpm,
      lastInflationPpm: month.inflationPpm,
    });
    expect(month.nextRegime).not.toBe(month.regime);
    expect(result.state.marketRegime).toBe(month.nextRegime);
    expect(result.state.gameplay.market.observedRegime).toBe(month.regime);
    expect(result.record.monthlyObligationInflationIncreaseCents).not.toBe(0);
    expect(result.state.gameplay.debts.termDebts[0]!.annualInterestRatePpm).toBe(
      openingDebtRate,
    );

    const marketTransaction = result.state.ledger.transactions.find(
      ({ id }) => id === `txn.${decoded.id}.market`,
    );
    expect(marketTransaction).toBeDefined();
    const cashPosting = marketTransaction!.postings.find(
      ({ accountId }) => accountId === "asset.cash",
    );
    const expectedCashChange = multiplyMoneyByRate(
      initial.finances.cashCents,
      month.cashReturnPpm,
    );
    expect(
      (cashPosting?.debitCents ?? 0) - (cashPosting?.creditCents ?? 0),
    ).toBe(expectedCashChange);

    const expectedTaxableChange =
      multiplyMoneyByRate(
        initial.gameplay.portfolio.taxableBroadIndexCents,
        month.broadIndexReturnPpm,
      ) +
      multiplyMoneyByRate(
        initial.gameplay.portfolio.taxableSectorCents,
        month.sectorReturnPpm,
      ) +
      multiplyMoneyByRate(
        initial.gameplay.portfolio.taxableSpeculativeCents,
        month.speculativeReturnPpm,
      );
    const taxablePosting = marketTransaction!.postings.find(
      ({ accountId }) => accountId === "asset.taxable_investments",
    );
    expect(
      (taxablePosting?.debitCents ?? 0) -
        (taxablePosting?.creditCents ?? 0),
    ).toBe(expectedTaxableChange);
    expect(validateLedger(result.state.ledger)).toEqual([]);

    const purchased = reduceDetailedFinanceCommand(result.state, {
      schemaVersion: 2,
      id: "cmd.macro-v2.integration.mortgage",
      type: "take_detailed_action",
      expectedRevision: result.state.revision,
      effectiveMonth: result.state.currentMonth,
      payload: {
        actionPolicyVersion: ACTION_POLICY_V1_VERSION,
        action: {
          type: "purchase_home",
          purchasePriceCents: moneyCents(100_000),
          downPaymentCents: moneyCents(50_000),
          mortgageAnnualInterestRatePpm: ratePpm(1_000),
          mortgageTermMonths: 360,
        },
      },
    });
    expect(
      purchased.gameplay.debts.termDebts.find(
        ({ kind }) => kind === "mortgage",
      )?.annualInterestRatePpm,
    ).toBe(Math.min(500_000, month.borrowingRatePpm + 20_000));
  });

  it("replays an accepted regime-v1 month followed by an explicit regime-v2 upgrade", () => {
    const runSequence = () => {
      const initial = integratedState();
      const historical = decodePersistedGameCommandV2({
        schemaVersion: 2,
        id: "cmd.market-upgrade.historical",
        type: "process_month_v2",
        expectedRevision: initial.revision,
        effectiveMonth: initial.currentMonth,
        payload: {
          financialKernelVersion: FINANCIAL_KERNEL_V2_VERSION,
          taxEvidence: taxEvidence("tax.market-upgrade.historical"),
          taxableLiquidationCostRatePpm: 10_000,
          resolvedCashFlows: [],
        },
      });
      if (historical.type !== "process_month_v2") {
        throw new Error("expected historical monthly command");
      }
      const dependencies = {
        eventSchedulingPolicy: {
          version: "fairness-v1" as const,
          minimumChancePpm: 0,
          maximumChancePpm: 0,
        },
        macroStoryPolicy: {
          version: "macro-story-v1" as const,
          monthlyChancePpm: 0,
          minimumDurationMonths: 1,
          maximumDurationMonths: 1,
        },
      };
      const first = processMonthlyTurnV2(initial, historical, dependencies);
      const upgraded = decodePersistedGameCommandV2({
        schemaVersion: 2,
        id: "cmd.market-upgrade.v2",
        type: "process_month_v2",
        expectedRevision: first.state.revision,
        effectiveMonth: first.state.currentMonth,
        payload: {
          financialKernelVersion: FINANCIAL_KERNEL_V2_VERSION,
          marketModelVersion: MACRO_MARKET_MODEL_V2_VERSION,
          macroDifficulty: "normal",
          taxEvidence: taxEvidence("tax.market-upgrade.v2"),
          taxableLiquidationCostRatePpm: 10_000,
          resolvedCashFlows: [],
        },
      });
      if (upgraded.type !== "process_month_v2") {
        throw new Error("expected upgraded monthly command");
      }
      const second = processMonthlyTurnV2(
        first.state,
        upgraded,
        dependencies,
      );
      return { historical, first, upgraded, second };
    };

    const left = runSequence();
    const right = runSequence();
    expect(left).toEqual(right);
    expect(left.historical.payload.marketModelVersion).toBeUndefined();
    expect(left.first.record.market.modelVersion).toBe("regime-v1");
    expect(left.second.record.market.modelVersion).toBe("regime-v2");
    expect(sha256Canonical(left.second.state)).toBe(
      sha256Canonical(right.second.state),
    );
  });

  it("strictly decodes the declarative-events-v2 scheduler discriminator", () => {
    const initial = integratedState();
    const decoded = decodePersistedGameCommandV2({
      schemaVersion: 2,
      id: "cmd.declarative-events-v2",
      type: "process_month_v2",
      expectedRevision: initial.revision,
      effectiveMonth: initial.currentMonth,
      payload: {
        financialKernelVersion: FINANCIAL_KERNEL_V2_VERSION,
        eventSchedulerVersion: "declarative-events-v2",
        taxEvidence: taxEvidence("tax.declarative-events-v2"),
        taxableLiquidationCostRatePpm: 10_000,
        resolvedCashFlows: [],
      },
    });
    expect(decoded.type).toBe("process_month_v2");
    if (decoded.type !== "process_month_v2") throw new Error("expected month command");
    expect(decoded.payload.eventSchedulerVersion).toBe("declarative-events-v2");
  });
});
