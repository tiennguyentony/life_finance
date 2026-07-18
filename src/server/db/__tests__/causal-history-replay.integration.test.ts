import { describe, expect, it } from "vitest";

import { sha256Canonical } from "../../../core/canonical";
import { buildCausalHistoryV1, causalNodeV1 } from "../../../core/causal-history-v1";
import { moneyCents, ratePpm } from "../../../core/domain/money";
import { simulationMonth } from "../../../core/domain/month";
import type { DetailedFinanceCommand } from "../../../core/detailed-actions-v2";
import type { DeterministicGameOutcomeV1 } from "../../../core/game-state";
import { queueScheduledDeclarativePersonalEventV2 } from "../../../core/event-lifecycle-v2";
import {
  DECLARATIVE_EVENT_SCHEDULER_V2_VERSION,
  DEFAULT_EVENT_SCHEDULING_POLICY_V2,
  schedulePersonalEventV2,
} from "../../../core/event-scheduler-v2";
import type { ManageLifeMilestoneV2Command } from "../../../core/life-milestones-v2";
import type { ProcessMonthV2Command } from "../../../core/monthly-turn-v2";
import { FINANCIAL_KERNEL_V2_VERSION } from "../../../core/monthly-turn-v2";
import type { RecordLearningInteractionV2Command } from "../../../core/learning-interaction-v2";
import { createNativeGameStateV2 } from "../../../core/native-game-state-v2";
import {
  OUTCOME_POLICY_V1_VERSION,
} from "../../../core/outcome-policy-v2";
import type { SetRecurringStrategyCommand } from "../../../core/recurring-strategy-v2";
import { RUNTIME_BALANCE_CONTROLLER_V1_VERSION } from "../../../core/runtime-balance-policy-v2";
import { resolveScenarioCatalogSelection } from "../../../core/scenario-catalog";
import { SCENARIO_DIRECTOR_V2_VERSION } from "../../../core/scenario-director-policy-v2";
import { buildTeachingDebriefV2 } from "../../../core/teaching-debrief-v2";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../../data/scenario-catalog";
import {
  assertImmutableLedgerPrefixV1,
  deriveCausalHistoryFromReplayV1,
} from "../causal-history-repository-v1";
import { runCounterfactualFromReplayV1 } from "../counterfactual-repository-v1";
import { buildTaxRequest } from "../../api/tax-orchestrator";
import { fingerprintAnnualTaxContext } from "../../tax/context-cache";
import type { GameCommandV2 } from "../run-repository-contracts";
import { reduceGameCommandV2 } from "../run-repository-support";
import {
  visitAcceptedCommandsV2,
  type AcceptedCommandReplayRowV2,
  type RunStateReplayAnchorV2,
} from "../run-state-replay-v2";

const runId = "11000000-0000-4000-8000-000000000011";

function initialState(randomSeed = "causal-integration") {
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
  return createNativeGameStateV2({
    runId,
    playerId: "player.causal.integration",
    birthMonth: simulationMonth("1992-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed,
    resolvedScenario,
    annualGrossSalaryCents: moneyCents(12_000_000),
    finances: {
      cashCents: moneyCents(2_000_000),
      taxableBroadIndexCents: moneyCents(0),
      taxableSectorCents: moneyCents(0),
      taxableSpeculativeCents: moneyCents(0),
      retirement401kCents: moneyCents(0),
      retirementIraCents: moneyCents(0),
      hsaCents: moneyCents(0),
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
}

function strategyCommand(): SetRecurringStrategyCommand {
  return {
    schemaVersion: 2,
    id: "cmd.causal.strategy",
    type: "set_recurring_strategy",
    expectedRevision: 0,
    effectiveMonth: simulationMonth("2026-07"),
    payload: {
      strategy: {
        emergencyFundTargetMonthsPpm: ratePpm(0),
        insuranceCoverageIds: ["insurance.renters"],
        preTax401kSalaryRatePpm: ratePpm(0),
        preTaxHsaSalaryRatePpm: ratePpm(0),
        afterTaxBroadIndexRatePpm: ratePpm(100_000),
        afterTaxSectorRatePpm: ratePpm(0),
        afterTaxSpeculativeRatePpm: ratePpm(0),
        afterTaxIraRatePpm: ratePpm(0),
        afterTaxExtraDebtRatePpm: ratePpm(0),
      },
    },
  };
}

function actionCommand(): DetailedFinanceCommand {
  return {
    schemaVersion: 2,
    id: "cmd.causal.invest",
    type: "take_detailed_action",
    expectedRevision: 1,
    effectiveMonth: simulationMonth("2026-07"),
    payload: {
      action: {
        type: "draw_revolving_credit",
        amountCents: moneyCents(100_000),
      },
    },
  };
}

function acceptedRow(
  command: GameCommandV2,
  resultingStateChecksum: string,
): AcceptedCommandReplayRowV2 {
  return {
    runId,
    commandId: command.id,
    commandSchemaVersion: command.schemaVersion,
    commandType: command.type,
    expectedRevision: command.expectedRevision,
    resultingRevision: command.expectedRevision + 1,
    effectiveMonth: command.effectiveMonth,
    payload: command.payload,
    resultingStateChecksum,
  };
}

function fixture() {
  const opening = initialState();
  const strategy = strategyCommand();
  const afterStrategy = reduceGameCommandV2(opening, strategy).state;
  const action = actionCommand();
  const closing = reduceGameCommandV2(afterStrategy, action).state;
  const anchor: RunStateReplayAnchorV2 = {
    runId,
    revision: 0,
    stateSchemaVersion: 2,
    engineVersion: opening.engineVersion,
    state: opening,
    stateChecksum: sha256Canonical(opening),
  };
  const rows = [
    acceptedRow(strategy, sha256Canonical(afterStrategy)),
    acceptedRow(action, sha256Canonical(closing)),
  ];
  return { opening, closing, anchor, rows };
}

describe("persisted replay -> causal history integration", () => {
  it("derives deterministic source-backed decisions, policy, effects, and risk without mutating the run", () => {
    const { opening, closing, anchor, rows } = fixture();
    const openingChecksum = sha256Canonical(opening);

    const first = deriveCausalHistoryFromReplayV1({
      anchor,
      rows,
      targetRevision: closing.revision,
      targetStateChecksum: sha256Canonical(closing),
    });
    const second = deriveCausalHistoryFromReplayV1({
      anchor,
      rows,
      targetRevision: closing.revision,
      targetStateChecksum: sha256Canonical(closing),
    });

    expect(second).toEqual(first);
    expect(first.sourceStateChecksum).toBe(sha256Canonical(closing));
    expect(first.coverage).toMatchObject({
      beginsAtRevision: 0,
      endsAtRevision: 2,
      preMigrationHistoryAvailable: true,
    });
    expect(first.nodes.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining([
        "decision",
        "policy_change",
        "financial_effect",
        "risk_change",
      ]),
    );
    expect(first.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "direct_cause",
          ruleCode: "policy_command_changed_strategy",
        }),
        expect.objectContaining({
          role: "direct_cause",
          ruleCode: "decision_applied_financial_transaction",
        }),
        expect.objectContaining({
          role: "direct_cause",
          ruleCode: "financial_change_updated_risk_measurement",
        }),
      ]),
    );
    expect(first.nodes.flatMap(({ sourceEvidenceIds }) => sourceEvidenceIds)).toContain(
      "command:cmd.causal.invest",
    );
    expect(sha256Canonical(opening)).toBe(openingChecksum);
  });

  it("copies exact production milestone financial deltas onto the milestone node", () => {
    const opening = initialState("causal-milestone");
    const schedule: ManageLifeMilestoneV2Command = {
      schemaVersion: 2,
      id: "cmd.causal.milestone.schedule",
      type: "manage_life_milestone",
      expectedRevision: 0,
      effectiveMonth: opening.currentMonth,
      payload: {
        action: "schedule",
        milestoneId: "milestone.causal.wedding",
        kind: "wedding",
        label: "Verified wedding",
        targetMonth: opening.currentMonth,
        estimatedCostCents: moneyCents(500_000),
      },
    };
    const scheduled = reduceGameCommandV2(opening, schedule).state;
    const resolve: ManageLifeMilestoneV2Command = {
      schemaVersion: 2,
      id: "cmd.causal.milestone.resolve",
      type: "manage_life_milestone",
      expectedRevision: 1,
      effectiveMonth: scheduled.currentMonth,
      payload: {
        action: "resolve",
        milestoneId: "milestone.causal.wedding",
        resolution: "pay_cash",
      },
    };
    const closing = reduceGameCommandV2(scheduled, resolve).state;
    const anchor: RunStateReplayAnchorV2 = {
      runId,
      revision: 0,
      stateSchemaVersion: 2,
      engineVersion: opening.engineVersion,
      state: opening,
      stateChecksum: sha256Canonical(opening),
    };
    const history = deriveCausalHistoryFromReplayV1({
      anchor,
      rows: [
        acceptedRow(schedule, sha256Canonical(scheduled)),
        acceptedRow(resolve, sha256Canonical(closing)),
      ],
      targetRevision: closing.revision,
      targetStateChecksum: sha256Canonical(closing),
    });
    const milestone = history.nodes.find(({ kind }) => kind === "milestone");

    expect(milestone?.affectedValues).toEqual(expect.arrayContaining([
      expect.objectContaining({ metricId: "cash_cents", delta: -500_000 }),
      expect.objectContaining({ metricId: "net_worth_cents", delta: -500_000 }),
    ]));
    expect(history.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleCode: "milestone_resolution_applied" }),
    ]));
  });

  it("exposes only checksum-verified replay transitions to observers", () => {
    const { closing, anchor, rows } = fixture();
    const observed: number[] = [];
    const replayed = visitAcceptedCommandsV2(
      anchor,
      rows,
      closing.revision,
      ({ after }) => observed.push(after.revision),
    );
    expect(observed).toEqual([1, 2]);
    expect(replayed.stateChecksum).toBe(sha256Canonical(closing));

    const corruptObserved: number[] = [];
    expect(() =>
      visitAcceptedCommandsV2(
        anchor,
        [rows[0]!, { ...rows[1]!, resultingStateChecksum: "0".repeat(64) }],
        closing.revision,
        ({ after }) => corruptObserved.push(after.revision),
      )
    ).toThrow(/checksum drifted/);
    expect(corruptObserved).toEqual([1]);
  });

  it("honors an explicit public revision range while replaying from the earlier anchor", () => {
    const { closing, anchor, rows } = fixture();
    const history = deriveCausalHistoryFromReplayV1({
      anchor,
      rows,
      targetRevision: closing.revision,
      targetStateChecksum: sha256Canonical(closing),
      responseFromRevision: 1,
      detailFromRevision: 1,
    });

    expect(history.fromRevision).toBe(1);
    expect(history.toRevision).toBe(2);
    expect(history.coverage.beginsAtRevision).toBe(1);
    expect(history.coverage.summarizedCommandRanges).toEqual([]);
    expect(
      history.nodes.flatMap(({ sourceEvidenceIds }) => sourceEvidenceIds),
    ).not.toContain("command:cmd.causal.strategy");
    expect(
      history.nodes.flatMap(({ sourceEvidenceIds }) => sourceEvidenceIds),
    ).toContain("command:cmd.causal.invest");
  });

  it("runs a bounded dual branch through the production monthly reducer without mutating persisted replay evidence", () => {
    const opening = initialState();
    const strategy = strategyCommand();
    const afterStrategy = reduceGameCommandV2(opening, strategy).state;
    const taxRequest = buildTaxRequest(afterStrategy, "cmd.causal.month");
    const month: ProcessMonthV2Command = {
      schemaVersion: 2,
      id: "cmd.causal.month",
      type: "process_month_v2",
      expectedRevision: 1,
      effectiveMonth: simulationMonth("2026-07"),
      payload: {
        taxEvidence: {
          schemaVersion: 1,
          traceId: "tax.causal.month",
          economicYear: 2026,
          policyYear: 2026,
          stateCode: taxRequest.stateCode,
          filingStatus: taxRequest.filingStatus,
          provider: "PolicyEngine US",
          bundleVersion: "4.21.0",
          rulesVersion: "1.764.6",
          projectedFromFrozenPolicy: false,
          grossIncomeCents: moneyCents(1_000_000),
          employee401kContributionCents: moneyCents(0),
          employeeHsaContributionCents: moneyCents(0),
          totalTaxCents: moneyCents(200_000),
          afterTaxCashIncomeCents: moneyCents(800_000),
          contextFingerprint: fingerprintAnnualTaxContext(taxRequest),
        },
        taxableLiquidationCostRatePpm: ratePpm(10_000),
      },
    };
    const monthlyApplied = reduceGameCommandV2(afterStrategy, month);
    const closing = monthlyApplied.state;
    const monthlyRecord = monthlyApplied.monthlyRecord!;
    const anchor: RunStateReplayAnchorV2 = {
      runId,
      revision: 0,
      stateSchemaVersion: 2,
      engineVersion: opening.engineVersion,
      state: opening,
      stateChecksum: sha256Canonical(opening),
    };
    const rows = [
      acceptedRow(strategy, sha256Canonical(afterStrategy)),
      acceptedRow(month, sha256Canonical(closing)),
    ];
    const evidenceChecksum = sha256Canonical({ anchor, rows });

    const result = runCounterfactualFromReplayV1(
      {
        anchor,
        rows,
        targetRevision: closing.revision,
        targetStateChecksum: sha256Canonical(closing),
      },
      {
        version: "counterfactual-v1",
        sourceCommandId: strategy.id,
        intervention: {
          kind: "recurring_strategy_field",
          commandId: strategy.id,
          field: "afterTaxBroadIndexRatePpm",
          value: 0,
        },
        horizonMonths: 1,
      },
    );

    expect(result.stopReason).toBe("requested_horizon_reached");
    expect(result.comparedMonths).toBe(1);
    expect(result.changedPaths).toEqual([
      "payload.strategy.afterTaxBroadIndexRatePpm",
    ]);
    expect(result.seedControl.mode).toBe("matched_shared_cursor_through_horizon");
    expect(result.actual.finalStateChecksum).toBe(sha256Canonical(closing));
    expect(result.alternative.finalStateChecksum).not.toBe(
      result.actual.finalStateChecksum,
    );
    expect(result.difference.cashCents).toBeGreaterThan(0);
    expect(result.requestedHorizonMonths).toBe(1);
    expect(sha256Canonical({ anchor, rows })).toBe(evidenceChecksum);
    expect(sha256Canonical(opening)).toBe(anchor.stateChecksum);

    const history = deriveCausalHistoryFromReplayV1({
      anchor,
      rows,
      targetRevision: closing.revision,
      targetStateChecksum: sha256Canonical(closing),
      storedMonthlyRecords: [{
        commandId: month.id,
        processedMonth: monthlyRecord.processedMonth,
        resultingRevision: closing.revision,
        taxTraceId: monthlyRecord.taxTraceId,
        recordChecksum: sha256Canonical(monthlyRecord),
        record: monthlyRecord,
      }],
    });
    expect(history.toRevision).toBe(closing.revision);
    expect(history.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: "contributing_condition",
        ruleCode: "policy_shaped_monthly_allocation",
        sourceEvidenceIds: expect.arrayContaining([
          "command:cmd.causal.strategy",
          "ledger:txn.cmd.causal.month.after-tax-strategy",
        ]),
      }),
    ]));
    const outcome: DeterministicGameOutcomeV1 = {
      outcomePolicyVersion: OUTCOME_POLICY_V1_VERSION,
      kind: "retirement_age",
      grade: "C",
      reachedMonth: closing.currentMonth,
      reasonCode: "configured_retirement_age_reached",
      reasonCodes: [
        "configured_retirement_age_reached",
        "financial_independence_target_not_reached",
      ],
      financialIndependence: {
        goalSource: "current_lifestyle_default",
        targetCents: moneyCents(90_000_000),
        investableAssetsCents: moneyCents(1_000_000),
        progressPpm: ratePpm(11_111),
      },
      displayedNetWorthCents: moneyCents(3_000_000),
      automaticLiquidSolvency: {
        requiredCashCents: moneyCents(100_000),
        automaticLiquidityCents: moneyCents(2_000_000),
        residualShortfallCents: moneyCents(0),
        isSolvent: true,
      },
      retirementReadiness: {
        retirementAgeYears: 65,
        currentAgeYears: 65,
        reachedRetirementAge: true,
        gradeIfRetiredNow: "C",
      },
    };
    const outcomeNode = causalNodeV1({
      kind: "end_condition",
      primarySourceEvidenceId: "outcome:2:retirement_age",
      month: closing.currentMonth,
      resultingRevision: closing.revision,
      sourceEvidenceIds: ["outcome:2:retirement_age"],
      lessonTags: ["retirement_readiness"],
      affectedValues: [],
    });
    const debriefHistory = buildCausalHistoryV1({
      runId: history.runId,
      fromRevision: history.fromRevision,
      toRevision: history.toRevision,
      sourceStateChecksum: history.sourceStateChecksum,
      nodes: [...history.nodes, outcomeNode],
      links: history.edges.map((edge) => ({
        parentNodeId: edge.parentNodeId,
        childNodeId: edge.childNodeId,
        ruleCode: edge.ruleCode,
        sourceEvidenceIds: edge.sourceEvidenceIds,
      })),
      turningPoints: history.turningPoints,
      coverage: history.coverage,
    });
    const teachingDebrief = buildTeachingDebriefV2({
      outcome,
      outcomeStateChecksum: sha256Canonical(closing),
      causalHistory: debriefHistory,
      counterfactuals: [result],
    });
    expect(teachingDebrief.counterfactualStatus.status).toBe("verified_results");
    expect(teachingDebrief.counterfactuals[0]).toMatchObject({
      resultChecksum: result.resultChecksum,
      sourceCommandId: strategy.id,
      comparedMonths: 1,
      difference: result.difference,
    });
    expect(() =>
      deriveCausalHistoryFromReplayV1({
        anchor,
        rows,
        targetRevision: closing.revision,
        targetStateChecksum: sha256Canonical(closing),
        storedMonthlyRecords: [{
          commandId: month.id,
          processedMonth: monthlyRecord.processedMonth,
          resultingRevision: closing.revision,
          taxTraceId: monthlyRecord.taxTraceId,
          recordChecksum: "0".repeat(64),
          record: monthlyRecord,
        }],
      })
    ).toThrow(/stored monthly record/);
  });

  it("links a verified event response to its later production ledger by exact scheduled flow ID", () => {
    let opening = initialState("causal-event-flow.0");
    let scheduled: ReturnType<typeof schedulePersonalEventV2> | null = null;
    for (let index = 0; index < 400; index += 1) {
      const candidateState = initialState(`causal-event-flow.${index}`);
      const candidate = schedulePersonalEventV2(
        candidateState,
        DEFAULT_EVENT_SCHEDULING_POLICY_V2,
        DECLARATIVE_EVENT_SCHEDULER_V2_VERSION,
      );
      if (candidate.event?.template.id === "personal.medical_bill") {
        opening = candidateState;
        scheduled = candidate;
        break;
      }
    }
    expect(scheduled?.event?.template.id).toBe("personal.medical_bill");
    const queued = queueScheduledDeclarativePersonalEventV2(
      opening,
      scheduled!.event!,
    );
    const resolve: GameCommandV2 = {
      schemaVersion: 2,
      id: "cmd.causal.event.resolve",
      type: "resolve_event_choice",
      expectedRevision: 0,
      effectiveMonth: queued.currentMonth,
      payload: {
        eventId: queued.gameplay.eventLifecycle.pending!.eventId,
        choiceId: "pay_uninsured",
      },
    };
    const resolved = reduceGameCommandV2(queued, resolve).state;
    const responseEvidence = resolved.gameplay.eventLifecycle.history.at(-1)!;
    const scheduledFlow = responseEvidence.scheduledCashFlows?.[0];
    expect(scheduledFlow).toBeDefined();
    const monthId = "cmd.causal.event.month";
    const taxRequest = buildTaxRequest(resolved, monthId);
    const month: ProcessMonthV2Command = {
      schemaVersion: 2,
      id: monthId,
      type: "process_month_v2",
      expectedRevision: 1,
      effectiveMonth: resolved.currentMonth,
      payload: {
        financialKernelVersion: FINANCIAL_KERNEL_V2_VERSION,
        eventSchedulerVersion: DECLARATIVE_EVENT_SCHEDULER_V2_VERSION,
        taxEvidence: {
          schemaVersion: 1,
          traceId: "tax.causal.event.month",
          economicYear: 2026,
          policyYear: 2026,
          stateCode: taxRequest.stateCode,
          filingStatus: taxRequest.filingStatus,
          provider: "PolicyEngine US",
          bundleVersion: "4.21.0",
          rulesVersion: "1.764.6",
          projectedFromFrozenPolicy: false,
          grossIncomeCents: moneyCents(1_000_000),
          employee401kContributionCents: moneyCents(0),
          employeeHsaContributionCents: moneyCents(0),
          totalTaxCents: moneyCents(200_000),
          afterTaxCashIncomeCents: moneyCents(800_000),
          contextFingerprint: fingerprintAnnualTaxContext(taxRequest),
        },
        taxableLiquidationCostRatePpm: ratePpm(10_000),
      },
    };
    const appliedMonth = reduceGameCommandV2(resolved, month);
    const closing = appliedMonth.state;
    const flowTransaction = closing.ledger.transactions.find(
      (transaction) =>
        transaction.commandId === month.id &&
        transaction.causalReference?.kind === "system" &&
        transaction.causalReference.id === scheduledFlow!.id,
    );
    expect(flowTransaction).toBeDefined();
    const anchor: RunStateReplayAnchorV2 = {
      runId,
      revision: 0,
      stateSchemaVersion: 2,
      engineVersion: queued.engineVersion,
      state: queued,
      stateChecksum: sha256Canonical(queued),
    };
    const history = deriveCausalHistoryFromReplayV1({
      anchor,
      rows: [
        acceptedRow(resolve, sha256Canonical(resolved)),
        acceptedRow(month, sha256Canonical(closing)),
      ],
      targetRevision: closing.revision,
      targetStateChecksum: sha256Canonical(closing),
      storedMonthlyRecords: [{
        commandId: month.id,
        processedMonth: appliedMonth.monthlyRecord!.processedMonth,
        resultingRevision: closing.revision,
        taxTraceId: appliedMonth.monthlyRecord!.taxTraceId,
        recordChecksum: sha256Canonical(appliedMonth.monthlyRecord),
        record: appliedMonth.monthlyRecord!,
      }],
    });

    expect(history.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: "contributing_condition",
        ruleCode: "event_presented_response_context",
      }),
      expect.objectContaining({
        role: "direct_cause",
        ruleCode: "scheduled_flow_applied_by_financial_engine",
        sourceEvidenceIds: expect.arrayContaining([
          `event-response:${responseEvidence.eventId}:${resolve.id}`,
          `ledger:${flowTransaction!.id}`,
        ]),
      }),
    ]));
    expect(history.edges).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleCode: "liquidity_limited_recovery",
        childNodeId: `node:financial_effect:ledger:${flowTransaction!.id}`,
      }),
    ]));
  });

  it("keeps a status-none controller decision out of approval causality", () => {
    let selected:
      | Readonly<{
          opening: ReturnType<typeof initialState>;
          command: ProcessMonthV2Command;
          applied: ReturnType<typeof reduceGameCommandV2>;
        }>
      | null = null;
    for (let index = 0; index < 100; index += 1) {
      const opening = initialState(`causal-controller-none.${index}`);
      const id = `cmd.causal.controller-none.${index}`;
      const taxRequest = buildTaxRequest(opening, id);
      const command: ProcessMonthV2Command = {
        schemaVersion: 2,
        id,
        type: "process_month_v2",
        expectedRevision: 0,
        effectiveMonth: opening.currentMonth,
        payload: {
          financialKernelVersion: FINANCIAL_KERNEL_V2_VERSION,
          eventSchedulerVersion: DECLARATIVE_EVENT_SCHEDULER_V2_VERSION,
          runtimeBalanceControllerVersion:
            RUNTIME_BALANCE_CONTROLLER_V1_VERSION,
          scenarioDirectorVersion: SCENARIO_DIRECTOR_V2_VERSION,
          taxEvidence: {
            schemaVersion: 1,
            traceId: `tax.causal.controller-none.${index}`,
            economicYear: 2026,
            policyYear: 2026,
            stateCode: taxRequest.stateCode,
            filingStatus: taxRequest.filingStatus,
            provider: "PolicyEngine US",
            bundleVersion: "4.21.0",
            rulesVersion: "1.764.6",
            projectedFromFrozenPolicy: false,
            grossIncomeCents: moneyCents(1_000_000),
            employee401kContributionCents: moneyCents(0),
            employeeHsaContributionCents: moneyCents(0),
            totalTaxCents: moneyCents(200_000),
            afterTaxCashIncomeCents: moneyCents(800_000),
            contextFingerprint: fingerprintAnnualTaxContext(taxRequest),
          },
          taxableLiquidationCostRatePpm: ratePpm(10_000),
        },
      };
      const applied = reduceGameCommandV2(opening, command);
      if (
        applied.monthlyRecord?.runtimeBalanceDecision?.status === "none" &&
        applied.monthlyRecord.runtimeBalanceDecision.evaluatedCandidateCount > 0
      ) {
        selected = { opening, command, applied };
        break;
      }
    }
    expect(selected).not.toBeNull();
    const { opening, command, applied } = selected!;
    const anchor: RunStateReplayAnchorV2 = {
      runId,
      revision: 0,
      stateSchemaVersion: 2,
      engineVersion: opening.engineVersion,
      state: opening,
      stateChecksum: sha256Canonical(opening),
    };
    const history = deriveCausalHistoryFromReplayV1({
      anchor,
      rows: [acceptedRow(command, sha256Canonical(applied.state))],
      targetRevision: applied.state.revision,
      targetStateChecksum: sha256Canonical(applied.state),
      storedMonthlyRecords: [{
        commandId: command.id,
        processedMonth: applied.monthlyRecord!.processedMonth,
        resultingRevision: applied.state.revision,
        taxTraceId: applied.monthlyRecord!.taxTraceId,
        recordChecksum: sha256Canonical(applied.monthlyRecord),
        record: applied.monthlyRecord!,
      }],
    });

    expect(history.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "event_opportunity" }),
      expect.objectContaining({ kind: "director_ranking" }),
    ]));
    expect(history.nodes).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "event_approval" }),
    ]));
    expect(history.edges).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleCode: "risk_relevance_shaped_ranking" }),
    ]));
  });

  it("bounds detailed history to 120 accepted commands and checksums the pruned prefix", () => {
    const opening = initialState();
    const summarizedLedgerCommand: DetailedFinanceCommand = {
      schemaVersion: 2,
      id: "cmd.causal.summarized-ledger",
      type: "take_detailed_action",
      expectedRevision: 0,
      effectiveMonth: opening.currentMonth,
      payload: {
        action: {
          type: "draw_revolving_credit",
          amountCents: moneyCents(1),
        },
      },
    };
    let state = reduceGameCommandV2(opening, summarizedLedgerCommand).state;
    const rows: AcceptedCommandReplayRowV2[] = [];
    rows.push(acceptedRow(summarizedLedgerCommand, sha256Canonical(state)));
    for (let index = 0; index < 120; index += 1) {
      const command: RecordLearningInteractionV2Command = {
        schemaVersion: 2,
        id: `cmd.causal.learning.${index}`,
        type: "record_learning_interaction_v2",
        expectedRevision: state.revision,
        effectiveMonth: state.currentMonth,
        payload: {
          conceptId: `concept.causal.${index}`,
          kind: "glossary",
        },
      };
      state = reduceGameCommandV2(state, command).state;
      rows.push(acceptedRow(command, sha256Canonical(state)));
    }
    const anchor: RunStateReplayAnchorV2 = {
      runId,
      revision: 0,
      stateSchemaVersion: 2,
      engineVersion: opening.engineVersion,
      state: opening,
      stateChecksum: sha256Canonical(opening),
    };
    const history = deriveCausalHistoryFromReplayV1({
      anchor,
      rows,
      targetRevision: state.revision,
      targetStateChecksum: sha256Canonical(state),
    });
    expect(history.coverage.summarizedCommandRanges).toEqual([
      expect.objectContaining({ firstRevision: 1, lastRevision: 1 }),
    ]);
    expect(history.coverage.summarizedCommandRanges[0]?.sourceChecksum).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(history.toRevision).toBe(121);
  });

  it("rejects a rewritten ledger prefix before deriving causal evidence", () => {
    const { closing } = fixture();
    const first = closing.ledger.transactions[0]!;
    const rewritten = {
      ...closing,
      ledger: {
        ...closing.ledger,
        transactions: [{ ...first, description: "rewritten history" }],
      },
    } as typeof closing;

    expect(() => assertImmutableLedgerPrefixV1(closing, rewritten)).toThrow(
      /rewritten ledger prefix/,
    );
  });
});
