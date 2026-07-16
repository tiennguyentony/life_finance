import { describe, expect, it } from "vitest";

import { sha256Canonical } from "../canonical";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";
import { moneyCents, ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import {
  finalizeGameStateV2,
} from "../game-state-v2";
import {
  queueScheduledDeclarativePersonalEventV2,
  queueScheduledPersonalEventV2,
  resolveEventChoiceV2,
} from "../event-lifecycle-v2";
import {
  CAUSAL_EVENT_SCHEDULER_V1_VERSION,
  DECLARATIVE_EVENT_SCHEDULER_V2_VERSION,
  DEFAULT_EVENT_SCHEDULING_POLICY_V2,
  schedulePersonalEventV2,
} from "../event-scheduler-v2";
import { validateLedger } from "../ledger";
import {
  FINANCIAL_KERNEL_V2_VERSION,
  processMonthlyTurnV2,
  type ProcessMonthV2Command,
} from "../monthly-turn-v2";
import { createNativeGameStateV2 } from "../native-game-state-v2";
import { resolveScenarioCatalogSelection } from "../scenario-catalog";
import type {
  DeclarativePersonalEventScheduleV2,
  PersonalEventTemplateV2,
} from "../personal-event-v2";
import { RUNTIME_BALANCE_CONTROLLER_V1_VERSION } from "../runtime-balance-policy-v2";
import { createInitialRuntimeBalanceStateV2 } from "../runtime-balance-state-v2";
import { getPersonalEventTemplateV2 } from "../../data/personal-event-templates-v2";
import { getEventTemplate } from "../../data/event-templates";
import { decodePersistedGameState } from "../persisted-game-state";

function state(randomSeed: string) {
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
    runId: `run.personal-event-v2.${randomSeed}`,
    playerId: "player.personal-event-v2.integration",
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed,
    resolvedScenario,
    annualGrossSalaryCents: moneyCents(12_000_000),
    finances: {
      cashCents: moneyCents(2_000_000),
      taxableBroadIndexCents: moneyCents(200_000),
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
    wellbeing: { burnoutPpm: ratePpm(100_000), happinessPpm: ratePpm(900_000) },
  });
}

function monthCommand(
  opening: ReturnType<typeof state>,
  suffix: string,
  eventSchedulerVersion: ProcessMonthV2Command["payload"]["eventSchedulerVersion"] = CAUSAL_EVENT_SCHEDULER_V1_VERSION,
): ProcessMonthV2Command {
  return {
    schemaVersion: 2,
    id: `cmd.personal-event-v2.integration.month.${suffix}`,
    type: "process_month_v2",
    expectedRevision: opening.revision,
    effectiveMonth: opening.currentMonth,
    payload: {
      financialKernelVersion: FINANCIAL_KERNEL_V2_VERSION,
      eventSchedulerVersion,
      taxEvidence: {
        schemaVersion: 1,
        traceId: "tax.personal-event-v2.integration",
        economicYear: 2026,
        policyYear: 2026,
        stateCode: "WA",
        filingStatus: "single",
        provider: "PolicyEngine US",
        bundleVersion: "4.21.0",
        rulesVersion: "1.764.6",
        projectedFromFrozenPolicy: false,
        grossIncomeCents: moneyCents(1_000_000),
        employee401kContributionCents: moneyCents(0),
        employeeHsaContributionCents: moneyCents(0),
        totalTaxCents: moneyCents(200_000),
        afterTaxCashIncomeCents: moneyCents(800_000),
      },
      taxableLiquidationCostRatePpm: ratePpm(10_000),
      resolvedCashFlows: [],
    },
  };
}

describe("declarative personal-event v2 integration", () => {
  it("flows from seeded scheduling through choice resolution into the next financial-kernel ledger", () => {
    let scheduled: DeclarativePersonalEventScheduleV2 | null = null;
    let opening = state("personal-event-v2.integration.0");
    for (let index = 0; index < 400; index += 1) {
      const candidateState = state(`personal-event-v2.integration.${index}`);
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
    const resolved = resolveEventChoiceV2(queued, {
      schemaVersion: 2,
      id: "cmd.personal-event-v2.integration.resolve",
      type: "resolve_event_choice",
      expectedRevision: queued.revision,
      effectiveMonth: queued.currentMonth,
      payload: {
        eventId: queued.gameplay.eventLifecycle.pending!.eventId,
        choiceId: "pay_uninsured",
      },
    });
    const eventCost = resolved.gameplay.eventLifecycle.history.at(-1)!.playerCostCents;
    expect(eventCost).toBeGreaterThan(0);
    expect(resolved.finances.requiredObligationsCents).toBe(
      opening.finances.requiredObligationsCents,
    );
    expect(resolved.gameplay.eventLifecycle.activeCashFlows).toEqual([
      expect.objectContaining({
        sourceEventId: resolved.gameplay.eventLifecycle.history.at(-1)!.eventId,
        kind: "temporary_expense",
        amountCents: eventCost,
        remainingMonths: 1,
      }),
    ]);
    const activeFlow = resolved.gameplay.eventLifecycle.activeCashFlows![0]!;
    const collisionCommand = monthCommand(resolved, "collision");
    expect(() => processMonthlyTurnV2(resolved, {
      ...collisionCommand,
      payload: {
        ...collisionCommand.payload,
        resolvedCashFlows: [{
          id: activeFlow.id,
          kind: "temporary_expense",
          amountCents: moneyCents(1),
          sourceSystem: "integration_test",
        }],
      },
    })).toThrow();

    const noEvents = { version: "fairness-v1" as const, minimumChancePpm: 0, maximumChancePpm: 0 };
    const next = processMonthlyTurnV2(resolved, monthCommand(resolved, "one"), {
      eventSchedulingPolicy: noEvents,
    });
    expect(next.record.requiredCashCents).toBeGreaterThanOrEqual(eventCost);
    expect(next.record.resolvedExpenseCents).toBe(eventCost);
    expect(next.state.gameplay.eventLifecycle.activeCashFlows).toEqual([]);
    expect(next.state.ledger.transactions.length).toBeGreaterThan(
      resolved.ledger.transactions.length,
    );
    expect(validateLedger(next.state.ledger)).toEqual([]);
    expect(next.state.gameplay.eventLifecycle.history.at(-1)).toMatchObject({
      eventSchemaVersion: 2,
      templateId: "personal.medical_bill",
      choiceId: "pay_uninsured",
    });
    const afterSecondMonth = processMonthlyTurnV2(
      next.state,
      monthCommand(next.state as ReturnType<typeof state>, "two"),
      { eventSchedulingPolicy: noEvents },
    );
    expect(afterSecondMonth.record.resolvedExpenseCents).toBe(0);
  });

  it("integrates process-month scheduling directly into a persisted declarative pending event", () => {
    let scheduled: ReturnType<typeof processMonthlyTurnV2> | null = null;
    for (let index = 0; index < 100; index += 1) {
      const opening = state(`personal-event-v2.monthly-schedule.${index}`);
      const result = processMonthlyTurnV2(
        opening,
        monthCommand(opening, `schedule.${index}`, DECLARATIVE_EVENT_SCHEDULER_V2_VERSION),
      );
      if (result.state.gameplay.eventLifecycle.pending) {
        scheduled = result;
        break;
      }
    }

    expect(scheduled?.record.scheduledEvent).toMatchObject({ eventSchemaVersion: 2 });
    expect(scheduled?.state.gameplay.eventLifecycle.pending).toEqual(
      scheduled?.record.scheduledEvent,
    );
  });

  it("round-trips lifecycle-backed recovery into the next financial month and blocks catastrophe", () => {
    const medical = getPersonalEventTemplateV2("personal.medical_bill");
    const catastrophe: PersonalEventTemplateV2 = {
      ...medical,
      id: "personal.integration_catastrophe",
      severityTier: "catastrophe",
      pressureCost: 7,
      hazard: {
        ...medical.hazard,
        baseChancePpm: 1_000_000,
        minimumChancePpm: 1_000_000,
        maximumChancePpm: 1_000_000,
      },
      parameters: [{
        ...medical.parameters[0]!,
        minimum: 100_000,
        maximum: 100_000,
      }],
      cooldowns: { eventMonths: 8, categoryMonths: 0, lessonMonths: 0 },
      recovery: { durationMonths: 8 },
      maximumOccurrences: 10,
    };
    const native = state("runtime-balance-recovery.integration");
    const legacyLarge = getEventTemplate("personal.industry_layoff");
    const sourceEventId = "evt.2026-07.personal.industry_layoff.v1";
    const queued = queueScheduledPersonalEventV2(native, {
      proposal: {
        eventId: sourceEventId,
        templateId: legacyLarge.id,
        templateVersion: legacyLarge.version,
        parameters: { income_gap_cents: 300_000 },
      },
      template: legacyLarge,
      targetedWeakness: "unrelated_hazard",
    });
    const resolved = resolveEventChoiceV2(queued, {
      schemaVersion: 2,
      id: "resolve.recovery.source",
      type: "resolve_event_choice",
      expectedRevision: queued.revision,
      effectiveMonth: queued.currentMonth,
      payload: {
        eventId: sourceEventId,
        choiceId: "emergency_budget",
      },
    });
    const sourceEvidence = resolved.gameplay.eventLifecycle.history.at(-1)!;
    const recovering = finalizeGameStateV2({
      ...resolved,
      gameplay: {
        ...resolved.gameplay,
        runtimeBalance: {
          ...createInitialRuntimeBalanceStateV2("normal"),
          pressureUnits: 10,
          monthsSinceAnyEvent: 0,
          monthsSinceLargeEvent: 0,
          recovery: {
            sourceEventId,
            sourceTier: "large",
            targetedWeakness: sourceEvidence.targetedWeakness,
            remainingMonths: 4,
          },
          recentEvents: [{
            eventId: sourceEventId,
            templateId: sourceEvidence.templateId,
            templateVersion: sourceEvidence.templateVersion,
            category: "career",
            lessonTags: ["lesson.emergency_fund"],
            tier: "large",
            targetedWeakness: sourceEvidence.targetedWeakness,
            approvedMonth: sourceEvidence.scheduledMonth,
          }],
        },
      },
    });
    const decodedRecovery = decodePersistedGameState(
      JSON.parse(JSON.stringify(recovering)) as unknown,
    );
    if (decodedRecovery.schemaVersion !== 2) {
      throw new Error("recovery fixture must remain schema v2");
    }
    expect(sha256Canonical(decodedRecovery)).toBe(
      sha256Canonical(recovering),
    );
    const baseCommand = monthCommand(
      decodedRecovery as ReturnType<typeof state>,
      "recovery-block",
      DECLARATIVE_EVENT_SCHEDULER_V2_VERSION,
    );
    const result = processMonthlyTurnV2(
      decodedRecovery,
      {
        ...baseCommand,
        payload: {
          ...baseCommand.payload,
          runtimeBalanceControllerVersion:
            RUNTIME_BALANCE_CONTROLLER_V1_VERSION,
        },
      },
      { personalEventCatalog: [catastrophe] },
    );

    expect(result.state.currentMonth).not.toBe(decodedRecovery.currentMonth);
    expect(result.state.ledger.transactions.length).toBeGreaterThan(
      decodedRecovery.ledger.transactions.length,
    );
    expect(result.record.runtimeBalanceDecision).toMatchObject({
      status: "none",
      candidates: [
        expect.objectContaining({
          templateId: catastrophe.id,
          rejectionCodes: expect.arrayContaining(["recovery_block"]),
        }),
      ],
    });
    expect(result.state.gameplay.eventLifecycle.pending).toBeNull();
    expect(result.state.gameplay.runtimeBalance).toMatchObject({
      version: 2,
      recovery: { remainingMonths: 3 },
    });
  });
});
