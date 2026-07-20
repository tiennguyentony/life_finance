import { describe, expect, it, vi } from "vitest";

import { currentRunState } from "@/application/game/__tests__/run-state.fixture";
import { serializeRunSessionCookie } from "@/server/auth/run-session";
import type { GameCommandV2Public } from "../contracts-v2";
import { prepareOnboardingReviewV1 } from "@/core/onboarding-v1";

import {
  handleCreateDemoRun,
  handleCreateRun,
  handleClaimAccountSession,
  handleActivateAccountRun,
  handleDeleteSession,
  handleGetAccountSession,
  handleGetAccountTaxSummary,
  handleGetSession,
  handleGetTaxSummary,
  handleGetRun,
  handleGenerateCharacterBanter,
  handleInterpretEvent,
  handleListAccountRuns,
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
  it("authorizes account tax summaries with the verified user credential", async () => {
    const getSummary = vi.fn(async () => ({ status: "available" }) as never);

    const response = await handleGetAccountTaxSummary(
      { userId: SESSION.runId },
      SESSION.runId,
      { getSummary },
      () => "request.tax.account",
    );

    expect(response.status).toBe(200);
    expect(getSummary).toHaveBeenCalledWith(
      SESSION.runId,
      `lf_account:${SESSION.runId}`,
    );
  });

  it("does not expose a cookie tax summary for a different run", async () => {
    const getSummary = vi.fn();
    const response = await handleGetTaxSummary(
      new Request("https://game.test/api/runs/another-run/tax", {
        headers: { cookie: COOKIE },
      }),
      "another-run",
      { getSummary },
      () => "request.tax.cookie",
    );

    expect(response.status).toBe(401);
    expect(getSummary).not.toHaveBeenCalled();
  });

  it("lists account saves without exposing persisted state", async () => {
    const response = await handleListAccountRuns(
      { userId: SESSION.runId },
      {
        listOwnedRunsV2: async () => [{
          runId: SESSION.runId,
          saveStatus: "active",
          runStatus: "active",
          currentMonth: "2027-03",
          revision: 10,
          createdAt: new Date("2026-07-18T20:00:00.000Z"),
          updatedAt: new Date("2026-07-18T21:00:00.000Z"),
        }],
      },
      () => "request.saves",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      saves: [{
        runId: SESSION.runId,
        saveStatus: "active",
        runStatus: "active",
        currentMonth: "2027-03",
        revision: 10,
        createdAt: "2026-07-18T20:00:00.000Z",
        updatedAt: "2026-07-18T21:00:00.000Z",
      }],
    });
  });

  it("activates only through a same-origin account request", async () => {
    const activateOwnedRunV2 = vi.fn(async () => undefined);
    const response = await handleActivateAccountRun(
      new Request(`https://game.test/api/runs/${SESSION.runId}/activate`, {
        method: "POST",
        headers: { Origin: "https://game.test" },
      }),
      { userId: SESSION.runId },
      SESSION.runId,
      { activateOwnedRunV2 },
      () => "request.activate",
    );

    expect(response.status).toBe(200);
    expect(activateOwnedRunV2).toHaveBeenCalledWith(SESSION.runId, SESSION.runId);
  });

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

  it("restores the active save by account without requiring a browser cookie", async () => {
    const state = currentRunState();
    const response = await handleGetAccountSession(
      { userId: SESSION.runId },
      { loadActiveOwnedRunId: async () => SESSION.runId },
      {
        getRun: async (runId, credential) => {
          expect(runId).toBe(SESSION.runId);
          expect(credential).toBe(`lf_account:${SESSION.runId}`);
          return { state, stateChecksum: "a".repeat(64) };
        },
      },
      () => "request.account-session",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      account: { userId: SESSION.runId },
      session: { run: { runId: "run.current" } },
    });
  });

  it("claims a legacy cookie save for the signed-in account", async () => {
    const claimRunV2 = vi.fn(async () => undefined);
    const response = await handleClaimAccountSession(
      new Request("https://game.test/api/session/claim", {
        method: "POST",
        headers: { Origin: "https://game.test", Cookie: COOKIE },
      }),
      { userId: SESSION.runId },
      {
        claimRunV2,
        loadActiveOwnedRunId: async () => SESSION.runId,
      },
      () => "request.claim",
    );

    expect(response.status).toBe(200);
    expect(claimRunV2).toHaveBeenCalledWith(
      SESSION.runId,
      SESSION.runId,
      SESSION.accessSecret,
    );
    await expect(response.json()).resolves.toEqual({
      claimed: true,
      runId: SESSION.runId,
    });
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

  it("authorizes and validates a same-origin free-text event interpretation", async () => {
    const state = currentRunState();
    const interpret = vi.fn(async () => ({
      version: "interactive-event-interpretation-v1" as const,
      status: "question" as const,
      source: "deterministic_fallback" as const,
      choiceId: null,
      confidencePpm: 0,
      latencyMs: 2,
      systemMessage: "I could not confidently match that answer.",
      sproutReaction: "Try one concrete action.",
      education: "Describe a spending, saving, debt, or insurance action.",
      playerTurn: 1,
      remainingPlayerTurns: 2,
    }));
    const response = await handleInterpretEvent(
      new Request(`https://game.test/api/runs/${SESSION.runId}/events/interpret`, {
        method: "POST",
        headers: {
          Cookie: COOKIE,
          Origin: "https://game.test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventId: "event.waiting",
          expectedRevision: 0,
          conversation: [{
            role: "player",
            content: "I will reduce my expenses.",
          }],
        }),
      }),
      SESSION.runId,
      { getRun: async () => ({ state, stateChecksum: "a".repeat(64) }) },
      { interpret },
      () => "request.event.interpret",
    );

    expect(response.status).toBe(200);
    expect(interpret).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run.current", revision: 0 }),
      expect.objectContaining({
        conversation: [{
          role: "player",
          content: "I will reduce my expenses.",
        }],
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      status: "question",
      source: "deterministic_fallback",
    });
  });

  it("authorizes bounded character banter evidence without changing the run", async () => {
    const state = currentRunState();
    const generate = vi.fn(async () => ({
      version: "character-banter-v1" as const,
      status: "generated" as const,
      source: "local_oss" as const,
      characterId: "impulso" as const,
      tone: "roast" as const,
      message: "Cash left so quickly it forgot to wave goodbye.",
      citedEvidenceId: "cash_change",
      latencyMs: 12,
    }));
    const response = await handleGenerateCharacterBanter(
      new Request(`https://game.test/api/runs/${SESSION.runId}/banter`, {
        method: "POST",
        headers: {
          Cookie: COOKIE,
          Origin: "https://game.test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expectedRevision: 0,
          simulationMonth: "2026-07",
          planLabel: "Stay steady",
          variationSeed: 42,
          evidence: [{
            id: "cash_change",
            label: "Cash change",
            value: "-$250.00",
          }],
          recentLines: [],
        }),
      }),
      SESSION.runId,
      { getRun: async () => ({ state, stateChecksum: "a".repeat(64) }) },
      { generate },
      () => "request.banter",
    );

    expect(response.status).toBe(200);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run.current", revision: 0 }),
      expect.objectContaining({ variationSeed: 42 }),
    );
    await expect(response.json()).resolves.toMatchObject({
      status: "generated",
      characterId: "impulso",
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
