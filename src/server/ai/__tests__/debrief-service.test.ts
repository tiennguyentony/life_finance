import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "../../../core/domain/money";
import { createInitialGameState } from "../../../core/game-state";
import { finalizeGameStateV2, migrateGameStateV1ToV2 } from "../../../core/game-state-v2";
import type { V2Repository } from "../../api/v2/repository-port";
import { AiDebriefService } from "../debrief-service";

function state(terminal: boolean) {
  const migrated = migrateGameStateV1ToV2(createInitialGameState({
    runId: "run.debrief", startMonth: "2026-07", randomSeed: "debrief",
    player: { playerId: "player.debrief", birthMonth: "1960-01", locationId: "location.test", careerTrackId: "career.test", filingStatus: "single" },
    finances: {
      cashCents: moneyCents(100_000), taxableInvestmentsCents: moneyCents(2_000_000), retirementCents: moneyCents(0),
      homeValueCents: moneyCents(0), otherInvestableAssetsCents: moneyCents(0), otherAssetsCents: moneyCents(0),
      nonCreditLiabilitiesCents: moneyCents(0), creditLimitCents: moneyCents(0), creditUsedCents: moneyCents(0),
      annualLivingCostCents: moneyCents(100_000), requiredObligationsCents: moneyCents(10_000),
    },
    wellbeing: { burnoutPpm: ratePpm(0), happinessPpm: ratePpm(1_000_000) },
  }));
  return terminal ? finalizeGameStateV2({
    ...migrated,
    outcome: {
      kind: "retirement_age",
      grade: "B",
      reachedMonth: migrated.currentMonth,
      reasonCode: "reached_age_65",
    },
  }) : migrated;
}

describe("AI final debrief service", () => {
  it("preserves the engine grade in deterministic fallback", async () => {
    const repository = { loadAuthorizedRunV2: async () => state(true) } as unknown as V2Repository;
    const service = new AiDebriefService(repository, () => ({ generate: async () => { throw new Error("offline"); } }) as never);

    const result = await service.createDebrief("run", "secret", {
      expectedRevision: 0,
      privacyNoticeVersion: 1,
      dataUseAccepted: true,
    });

    expect(result.source).toBe("deterministic_fallback");
    expect(result.debrief.grade).toBe("B");
    expect(result.debrief.decisiveMoments).toHaveLength(1);
  });

  it("rejects a debrief while the run remains active", async () => {
    const repository = { loadAuthorizedRunV2: async () => state(false) } as unknown as V2Repository;
    const service = new AiDebriefService(repository, () => ({ generate: async () => { throw new Error("unused"); } }) as never);
    await expect(service.createDebrief("run", "secret", {
      expectedRevision: 0,
      privacyNoticeVersion: 1,
      dataUseAccepted: true,
    })).rejects.toMatchObject({ code: "RUN_NOT_TERMINAL" });
  });
});
