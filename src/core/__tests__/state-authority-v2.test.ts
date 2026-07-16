import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "../domain/money";
import { createInitialGameState } from "../game-state";
import { migrateGameStateV1ToV2 } from "../game-state-v2";
import {
  MigrationRequiredError,
  requireAuthoritativeGameState,
  type AuthoritativeGameState,
} from "../state-authority-v2";

function legacyState() {
  return createInitialGameState({
    runId: "run.state-authority",
    startMonth: "2026-07",
    randomSeed: "state-authority",
    player: {
      playerId: "player.state-authority",
      birthMonth: "1990-01",
      locationId: "location.seattle",
      careerTrackId: "career.software",
      filingStatus: "single",
    },
    finances: {
      cashCents: moneyCents(100_00),
      taxableInvestmentsCents: moneyCents(0),
      retirementCents: moneyCents(0),
      homeValueCents: moneyCents(0),
      otherInvestableAssetsCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      nonCreditLiabilitiesCents: moneyCents(0),
      creditLimitCents: moneyCents(0),
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

describe("authoritative schema-v2 state", () => {
  it("returns schema-v2 state as the sole writable state type", () => {
    const v2 = migrateGameStateV1ToV2(legacyState());

    const authoritative: AuthoritativeGameState =
      requireAuthoritativeGameState(v2);

    expect(authoritative).toBe(v2);
    expect(authoritative.schemaVersion).toBe(2);
  });

  it("requires explicit migration before a legacy state can be mutated", () => {
    const v1 = legacyState();

    expect(() => requireAuthoritativeGameState(v1)).toThrow(
      expect.objectContaining<Partial<MigrationRequiredError>>({
        code: "MIGRATION_REQUIRED",
        sourceSchemaVersion: 1,
      }),
    );
  });
});
