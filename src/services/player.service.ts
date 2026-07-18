import { onboardingDraftForPersonaV1 } from "@/core/onboarding-personas-v1";
import type { OnboardingPersonaIdV1 } from "@/core/onboarding-personas-v1";
import { PERSONAS } from "@/features/onboarding/personas";
import { LifeFinanceClient } from "@/lib/api-client/client";
import type { RunView } from "@/application/game/run-view";
import type { Persona, ProfileInput } from "@/types/game";

const BACKEND_PERSONA: Readonly<
  Record<ProfileInput["personaId"], OnboardingPersonaIdV1>
> = {
  "junior-developer": "software",
  educator: "teacher",
  "city-survivor": "software",
};

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

export async function getPersonas(): Promise<readonly Persona[]> {
  return PERSONAS;
}

export async function createRunFromProfile(
  input: ProfileInput,
): Promise<RunView> {
  const persona = PERSONAS.find(({ id }) => id === input.personaId);
  if (!persona) throw new Error("Unknown persona");
  const draft = {
    ...onboardingDraftForPersonaV1(BACKEND_PERSONA[input.personaId], seed()),
    birthMonth: birthMonth(input.age, persona.age),
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
