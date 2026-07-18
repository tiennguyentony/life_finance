import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import { createInitialGameState } from "../game-state";
import { finalizeGameStateV2, migrateGameStateV1ToV2 } from "../game-state-v2";
import {
  CAUSAL_EVENT_SCHEDULER_V1_VERSION,
  DECLARATIVE_EVENT_SCHEDULER_V2_VERSION,
  schedulePersonalEventV2,
} from "../event-scheduler-v2";

const ALWAYS = {
  version: "fairness-v1" as const,
  minimumChancePpm: 1_000_000,
  maximumChancePpm: 1_000_000,
};

function exposedState() {
  const v1 = createInitialGameState({
    runId: "run.scheduler-v2",
    startMonth: "2026-07",
    randomSeed: "scheduler-v2",
    player: {
      playerId: "player.scheduler-v2",
      birthMonth: "1990-01",
      locationId: "location.seattle",
      careerTrackId: "career.software",
      filingStatus: "single",
    },
    finances: {
      cashCents: moneyCents(100_000),
      taxableInvestmentsCents: moneyCents(2_000_000),
      retirementCents: moneyCents(0),
      homeValueCents: moneyCents(0),
      otherInvestableAssetsCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      nonCreditLiabilitiesCents: moneyCents(8_000_000),
      creditLimitCents: moneyCents(1_000_000),
      creditUsedCents: moneyCents(900_000),
      annualLivingCostCents: moneyCents(8_000_000),
      requiredObligationsCents: moneyCents(700_000),
    },
    wellbeing: { burnoutPpm: ratePpm(100_000), happinessPpm: ratePpm(900_000) },
  });
  const state = migrateGameStateV1ToV2(v1);
  const exposure = Object.freeze({
    month: simulationMonth("2026-07"),
    scorePpm: ratePpm(2_600_000),
    emergencyFundMonthsPpm: ratePpm(142_857),
    debtToIncomePpm: ratePpm(800_000),
    revolvingDebtPpm: ratePpm(900_000),
    insuranceGapPpm: ratePpm(900_000),
    portfolioConcentrationPpm: ratePpm(800_000),
    jobInvestmentCorrelationPpm: ratePpm(700_000),
  });
  return finalizeGameStateV2({
    ...state,
    gameplay: {
      ...state.gameplay,
      exposure: { current: exposure, history: [exposure] },
    },
  });
}

describe("fair v2 personal-event scheduling", () => {
  it("dispatches explicit declarative-events-v2 without changing either historical path", () => {
    const opening = exposedState();
    const result = schedulePersonalEventV2(
      opening,
      ALWAYS,
      DECLARATIVE_EVENT_SCHEDULER_V2_VERSION,
    );
    expect(result.eligibleTemplateIds).toEqual(expect.arrayContaining([
      "personal.medical_bill",
      "personal.lifestyle_upgrade",
      "personal.utility_rebate",
    ]));
    expect(new Set(result.eligibleTemplateIds).size).toBe(result.eligibleTemplateIds.length);
    expect(result.eligibleTemplateIds).not.toContain("personal.subscription_archaeology");
    expect(result.nextRandom).not.toEqual(opening.random);
    if (result.event) {
      expect(result.event.template.schemaVersion).toBe(2);
      expect(result.event.template.version).toBe(2);
    }

    expect(schedulePersonalEventV2(opening, ALWAYS)).toEqual(
      schedulePersonalEventV2(opening, ALWAYS),
    );
    expect(schedulePersonalEventV2(opening, ALWAYS, CAUSAL_EVENT_SCHEDULER_V1_VERSION)).toEqual(
      schedulePersonalEventV2(opening, ALWAYS, CAUSAL_EVENT_SCHEDULER_V1_VERSION),
    );
  });

  it("keeps causal hazard draws and candidates independent of financial vulnerability", () => {
    const vulnerable = exposedState();
    const resilient = {
      ...vulnerable,
      finances: {
        ...vulnerable.finances,
        cashCents: moneyCents(10_000_000),
        creditUsedCents: moneyCents(0),
      },
      gameplay: {
        ...vulnerable.gameplay,
        exposure: {
          current: {
            ...vulnerable.gameplay.exposure.current!,
            scorePpm: ratePpm(1_000_000),
            emergencyFundMonthsPpm: ratePpm(12_000_000),
            revolvingDebtPpm: ratePpm(0),
            insuranceGapPpm: ratePpm(0),
            portfolioConcentrationPpm: ratePpm(0),
            jobInvestmentCorrelationPpm: ratePpm(0),
          },
          history: [],
        },
      },
    };

    const vulnerableSchedule = schedulePersonalEventV2(
      vulnerable,
      ALWAYS,
      CAUSAL_EVENT_SCHEDULER_V1_VERSION,
    );
    const resilientSchedule = schedulePersonalEventV2(
      resilient,
      ALWAYS,
      CAUSAL_EVENT_SCHEDULER_V1_VERSION,
    );

    expect(vulnerableSchedule).toEqual(resilientSchedule);
    expect(vulnerableSchedule.eligibleTemplateIds.length).toBeGreaterThan(0);
    expect(vulnerableSchedule.event?.targetedWeakness).toBe(
      "unrelated_hazard",
    );
  });

  it("is deterministic, catalog-bounded, and targets demonstrated weakness", () => {
    const left = schedulePersonalEventV2(exposedState(), ALWAYS);
    const right = schedulePersonalEventV2(exposedState(), ALWAYS);
    expect(left).toEqual(right);
    expect(left.event).not.toBeNull();
    expect(left.eligibleTemplateIds).toContain(left.event!.template.id);
    expect(left.event!.template.targetsWeaknesses).toContain(
      left.event!.targetedWeakness,
    );
    for (const definition of left.event!.template.parameters) {
      const value = left.event!.proposal.parameters[definition.id]!;
      expect(value).toBeGreaterThanOrEqual(definition.minimum);
      expect(value).toBeLessThanOrEqual(definition.maximum);
    }
    expect(left.nextRandom).not.toEqual(exposedState().random);
  });

  it("enforces template cooldown and preserves RNG while a choice is pending", () => {
    const first = schedulePersonalEventV2(exposedState(), ALWAYS);
    const cooled = finalizeGameStateV2({
      ...exposedState(),
      gameplay: {
        ...exposedState().gameplay,
        eventLifecycle: {
          ...exposedState().gameplay.eventLifecycle,
          cooldowns: [
            {
              templateId: first.event!.template.id,
              eligibleAgainMonth: simulationMonth("2027-01"),
            },
          ],
        },
      },
    });
    const next = schedulePersonalEventV2(cooled, ALWAYS);
    expect(next.eligibleTemplateIds).not.toContain(first.event!.template.id);

    const pending = finalizeGameStateV2({
      ...cooled,
      gameplay: {
        ...cooled.gameplay,
        eventLifecycle: {
          ...cooled.gameplay.eventLifecycle,
          pending: {
            eventId: "evt.pending",
            templateId: "personal.unexpected_repair",
            templateVersion: 1,
            tier: "micro",
            targetedWeakness: "low_emergency_fund",
            parameters: { repair_cost_cents: 25_000 },
            choiceIds: ["repair_now", "negotiate_repair"],
            scheduledMonth: simulationMonth("2026-07"),
            expiresMonth: simulationMonth("2026-08"),
          },
        },
      },
    });
    expect(schedulePersonalEventV2(pending, ALWAYS)).toEqual({
      event: null,
      nextRandom: pending.random,
      eligibleTemplateIds: [],
    });
  });

  it("suppresses a recently resolved event family while leaving other life events eligible", () => {
    const base = exposedState();
    const withRecentLifestyleEvent = finalizeGameStateV2({
      ...base,
      revision: 1,
      acceptedCommandIds: ["cmd.resolve.lifestyle"],
      gameplay: {
        ...base.gameplay,
        eventLifecycle: {
          ...base.gameplay.eventLifecycle,
          history: [{
            commandId: "cmd.resolve.lifestyle",
            resultingRevision: 1,
            eventId: "evt.recent.lifestyle",
            templateId: "personal.lifestyle_upgrade",
            templateVersion: 1,
            tier: "medium",
            targetedWeakness: "lifestyle_fragility",
            parameters: { annual_cost_increase_cents: 120_000 },
            choiceId: "keep_current_lifestyle",
            availableChoiceIds: ["accept_upgrade", "keep_current_lifestyle"],
            scheduledMonth: simulationMonth("2026-07"),
            resolvedMonth: simulationMonth("2026-07"),
            playerCostCents: moneyCents(0),
            insurerCostCents: moneyCents(0),
          }],
        },
      },
    });

    const result = schedulePersonalEventV2(withRecentLifestyleEvent, ALWAYS);
    expect(result.eligibleTemplateIds).not.toContain("personal.lifestyle_upgrade");
    expect(result.eligibleTemplateIds).toContain("personal.wedding_invitation");
    expect(result.eligibleTemplateIds).toContain("personal.transport_breakdown");
  });

  it("does not target a player without a recorded demonstrated weakness", () => {
    const state = exposedState();
    const disciplined = finalizeGameStateV2({
      ...state,
      gameplay: {
        ...state.gameplay,
        exposure: {
          current: {
            ...state.gameplay.exposure.current!,
            scorePpm: ratePpm(1_000_000),
            emergencyFundMonthsPpm: ratePpm(6_000_000),
            debtToIncomePpm: ratePpm(0),
            revolvingDebtPpm: ratePpm(0),
            insuranceGapPpm: ratePpm(0),
            portfolioConcentrationPpm: ratePpm(0),
            jobInvestmentCorrelationPpm: ratePpm(0),
          },
          history: [
            {
              ...state.gameplay.exposure.current!,
              scorePpm: ratePpm(1_000_000),
              emergencyFundMonthsPpm: ratePpm(6_000_000),
              debtToIncomePpm: ratePpm(0),
              revolvingDebtPpm: ratePpm(0),
              insuranceGapPpm: ratePpm(0),
              portfolioConcentrationPpm: ratePpm(0),
              jobInvestmentCorrelationPpm: ratePpm(0),
            },
          ],
        },
      },
    });
    const result = schedulePersonalEventV2(disciplined, ALWAYS);
    expect(result.event).toBeNull();
    expect(result.eligibleTemplateIds).toEqual([]);
  });
});
