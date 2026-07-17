import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "../domain/money";
import { createInitialGameState } from "../game-state";
import { migrateGameStateV1ToV2, type GameStateV2 } from "../game-state-v2";
import { projectFinancialGoal } from "../financial-goals-v2";
import { recordLearningInteractionV2 } from "../learning-interaction-v2";
import { analyzeRiskV1 } from "../risk-v1";
import { resolveScenarioCatalogSelection } from "../scenario-catalog";
import { selectTeachingMomentV2 } from "../teaching-relevance-v2";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";

function state(): GameStateV2 {
  return migrateGameStateV1ToV2(createInitialGameState({
    runId: "run.teaching-relevance",
    startMonth: "2029-04",
    randomSeed: "teaching-relevance",
    player: {
      playerId: "player.teaching-relevance",
      birthMonth: "1994-01",
      locationId: "location.test",
      careerTrackId: "career.test",
      filingStatus: "single",
    },
    finances: {
      cashCents: moneyCents(4_000_000), taxableInvestmentsCents: moneyCents(500_000),
      retirementCents: moneyCents(0), homeValueCents: moneyCents(0),
      otherInvestableAssetsCents: moneyCents(0), otherAssetsCents: moneyCents(0),
      nonCreditLiabilitiesCents: moneyCents(1_100_000), creditLimitCents: moneyCents(100_000),
      creditUsedCents: moneyCents(0), annualLivingCostCents: moneyCents(1_200_000),
      requiredObligationsCents: moneyCents(100_000),
    },
    wellbeing: { burnoutPpm: ratePpm(0), happinessPpm: ratePpm(1_000_000) },
  }));
}

function expose(base: GameStateV2, conceptIds: readonly string[]): GameStateV2 {
  return conceptIds.reduce((current, conceptId, index) =>
    recordLearningInteractionV2(current, {
      schemaVersion: 2,
      id: `relevance.${index}.${conceptId}`,
      type: "record_learning_interaction_v2",
      expectedRevision: current.revision,
      effectiveMonth: current.currentMonth,
      payload: { conceptId, kind: "glossary" },
    }), base);
}

function withSelectedBenefits(base: GameStateV2): GameStateV2 {
  const resolved = resolveScenarioCatalogSelection(US_2026_SCENARIO_CATALOG, {
    catalogVersion: US_2026_SCENARIO_CATALOG_VERSION,
    locationId: "location.seattle",
    careerId: "career.software",
    householdId: "household.single",
    benefitsPackageId: "benefits.corporate_flex",
    healthPlanId: "health.hdhp_hsa",
    retirementPlanId: "retirement.401k_standard",
    insuranceCoverageIds: [
      "insurance.long_term_disability",
      "insurance.renters",
    ],
    scenarioId: "scenario.fresh_start",
  });
  return {
    ...base,
    gameplay: {
      ...base.gameplay,
      catalogSnapshot: resolved.snapshot,
      catalogSnapshotChecksum: resolved.snapshotChecksum,
    },
  };
}

describe("Teaching v2 owner relevance", () => {
  it("uses fresh Risk v1 debt service evidence instead of Exposure DTI", () => {
    const base = state();
    const withExposure = {
      ...base,
      gameplay: {
        ...base.gameplay,
        employment: {
          status: "employed",
          annualGrossSalaryCents: moneyCents(4_000_000),
          careerId: "career.test",
          sectorId: "sector.test",
        },
        exposure: {
          ...base.gameplay.exposure,
          current: {
            month: base.currentMonth,
            scorePpm: ratePpm(400_000),
            emergencyFundMonthsPpm: ratePpm(3_000_000),
            debtToIncomePpm: ratePpm(900_000),
            revolvingDebtPpm: ratePpm(0),
            insuranceGapPpm: ratePpm(0),
            portfolioConcentrationPpm: ratePpm(0),
            jobInvestmentCorrelationPpm: ratePpm(0),
          },
        },
      },
    } as GameStateV2;

    const risk = analyzeRiskV1(withExposure);
    const result = selectTeachingMomentV2(
      withExposure,
      risk,
      { kind: "requested_help", conceptId: "dti" },
    );

    expect(result.facts?.facts).toContainEqual(expect.objectContaining({
      factId: "risk.debt_service_ratio",
      value: { kind: "rate_ppm", value: risk.metrics.debt_service_ratio.rawValue },
      source: expect.objectContaining({
        kind: "risk_snapshot",
        field: "metrics.debt_service_ratio.rawValue",
      }),
    }));
    expect(result.facts?.facts[0]?.source.sourceId).toContain(risk.version);
  });

  it("automatically reaches employer match and compounding from exact persisted owner fields", () => {
    const base = state();
    const withMatch = {
      ...base,
      gameplay: {
        ...base.gameplay,
        contributions: {
          ...base.gameplay.contributions,
          employee401kCents: moneyCents(20_000),
          employer401kCents: moneyCents(10_000),
        },
      },
    } as GameStateV2;
    const prior = expose(withMatch, ["emergency_fund", "dti", "deductible"]);
    const employer = selectTeachingMomentV2(prior, analyzeRiskV1(prior), { kind: "automatic" });
    expect(employer.moment?.conceptId).toBe("employer_match");
    expect(employer.facts?.facts[0]).toMatchObject({
      factId: "state.employer_401k_match_cents",
      value: { kind: "money_cents", value: 10_000 },
    });

    const afterEmployer = expose(prior, ["employer_match", "diversification"]);
    const compounding = selectTeachingMomentV2(
      afterEmployer,
      analyzeRiskV1(afterEmployer),
      { kind: "automatic" },
    );
    expect(compounding.moment?.conceptId).toBe("compounding");
    expect(compounding.facts?.facts[0]?.source.field).toBe(
      "gameplay.contributions.employee401kCents",
    );
  });

  it("uses the selected plan deductible, exact zero-cumulative match tiers, and Goal projection", () => {
    const selected = withSelectedBenefits(state());
    const deductible = selectTeachingMomentV2(
      selected,
      analyzeRiskV1(selected),
      { kind: "requested_help", conceptId: "deductible" },
    );
    expect(deductible.facts?.facts).toEqual([
      expect.objectContaining({
        factId: "state.selected_health_deductible_cents",
        value: {
          kind: "money_cents",
          value: selected.gameplay.catalogSnapshot!.selected.healthPlan!
            .annualDeductibleSelfCents,
        },
        source: expect.objectContaining({
          field: "gameplay.catalogSnapshot.selected.healthPlan.annualDeductibleSelfCents",
        }),
      }),
    ]);

    const employer = selectTeachingMomentV2(
      selected,
      analyzeRiskV1(selected),
      { kind: "requested_help", conceptId: "employer_match" },
    );
    const tiers = selected.gameplay.catalogSnapshot!.selected.retirementPlan
      .employerMatchTiers;
    expect(selected.gameplay.contributions.employer401kCents).toBe(0);
    expect(employer.facts?.facts).toHaveLength(tiers.length * 2);
    for (const [index, tier] of tiers.entries()) {
      expect(employer.facts?.facts).toEqual(expect.arrayContaining([
        expect.objectContaining({
          factId: `state.employer_match_tier.${index}.employee_rate_up_to_ppm`,
          value: { kind: "rate_ppm", value: tier.employeeContributionRateUpToPpm },
        }),
        expect.objectContaining({
          factId: `state.employer_match_tier.${index}.employer_rate_ppm`,
          value: { kind: "rate_ppm", value: tier.employerMatchRatePpm },
        }),
      ]));
    }

    const goal = projectFinancialGoal(
      selected.finances,
      selected.gameplay.financialGoal,
    );
    const financialIndependence = selectTeachingMomentV2(
      selected,
      analyzeRiskV1(selected),
      { kind: "requested_help", conceptId: "financial_independence" },
    );
    expect(financialIndependence.facts?.facts).toContainEqual(
      expect.objectContaining({
        factId: "goal.current.progress_ppm",
        value: { kind: "rate_ppm", value: goal.progressPpm },
        source: expect.objectContaining({
          kind: "goal_result",
          field: "progressPpm",
        }),
      }),
    );
  });

  it("requires restricted retirement assets alongside low liquid resources and cites both owners", () => {
    const priorConcepts = [
      "emergency_fund",
      "dti",
      "deductible",
      "employer_match",
      "diversification",
      "compounding",
      "job_investment_correlation",
    ];
    const presented = expose(state(), priorConcepts);
    const lowLiquid = {
      ...presented,
      finances: {
        ...presented.finances,
        cashCents: moneyCents(10_000),
        taxableInvestmentsCents: moneyCents(0),
        retirementCents: moneyCents(0),
      },
    } as GameStateV2;
    const absent = selectTeachingMomentV2(
      lowLiquid,
      analyzeRiskV1(lowLiquid),
      { kind: "automatic" },
    );
    expect(absent.moment?.conceptId).not.toBe("restricted_retirement_assets");

    const withRestrictedAssets = {
      ...lowLiquid,
      finances: {
        ...lowLiquid.finances,
        retirementCents: moneyCents(2_000_000),
      },
    } as GameStateV2;
    const result = selectTeachingMomentV2(
      withRestrictedAssets,
      analyzeRiskV1(withRestrictedAssets),
      { kind: "automatic" },
    );

    expect(result.moment?.conceptId).toBe("restricted_retirement_assets");
    expect(result.facts?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        factId: "risk.liquid_resource_coverage",
        source: expect.objectContaining({
          kind: "risk_snapshot",
          field: "metrics.liquid_resource_coverage.rawValue",
        }),
      }),
      expect.objectContaining({
        factId: "state.restricted_retirement_assets_cents",
        value: { kind: "money_cents", value: 2_000_000 },
        source: expect.objectContaining({
          kind: "game_state",
          field: "finances.retirementCents",
        }),
      }),
    ]));
  });

  it("cites the nonzero retirement base when it alone makes compounding relevant", () => {
    const base = state();
    const retirementOnly = {
      ...base,
      finances: {
        ...base.finances,
        taxableInvestmentsCents: moneyCents(0),
        retirementCents: moneyCents(3_000_000),
      },
      gameplay: {
        ...base.gameplay,
        contributions: {
          ...base.gameplay.contributions,
          employee401kCents: moneyCents(0),
        },
      },
    } as GameStateV2;

    const result = selectTeachingMomentV2(
      retirementOnly,
      analyzeRiskV1(retirementOnly),
      { kind: "requested_help", conceptId: "compounding" },
    );

    expect(result.facts?.facts).toEqual([
      expect.objectContaining({
        factId: "state.retirement_assets_cents",
        value: { kind: "money_cents", value: 3_000_000 },
        source: expect.objectContaining({ field: "finances.retirementCents" }),
      }),
    ]);
  });
});
