import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type PostTransactionCommand } from "../../core/commands";
import { moneyCents, ratePpm } from "../../core/domain/money";
import { simulationMonth } from "../../core/domain/month";
import { createInitialGameState } from "../../core/game-state";
import { RunSecretCodec } from "../auth/run-secret";
import { AiAuditCipher } from "../ai/audit-crypto";
import {
  AiAuditAdminAuthorizer,
  AiAuditRepository,
} from "../ai/audit-repository";
import {
  createDatabaseConnection,
  type DatabaseConnection,
} from "./client";
import { migrateDatabase } from "./migrate";
import { RunRepository } from "./run-repository";
import {
  acceptedCommands,
  aiAuditRecords,
  gameRuns,
  ledgerTransactions,
  runStateSnapshots,
  transactionalOutbox,
} from "./schema";

const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

function initialState(runId: string) {
  return createInitialGameState({
    runId,
    startMonth: "2026-07",
    randomSeed: "repository",
    player: {
      playerId: "player_repository",
      birthMonth: "1990-01",
      locationId: "US-CA",
      careerTrackId: "software_engineer",
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

function incomeCommand(id: string, amount = 1_000_00): PostTransactionCommand {
  return {
    schemaVersion: 1,
    id,
    expectedRevision: 0,
    effectiveMonth: simulationMonth("2026-07"),
    type: "post_transaction",
    payload: {
      transactionId: `txn.${id}`,
      reasonCode: "integration_income",
      description: "Integration-test income",
      postings: [
        {
          accountId: "asset.cash",
          debitCents: moneyCents(amount),
          creditCents: moneyCents(0),
        },
        {
          accountId: "income.other",
          debitCents: moneyCents(0),
          creditCents: moneyCents(amount),
        },
      ],
    },
  };
}

databaseDescribe("Postgres run repository", () => {
  let connection: DatabaseConnection;
  let repository: RunRepository;
  const runIds = [
    "10000000-0000-4000-8000-000000000001",
    "10000000-0000-4000-8000-000000000002",
    "10000000-0000-4000-8000-000000000003",
    "10000000-0000-4000-8000-000000000004",
  ];
  let runIndex = 0;

  beforeAll(async () => {
    connection = createDatabaseConnection(databaseUrl!);
    await migrateDatabase(connection.db);
    repository = new RunRepository(
      connection.db,
      new RunSecretCodec(Buffer.alloc(32, 0x77)),
      {
        runIdFactory: () => runIds[runIndex++],
        clock: () => new Date("2026-07-14T12:00:00.000Z"),
      },
    );
  });

  afterAll(async () => {
    await connection?.close();
  });

  it("creates, authorizes, applies, and idempotently replays one atomic command", async () => {
    const created = await repository.createRun(initialState);
    const command = incomeCommand("cmd.repo.income");
    const applied = await repository.applyCommand(
      created.runId,
      created.accessSecret,
      command,
    );
    const replayed = await repository.applyCommand(
      created.runId,
      created.accessSecret,
      command,
    );

    expect(applied.idempotentReplay).toBe(false);
    expect(applied.state.revision).toBe(1);
    expect(replayed).toMatchObject({
      idempotentReplay: true,
      stateChecksum: applied.stateChecksum,
    });
    expect(await repository.loadAuthorizedRun(created.runId, created.accessSecret)).toEqual(
      applied.state,
    );
    await expect(
      repository.loadAuthorizedRun(
        created.runId,
        new RunSecretCodec(Buffer.alloc(32, 0x77)).create().secret,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND_OR_UNAUTHORIZED" });

    const [commandCount] = await connection.db
      .select({ value: count() })
      .from(acceptedCommands)
      .where(eq(acceptedCommands.runId, created.runId));
    const [snapshotCount] = await connection.db
      .select({ value: count() })
      .from(runStateSnapshots)
      .where(eq(runStateSnapshots.runId, created.runId));
    const [ledgerCount] = await connection.db
      .select({ value: count() })
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.runId, created.runId));
    const [outboxCount] = await connection.db
      .select({ value: count() })
      .from(transactionalOutbox)
      .where(eq(transactionalOutbox.runId, created.runId));
    expect(commandCount.value).toBe(1);
    expect(snapshotCount.value).toBe(2);
    expect(ledgerCount.value).toBe(2);
    expect(outboxCount.value).toBe(2);
  });

  it("rolls back every persistence write when reduction fails", async () => {
    const created = await repository.createRun(initialState);
    const invalid = incomeCommand("cmd.repo.invalid");
    const broken: PostTransactionCommand = {
      ...invalid,
      payload: { ...invalid.payload, postings: invalid.payload.postings.slice(0, 1) },
    };

    await expect(
      repository.applyCommand(created.runId, created.accessSecret, broken),
    ).rejects.toBeTruthy();
    const [run] = await connection.db
      .select()
      .from(gameRuns)
      .where(eq(gameRuns.id, created.runId));
    const [commandCount] = await connection.db
      .select({ value: count() })
      .from(acceptedCommands)
      .where(eq(acceptedCommands.runId, created.runId));
    expect(run.currentRevision).toBe(0);
    expect(commandCount.value).toBe(0);
  });

  it("serializes concurrent commands and commits only one expected revision", async () => {
    const created = await repository.createRun(initialState);
    const results = await Promise.allSettled([
      repository.applyCommand(
        created.runId,
        created.accessSecret,
        incomeCommand("cmd.repo.concurrent.a", 100_00),
      ),
      repository.applyCommand(
        created.runId,
        created.accessSecret,
        incomeCommand("cmd.repo.concurrent.b", 200_00),
      ),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(({ status }) => status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({ code: "OPTIMISTIC_CONFLICT" }),
    });
  });

  it("stores encrypted AI audits, requires admin access, and prevents retention-breaking run deletion", async () => {
    const created = await repository.createRun(initialState);
    const invocationId = "30000000-0000-4000-8000-000000000001";
    const adminToken = `lf_audit_${Buffer.alloc(32, 0x42).toString("base64url")}`;
    const auditRepository = new AiAuditRepository(
      connection.db,
      new AiAuditCipher(new Map([[1, Buffer.alloc(32, 0x24)]]), 1, {
        randomBytes: () => Buffer.from("000102030405060708090a0b", "hex"),
      }),
      new AiAuditAdminAuthorizer(adminToken),
      {
        runId: created.runId,
        clock: () => new Date("2026-07-14T20:01:00.000Z"),
      },
    );

    await auditRepository.record({
      invocationId,
      contractVersion: 1,
      role: "explanation",
      model: "gpt-5.6-terra",
      prompt: {
        instructions: "Explain only the supplied concept.",
        input: { conceptId: "emergency_fund", whyNow: "A repair is due." },
      },
      attempts: [
        {
          attempt: 1,
          kind: "success",
          responseId: "resp_audit_1",
          output: [{ type: "output_text", text: "Cash absorbs surprises." }],
          errorCode: null,
        },
      ],
      outcome: "success",
    });

    const [stored] = await connection.db
      .select()
      .from(aiAuditRecords)
      .where(eq(aiAuditRecords.invocationId, invocationId));
    expect(stored.initializationVector).toHaveLength(12);
    expect(stored.authenticationTag).toHaveLength(16);
    expect(stored.ciphertext.toString("utf8")).not.toContain("emergency_fund");
    await expect(auditRepository.list(null)).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    const records = await auditRepository.list(`Bearer ${adminToken}`, {
      runId: created.runId,
      limit: 1,
    });
    expect(records[0]).toMatchObject({
      metadata: {
        invocationId,
        runId: created.runId,
        role: "explanation",
        outcome: "success",
      },
      content: {
        prompt: { input: { conceptId: "emergency_fund" } },
        attempts: [{ responseId: "resp_audit_1", kind: "success" }],
      },
    });

    await expect(
      connection.db.delete(gameRuns).where(eq(gameRuns.id, created.runId)),
    ).rejects.toBeTruthy();
    const retained = await auditRepository.list(`Bearer ${adminToken}`, {
      role: "explanation",
      limit: 1,
    });
    expect(retained[0]?.metadata).toMatchObject({ invocationId, runId: created.runId });
  });
});
