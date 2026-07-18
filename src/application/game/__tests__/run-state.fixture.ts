import { moneyCents, ratePpm } from "@/core/domain/money";
import { simulationMonth } from "@/core/domain/month";
import {
  createNativeGameStateV2,
  type NativeGameStateV2Input,
} from "@/core/native-game-state-v2";
import { resolveScenarioCatalogSelection } from "@/core/scenario-catalog";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "@/data/scenario-catalog";

export function currentRunStateInput(): NativeGameStateV2Input {
  return {
    runId: "run.current",
    playerId: "player.current",
    birthMonth: simulationMonth("1995-03"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "run-view-seed",
    resolvedScenario: resolveScenarioCatalogSelection(
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
    ),
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
  };
}

export function currentRunState() {
  return createNativeGameStateV2(currentRunStateInput());
}
