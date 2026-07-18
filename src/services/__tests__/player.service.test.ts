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
      personaId: "junior-developer",
      name: "Mina",
      age: "27",
      location: "Seattle, WA",
      goal: "Build a six-month safety net",
    });

    expect(paths).toEqual(["/api/onboarding/review", "/api/runs"]);
    expect(result).toMatchObject({ runId: "run.current" });
  });
});
