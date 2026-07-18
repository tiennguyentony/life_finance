import { describe, expect, it, vi } from "vitest";

import { currentRunState } from "@/application/game/__tests__/run-state.fixture";
import { serializeRunSessionCookie } from "@/server/auth/run-session";
import type { GameCommandV2Public } from "../contracts-v2";
import { prepareOnboardingReviewV1 } from "@/core/onboarding-v1";

import {
  handleCreateDemoRun,
  handleCreateRun,
  handleDeleteSession,
  handleGetSession,
  handleGetRun,
  handleParseOnboarding,
  handleReviewOnboarding,
  handleSubmitCommand,
} from "../current-http";

const SESSION = {
  runId: "550e8400-e29b-41d4-a716-446655440000",
  accessSecret: `lf_run_${"a".repeat(43)}`,
};
const COOKIE = serializeRunSessionCookie(SESSION, { secure: false }).split(
  ";",
)[0]!;

describe("current frontend HTTP API", () => {
  it("creates a development demo and keeps its secret in the existing cookie", async () => {
    const state = currentRunState();
    const createRun = vi.fn(async () => ({
      runId: SESSION.runId,
      accessSecret: SESSION.accessSecret,
      state,
      stateChecksum: "a".repeat(64),
    }));

    const response = await handleCreateDemoRun(
      new Request("https://game.test/api/demo", {
        method: "POST",
        headers: { Origin: "https://game.test" },
      }),
      createRun,
      {
        enabled: true,
        secureCookies: false,
        requestIdFactory: () => "request.demo",
      },
    );

    expect(response.status).toBe(201);
    expect(createRun).toHaveBeenCalledOnce();
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    const body = await response.json();
    expect(body).toMatchObject({ run: { runId: "run.current" } });
    expect(JSON.stringify(body)).not.toContain("lf_run_");
  });

  it("does not instantiate a demo outside development", async () => {
    const createRun = vi.fn();

    const response = await handleCreateDemoRun(
      new Request("https://game.test/api/demo", {
        method: "POST",
        headers: { Origin: "https://game.test" },
      }),
      createRun,
      {
        enabled: false,
        requestIdFactory: () => "request.demo.disabled",
      },
    );

    expect(response.status).toBe(404);
    expect(createRun).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "NOT_FOUND",
        message: "local demo is available only in development",
        requestId: "request.demo.disabled",
      },
    });
  });

  it("rejects cross-origin demo creation", async () => {
    const response = await handleCreateDemoRun(
      new Request("https://game.test/api/demo", {
        method: "POST",
        headers: { Origin: "https://attacker.test" },
      }),
      vi.fn(),
      {
        enabled: true,
        requestIdFactory: () => "request.demo.cross-origin",
      },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "ORIGIN_FORBIDDEN" },
    });
  });

  it("parses optional onboarding text through the standard API envelope", async () => {
    const response = await handleParseOnboarding(
      new Request("https://game.test/api/onboarding/parse", {
        method: "POST",
        headers: {
          Origin: "https://game.test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          privacyNoticeVersion: 2,
          dataUseAccepted: true,
          freeText: "I am 30 and live in Seattle.",
        }),
      }),
      {
        extract: async () => ({
          status: "unavailable",
          patch: {},
          financialCandidates: [],
          filingStatusCandidate: null,
          clarificationQuestion: null,
          acceptedFieldIds: [],
          issues: [
            { path: "aiExtraction", code: "AI_UNAVAILABLE", severity: "invalid" },
          ],
        }),
      },
      () => "request.parse",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "unavailable",
      patch: {},
    });
  });

  it("reviews onboarding through the same-origin unversioned endpoint", async () => {
    const response = await handleReviewOnboarding(
      new Request("https://game.test/api/onboarding/review", {
        method: "POST",
        headers: {
          Origin: "https://game.test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          draft: { version: "onboarding-v1", sourceMode: "typed" },
        }),
      }),
      { review: prepareOnboardingReviewV1 },
      () => "request.review",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      version: "onboarding-v1",
      status: "needs_input",
    });
  });

  it("clears a same-origin run session", () => {
    const response = handleDeleteSession(
      new Request("https://game.test/api/session", {
        method: "DELETE",
        headers: { Origin: "https://game.test" },
      }),
      { secureCookies: false, requestIdFactory: () => "request.delete" },
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("creates a run from reviewed onboarding and keeps the secret in HttpOnly cookie", async () => {
    const state = currentRunState();
    const response = await handleCreateRun(
      new Request("https://game.test/api/runs", {
        method: "POST",
        headers: {
          Origin: "https://game.test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          draft: { version: "onboarding-v1", sourceMode: "typed" },
          reviewChecksum: "a".repeat(64),
        }),
      }),
      {
        confirm: async () => ({
          runId: SESSION.runId,
          accessSecret: SESSION.accessSecret,
          state,
          stateChecksum: "a".repeat(64),
        }),
      },
      { secureCookies: false, requestIdFactory: () => "request.create" },
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Strict");
    const body = await response.json();
    expect(body).toMatchObject({ run: { runId: "run.current" } });
    expect(JSON.stringify(body)).not.toContain("lf_run_");
  });

  it("keeps unexpected persistence failures inside a safe API envelope", async () => {
    const leakedQuery = `Failed query: insert into run_state_snapshots ${"private-state ".repeat(80)}`;
    const failures = [
      new Error(leakedQuery),
      Object.assign(new Error(leakedQuery), { code: "XX000" }),
    ];

    for (const persistenceError of failures) {
      const response = await handleCreateRun(
        new Request("https://game.test/api/runs", {
          method: "POST",
          headers: {
            Origin: "https://game.test",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            draft: { version: "onboarding-v1", sourceMode: "typed" },
            reviewChecksum: "a".repeat(64),
          }),
        }),
        {
          confirm: async () => Promise.reject(persistenceError),
        },
        {
          secureCookies: false,
          requestIdFactory: () => "request.persistence",
        },
      );

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: {
          code: "INTERNAL_ERROR",
          message: "The server could not complete the request.",
          requestId: "request.persistence",
        },
      });
    }
  });

  it("returns an explicit empty session when no cookie exists", async () => {
    const response = await handleGetSession(
      new Request("https://game.test/api/session"),
      { getRun: async () => Promise.reject(new Error("must not load")) },
      () => "request.session.empty",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ session: null });
  });

  it("restores a cookie-authenticated RunView without exposing the secret", async () => {
    const state = currentRunState();
    const response = await handleGetSession(
      new Request("https://game.test/api/session", {
        headers: { Cookie: COOKIE },
      }),
      {
        getRun: async (runId, secret) => {
          expect(runId).toBe(SESSION.runId);
          expect(secret).toBe(SESSION.accessSecret);
          return { state, stateChecksum: "a".repeat(64) };
        },
      },
      () => "request.session.active",
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      session: { run: { runId: "run.current", revision: 0 } },
    });
    expect(JSON.stringify(body)).not.toContain("lf_run_");
    expect(JSON.stringify(body)).not.toContain("schemaVersion");
  });

  it("loads a path-addressed run only when it matches the cookie session", async () => {
    const state = currentRunState();
    const response = await handleGetRun(
      new Request(`https://game.test/api/runs/${SESSION.runId}`, {
        headers: { Cookie: COOKIE },
      }),
      SESSION.runId,
      {
        getRun: async () => ({ state, stateChecksum: "a".repeat(64) }),
      },
      () => "request.run.get",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      run: { runId: "run.current" },
    });
  });

  it("accepts same-origin command intent through the cookie session", async () => {
    const state = currentRunState();
    let command: GameCommandV2Public | null = null;
    const response = await handleSubmitCommand(
      new Request(`https://game.test/api/runs/${SESSION.runId}/commands`, {
        method: "POST",
        headers: {
          Cookie: COOKIE,
          Origin: "https://game.test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: "ui.command.1",
          expectedRevision: 0,
          type: "resolve_event_choice",
          payload: { eventId: "event.1", choiceId: "choice.1" },
        }),
      }),
      SESSION.runId,
      {
        getRun: async () => ({ state, stateChecksum: "a".repeat(64) }),
        submitCommand: async (_runId, _secret, received) => {
          command = received;
          return {
            state,
            stateChecksum: "a".repeat(64),
            idempotentReplay: false,
            monthlyRecord: null,
          };
        },
      },
      () => "request.command",
    );

    expect(response.status).toBe(200);
    expect(command).toMatchObject({
      schemaVersion: 2,
      effectiveMonth: "2026-07",
    });
    await expect(response.json()).resolves.toMatchObject({
      run: { runId: "run.current" },
      result: { idempotentReplay: false },
    });
  });

  it("rejects cross-origin writes with the standard error envelope", async () => {
    const response = await handleSubmitCommand(
      new Request(`https://game.test/api/runs/${SESSION.runId}/commands`, {
        method: "POST",
        headers: {
          Cookie: COOKIE,
          Origin: "https://attacker.test",
          "Content-Type": "application/json",
        },
        body: "{}",
      }),
      SESSION.runId,
      {} as never,
      () => "request.cross-origin",
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "ORIGIN_FORBIDDEN",
        message: "state-changing API requests must be same-origin",
        requestId: "request.cross-origin",
      },
    });
  });
});
