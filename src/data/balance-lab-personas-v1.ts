import { moneyCents, ratePpm } from "../core/domain/money";
import { simulationMonth } from "../core/domain/month";
import { createNativeGameStateV2 } from "../core/native-game-state-v2";
import { resolveScenarioCatalogSelection } from "../core/scenario-catalog";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "./scenario-catalog";

export const BALANCE_LAB_PERSONA_IDS_V1 = [
  "healthy-v1",
  "low-cash-v1",
  "debt-burdened-v1",
] as const;

export type BalanceLabPersonaIdV1 = typeof BALANCE_LAB_PERSONA_IDS_V1[number];

function selection() {
  return resolveScenarioCatalogSelection(US_2026_SCENARIO_CATALOG, {
    catalogVersion: US_2026_SCENARIO_CATALOG_VERSION,
    locationId: "location.seattle",
    careerId: "career.software",
    householdId: "household.single",
    benefitsPackageId: "benefits.corporate_flex",
    healthPlanId: "health.hdhp_hsa",
    retirementPlanId: "retirement.401k_standard",
    insuranceCoverageIds: ["insurance.renters"],
    scenarioId: "scenario.fresh_start",
  });
}

export function createBalanceLabPersonaStateV1(input: Readonly<{
  personaId: string;
  matchedSeed: number;
  difficulty: "guided" | "normal" | "hard";
}>) {
  if (!(BALANCE_LAB_PERSONA_IDS_V1 as readonly string[]).includes(input.personaId)) {
    throw new RangeError(`unknown balance lab persona: ${input.personaId}`);
  }
  const lowCash = input.personaId === "low-cash-v1";
  const debtBurdened = input.personaId === "debt-burdened-v1";
  return createNativeGameStateV2({
    runId: `lab.${input.personaId}.${input.matchedSeed}`,
    playerId: `lab-player.${input.personaId}`,
    birthMonth: simulationMonth("1992-01"),
    startMonth: simulationMonth("2026-01"),
    randomSeed: ["offline-balance-lab-v1", input.personaId, input.matchedSeed].join(" | "),
    resolvedScenario: selection(),
    annualGrossSalaryCents: moneyCents(12_000_000),
    finances: {
      cashCents: moneyCents(lowCash ? 100_000 : debtBurdened ? 150_000 : 1_500_000),
      taxableBroadIndexCents: moneyCents(
        lowCash ? 100_000 : debtBurdened ? 200_000 : 1_000_000,
      ),
      taxableSectorCents: moneyCents(100_000),
      taxableSpeculativeCents: moneyCents(debtBurdened ? 100_000 : 50_000),
      retirement401kCents: moneyCents(debtBurdened ? 100_000 : 1_000_000),
      retirementIraCents: moneyCents(100_000),
      hsaCents: moneyCents(50_000),
      homeValueCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      termDebts: debtBurdened
        ? [{
            id: "debt.personal.lab",
            kind: "personal_loan" as const,
            principalCents: moneyCents(4_000_000),
            annualInterestRatePpm: ratePpm(220_000),
            minimumPaymentCents: moneyCents(125_000),
            remainingTermMonths: 48,
          }]
        : [{
            id: "debt.student.lab",
            kind: "student_loan" as const,
            principalCents: moneyCents(1_200_000),
            annualInterestRatePpm: ratePpm(70_000),
            minimumPaymentCents: moneyCents(25_000),
            remainingTermMonths: 60,
          }],
      revolvingCreditLimitCents: moneyCents(
        debtBurdened ? 1_300_000 : 1_500_000,
      ),
      revolvingCreditUsedCents: moneyCents(debtBurdened ? 1_200_000 : 0),
    },
    wellbeing: {
      burnoutPpm: ratePpm(debtBurdened ? 450_000 : 150_000),
      happinessPpm: ratePpm(debtBurdened ? 550_000 : 850_000),
    },
    runtimeBalanceDifficulty: input.difficulty,
  });
}
