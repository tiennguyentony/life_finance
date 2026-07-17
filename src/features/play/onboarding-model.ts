import { US_2026_SCENARIO_CATALOG } from "../../data/scenario-catalog";
import {
  ONBOARDING_PERSONAS_V1,
  type OnboardingPersonaIdV1,
} from "../../core/onboarding-personas-v1";

export type StartingSelection = Readonly<{
  birthMonth: string;
  locationId: string;
  careerId: string;
  householdId: string;
  benefitsPackageId: string;
  healthPlanId: string | null;
  retirementPlanId: string;
  scenarioId: string;
}>;

const PERSONA_LABELS: Readonly<Record<OnboardingPersonaIdV1, string>> =
  Object.freeze({
    software: "Software developer · Seattle",
    nurse: "Registered nurse · Austin",
    teacher: "Teacher · Chicago",
    established: "Established software household · Austin",
  });

export function playerPresetFromPersonaV1(personaId: OnboardingPersonaIdV1) {
  const fixture = ONBOARDING_PERSONAS_V1[personaId];
  if (
    fixture.grossIncome?.period !== "annual" ||
    fixture.finances?.cashCents === undefined ||
    fixture.birthMonth === undefined ||
    fixture.locationId === undefined ||
    fixture.careerId === undefined ||
    fixture.householdId === undefined ||
    fixture.benefitsPackageId === undefined ||
    fixture.retirementPlanId === undefined ||
    fixture.scenarioId === undefined
  ) {
    throw new Error(`Incomplete onboarding persona fixture: ${personaId}`);
  }
  return Object.freeze({
    label: PERSONA_LABELS[personaId],
    selection: Object.freeze({
      birthMonth: fixture.birthMonth,
      locationId: fixture.locationId,
      careerId: fixture.careerId,
      householdId: fixture.householdId,
      benefitsPackageId: fixture.benefitsPackageId,
      healthPlanId: fixture.healthPlanId ?? null,
      retirementPlanId: fixture.retirementPlanId,
      scenarioId: fixture.scenarioId,
    }),
    salaryDollars: fixture.grossIncome.amountCents / 100,
    defaultCashDollars: fixture.finances.cashCents / 100,
  });
}

export const PLAYER_PRESETS = Object.freeze({
  software: playerPresetFromPersonaV1("software"),
  nurse: playerPresetFromPersonaV1("nurse"),
  teacher: playerPresetFromPersonaV1("teacher"),
  established: playerPresetFromPersonaV1("established"),
});

export type PlayerPresetId = keyof typeof PLAYER_PRESETS;

function requiredEntry<T extends { id: string }>(
  entries: readonly T[],
  id: string,
  label: string,
): T {
  const entry = entries.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`Unknown onboarding ${label}: ${id}`);
  return entry;
}

export function selectionForPreset(presetId: PlayerPresetId): StartingSelection {
  return { ...PLAYER_PRESETS[presetId].selection };
}

export function salaryRangeDollars(
  careerId: string,
  locationId: string,
): Readonly<{ minimum: number; maximum: number; recommended: number }> {
  const career = requiredEntry(
    US_2026_SCENARIO_CATALOG.careers,
    careerId,
    "career",
  );
  const location = requiredEntry(
    US_2026_SCENARIO_CATALOG.locations,
    locationId,
    "location",
  );
  const localize = (cents: number) =>
    Math.round((cents * location.salaryMultiplierPpm) / 1_000_000 / 100);
  const minimum = localize(career.annualSalaryMinimumCents);
  const maximum = localize(career.annualSalaryMaximumCents);
  return {
    minimum,
    maximum,
    recommended: Math.round((minimum + maximum) / 2 / 1_000) * 1_000,
  };
}

export function cashRangeDollars(
  scenarioId: string,
): Readonly<{ minimum: number; maximum: number }> {
  const scenario = requiredEntry(
    US_2026_SCENARIO_CATALOG.scenarios,
    scenarioId,
    "scenario",
  );
  return {
    minimum: scenario.minimumStartingCashCents / 100,
    maximum: scenario.maximumStartingCashCents / 100,
  };
}

export function selectionForCareer(
  current: StartingSelection,
  careerId: string,
): StartingSelection {
  const career = requiredEntry(
    US_2026_SCENARIO_CATALOG.careers,
    careerId,
    "career",
  );
  const benefitsPackageId = career.eligibleBenefitsPackageIds[0];
  if (!benefitsPackageId) throw new Error(`Career has no benefits: ${careerId}`);
  const benefitsPackage = requiredEntry(
    US_2026_SCENARIO_CATALOG.benefitsPackages,
    benefitsPackageId,
    "benefits package",
  );
  const retirementPlanId = benefitsPackage.retirementPlanIds[0];
  if (!retirementPlanId) throw new Error(`Benefits have no retirement plan: ${benefitsPackageId}`);
  const healthPlanId =
    current.healthPlanId === null
      ? null
      : benefitsPackage.healthPlanIds.includes(current.healthPlanId)
        ? current.healthPlanId
        : (benefitsPackage.healthPlanIds[0] ?? null);
  return {
    ...current,
    careerId,
    benefitsPackageId,
    retirementPlanId,
    healthPlanId,
  };
}

export function allowedHouseholds(scenarioId: string) {
  const scenario = requiredEntry(
    US_2026_SCENARIO_CATALOG.scenarios,
    scenarioId,
    "scenario",
  );
  return US_2026_SCENARIO_CATALOG.households.filter(({ id }) =>
    scenario.allowedHouseholdIds.includes(id),
  );
}

export function selectionForScenario(
  current: StartingSelection,
  scenarioId: string,
): StartingSelection {
  const households = allowedHouseholds(scenarioId);
  return {
    ...current,
    scenarioId,
    householdId: households.some(({ id }) => id === current.householdId)
      ? current.householdId
      : (households[0]?.id ?? current.householdId),
  };
}
