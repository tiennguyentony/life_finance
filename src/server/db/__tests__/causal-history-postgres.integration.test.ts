import { randomUUID } from "node:crypto";

import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { sha256Canonical } from "../../../core/canonical";
import { moneyCents, ratePpm } from "../../../core/domain/money";
import { simulationMonth } from "../../../core/domain/month";
import { createNativeGameStateV2 } from "../../../core/native-game-state-v2";
import type { SetRecurringStrategyCommand } from "../../../core/recurring-strategy-v2";
import { resolveScenarioCatalogSelection } from "../../../core/scenario-catalog";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../../data/scenario-catalog";
import { RunSecretCodec } from "../../auth/run-secret";
import { createDatabaseConnection, type DatabaseConnection } from "../client";
import { migrateDatabase } from "../migrate";
import { RunRepository } from "../run-repository";
import {
  acceptedCommands,
  gameRuns,
  ledgerTransactions,
  monthlyTurnRecords,
  runStateSnapshots,
  transactionalOutbox,
} from "../schema";

const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;

function nativeState(createdRunId: string) {
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
    runId: createdRunId,
    playerId: "player.causal.postgres",
    birthMonth: simulationMonth("1990-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "causal-postgres",
    resolvedScenario,
    annualGrossSalaryCents: moneyCents(12_000_000),
    finances: {
      cashCents: moneyCents(2_000_000),
      taxableBroadIndexCents: moneyCents(0),
      taxableSectorCents: moneyCents(0),
      taxableSpeculativeCents: moneyCents(0),
      retirement401kCents: moneyCents(0),
      retirementIraCents: moneyCents(0),
      hsaCents: moneyCents(0),
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

databaseDescribe("causal history PostgreSQL save/load integration", () => {
  let connection: DatabaseConnection;
  let repository: RunRepository;

  beforeAll(async () => {
    connection = createDatabaseConnection(databaseUrl!);
    await migrateDatabase(connection.db);
    repository = new RunRepository(
      connection.db,
      new RunSecretCodec(Buffer.alloc(32, 0x31)),
      { runIdFactory: randomUUID },
    );
  });

  afterAll(async () => {
    await connection?.close();
  });

  it("re-derives the same history and leaves every authoritative row count and current state unchanged", async () => {
    const created = await repository.createRunV2(nativeState);
    const command: SetRecurringStrategyCommand = {
      schemaVersion: 2,
      id: "cmd.causal.postgres.strategy",
      type: "set_recurring_strategy",
      expectedRevision: 0,
      effectiveMonth: created.state.currentMonth,
      payload: {
        strategy: {
          emergencyFundTargetMonthsPpm: ratePpm(0),
          insuranceCoverageIds: ["insurance.renters"],
          preTax401kSalaryRatePpm: ratePpm(0),
          preTaxHsaSalaryRatePpm: ratePpm(0),
          afterTaxBroadIndexRatePpm: ratePpm(100_000),
          afterTaxSectorRatePpm: ratePpm(0),
          afterTaxSpeculativeRatePpm: ratePpm(0),
          afterTaxIraRatePpm: ratePpm(0),
          afterTaxExtraDebtRatePpm: ratePpm(0),
        },
      },
    };
    await repository.applyCommandV2(created.runId, created.accessSecret, command);
    const currentBefore = await repository.loadAuthorizedRunV2(
      created.runId,
      created.accessSecret,
    );
    const countsBefore = await rowCounts(connection, created.runId);

    const first = await repository.loadCausalHistoryV1(
      created.runId,
      created.accessSecret,
      { fromRevision: 0, toRevision: 1 },
    );
    const second = await repository.loadCausalHistoryV1(
      created.runId,
      created.accessSecret,
      { fromRevision: 0, toRevision: 1 },
    );
    const counterfactual = await repository.runCounterfactualV1(
      created.runId,
      created.accessSecret,
      {
        version: "counterfactual-v1",
        sourceCommandId: command.id,
        intervention: {
          kind: "recurring_strategy_field",
          commandId: command.id,
          field: "afterTaxBroadIndexRatePpm",
          value: 0,
        },
        horizonMonths: 1,
      },
    );

    expect(second.historyChecksum).toBe(first.historyChecksum);
    expect(second.nodes.flatMap(({ sourceEvidenceIds }) => sourceEvidenceIds)).toContain(
      `command:${command.id}`,
    );
    expect(counterfactual.stopReason).toBe("actual_history_exhausted");
    expect(await rowCounts(connection, created.runId)).toEqual(countsBefore);
    expect(
      sha256Canonical(
        await repository.loadAuthorizedRunV2(created.runId, created.accessSecret),
      ),
    ).toBe(sha256Canonical(currentBefore));
  });
});

async function rowCounts(connection: DatabaseConnection, targetRunId: string) {
  const results = await Promise.all([
    connection.db.select({ value: count() }).from(gameRuns).where(eq(gameRuns.id, targetRunId)),
    connection.db.select({ value: count() }).from(acceptedCommands).where(eq(acceptedCommands.runId, targetRunId)),
    connection.db.select({ value: count() }).from(ledgerTransactions).where(eq(ledgerTransactions.runId, targetRunId)),
    connection.db.select({ value: count() }).from(monthlyTurnRecords).where(eq(monthlyTurnRecords.runId, targetRunId)),
    connection.db.select({ value: count() }).from(runStateSnapshots).where(eq(runStateSnapshots.runId, targetRunId)),
    connection.db.select({ value: count() }).from(transactionalOutbox).where(eq(transactionalOutbox.runId, targetRunId)),
  ]);
  return results.map(([row]) => row?.value ?? 0);
}
