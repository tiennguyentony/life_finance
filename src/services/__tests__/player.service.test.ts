import { afterEach, describe, expect, it, vi } from "vitest";

import { currentRunState } from "@/application/game/__tests__/run-state.fixture";
import { projectRunView } from "@/application/game/run-view";
import { prepareOnboardingReviewV1 } from "@/core/onboarding-v1";

import { createRunFromProfile, getPersonas } from "../player.service";

afterEach(() => vi.unstubAllGlobals());

describe("player service", () => {
  it("returns the three guided personas without a mock delay", async () => {
    const personas = await getPersonas();
    expect(personas.map((persona) => persona.name)).toEqual([
      "Burnt-out Junior Developer",
      "Debt-free Educator",
      "Big City Survivor",
    ]);
  });

  it("reviews and creates a backend run from the submitted profile", async () => {
    const run = projectRunView(currentRunState());
    const paths: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      paths.push(String(input));
      if (String(input) === "/api/onboarding/review") {
        const body = JSON.parse(String(init?.body)) as { draft: Parameters<typeof prepareOnboardingReviewV1>[0] };
        return Response.json(prepareOnboardingReviewV1(body.draft));
      }
      return Response.json({ run, stateChecksum: "a".repeat(64) }, { status: 201 });
    }));

    const result = await createRunFromProfile({
      personaId: "city-survivor",
      age: "27",
      locationId: "location.austin",
      healthPlanId: null,
      insuranceCoverageIds: [],
      desiredAnnualSpendingDollars: "72000",
      targetAgeYears: "52",
    });

    expect(paths).toEqual(["/api/onboarding/review", "/api/runs"]);
    expect(result).toMatchObject({ runId: "run.current" });
    const reviewCall = vi.mocked(fetch).mock.calls[0]!;
    const reviewBody = JSON.parse(String(reviewCall[1]?.body)) as {
      draft: Record<string, unknown>;
    };
    expect(reviewBody.draft).toMatchObject({
      birthMonth: "1999-07",
      locationId: "location.austin",
      runtimeDifficulty: "hard",
      healthPlanId: null,
      insuranceCoverageIds: [],
      finances: expect.objectContaining({ cashCents: 1_100_000 }),
      financialGoal: {
        desiredAnnualSpendingCents: 7_200_000,
        safeWithdrawalRatePpm: 40_000,
        targetAgeYears: 52,
        source: "player_selected",
      },
    });
  });

  it("rejects invalid structured FI inputs before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createRunFromProfile({
        personaId: "educator",
        age: "28",
        locationId: "location.chicago",
        healthPlanId: "health.public_low_deductible",
        insuranceCoverageIds: ["insurance.renters"],
        desiredAnnualSpendingDollars: "0",
        targetAgeYears: "50",
      }),
    ).rejects.toThrow("Annual FI spending");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
