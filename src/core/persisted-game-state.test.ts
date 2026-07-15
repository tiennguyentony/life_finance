import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "./domain/money";
import { createInitialGameState } from "./game-state";
import { migrateGameStateV1ToV2 } from "./game-state-v2";
import {
  decodePersistedGameState,
  PersistedGameStateDecodeError,
} from "./persisted-game-state";

function v1Fixture() {
  return createInitialGameState({
    runId: "run.persisted-decoder",
    startMonth: "2026-07",
    randomSeed: "persisted-decoder",
    player: {
      playerId: "player.persisted-decoder",
      birthMonth: "1990-01",
      locationId: "location.seattle",
      careerTrackId: "career.software",
      filingStatus: "single",
    },
    finances: {
      cashCents: moneyCents(100_00),
      taxableInvestmentsCents: moneyCents(200_00),
      retirementCents: moneyCents(300_00),
      homeValueCents: moneyCents(0),
      otherInvestableAssetsCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      nonCreditLiabilitiesCents: moneyCents(0),
      creditLimitCents: moneyCents(500_00),
      creditUsedCents: moneyCents(0),
      annualLivingCostCents: moneyCents(60_000_00),
      requiredObligationsCents: moneyCents(1_000_00),
    },
    wellbeing: {
      burnoutPpm: ratePpm(100_000),
      happinessPpm: ratePpm(900_000),
    },
  });
}

describe("persisted game-state decoder", () => {
  it("decodes and deeply freezes every supported schema", () => {
    const v1 = JSON.parse(JSON.stringify(v1Fixture())) as unknown;
    const v2 = JSON.parse(
      JSON.stringify(migrateGameStateV1ToV2(v1Fixture())),
    ) as unknown;

    const decodedV1 = decodePersistedGameState(v1);
    const decodedV2 = decodePersistedGameState(v2);

    expect(decodedV1.schemaVersion).toBe(1);
    expect(decodedV2.schemaVersion).toBe(2);
    expect(Object.isFrozen(decodedV1.ledger.transactions)).toBe(true);
    expect(
      decodedV2.schemaVersion === 2 &&
        Object.isFrozen(decodedV2.gameplay.recurringStrategy),
    ).toBe(true);
  });

  it("rejects unsupported, malformed, and internally inconsistent states", () => {
    expect(() => decodePersistedGameState(null)).toThrow(
      PersistedGameStateDecodeError,
    );
    expect(() => decodePersistedGameState({ schemaVersion: 3 })).toThrow(
      "unsupported schema version",
    );
    expect(() =>
      decodePersistedGameState({
        ...v1Fixture(),
        finances: { ...v1Fixture().finances, cashCents: -1 },
      }),
    ).toThrow("violates its versioned invariants");
  });
});
