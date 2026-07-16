import { describe, expect, it } from "vitest";

import { sha256Canonical } from "../canonical";
import { moneyCents, ratePpm } from "../domain/money";
import { createInitialGameState } from "../game-state";
import {
  migrateGameStateV1ToV2,
  validateGameStateV2,
  type GameStateV2,
} from "../game-state-v2";
import { decodePersistedGameState } from "../persisted-game-state";
import {
  assertValidRuntimeBalanceStateV1,
  createInitialRuntimeBalanceStateV1,
  InvalidRuntimeBalanceStateV1Error,
  runtimeBalanceStateV1,
  validateRuntimeBalanceStateV1,
  type RuntimeBalanceStateV1,
} from "../runtime-balance-state-v1";

function legacyState() {
  return createInitialGameState({
    runId: "run.runtime-balance",
    startMonth: "2026-07",
    randomSeed: "runtime-balance",
    player: {
      playerId: "player.runtime-balance",
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

describe("Runtime Balance state v1", () => {
  it("creates a frozen zero state and persists it during v1 migration", () => {
    const initial = createInitialRuntimeBalanceStateV1();
    const migrated = migrateGameStateV1ToV2(legacyState());

    expect(initial).toEqual({
      version: 1,
      pressurePpm: 0,
      recoveryUntilMonth: null,
      catastropheCount: 0,
      lastApprovedEventMonth: null,
    });
    expect(Object.isFrozen(initial)).toBe(true);
    expect(migrated.gameplay.runtimeBalance).toEqual(initial);
    expect(Object.isFrozen(migrated.gameplay.runtimeBalance)).toBe(true);
  });

  it("selects the zero state for older v2 JSON without mutating or rechecksumming it", () => {
    const migrated = migrateGameStateV1ToV2(legacyState());
    const gameplay = { ...migrated.gameplay } as Record<string, unknown>;
    Reflect.deleteProperty(gameplay, "runtimeBalance");
    const olderV2 = JSON.parse(
      JSON.stringify({ ...migrated, gameplay }),
    ) as unknown;
    const storedChecksum = sha256Canonical(olderV2);

    const decoded = decodePersistedGameState(olderV2);
    if (decoded.schemaVersion !== 2) throw new Error("expected schema v2");

    expect(runtimeBalanceStateV1(decoded)).toEqual(
      createInitialRuntimeBalanceStateV1(),
    );
    expect(decoded.gameplay).not.toHaveProperty("runtimeBalance");
    expect(sha256Canonical(decoded)).toBe(storedChecksum);
  });

  it("reports structured bounds, month, count, and ordering violations", () => {
    const invalid = {
      version: 2,
      pressurePpm: 1_000_001,
      recoveryUntilMonth: "2026-07",
      catastropheCount: -1,
      lastApprovedEventMonth: "2026-08",
    } as unknown as RuntimeBalanceStateV1;

    expect(validateRuntimeBalanceStateV1(invalid)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "version", code: "unsupported_version" }),
        expect.objectContaining({
          path: "pressurePpm",
          code: "rate_out_of_bounds",
        }),
        expect.objectContaining({
          path: "catastropheCount",
          code: "invalid_catastrophe_count",
        }),
        expect.objectContaining({
          path: "recoveryUntilMonth",
          code: "invalid_month_order",
        }),
      ]),
    );
    expect(() => assertValidRuntimeBalanceStateV1(invalid)).toThrow(
      InvalidRuntimeBalanceStateV1Error,
    );
  });

  it("reports a malformed storage container as a structured violation", () => {
    expect(
      validateRuntimeBalanceStateV1(
        null as unknown as RuntimeBalanceStateV1,
      ),
    ).toEqual([
      expect.objectContaining({
        path: "",
        code: "invalid_runtime_balance_state",
      }),
    ]);

    const migrated = migrateGameStateV1ToV2(legacyState());
    const invalid = {
      ...migrated,
      gameplay: { ...migrated.gameplay, runtimeBalance: null },
    } as unknown as GameStateV2;
    expect(validateGameStateV2(invalid)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "gameplay.runtimeBalance",
          code: "invalid_runtime_balance_state",
        }),
      ]),
    );
  });

  it("surfaces Runtime Balance violations through whole-state validation", () => {
    const migrated = migrateGameStateV1ToV2(legacyState());
    const invalid = {
      ...migrated,
      gameplay: {
        ...migrated.gameplay,
        runtimeBalance: {
          ...migrated.gameplay.runtimeBalance,
          pressurePpm: -1,
        },
      },
    } as GameStateV2;

    expect(validateGameStateV2(invalid)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "gameplay.runtimeBalance.pressurePpm",
          code: "rate_out_of_bounds",
        }),
      ]),
    );
  });
});
