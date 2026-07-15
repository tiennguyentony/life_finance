import { describe, expect, it, vi } from "vitest";

import { sha256Canonical } from "../../core/canonical";
import { moneyCents, ratePpm } from "../../core/domain/money";
import { createInitialGameState } from "../../core/game-state";
import { RunSecretCodec } from "../auth/run-secret";
import type { RunRepository } from "../db/run-repository";
import { LifeFinanceApiClient, LifeFinanceApiError } from "./client";
import type { CreateRunRequest } from "./contracts";
import {
  handleCreateRun,
  handleGetRun,
  handleSubmitCommand,
} from "./http";
import { RunApiService } from "./service";

const runId = "10000000-0000-4000-8000-000000000001";
const accessSecret = new RunSecretCodec(Buffer.alloc(32, 9)).create((size) =>
  Buffer.alloc(size, 8),
).secret;

function state() {
  return createInitialGameState({
    runId,
    startMonth: "2026-07",
    randomSeed: "http",
    player: {
      playerId: "player_http",
      birthMonth: "1990-01",
      locationId: "US-CA",
      careerTrackId: "engineer",
      filingStatus: "single",
    },
    finances: {
      cashCents: moneyCents(10_000_00),
      taxableInvestmentsCents: moneyCents(20_000_00),
      retirementCents: moneyCents(30_000_00),
      homeValueCents: moneyCents(0),
      otherInvestableAssetsCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      nonCreditLiabilitiesCents: moneyCents(0),
      creditLimitCents: moneyCents(10_000_00),
      creditUsedCents: moneyCents(0),
      annualLivingCostCents: moneyCents(60_000_00),
      requiredObligationsCents: moneyCents(5_000_00),
    },
    wellbeing: {
      burnoutPpm: ratePpm(200_000),
      happinessPpm: ratePpm(800_000),
    },
  });
}

const createRequest: CreateRunRequest = {
  startMonth: "2026-07",
  player: {
    birthMonth: "1990-01",
    locationId: "US-CA",
    careerTrackId: "engineer",
    filingStatus: "single",
  },
  finances: state().finances,
  wellbeing: state().wellbeing,
  randomSeed: "http",
};

function service() {
  const current = state();
  const repository: Pick<
    RunRepository,
    "createRun" | "loadAuthorizedRun" | "applyCommand"
  > = {
    createRun: vi.fn(async (factory) => {
      const createdState = factory(runId);
      return {
        runId,
        accessSecret,
        state: createdState,
        stateChecksum: sha256Canonical(createdState),
      };
    }),
    loadAuthorizedRun: vi.fn(async () => current),
    applyCommand: vi.fn(async () => ({
      state: current,
      stateChecksum: sha256Canonical(current),
      idempotentReplay: false,
    })),
  };
  return { api: new RunApiService(repository, () => "player_http"), repository };
}

describe("v1 HTTP handlers", () => {
  it("creates a run with no-store headers and returns the one-time secret", async () => {
    const { api } = service();
    const response = await handleCreateRun(
      new Request("https://example.test/api/v1/runs", {
        method: "POST",
        body: JSON.stringify(createRequest),
      }),
      api,
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ runId, accessSecret });
  });

  it("requires bearer auth and never echoes a malformed credential", async () => {
    const { api, repository } = service();
    const malformed = "lf_run_do-not-echo";
    const response = await handleGetRun(
      new Request(`https://example.test/api/v1/runs/${runId}`, {
        headers: { Authorization: `Bearer ${malformed}` },
      }),
      runId,
      api,
    );
    const text = await response.text();

    expect(response.status).toBe(401);
    expect(text).not.toContain(malformed);
    expect(repository.loadAuthorizedRun).not.toHaveBeenCalled();
  });

  it("rejects internal month commands and oversized bodies before mutation", async () => {
    const { api, repository } = service();
    const internalResponse = await handleSubmitCommand(
      new Request(`https://example.test/api/v1/runs/${runId}/commands`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessSecret}` },
        body: JSON.stringify({
          schemaVersion: 1,
          id: "cmd.month.1",
          expectedRevision: 0,
          effectiveMonth: "2026-07",
          type: "process_month",
          payload: { employmentIncomeCents: 999_999_99 },
        }),
      }),
      runId,
      api,
    );
    const oversizedResponse = await handleCreateRun(
      new Request("https://example.test/api/v1/runs", {
        method: "POST",
        headers: { "Content-Length": "65537" },
        body: "{}",
      }),
      api,
    );

    expect(internalResponse.status).toBe(400);
    expect(oversizedResponse.status).toBe(413);
    expect(repository.applyCommand).not.toHaveBeenCalled();
  });
});

describe("typed v1 client", () => {
  it("validates output and keeps the run secret out of URLs and bodies", async () => {
    const current = state();
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({ state: current, stateChecksum: sha256Canonical(current) }),
    );
    const client = new LifeFinanceApiClient("https://example.test/", fetchMock);
    const result = await client.getRun(runId, accessSecret);
    const [url, init] = fetchMock.mock.calls[0];

    expect(result.state).toEqual(current);
    expect(String(url)).not.toContain(accessSecret);
    expect(init?.body).toBeUndefined();
    expect(init?.headers).toMatchObject({ Authorization: `Bearer ${accessSecret}` });
  });

  it("rejects malformed success and error responses", async () => {
    const invalidSuccess = new LifeFinanceApiClient(
      "https://example.test",
      vi.fn<typeof fetch>(async () => Response.json({ invented: true })),
    );
    await expect(invalidSuccess.getRun(runId, accessSecret)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 502,
    });

    const validError = new LifeFinanceApiClient(
      "https://example.test",
      vi.fn<typeof fetch>(async () =>
        Response.json(
          { error: { code: "OPTIMISTIC_CONFLICT", message: "stale" } },
          { status: 409 },
        ),
      ),
    );
    await expect(validError.getRun(runId, accessSecret)).rejects.toBeInstanceOf(
      LifeFinanceApiError,
    );
  });

  it("rejects malformed credentials before issuing a request", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const client = new LifeFinanceApiClient("https://example.test", fetchMock);

    await expect(client.getRun(runId, "malformed-secret")).rejects.toMatchObject({
      code: "INVALID_CREDENTIAL",
      status: 0,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
