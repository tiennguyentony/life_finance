import { US_2026_SCENARIO_CATALOG } from "../../data/scenario-catalog";

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

export const PLAYER_PRESETS = {
  software: {
    label: "Software developer · Seattle",
    selection: {
      birthMonth: "1995-01",
      locationId: "location.seattle",
      careerId: "career.software",
      householdId: "household.single",
      benefitsPackageId: "benefits.corporate_flex",
      healthPlanId: "health.hdhp_hsa",
      retirementPlanId: "retirement.401k_standard",
      scenarioId: "scenario.fresh_start",
    },
    salaryDollars: 120_000,
    defaultCashDollars: 25_000,
  },
  nurse: {
    label: "Registered nurse · Austin",
    selection: {
      birthMonth: "1995-01",
      locationId: "location.austin",
      careerId: "career.nurse",
      householdId: "household.single",
      benefitsPackageId: "benefits.essential_worker",
      healthPlanId: "health.hdhp_hsa",
      retirementPlanId: "retirement.401k_essential",
      scenarioId: "scenario.fresh_start",
    },
    salaryDollars: 85_000,
    defaultCashDollars: 20_000,
  },
  teacher: {
    label: "Teacher · Chicago",
    selection: {
      birthMonth: "1995-01",
      locationId: "location.chicago",
      careerId: "career.teacher",
      householdId: "household.single",
      benefitsPackageId: "benefits.public_service",
      healthPlanId: "health.hdhp_hsa",
      retirementPlanId: "retirement.403b_public",
      scenarioId: "scenario.fresh_start",
    },
    salaryDollars: 70_000,
    defaultCashDollars: 15_000,
  },
  established: {
    label: "Established software household · Austin",
    selection: {
      birthMonth: "1988-01",
      locationId: "location.austin",
      careerId: "career.software",
      householdId: "household.married",
      benefitsPackageId: "benefits.corporate_flex",
      healthPlanId: "health.hdhp_hsa",
      retirementPlanId: "retirement.401k_standard",
      scenarioId: "scenario.established_household",
    },
    salaryDollars: 125_000,
    defaultCashDollars: 75_000,
  },
} as const;

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
