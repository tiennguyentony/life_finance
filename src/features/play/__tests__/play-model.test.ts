import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "../../../core/domain/money";
import {
  calculateInvestableAssets as calculateCanonicalInvestableAssets,
  calculateNetWorth as calculateCanonicalNetWorth,
  createInitialGameState,
} from "../../../core/game-state";
import { migrateGameStateV1ToV2 } from "../../../core/game-state-v2";
import {
  buildCreateRequest,
  calculateFinancialIndependence,
  calculateInvestableAssets as calculatePlayInvestableAssets,
  calculateNetWorth as calculatePlayNetWorth,
  dollarsToCents,
  percentToPpm,
} from "../play-model";
import { selectionForPreset } from "../onboarding-model";

describe("developer play UI model", () => {
  it("builds a catalog-compatible starter request", () => {
    const request = buildCreateRequest("nurse", 85_000, 20_000, "test-seed");

    expect(request).toMatchObject({
      schemaVersion: 2,
      startMonth: "2026-07",
      locationId: "location.austin",
      careerId: "career.nurse",
      benefitsPackageId: "benefits.essential_worker",
      annualGrossSalaryCents: 8_500_000,
      finances: { cashCents: 2_000_000 },
    });
  });

  it("converts player-facing dollars and percentages to exact wire units", () => {
    expect(dollarsToCents(123.45)).toBe(12_345);
    expect(percentToPpm(7.5)).toBe(75_000);
    expect(dollarsToCents(Number.NaN)).toBe(0);
    expect(percentToPpm(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("adds optional student debt and established-household choices", () => {
    const request = buildCreateRequest(
      "established",
      125_000,
      75_000,
      "established-seed",
      {
        studentDebtDollars: 20_000,
        studentDebtPaymentDollars: 300,
      },
    );

    expect(request).toMatchObject({
      scenarioId: "scenario.established_household",
      householdId: "household.married",
      finances: {
        termDebts: [
          {
            id: "debt.student-loan",
            principalCents: 2_000_000,
            minimumPaymentCents: 30_000,
          },
        ],
      },
    });
  });

  it("keeps home equity outside the financial-independence numerator", () => {
    const state = {
      gameplay: {},
      finances: {
        cashCents: 100,
        taxableInvestmentsCents: 200,
        retirementCents: 300,
        otherInvestableAssetsCents: 400,
        homeValueCents: 1_000_000,
        annualLivingCostCents: 40,
      },
    } as Parameters<typeof calculateFinancialIndependence>[0];

    expect(calculateFinancialIndependence(state)).toEqual({
      investableAssetsCents: 1_000,
      targetCents: 1_000,
      progressPpm: 1_000_000,
    });
    expect(calculatePlayInvestableAssets(state)).toBe(
      calculateCanonicalInvestableAssets(state.finances),
    );
  });

  it("uses exact canonical net worth for high restricted wealth", () => {
    const maximum = Number.MAX_SAFE_INTEGER;
    const state = migrateGameStateV1ToV2(createInitialGameState({
      runId: "run.play-authority",
      startMonth: "2026-07",
      randomSeed: "play-authority",
      player: {
        playerId: "player.play-authority",
        birthMonth: "1995-01",
        locationId: "location.test",
        careerTrackId: "career.test",
        filingStatus: "single",
      },
      finances: {
        cashCents: moneyCents(0),
        taxableInvestmentsCents: moneyCents(0),
        retirementCents: moneyCents(maximum - 1),
        homeValueCents: moneyCents(maximum),
        otherInvestableAssetsCents: moneyCents(0),
        otherAssetsCents: moneyCents(0),
        nonCreditLiabilitiesCents: moneyCents(maximum),
        creditLimitCents: moneyCents(maximum),
        creditUsedCents: moneyCents(maximum),
        annualLivingCostCents: moneyCents(1),
        requiredObligationsCents: moneyCents(1),
      },
      wellbeing: {
        burnoutPpm: ratePpm(0),
        happinessPpm: ratePpm(1_000_000),
      },
    }));

    expect(calculateCanonicalNetWorth(state.finances)).toBe(-1);
    expect(calculatePlayNetWorth(state)).toBe(
      calculateCanonicalNetWorth(state.finances),
    );
  });

  it("sends a player-owned FI goal in exact engine units", () => {
    const request = buildCreateRequest("software", 120_000, 25_000, "goal", {
      financialGoal: {
        desiredAnnualSpendingDollars: 60_000,
        safeWithdrawalRatePercent: 3.5,
        targetAgeYears: 52,
      },
    });

    expect(request.financialGoal).toEqual({
      version: "financial-goal-v1",
      desiredAnnualSpendingCents: 6_000_000,
      safeWithdrawalRatePpm: 35_000,
      targetAgeYears: 52,
      source: "player_selected",
    });
  });

  it("uses custom life selections instead of locking the chosen persona", () => {
    const selection = {
      ...selectionForPreset("teacher"),
      birthMonth: "1980-06",
      locationId: "location.atlanta",
      householdId: "household.single_parent_one_child",
      healthPlanId: null,
    };
    const request = buildCreateRequest("software", 60_000, 10_000, "custom", {
      selection,
      healthPlanId: null,
      insuranceCoverageIds: [],
    });

    expect(request).toMatchObject({
      birthMonth: "1980-06",
      locationId: "location.atlanta",
      careerId: "career.teacher",
      householdId: "household.single_parent_one_child",
      benefitsPackageId: "benefits.public_service",
      healthPlanId: null,
      retirementPlanId: "retirement.403b_public",
      insuranceCoverageIds: [],
    });
  });
});
