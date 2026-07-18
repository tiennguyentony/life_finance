import { describe, expect, it, vi } from "vitest";

import { sha256Canonical } from "../../../core/canonical";
import { decodePersistedGameState } from "../../../core/persisted-game-state";
import { onboardingDraftForPersonaV1 } from "../../../core/onboarding-personas-v1";
import { OnboardingService } from "../onboarding-service";
import { onboardingReviewResponseV1Schema } from "@/contracts/api/onboarding";
import {
  handleCreateRun,
  handleReviewOnboarding,
} from "../current-http";

function repositoryFixture() {
  const persisted: unknown[] = [];
  const createRunV2 = vi.fn(async (factory: (runId: string) => never) => {
    const state = factory("7d594678-6c69-4f54-a3c8-b4fdff255f99");
    const wire = JSON.parse(JSON.stringify(state)) as unknown;
    persisted.push(wire);
    const loaded = decodePersistedGameState(wire);
    if (loaded.schemaVersion !== 2) throw new Error("expected schema v2");
    return {
      runId: loaded.runId,
      accessSecret: `lf_run_${"a".repeat(43)}`,
      state: loaded,
      stateChecksum: sha256Canonical(loaded),
    };
  });
  return { repository: { createRunV2 }, createRunV2, persisted };
}

describe("Onboarding service", () => {
  it("strictly validates the complete review response contract", () => {
    const fixture = repositoryFixture();
    const service = new OnboardingService(
      fixture.repository,
      () => "player.onboarding.contract",
    );
    const review = service.review(
      onboardingDraftForPersonaV1("teacher", "api-contract-seed"),
    );

    expect(onboardingReviewResponseV1Schema.safeParse(review).success).toBe(true);
    expect(onboardingReviewResponseV1Schema.safeParse({}).success).toBe(false);
    expect(
      onboardingReviewResponseV1Schema.safeParse({ ...review, invented: true })
        .success,
    ).toBe(false);
  });

  it("reviews without writing and rejects a stale confirmation before repository access", async () => {
    const fixture = repositoryFixture();
    const service = new OnboardingService(
      fixture.repository,
      () => "player.onboarding.api",
    );
    const draft = onboardingDraftForPersonaV1("teacher", "api-review-seed");

    const review = service.review(draft);
    expect(review.status).toBe("ready");
    expect(fixture.createRunV2).not.toHaveBeenCalled();

    await expect(
      service.confirm({ draft, reviewChecksum: "0".repeat(64) }),
    ).rejects.toMatchObject({ code: "STALE_REVIEW" });
    expect(fixture.createRunV2).not.toHaveBeenCalled();
  });

  it("integrates reviewed input, scenario catalog, native state, and strict persistence", async () => {
    const fixture = repositoryFixture();
    const service = new OnboardingService(
      fixture.repository,
      () => "player.onboarding.api",
    );
    const draft = {
      ...onboardingDraftForPersonaV1("software", "api-confirm-seed"),
      essentialExpenses: { amountCents: 240_000, period: "monthly" as const },
      discretionaryExpenses: { amountCents: 60_000, period: "monthly" as const },
    };
    const review = service.review(draft);

    const created = await service.confirm({
      draft,
      reviewChecksum: review.reviewChecksum,
    });

    expect(fixture.createRunV2).toHaveBeenCalledOnce();
    expect(fixture.persisted).toHaveLength(1);
    expect(created.stateChecksum).toBe(sha256Canonical(created.state));
    expect(created.state.finances.annualLivingCostCents).toBe(3_600_000);
    expect(created.state.gameplay.catalogSnapshot?.selected.career.id).toBe(
      "career.software",
    );
    expect(created.state.gameplay.initialization?.reviewChecksum).toBe(
      review.reviewChecksum,
    );
    expect(created.state.gameplay.exposure).toEqual({ current: null, history: [] });
    expect(created.state.ledger.transactions.length).toBeGreaterThan(0);
  });

  it("runs the strict HTTP review then confirm flow without trusting client state", async () => {
    const fixture = repositoryFixture();
    const service = new OnboardingService(
      fixture.repository,
      () => "player.onboarding.http",
    );
    const draft = onboardingDraftForPersonaV1("nurse", "http-onboarding-seed");
    const reviewResponse = await handleReviewOnboarding(
      new Request("http://local/api/onboarding/review", {
        method: "POST",
        headers: { Origin: "http://local" },
        body: JSON.stringify({ draft }),
      }),
      service,
    );
    const review = (await reviewResponse.json()) as {
      status: string;
      reviewChecksum: string;
    };
    expect(reviewResponse.status).toBe(200);
    expect(review.status).toBe("ready");
    expect(fixture.createRunV2).not.toHaveBeenCalled();

    const confirmResponse = await handleCreateRun(
      new Request("http://local/api/runs", {
        method: "POST",
        headers: { Origin: "http://local" },
        body: JSON.stringify({
          draft,
          reviewChecksum: review.reviewChecksum,
          normalizedState: { cashCents: 999_999_999 },
        }),
      }),
      service,
    );
    expect(confirmResponse.status).toBe(400);
    expect(fixture.createRunV2).not.toHaveBeenCalled();

    const accepted = await handleCreateRun(
      new Request("http://local/api/runs", {
        method: "POST",
        headers: { Origin: "http://local" },
        body: JSON.stringify({ draft, reviewChecksum: review.reviewChecksum }),
      }),
      service,
    );
    expect(
      accepted.status,
      JSON.stringify(await accepted.clone().json()),
    ).toBe(201);
    expect(fixture.createRunV2).toHaveBeenCalledOnce();
    const body = (await accepted.json()) as { run: { runId: string } };
    expect(body.run.runId).toBe("7d594678-6c69-4f54-a3c8-b4fdff255f99");
    expect(JSON.stringify(body)).not.toContain("accessSecret");
  });

  it("rejects client-declared AI provenance without a server-verifiable binding", async () => {
    const fixture = repositoryFixture();
    const service = new OnboardingService(
      fixture.repository,
      () => "player.onboarding.spoof",
    );
    const draft = onboardingDraftForPersonaV1("software", "spoof-ai-provenance");
    const response = await handleReviewOnboarding(
      new Request("http://local/api/onboarding/review", {
        method: "POST",
        headers: { Origin: "http://local" },
        body: JSON.stringify({
          draft: {
            ...draft,
            sourceMode: "ai_assisted",
            confirmedAiFieldIds: ["grossIncome"],
          },
        }),
      }),
      service,
    );

    expect(response.status).toBe(400);
    expect(fixture.createRunV2).not.toHaveBeenCalled();
  });
});
