import { describe, expect, it } from "vitest";

import { US_2026_SCENARIO_CATALOG, US_2026_SCENARIO_CATALOG_VERSION } from "../../data/scenario-catalog";
import { moneyCents, ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import {
  computeExposureSnapshotV2,
  recordExposureSnapshotV2,
} from "../exposure-v2";
import { validateGameStateV2 } from "../game-state-v2";
import { createNativeGameStateV2 } from "../native-game-state-v2";
import { resolveScenarioCatalogSelection } from "../scenario-catalog";

function state(options: {
  risky?: boolean;
  insuranceCoverageIds?: readonly string[];
  otherAssetsCents?: number;
} = {}) {
  const resolved = resolveScenarioCatalogSelection(US_2026_SCENARIO_CATALOG, {
    catalogVersion: US_2026_SCENARIO_CATALOG_VERSION,
    locationId: "location.seattle",
    careerId: "career.software",
    householdId: "household.single",
    benefitsPackageId: "benefits.corporate_flex",
    healthPlanId: "health.hdhp_hsa",
    retirementPlanId: "retirement.401k_standard",
    insuranceCoverageIds: options.insuranceCoverageIds ?? [],
    scenarioId: "scenario.fresh_start",
  });
  return createNativeGameStateV2({
    runId: "run.exposure-v2",
    playerId: "player.exposure-v2",
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "exposure-v2",
    resolvedScenario: resolved,
    annualGrossSalaryCents: moneyCents(12_000_000),
    finances: {
      cashCents: moneyCents(options.risky ? 100_000 : 2_500_000),
      taxableBroadIndexCents: moneyCents(options.risky ? 0 : 2_000_000),
      taxableSectorCents: moneyCents(options.risky ? 1_500_000 : 0),
      taxableSpeculativeCents: moneyCents(options.risky ? 500_000 : 0),
      retirement401kCents: moneyCents(options.risky ? 0 : 3_000_000),
      retirementIraCents: moneyCents(0),
      hsaCents: moneyCents(0),
      homeValueCents: moneyCents(0),
      otherAssetsCents: moneyCents(options.otherAssetsCents ?? 0),
      termDebts: options.risky
        ? [
            {
              id: "debt.exposure",
              kind: "student_loan",
              principalCents: moneyCents(8_000_000),
              annualInterestRatePpm: ratePpm(80_000),
              minimumPaymentCents: moneyCents(100_000),
              remainingTermMonths: 120,
            },
          ]
        : [],
      revolvingCreditLimitCents: moneyCents(1_000_000),
      revolvingCreditUsedCents: moneyCents(options.risky ? 900_000 : 0),
    },
    wellbeing: {
      burnoutPpm: ratePpm(100_000),
      happinessPpm: ratePpm(900_000),
    },
  });
}

describe("v2 exposure evidence", () => {
  it("scores demonstrated risk and retains an exact explainable breakdown", () => {
    const safe = computeExposureSnapshotV2(state());
    const risky = computeExposureSnapshotV2(state({ risky: true }));

    expect(safe).toMatchObject({
      month: "2026-07",
      revolvingDebtPpm: 0,
      portfolioConcentrationPpm: 0,
      jobInvestmentCorrelationPpm: 0,
    });
    expect(risky.revolvingDebtPpm).toBe(900_000);
    expect(risky.portfolioConcentrationPpm).toBe(1_000_000);
    expect(risky.jobInvestmentCorrelationPpm).toBe(750_000);
    expect(risky.debtToIncomePpm).toBeGreaterThan(700_000);
    expect(risky.scorePpm).toBeGreaterThan(safe.scorePpm);
  });

  it("does not invent concentration when no investable assets exist", () => {
    const empty = state();
    const noInvestments = {
      ...empty,
      finances: {
        ...empty.finances,
        taxableInvestmentsCents: moneyCents(0),
        retirementCents: moneyCents(0),
      },
      gameplay: {
        ...empty.gameplay,
        portfolio: Object.fromEntries(
          Object.keys(empty.gameplay.portfolio).map((key) => [key, moneyCents(0)]),
        ) as typeof empty.gameplay.portfolio,
      },
    };
    const exposure = computeExposureSnapshotV2(noInvestments);
    expect(exposure.portfolioConcentrationPpm).toBe(0);
    expect(exposure.jobInvestmentCorrelationPpm).toBe(0);
  });

  it("reduces only the declared property insurance gap", () => {
    const uninsured = computeExposureSnapshotV2(
      state({ otherAssetsCents: 5_000_000 }),
    );
    const renters = computeExposureSnapshotV2(
      state({
        otherAssetsCents: 5_000_000,
        insuranceCoverageIds: ["insurance.renters"],
      }),
    );
    expect(renters.insuranceGapPpm).toBeLessThan(uninsured.insuranceGapPpm!);
    expect(renters.insuranceGapPpm).toBeGreaterThan(0);
  });

  it("records one immutable snapshot per month and validates current/history equality", () => {
    const initial = state();
    const once = recordExposureSnapshotV2(initial);
    const twice = recordExposureSnapshotV2(once);
    expect(twice.gameplay.exposure.history).toHaveLength(1);
    expect(twice.gameplay.exposure.current).toEqual(
      twice.gameplay.exposure.history[0],
    );
    expect(validateGameStateV2(twice)).toEqual([]);

    const corrupt = {
      ...twice,
      gameplay: {
        ...twice.gameplay,
        exposure: {
          ...twice.gameplay.exposure,
          current: {
            ...twice.gameplay.exposure.current!,
            scorePpm: ratePpm(3_000_001),
          },
        },
      },
    };
    expect(validateGameStateV2(corrupt)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "gameplay.exposure.current" }),
      ]),
    );
  });
});
