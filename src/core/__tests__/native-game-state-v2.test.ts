import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import { FINANCIAL_GOAL_VERSION } from "../financial-goals-v2";
import { createInitialGameState } from "../game-state";
import { migrateGameStateV1ToV2, validateGameStateV2 } from "../game-state-v2";
import {
  createNativeGameStateV2,
  NativeGameStateV2Error,
  type NativeGameStateV2Input,
} from "../native-game-state-v2";
import { resolveScenarioCatalogSelection } from "../scenario-catalog";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";

function resolved(healthPlanId: string | null = "health.hdhp_hsa") {
  return resolveScenarioCatalogSelection(US_2026_SCENARIO_CATALOG, {
    catalogVersion: US_2026_SCENARIO_CATALOG_VERSION,
    locationId: "location.seattle",
    careerId: "career.software",
    householdId: "household.single",
    benefitsPackageId: "benefits.corporate_flex",
    healthPlanId,
    retirementPlanId: "retirement.401k_standard",
    insuranceCoverageIds: [
      "insurance.long_term_disability",
      "insurance.renters",
    ],
    scenarioId: "scenario.fresh_start",
  });
}

function input(
  overrides: Partial<NativeGameStateV2Input> = {},
): NativeGameStateV2Input {
  return {
    runId: "run.native-v2",
    playerId: "player.native-v2",
    birthMonth: simulationMonth("1995-03"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "native-v2-seed",
    resolvedScenario: resolved(),
    annualGrossSalaryCents: moneyCents(12_000_000),
    finances: {
      cashCents: moneyCents(1_000_000),
      taxableBroadIndexCents: moneyCents(2_000_000),
      taxableSectorCents: moneyCents(300_000),
      taxableSpeculativeCents: moneyCents(100_000),
      retirement401kCents: moneyCents(3_000_000),
      retirementIraCents: moneyCents(500_000),
      hsaCents: moneyCents(100_000),
      homeValueCents: moneyCents(0),
      otherAssetsCents: moneyCents(50_000),
      termDebts: [
        {
          id: "debt.student.1",
          kind: "student_loan",
          principalCents: moneyCents(2_000_000),
          annualInterestRatePpm: ratePpm(50_000),
          minimumPaymentCents: moneyCents(25_000),
          remainingTermMonths: 120,
        },
      ],
      revolvingCreditLimitCents: moneyCents(1_500_000),
      revolvingCreditUsedCents: moneyCents(200_000),
    },
    wellbeing: {
      burnoutPpm: ratePpm(200_000),
      happinessPpm: ratePpm(800_000),
    },
    ...overrides,
  };
}

describe("native game state v2 creation", () => {
  it("snapshots catalog values and creates reconciled detailed opening balances", () => {
    const state = createNativeGameStateV2(input());

    expect(state.schemaVersion).toBe(2);
    expect(state.engineVersion).toBe("4.1.0");
    expect(state.migration).toBeNull();
    expect(state.gameplay.catalogSnapshotChecksum).toHaveLength(64);
    expect(state.gameplay.financialGoal).toEqual({
      version: "financial-goal-v1",
      desiredAnnualSpendingCents: 6_500_000,
      safeWithdrawalRatePpm: 40_000,
      targetAgeYears: 65,
      source: "current_lifestyle_default",
    });
    expect(state.gameplay.employment).toEqual({
      status: "employed",
      annualGrossSalaryCents: 12_000_000,
      careerId: "career.software",
      sectorId: "sector.technology",
    });
    expect(state.finances).toMatchObject({
      cashCents: 1_000_000,
      taxableInvestmentsCents: 2_400_000,
      retirementCents: 3_500_000,
      otherInvestableAssetsCents: 100_000,
      nonCreditLiabilitiesCents: 2_000_000,
      annualLivingCostCents: 6_500_000,
      requiredObligationsCents: 584_967,
    });
    expect(state.gameplay.insurance).toEqual({
      policyYear: 2026,
      healthDeductiblePaidCents: 0,
      healthOutOfPocketPaidCents: 0,
      coverageUsage: [
        { coverageId: "insurance.long_term_disability", usedCents: 0 },
        { coverageId: "insurance.renters", usedCents: 0 },
      ],
    });
    expect(state.gameplay.market.cumulativePriceIndexPpm).toBe(1_000_000);
    expect(state.gameplay.runtimeBalance).toEqual({
      version: 1,
      pressurePpm: 0,
      recoveryUntilMonth: null,
      catastropheCount: 0,
      lastApprovedEventMonth: null,
    });
    expect(Object.isFrozen(state.gameplay.runtimeBalance)).toBe(true);
    expect(validateGameStateV2(state)).toEqual([]);
    expect(Object.isFrozen(state.gameplay.catalogSnapshot)).toBe(true);
  });

  it("opts into Runtime Balance v2 only when difficulty is explicit", () => {
    const legacyCompatible = createNativeGameStateV2(input());
    const guided = createNativeGameStateV2(
      input({ runtimeBalanceDifficulty: "guided" }),
    );

    expect(legacyCompatible.gameplay.runtimeBalance).toMatchObject({ version: 1 });
    expect(guided.gameplay.runtimeBalance).toMatchObject({
      version: 2,
      difficulty: "guided",
    });
  });

  it("rejects salary, cash, HSA, home, and debt combinations outside catalog constraints", () => {
    expect(() =>
      createNativeGameStateV2(
        input({ annualGrossSalaryCents: moneyCents(1_000_000) }),
      ),
    ).toThrow(
      expect.objectContaining<Partial<NativeGameStateV2Error>>({
        code: "SALARY_OUT_OF_RANGE",
      }),
    );
    expect(() =>
      createNativeGameStateV2(
        input({
          finances: { ...input().finances, cashCents: moneyCents(50_000) },
        }),
      ),
    ).toThrow(expect.objectContaining({ code: "STARTING_CASH_OUT_OF_RANGE" }));
    expect(() =>
      createNativeGameStateV2(
        input({ resolvedScenario: resolved("health.ppo_balanced") }),
      ),
    ).toThrow(expect.objectContaining({ code: "HSA_INELIGIBLE" }));
    expect(() =>
      createNativeGameStateV2(
        input({
          finances: {
            ...input().finances,
            homeValueCents: moneyCents(40_000_000),
          },
        }),
      ),
    ).toThrow(expect.objectContaining({ code: "SCENARIO_CONSTRAINT" }));
    expect(() =>
      createNativeGameStateV2(
        input({
          finances: {
            ...input().finances,
            termDebts: [
              {
                ...input().finances.termDebts[0]!,
                kind: "mortgage",
              },
            ],
          },
        }),
      ),
    ).toThrow(expect.objectContaining({ code: "INVALID_OPENING_DEBT" }));
  });

  it("rejects a player-selected finish line at or before the starting age", () => {
    expect(() =>
      createNativeGameStateV2(
        input({
          financialGoal: {
            version: FINANCIAL_GOAL_VERSION,
            desiredAnnualSpendingCents: moneyCents(6_000_000),
            safeWithdrawalRatePpm: ratePpm(40_000),
            targetAgeYears: 31,
            source: "player_selected",
          },
        }),
      ),
    ).toThrow(expect.objectContaining({ code: "INVALID_FINANCIAL_GOAL" }));
  });

  it("supports explicitly waiving health coverage without inventing HSA eligibility", () => {
    const waived = createNativeGameStateV2(
      input({
        resolvedScenario: resolved(null),
        finances: { ...input().finances, hsaCents: moneyCents(0) },
      }),
    );

    expect(waived.gameplay.benefits).toMatchObject({
      healthPlanId: null,
      hsaEligible: false,
    });
    expect(waived.gameplay.catalogSnapshot?.selected.healthPlan).toBeNull();
    expect(waived.gameplay.catalogSnapshot?.derived).toMatchObject({
      monthlyHealthPremiumCents: 0,
      hsaAnnualContributionLimitCents: null,
    });
    expect(validateGameStateV2(waived)).toEqual([]);
  });

  it("detects later catalog snapshot or selected-benefit drift", () => {
    const state = createNativeGameStateV2(input());
    const snapshotDrift = {
      ...state,
      gameplay: {
        ...state.gameplay,
        catalogSnapshot: {
          ...state.gameplay.catalogSnapshot!,
          derived: {
            ...state.gameplay.catalogSnapshot!.derived,
            annualLivingCostCents: moneyCents(1),
          },
        },
      },
    };
    const benefitsDrift = {
      ...state,
      gameplay: {
        ...state.gameplay,
        benefits: {
          ...state.gameplay.benefits,
          healthPlanId: "health.ppo_balanced",
        },
      },
    };

    expect(validateGameStateV2(snapshotDrift)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "catalog_checksum_mismatch" }),
      ]),
    );
    expect(validateGameStateV2(benefitsDrift)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "benefits_snapshot_mismatch" }),
      ]),
    );
  });

  it("keeps migrated v1 runs explicitly legacy rather than inventing native data", () => {
    const v1 = createInitialGameState({
      runId: "run.legacy",
      startMonth: "2026-07",
      randomSeed: "legacy",
      player: {
        playerId: "player.legacy",
        birthMonth: "1995-03",
        locationId: "location.legacy",
        careerTrackId: "career.legacy",
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
        annualLivingCostCents: moneyCents(60_000_00),
        requiredObligationsCents: moneyCents(500_000),
      },
      wellbeing: {
        burnoutPpm: ratePpm(0),
        happinessPpm: ratePpm(1_000_000),
      },
    });
    const migrated = migrateGameStateV1ToV2(v1);

    expect(migrated.migration).not.toBeNull();
    expect(migrated.gameplay.catalogSnapshot).toBeNull();
    expect(migrated.gameplay.employment.status).toBe("legacy_unknown");
    expect(migrated.gameplay.insurance.policyYear).toBeNull();
    expect(validateGameStateV2(migrated)).toEqual([]);
  });
});
