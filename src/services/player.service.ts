import { onboardingDraftForPersonaV1 } from "@/core/onboarding-personas-v1";
import type { OnboardingPersonaIdV1 } from "@/core/onboarding-personas-v1";
import { PERSONAS } from "@/features/onboarding/personas";
import { LifeFinanceClient } from "@/lib/api-client/client";
import type { RunViewWire } from "@/contracts/api/contracts";
import type { Persona, ProfileInput } from "@/types/game";

export const PROFILE_LOCATIONS = Object.freeze([
  { id: "location.seattle", label: "Seattle–Tacoma–Bellevue, WA" },
  { id: "location.austin", label: "Austin–Round Rock–San Marcos, TX" },
  { id: "location.atlanta", label: "Atlanta–Sandy Springs–Roswell, GA" },
  { id: "location.chicago", label: "Chicago–Naperville–Elgin, IL" },
  { id: "location.new_york", label: "New York–Newark–Jersey City, NY–NJ" },
] as const);

const DEFAULT_SAFE_WITHDRAWAL_RATE_PPM = 40_000;

const BACKEND_PERSONA: Readonly<
  Record<ProfileInput["personaId"], OnboardingPersonaIdV1>
> = {
  "junior-developer": "software",
  educator: "teacher",
  "city-survivor": "software",
};

const PERSONA_DIFFICULTY = Object.freeze({
  "junior-developer": "normal",
  educator: "guided",
  "city-survivor": "hard",
} as const);

/** Gives the city-survivor card its advertised roughly two-month runway. */
const CITY_SURVIVOR_CASH_CENTS = 1_100_000;

function api(): LifeFinanceClient {
  return new LifeFinanceClient();
}

function seed(): string {
  return `guided-${crypto.randomUUID()}`;
}

function birthMonth(age: string, fallbackAge: number): string {
  const parsed = Number.parseInt(age, 10);
  const resolved = Number.isFinite(parsed) && parsed >= 18 ? parsed : fallbackAge;
  return `${2026 - resolved}-07`;
}

function dollarsToCents(value: string): number {
  const dollars = Number(value);
  if (!Number.isSafeInteger(dollars) || dollars <= 0) {
    throw new Error("Annual FI spending must be a positive whole-dollar amount.");
  }
  const cents = dollars * 100;
  if (!Number.isSafeInteger(cents)) {
    throw new Error("Annual FI spending is too large.");
  }
  return cents;
}

function targetAge(value: string): number {
  const age = Number(value);
  if (!Number.isSafeInteger(age) || age < 18 || age > 80) {
    throw new Error("FI target age must be a whole number from 18 through 80.");
  }
  return age;
}

export async function getPersonas(): Promise<readonly Persona[]> {
  return PERSONAS;
}

export async function createRunFromProfile(
  input: ProfileInput,
): Promise<RunViewWire> {
  const persona = PERSONAS.find(({ id }) => id === input.personaId);
  if (!persona) throw new Error("Unknown persona");
  const personaDraft = onboardingDraftForPersonaV1(
    BACKEND_PERSONA[input.personaId],
    seed(),
  );
  const draft = {
    ...personaDraft,
    birthMonth: birthMonth(input.age, persona.age),
    runtimeDifficulty: PERSONA_DIFFICULTY[input.personaId],
    locationId: input.locationId,
    finances: {
      ...personaDraft.finances,
      ...(input.personaId === "city-survivor"
        ? { cashCents: CITY_SURVIVOR_CASH_CENTS }
        : {}),
    },
    financialGoal: {
      version: "financial-goal-v1" as const,
      desiredAnnualSpendingCents: dollarsToCents(
        input.desiredAnnualSpendingDollars,
      ),
      safeWithdrawalRatePpm: DEFAULT_SAFE_WITHDRAWAL_RATE_PPM,
      targetAgeYears: targetAge(input.targetAgeYears),
      source: "player_selected" as const,
    },
  };
  const client = api();
  const review = await client.reviewOnboarding({ draft });
  if (review.status !== "ready") {
    const details = review.issues.map(({ path, code }) => `${path}: ${code}`);
    throw new Error(details.join("; ") || "Onboarding needs more information");
  }
  const created = await client.createRun({
    draft,
    reviewChecksum: review.reviewChecksum,
  });
  return created.run;
}
