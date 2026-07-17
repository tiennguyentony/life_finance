import {
  ONBOARDING_V1_VERSION,
  type OnboardingDraftV1,
} from "./onboarding-v1-contracts";
import { ratePpm } from "./domain/money";

export const ONBOARDING_PERSONA_V1_VERSION =
  "onboarding-persona-v1" as const;

type PersonaDraft = Omit<OnboardingDraftV1, "randomSeed">;

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function persona(
  personaId: string,
  birthMonth: string,
  locationId: string,
  careerId: string,
  householdId: string,
  benefitsPackageId: string,
  retirementPlanId: string,
  scenarioId: string,
  annualGrossSalaryCents: number,
  cashCents: number,
): PersonaDraft {
  return {
    version: ONBOARDING_V1_VERSION,
    sourceMode: "persona",
    personaId,
    startMonth: "2026-07",
    birthMonth,
    runtimeDifficulty: "normal",
    catalogVersion: "us-2026.2",
    locationId,
    careerId,
    householdId,
    benefitsPackageId,
    healthPlanId: "health.hdhp_hsa",
    retirementPlanId,
    insuranceCoverageIds: ["insurance.renters"],
    scenarioId,
    grossIncome: {
      amountCents: annualGrossSalaryCents,
      period: "annual",
      basis: "gross",
    },
    finances: {
      cashCents,
      taxableBroadIndexCents: 0,
      taxableSectorCents: 0,
      taxableSpeculativeCents: 0,
      retirement401kCents: 0,
      retirementIraCents: 0,
      hsaCents: 0,
      homeValueCents: 0,
      otherAssetsCents: 0,
      termDebts: [],
      revolvingCreditLimitCents: 1_000_000,
      revolvingCreditUsedCents: 0,
    },
    wellbeing: {
      burnoutPpm: ratePpm(100_000),
      happinessPpm: ratePpm(800_000),
    },
  } as PersonaDraft;
}

export const ONBOARDING_PERSONAS_V1 = deepFreeze({
  software: persona(
      "software",
      "1995-01",
      "location.seattle",
      "career.software",
      "household.single",
      "benefits.corporate_flex",
      "retirement.401k_standard",
      "scenario.fresh_start",
      12_000_000,
      2_500_000,
    ),
  nurse: persona(
      "nurse",
      "1995-01",
      "location.austin",
      "career.nurse",
      "household.single",
      "benefits.essential_worker",
      "retirement.401k_essential",
      "scenario.fresh_start",
      8_500_000,
      2_000_000,
    ),
  teacher: persona(
      "teacher",
      "1995-01",
      "location.chicago",
      "career.teacher",
      "household.single",
      "benefits.public_service",
      "retirement.403b_public",
      "scenario.fresh_start",
      7_000_000,
      1_500_000,
    ),
  established: persona(
      "established",
      "1988-01",
      "location.austin",
      "career.software",
      "household.married",
      "benefits.corporate_flex",
      "retirement.401k_standard",
      "scenario.established_household",
      12_500_000,
      7_500_000,
    ),
} as const);

export type OnboardingPersonaIdV1 = keyof typeof ONBOARDING_PERSONAS_V1;

export function onboardingDraftForPersonaV1(
  personaId: OnboardingPersonaIdV1,
  randomSeed: string,
): OnboardingDraftV1 {
  const isolatedFixture = structuredClone(ONBOARDING_PERSONAS_V1[personaId]);
  return deepFreeze({
    ...isolatedFixture,
    randomSeed,
  }) as OnboardingDraftV1;
}
