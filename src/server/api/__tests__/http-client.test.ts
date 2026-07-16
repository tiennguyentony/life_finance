import { describe, expect, it, vi } from "vitest";

import { sha256Canonical } from "../../../core/canonical";
import { moneyCents, ratePpm } from "../../../core/domain/money";
import { createInitialGameState } from "../../../core/game-state";
import { migrateGameStateV1ToV2 } from "../../../core/game-state-v2";
import { RunSecretCodec } from "../../auth/run-secret";
import { RunRepositoryError, type RunRepository } from "../../db/run-repository";
import { LifeFinanceApiClient, LifeFinanceApiError } from "../client";
import type { CreateRunRequest } from "../contracts";
import {
  handleCreateRun,
  handleGetRun,
  handleMigrateRunV2,
  handleSubmitCommand,
} from "../http";
import { RunApiService } from "../service";
import type { RunApiServiceV2 } from "../service-v2";

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
  it("retires public v1 creation without invoking mutation", async () => {
    const { api, repository } = service();
    const response = await handleCreateRun(
      new Request("https://example.test/api/v1/runs", {
        method: "POST",
        body: JSON.stringify(createRequest),
      }),
      api,
    );

    expect(response.status).toBe(410);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: {
        code: "STATE_SCHEMA_DEPRECATED",
        message: "Legacy state is read-only; create or migrate a v2 run.",
      },
    });
    expect(repository.createRun).not.toHaveBeenCalled();
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

  it("preserves authenticated legacy reads", async () => {
    const { api, repository } = service();
    const response = await handleGetRun(
      new Request(`https://example.test/api/v1/runs/${runId}`, {
        headers: { Authorization: `Bearer ${accessSecret}` },
      }),
      runId,
      api,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ state: { schemaVersion: 1 } });
    expect(repository.loadAuthorizedRun).toHaveBeenCalledWith(runId, accessSecret);
  });

  it("retires public v1 commands without invoking mutation", async () => {
    const { api, repository } = service();
    const response = await handleSubmitCommand(
      new Request(`https://example.test/api/v1/runs/${runId}/commands`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessSecret}` },
        body: JSON.stringify({
          schemaVersion: 1,
          id: "cmd.public.1",
          expectedRevision: 0,
          effectiveMonth: "2026-07",
          type: "take_action",
          payload: { action: { type: "invest_cash", amountCents: 10_000 } },
        }),
      }),
      runId,
      api,
    );

    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({
      error: {
        code: "STATE_SCHEMA_DEPRECATED",
        message: "Legacy state is read-only; create or migrate a v2 run.",
      },
    });
    expect(repository.applyCommand).not.toHaveBeenCalled();
  });
});

describe("v2 migration HTTP handler", () => {
  it.each([undefined, "Bearer malformed-secret"])(
    "rejects a missing or malformed bearer credential before migration",
    async (authorization) => {
      const migrateRun = vi.fn();
      const response = await handleMigrateRunV2(
        new Request(`https://example.test/api/v2/runs/${runId}/migrate`, {
          method: "POST",
          ...(authorization ? { headers: { Authorization: authorization } } : {}),
        }),
        runId,
        { migrateRun } as unknown as RunApiServiceV2,
      );

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: {
          code: "NOT_FOUND_OR_UNAUTHORIZED",
          message: "Run was not found or the credential is invalid",
        },
      });
      expect(migrateRun).not.toHaveBeenCalled();
    },
  );

  it("returns a validated migration response", async () => {
    const migratedState = migrateGameStateV1ToV2(state());
    const migration = {
      state: migratedState,
      stateChecksum: sha256Canonical(migratedState),
      idempotentReplay: false,
    };
    const migrateRun = vi.fn(async () => migration);
    const response = await handleMigrateRunV2(
      new Request(`https://example.test/api/v2/runs/${runId}/migrate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessSecret}` },
      }),
      runId,
      { migrateRun } as unknown as RunApiServiceV2,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(migration);
    expect(migrateRun).toHaveBeenCalledWith(runId, accessSecret);
  });

  it("maps a valid-looking bad credential to the same opaque 401", async () => {
    const migrateRun = vi.fn(async () => {
      throw new RunRepositoryError(
        "NOT_FOUND_OR_UNAUTHORIZED",
        "run was not found or the credential is invalid",
      );
    });
    const response = await handleMigrateRunV2(
      new Request(`https://example.test/api/v2/runs/${runId}/migrate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessSecret}` },
      }),
      runId,
      { migrateRun } as unknown as RunApiServiceV2,
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: "NOT_FOUND_OR_UNAUTHORIZED",
        message: "Run was not found or the credential is invalid",
      },
    });
  });

  it("maps repository failures to the structured API error envelope", async () => {
    const migrateRun = vi.fn(async () => {
      throw new RunRepositoryError("CORRUPT_STATE", "checksum mismatch");
    });
    const response = await handleMigrateRunV2(
      new Request(`https://example.test/api/v2/runs/${runId}/migrate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessSecret}` },
      }),
      runId,
      { migrateRun } as unknown as RunApiServiceV2,
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: "CORRUPT_STATE",
        message: "The request could not be completed",
      },
    });
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

describe("typed v2 client", () => {
  it("posts an authenticated migration request without a body", async () => {
    const migratedState = migrateGameStateV1ToV2(state());
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({
        state: migratedState,
        stateChecksum: sha256Canonical(migratedState),
        idempotentReplay: false,
      }),
    );
    const client = new LifeFinanceApiClient("https://example.test", fetchMock);

    await expect(client.migrateRunV2(runId, accessSecret)).resolves.toMatchObject(
      {
        state: migratedState,
        idempotentReplay: false,
      },
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      `https://example.test/api/v2/runs/${runId}/migrate`,
    );
    expect(init).toMatchObject({
      method: "POST",
      headers: { Authorization: `Bearer ${accessSecret}` },
    });
    expect(init?.body).toBeUndefined();
  });

  it("validates v2 state and sends only the public process-month envelope", async () => {
    const current = migrateGameStateV1ToV2(state());
    const fetchMock = vi.fn<typeof fetch>(async (input) =>
      Response.json({
        state: current,
        stateChecksum: sha256Canonical(current),
        ...(String(input).endsWith("/commands")
          ? { idempotentReplay: false, monthlyRecord: null }
          : {}),
      }),
    );
    const client = new LifeFinanceApiClient("https://example.test", fetchMock);
    await client.getRunV2(runId, accessSecret);
    await client.submitCommandV2(runId, accessSecret, {
      schemaVersion: 2,
      id: "cmd.client-v2.month",
      type: "process_month",
      expectedRevision: 0,
      effectiveMonth: "2026-07",
      payload: {},
    });

    const [getUrl, getInit] = fetchMock.mock.calls[0];
    const [commandUrl, commandInit] = fetchMock.mock.calls[1];
    expect(String(getUrl)).toBe(`https://example.test/api/v2/runs/${runId}`);
    expect(getInit?.headers).toMatchObject({ Authorization: `Bearer ${accessSecret}` });
    expect(String(commandUrl).endsWith(`/api/v2/runs/${runId}/commands`)).toBe(true);
    expect(JSON.parse(String(commandInit?.body))).toEqual({
        schemaVersion: 2,
        id: "cmd.client-v2.month",
        type: "process_month",
        expectedRevision: 0,
        effectiveMonth: "2026-07",
        payload: {},
      });
    expect(String(commandInit?.body)).not.toContain("taxEvidence");
  });

  it("requests checkpoint evidence by validated revision with bearer auth", async () => {
    const snapshot = {
      month: "2026-07",
      ageYears: 36,
      cashCents: 0,
      investableAssetsCents: 0,
      liabilitiesCents: 0,
      netWorthCents: 0,
      annualLivingCostCents: 0,
      financialIndependenceTargetCents: 0,
      financialIndependenceProgressPpm: 1_000_000,
      exposure: null,
    };
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({
        evidence: {
          evidenceVersion: "checkpoint-v2.1",
          start: snapshot,
          end: snapshot,
          monthsProcessed: 0,
          monthlyCommandIds: [],
          taxTraceIds: [],
          totalGrossIncomeCents: 0,
          totalTaxCents: 0,
          totalAfterTaxCashIncomeCents: 0,
          totalRequiredCashCents: 0,
          totalMarketValueChangeCents: 0,
          totalInflationIncreaseCents: 0,
          totalInsurancePlayerCostCents: 0,
          totalDebtInterestCents: 0,
          totalDebtPaymentsCents: 0,
          totalLiquidationCostCents: 0,
          netWorthChangeCents: 0,
          investableAssetsChangeCents: 0,
          liabilitiesChangeCents: 0,
          eventChoices: [],
        },
      }),
    );
    const client = new LifeFinanceApiClient("https://example.test", fetchMock);
    await client.getCheckpointV2(runId, accessSecret, 3);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      `https://example.test/api/v2/runs/${runId}/checkpoint?fromRevision=3`,
    );
    expect(init?.headers).toMatchObject({ Authorization: `Bearer ${accessSecret}` });
    await expect(client.getCheckpointV2(runId, accessSecret, -1)).rejects.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
