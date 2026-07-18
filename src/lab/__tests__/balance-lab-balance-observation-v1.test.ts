import { describe, expect, it } from "vitest";

import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";
import { moneyCents, ratePpm } from "../../core/domain/money";
import { simulationMonth } from "../../core/domain/month";
import { createNativeGameStateV2 } from "../../core/native-game-state-v2";
import { resolveScenarioCatalogSelection } from "../../core/scenario-catalog";
import {
  observeBalanceLabMonthV1,
  type BalanceLabRuntimeDecisionEvidenceV1,
} from "../balance-lab-balance-observation-v1";

function state() {
  const resolved = resolveScenarioCatalogSelection(
    US_2026_SCENARIO_CATALOG,
    {
      catalogVersion: US_2026_SCENARIO_CATALOG_VERSION,
      locationId: "location.seattle",
      careerId: "career.software",
      householdId: "household.single",
      benefitsPackageId: "benefits.corporate_flex",
      healthPlanId: "health.hdhp_hsa",
      retirementPlanId: "retirement.401k_standard",
      insuranceCoverageIds: [],
      scenarioId: "scenario.fresh_start",
    },
  );
  return createNativeGameStateV2({
    runId: "run.balance-observation-v1",
    playerId: "player.balance-observation-v1",
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "balance-observation-v1",
    resolvedScenario: resolved,
    annualGrossSalaryCents: moneyCents(12_000_000),
    finances: {
      cashCents: moneyCents(2_500_000),
      taxableBroadIndexCents: moneyCents(2_000_000),
      taxableSectorCents: moneyCents(500_000),
      taxableSpeculativeCents: moneyCents(0),
      retirement401kCents: moneyCents(3_000_000),
      retirementIraCents: moneyCents(500_000),
      hsaCents: moneyCents(100_000),
      homeValueCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      termDebts: [],
      revolvingCreditLimitCents: moneyCents(1_000_000),
      revolvingCreditUsedCents: moneyCents(0),
    },
    wellbeing: {
      burnoutPpm: ratePpm(100_000),
      happinessPpm: ratePpm(900_000),
    },
  });
}

function decision(): BalanceLabRuntimeDecisionEvidenceV1 {
  return Object.freeze({
    difficulty: "normal",
    impactBands: Object.freeze({
      maximumImpactScorePpm: 800_000,
      maximumBurnMonthsPpm: 48_000_000,
      maximumNegativeCashFlowDurationMonths: 24,
      maximumRecoveryTimeMonths: 48,
    }),
    candidates: Object.freeze([
      Object.freeze({
        templateId: "event.car-repair",
        templateVersion: 1,
        rank: 2,
        evaluated: true,
        rejectionCodes: Object.freeze([]),
        impactScorePpm: 400_000,
        impact: Object.freeze({
          burnMonthsPpm: 24_000_000,
          negativeCashFlowDurationMonths: 12,
          recoveryTimeMonths: 24,
        }),
      }),
      Object.freeze({
        templateId: "event.medical-bill",
        templateVersion: 1,
        rank: 1,
        evaluated: true,
        rejectionCodes: Object.freeze(["impact_above_band"]),
        impactScorePpm: 900_000,
        impact: Object.freeze({
          burnMonthsPpm: 12_000_000,
          negativeCashFlowDurationMonths: 6,
          recoveryTimeMonths: 12,
        }),
      }),
    ]),
    approved: Object.freeze({
      templateId: "event.car-repair",
      templateVersion: 1,
    }),
  });
}

describe("Balance Lab balance shadow observation V1", () => {
  it("records opening preparedness without inventing event challenge evidence", () => {
    const opening = observeBalanceLabMonthV1(state(), undefined, -1);

    expect(opening).toMatchObject({
      version: "balance-lab-balance-observation-v1",
      monthIndex: -1,
      stage: "opening",
      month: simulationMonth("2026-07"),
      preparedness: { version: "preparedness-assessment-v1" },
      candidateChallenges: [],
      approvedChallenge: null,
    });
    expect(Object.isFrozen(opening)).toBe(true);
    expect(Object.isFrozen(opening.preparedness)).toBe(true);
    expect(Object.isFrozen(opening.candidateChallenges)).toBe(true);
  });

  it("measures every successful impact evaluation and identifies the approval", () => {
    const observed = observeBalanceLabMonthV1(
      state(),
      Object.freeze({ turn: Object.freeze({ runtimeBalanceDecision: decision() }) }),
      0,
    );

    expect(observed.candidateChallenges).toHaveLength(2);
    expect(observed.candidateChallenges[0]).toMatchObject({
      templateId: "event.car-repair",
      assessment: {
        scorePpm: 500_000,
        band: "meaningful",
        limitingDimension: "impact_score",
      },
    });
    expect(observed.candidateChallenges[1]).toMatchObject({
      templateId: "event.medical-bill",
      rejectionCodes: ["impact_above_band"],
      assessment: { scorePpm: 1_125_000, band: "above_limit" },
    });
    expect(observed.approvedChallenge).toEqual(
      observed.candidateChallenges[0],
    );
    expect(Object.isFrozen(observed.candidateChallenges[0])).toBe(true);
  });

  it("ignores candidates whose impact estimator did not produce complete evidence", () => {
    const incomplete = {
      ...decision(),
      candidates: [
        {
          templateId: "event.invalid",
          templateVersion: 1,
          rank: 1,
          evaluated: true,
          rejectionCodes: ["estimator_error"],
        },
      ],
      approved: undefined,
    } satisfies BalanceLabRuntimeDecisionEvidenceV1;

    const observed = observeBalanceLabMonthV1(
      state(),
      { turn: { runtimeBalanceDecision: incomplete } },
      0,
    );

    expect(observed.candidateChallenges).toEqual([]);
    expect(observed.approvedChallenge).toBeNull();
  });
});
