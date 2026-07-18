import { and, asc, count, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { type PostTransactionCommand } from "../../../core/commands";
import { ACTION_POLICY_V1_VERSION } from "../../../core/action-policy-v2";
import { DECLARATIVE_EVENT_SCHEDULER_V2_VERSION } from "../../../core/event-scheduler-v2";
import { FINANCIAL_KERNEL_V2_VERSION } from "../../../core/financial-kernel-v2";
import { allocateMoney, moneyCents, ratePpm } from "../../../core/domain/money";
import { simulationMonth } from "../../../core/domain/month";
import type { DetailedFinanceCommand } from "../../../core/detailed-actions-v2";
import { queueScheduledPersonalEventV2 } from "../../../core/event-lifecycle-v2";
import { createInitialGameState } from "../../../core/game-state";
import {
  migrateGameStateV1ToV2,
  V1_TO_V2_MIGRATION_VERSION,
  type GameStateV2,
} from "../../../core/game-state-v2";
import { sha256Canonical } from "../../../core/canonical";
import type { ProcessMonthV2Command } from "../../../core/monthly-turn-v2";
import { MACRO_MARKET_MODEL_V2_VERSION } from "../../../core/market";
import { OUTCOME_POLICY_V1_VERSION } from "../../../core/outcome-policy-v2";
import { RUNTIME_BALANCE_CONTROLLER_V1_VERSION } from "../../../core/runtime-balance-policy-v2";
import { SCENARIO_DIRECTOR_V2_VERSION } from "../../../core/scenario-director-policy-v2";
import { advanceTimeV2 } from "../../../core/time-controller-v2";
import { createNativeGameStateV2 } from "../../../core/native-game-state-v2";
import { WORLD_RANDOM_VERSION_V1 } from "../../../core/world-random-v1";
import {
  planRecurringAllocations,
  type SetRecurringStrategyCommand,
} from "../../../core/recurring-strategy-v2";
import { resolveScenarioCatalogSelection } from "../../../core/scenario-catalog";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../../data/scenario-catalog";
import { getEventTemplate } from "../../../data/event-templates";
import { RunSecretCodec } from "../../auth/run-secret";
import { accountRunCredential } from "../../auth/account-run-credential";
import { AiAuditCipher } from "../../ai/audit-crypto";
import {
  AiAuditAdminAuthorizer,
  AiAuditRepository,
} from "../../ai/audit-repository";
import {
  createDatabaseConnection,
  type DatabaseConnection,
} from "../client";
import { migrateDatabase } from "../migrate";
import { RunRepository } from "../run-repository";
import { reduceGameCommandV2 } from "../run-repository-support";
import { RunApiServiceV2 } from "../../api/run-service";
import type { TaxCalculator } from "../../tax/client";
import { onboardingDraftForPersonaV1 } from "../../../core/onboarding-personas-v1";
import { OnboardingApiServiceV1 } from "../../api/onboarding-service";
import {
  TransactionalOutboxDispatcher,
  type OutboxPublisher,
} from "../../outbox/dispatcher";
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
} from "../schema";

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

function sparseStateV2(
  runId: string,
  options: Readonly<{ terminalOnNextMonth?: boolean }> = {},
) {
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
  const terminalAsset = options.terminalOnNextMonth ? 200_000_000 : 3_000_000;
  return createNativeGameStateV2({
    runId,
    playerId: "player.sparse-v2",
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-01"),
    randomSeed: "repository-sparse-v2",
    resolvedScenario,
    annualGrossSalaryCents: moneyCents(12_000_000),
    finances: {
      cashCents: moneyCents(2_000_000),
      taxableBroadIndexCents: moneyCents(terminalAsset),
      taxableSectorCents: moneyCents(3_000_000),
      taxableSpeculativeCents: moneyCents(3_000_000),
      retirement401kCents: moneyCents(3_000_000),
      retirementIraCents: moneyCents(3_000_000),
      hsaCents: moneyCents(3_000_000),
      homeValueCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      termDebts: [],
      revolvingCreditLimitCents: moneyCents(1_000_000),
      revolvingCreditUsedCents: moneyCents(0),
    },
    wellbeing: {
      burnoutPpm: ratePpm(100_000),
      happinessPpm: ratePpm(900_000),
    },
  });
}

function sparseMonthCommandV2(state: GameStateV2): ProcessMonthV2Command {
  if (state.gameplay.employment.status !== "employed") {
    throw new Error("sparse snapshot fixture requires active employment");
  }
  const grossIncomeCents = allocateMoney(
    state.gameplay.employment.annualGrossSalaryCents,
    1,
    12,
  );
  const allocations = planRecurringAllocations(
    state,
    grossIncomeCents,
    moneyCents(0),
  );
  const totalTaxCents = 200_000;
  const afterTaxCashIncomeCents = moneyCents(
    grossIncomeCents -
      allocations.preTax.employee401kCents -
      allocations.preTax.hsaCents -
      totalTaxCents,
  );
  const id = `cmd.sparse.month.${state.revision}`;
  return {
    schemaVersion: 2,
    id,
    type: "process_month_v2",
    expectedRevision: state.revision,
    effectiveMonth: state.currentMonth,
    payload: {
      taxEvidence: {
        schemaVersion: 1,
        traceId: `tax.${id}`,
        economicYear: Number(state.currentMonth.slice(0, 4)),
        policyYear: 2026,
        stateCode: "WA",
        filingStatus: "single",
        provider: "PolicyEngine US",
        bundleVersion: "4.21.0",
        rulesVersion: "1.764.6",
        projectedFromFrozenPolicy: !state.currentMonth.startsWith("2026-"),
        grossIncomeCents,
        employee401kContributionCents:
          allocations.preTax.employee401kCents,
        employeeHsaContributionCents: allocations.preTax.hsaCents,
        totalTaxCents,
        afterTaxCashIncomeCents,
      },
      taxableLiquidationCostRatePpm: ratePpm(10_000),
    },
  };
}

function preparedTimeAdvanceV2(
  state: GameStateV2,
  batchId: string,
  months = 2,
) {
  const basePayload = sparseMonthCommandV2(state).payload;
  const monthlyInputs = Array.from({ length: months }, (_, index) => {
    const commandId = `${batchId}.month.${index + 1}`;
    return {
      commandId,
      payload: {
        ...basePayload,
        taxEvidence: {
          ...basePayload.taxEvidence,
          traceId: `tax.${commandId}`,
        },
      },
    };
  });
  const controllerResult = advanceTimeV2(
    state,
    {
      schemaVersion: 2,
      id: batchId,
      type: "advance_time_v2",
      maxMonths: months,
      mode: { kind: "months", months },
      monthlyInputs,
    },
    {
      eventSchedulingPolicy: {
        version: "fairness-v1",
        minimumChancePpm: 0,
        maximumChancePpm: 0,
      },
      macroStoryPolicy: {
        version: "macro-story-v1",
        monthlyChancePpm: 0,
        minimumDurationMonths: 1,
        maximumDurationMonths: 1,
      },
    },
  );
  const request = Object.freeze({
    schemaVersion: 2 as const,
    id: batchId,
    expectedRevision: state.revision,
    effectiveMonth: state.currentMonth,
    maxMonths: months,
    mode: Object.freeze({ kind: "months" as const, months }),
  });
  return Object.freeze({
    controllerVersion: "time-controller-v2.0.0" as const,
    engineVersion: state.engineVersion,
    request,
    batchId,
    requestFingerprint: sha256Canonical(request),
    openingRevision: state.revision,
    openingStateChecksum: sha256Canonical(state),
    steps: controllerResult.steps,
    controllerResult,
    finalStateChecksum: sha256Canonical(controllerResult.state),
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
      financialKernelVersion: "2.0.0",
      resolvedCashFlows: [],
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
    "10000000-0000-4000-8000-000000000018",
    "10000000-0000-4000-8000-000000000019",
    "10000000-0000-4000-8000-000000000020",
    "10000000-0000-4000-8000-000000000021",
    "10000000-0000-4000-8000-000000000022",
    "10000000-0000-4000-8000-000000000023",
    "10000000-0000-4000-8000-000000000024",
    "10000000-0000-4000-8000-000000000025",
    "10000000-0000-4000-8000-000000000026",
    "10000000-0000-4000-8000-000000000027",
    "10000000-0000-4000-8000-000000000028",
    "10000000-0000-4000-8000-000000000029",
    "10000000-0000-4000-8000-000000000030",
    "10000000-0000-4000-8000-000000000031",
    "10000000-0000-4000-8000-000000000032",
    "10000000-0000-4000-8000-000000000033",
    "10000000-0000-4000-8000-000000000034",
    "10000000-0000-4000-8000-000000000035",
    "10000000-0000-4000-8000-000000000036",
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

  it("maintains one active save per account and prevents cross-account claims", async () => {
    const firstUserId = "20000000-0000-4000-8000-000000000001";
    const secondUserId = "20000000-0000-4000-8000-000000000002";
    await connection.db.execute(sql`
      insert into auth.users (id, aud, role, email, created_at, updated_at)
      values
        (${firstUserId}::uuid, 'authenticated', 'authenticated', 'owner-one@example.test', now(), now()),
        (${secondUserId}::uuid, 'authenticated', 'authenticated', 'owner-two@example.test', now(), now())
    `);

    const first = await repository.createRunV2(nativeStateV2, {
      ownerUserId: firstUserId,
    });
    const second = await repository.createRunV2(nativeStateV2, {
      ownerUserId: firstUserId,
    });
    expect(await repository.loadActiveOwnedRunId(firstUserId)).toBe(second.runId);
    await expect(
      repository.loadAuthorizedRunV2(
        second.runId,
        accountRunCredential(firstUserId),
      ),
    ).resolves.toMatchObject({ runId: second.runId });

    const legacy = await repository.createRunV2(nativeStateV2);
    await repository.claimRunV2(
      firstUserId,
      legacy.runId,
      legacy.accessSecret,
    );
    expect(await repository.loadActiveOwnedRunId(firstUserId)).toBe(legacy.runId);
    await expect(
      repository.claimRunV2(secondUserId, legacy.runId, legacy.accessSecret),
    ).rejects.toMatchObject({ code: "NOT_FOUND_OR_UNAUTHORIZED" });

    const rows = await connection.db
      .select({ id: gameRuns.id, saveStatus: gameRuns.saveStatus })
      .from(gameRuns)
      .where(eq(gameRuns.ownerUserId, firstUserId));
    expect(rows).toEqual(
      expect.arrayContaining([
        { id: first.runId, saveStatus: "archived" },
        { id: second.runId, saveStatus: "archived" },
        { id: legacy.runId, saveStatus: "active" },
      ]),
    );
    expect(await repository.listOwnedRunsV2(firstUserId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ runId: second.runId, saveStatus: "archived" }),
        expect.objectContaining({ runId: legacy.runId, saveStatus: "active" }),
      ]),
    );
    await repository.activateOwnedRunV2(firstUserId, second.runId);
    expect(await repository.loadActiveOwnedRunId(firstUserId)).toBe(second.runId);
    await expect(
      repository.activateOwnedRunV2(secondUserId, second.runId),
    ).rejects.toMatchObject({ code: "NOT_FOUND_OR_UNAUTHORIZED" });
    await connection.db.execute(sql`delete from auth.users where id in (${firstUserId}::uuid, ${secondUserId}::uuid)`);
  });

  it("previews through the repository and exact reducer without any database write", async () => {
    const created = await repository.createRunV2(nativeStateV2);
    const command: DetailedFinanceCommand = {
      schemaVersion: 2,
      id: "action.repository-preview",
      expectedRevision: created.state.revision,
      effectiveMonth: created.state.currentMonth,
      type: "take_detailed_action",
      payload: {
        actionPolicyVersion: ACTION_POLICY_V1_VERSION,
        action: {
          type: "invest_taxable",
          bucket: "taxableBroadIndexCents",
          amountCents: moneyCents(100_000),
        },
      },
    };
    const [acceptedBefore] = await connection.db
      .select({ value: count() })
      .from(acceptedCommands)
      .where(eq(acceptedCommands.runId, created.runId));
    const [ledgerBefore] = await connection.db
      .select({ value: count() })
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.runId, created.runId));
    const [stateSnapshotsBefore] = await connection.db
      .select({ value: count() })
      .from(runStateSnapshots)
      .where(eq(runStateSnapshots.runId, created.runId));
    const [scenarioSnapshotsBefore] = await connection.db
      .select({ value: count() })
      .from(runScenarioSnapshots)
      .where(eq(runScenarioSnapshots.runId, created.runId));
    const [monthlyRecordsBefore] = await connection.db
      .select({ value: count() })
      .from(monthlyTurnRecords)
      .where(eq(monthlyTurnRecords.runId, created.runId));
    const [outboxBefore] = await connection.db
      .select({ value: count() })
      .from(transactionalOutbox)
      .where(eq(transactionalOutbox.runId, created.runId));

    const preview = await repository.previewPlayerPolicyCommandV2(
      created.runId,
      created.accessSecret,
      command,
    );
    const unchanged = await repository.loadAuthorizedRunV2(
      created.runId,
      created.accessSecret,
    );
    const [acceptedAfterPreview] = await connection.db
      .select({ value: count() })
      .from(acceptedCommands)
      .where(eq(acceptedCommands.runId, created.runId));
    const [ledgerAfterPreview] = await connection.db
      .select({ value: count() })
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.runId, created.runId));
    const [stateSnapshotsAfterPreview] = await connection.db
      .select({ value: count() })
      .from(runStateSnapshots)
      .where(eq(runStateSnapshots.runId, created.runId));
    const [scenarioSnapshotsAfterPreview] = await connection.db
      .select({ value: count() })
      .from(runScenarioSnapshots)
      .where(eq(runScenarioSnapshots.runId, created.runId));
    const [monthlyRecordsAfterPreview] = await connection.db
      .select({ value: count() })
      .from(monthlyTurnRecords)
      .where(eq(monthlyTurnRecords.runId, created.runId));
    const [outboxAfterPreview] = await connection.db
      .select({ value: count() })
      .from(transactionalOutbox)
      .where(eq(transactionalOutbox.runId, created.runId));

    expect(sha256Canonical(unchanged)).toBe(preview.openingStateChecksum);
    expect(acceptedAfterPreview.value).toBe(acceptedBefore.value);
    expect(ledgerAfterPreview.value).toBe(ledgerBefore.value);
    expect(stateSnapshotsAfterPreview.value).toBe(stateSnapshotsBefore.value);
    expect(scenarioSnapshotsAfterPreview.value).toBe(scenarioSnapshotsBefore.value);
    expect(monthlyRecordsAfterPreview.value).toBe(monthlyRecordsBefore.value);
    expect(outboxAfterPreview.value).toBe(outboxBefore.value);

    const applied = await repository.applyCommandV2(
      created.runId,
      created.accessSecret,
      command,
    );
    expect(applied.stateChecksum).toBe(preview.resultingStateChecksum);
    expect(applied.state.revision).toBe(preview.resultingRevision);
  });

  it("persists and idempotently replays one atomic multi-month advance", async () => {
    const created = await repository.createRunV2(sparseStateV2);
    const prepared = preparedTimeAdvanceV2(created.state, "advance.repository.batch");

    const applied = await repository.applyTimeAdvanceV2(
      created.runId,
      created.accessSecret,
      prepared,
    );
    const replayed = await repository.applyTimeAdvanceV2(
      created.runId,
      created.accessSecret,
      prepared,
    );

    expect(applied.monthsAdvanced).toBe(2);
    expect(applied.state.revision).toBe(2);
    expect(applied.idempotentReplay).toBe(false);
    expect(replayed).toEqual({ ...applied, idempotentReplay: true });
    const [[commands], [evidence], [records], outbox] = await Promise.all([
      connection.db.select({ value: count() }).from(acceptedCommands).where(eq(acceptedCommands.runId, created.runId)),
      connection.db.select({ value: count() }).from(monthlyTaxEvidence).where(eq(monthlyTaxEvidence.runId, created.runId)),
      connection.db.select({ value: count() }).from(monthlyTurnRecords).where(eq(monthlyTurnRecords.runId, created.runId)),
      connection.db.select({ topic: transactionalOutbox.topic }).from(transactionalOutbox).where(eq(transactionalOutbox.runId, created.runId)),
    ]);
    expect(commands.value).toBe(2);
    expect(evidence.value).toBe(2);
    expect(records.value).toBe(2);
    expect(outbox.map(({ topic }) => topic).toSorted()).toEqual([
      "run.v2.time_advanced",
    ]);
  });

  it("rejects a conflicting aggregate id before writing monthly rows", async () => {
    const created = await repository.createRunV2(sparseStateV2);
    const prepared = preparedTimeAdvanceV2(created.state, "advance.repository.rollback");
    await connection.db.insert(transactionalOutbox).values({
      runId: created.runId,
      topic: "test.collision",
      idempotencyKey: `${created.runId}:v2:advance:${prepared.batchId}`,
      payload: { conflicting: true },
      status: "pending",
      availableAt: new Date("2026-07-14T12:00:00.000Z"),
      createdAt: new Date("2026-07-14T12:00:00.000Z"),
    });

    await expect(
      repository.applyTimeAdvanceV2(
        created.runId,
        created.accessSecret,
        prepared,
      ),
    ).rejects.toThrow();

    const [run] = await connection.db.select().from(gameRuns).where(eq(gameRuns.id, created.runId));
    const [commands] = await connection.db.select({ value: count() }).from(acceptedCommands).where(eq(acceptedCommands.runId, created.runId));
    expect(run?.currentRevision).toBe(0);
    expect(commands.value).toBe(0);
  });

  it("rolls back earlier monthly rows when a later prepared record mismatches replay", async () => {
    const created = await repository.createRunV2(sparseStateV2);
    const prepared = preparedTimeAdvanceV2(created.state, "advance.repository.tampered");
    const [first, second] = prepared.steps;
    if (!first || !second) throw new Error("expected two prepared monthly steps");
    const tamperedRecord = {
      ...second.record,
      totalTaxCents: moneyCents(second.record.totalTaxCents + 1),
    };
    const tamperedSteps = [
      first,
      { ...second, record: tamperedRecord },
    ] as const;
    const tampered = {
      ...prepared,
      steps: tamperedSteps,
      controllerResult: {
        ...prepared.controllerResult,
        steps: tamperedSteps,
        records: [first.record, tamperedRecord],
      },
    };

    await expect(
      repository.applyTimeAdvanceV2(
        created.runId,
        created.accessSecret,
        tampered,
      ),
    ).rejects.toMatchObject({ code: "PERSISTENCE_INVARIANT" });

    const [run] = await connection.db.select().from(gameRuns).where(eq(gameRuns.id, created.runId));
    const [commands] = await connection.db.select({ value: count() }).from(acceptedCommands).where(eq(acceptedCommands.runId, created.runId));
    const [records] = await connection.db.select({ value: count() }).from(monthlyTurnRecords).where(eq(monthlyTurnRecords.runId, created.runId));
    expect(run?.currentRevision).toBe(0);
    expect(commands.value).toBe(0);
    expect(records.value).toBe(0);
  });

  it("rejects an unversioned or non-canonical prepared batch envelope", async () => {
    const created = await repository.createRunV2(sparseStateV2);
    const prepared = preparedTimeAdvanceV2(created.state, "advance.repository.envelope");

    await expect(
      repository.applyTimeAdvanceV2(created.runId, created.accessSecret, {
        ...prepared,
        controllerVersion:
          "time-controller-v3.0.0" as typeof prepared.controllerVersion,
      }),
    ).rejects.toMatchObject({ code: "PERSISTENCE_INVARIANT" });
    await expect(
      repository.applyTimeAdvanceV2(created.runId, created.accessSecret, {
        ...prepared,
        engineVersion: "future-engine",
      }),
    ).rejects.toMatchObject({ code: "PERSISTENCE_INVARIANT" });
    await expect(
      repository.applyTimeAdvanceV2(created.runId, created.accessSecret, {
        ...prepared,
        request: {
          ...prepared.request,
          inventedModeAuthority: true,
        } as unknown as typeof prepared.request,
      }),
    ).rejects.toMatchObject({ code: "PERSISTENCE_INVARIANT" });

    const [run] = await connection.db.select().from(gameRuns).where(eq(gameRuns.id, created.runId));
    const [commands] = await connection.db.select({ value: count() }).from(acceptedCommands).where(eq(acceptedCommands.runId, created.runId));
    expect(run?.currentRevision).toBe(0);
    expect(commands.value).toBe(0);
  });

  it("rejects a corrupted stored controller version during idempotent replay", async () => {
    const created = await repository.createRunV2(sparseStateV2);
    const prepared = preparedTimeAdvanceV2(created.state, "advance.repository.corrupt-version");
    await repository.applyTimeAdvanceV2(
      created.runId,
      created.accessSecret,
      prepared,
    );
    const [row] = await connection.db
      .select({ id: transactionalOutbox.id, payload: transactionalOutbox.payload })
      .from(transactionalOutbox)
      .where(
        eq(
          transactionalOutbox.idempotencyKey,
          `${created.runId}:v2:advance:${prepared.batchId}`,
        ),
      );
    if (!row || !row.payload || typeof row.payload !== "object") {
      throw new Error("expected aggregate time-advance outbox payload");
    }
    await connection.db
      .update(transactionalOutbox)
      .set({
        payload: {
          ...row.payload,
          controllerVersion: "time-controller-v3.0.0",
        },
      })
      .where(eq(transactionalOutbox.id, row.id));

    await expect(
      repository.loadAcceptedTimeAdvanceV2(
        created.runId,
        created.accessSecret,
        prepared.batchId,
        prepared.requestFingerprint,
      ),
    ).rejects.toMatchObject({ code: "CORRUPT_STATE" });
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
    const persistedLedgerRows = await connection.db
      .select({
        transactionId: ledgerTransactions.transactionId,
        sourceSystem: ledgerTransactions.sourceSystem,
        category: ledgerTransactions.category,
        causalReferenceKind: ledgerTransactions.causalReferenceKind,
        causalReferenceId: ledgerTransactions.causalReferenceId,
      })
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.runId, created.runId))
      .orderBy(asc(ledgerTransactions.transactionIndex));
    const [outboxCount] = await connection.db
      .select({ value: count() })
      .from(transactionalOutbox)
      .where(eq(transactionalOutbox.runId, created.runId));
    expect(commandCount.value).toBe(1);
    expect(snapshotCount.value).toBe(2);
    expect(ledgerCount.value).toBe(2);
    expect(persistedLedgerRows).toEqual([
      {
        transactionId: "txn.opening",
        sourceSystem: "state_initialization",
        category: "equity.opening",
        causalReferenceKind: "system",
        causalReferenceId: "run.opening",
      },
      {
        transactionId: `txn.${command.id}`,
        sourceSystem: "command_reducer",
        category: "command.post_transaction",
        causalReferenceKind: "command",
        causalReferenceId: command.id,
      },
    ]);
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
        financialKernelVersion: "2.0.0",
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
    expect(outboxCount.value).toBe(0);

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

  it("replays an exact historical monthly command through the service and repository", async () => {
    const created = await repository.createRunV2(nativeStateV2);
    await repository.applyCommandV2(
      created.runId,
      created.accessSecret,
      strategyCommandV2(),
    );
    const currentCommand = monthCommandV2("cmd.repository-v2.legacy-month");
    const legacyCommand: ProcessMonthV2Command = {
      ...currentCommand,
      payload: {
        taxEvidence: currentCommand.payload.taxEvidence,
        taxableLiquidationCostRatePpm:
          currentCommand.payload.taxableLiquidationCostRatePpm,
      },
    };
    const processed = await repository.applyCommandV2(
      created.runId,
      created.accessSecret,
      legacyCommand,
    );
    const calculate = vi.fn<TaxCalculator["calculate"]>();
    const service = new RunApiServiceV2(repository, { calculate });

    const replayed = await service.submitCommand(
      created.runId,
      created.accessSecret,
      {
        schemaVersion: 2,
        id: legacyCommand.id,
        type: "process_month",
        expectedRevision: legacyCommand.expectedRevision,
        effectiveMonth: legacyCommand.effectiveMonth,
        payload: {},
      },
    );

    expect(replayed).toMatchObject({
      stateChecksum: processed.stateChecksum,
      idempotentReplay: true,
      monthlyRecord: { processedMonth: "2026-07", nextMonth: "2026-08" },
    });
    expect(calculate).not.toHaveBeenCalled();
    await expect(
      repository.loadAcceptedMonthlyCommandV2(
        created.runId,
        created.accessSecret,
        legacyCommand.id,
      ),
    ).resolves.toEqual(legacyCommand);
  });

  it("does not couple v2 state transitions to the dormant outbox", async () => {
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
    ).resolves.toMatchObject({ idempotentReplay: false });
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
    expect(loaded).toMatchObject({ revision: 2, currentMonth: "2026-08" });
    expect(evidenceCount.value).toBe(1);
    expect(recordCount.value).toBe(1);
    expect(commandCount.value).toBe(2);
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

  it("keeps ordinary pre-event months sparse", async () => {
    const created = await repository.createRunV2(sparseStateV2);
    let state = created.state;
    for (let month = 0; month < 10; month += 1) {
      state = (
        await repository.applyCommandV2(
          created.runId,
          created.accessSecret,
          sparseMonthCommandV2(state),
        )
      ).state;
      expect(state.gameplay.eventLifecycle.pending).toBeNull();
    }

    const firstRows = await connection.db
      .select({
        revision: runStateSnapshots.revision,
        snapshotKind: runStateSnapshots.snapshotKind,
      })
      .from(runStateSnapshots)
      .where(eq(runStateSnapshots.runId, created.runId))
      .orderBy(asc(runStateSnapshots.revision));
    expect(firstRows).toEqual([{ revision: 0, snapshotKind: "run_start" }]);

  });

  it("replays an unsnapshotted retry and checkpoint start revision", async () => {
    const created = await repository.createRunV2(sparseStateV2);
    const learning = {
      schemaVersion: 2 as const,
      id: "cmd.sparse.learning",
      type: "record_learning_interaction_v2" as const,
      expectedRevision: 0,
      effectiveMonth: simulationMonth("2026-01"),
      payload: { conceptId: "compound_interest", kind: "ai_explanation" as const },
    };
    const applied = await repository.applyCommandV2(
      created.runId,
      created.accessSecret,
      learning,
    );
    const replayed = await repository.applyCommandV2(
      created.runId,
      created.accessSecret,
      learning,
    );
    const snapshotRows = await connection.db
      .select({ revision: runStateSnapshots.revision })
      .from(runStateSnapshots)
      .where(eq(runStateSnapshots.runId, created.runId));
    expect(snapshotRows).toEqual([{ revision: 0 }]);
    expect(replayed).toEqual({ ...applied, idempotentReplay: true });

    const processed = await repository.applyCommandV2(
      created.runId,
      created.accessSecret,
      sparseMonthCommandV2(applied.state),
    );
    expect(
      await repository.loadCheckpointEvidenceV2(
        created.runId,
        created.accessSecret,
        1,
      ),
    ).toMatchObject({
      start: { month: "2026-01" },
      end: { month: "2026-02" },
      monthsProcessed: 1,
      monthlyCommandIds: [processed.monthlyRecord!.commandId],
    });
  });

  it("rejects replay checksum corruption at an unsnapshotted revision", async () => {
    const created = await repository.createRunV2(sparseStateV2);
    const command = {
      schemaVersion: 2 as const,
      id: "cmd.sparse.corrupt",
      type: "record_learning_interaction_v2" as const,
      expectedRevision: 0,
      effectiveMonth: simulationMonth("2026-01"),
      payload: { conceptId: "risk", kind: "decision_feedback" as const },
    };
    await repository.applyCommandV2(
      created.runId,
      created.accessSecret,
      command,
    );
    await connection.db
      .update(acceptedCommands)
      .set({ resultingStateChecksum: "0".repeat(64) })
      .where(eq(acceptedCommands.runId, created.runId));

    await expect(
      repository.applyCommandV2(
        created.runId,
        created.accessSecret,
        command,
      ),
    ).rejects.toMatchObject({ code: "CORRUPT_STATE" });
  });

  it("uses a migration target as the replay anchor", async () => {
    const created = await repository.createRun(initialState);
    const migrated = await repository.migrateRunStateToV2(
      created.runId,
      created.accessSecret,
    );
    const command = {
      schemaVersion: 2 as const,
      id: "cmd.sparse.migrated",
      type: "record_learning_interaction_v2" as const,
      expectedRevision: migrated.state.revision,
      effectiveMonth: migrated.state.currentMonth,
      payload: { conceptId: "migration", kind: "debrief" as const },
    };
    const applied = await repository.applyCommandV2(
      created.runId,
      created.accessSecret,
      command,
    );
    const replayed = await repository.applyCommandV2(
      created.runId,
      created.accessSecret,
      command,
    );

    expect(replayed).toEqual({ ...applied, idempotentReplay: true });
  });

  it("persists event, milestone, and terminal boundary snapshots", async () => {
    const template = getEventTemplate("personal.medical_bill");
    const eventRun = await repository.createRunV2((runId) =>
      queueScheduledPersonalEventV2(sparseStateV2(runId), {
        proposal: {
          eventId: "evt.sparse.medical",
          templateId: template.id,
          templateVersion: template.version,
          parameters: { gross_bill_cents: 1_000_000 },
        },
        template,
        targetedWeakness: "low_emergency_fund",
      }),
    );
    await repository.applyCommandV2(eventRun.runId, eventRun.accessSecret, {
      schemaVersion: 2,
      id: "cmd.sparse.event",
      type: "resolve_event_choice",
      expectedRevision: 0,
      effectiveMonth: simulationMonth("2026-01"),
      payload: { eventId: "evt.sparse.medical", choiceId: "use_insurance" },
    });
    const eventRows = await connection.db
      .select({
        revision: runStateSnapshots.revision,
        snapshotKind: runStateSnapshots.snapshotKind,
      })
      .from(runStateSnapshots)
      .where(eq(runStateSnapshots.runId, eventRun.runId))
      .orderBy(asc(runStateSnapshots.revision));
    expect(eventRows).toEqual([
      { revision: 0, snapshotKind: "before_event" },
      { revision: 1, snapshotKind: "after_event" },
    ]);

    const milestoneRun = await repository.createRunV2(sparseStateV2);
    await repository.applyCommandV2(
      milestoneRun.runId,
      milestoneRun.accessSecret,
      {
        schemaVersion: 2,
        id: "cmd.sparse.milestone",
        type: "manage_life_milestone",
        expectedRevision: 0,
        effectiveMonth: simulationMonth("2026-01"),
        payload: {
          action: "schedule",
          milestoneId: "milestone.sparse",
          kind: "travel",
          label: "Sparse replay trip",
          targetMonth: simulationMonth("2026-07"),
          estimatedCostCents: moneyCents(100_000),
        },
      },
    );
    const milestoneRows = await connection.db
      .select({
        revision: runStateSnapshots.revision,
        snapshotKind: runStateSnapshots.snapshotKind,
      })
      .from(runStateSnapshots)
      .where(eq(runStateSnapshots.runId, milestoneRun.runId))
      .orderBy(asc(runStateSnapshots.revision));
    expect(milestoneRows).toEqual([
      { revision: 0, snapshotKind: "before_milestone" },
      { revision: 1, snapshotKind: "after_milestone" },
    ]);

    const terminalRun = await repository.createRunV2((runId) =>
      sparseStateV2(runId, { terminalOnNextMonth: true }),
    );
    const terminal = await repository.applyCommandV2(
      terminalRun.runId,
      terminalRun.accessSecret,
      sparseMonthCommandV2(terminalRun.state),
    );
    const terminalRows = await connection.db
      .select({
        revision: runStateSnapshots.revision,
        snapshotKind: runStateSnapshots.snapshotKind,
      })
      .from(runStateSnapshots)
      .where(eq(runStateSnapshots.runId, terminalRun.runId))
      .orderBy(asc(runStateSnapshots.revision));
    expect(terminal.state.outcome).not.toBeNull();
    expect(terminalRows.at(-1)).toEqual({
      revision: 1,
      snapshotKind: "terminal",
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

  it("persists and reloads a confirmed onboarding state with opening ledger evidence", async () => {
    const onboarding = new OnboardingApiServiceV1(
      repository,
      () => "player.onboarding.postgres",
    );
    const draft = onboardingDraftForPersonaV1(
      "software",
      "postgres-onboarding-seed",
    );
    const review = onboarding.review(draft);
    const created = await onboarding.confirm({
      draft,
      reviewChecksum: review.reviewChecksum,
    });

    const loaded = await repository.loadAuthorizedRunV2(
      created.runId,
      created.accessSecret,
    );
    expect(sha256Canonical(loaded)).toBe(created.stateChecksum);
    expect(loaded.gameplay.initialization).toMatchObject({
      version: "onboarding-v1",
      reviewChecksum: review.reviewChecksum,
      initialRandomSeed: "postgres-onboarding-seed",
    });
    expect(loaded.gameplay.exposure).toEqual({ current: null, history: [] });
    const [openingRows] = await connection.db
      .select({ value: count() })
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.runId, created.runId));
    expect(openingRows.value).toBeGreaterThan(0);
  });

  it("continues a confirmed modern onboarding run identically after a PostgreSQL reload", async () => {
    const onboarding = new OnboardingApiServiceV1(
      repository,
      () => "player.onboarding.postgres-continuation",
    );
    const draft = onboardingDraftForPersonaV1(
      "software",
      "postgres-modern-continuation-seed",
    );
    const review = onboarding.review(draft);
    const created = await onboarding.confirm({
      draft,
      reviewChecksum: review.reviewChecksum,
    });
    const tax = successfulTaxCalculator();
    const initialApi = new RunApiServiceV2(
      repository,
      tax.calculator,
      () => "player.onboarding.postgres-continuation",
    );

    const first = await initialApi.submitCommand(
      created.runId,
      created.accessSecret,
      {
        schemaVersion: 2,
        id: "cmd.postgres-continuation.month.1",
        type: "process_month",
        expectedRevision: created.state.revision,
        effectiveMonth: created.state.currentMonth,
        payload: {},
      },
    );
    let midstream = first.state;
    const pending = midstream.gameplay.eventLifecycle.pending;
    if (pending) {
      const resolved = await initialApi.submitCommand(
        created.runId,
        created.accessSecret,
        {
          schemaVersion: 2,
          id: "cmd.postgres-continuation.event.1",
          type: "resolve_event_choice",
          expectedRevision: midstream.revision,
          effectiveMonth: midstream.currentMonth,
          payload: {
            eventId: pending.eventId,
            choiceId: pending.choiceIds[0]!,
          },
        },
      );
      midstream = resolved.state;
    }

    expect(midstream.gameplay.initialization).toMatchObject({
      version: "onboarding-v1",
      reviewChecksum: review.reviewChecksum,
    });
    expect(midstream.gameplay.runtimeBalance).toMatchObject({ version: 2 });
    expect(midstream.worldRandom).toMatchObject({
      version: "named-world-rng-v1",
    });

    const reloadedRepository = new RunRepository(
      connection.db,
      new RunSecretCodec(Buffer.alloc(32, 0x77)),
    );
    const reloadedMidstream = await reloadedRepository.loadAuthorizedRunV2(
      created.runId,
      created.accessSecret,
    );
    expect(reloadedMidstream).toEqual(midstream);
    expect(sha256Canonical(reloadedMidstream)).toBe(
      sha256Canonical(midstream),
    );

    const reloadedApi = new RunApiServiceV2(
      reloadedRepository,
      tax.calculator,
      () => "player.onboarding.postgres-continuation",
    );
    const nextPublicCommand = {
      schemaVersion: 2 as const,
      id: "cmd.postgres-continuation.month.2",
      type: "process_month" as const,
      expectedRevision: reloadedMidstream.revision,
      effectiveMonth: reloadedMidstream.currentMonth,
      payload: {},
    };
    const continued = await reloadedApi.submitCommand(
      created.runId,
      created.accessSecret,
      nextPublicCommand,
    );
    const accepted = await reloadedRepository.loadAcceptedMonthlyCommandV2(
      created.runId,
      created.accessSecret,
      nextPublicCommand.id,
    );
    expect(accepted).not.toBeNull();
    if (!accepted) throw new Error("expected persisted monthly command");

    expect(accepted.payload).toMatchObject({
      financialKernelVersion: FINANCIAL_KERNEL_V2_VERSION,
      outcomePolicyVersion: OUTCOME_POLICY_V1_VERSION,
      eventSchedulerVersion: DECLARATIVE_EVENT_SCHEDULER_V2_VERSION,
      runtimeBalanceControllerVersion: RUNTIME_BALANCE_CONTROLLER_V1_VERSION,
      scenarioDirectorVersion: SCENARIO_DIRECTOR_V2_VERSION,
      worldRandomVersion: WORLD_RANDOM_VERSION_V1,
      marketModelVersion: MACRO_MARKET_MODEL_V2_VERSION,
      macroDifficulty: reloadedMidstream.gameplay.runtimeBalance?.version === 2
        ? reloadedMidstream.gameplay.runtimeBalance.difficulty
        : "normal",
    });
    const expectedContinuation = reduceGameCommandV2(
      midstream,
      accepted,
    );
    const persistedFinal = await reloadedRepository.loadAuthorizedRunV2(
      created.runId,
      created.accessSecret,
    );
    const persistedReplay = await reloadedRepository.applyCommandV2(
      created.runId,
      created.accessSecret,
      accepted,
    );

    expect(persistedFinal).toEqual(expectedContinuation.state);
    expect(persistedFinal.worldRandom).toEqual(
      expectedContinuation.state.worldRandom,
    );
    expect(persistedFinal.ledger).toEqual(expectedContinuation.state.ledger);
    expect(persistedReplay.monthlyRecord).toEqual(
      expectedContinuation.monthlyRecord,
    );
    expect(persistedReplay).toMatchObject({
      idempotentReplay: true,
      state: expectedContinuation.state,
      stateChecksum: continued.stateChecksum,
    });
    expect(sha256Canonical(persistedFinal)).toBe(continued.stateChecksum);

    const expectedCommandLedger = expectedContinuation.state.ledger.transactions
      .filter(
        (transaction) =>
          transaction.causalReference?.kind === "command" &&
          transaction.causalReference.id === nextPublicCommand.id,
      )
      .map((transaction) => ({
        transactionId: transaction.id,
        sourceSystem: transaction.sourceSystem,
        category: transaction.category,
        causalReferenceKind: transaction.causalReference?.kind,
        causalReferenceId: transaction.causalReference?.id,
      }));
    const persistedCommandLedger = await connection.db
      .select({
        transactionId: ledgerTransactions.transactionId,
        sourceSystem: ledgerTransactions.sourceSystem,
        category: ledgerTransactions.category,
        causalReferenceKind: ledgerTransactions.causalReferenceKind,
        causalReferenceId: ledgerTransactions.causalReferenceId,
      })
      .from(ledgerTransactions)
      .where(
        and(
          eq(ledgerTransactions.runId, created.runId),
          eq(ledgerTransactions.commandId, nextPublicCommand.id),
        ),
      )
      .orderBy(asc(ledgerTransactions.transactionIndex));
    expect(persistedCommandLedger).toEqual(expectedCommandLedger);

    const expectedHistory = await repository.loadCausalHistoryV1(
      created.runId,
      created.accessSecret,
    );
    const persistedHistory = await new RunRepository(
      connection.db,
      new RunSecretCodec(Buffer.alloc(32, 0x77)),
    ).loadCausalHistoryV1(created.runId, created.accessSecret);
    expect(persistedHistory).toEqual(expectedHistory);
    expect(persistedHistory).toMatchObject({
      runId: created.runId,
      toRevision: persistedFinal.revision,
      sourceStateChecksum: continued.stateChecksum,
    });
    expect(tax.calculate).toHaveBeenCalledTimes(1);
  });
});
