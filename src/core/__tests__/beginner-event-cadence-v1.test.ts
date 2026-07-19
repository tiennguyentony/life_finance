import { describe, expect, it } from "vitest";

import {
  PERSONAL_EVENT_PRESENTATIONS_V1,
  getPersonalEventPresentationV1,
} from "../../data/personal-event-presentation-v1";
import {
  ACTIVE_PERSONAL_EVENT_TEMPLATES_V2,
  PERSONAL_EVENT_TEMPLATES_V2,
  getActivePersonalEventTemplateV2,
} from "../../data/personal-event-templates-v2";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";
import {
  applyBeginnerEventCadenceV1,
  assessBeginnerEventCadenceV1,
  ACTIVE_BEGINNER_EVENT_CADENCE_VERSION,
  BEGINNER_EVENT_CADENCE_V1_VERSION,
  type BeginnerEventCadenceAssessmentV1,
} from "../beginner-event-cadence-v1";
import { moneyCents, ratePpm } from "../domain/money";
import { simulationMonth, type SimulationMonth } from "../domain/month";
import type {
  GameStateV2,
  PendingEventV2,
  ResolvedEventEvidenceV2,
} from "../game-state-v2";
import { createNativeGameStateV2 } from "../native-game-state-v2";
import {
  generateDeclarativePersonalEventCandidatesV2,
  type DeclarativePersonalEventCandidateV2,
} from "../personal-event-v2";
import { resolveScenarioCatalogSelection } from "../scenario-catalog";

function baseState(currentMonth = "2026-07"): GameStateV2 {
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
  const state = createNativeGameStateV2({
    runId: "run.beginner-cadence",
    playerId: "player.beginner-cadence",
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "beginner-cadence",
    resolvedScenario,
    annualGrossSalaryCents: moneyCents(12_000_000),
    finances: {
      cashCents: moneyCents(2_000_000),
      taxableBroadIndexCents: moneyCents(500_000),
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
  return { ...state, currentMonth: simulationMonth(currentMonth) };
}

function historyEvent(
  templateId: string,
  scheduledMonth: string,
  eventId = `evt.${scheduledMonth}.${templateId}`,
): ResolvedEventEvidenceV2 {
  const template = getActivePersonalEventTemplateV2(templateId);
  return {
    commandId: `cmd.${eventId}`,
    resultingRevision: 1,
    eventId,
    templateId: template.id,
    templateVersion: template.version,
    tier: template.severityTier,
    targetedWeakness: "unrelated_hazard",
    parameters: Object.fromEntries(
      template.parameters.map((parameter) => [parameter.id, parameter.minimum]),
    ),
    choiceId: template.responses[0]!.id,
    availableChoiceIds: template.responses.map(({ id }) => id),
    scheduledMonth: simulationMonth(scheduledMonth),
    resolvedMonth: simulationMonth(scheduledMonth),
    playerCostCents: moneyCents(0),
    insurerCostCents: moneyCents(0),
    eventSchemaVersion: 2,
    category: template.category,
    classification: template.classification,
    lessonTags: template.lessonTags,
    pressureCost: template.pressureCost,
    recoveryDurationMonths: template.recovery.durationMonths,
    fallbackNarrative: template.fallbackNarrative,
  };
}

function withHistory(
  state: GameStateV2,
  history: readonly ResolvedEventEvidenceV2[],
): GameStateV2 {
  return {
    ...state,
    gameplay: {
      ...state.gameplay,
      eventLifecycle: { ...state.gameplay.eventLifecycle, history },
    },
  };
}

function pendingEvent(currentMonth: SimulationMonth): PendingEventV2 {
  const template = getActivePersonalEventTemplateV2("personal.medical_bill");
  return {
    eventId: "evt.pending",
    templateId: template.id,
    templateVersion: template.version,
    tier: template.severityTier,
    targetedWeakness: "unrelated_hazard",
    parameters: { gross_bill_cents: 100_000 },
    choiceIds: template.responses.map(({ id }) => id),
    scheduledMonth: currentMonth,
    expiresMonth: currentMonth,
  };
}

function candidate(templateId: string): DeclarativePersonalEventCandidateV2 {
  return {
    template: getActivePersonalEventTemplateV2(templateId),
    targetedWeakness: "unrelated_hazard",
  };
}

function assessment(
  patch: Partial<BeginnerEventCadenceAssessmentV1>,
): BeginnerEventCadenceAssessmentV1 {
  return {
    version: BEGINNER_EVENT_CADENCE_V1_VERSION,
    mode: "open",
    chapterMonth: 4,
    quietEligibleStreak: 0,
    eventMonthStreak: 0,
    rootEventStreak: 0,
    positiveObserved: false,
    previousRootTone: null,
    reasonCodes: [],
    ...patch,
  };
}

describe("beginner event cadence v1", () => {
  it("keeps production activation gated until calibration passes", () => {
    expect(ACTIVE_BEGINNER_EVENT_CADENCE_VERSION).toBeNull();
  });

  it("is active in chapter months 1 and 12, then inactive in month 13", () => {
    expect(assessBeginnerEventCadenceV1(baseState("2026-07"))).toMatchObject({
      chapterMonth: 1,
      mode: "open",
    });
    expect(assessBeginnerEventCadenceV1(baseState("2027-06"))).toMatchObject({
      chapterMonth: 12,
    });
    expect(assessBeginnerEventCadenceV1(baseState("2027-07"))).toMatchObject({
      chapterMonth: 13,
      mode: "inactive",
    });
  });

  it("suppresses scheduling while an event is pending or the run is terminal", () => {
    const current = baseState();
    const pending = {
      ...current,
      gameplay: {
        ...current.gameplay,
        eventLifecycle: {
          ...current.gameplay.eventLifecycle,
          pending: pendingEvent(current.currentMonth),
        },
      },
    };
    const terminal = {
      ...current,
      outcome: {} as NonNullable<GameStateV2["outcome"]>,
    };

    expect(assessBeginnerEventCadenceV1(pending).mode).toBe("pending_or_terminal");
    expect(assessBeginnerEventCadenceV1(terminal).mode).toBe("pending_or_terminal");
  });

  it("prioritizes a due follow-up over recovery and engagement rules", () => {
    const state = withHistory(baseState("2026-09"), [
      historyEvent("personal.raccoon_sanitation", "2026-07"),
      historyEvent("personal.raccoon_management_followup", "2026-08"),
    ]);
    const due = {
      ...state,
      gameplay: {
        ...state.gameplay,
        eventLifecycle: {
          ...state.gameplay.eventLifecycle,
          scheduledFollowUps: [{
            sourceEventId: "evt.root",
            templateId: "personal.lamp_market_followup",
            templateVersion: 2,
            eligibleMonth: simulationMonth("2026-09"),
          }],
        },
      },
    };

    expect(assessBeginnerEventCadenceV1(due)).toMatchObject({
      mode: "follow_up_due",
      eventMonthStreak: 2,
      rootEventStreak: 0,
    });
  });

  it("requires a positive beat from chapter month 9 when none was observed", () => {
    expect(assessBeginnerEventCadenceV1(baseState("2027-03"))).toMatchObject({
      chapterMonth: 9,
      mode: "positive_due",
      positiveObserved: false,
    });
  });

  it("requests engagement after one eligible quiet month", () => {
    expect(assessBeginnerEventCadenceV1(baseState("2026-08"))).toMatchObject({
      chapterMonth: 2,
      quietEligibleStreak: 1,
      mode: "engagement_due",
    });
  });

  it("prefers recovery after two consecutive event months, including a follow-up", () => {
    const root = historyEvent("personal.raccoon_sanitation", "2026-07", "evt.raccoon");
    const followUp = {
      ...historyEvent("personal.raccoon_management_followup", "2026-08"),
      followUpSourceEventId: root.eventId,
    };
    const result = assessBeginnerEventCadenceV1(
      withHistory(baseState("2026-09"), [root, followUp]),
    );

    expect(result).toMatchObject({
      mode: "recovery_preferred",
      eventMonthStreak: 2,
      rootEventStreak: 0,
      previousRootTone: "absurd_comedy",
    });
  });

  it("filters deterministically without adding candidates", () => {
    const positive = candidate("personal.performance_bonus");
    const relatable = candidate("personal.subscription_archaeology");
    const absurd = candidate("personal.raccoon_sanitation");
    const serious = candidate("personal.medical_bill");
    const inputs = [serious, absurd, relatable, positive];

    expect(applyBeginnerEventCadenceV1(
      assessment({ mode: "positive_due" }),
      inputs,
    ).candidates.map(({ template }) => template.id)).toEqual([
      "personal.performance_bonus",
    ]);
    expect(applyBeginnerEventCadenceV1(
      assessment({ mode: "engagement_due" }),
      inputs,
    ).candidates.map(({ template }) => template.id)).toEqual([
      "personal.raccoon_sanitation",
      "personal.subscription_archaeology",
    ]);
    expect(applyBeginnerEventCadenceV1(
      assessment({ mode: "recovery_preferred" }),
      inputs,
    ).candidates).toEqual([]);
  });

  it("never schedules adjacent absurd roots and preserves due follow-ups", () => {
    const absurdRoot = candidate("personal.raccoon_sanitation");
    const relatableRoot = candidate("personal.subscription_archaeology");
    const followUp = {
      ...candidate("personal.raccoon_management_followup"),
      followUpSourceEventId: "evt.raccoon",
    };
    const open = applyBeginnerEventCadenceV1(
      assessment({ previousRootTone: "absurd_comedy" }),
      [absurdRoot, relatableRoot],
      PERSONAL_EVENT_PRESENTATIONS_V1,
    );
    const due = applyBeginnerEventCadenceV1(
      assessment({
        mode: "follow_up_due",
        previousRootTone: "absurd_comedy",
      }),
      [absurdRoot, followUp, relatableRoot],
    );

    expect(open.candidates.map(({ template }) => template.id)).toEqual([
      "personal.subscription_archaeology",
    ]);
    expect(due.candidates).toEqual([followUp]);
    expect(getPersonalEventPresentationV1(
      due.candidates[0]!.template.id,
      due.candidates[0]!.template.version,
    ).cadenceRole).toBe("follow_up");
  });

  it("resolves an exact historical follow-up outside the active root catalog", () => {
    const current = baseState("2026-09");
    const due = {
      ...current,
      gameplay: {
        ...current.gameplay,
        eventLifecycle: {
          ...current.gameplay.eventLifecycle,
          scheduledFollowUps: [{
            sourceEventId: "evt.transport.v2",
            templateId: "personal.transport_repair_followup",
            templateVersion: 2,
            eligibleMonth: current.currentMonth,
          }],
        },
      },
    };
    const generated = generateDeclarativePersonalEventCandidatesV2(
      due,
      ACTIVE_PERSONAL_EVENT_TEMPLATES_V2,
      PERSONAL_EVENT_TEMPLATES_V2,
    );

    expect(generated.candidates[0]).toMatchObject({
      template: {
        id: "personal.transport_repair_followup",
        version: 2,
      },
      followUpSourceEventId: "evt.transport.v2",
    });
  });
});
