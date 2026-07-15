import { describe, expect, it } from "vitest";

import { queueAiWorldEventV2 } from "../../../core/ai-world-event-v2";
import { moneyCents, ratePpm } from "../../../core/domain/money";
import { recordExposureSnapshotV2 } from "../../../core/exposure-v2";
import { createInitialGameState } from "../../../core/game-state";
import { migrateGameStateV1ToV2 } from "../../../core/game-state-v2";
import type { V2Repository } from "../../api/v2/repository-port";
import { AiWorldDirectorService } from "../world-director-service";

function exposedState() {
  return recordExposureSnapshotV2(migrateGameStateV1ToV2(createInitialGameState({
    runId: "run.world-service", startMonth: "2026-07", randomSeed: "world-service",
    player: { playerId: "player.world", birthMonth: "1995-01", locationId: "location.test", careerTrackId: "career.test", filingStatus: "single" },
    finances: {
      cashCents: moneyCents(50_000), taxableInvestmentsCents: moneyCents(0), retirementCents: moneyCents(0),
      homeValueCents: moneyCents(0), otherInvestableAssetsCents: moneyCents(0), otherAssetsCents: moneyCents(0),
      nonCreditLiabilitiesCents: moneyCents(0), creditLimitCents: moneyCents(100_000), creditUsedCents: moneyCents(0),
      annualLivingCostCents: moneyCents(600_000), requiredObligationsCents: moneyCents(50_000),
    },
    wellbeing: { burnoutPpm: ratePpm(0), happinessPpm: ratePpm(1_000_000) },
  })));
}

describe("AI World Director service", () => {
  it("uses an engine-owned deterministic fallback and commits the event atomically", async () => {
    let current = exposedState();
    const repository = {
      loadAuthorizedRunV2: async () => current,
      applyCommandV2: async (_runId: string, _secret: string, command: Parameters<typeof queueAiWorldEventV2>[1]) => {
        current = queueAiWorldEventV2(current, command);
        return { state: current, stateChecksum: "unused", idempotentReplay: false, monthlyRecord: null };
      },
    } as unknown as V2Repository;
    const service = new AiWorldDirectorService(
      repository,
      () => ({ generate: async () => { throw new Error("offline"); } }) as never,
      () => "world-fallback",
    );

    const result = await service.createEvent("run", "secret", {
      expectedRevision: 0,
      privacyNoticeVersion: 2,
      dataUseAccepted: true,
    });

    expect(result.source).toBe("deterministic_fallback");
    expect(current.gameplay.eventLifecycle.pending?.aiNarrative).toMatchObject({
      source: "deterministic_fallback",
    });
    expect(result.memory.targetedWeaknessId).toBe("low_emergency_fund");
  });
});
