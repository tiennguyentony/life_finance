import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";
import { sha256Canonical } from "../canonical";
import { moneyCents, ratePpm } from "../domain/money";
import { addMonths, simulationMonth } from "../domain/month";
import { resolveEventChoiceV2 } from "../event-lifecycle-v2";
import { manageLifeMilestoneV2 } from "../life-milestones-v2";
import { finalizeGameStateV2 } from "../game-state-v2";
import { processMonthlyTurnV2 } from "../monthly-turn-v2";
import { createNativeGameStateV2 } from "../native-game-state-v2";
import { setRecurringStrategy } from "../recurring-strategy-v2";
import { resolveScenarioCatalogSelection } from "../scenario-catalog";
import {
  MAX_TIME_CONTROLLER_MONTHS_V2,
  advanceTimeV2,
  type AdvanceTimeV2Command,
} from "../time-controller-v2";

const NO_INTERRUPTING_EVENTS = Object.freeze({
  eventSchedulingPolicy: Object.freeze({
    version: "fairness-v1" as const,
    minimumChancePpm: 0,
    maximumChancePpm: 0,
  }),
  macroStoryPolicy: Object.freeze({
    version: "macro-story-v1" as const,
    monthlyChancePpm: 0,
    minimumDurationMonths: 1,
    maximumDurationMonths: 1,
  }),
});

const FORCE_EVENT = Object.freeze({
  ...NO_INTERRUPTING_EVENTS,
  eventSchedulingPolicy: Object.freeze({
    version: "fairness-v1" as const,
    minimumChancePpm: 1_000_000,
    maximumChancePpm: 1_000_000,
  }),
});

function state(options: {
  birthMonth?: string;
  financialGoal?: Parameters<typeof createNativeGameStateV2>[0]["financialGoal"];
  cashCents?: number;
  recurring?: boolean;
} = {}) {
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
    runId: "run.time-controller-v2",
    playerId: "player.time-controller-v2",
    birthMonth: simulationMonth(options.birthMonth ?? "1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "time-controller-v2",
    resolvedScenario,
    annualGrossSalaryCents: moneyCents(12_000_000),
    financialGoal: options.financialGoal,
    finances: {
      cashCents: moneyCents(options.cashCents ?? 1_000_000),
      taxableBroadIndexCents: moneyCents(1_000_000),
      taxableSectorCents: moneyCents(200_000),
      taxableSpeculativeCents: moneyCents(100_000),
      retirement401kCents: moneyCents(500_000),
      retirementIraCents: moneyCents(100_000),
      hsaCents: moneyCents(50_000),
      homeValueCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      termDebts: [],
      revolvingCreditLimitCents: moneyCents(1_000_000),
      revolvingCreditUsedCents: moneyCents(0),
    },
    wellbeing: {
      burnoutPpm: ratePpm(100_000),
      happinessPpm: ratePpm(900_000),
    },
  });
  if (options.recurring === false) return initial;
  return setRecurringStrategy(initial, {
    schemaVersion: 2,
    id: "cmd.strategy.time-controller",
    type: "set_recurring_strategy",
    expectedRevision: initial.revision,
    effectiveMonth: initial.currentMonth,
    payload: {
      strategy: {
        preTax401kSalaryRatePpm: ratePpm(50_000),
        preTaxHsaSalaryRatePpm: ratePpm(20_000),
        afterTaxBroadIndexRatePpm: ratePpm(100_000),
        afterTaxSectorRatePpm: ratePpm(0),
        afterTaxSpeculativeRatePpm: ratePpm(0),
        afterTaxIraRatePpm: ratePpm(0),
        afterTaxExtraDebtRatePpm: ratePpm(0),
      },
    },
  });
}

function inputs(
  count: number,
  options: {
    startMonth?: string;
    claimOnFirstMonth?: boolean;
    noContributions?: boolean;
    monthlySupportIncomeCents?: number;
  } = {},
): AdvanceTimeV2Command["monthlyInputs"] {
  const start = simulationMonth(options.startMonth ?? "2026-07");
  return Object.freeze(
    Array.from({ length: count }, (_, index) => {
      const month = addMonths(start, index);
      const commandId = `cmd.time.${month}`;
      return Object.freeze({
        commandId,
        payload: Object.freeze({
          financialKernelVersion: "2.0.0" as const,
          taxEvidence: Object.freeze({
            schemaVersion: 1 as const,
            traceId: `tax.${commandId}`,
            economicYear: Number(month.slice(0, 4)),
            policyYear: 2026,
            stateCode: "WA",
            filingStatus: "single",
            provider: "PolicyEngine US" as const,
            bundleVersion: "4.21.0",
            rulesVersion: "1.764.6",
            projectedFromFrozenPolicy: Number(month.slice(0, 4)) !== 2026,
            grossIncomeCents: moneyCents(1_000_000),
            employee401kContributionCents: moneyCents(
              options.noContributions ? 0 : 50_000,
            ),
            employeeHsaContributionCents: moneyCents(
              options.noContributions ? 0 : 20_000,
            ),
            totalTaxCents: 200_000,
            afterTaxCashIncomeCents: moneyCents(
              options.noContributions ? 800_000 : 730_000,
            ),
          }),
          taxableLiquidationCostRatePpm: ratePpm(10_000),
          resolvedCashFlows: Object.freeze(
            options.monthlySupportIncomeCents
              ? [
                  Object.freeze({
                    id: `support.${month}`,
                    kind: "temporary_income" as const,
                    amountCents: moneyCents(
                      options.monthlySupportIncomeCents,
                    ),
                    sourceSystem: "time_controller_performance_fixture",
                  }),
                ]
              : [],
          ),
          ...(options.claimOnFirstMonth && index === 0
            ? {
                insuranceClaim: Object.freeze({
                  type: "health" as const,
                  grossAmountCents: moneyCents(100_000_000),
                  covered: false,
                }),
              }
            : {}),
        }),
      });
    }),
  );
}

function command(
  monthlyInputs: AdvanceTimeV2Command["monthlyInputs"],
  mode: AdvanceTimeV2Command["mode"],
  overrides: Partial<AdvanceTimeV2Command> = {},
): AdvanceTimeV2Command {
  return {
    schemaVersion: 2,
    id: "advance.time-controller",
    type: "advance_time_v2",
    maxMonths: monthlyInputs.length || 1,
    mode,
    monthlyInputs,
    ...overrides,
  };
}

describe("pure v2 time controller", () => {
  it("advances 12 calm months exactly and returns one aggregate UI payload", () => {
    const initial = state();
    const result = advanceTimeV2(
      initial,
      command(inputs(12), { kind: "months", months: 12 }),
      NO_INTERRUPTING_EVENTS,
    );

    expect(result.monthsAdvanced).toBe(12);
    expect(result.state.currentMonth).toBe("2027-07");
    expect(result.pauseReason).toEqual({
      kind: "requested_duration",
      requestedMonths: 12,
    });
    expect(result.steps).toHaveLength(12);
    expect(result.records).toHaveLength(12);
    expect(result.uiChanges).toMatchObject({
      kind: "time_advance_summary_v2",
      fromMonth: "2026-07",
      toMonth: "2027-07",
      monthsAdvanced: 12,
      pauseKind: "requested_duration",
    });
    expect(result).not.toHaveProperty("notifications");
    expect(initial.currentMonth).toBe("2026-07");
  });

  it("stops after the first forced event and detects it at zero months", () => {
    const initial = state();
    const stopped = advanceTimeV2(
      initial,
      command(inputs(12), { kind: "until_event" }),
      FORCE_EVENT,
    );

    expect(stopped.monthsAdvanced).toBe(1);
    expect(stopped.pauseReason.kind).toBe("event_response");
    expect(stopped.pendingEvent).toEqual(
      stopped.state.gameplay.eventLifecycle.pending,
    );
    const alreadyPending = advanceTimeV2(
      stopped.state,
      command([], { kind: "until_event" }),
      NO_INTERRUPTING_EVENTS,
    );
    expect(alreadyPending.monthsAdvanced).toBe(0);
    expect(alreadyPending.pauseReason.kind).toBe("event_response");
  });

  it.each([
    {
      expected: "financial_independence",
      initial: () =>
        state({
          financialGoal: {
            version: "financial-goal-v1",
            desiredAnnualSpendingCents: moneyCents(1),
            safeWithdrawalRatePpm: ratePpm(60_000),
            targetAgeYears: 80,
            source: "player_selected",
          },
        }),
      batch: () => inputs(1),
      pause: "financial_independence",
    },
    {
      expected: "retirement_age",
      initial: () => state({ birthMonth: "1961-08" }),
      batch: () => inputs(1),
      pause: "retirement",
    },
    {
      expected: "bankruptcy",
      initial: () => state(),
      batch: () => inputs(1, { claimOnFirstMonth: true }),
      pause: "bankruptcy",
    },
  ])("stops early for $expected", ({ initial, batch, pause, expected }) => {
    const result = advanceTimeV2(
      initial(),
      command(batch(), { kind: "until_end" }),
      NO_INTERRUPTING_EVENTS,
    );
    expect(result.monthsAdvanced).toBe(1);
    expect(result.state.outcome?.kind).toBe(expected);
    expect(result.pauseReason.kind).toBe(pause);
    expect(result.endCondition).toEqual(result.state.outcome);
    const alreadyTerminal = advanceTimeV2(
      result.state,
      command([], { kind: "until_end" }),
      NO_INTERRUPTING_EVENTS,
    );
    expect(alreadyTerminal.monthsAdvanced).toBe(0);
    expect(alreadyTerminal.pauseReason.kind).toBe(pause);
  });

  it("stops on the configured checkpoint boundary with exact evidence", () => {
    const initial = state();
    const result = advanceTimeV2(
      initial,
      command(inputs(8), { kind: "until_checkpoint", intervalMonths: 3 }),
      NO_INTERRUPTING_EVENTS,
    );
    expect(result.monthsAdvanced).toBe(3);
    expect(result.pauseReason).toEqual({
      kind: "periodic_checkpoint",
      checkpointMonth: "2026-10",
    });
    expect(result.checkpointInput).toMatchObject({
      evidenceVersion: "checkpoint-v2.1",
      monthsProcessed: 3,
      start: { month: "2026-07" },
      end: { month: "2026-10" },
    });
  });

  it("resumes after resolving an event decision", () => {
    const paused = advanceTimeV2(
      state(),
      command(inputs(1), { kind: "until_event" }),
      FORCE_EVENT,
    );
    const event = paused.pendingEvent!;
    const resolved = resolveEventChoiceV2(paused.state, {
      schemaVersion: 2,
      id: "cmd.resolve.time-event",
      type: "resolve_event_choice",
      expectedRevision: paused.state.revision,
      effectiveMonth: paused.state.currentMonth,
      payload: { eventId: event.eventId, choiceId: event.choiceIds[0]! },
    });
    const resolvedWithoutAnUnrelatedOngoingDeficit = finalizeGameStateV2({
      ...resolved,
      finances: {
        ...resolved.finances,
        requiredObligationsCents: paused.state.finances.requiredObligationsCents,
      },
    });
    const resumed = advanceTimeV2(
      resolvedWithoutAnUnrelatedOngoingDeficit,
      command(inputs(2, { startMonth: resolved.currentMonth }), {
        kind: "resume",
        resolvedDecisionId: "cmd.resolve.time-event",
        months: 2,
      }),
      NO_INTERRUPTING_EVENTS,
    );
    expect(resumed.monthsAdvanced).toBe(2);
    expect(resumed.pauseReason).toEqual({
      kind: "requested_duration",
      requestedMonths: 2,
    });
    expect(resumed.pendingEvent).toBeNull();
  });

  it("rejects resume tokens that are not the latest resolved decision", () => {
    const initial = state();

    expect(() =>
      advanceTimeV2(
        initial,
        command(inputs(1), {
          kind: "resume",
          resolvedDecisionId: "cmd.strategy.time-controller",
          months: 1,
        }),
        NO_INTERRUPTING_EVENTS,
      ),
    ).toThrow(expect.objectContaining({ code: "INVALID_COMMAND" }));

    const scheduled = manageLifeMilestoneV2(initial, {
      schemaVersion: 2,
      id: "cmd.schedule.resume-stale",
      type: "manage_life_milestone",
      expectedRevision: initial.revision,
      effectiveMonth: initial.currentMonth,
      payload: {
        action: "schedule",
        milestoneId: "milestone.resume-stale",
        kind: "custom",
        label: "Resolve then change policy",
        targetMonth: initial.currentMonth,
        estimatedCostCents: moneyCents(1),
      },
    });
    const resolved = manageLifeMilestoneV2(scheduled, {
      schemaVersion: 2,
      id: "cmd.resolve.resume-stale",
      type: "manage_life_milestone",
      expectedRevision: scheduled.revision,
      effectiveMonth: scheduled.currentMonth,
      payload: {
        action: "resolve",
        milestoneId: "milestone.resume-stale",
        resolution: "cancel",
      },
    });
    const recurring = resolved.gameplay.recurringStrategy;
    const changedAfterResolution = setRecurringStrategy(resolved, {
      schemaVersion: 2,
      id: "cmd.strategy.after-resolution",
      type: "set_recurring_strategy",
      expectedRevision: resolved.revision,
      effectiveMonth: resolved.currentMonth,
      payload: {
        strategy: {
          preTax401kSalaryRatePpm: recurring.preTax401kSalaryRatePpm,
          preTaxHsaSalaryRatePpm: recurring.preTaxHsaSalaryRatePpm,
          afterTaxBroadIndexRatePpm: recurring.afterTaxBroadIndexRatePpm,
          afterTaxSectorRatePpm: recurring.afterTaxSectorRatePpm,
          afterTaxSpeculativeRatePpm:
            recurring.afterTaxSpeculativeRatePpm,
          afterTaxIraRatePpm: recurring.afterTaxIraRatePpm,
          afterTaxExtraDebtRatePpm: recurring.afterTaxExtraDebtRatePpm,
        },
      },
    });
    expect(() =>
      advanceTimeV2(
        changedAfterResolution,
        command(inputs(1), {
          kind: "resume",
          resolvedDecisionId: "cmd.resolve.resume-stale",
          months: 1,
        }),
        NO_INTERRUPTING_EVENTS,
      ),
    ).toThrow(expect.objectContaining({ code: "INVALID_COMMAND" }));
  });

  it("pauses for a funded monthly cash-flow deficit before using another hidden tick", () => {
    const initial = state();
    const deficitState = finalizeGameStateV2({
      ...initial,
      finances: {
        ...initial.finances,
        requiredObligationsCents: moneyCents(800_000),
      },
    });
    const result = advanceTimeV2(
      deficitState,
      command(inputs(2), { kind: "months", months: 2 }),
      NO_INTERRUPTING_EVENTS,
    );

    expect(result.monthsAdvanced).toBe(1);
    expect(result.state.outcome).toBeNull();
    expect(result.pauseReason).toEqual({
      kind: "financial_warning",
      warning: {
        kind: "monthly_cash_flow_deficit",
        cashFlowDeficitCents: 70_704,
      },
    });
  });

  it("processes each accepted input once without mutation or duplicate work", () => {
    const initial = state();
    const openingChecksum = sha256Canonical(initial);
    let calls = 0;
    const result = advanceTimeV2(
      initial,
      command(inputs(4), { kind: "months", months: 4 }),
      {
        ...NO_INTERRUPTING_EVENTS,
        processMonth: (...args) => {
          calls += 1;
          return processMonthlyTurnV2(...args);
        },
      },
    );
    expect(calls).toBe(4);
    expect(result.state.revision - initial.revision).toBe(4);
    expect(result.steps.map(({ command }) => command.id)).toEqual([
      "cmd.time.2026-07",
      "cmd.time.2026-08",
      "cmd.time.2026-09",
      "cmd.time.2026-10",
    ]);
    expect(new Set(result.records.map(({ commandId }) => commandId)).size).toBe(4);
    expect(sha256Canonical(initial)).toBe(openingChecksum);
  });

  it("copies and deeply freezes caller-owned monthly evidence", () => {
    const mutableInputs = structuredClone(inputs(1));
    const result = advanceTimeV2(
      state(),
      command(mutableInputs, { kind: "one_month" }),
      NO_INTERRUPTING_EVENTS,
    );
    const before = sha256Canonical(result.steps[0]!.command);

    (
      mutableInputs[0]!.payload.taxEvidence as { totalTaxCents: number }
    ).totalTaxCents = 999_999;

    expect(result.steps[0]!.command.payload.taxEvidence.totalTaxCents).toBe(
      200_000,
    );
    expect(sha256Canonical(result.steps[0]!.command)).toBe(before);
    expect(Object.isFrozen(result.steps[0]!.command.payload)).toBe(true);
    expect(
      Object.isFrozen(result.steps[0]!.command.payload.taxEvidence),
    ).toBe(true);
  });

  it("returns deterministic pause sequences and checksums", () => {
    const run = () => {
      let current = state();
      const sequence: string[] = [];
      for (let index = 0; index < 3; index += 1) {
        const result = advanceTimeV2(
          current,
          command(inputs(2, { startMonth: current.currentMonth }), {
            kind: "until_checkpoint",
            intervalMonths: 2,
          }, { id: `advance.sequence.${index}` }),
          NO_INTERRUPTING_EVENTS,
        );
        sequence.push(result.pauseReason.kind);
        current = result.state;
      }
      return { sequence, checksum: sha256Canonical(current) };
    };
    expect(run()).toEqual(run());
  });

  it("returns explicit stop and due policy decisions without a tick", () => {
    const initial = state();
    const stopped = advanceTimeV2(
      initial,
      command([], { kind: "stop" }),
      NO_INTERRUPTING_EVENTS,
    );
    expect(stopped).toMatchObject({
      monthsAdvanced: 0,
      pauseReason: { kind: "explicit_user_stop" },
    });

    const due = manageLifeMilestoneV2(initial, {
      schemaVersion: 2,
      id: "cmd.schedule.due",
      type: "manage_life_milestone",
      expectedRevision: initial.revision,
      effectiveMonth: initial.currentMonth,
      payload: {
        action: "schedule",
        milestoneId: "milestone.due",
        kind: "move",
        label: "Move now",
        targetMonth: initial.currentMonth,
        estimatedCostCents: moneyCents(10_000),
      },
    });
    const decision = advanceTimeV2(
      due,
      command([], { kind: "until_decision" }),
      NO_INTERRUPTING_EVENTS,
    );
    expect(decision.monthsAdvanced).toBe(0);
    expect(decision.pauseReason.kind).toBe("policy_decision");
    expect(decision.pendingDecision).toMatchObject({
      kind: "life_milestone",
      milestones: [{ milestoneId: "milestone.due" }],
    });
  });

  it("advances one month and can stop at a future policy decision", () => {
    const initial = state();
    const scheduled = manageLifeMilestoneV2(initial, {
      schemaVersion: 2,
      id: "cmd.schedule.future",
      type: "manage_life_milestone",
      expectedRevision: initial.revision,
      effectiveMonth: initial.currentMonth,
      payload: {
        action: "schedule",
        milestoneId: "milestone.future",
        kind: "education",
        label: "Start a course",
        targetMonth: addMonths(initial.currentMonth, 2),
        estimatedCostCents: moneyCents(10_000),
      },
    });
    const oneMonth = advanceTimeV2(
      scheduled,
      command(inputs(1), { kind: "one_month" }),
      NO_INTERRUPTING_EVENTS,
    );
    expect(oneMonth.monthsAdvanced).toBe(1);
    expect(oneMonth.pauseReason).toEqual({
      kind: "requested_duration",
      requestedMonths: 1,
    });

    const decision = advanceTimeV2(
      oneMonth.state,
      command(inputs(2, { startMonth: oneMonth.state.currentMonth }), {
        kind: "until_decision",
      }),
      NO_INTERRUPTING_EVENTS,
    );
    expect(decision.monthsAdvanced).toBe(1);
    expect(decision.pauseReason.kind).toBe("policy_decision");
    expect(decision.pendingDecision?.milestones[0]?.milestoneId).toBe(
      "milestone.future",
    );
  });

  it("rejects invalid bounds, modes, duplicate inputs, and shortages", () => {
    const initial = state();
    const cases: AdvanceTimeV2Command[] = [
      command(inputs(1), { kind: "months", months: 1 }, { maxMonths: 0 }),
      command(inputs(1), { kind: "months", months: 2 }, { maxMonths: 1 }),
      command(inputs(1), { kind: "until_checkpoint", intervalMonths: 13 }),
      command([inputs(1)[0]!, inputs(1)[0]!], { kind: "months", months: 2 }),
      command(inputs(1), { kind: "resume", resolvedDecisionId: "", months: 1 }),
    ];
    for (const invalid of cases) {
      expect(() => advanceTimeV2(initial, invalid, NO_INTERRUPTING_EVENTS)).toThrow(
        expect.objectContaining({ code: "INVALID_COMMAND" }),
      );
    }

    expect(() =>
      advanceTimeV2(
        initial,
        command(inputs(1), { kind: "months", months: 2 }, { maxMonths: 2 }),
        NO_INTERRUPTING_EVENTS,
      ),
    ).toThrow(expect.objectContaining({ code: "INPUT_COUNT_MISMATCH" }));
  });

  it("has no forbidden production imports", () => {
    const source = readFileSync(
      new URL("../time-controller-v2.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(
      /(?:from|import\()\s*["'](?:react|next|node:fs|node:crypto|.*server\/|.*ai\/|.*db\/)/,
    );
    expect(source).not.toContain("Date.now");
    expect(source).not.toContain("Math.random");
  });

  it("completes a calm 480-month run within a generous Windows CI budget", () => {
    const initial = state({
      birthMonth: "2008-01",
      cashCents: 2_500_000,
      recurring: false,
      financialGoal: {
        version: "financial-goal-v1",
        desiredAnnualSpendingCents: moneyCents(1_000_000_000_000),
        safeWithdrawalRatePpm: ratePpm(20_000),
        targetAgeYears: 80,
        source: "player_selected",
      },
    });
    const started = performance.now();
    const result = advanceTimeV2(
      initial,
      command(
        inputs(MAX_TIME_CONTROLLER_MONTHS_V2, {
          noContributions: true,
          monthlySupportIncomeCents: 10_000_000,
        }),
        { kind: "until_end" },
      ),
      NO_INTERRUPTING_EVENTS,
    );
    const elapsedMs = performance.now() - started;
    expect(result.state.outcome).toBeNull();
    expect(result.monthsAdvanced).toBe(MAX_TIME_CONTROLLER_MONTHS_V2);
    expect(result.pauseReason.kind).toBe("bounded_limit");
    expect(result.state.currentMonth).toBe("2066-07");
    expect(elapsedMs).toBeLessThan(25_000);
  }, 30_000);
});
