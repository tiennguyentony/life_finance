import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "../../../core/domain/money";
import { simulationMonth } from "../../../core/domain/month";
import {
  calculateInvestableAssets as calculateCanonicalInvestableAssets,
  calculateNetWorth as calculateCanonicalNetWorth,
  createInitialGameState,
} from "../../../core/game-state";
import { migrateGameStateV1ToV2 } from "../../../core/game-state-v2";
import {
  buildCreateRequest,
  calculateAgeYears,
  calculateFinancialIndependence,
  calculateInvestableAssets as calculatePlayInvestableAssets,
  calculateNetWorth as calculatePlayNetWorth,
  describeTimePauseV2,
  dollarsToCents,
  percentToPpm,
  strategyDraftFromState,
} from "../play-model";
import { selectionForPreset } from "../onboarding-model";

describe("developer play UI model", () => {
  it("hydrates every strategy draft field from restored authoritative state", () => {
    const base = migrateGameStateV1ToV2(createInitialGameState({
      runId: "run.strategy-restore",
      startMonth: "2026-07",
      randomSeed: "strategy-restore",
      player: {
        playerId: "player.strategy-restore",
        birthMonth: "1995-01",
        locationId: "location.test",
        careerTrackId: "career.test",
        filingStatus: "single",
      },
      finances: {
        cashCents: moneyCents(1_000_000),
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
    const restored = {
      ...base,
      gameplay: {
        ...base.gameplay,
        benefits: {
          ...base.gameplay.benefits,
          insuranceCoverageIds: ["insurance.renters"],
        },
        recurringStrategy: {
          effectiveMonth: base.currentMonth,
          emergencyFundTargetMonthsPpm: ratePpm(7_500_000),
          insuranceCoverageIds: [],
          preTax401kSalaryRatePpm: ratePpm(110_000),
          preTaxHsaSalaryRatePpm: ratePpm(20_000),
          afterTaxBroadIndexRatePpm: ratePpm(130_000),
          afterTaxSectorRatePpm: ratePpm(40_000),
          afterTaxSpeculativeRatePpm: ratePpm(30_000),
          afterTaxIraRatePpm: ratePpm(50_000),
          afterTaxExtraDebtRatePpm: ratePpm(60_000),
        },
      },
    } as const;

    expect(strategyDraftFromState(restored)).toEqual({
      emergencyFundMonths: 7.5,
      insuranceCoverageIds: [],
      retirement: 11,
      hsa: 2,
      index: 13,
      sector: 4,
      speculative: 3,
      ira: 5,
      debt: 6,
    });
  });

  it("previews strategy and detailed action commands before applying the exact approved command", () => {
    const source = readFileSync(
      new URL("../play-console.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("/commands/preview");
    expect(source).toContain("approvedPolicyCommand(");
    expect(source).toContain("submit(approvedCommand, policyPreview.activityMessage)");
    expect(source).toContain("isCurrentPolicyPreviewGeneration(");
    expect(source.match(/invalidateCurrentPolicyPreview/g)?.length).toBeGreaterThanOrEqual(5);

    const strategyFlow = source.slice(
      source.indexOf("const saveStrategy"),
      source.indexOf("const runMonths"),
    );
    const actionFlow = source.slice(
      source.indexOf("const takeAction"),
      source.indexOf("const resolveChoice"),
    );
    expect(strategyFlow).toContain("previewPolicyCommand(");
    expect(strategyFlow).not.toContain("submit(");
    expect(actionFlow).toContain("previewPolicyCommand(");
    expect(actionFlow).not.toContain("submit(");
  });

  it("uses one advance request and one pause activity for hidden months", () => {
    const source = readFileSync(
      new URL("../play-console.tsx", import.meta.url),
      "utf8",
    );
    const runMonths = source.slice(
      source.indexOf("const runMonths"),
      source.indexOf("const takeAction"),
    );

    expect(runMonths).toContain("/advance");
    expect(runMonths).not.toContain("/commands");
    expect(runMonths).not.toMatch(/for\s*\(/);
    expect(runMonths.match(/apiRequest</g)).toHaveLength(1);
    expect(runMonths.match(/describeTimePauseV2/g)).toHaveLength(1);
  });

  it.each([
    [{ kind: "requested_duration", requestedMonths: 12 }, "Requested 12-month advance completed."],
    [{ kind: "periodic_checkpoint", checkpointMonth: simulationMonth("2027-07") }, "Checkpoint reached at 2027-07."],
    [{ kind: "event_response", eventId: "event.1" }, "Progress paused for a required event response."],
    [{ kind: "policy_decision", decisionKind: "life_milestone" }, "Progress paused for a required life milestone decision."],
    [{ kind: "financial_warning", warning: { kind: "monthly_cash_flow_deficit", cashFlowDeficitCents: moneyCents(12_345) } }, "Progress paused for a monthly cash-flow warning."],
    [{ kind: "financial_independence" }, "Financial independence reached."],
    [{ kind: "retirement" }, "Configured retirement age reached."],
    [{ kind: "bankruptcy" }, "Progress stopped after liquidity was exhausted."],
    [{ kind: "explicit_user_stop" }, "Time advance stopped by the player."],
    [{ kind: "bounded_limit", maxMonths: 480 }, "Safe 480-month processing limit reached."],
  ] as const)("describes tagged time pause %#", (pause, expected) => {
    expect(describeTimePauseV2(pause)).toBe(expected);
  });

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

  it("delegates age boundaries and validation to the canonical calendar selector", () => {
    expect(calculateAgeYears("2000-07", "2026-06")).toBe(25);
    expect(calculateAgeYears("2000-07", "2026-07")).toBe(26);
    expect(() => calculateAgeYears("2000-7", "2026-07")).toThrow(
      /YYYY-MM/,
    );
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
      goalSource: "current_lifestyle_default",
      investableAssetsCents: 1_000,
      targetCents: 1_000,
      progressPpm: 1_000_000,
    });
    expect(calculatePlayInvestableAssets(state)).toBe(
      calculateCanonicalInvestableAssets(state.finances),
    );
  });

  it("presents persisted terminal FI evidence instead of recalculating it", () => {
    const state = {
      finances: {
        cashCents: 100,
        taxableInvestmentsCents: 200,
        retirementCents: 300,
        otherInvestableAssetsCents: 400,
        homeValueCents: 0,
        annualLivingCostCents: 40,
      },
      gameplay: {},
      outcome: {
        outcomePolicyVersion: "1.0.0",
        kind: "retirement_age",
        grade: "B",
        reachedMonth: "2065-07",
        reasonCode: "configured_retirement_age_reached",
        reasonCodes: [
          "configured_retirement_age_reached",
          "financial_independence_target_not_reached",
        ],
        financialIndependence: {
          goalSource: "player_selected",
          investableAssetsCents: 600,
          targetCents: 1_000,
          progressPpm: 600_000,
        },
        displayedNetWorthCents: 600,
        automaticLiquidSolvency: {
          requiredCashCents: 20,
          automaticLiquidityCents: 100,
          residualShortfallCents: 0,
          isSolvent: true,
        },
        retirementReadiness: {
          retirementAgeYears: 65,
          currentAgeYears: 65,
          reachedRetirementAge: true,
          gradeIfRetiredNow: "B",
        },
      },
    } as unknown as Parameters<typeof calculateFinancialIndependence>[0];

    expect(calculateFinancialIndependence(state)).toEqual({
      goalSource: "player_selected",
      investableAssetsCents: 600,
      targetCents: 1_000,
      progressPpm: 600_000,
    });
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
