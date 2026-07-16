import { describe, expect, it } from "vitest";

import { sha256Canonical } from "../canonical";
import { moneyCents, ratePpm } from "../domain/money";
import {
  createInitialGameState,
  type DeterministicGameOutcomeV1,
} from "../game-state";
import {
  migrateGameStateV1ToV2,
  validateGameStateV2,
  type GameStateV2,
} from "../game-state-v2";

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

  it("allows missing or positive CPI and rejects non-positive or unsafe CPI", () => {
    const migrated = migrateGameStateV1ToV2(createV1Fixture());
    expect("cumulativePriceIndexPpm" in migrated.gameplay.market).toBe(false);
    expect(validateGameStateV2(migrated)).toEqual([]);

    const withIndex = (cumulativePriceIndexPpm: number) =>
      ({
        ...migrated,
        gameplay: {
          ...migrated.gameplay,
          market: {
            ...migrated.gameplay.market,
            cumulativePriceIndexPpm,
          },
        },
      }) as GameStateV2;

    expect(validateGameStateV2(withIndex(1_234_567))).toEqual([]);
    for (const value of [0, -1, Number.MAX_SAFE_INTEGER + 1]) {
      expect(validateGameStateV2(withIndex(value))).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "gameplay.market.cumulativePriceIndexPpm",
            code: "invalid_cumulative_price_index",
          }),
        ]),
      );
    }
  });

  it("validates rich outcome evidence while accepting its exact structure", () => {
    const migrated = migrateGameStateV1ToV2(createV1Fixture());
    const valid = {
      ...migrated,
      outcome: {
        outcomePolicyVersion: "1.0.0",
        kind: "bankruptcy",
        grade: "F",
        reachedMonth: migrated.currentMonth,
        reasonCode: "actual_required_obligation_shortfall",
        reasonCodes: [
          "actual_required_obligation_shortfall",
          "automatic_liquidity_exhausted",
        ],
        financialIndependence: {
          goalSource: "current_lifestyle_default",
          investableAssetsCents: moneyCents(11_000_00),
          targetCents: moneyCents(1_500_000_00),
          progressPpm: ratePpm(7_333),
        },
        displayedNetWorthCents: moneyCents(13_100_00),
        automaticLiquidSolvency: {
          requiredCashCents: moneyCents(101),
          automaticLiquidityCents: moneyCents(100),
          residualShortfallCents: moneyCents(1),
          isSolvent: false,
        },
        retirementReadiness: {
          retirementAgeYears: 65,
          currentAgeYears: 30,
          reachedRetirementAge: false,
          gradeIfRetiredNow: "E",
        },
      },
    } as GameStateV2;

    expect(validateGameStateV2(valid)).toEqual([]);
    expect(
      validateGameStateV2({
        ...valid,
        outcome: {
          ...valid.outcome!,
          reasonCode: "invented_reason",
          automaticLiquidSolvency: {
            ...(valid.outcome as DeterministicGameOutcomeV1)
              .automaticLiquidSolvency,
            isSolvent: true,
          },
        },
      } as GameStateV2),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalid_outcome_evidence" }),
      ]),
    );
    expect(
      validateGameStateV2({
        ...valid,
        outcome: {
          ...valid.outcome!,
          automaticLiquidSolvency: {
            ...(valid.outcome as DeterministicGameOutcomeV1)
              .automaticLiquidSolvency,
            automaticLiquidityCents: moneyCents(99),
          },
        },
      } as GameStateV2),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalid_outcome_evidence" }),
      ]),
    );
  });
});
