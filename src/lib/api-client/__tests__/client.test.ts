import { describe, expect, it } from "vitest";

import { currentRunState } from "@/application/game/__tests__/run-state.fixture";
import { projectRunView } from "@/application/game/run-view";
import { onboardingDraftForPersonaV1 } from "@/core/onboarding-personas-v1";
import { prepareOnboardingReviewV1 } from "@/core/onboarding-v1";

import { ApiClientError, LifeFinanceClient } from "../client";

describe("LifeFinanceClient", () => {
  it("preserves the fetch implementation receiver required by browsers", async () => {
    const run = projectRunView(currentRunState());
    const originalFetch = globalThis.fetch;
    globalThis.fetch = function receiverSensitiveFetch(this: unknown) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      return Promise.resolve(
        Response.json({ session: { run, stateChecksum: "a".repeat(64) } }),
      );
    } as typeof fetch;
    try {
      const client = new LifeFinanceClient();
      await expect(client.getSession()).resolves.toMatchObject({
        session: { run: { runId: "run.current" } },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("clears the HttpOnly session through the same-origin endpoint", async () => {
    let request: { input: string; init?: RequestInit } | null = null;
    const client = new LifeFinanceClient(async (input, init) => {
      request = { input: String(input), init };
      return new Response(null, { status: 204 });
    });

    await expect(client.deleteSession()).resolves.toBeUndefined();
    expect(request).toEqual({
      input: "/api/session",
      init: { method: "DELETE", credentials: "same-origin" },
    });
  });

  it("reviews onboarding without exposing engine versions to the caller", async () => {
    const draft = onboardingDraftForPersonaV1("software", "client-review-seed");
    const review = prepareOnboardingReviewV1(draft);
    let path = "";
    const client = new LifeFinanceClient(async (input) => {
      path = String(input);
      return Response.json(review);
    });

    await expect(client.reviewOnboarding({ draft })).resolves.toMatchObject({
      status: "ready",
      reviewChecksum: review.reviewChecksum,
    });
    expect(path).toBe("/api/onboarding/review");
  });

  it("submits a browser command intent through the active cookie session", async () => {
    const run = projectRunView(currentRunState());
    let request: { input: string; init?: RequestInit } | null = null;
    const client = new LifeFinanceClient(async (input, init) => {
      request = { input: String(input), init };
      return Response.json({
        run,
        stateChecksum: "a".repeat(64),
        result: { idempotentReplay: false },
      });
    });

    await expect(
      client.submitCommand("run.current", {
        id: "ui.month.1",
        expectedRevision: 0,
        effectiveMonth: "2026-07",
        type: "process_month",
        payload: {},
      }),
    ).resolves.toMatchObject({ run: { revision: 0 } });
    expect(request).toMatchObject({
      input: "/api/runs/run.current/commands",
      init: { method: "POST", credentials: "same-origin" },
    });
  });

  it("creates a run through the unversioned cookie-authenticated endpoint", async () => {
    const run = projectRunView(currentRunState());
    let request: { input: string; init?: RequestInit } | null = null;
    const client = new LifeFinanceClient(async (input, init) => {
      request = { input: String(input), init };
      return Response.json({ run, stateChecksum: "a".repeat(64) }, { status: 201 });
    });

    await expect(
      client.createRun({
        draft: { version: "onboarding-v1", sourceMode: "typed" },
        reviewChecksum: "a".repeat(64),
      }),
    ).resolves.toMatchObject({ run: { runId: "run.current" } });
    expect(request).toMatchObject({
      input: "/api/runs",
      init: {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
      },
    });
  });

  it("starts a local demo through the credential-free development endpoint", async () => {
    const run = projectRunView(currentRunState());
    let request: { input: string; init?: RequestInit } | null = null;
    const client = new LifeFinanceClient(async (input, init) => {
      request = { input: String(input), init };
      return Response.json({ run, stateChecksum: "a".repeat(64) }, { status: 201 });
    });

    await expect(client.createDemoRun()).resolves.toMatchObject({
      run: { runId: "run.current" },
    });
    expect(request).toEqual({
      input: "/api/demo",
      init: { method: "POST", credentials: "same-origin" },
    });
  });

  it("requests optional character copy through the active run endpoint", async () => {
    let request: { input: string; init?: RequestInit } | null = null;
    const client = new LifeFinanceClient(async (input, init) => {
      request = { input: String(input), init };
      return Response.json({
        version: "character-banter-v1",
        status: "generated",
        source: "local_oss",
        characterId: "bengo",
        tone: "cheer",
        message: "Your money got a job and already requested fewer meetings.",
        citedEvidenceId: "taxable_investment_change",
        latencyMs: 20,
      });
    });

    await expect(client.generateCharacterBanter("run.current", {
      expectedRevision: 3,
      simulationMonth: "2026-10",
      planLabel: "Invest steadily",
      variationSeed: 7,
      evidence: [{
        id: "taxable_investment_change",
        label: "Taxable investment change",
        value: "+$500.00",
      }],
      recentLines: [],
    })).resolves.toMatchObject({ status: "generated", characterId: "bengo" });
    expect(request).toMatchObject({
      input: "/api/runs/run.current/banter",
      init: { method: "POST", credentials: "same-origin" },
    });
  });

  it("restores and validates the current same-origin session", async () => {
    const run = projectRunView(currentRunState());
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const client = new LifeFinanceClient(async (input, init) => {
      calls.push({ input: String(input), init });
      return Response.json({
        session: { run, stateChecksum: "a".repeat(64) },
      });
    });

    await expect(client.getSession()).resolves.toMatchObject({
      session: { run: { runId: "run.current" } },
    });
    expect(calls).toEqual([
      {
        input: "/api/session",
        init: { method: "GET", credentials: "same-origin" },
      },
    ]);
  });

  it("rejects a successful response that violates the contract", async () => {
    const client = new LifeFinanceClient(async () =>
      Response.json({ session: { run: {} } }),
    );

    await expect(client.getSession()).rejects.toEqual(
      expect.objectContaining<Partial<ApiClientError>>({
        code: "INVALID_RESPONSE",
        status: 502,
      }),
    );
  });

  it("normalizes the standard API error envelope", async () => {
    const client = new LifeFinanceClient(async () =>
      Response.json(
        {
          error: {
            code: "OPTIMISTIC_CONFLICT",
            message: "reload",
            requestId: "request.conflict",
          },
        },
        { status: 409 },
      ),
    );

    await expect(client.getSession()).rejects.toEqual(
      expect.objectContaining<Partial<ApiClientError>>({
        code: "OPTIMISTIC_CONFLICT",
        status: 409,
        requestId: "request.conflict",
      }),
    );
  });
});
