import { describe, expect, it } from "vitest";

import {
  buildCreateRequest,
  calculateFinancialIndependence,
  dollarsToCents,
  percentToPpm,
} from "../play-model";

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
});
