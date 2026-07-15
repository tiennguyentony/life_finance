import { describe, expect, it } from "vitest";

import { sha256Canonical } from "./canonical";
import { moneyCents, ratePpm } from "./domain/money";
import { createInitialGameState } from "./game-state";
import {
  migrateGameStateV1ToV2,
  validateGameStateV2,
  type GameStateV2,
} from "./game-state-v2";

function createV1Fixture() {
  return createInitialGameState({
    runId: "run.migration-fixture",
    startMonth: "2026-07",
    player: {
      playerId: "player.migration-fixture",
      birthMonth: "1996-07",
      locationId: "location.seattle",
      careerTrackId: "career.software",
      filingStatus: "single",
    },
    finances: {
      cashCents: moneyCents(1_000_00),
      taxableInvestmentsCents: moneyCents(2_000_00),
      retirementCents: moneyCents(3_000_00),
      homeValueCents: moneyCents(4_000_00),
      otherInvestableAssetsCents: moneyCents(5_000_00),
      otherAssetsCents: moneyCents(6_000_00),
      nonCreditLiabilitiesCents: moneyCents(7_000_00),
      creditLimitCents: moneyCents(8_000_00),
      creditUsedCents: moneyCents(900_00),
      annualLivingCostCents: moneyCents(60_000_00),
      requiredObligationsCents: moneyCents(4_000_00),
    },
    wellbeing: {
      burnoutPpm: ratePpm(200_000),
      happinessPpm: ratePpm(800_000),
    },
    randomSeed: "migration-seed",
  });
}

describe("game state v1 to v2 migration", () => {
  it("preserves the authoritative v1 history and maps unknown balances without guessing", () => {
    const source = createV1Fixture();
    const migrated = migrateGameStateV1ToV2(source);

    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.engineVersion).toBe("4.1.0");
    expect(migrated.revision).toBe(source.revision);
    expect(migrated.ledger).toEqual(source.ledger);
    expect(migrated.acceptedCommandIds).toEqual(source.acceptedCommandIds);
    expect(migrated.finances).toEqual(source.finances);
    expect(migrated.gameplay.portfolio.taxableLegacyUnclassifiedCents).toBe(
      source.finances.taxableInvestmentsCents,
    );
    expect(migrated.gameplay.portfolio.retirementLegacyUnclassifiedCents).toBe(
      source.finances.retirementCents,
    );
    expect(migrated.gameplay.debts.legacyUnclassifiedPrincipalCents).toBe(
      source.finances.nonCreditLiabilitiesCents,
    );
    expect(migrated.gameplay.benefits.status).toBe("legacy_unknown");
    expect(migrated.gameplay.exposure.current).toBeNull();
    expect(validateGameStateV2(migrated)).toEqual([]);
    expect(Object.isFrozen(migrated.gameplay.portfolio)).toBe(true);
  });

  it("is byte-canonical and checksum deterministic for identical inputs", () => {
    const left = createV1Fixture();
    const right = createV1Fixture();
    const leftMigrated = migrateGameStateV1ToV2(left);
    const rightMigrated = migrateGameStateV1ToV2(right);

    expect(sha256Canonical(leftMigrated)).toBe(sha256Canonical(rightMigrated));
  });

  it("detects detailed balances that drift from aggregate and ledger-backed values", () => {
    const migrated = migrateGameStateV1ToV2(createV1Fixture());
    const corrupted = {
      ...migrated,
      gameplay: {
        ...migrated.gameplay,
        portfolio: {
          ...migrated.gameplay.portfolio,
          taxableBroadIndexCents: moneyCents(1),
        },
      },
    } as GameStateV2;

    expect(validateGameStateV2(corrupted)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "taxable_total_mismatch" }),
      ]),
    );
  });

  it("rejects overcommitted pre-tax and after-tax recurring strategies", () => {
    const migrated = migrateGameStateV1ToV2(createV1Fixture());
    const corrupted = {
      ...migrated,
      gameplay: {
        ...migrated.gameplay,
        recurringStrategy: {
          ...migrated.gameplay.recurringStrategy,
          preTax401kSalaryRatePpm: ratePpm(600_000),
          preTaxHsaSalaryRatePpm: ratePpm(500_000),
          afterTaxBroadIndexRatePpm: ratePpm(700_000),
          afterTaxExtraDebtRatePpm: ratePpm(400_000),
        },
      },
    } as GameStateV2;

    expect(validateGameStateV2(corrupted)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "pretax_overallocated" }),
        expect.objectContaining({ code: "aftertax_overallocated" }),
      ]),
    );
  });
});
