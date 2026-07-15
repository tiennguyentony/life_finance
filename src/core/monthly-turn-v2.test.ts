import { describe, expect, it } from "vitest";

import { sha256Canonical } from "./canonical";
import { buildCheckpointEvidenceV2 } from "./checkpoint-v2";
import { reduceDetailedFinanceCommand } from "./detailed-actions-v2";
import { moneyCents, ratePpm } from "./domain/money";
import { simulationMonth } from "./domain/month";
import { validateGameStateV2 } from "./game-state-v2";
import {
  processMonthlyTurnV2,
  type ProcessMonthV2Command,
} from "./monthly-turn-v2";
import { createNativeGameStateV2 } from "./native-game-state-v2";
import { setRecurringStrategy } from "./recurring-strategy-v2";
import { resolveScenarioCatalogSelection } from "./scenario-catalog";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../data/scenario-catalog";

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
    runId: "run.monthly-v2",
    playerId: "player.monthly-v2",
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "monthly-v2-golden",
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
    id: "cmd.strategy.initial",
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

function command(
  state = configuredState(),
  overrides: Partial<ProcessMonthV2Command["payload"]> = {},
  id = `cmd.month.${state.currentMonth}`,
): ProcessMonthV2Command {
  return {
    schemaVersion: 2,
    id,
    type: "process_month_v2",
    expectedRevision: state.revision,
    effectiveMonth: state.currentMonth,
    payload: {
      taxEvidence: {
        schemaVersion: 1,
        traceId: `tax.${id}`,
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
      taxableLiquidationCostRatePpm: ratePpm(10_000),
      ...overrides,
    },
  };
}

describe("atomic v2 monthly turn", () => {
  it("composes market, payroll, obligations, debt, strategy, and outcome once", () => {
    const initial = configuredState();
    const result = processMonthlyTurnV2(initial, command(initial));

    expect(result.state.currentMonth).toBe("2026-08");
    expect(result.state.revision).toBe(2);
    expect(result.state.acceptedCommandIds).toEqual([
      "cmd.strategy.initial",
      "cmd.month.2026-07",
    ]);
    expect(result.record).toMatchObject({
      processedMonth: "2026-07",
      nextMonth: "2026-08",
      taxTraceId: "tax.cmd.month.2026-07",
      insurancePlayerCostCents: 0,
      outcome: null,
    });
    expect(result.record.debtService.lines[0]).toMatchObject({
      interestCents: 1_200,
      scheduledPaymentCents: 11_000,
      closingPrincipalCents: 110_200,
    });
    expect(result.record.recurringAllocations?.preTax).toEqual({
      employee401kCents: 50_000,
      employer401kMatchCents: 40_000,
      hsaCents: 20_000,
    });
    expect(result.state.gameplay.contributions).toMatchObject({
      employee401kCents: 50_000,
      employer401kCents: 40_000,
      hsaCents: 20_000,
    });
    expect(
      result.state.ledger.transactions.map(({ reasonCode }) => reasonCode),
    ).toEqual(
      expect.arrayContaining([
        "monthly_market_revaluation_v2",
        "monthly_payroll_v2",
        "monthly_non_debt_obligations_v2",
        "monthly_term_debt_interest",
        "monthly_term_debt_payment",
        "monthly_after_tax_strategy_v2",
      ]),
    );
    expect(result.state.gameplay.market.monthsInRegime).toBeGreaterThanOrEqual(0);
    expect(result.state.gameplay.exposure).toMatchObject({
      current: { month: "2026-08" },
      history: [{ month: "2026-08" }],
    });
    expect(validateGameStateV2(result.state)).toEqual([]);
    expect(initial.currentMonth).toBe("2026-07");
  });

  it("is checksum deterministic and rejects an identical command after acceptance", () => {
    const leftInitial = configuredState();
    const rightInitial = configuredState();
    const left = processMonthlyTurnV2(leftInitial, command(leftInitial));
    const right = processMonthlyTurnV2(rightInitial, command(rightInitial));

    expect(sha256Canonical(left.state)).toBe(sha256Canonical(right.state));
    expect(() => processMonthlyTurnV2(left.state, command(leftInitial))).toThrow(
      expect.objectContaining({ code: "DUPLICATE_COMMAND" }),
    );
  });

  it("builds reconciled checkpoint evidence from exact monthly records", () => {
    const initial = configuredState();
    const result = processMonthlyTurnV2(initial, command(initial), {
      eventSchedulingPolicy: {
        version: "fairness-v1",
        minimumChancePpm: 0,
        maximumChancePpm: 0,
      },
    });
    const checkpoint = buildCheckpointEvidenceV2(initial, result.state, [result.record]);

    expect(checkpoint).toMatchObject({
      evidenceVersion: "checkpoint-v2.1",
      monthsProcessed: 1,
      monthlyCommandIds: ["cmd.month.2026-07"],
      taxTraceIds: ["tax.cmd.month.2026-07"],
      totalGrossIncomeCents: 1_000_000,
      totalTaxCents: 200_000,
      totalAfterTaxCashIncomeCents: 730_000,
    });
    expect(checkpoint.totalRequiredCashCents).toBe(result.record.requiredCashCents);
    expect(checkpoint.totalDebtInterestCents).toBe(
      result.record.debtService.totalInterestCents,
    );
    expect(checkpoint.end.exposure).toMatchObject({ month: "2026-08" });
    expect(() =>
      buildCheckpointEvidenceV2(initial, result.state, [
        { ...result.record, processedMonth: simulationMonth("2026-06") },
      ]),
    ).toThrow(expect.objectContaining({ code: "RECORD_GAP" }));
  });

  it("materializes a completed upskill before the following month's tax context", () => {
    let current = configuredState();
    current = reduceDetailedFinanceCommand(current, {
      schemaVersion: 2,
      id: "cmd.upskill.monthly",
      type: "take_detailed_action",
      expectedRevision: current.revision,
      effectiveMonth: current.currentMonth,
      payload: {
        action: { type: "start_upskill", programId: "upskill.certificate" },
      },
    });
    const noEvents = {
      eventSchedulingPolicy: {
        version: "fairness-v1" as const,
        minimumChancePpm: 0,
        maximumChancePpm: 0,
      },
    };
    for (let index = 0; index < 3; index += 1) {
      current = processMonthlyTurnV2(
        current,
        command(current, {}, `cmd.upskill.month.${current.currentMonth}`),
        noEvents,
      ).state;
    }

    expect(current.currentMonth).toBe("2026-10");
    expect(current.gameplay.careerDevelopment.pending).toEqual([]);
    expect(current.gameplay.careerDevelopment.history).toHaveLength(1);
    expect(current.gameplay.employment).toMatchObject({
      annualGrossSalaryCents: 12_300_000,
    });
  });

  it("applies a persisted macro story on the following monthly market draw", () => {
    const initial = configuredState();
    const first = processMonthlyTurnV2(initial, command(initial), {
      eventSchedulingPolicy: {
        version: "fairness-v1",
        minimumChancePpm: 0,
        maximumChancePpm: 0,
      },
      macroStoryPolicy: {
        version: "macro-story-v1",
        monthlyChancePpm: 1_000_000,
        minimumDurationMonths: 2,
        maximumDurationMonths: 2,
      },
    });
    const story = first.state.gameplay.eventLifecycle.macroStories[0]!;
    expect(story.startedMonth).toBe("2026-08");
    const second = processMonthlyTurnV2(
      first.state,
      command(first.state),
      {
        eventSchedulingPolicy: {
          version: "fairness-v1",
          minimumChancePpm: 0,
          maximumChancePpm: 0,
        },
        macroStoryPolicy: {
          version: "macro-story-v1",
          monthlyChancePpm: 0,
          minimumDurationMonths: 2,
          maximumDurationMonths: 2,
        },
      },
    );
    expect(second.record.market.appliedReturnModifiersPpm).toEqual(
      story.returnModifiersPpm,
    );
    expect(second.state.gameplay.eventLifecycle.macroStories[0]?.storyId).toBe(
      story.storyId,
    );
  });

  it("adjudicates a covered health claim and commits its accumulator with payment", () => {
    const initial = configuredState();
    const result = processMonthlyTurnV2(
      initial,
      command(initial, {
        insuranceClaim: {
          type: "health",
          grossAmountCents: moneyCents(200_000),
          covered: true,
        },
      }),
    );

    expect(result.record.insurancePlayerCostCents).toBe(184_000);
    expect(result.state.gameplay.insurance).toMatchObject({
      healthDeductiblePaidCents: 180_000,
      healthOutOfPocketPaidCents: 184_000,
    });
    expect(result.record.nonDebtObligationsPaidCents).toBeGreaterThan(
      result.state.finances.requiredObligationsCents - 11_000,
    );
  });

  it("queues a fair event after the completed month and blocks progression until choice", () => {
    const initial = configuredState();
    const result = processMonthlyTurnV2(initial, command(initial), {
      eventSchedulingPolicy: {
        version: "fairness-v1",
        minimumChancePpm: 1_000_000,
        maximumChancePpm: 1_000_000,
      },
    });

    expect(result.record.scheduledEvent).toEqual(
      result.state.gameplay.eventLifecycle.pending,
    );
    expect(result.record.scheduledEvent).toMatchObject({
      scheduledMonth: "2026-08",
      expiresMonth: "2026-09",
    });
    const nextCommand = {
      ...command(result.state),
      id: "cmd.month.2026-08",
      effectiveMonth: result.state.currentMonth,
      expectedRevision: result.state.revision,
    };
    expect(() => processMonthlyTurnV2(result.state, nextCommand)).toThrow(
      expect.objectContaining({ code: "PENDING_EVENT" }),
    );
  });

  it("records bankruptcy without partial funding when a claim exceeds all liquidity", () => {
    const initial = configuredState();
    const result = processMonthlyTurnV2(
      initial,
      command(initial, {
        insuranceClaim: {
          type: "health",
          grossAmountCents: moneyCents(10_000_000),
          covered: false,
        },
      }),
    );

    expect(result.state.outcome).toMatchObject({ kind: "bankruptcy", grade: "F" });
    expect(result.record.funding).toBeNull();
    expect(result.record.nonDebtObligationsPaidCents).toBe(0);
    expect(result.record.recurringAllocations).toBeNull();
    expect(
      result.state.ledger.transactions.some(
        ({ reasonCode }) => reasonCode === "monthly_non_debt_obligations_v2",
      ),
    ).toBe(false);
  });

  it("wraps invalid tax evidence as an atomic transition failure", () => {
    const initial = configuredState();
    const invalid = command(initial);
    const bad = {
      ...invalid,
      payload: {
        ...invalid.payload,
        taxEvidence: { ...invalid.payload.taxEvidence, stateCode: "CA" },
      },
    };
    expect(() => processMonthlyTurnV2(initial, bad)).toThrow(
      expect.objectContaining({ code: "TRANSITION_INVARIANT" }),
    );
    expect(initial.revision).toBe(1);
    expect(initial.ledger.transactions).toHaveLength(1);
  });
});
