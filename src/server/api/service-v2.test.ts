import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "../../core/domain/money";
import { simulationMonth } from "../../core/domain/month";
import { createNativeGameStateV2 } from "../../core/native-game-state-v2";
import { setRecurringStrategy } from "../../core/recurring-strategy-v2";
import { resolveScenarioCatalogSelection } from "../../core/scenario-catalog";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";
import { projectAnnualPretaxContributions } from "./service-v2";

function stateWithStrategy() {
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
      insuranceCoverageIds: [],
      scenarioId: "scenario.fresh_start",
    },
  );
  const state = createNativeGameStateV2({
    runId: "run.tax-projection",
    playerId: "player.tax-projection",
    birthMonth: simulationMonth("1995-03"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "tax-projection",
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
    wellbeing: { burnoutPpm: ratePpm(0), happinessPpm: ratePpm(1_000_000) },
    marketRegime: "expansion",
  });
  return setRecurringStrategy(state, {
    schemaVersion: 2,
    id: "strategy.tax-projection",
    type: "set_recurring_strategy",
    expectedRevision: 0,
    effectiveMonth: simulationMonth("2026-07"),
    payload: {
      strategy: {
        preTax401kSalaryRatePpm: ratePpm(50_000),
        preTaxHsaSalaryRatePpm: ratePpm(20_000),
        afterTaxBroadIndexRatePpm: ratePpm(0),
        afterTaxSectorRatePpm: ratePpm(0),
        afterTaxSpeculativeRatePpm: ratePpm(0),
        afterTaxIraRatePpm: ratePpm(0),
        afterTaxExtraDebtRatePpm: ratePpm(0),
      },
    },
  });
}

describe("annual tax contribution projection", () => {
  it("keeps the projected year-end total stable after a monthly contribution", () => {
    const july = stateWithStrategy();
    const julyProjection = projectAnnualPretaxContributions(july);
    const august = {
      ...july,
      currentMonth: simulationMonth("2026-08"),
      gameplay: {
        ...july.gameplay,
        contributions: {
          ...july.gameplay.contributions,
          employee401kCents: moneyCents(50_000),
          hsaCents: moneyCents(20_000),
        },
      },
    };

    expect(julyProjection).toEqual({
      employee401kCents: 300_000,
      hsaCents: 120_000,
    });
    expect(projectAnnualPretaxContributions(august)).toEqual(julyProjection);
  });
});
