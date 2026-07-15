import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "./domain/money";
import { simulationMonth } from "./domain/month";
import { createInitialGameState } from "./game-state";
import { finalizeGameStateV2, migrateGameStateV1ToV2 } from "./game-state-v2";
import { schedulePersonalEventV2 } from "./event-scheduler-v2";

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
          pendingEventId: "evt.pending",
        },
      },
    });
    expect(schedulePersonalEventV2(pending, ALWAYS)).toEqual({
      event: null,
      nextRandom: pending.random,
      eligibleTemplateIds: [],
    });
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
