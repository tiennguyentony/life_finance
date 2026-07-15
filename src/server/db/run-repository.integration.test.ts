import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { type PostTransactionCommand } from "../../core/commands";
import { moneyCents, ratePpm } from "../../core/domain/money";
import { simulationMonth } from "../../core/domain/month";
import type { DetailedFinanceCommand } from "../../core/detailed-actions-v2";
import { queueScheduledPersonalEventV2 } from "../../core/event-lifecycle-v2";
import { createInitialGameState } from "../../core/game-state";
import {
  migrateGameStateV1ToV2,
  V1_TO_V2_MIGRATION_VERSION,
} from "../../core/game-state-v2";
import { sha256Canonical } from "../../core/canonical";
import type { ProcessMonthV2Command } from "../../core/monthly-turn-v2";
import { createNativeGameStateV2 } from "../../core/native-game-state-v2";
import type { SetRecurringStrategyCommand } from "../../core/recurring-strategy-v2";
import { resolveScenarioCatalogSelection } from "../../core/scenario-catalog";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";
import { getEventTemplate } from "../../data/event-templates";
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
  handleCreateRunV2,
  handleGetCheckpointV2,
  handleGetRunV2,
  handleSubmitCommandV2,
} from "../api/http";
import { RunApiServiceV2 } from "../api/service-v2";
import type { CreateRunV2Request } from "../api/contracts-v2";
import { TaxServiceError, type TaxCalculator } from "../tax/client";
import {
  TransactionalOutboxDispatcher,
  type OutboxPublisher,
} from "../outbox/dispatcher";
import {
  acceptedCommands,
  aiAuditRecords,
  gameRuns,
  ledgerTransactions,
  monthlyTaxEvidence,
  monthlyTurnRecords,
  runScenarioSnapshots,
  runStateMigrations,
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

function nativeStateV2(runId: string) {
  const resolvedScenario = resolveScenarioCatalogSelection(
    US_2026_SCENARIO_CATALOG,
    {
      catalogVersion: US_2026_SCENARIO_CATALOG_VERSION,
      locationId: "location.seattle",
      careerId: "career.software",
      householdId: "household.single",
      benefitsPackageId: "benefits.corporate_flex",
      healthPlanId: "health.hdhp_hsa",
      retirementPlanId: "retirement.401k_standard",
      insuranceCoverageIds: ["insurance.renters"],
      scenarioId: "scenario.fresh_start",
    },
  );
  return createNativeGameStateV2({
    runId,
    playerId: "player.repository-v2",
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "repository-v2",
    resolvedScenario,
    annualGrossSalaryCents: moneyCents(12_000_000),
    finances: {
      cashCents: moneyCents(1_000_000),
      taxableBroadIndexCents: moneyCents(1_000_000),
      taxableSectorCents: moneyCents(200_000),
      taxableSpeculativeCents: moneyCents(100_000),
      retirement401kCents: moneyCents(500_000),
      retirementIraCents: moneyCents(100_000),
      hsaCents: moneyCents(50_000),
      homeValueCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      termDebts: [
        {
          id: "debt.student.repository-v2",
          kind: "student_loan",
          principalCents: moneyCents(120_000),
          annualInterestRatePpm: ratePpm(120_000),
          minimumPaymentCents: moneyCents(11_000),
          remainingTermMonths: 12,
        },
      ],
      revolvingCreditLimitCents: moneyCents(1_000_000),
      revolvingCreditUsedCents: moneyCents(0),
    },
    wellbeing: {
      burnoutPpm: ratePpm(100_000),
      happinessPpm: ratePpm(900_000),
    },
  });
}

function strategyCommandV2(): SetRecurringStrategyCommand {
  return {
    schemaVersion: 2,
    id: "cmd.repository-v2.strategy",
    type: "set_recurring_strategy",
    expectedRevision: 0,
    effectiveMonth: simulationMonth("2026-07"),
    payload: {
      strategy: {
        preTax401kSalaryRatePpm: ratePpm(50_000),
        preTaxHsaSalaryRatePpm: ratePpm(20_000),
        afterTaxBroadIndexRatePpm: ratePpm(200_000),
        afterTaxSectorRatePpm: ratePpm(0),
        afterTaxSpeculativeRatePpm: ratePpm(0),
        afterTaxIraRatePpm: ratePpm(100_000),
        afterTaxExtraDebtRatePpm: ratePpm(200_000),
      },
    },
  };
}

function monthCommandV2(id = "cmd.repository-v2.month"): ProcessMonthV2Command {
  return {
    schemaVersion: 2,
    id,
    type: "process_month_v2",
    expectedRevision: 1,
    effectiveMonth: simulationMonth("2026-07"),
    payload: {
      taxEvidence: {
        schemaVersion: 1,
        traceId: `tax.${id}`,
        economicYear: 2026,
        policyYear: 2026,
        stateCode: "WA",
        filingStatus: "single",
        provider: "PolicyEngine US",
        bundleVersion: "4.21.0",
        rulesVersion: "1.764.6",
        projectedFromFrozenPolicy: false,
        grossIncomeCents: moneyCents(1_000_000),
        employee401kContributionCents: moneyCents(50_000),
        employeeHsaContributionCents: moneyCents(20_000),
        totalTaxCents: 200_000,
        afterTaxCashIncomeCents: moneyCents(730_000),
      },
      taxableLiquidationCostRatePpm: ratePpm(10_000),
    },
  };
}

const apiCreateRequestV2: CreateRunV2Request = {
  schemaVersion: 2,
  startMonth: "2026-07",
  birthMonth: "1995-01",
  randomSeed: "api-v2-integration",
  catalogVersion: US_2026_SCENARIO_CATALOG_VERSION,
  locationId: "location.seattle",
  careerId: "career.software",
  householdId: "household.single",
  benefitsPackageId: "benefits.corporate_flex",
  healthPlanId: "health.hdhp_hsa",
  retirementPlanId: "retirement.401k_standard",
  insuranceCoverageIds: ["insurance.renters"],
  scenarioId: "scenario.fresh_start",
  annualGrossSalaryCents: 12_000_000,
  finances: {
    cashCents: 1_000_000,
    taxableBroadIndexCents: 1_000_000,
    taxableSectorCents: 200_000,
    taxableSpeculativeCents: 100_000,
    retirement401kCents: 500_000,
    retirementIraCents: 100_000,
    hsaCents: 50_000,
    homeValueCents: 0,
    otherAssetsCents: 0,
    termDebts: [
      {
        id: "debt.student.api-v2",
        kind: "student_loan",
        principalCents: 120_000,
        annualInterestRatePpm: 120_000,
        minimumPaymentCents: 11_000,
        remainingTermMonths: 12,
      },
    ],
    revolvingCreditLimitCents: 1_000_000,
    revolvingCreditUsedCents: 0,
  },
  wellbeing: { burnoutPpm: 100_000, happinessPpm: 900_000 },
};

function successfulTaxCalculator() {
  const calculate = vi.fn<TaxCalculator["calculate"]>(async (request) => ({
    schemaVersion: 1,
    traceId: request.traceId,
    economicYear: request.economicYear,
    policyYear: request.policyYear,
    stateCode: request.stateCode,
    filingStatus: request.filingStatus,
    annualGrossIncomeCents: 12_000_000,
    federalIncomeTaxCents: 1_200_000,
    stateIncomeTaxCents: 0,
    employeePayrollTaxCents: 1_200_000,
    selfEmploymentTaxCents: 0,
    totalTaxCents: 2_400_000,
    afterTaxIncomeCents: 9_600_000,
    effectiveTaxRatePpm: 200_000,
    componentsCents: { federal_income_tax: 1_200_000, payroll_tax: 1_200_000 },
    model: {
      provider: "PolicyEngine US",
      bundleVersion: "4.21.0",
      rulesVersion: "1.764.6",
      projectedFromFrozenPolicy: false,
    },
    disclaimer: "Educational estimate only; not tax, legal, or financial advice.",
  }));
  return { calculator: { calculate } satisfies TaxCalculator, calculate };
}

databaseDescribe("Postgres run repository", () => {
  let connection: DatabaseConnection;
  let repository: RunRepository;
  const runIds = [
    "10000000-0000-4000-8000-000000000001",
    "10000000-0000-4000-8000-000000000002",
    "10000000-0000-4000-8000-000000000003",
    "10000000-0000-4000-8000-000000000004",
    "10000000-0000-4000-8000-000000000005",
    "10000000-0000-4000-8000-000000000006",
    "10000000-0000-4000-8000-000000000007",
    "10000000-0000-4000-8000-000000000008",
    "10000000-0000-4000-8000-000000000009",
    "10000000-0000-4000-8000-000000000010",
    "10000000-0000-4000-8000-000000000011",
    "10000000-0000-4000-8000-000000000012",
    "10000000-0000-4000-8000-000000000013",
    "10000000-0000-4000-8000-000000000014",
    "10000000-0000-4000-8000-000000000015",
    "10000000-0000-4000-8000-000000000016",
    "10000000-0000-4000-8000-000000000017",
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

  it("atomically migrates v1 to v2 without rewriting revision, commands, or ledger history", async () => {
    const created = await repository.createRun(initialState);
    const migrated = await repository.migrateRunStateToV2(
      created.runId,
      created.accessSecret,
    );
    const replayed = await repository.migrateRunStateToV2(
      created.runId,
      created.accessSecret,
    );

    expect(migrated.idempotentReplay).toBe(false);
    expect(migrated.state.schemaVersion).toBe(2);
    expect(migrated.state.engineVersion).toBe("4.1.0");
    expect(migrated.state.revision).toBe(created.state.revision);
    expect(migrated.state.ledger).toEqual(created.state.ledger);
    expect(migrated.state.acceptedCommandIds).toEqual([]);
    expect(replayed).toEqual({ ...migrated, idempotentReplay: true });
    await expect(
      repository.loadAuthorizedRun(created.runId, created.accessSecret),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_STATE_SCHEMA" });

    const [run] = await connection.db
      .select()
      .from(gameRuns)
      .where(eq(gameRuns.id, created.runId));
    const [migrationCount] = await connection.db
      .select({ value: count() })
      .from(runStateMigrations)
      .where(eq(runStateMigrations.runId, created.runId));
    const [snapshotCount] = await connection.db
      .select({ value: count() })
      .from(runStateSnapshots)
      .where(eq(runStateSnapshots.runId, created.runId));
    const [commandCount] = await connection.db
      .select({ value: count() })
      .from(acceptedCommands)
      .where(eq(acceptedCommands.runId, created.runId));
    const [ledgerCount] = await connection.db
      .select({ value: count() })
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.runId, created.runId));
    const [outboxCount] = await connection.db
      .select({ value: count() })
      .from(transactionalOutbox)
      .where(eq(transactionalOutbox.runId, created.runId));
    expect(run).toMatchObject({
      stateSchemaVersion: 2,
      engineVersion: "4.1.0",
      currentRevision: 0,
      currentStateChecksum: migrated.stateChecksum,
    });
    expect(migrationCount.value).toBe(1);
    expect(snapshotCount.value).toBe(1);
    expect(commandCount.value).toBe(0);
    expect(ledgerCount.value).toBe(1);
    expect(outboxCount.value).toBe(2);
  });

  it("serializes concurrent migration attempts into one commit and one replay", async () => {
    const created = await repository.createRun(initialState);
    const results = await Promise.all([
      repository.migrateRunStateToV2(created.runId, created.accessSecret),
      repository.migrateRunStateToV2(created.runId, created.accessSecret),
    ]);

    expect(results.map(({ idempotentReplay }) => idempotentReplay).sort()).toEqual([
      false,
      true,
    ]);
    expect(results[0]?.stateChecksum).toBe(results[1]?.stateChecksum);
    const [migrationCount] = await connection.db
      .select({ value: count() })
      .from(runStateMigrations)
      .where(eq(runStateMigrations.runId, created.runId));
    expect(migrationCount.value).toBe(1);
  });

  it("rejects a corrupted source checksum before writing a migration", async () => {
    const created = await repository.createRun(initialState);
    await connection.db
      .update(gameRuns)
      .set({ currentStateChecksum: "0".repeat(64) })
      .where(eq(gameRuns.id, created.runId));

    await expect(
      repository.migrateRunStateToV2(created.runId, created.accessSecret),
    ).rejects.toMatchObject({ code: "CORRUPT_STATE" });
    const [migrationCount] = await connection.db
      .select({ value: count() })
      .from(runStateMigrations)
      .where(eq(runStateMigrations.runId, created.runId));
    expect(migrationCount.value).toBe(0);
  });

  it("rolls back the authoritative state when the migration outbox cannot insert", async () => {
    const created = await repository.createRun(initialState);
    const collisionKey = `${created.runId}:${V1_TO_V2_MIGRATION_VERSION}`;
    await connection.db.insert(transactionalOutbox).values({
      runId: created.runId,
      topic: "test.collision",
      idempotencyKey: collisionKey,
      payload: { test: true },
      status: "pending",
      availableAt: new Date("2026-07-14T12:00:00.000Z"),
      createdAt: new Date("2026-07-14T12:00:00.000Z"),
    });

    await expect(
      repository.migrateRunStateToV2(created.runId, created.accessSecret),
    ).rejects.toBeTruthy();
    const [run] = await connection.db
      .select()
      .from(gameRuns)
      .where(eq(gameRuns.id, created.runId));
    const [migrationCount] = await connection.db
      .select({ value: count() })
      .from(runStateMigrations)
      .where(eq(runStateMigrations.runId, created.runId));
    expect(run).toMatchObject({
      stateSchemaVersion: 1,
      engineVersion: "4.0.0",
      currentRevision: 0,
      currentStateChecksum: created.stateChecksum,
    });
    expect(migrationCount.value).toBe(0);
  });

  it("rejects an unjournaled v2 state even when its checksum is internally valid", async () => {
    const created = await repository.createRun(initialState);
    const target = migrateGameStateV1ToV2(created.state);
    await connection.db
      .update(gameRuns)
      .set({
        stateSchemaVersion: target.schemaVersion,
        engineVersion: target.engineVersion,
        currentState: target,
        currentStateChecksum: sha256Canonical(target),
      })
      .where(eq(gameRuns.id, created.runId));

    await expect(
      repository.migrateRunStateToV2(created.runId, created.accessSecret),
    ).rejects.toMatchObject({ code: "CORRUPT_STATE" });
  });

  it("rejects a v2 state whose migration evidence no longer matches", async () => {
    const created = await repository.createRun(initialState);
    await repository.migrateRunStateToV2(created.runId, created.accessSecret);
    await connection.db
      .update(runStateMigrations)
      .set({ sourceRevision: 1 })
      .where(eq(runStateMigrations.runId, created.runId));

    await expect(
      repository.migrateRunStateToV2(created.runId, created.accessSecret),
    ).rejects.toMatchObject({ code: "CORRUPT_STATE" });
  });

  it("creates a native v2 run and atomically persists strategy, tax evidence, and its monthly record", async () => {
    const created = await repository.createRunV2(nativeStateV2);
    const strategy = await repository.applyCommandV2(
      created.runId,
      created.accessSecret,
      strategyCommandV2(),
    );
    const command = monthCommandV2();
    const processed = await repository.applyCommandV2(
      created.runId,
      created.accessSecret,
      command,
    );
    const replayed = await repository.applyCommandV2(
      created.runId,
      created.accessSecret,
      command,
    );

    expect(strategy).toMatchObject({
      idempotentReplay: false,
      state: { revision: 1 },
      monthlyRecord: null,
    });
    expect(processed).toMatchObject({
      idempotentReplay: false,
      state: { revision: 2, currentMonth: "2026-08" },
      monthlyRecord: {
        processedMonth: "2026-07",
        nextMonth: "2026-08",
        taxTraceId: "tax.cmd.repository-v2.month",
      },
    });
    expect(replayed).toEqual({ ...processed, idempotentReplay: true });
    expect(
      await repository.loadAuthorizedRunV2(created.runId, created.accessSecret),
    ).toEqual(processed.state);

    const [scenarioCount] = await connection.db
      .select({ value: count() })
      .from(runScenarioSnapshots)
      .where(eq(runScenarioSnapshots.runId, created.runId));
    const [evidenceCount] = await connection.db
      .select({ value: count() })
      .from(monthlyTaxEvidence)
      .where(eq(monthlyTaxEvidence.runId, created.runId));
    const [recordCount] = await connection.db
      .select({ value: count() })
      .from(monthlyTurnRecords)
      .where(eq(monthlyTurnRecords.runId, created.runId));
    const [commandCount] = await connection.db
      .select({ value: count() })
      .from(acceptedCommands)
      .where(eq(acceptedCommands.runId, created.runId));
    const [snapshotCount] = await connection.db
      .select({ value: count() })
      .from(runStateSnapshots)
      .where(eq(runStateSnapshots.runId, created.runId));
    const [outboxCount] = await connection.db
      .select({ value: count() })
      .from(transactionalOutbox)
      .where(eq(transactionalOutbox.runId, created.runId));
    expect(scenarioCount.value).toBe(1);
    expect(evidenceCount.value).toBe(1);
    expect(recordCount.value).toBe(1);
    expect(commandCount.value).toBe(2);
    expect(snapshotCount.value).toBe(3);
    expect(outboxCount.value).toBe(3);

    await connection.db
      .update(monthlyTaxEvidence)
      .set({ evidenceChecksum: "0".repeat(64) })
      .where(eq(monthlyTaxEvidence.runId, created.runId));
    await expect(
      repository.applyCommandV2(created.runId, created.accessSecret, command),
    ).rejects.toMatchObject({ code: "CORRUPT_STATE" });

    await connection.db
      .update(runScenarioSnapshots)
      .set({ snapshotChecksum: "0".repeat(64) })
      .where(eq(runScenarioSnapshots.runId, created.runId));
    await expect(
      repository.loadAuthorizedRunV2(created.runId, created.accessSecret),
    ).rejects.toMatchObject({ code: "CORRUPT_STATE" });
  });

  it("rolls back v2 state, evidence, record, and command when the outbox write fails", async () => {
    const created = await repository.createRunV2(nativeStateV2);
    await repository.applyCommandV2(
      created.runId,
      created.accessSecret,
      strategyCommandV2(),
    );
    const command = monthCommandV2("cmd.repository-v2.rollback");
    await connection.db.insert(transactionalOutbox).values({
      runId: created.runId,
      topic: "test.collision",
      idempotencyKey: `${created.runId}:v2:${command.id}`,
      payload: { test: true },
      status: "pending",
      availableAt: new Date("2026-07-14T12:00:00.000Z"),
      createdAt: new Date("2026-07-14T12:00:00.000Z"),
    });

    await expect(
      repository.applyCommandV2(created.runId, created.accessSecret, command),
    ).rejects.toBeTruthy();
    const loaded = await repository.loadAuthorizedRunV2(
      created.runId,
      created.accessSecret,
    );
    const [evidenceCount] = await connection.db
      .select({ value: count() })
      .from(monthlyTaxEvidence)
      .where(eq(monthlyTaxEvidence.runId, created.runId));
    const [recordCount] = await connection.db
      .select({ value: count() })
      .from(monthlyTurnRecords)
      .where(eq(monthlyTurnRecords.runId, created.runId));
    const [commandCount] = await connection.db
      .select({ value: count() })
      .from(acceptedCommands)
      .where(eq(acceptedCommands.runId, created.runId));
    expect(loaded).toMatchObject({ revision: 1, currentMonth: "2026-07" });
    expect(evidenceCount.value).toBe(0);
    expect(recordCount.value).toBe(0);
    expect(commandCount.value).toBe(1);
  });

  it("serializes concurrent v2 commands at the same expected revision", async () => {
    const created = await repository.createRunV2(nativeStateV2);
    const action = (id: string, bucket: "taxableBroadIndexCents" | "taxableSectorCents"):
      DetailedFinanceCommand => ({
        schemaVersion: 2,
        id,
        type: "take_detailed_action",
        expectedRevision: 0,
        effectiveMonth: simulationMonth("2026-07"),
        payload: {
          action: {
            type: "invest_taxable",
            bucket,
            amountCents: moneyCents(10_000),
          },
        },
      });
    const results = await Promise.allSettled([
      repository.applyCommandV2(
        created.runId,
        created.accessSecret,
        action("cmd.repository-v2.concurrent.a", "taxableBroadIndexCents"),
      ),
      repository.applyCommandV2(
        created.runId,
        created.accessSecret,
        action("cmd.repository-v2.concurrent.b", "taxableSectorCents"),
      ),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.find(({ status }) => status === "rejected")).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({ code: "OPTIMISTIC_CONFLICT" }),
    });
  });

  it("persists and idempotently replays a server-owned event choice", async () => {
    const template = getEventTemplate("personal.medical_bill");
    const created = await repository.createRunV2((runId) =>
      queueScheduledPersonalEventV2(nativeStateV2(runId), {
        proposal: {
          eventId: "evt.2026-07.personal.medical_bill",
          templateId: template.id,
          templateVersion: template.version,
          parameters: { gross_bill_cents: 1_000_000 },
        },
        template,
        targetedWeakness: "low_emergency_fund",
      }),
    );
    const blockedAction: DetailedFinanceCommand = {
      schemaVersion: 2,
      id: "cmd.repository-v2.blocked-action",
      type: "take_detailed_action",
      expectedRevision: 0,
      effectiveMonth: simulationMonth("2026-07"),
      payload: {
        action: {
          type: "invest_taxable",
          bucket: "taxableBroadIndexCents",
          amountCents: moneyCents(1),
        },
      },
    };
    await expect(
      repository.applyCommandV2(
        created.runId,
        created.accessSecret,
        blockedAction,
      ),
    ).rejects.toMatchObject({ code: "PENDING_EVENT_UNRESOLVED" });

    const choice = {
      schemaVersion: 2 as const,
      id: "cmd.repository-v2.event-choice",
      type: "resolve_event_choice" as const,
      expectedRevision: 0,
      effectiveMonth: simulationMonth("2026-07"),
      payload: {
        eventId: "evt.2026-07.personal.medical_bill",
        choiceId: "use_insurance",
      },
    };
    const applied = await repository.applyCommandV2(
      created.runId,
      created.accessSecret,
      choice,
    );
    const replayed = await repository.applyCommandV2(
      created.runId,
      created.accessSecret,
      choice,
    );

    expect(applied.idempotentReplay).toBe(false);
    expect(applied.state.gameplay.eventLifecycle.pending).toBeNull();
    expect(applied.state.gameplay.eventLifecycle.history[0]).toMatchObject({
      choiceId: "use_insurance",
      playerCostCents: 344_000,
      insurerCostCents: 656_000,
    });
    expect(replayed).toMatchObject({
      idempotentReplay: true,
      stateChecksum: applied.stateChecksum,
    });
  });

  it("claims outbox once across workers, retries with backoff, and recovers stale leases", async () => {
    const created = await repository.createRun(initialState);
    let now = new Date("2026-07-15T12:00:00.000Z");
    await connection.db.insert(transactionalOutbox).values({
      runId: created.runId,
      topic: "test.concurrent",
      idempotencyKey: `${created.runId}:test.concurrent`,
      payload: { safe: true },
      status: "pending",
      availableAt: now,
      createdAt: now,
    });
    const publish = vi.fn<OutboxPublisher["publish"]>(async () => undefined);
    const options = {
      clock: () => now,
      leaseMilliseconds: 60_000,
      baseBackoffMilliseconds: 5_000,
      maximumBackoffMilliseconds: 60_000,
      maximumAttempts: 3,
      topics: ["test.concurrent"],
    };
    const left = new TransactionalOutboxDispatcher(connection.db, { publish }, options);
    const right = new TransactionalOutboxDispatcher(connection.db, { publish }, options);
    const concurrent = await Promise.all([left.dispatchBatch(), right.dispatchBatch()]);
    expect(concurrent.reduce((total, result) => total + result.claimed, 0)).toBe(1);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0]?.[0]).toMatchObject({
      topic: "test.concurrent",
      attemptCount: 1,
    });

    await connection.db.insert(transactionalOutbox).values({
      runId: created.runId,
      topic: "test.retry",
      idempotencyKey: `${created.runId}:test.retry`,
      payload: { safe: true },
      status: "pending",
      availableAt: now,
      createdAt: now,
    });
    const retryPublish = vi.fn<OutboxPublisher["publish"]>(async (delivery) => {
      if (delivery.attemptCount === 1) {
        const error = new Error("sensitive message must not persist");
        error.name = "Temporary Network Error";
        throw error;
      }
    });
    const retrying = new TransactionalOutboxDispatcher(
      connection.db,
      { publish: retryPublish },
      { ...options, topics: ["test.retry"] },
    );
    expect(await retrying.dispatchBatch()).toMatchObject({
      claimed: 1,
      retryScheduled: 1,
    });
    expect(await retrying.dispatchBatch()).toMatchObject({ claimed: 0 });
    const [failed] = await connection.db
      .select()
      .from(transactionalOutbox)
      .where(eq(transactionalOutbox.topic, "test.retry"));
    expect(failed).toMatchObject({
      status: "failed",
      attemptCount: 1,
      lastErrorCode: "TEMPORARY_NETWORK_ERROR",
      availableAt: new Date("2026-07-15T12:00:05.000Z"),
    });
    now = new Date("2026-07-15T12:00:05.000Z");
    expect(await retrying.dispatchBatch()).toMatchObject({
      claimed: 1,
      delivered: 1,
    });

    await connection.db.insert(transactionalOutbox).values({
      runId: created.runId,
      topic: "test.stale",
      idempotencyKey: `${created.runId}:test.stale`,
      payload: { safe: true },
      status: "processing",
      attemptCount: 1,
      availableAt: now,
      lockedAt: new Date(now.getTime() - 60_001),
      createdAt: now,
    });
    const staleDispatcher = new TransactionalOutboxDispatcher(
      connection.db,
      { publish },
      { ...options, topics: ["test.stale"] },
    );
    expect(await staleDispatcher.dispatchBatch()).toMatchObject({
      claimed: 1,
      delivered: 1,
    });
    const [recovered] = await connection.db
      .select()
      .from(transactionalOutbox)
      .where(eq(transactionalOutbox.topic, "test.stale"));
    expect(recovered).toMatchObject({
      status: "delivered",
      attemptCount: 2,
      lockedAt: null,
      lastErrorCode: null,
    });
  });

  it("drives the authorized v2 HTTP flow without accepting tax inputs or recalculating on replay", async () => {
    const tax = successfulTaxCalculator();
    const api = new RunApiServiceV2(repository, tax.calculator, () => "player.api-v2");
    const createdResponse = await handleCreateRunV2(
      new Request("https://example.test/api/v2/runs", {
        method: "POST",
        body: JSON.stringify(apiCreateRequestV2),
      }),
      api,
    );
    const created = (await createdResponse.json()) as {
      runId: string;
      accessSecret: string;
      state: { revision: number; currentMonth: string };
    };
    expect(createdResponse.status).toBe(201);
    expect(created.state).toMatchObject({ revision: 0, currentMonth: "2026-07" });

    const strategy = {
      schemaVersion: 2,
      id: "cmd.api-v2.strategy",
      type: "set_recurring_strategy",
      expectedRevision: 0,
      effectiveMonth: "2026-07",
      payload: {
        strategy: {
          preTax401kSalaryRatePpm: 50_000,
          preTaxHsaSalaryRatePpm: 20_000,
          afterTaxBroadIndexRatePpm: 200_000,
          afterTaxSectorRatePpm: 0,
          afterTaxSpeculativeRatePpm: 0,
          afterTaxIraRatePpm: 100_000,
          afterTaxExtraDebtRatePpm: 200_000,
        },
      },
    };
    const strategyResponse = await handleSubmitCommandV2(
      new Request(`https://example.test/api/v2/runs/${created.runId}/commands`, {
        method: "POST",
        headers: { Authorization: `Bearer ${created.accessSecret}` },
        body: JSON.stringify(strategy),
      }),
      created.runId,
      api,
    );
    expect(strategyResponse.status).toBe(200);

    const command = {
      schemaVersion: 2,
      id: "cmd.api-v2.month.2026-07",
      type: "process_month",
      expectedRevision: 1,
      effectiveMonth: "2026-07",
      payload: {},
    };
    const injected = await handleSubmitCommandV2(
      new Request(`https://example.test/api/v2/runs/${created.runId}/commands`, {
        method: "POST",
        headers: { Authorization: `Bearer ${created.accessSecret}` },
        body: JSON.stringify({
          ...command,
          payload: { taxEvidence: { totalTaxCents: 0 } },
        }),
      }),
      created.runId,
      api,
    );
    expect(injected.status).toBe(400);
    expect(tax.calculate).not.toHaveBeenCalled();

    const process = () =>
      handleSubmitCommandV2(
        new Request(`https://example.test/api/v2/runs/${created.runId}/commands`, {
          method: "POST",
          headers: { Authorization: `Bearer ${created.accessSecret}` },
          body: JSON.stringify(command),
        }),
        created.runId,
        api,
      );
    const processedResponse = await process();
    const replayedResponse = await process();
    const processed = (await processedResponse.json()) as {
      state: { revision: number; currentMonth: string };
      monthlyRecord: {
        processedMonth: string;
        taxTraceId: string;
        grossIncomeCents: number;
        totalTaxCents: number;
        afterTaxCashIncomeCents: number;
        requiredCashCents: number;
        debtService: {
          totalInterestCents: number;
          totalScheduledPaymentCents: number;
        };
        recurringAllocations: {
          preTax: {
            employee401kCents: number;
            employer401kMatchCents: number;
            hsaCents: number;
          };
        } | null;
      };
      idempotentReplay: boolean;
    };
    const replayed = (await replayedResponse.json()) as typeof processed;
    expect(processedResponse.status).toBe(200);
    expect(replayedResponse.status).toBe(200);
    expect(processed).toMatchObject({
      state: { revision: 2, currentMonth: "2026-08" },
      monthlyRecord: {
        processedMonth: "2026-07",
        taxTraceId: "tax.cmd.api-v2.month.2026-07",
        grossIncomeCents: 1_000_000,
        totalTaxCents: 200_000,
        afterTaxCashIncomeCents: 730_000,
        requiredCashCents: expect.any(Number),
        debtService: {
          totalInterestCents: expect.any(Number),
          totalScheduledPaymentCents: expect.any(Number),
        },
        recurringAllocations: {
          preTax: {
            employee401kCents: 50_000,
            employer401kMatchCents: 40_000,
            hsaCents: 20_000,
          },
        },
      },
      idempotentReplay: false,
    });
    expect(replayed).toEqual({ ...processed, idempotentReplay: true });
    expect(tax.calculate).toHaveBeenCalledTimes(1);
    expect(tax.calculate.mock.calls[0]?.[0]).toMatchObject({
      stateCode: "WA",
      filingStatus: "single",
      people: [
        expect.objectContaining({
          income: expect.objectContaining({
            w2Jobs: [
              expect.objectContaining({
                wagesCents: 12_000_000,
                pretaxRetirementContributionsCents: 600_000,
                pretaxHealthContributionsCents: 240_000,
              }),
            ],
          }),
        }),
      ],
    });

    const checkpointResponse = await handleGetCheckpointV2(
      new Request(
        `https://example.test/api/v2/runs/${created.runId}/checkpoint?fromRevision=1`,
        { headers: { Authorization: `Bearer ${created.accessSecret}` } },
      ),
      created.runId,
      api,
    );
    expect(checkpointResponse.status).toBe(200);
    await expect(checkpointResponse.json()).resolves.toMatchObject({
      evidence: {
        evidenceVersion: "checkpoint-v2.1",
        monthsProcessed: 1,
        monthlyCommandIds: ["cmd.api-v2.month.2026-07"],
        taxTraceIds: ["tax.cmd.api-v2.month.2026-07"],
        totalGrossIncomeCents: 1_000_000,
        totalTaxCents: 200_000,
        totalAfterTaxCashIncomeCents: 730_000,
      },
    });

    const loadedResponse = await handleGetRunV2(
      new Request(`https://example.test/api/v2/runs/${created.runId}`, {
        headers: { Authorization: `Bearer ${created.accessSecret}` },
      }),
      created.runId,
      api,
    );
    expect(loadedResponse.status).toBe(200);
    await expect(loadedResponse.json()).resolves.toMatchObject({
      state: { revision: 2, currentMonth: "2026-08" },
    });
  });

  it("returns 503 and commits nothing when server-owned tax calculation fails", async () => {
    const calculate = vi.fn<TaxCalculator["calculate"]>(async () => {
      throw new TaxServiceError("SERVICE_UNAVAILABLE", "temporary test outage", {
        retryable: true,
      });
    });
    const api = new RunApiServiceV2(repository, { calculate }, () => "player.api-v2-fail");
    const createdResponse = await handleCreateRunV2(
      new Request("https://example.test/api/v2/runs", {
        method: "POST",
        body: JSON.stringify(apiCreateRequestV2),
      }),
      api,
    );
    const created = (await createdResponse.json()) as {
      runId: string;
      accessSecret: string;
    };
    const failed = await handleSubmitCommandV2(
      new Request(`https://example.test/api/v2/runs/${created.runId}/commands`, {
        method: "POST",
        headers: { Authorization: `Bearer ${created.accessSecret}` },
        body: JSON.stringify({
          schemaVersion: 2,
          id: "cmd.api-v2.tax-failure",
          type: "process_month",
          expectedRevision: 0,
          effectiveMonth: "2026-07",
          payload: {},
        }),
      }),
      created.runId,
      api,
    );

    expect(failed.status).toBe(503);
    expect(await failed.json()).toMatchObject({
      error: { code: "TAX_SERVICE_UNAVAILABLE" },
    });
    expect(
      await repository.loadAuthorizedRunV2(created.runId, created.accessSecret),
    ).toMatchObject({ revision: 0, currentMonth: "2026-07" });
    const [evidenceCount] = await connection.db
      .select({ value: count() })
      .from(monthlyTaxEvidence)
      .where(eq(monthlyTaxEvidence.runId, created.runId));
    expect(evidenceCount.value).toBe(0);
  });
});
