import { describe, expect, it } from "vitest";

import { sha256Canonical } from "../canonical";
import { moneyCents, ratePpm } from "../domain/money";
import { simulationMonth, type SimulationMonth } from "../domain/month";
import { resetAnnualFinancialAccumulatorsV2 } from "../financial-year-v2";
import {
  finalizeGameStateV2,
  validateGameStateV2,
  type GameStateV2,
} from "../game-state-v2";
import { createNativeGameStateV2 } from "../native-game-state-v2";
import { resolveScenarioCatalogSelection } from "../scenario-catalog";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";

function stateAt(currentMonth: SimulationMonth): GameStateV2 {
  const resolvedScenario = resolveScenarioCatalogSelection(
    US_2026_SCENARIO_CATALOG,
    {
      catalogVersion: US_2026_SCENARIO_CATALOG_VERSION,
      locationId: "location.seattle",
      careerId: "career.software",
      householdId: "household.single",
      benefitsPackageId: "benefits.corporate_flex",
      healthPlanId: "health.hdhp_hsa",
      retirementPlanId: "retirement.401k_standard",
      insuranceCoverageIds: ["insurance.renters"],
      scenarioId: "scenario.fresh_start",
    },
  );
  const state = createNativeGameStateV2({
    runId: `run.annual-reset.${currentMonth}`,
    playerId: "player.annual-reset",
    birthMonth: simulationMonth("1995-01"),
    startMonth: currentMonth,
    randomSeed: "annual-reset",
    resolvedScenario,
    annualGrossSalaryCents: moneyCents(12_000_000),
    finances: {
      cashCents: moneyCents(1_000_000),
      taxableBroadIndexCents: moneyCents(0),
      taxableSectorCents: moneyCents(0),
      taxableSpeculativeCents: moneyCents(0),
      retirement401kCents: moneyCents(0),
      retirementIraCents: moneyCents(0),
      hsaCents: moneyCents(0),
      homeValueCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      termDebts: [],
      revolvingCreditLimitCents: moneyCents(1_000_000),
      revolvingCreditUsedCents: moneyCents(0),
    },
    wellbeing: {
      burnoutPpm: ratePpm(0),
      happinessPpm: ratePpm(1_000_000),
    },
  });
  return finalizeGameStateV2({
    ...state,
    gameplay: {
      ...state.gameplay,
      contributions: {
        policyYear: 2026,
        employee401kCents: moneyCents(100_000),
        employer401kCents: moneyCents(80_000),
        iraCents: moneyCents(60_000),
        hsaCents: moneyCents(40_000),
      },
      insurance: {
        policyYear: 2026,
        healthDeductiblePaidCents: moneyCents(30_000),
        healthOutOfPocketPaidCents: moneyCents(50_000),
        coverageUsage: [
          { coverageId: "insurance.renters", usedCents: moneyCents(70_000) },
        ],
      },
    },
  });
}

describe("annual financial accumulators", () => {
  it("does not reset December accumulators for the current policy year", () => {
    const state = stateAt(simulationMonth("2026-12"));

    expect(resetAnnualFinancialAccumulatorsV2(state)).toBe(state);
  });

  it("resets prior-year contributions and health accumulators in January", () => {
    const state = stateAt(simulationMonth("2027-01"));

    const reset = resetAnnualFinancialAccumulatorsV2(state);

    expect(reset.gameplay.contributions).toEqual({
      policyYear: 2027,
      employee401kCents: 0,
      employer401kCents: 0,
      iraCents: 0,
      hsaCents: 0,
    });
    expect(reset.gameplay.insurance).toEqual({
      policyYear: 2027,
      healthDeductiblePaidCents: 0,
      healthOutOfPocketPaidCents: 0,
      coverageUsage: [
        { coverageId: "insurance.renters", usedCents: 70_000 },
      ],
    });
    expect(validateGameStateV2(reset)).toEqual([]);
  });

  it("resets only the accumulator whose stored policy year differs", () => {
    const state = stateAt(simulationMonth("2027-01"));
    const currentContributions = {
      ...state.gameplay.contributions,
      policyYear: 2027,
    };
    const mixedPolicyYears = {
      ...state,
      gameplay: {
        ...state.gameplay,
        contributions: currentContributions,
      },
    } as GameStateV2;

    const reset = resetAnnualFinancialAccumulatorsV2(mixedPolicyYears);

    expect(reset.gameplay.contributions).toBe(currentContributions);
    expect(reset.gameplay.insurance.policyYear).toBe(2027);
    expect(reset.gameplay.insurance.healthDeductiblePaidCents).toBe(0);
  });

  it("advances across multiple years without mutating the input", () => {
    const state = stateAt(simulationMonth("2029-01"));
    const checksumBefore = sha256Canonical(state);

    const reset = resetAnnualFinancialAccumulatorsV2(state);

    expect(reset.gameplay.contributions.policyYear).toBe(2029);
    expect(reset.gameplay.insurance.policyYear).toBe(2029);
    expect(reset.gameplay.insurance.coverageUsage).toBe(
      state.gameplay.insurance.coverageUsage,
    );
    expect(sha256Canonical(state)).toBe(checksumBefore);
    expect(state.gameplay.contributions.policyYear).toBe(2026);
    expect(state.gameplay.insurance.policyYear).toBe(2026);
  });
});
