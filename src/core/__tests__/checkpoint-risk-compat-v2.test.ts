import { describe, expect, it } from "vitest";

import { buildCheckpointEvidenceV2 } from "../checkpoint-v2";
import { moneyCents, ratePpm } from "../domain/money";
import { recordExposureSnapshotV2 } from "../exposure-v2";
import { createInitialGameState } from "../game-state";
import { migrateGameStateV1ToV2, type GameStateV2 } from "../game-state-v2";

function state(): GameStateV2 {
  return migrateGameStateV1ToV2(createInitialGameState({
    runId: "run.checkpoint-risk",
    startMonth: "2026-07",
    randomSeed: "checkpoint-risk",
    player: {
      playerId: "player.checkpoint-risk",
      birthMonth: "1995-01",
      locationId: "location.test",
      careerTrackId: "career.test",
      filingStatus: "single",
    },
    finances: {
      cashCents: moneyCents(100_000),
      taxableInvestmentsCents: moneyCents(0),
      retirementCents: moneyCents(0),
      homeValueCents: moneyCents(0),
      otherInvestableAssetsCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      nonCreditLiabilitiesCents: moneyCents(0),
      creditLimitCents: moneyCents(0),
      creditUsedCents: moneyCents(0),
      annualLivingCostCents: moneyCents(600_000),
      requiredObligationsCents: moneyCents(50_000),
    },
    wellbeing: { burnoutPpm: ratePpm(0), happinessPpm: ratePpm(1_000_000) },
  }));
}

describe("checkpoint v2.1 current risk compatibility", () => {
  it("preserves the frozen legacy Exposure slot without making it a current owner", () => {
    const exposed = recordExposureSnapshotV2(state());
    const afterNonMonthChange = {
      ...exposed,
      finances: {
        ...exposed.finances,
        cashCents: moneyCents(2_000_000),
      },
    } as GameStateV2;

    const checkpoint = buildCheckpointEvidenceV2(
      afterNonMonthChange,
      afterNonMonthChange,
      [],
    );

    expect(exposed.gameplay.exposure.current).not.toBeNull();
    expect(checkpoint.start.exposure).toEqual(exposed.gameplay.exposure.current);
    expect(checkpoint.end.exposure).toEqual(exposed.gameplay.exposure.current);
  });
});
