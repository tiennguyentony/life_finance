import { describe, expect, it } from "vitest";

import { sha256Canonical } from "../canonical";
import { moneyCents, ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import { validateLedger } from "../ledger";
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
});
