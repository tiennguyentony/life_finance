import { describe, expect, it, vi } from "vitest";

import { sha256Canonical } from "../../../core/canonical";
import type { GameStateV2 } from "../../../core/game-state-v2";
import { decodePersistedGameState } from "../../../core/persisted-game-state";
import { onboardingDraftForPersonaV1 } from "../../../core/onboarding-personas-v1";
import {
  handleOnboardingConfirmV1,
  handleOnboardingReviewV1,
} from "../../../server/api/onboarding-http-v1";
import { OnboardingApiServiceV1 } from "../../../server/api/onboarding-service-v1";
import {
  requestOnboardingConfirmationV1,
  requestOnboardingReviewV1,
  type BrowserJsonRequestV1,
} from "../onboarding-browser-flow-v1";
import {
  acceptOnboardingReviewV1,
  createOnboardingReviewSessionV1,
} from "../onboarding-review-session-v1";

describe("Prompt 13 browser-to-persistence onboarding integration", () => {
  it("crosses browser request, strict HTTP contract, service, native state, and persistence only after checksum confirmation", async () => {
    const persisted: unknown[] = [];
    const createRunV2 = vi.fn(async (factory: (runId: string) => GameStateV2) => {
      const state = factory("8e9dc060-3843-4ecf-a16f-5d497d532f2a");
      const wire = JSON.parse(JSON.stringify(state)) as unknown;
      persisted.push(wire);
      const loaded = decodePersistedGameState(wire);
      if (loaded.schemaVersion !== 2) throw new Error("expected schema v2");
      return {
        runId: loaded.runId,
        accessSecret: `lf_run_${"b".repeat(43)}`,
        state: loaded,
        stateChecksum: sha256Canonical(loaded),
      };
    });
    const service = new OnboardingApiServiceV1(
      { createRunV2 },
      () => "player.browser.integration",
    );
    const request: BrowserJsonRequestV1 = async <T,>(
      path: string,
      init?: RequestInit,
    ) => {
      const httpRequest = new Request(`http://local${path}`, init);
      const response =
        path === "/api/v2/onboarding/review"
          ? await handleOnboardingReviewV1(httpRequest, service)
          : await handleOnboardingConfirmV1(httpRequest, service);
      const body = (await response.json()) as T;
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      return body;
    };
    const draft = {
      ...onboardingDraftForPersonaV1("established", "browser-full-stack"),
      essentialExpenses: { amountCents: 300_000, period: "monthly" as const },
      discretionaryExpenses: { amountCents: 100_000, period: "monthly" as const },
    };

    const review = await requestOnboardingReviewV1(request, draft);
    expect(review.status).toBe("ready");
    expect(createRunV2).not.toHaveBeenCalled();

    const created = await requestOnboardingConfirmationV1(
      request,
      acceptOnboardingReviewV1(
        createOnboardingReviewSessionV1(draft),
        review,
      ),
    );
    expect(createRunV2).toHaveBeenCalledOnce();
    expect(persisted).toHaveLength(1);
    expect(created.stateChecksum).toBe(sha256Canonical(created.state));
    expect(created.state.finances.annualLivingCostCents).toBe(4_800_000);
    expect(created.state.gameplay.initialization?.reviewChecksum).toBe(
      review.reviewChecksum,
    );
    expect(created.state.gameplay.catalogSnapshot?.selected.household.id).toBe(
      "household.married",
    );
    expect(created.state.gameplay.exposure).toEqual({ current: null, history: [] });
    expect(created.state.ledger.transactions.length).toBeGreaterThan(0);
  });
});
