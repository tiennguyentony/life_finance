import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import { finalizeGameStateV2, type GameStateV2 } from "../game-state-v2";
import {
  adjudicateCoverageClaim,
  adjudicateHealthClaim,
} from "../insurance-v2";
import { createNativeGameStateV2 } from "../native-game-state-v2";
import { resolveScenarioCatalogSelection } from "../scenario-catalog";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";

function state(healthPlanId: string | null = "health.ppo_balanced"): GameStateV2 {
  const resolvedScenario = resolveScenarioCatalogSelection(
    US_2026_SCENARIO_CATALOG,
    {
      catalogVersion: US_2026_SCENARIO_CATALOG_VERSION,
      locationId: "location.seattle",
      careerId: "career.software",
      householdId: "household.single",
      benefitsPackageId: "benefits.corporate_flex",
      healthPlanId,
      retirementPlanId: "retirement.401k_standard",
      insuranceCoverageIds: ["insurance.renters"],
      scenarioId: "scenario.fresh_start",
    },
  );
  return createNativeGameStateV2({
    runId: "run.insurance",
    playerId: "player.insurance",
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "insurance",
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
}

describe("deterministic v2 insurance adjudication", () => {
  it("applies health deductible, then coinsurance, then carries accumulators", () => {
    const initial = state();
    const first = adjudicateHealthClaim(initial, moneyCents(200_000), true);
    expect(first).toMatchObject({
      deductibleAppliedCents: 100_000,
      coinsuranceAppliedCents: 20_000,
      playerResponsibilityCents: 120_000,
      insurerResponsibilityCents: 80_000,
    });
    const afterFirst = finalizeGameStateV2({
      ...initial,
      gameplay: { ...initial.gameplay, insurance: first.nextInsurance },
    });
    const second = adjudicateHealthClaim(
      afterFirst,
      moneyCents(500_000),
      true,
    );
    expect(second).toMatchObject({
      deductibleAppliedCents: 0,
      coinsuranceAppliedCents: 100_000,
      playerResponsibilityCents: 100_000,
      insurerResponsibilityCents: 400_000,
    });
    expect(second.nextInsurance).toMatchObject({
      healthDeductiblePaidCents: 100_000,
      healthOutOfPocketPaidCents: 220_000,
    });
  });

  it("caps health responsibility at remaining out-of-pocket and excludes uncovered care", () => {
    const initial = state();
    const nearCap = finalizeGameStateV2({
      ...initial,
      gameplay: {
        ...initial.gameplay,
        insurance: {
          ...initial.gameplay.insurance,
          healthDeductiblePaidCents: moneyCents(100_000),
          healthOutOfPocketPaidCents: moneyCents(590_000),
        },
      },
    });
    const capped = adjudicateHealthClaim(nearCap, moneyCents(100_000), true);
    expect(capped.playerResponsibilityCents).toBe(10_000);
    expect(capped.insurerResponsibilityCents).toBe(90_000);
    expect(capped.nextInsurance.healthOutOfPocketPaidCents).toBe(600_000);

    const uncovered = adjudicateHealthClaim(nearCap, moneyCents(100_000), false);
    expect(uncovered.playerResponsibilityCents).toBe(100_000);
    expect(uncovered.insurerResponsibilityCents).toBe(0);
    expect(uncovered.nextInsurance).toBe(nearCap.gameplay.insurance);
  });

  it("charges the full medical bill when health coverage was waived", () => {
    const waived = state(null);
    const settlement = adjudicateHealthClaim(
      waived,
      moneyCents(250_000),
      true,
    );

    expect(settlement).toMatchObject({
      covered: false,
      playerResponsibilityCents: 250_000,
      insurerResponsibilityCents: 0,
      deductibleAppliedCents: 0,
      coinsuranceAppliedCents: 0,
    });
    expect(settlement.nextInsurance).toBe(waived.gameplay.insurance);
  });

  it("applies non-health deductible and lifetime usage cap in order", () => {
    const initial = state();
    const first = adjudicateCoverageClaim(
      initial,
      "insurance.renters",
      moneyCents(2_000_000),
      true,
    );
    expect(first).toMatchObject({
      deductibleAppliedCents: 50_000,
      insurerResponsibilityCents: 1_950_000,
      playerResponsibilityCents: 50_000,
    });
    const nearLimit = finalizeGameStateV2({
      ...initial,
      gameplay: {
        ...initial.gameplay,
        insurance: {
          ...initial.gameplay.insurance,
          coverageUsage: [
            {
              coverageId: "insurance.renters",
              usedCents: moneyCents(4_900_000),
            },
          ],
        },
      },
    });
    const capped = adjudicateCoverageClaim(
      nearLimit,
      "insurance.renters",
      moneyCents(1_000_000),
      true,
    );
    expect(capped.insurerResponsibilityCents).toBe(100_000);
    expect(capped.playerResponsibilityCents).toBe(900_000);
    expect(capped.nextInsurance.coverageUsage[0]?.usedCents).toBe(5_000_000);
  });

  it("rejects unknown coverage and leaves ineligible losses outside usage", () => {
    const initial = state();
    expect(() =>
      adjudicateCoverageClaim(
        initial,
        "insurance.term_life",
        moneyCents(100_000),
        true,
      ),
    ).toThrow(expect.objectContaining({ code: "UNKNOWN_COVERAGE" }));
    const excluded = adjudicateCoverageClaim(
      initial,
      "insurance.renters",
      moneyCents(100_000),
      false,
    );
    expect(excluded.insurerResponsibilityCents).toBe(0);
    expect(excluded.playerResponsibilityCents).toBe(100_000);
    expect(excluded.nextInsurance.coverageUsage[0]?.usedCents).toBe(0);
  });
});
