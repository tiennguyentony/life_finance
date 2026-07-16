import { describe, expect, it } from "vitest";

import { queueAiWorldEventV2, type QueueAiWorldEventV2Command } from "../ai-world-event-v2";
import { sha256Canonical } from "../canonical";
import { moneyCents, ratePpm } from "../domain/money";
import { createInitialGameState } from "../game-state";
import { migrateGameStateV1ToV2, validateGameStateV2 } from "../game-state-v2";
import { recordExposureSnapshotV2 } from "../exposure-v2";

function state() {
  return recordExposureSnapshotV2(migrateGameStateV1ToV2(createInitialGameState({
    runId: "run.ai-world",
    startMonth: "2026-07",
    randomSeed: "ai-world",
    player: { playerId: "player.ai-world", birthMonth: "1995-01", locationId: "location.test", careerTrackId: "career.test", filingStatus: "single" },
    finances: {
      cashCents: moneyCents(50_000), taxableInvestmentsCents: moneyCents(0), retirementCents: moneyCents(0),
      homeValueCents: moneyCents(0), otherInvestableAssetsCents: moneyCents(0), otherAssetsCents: moneyCents(0),
      nonCreditLiabilitiesCents: moneyCents(0), creditLimitCents: moneyCents(100_000), creditUsedCents: moneyCents(0),
      annualLivingCostCents: moneyCents(600_000), requiredObligationsCents: moneyCents(50_000),
    },
    wellbeing: { burnoutPpm: ratePpm(0), happinessPpm: ratePpm(1_000_000) },
  })));
}

function command(parameters = { repair_cost_cents: 100_000 }): QueueAiWorldEventV2Command {
  return {
    schemaVersion: 2,
    id: "ai.world.test",
    type: "queue_ai_world_event_v2",
    expectedRevision: 0,
    effectiveMonth: state().currentMonth,
    payload: {
      source: "deterministic_fallback",
      templateId: "personal.unexpected_repair",
      templateVersion: 1,
      targetedWeaknessId: "low_emergency_fund",
      parameters,
      headline: "The car needs a repair",
      narrative: "A necessary repair tests the one-month cash buffer.",
      rationale: "The engine measured low emergency liquidity.",
      citedEvidenceIds: ["weakness.low_emergency_fund"],
    },
  };
}

describe("AI world event authority boundary", () => {
  it("queues only an eligible engine-owned event and preserves narrative evidence", () => {
    const queued = queueAiWorldEventV2(state(), command());

    expect(queued.revision).toBe(1);
    expect(queued.gameplay.eventLifecycle.pending).toMatchObject({
      templateId: "personal.unexpected_repair",
      parameters: { repair_cost_cents: 100_000 },
      aiNarrative: {
        source: "deterministic_fallback",
        headline: "The car needs a repair",
      },
    });
    expect(validateGameStateV2(queued)).toEqual([]);
    expect({
      stateChecksum: sha256Canonical(queued),
      randomValue: queued.random.value,
      pendingEventId: queued.gameplay.eventLifecycle.pending?.eventId,
    }).toEqual({
      stateChecksum: "178050d43cd9659193050c41465749dc490441903ad9bb5743f48497e8cbb5f1",
      randomValue: 3_796_965_626,
      pendingEventId: "evt.ai.2026-07.0.personal.unexpected_repair",
    });
  });

  it("rejects parameters outside immutable engine bounds", () => {
    expect(() => queueAiWorldEventV2(state(), command({ repair_cost_cents: 999_999_999 }))).toThrow(
      expect.objectContaining({ code: "INELIGIBLE_EVENT" }),
    );
  });
});
