import { randomUUID } from "node:crypto";

import { and, asc, eq, gt, lte } from "drizzle-orm";

import { canonicalJson, sha256Canonical } from "../../core/canonical";
import {
  buildPlayerPolicyCommandPreviewV2,
  type PlayerPolicyCommandV2,
} from "../../core/action-preview-v2";
import type { CheckpointEvidenceV2 } from "../../core/checkpoint-v2";
import {
  reduceGameCommand,
  type GameCommand,
} from "../../core/commands";
import {
  assertValidGameState,
  type GameState,
} from "../../core/game-state";
import {
  assertValidGameStateV2,
  migrateGameStateV1ToV2,
  V1_TO_V2_MIGRATION_VERSION,
  type GameStateV2,
} from "../../core/game-state-v2";
import type { MonthlyTurnV2Record } from "../../core/monthly-turn-v2";
import {
  TIME_CONTROLLER_V2_VERSION,
  type TimeControllerV2Result,
} from "../../core/time-controller-v2";
import type { MonthlyTaxEvidence } from "../../core/payroll-v2";
import { RunSecretCodec, type RunCredential } from "../auth/run-secret";
import type { LifeFinanceDatabase } from "./client";
import {
  loadAuthorizedRun,
  loadAuthorizedRunV2,
  loadAcceptedCommandV2,
  loadAcceptedMonthlyCommandV2,
  loadCheckpointEvidenceV2,
  loadMonthlyTaxEvidenceForCommand,
  loadMonthlyTaxEvidenceForContext,
} from "./run-repository-read";
import { loadRunStateAtRevisionV2 } from "./run-state-replay-v2";
import { decodePersistedGameCommandV2 } from "./persisted-command-v2";
import {
  RUN_STATE_SNAPSHOT_KIND_PRIORITY,
  snapshotRequestsForAcceptedCommandV2,
  type SnapshotRequestV2,
} from "./snapshot-policy-v2";
import {
  acceptedCommands,
  gameRuns,
  ledgerPostings,
  ledgerTransactions,
  monthlyTaxEvidence,
  monthlyTurnRecords,
  runScenarioSnapshots,
  runStateMigrations,
  runStateSnapshots,
  transactionalOutbox,
} from "./schema";

import {
  type AppliedCommand,
  type AppliedCommandV2,
  type AppliedTimeAdvanceV2,
  type CreatedRun,
  type CreatedRunV2,
  type GameCommandV2,
  type MigratedRun,
  type PreparedTimeAdvanceV2,
  type TimeAdvanceRequestV2,
  RunRepositoryError,
} from "./run-repository-contracts";
import {
  assertPersistedState,
  assertScenarioSnapshotRecord,
  assertUuid,
  flattenLedger,
  isAuthorized,
  newLedgerTransactions,
  reduceGameCommandV2,
  requireV1State,
  requireV2State,
  samePersistedCommand,
} from "./run-repository-support";

type SparseSnapshotWriter = Pick<
  LifeFinanceDatabase,
  "insert" | "select" | "update"
>;

async function persistSparseSnapshotsV2(
  db: SparseSnapshotWriter,
  runId: string,
  requests: readonly SnapshotRequestV2<GameStateV2>[],
  createdAt: Date,
): Promise<void> {
  for (const request of requests) {
    const stateChecksum = sha256Canonical(request.state);
    const [existing] = await db
      .select({
        stateChecksum: runStateSnapshots.stateChecksum,
        snapshotKind: runStateSnapshots.snapshotKind,
      })
      .from(runStateSnapshots)
      .where(
        and(
          eq(runStateSnapshots.runId, runId),
          eq(runStateSnapshots.revision, request.state.revision),
        ),
      )
      .limit(1);
    if (existing) {
      if (
        existing.stateChecksum === stateChecksum &&
        RUN_STATE_SNAPSHOT_KIND_PRIORITY[request.snapshotKind] >
          RUN_STATE_SNAPSHOT_KIND_PRIORITY[existing.snapshotKind]
      ) {
        await db
          .update(runStateSnapshots)
          .set({
            snapshotKind: request.snapshotKind,
            causalCommandId: request.causalCommandId,
          })
          .where(
            and(
              eq(runStateSnapshots.runId, runId),
              eq(runStateSnapshots.revision, request.state.revision),
              eq(runStateSnapshots.stateChecksum, stateChecksum),
            ),
          );
      }
      continue;
    }
    await db
      .insert(runStateSnapshots)
      .values({
        runId,
        revision: request.state.revision,
        stateSchemaVersion: request.state.schemaVersion,
        engineVersion: request.state.engineVersion,
        state: request.state,
        stateChecksum,
        snapshotKind: request.snapshotKind,
        causalCommandId: request.causalCommandId,
        createdAt,
      })
      .onConflictDoNothing();
  }
}

type PersistedTimeAdvanceResultV2 = Omit<
  TimeControllerV2Result,
  "state" | "steps" | "records"
>;

type TimeAdvanceOutboxPayloadV2 = Readonly<{
  kind: "time_advance_v2";
  controllerVersion: typeof TIME_CONTROLLER_V2_VERSION;
  engineVersion: string;
  request: TimeAdvanceRequestV2;
  batchId: string;
  requestFingerprint: string;
  openingRevision: number;
  finalRevision: number;
  finalStateChecksum: string;
  result: PersistedTimeAdvanceResultV2;
}>;

type TimeAdvanceReader = Pick<LifeFinanceDatabase, "select">;

function exactObjectKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  return (
    Object.keys(value).length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  );
}

function isTimeAdvanceRequestV2(value: unknown): value is TimeAdvanceRequestV2 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  const expectedKeys = request.checkpointIntervalMonths === undefined
    ? ["schemaVersion", "id", "expectedRevision", "effectiveMonth", "maxMonths", "mode"]
    : [
        "schemaVersion",
        "id",
        "expectedRevision",
        "effectiveMonth",
        "maxMonths",
        "mode",
        "checkpointIntervalMonths",
      ];
  if (
    !exactObjectKeys(request, expectedKeys) ||
    request.schemaVersion !== 2 ||
    typeof request.id !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,95}$/.test(request.id) ||
    !Number.isSafeInteger(request.expectedRevision) ||
    Number(request.expectedRevision) < 0 ||
    typeof request.effectiveMonth !== "string" ||
    !/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(request.effectiveMonth) ||
    !Number.isSafeInteger(request.maxMonths) ||
    Number(request.maxMonths) < 1 ||
    Number(request.maxMonths) > 480 ||
    (request.checkpointIntervalMonths !== undefined &&
      (!Number.isSafeInteger(request.checkpointIntervalMonths) ||
        Number(request.checkpointIntervalMonths) < 1 ||
        Number(request.checkpointIntervalMonths) > 12)) ||
    !request.mode ||
    typeof request.mode !== "object" ||
    Array.isArray(request.mode)
  ) {
    return false;
  }
  const mode = request.mode as Record<string, unknown>;
  switch (mode.kind) {
    case "one_month":
    case "until_event":
    case "until_decision":
    case "until_end":
    case "stop":
      return exactObjectKeys(mode, ["kind"]);
    case "months":
      return (
        exactObjectKeys(mode, ["kind", "months"]) &&
        Number.isSafeInteger(mode.months) &&
        Number(mode.months) >= 1 &&
        Number(mode.months) <= Number(request.maxMonths)
      );
    case "until_checkpoint":
      return (
        exactObjectKeys(mode, ["kind", "intervalMonths"]) &&
        Number.isSafeInteger(mode.intervalMonths) &&
        Number(mode.intervalMonths) >= 1 &&
        Number(mode.intervalMonths) <= 12 &&
        (request.checkpointIntervalMonths === undefined ||
          request.checkpointIntervalMonths === mode.intervalMonths)
      );
    case "resume":
      return (
        exactObjectKeys(mode, ["kind", "resolvedDecisionId", "months"]) &&
        typeof mode.resolvedDecisionId === "string" &&
        /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,95}$/.test(
          mode.resolvedDecisionId,
        ) &&
        Number.isSafeInteger(mode.months) &&
        Number(mode.months) >= 1 &&
        Number(mode.months) <= Number(request.maxMonths)
      );
    default:
      return false;
  }
}

function requireTimeAdvancePayloadV2(value: unknown): TimeAdvanceOutboxPayloadV2 {
  if (
    !value ||
    typeof value !== "object" ||
    (value as { kind?: unknown }).kind !== "time_advance_v2" ||
    (value as { controllerVersion?: unknown }).controllerVersion !==
      TIME_CONTROLLER_V2_VERSION ||
    typeof (value as { engineVersion?: unknown }).engineVersion !== "string" ||
    !isTimeAdvanceRequestV2((value as { request?: unknown }).request) ||
    typeof (value as { batchId?: unknown }).batchId !== "string" ||
    typeof (value as { requestFingerprint?: unknown }).requestFingerprint !==
      "string" ||
    !Number.isSafeInteger((value as { openingRevision?: unknown }).openingRevision) ||
    !Number.isSafeInteger((value as { finalRevision?: unknown }).finalRevision) ||
    typeof (value as { finalStateChecksum?: unknown }).finalStateChecksum !==
      "string" ||
    !(value as { result?: unknown }).result ||
    typeof (value as { result?: unknown }).result !== "object"
  ) {
    throw new RunRepositoryError(
      "CORRUPT_STATE",
      "time advance outbox payload is invalid",
    );
  }
  const payload = value as TimeAdvanceOutboxPayloadV2;
  if (
    payload.engineVersion.length === 0 ||
    payload.request.id !== payload.batchId ||
    payload.request.expectedRevision !== payload.openingRevision ||
    sha256Canonical(payload.request) !== payload.requestFingerprint ||
    payload.finalRevision - payload.openingRevision !==
      payload.result.monthsAdvanced
  ) {
    throw new RunRepositoryError(
      "CORRUPT_STATE",
      "time advance outbox request evidence is inconsistent",
    );
  }
  return payload;
}

async function replayAppliedTimeAdvanceV2(
  db: TimeAdvanceReader,
  runId: string,
  payload: TimeAdvanceOutboxPayloadV2,
): Promise<AppliedTimeAdvanceV2> {
  const replayed = await loadRunStateAtRevisionV2(
    db,
    runId,
    payload.finalRevision,
    payload.engineVersion,
  );
  if (replayed.stateChecksum !== payload.finalStateChecksum) {
    throw new RunRepositoryError(
      "CORRUPT_STATE",
      "time advance final replay checksum does not match its outbox payload",
    );
  }
  const [commandRows, recordRows] = await Promise.all([
    db
      .select()
      .from(acceptedCommands)
      .where(
        and(
          eq(acceptedCommands.runId, runId),
          gt(acceptedCommands.resultingRevision, payload.openingRevision),
          lte(acceptedCommands.resultingRevision, payload.finalRevision),
        ),
      )
      .orderBy(asc(acceptedCommands.resultingRevision)),
    db
      .select()
      .from(monthlyTurnRecords)
      .where(
        and(
          eq(monthlyTurnRecords.runId, runId),
          gt(monthlyTurnRecords.resultingRevision, payload.openingRevision),
          lte(monthlyTurnRecords.resultingRevision, payload.finalRevision),
        ),
      )
      .orderBy(asc(monthlyTurnRecords.resultingRevision)),
  ]);
  const expectedMonths = payload.finalRevision - payload.openingRevision;
  if (
    commandRows.length !== expectedMonths ||
    recordRows.length !== expectedMonths ||
    payload.result.monthsAdvanced !== expectedMonths
  ) {
    throw new RunRepositoryError(
      "CORRUPT_STATE",
      "time advance replay rows do not match its recorded month count",
    );
  }
  const recordByCommand = new Map(recordRows.map((row) => [row.commandId, row]));
  const steps = commandRows.map((row) => {
    const command = decodePersistedGameCommandV2({
      schemaVersion: row.commandSchemaVersion,
      id: row.commandId,
      type: row.commandType,
      expectedRevision: row.expectedRevision,
      effectiveMonth: row.effectiveMonth,
      payload: row.payload,
    });
    const recordRow = recordByCommand.get(command.id);
    if (
      command.type !== "process_month_v2" ||
      !recordRow ||
      recordRow.resultingRevision !== row.resultingRevision ||
      sha256Canonical(recordRow.record) !== recordRow.recordChecksum
    ) {
      throw new RunRepositoryError(
        "CORRUPT_STATE",
        "time advance replay is missing a consistent monthly record",
      );
    }
    return Object.freeze({
      command,
      record: recordRow.record,
      resultingMonth: recordRow.record.nextMonth,
      resultingRevision: row.resultingRevision,
    });
  });
  return Object.freeze({
    ...payload.result,
    state: replayed.state,
    stateChecksum: replayed.stateChecksum,
    steps: Object.freeze(steps),
    records: Object.freeze(steps.map(({ record }) => record)),
    idempotentReplay: true,
  });
}

export {
  RunRepositoryError,
  type AppliedCommand,
  type AppliedCommandV2,
  type AppliedTimeAdvanceV2,
  type CreatedRun,
  type CreatedRunV2,
  type GameCommandV2,
  type MigratedRun,
  type PreparedTimeAdvanceV2,
} from "./run-repository-contracts";

export class RunRepository {
  readonly #db: LifeFinanceDatabase;
  readonly #secretCodec: RunSecretCodec;
  readonly #runIdFactory: () => string;
  readonly #clock: () => Date;

  constructor(
    db: LifeFinanceDatabase,
    secretCodec: RunSecretCodec,
    dependencies: Readonly<{
      runIdFactory?: () => string;
      clock?: () => Date;
    }> = {},
  ) {
    this.#db = db;
    this.#secretCodec = secretCodec;
    this.#runIdFactory = dependencies.runIdFactory ?? randomUUID;
    this.#clock = dependencies.clock ?? (() => new Date());
  }

  async createRun(
    initialStateFactory: (runId: string) => GameState,
  ): Promise<CreatedRun> {
    const runId = this.#runIdFactory();
    assertUuid(runId);
    const state = initialStateFactory(runId);
    assertValidGameState(state);
    if (state.runId !== runId || state.revision !== 0) {
      throw new RunRepositoryError(
        "PERSISTENCE_INVARIANT",
        "initial state must use the generated run id at revision zero",
      );
    }
    const credential: RunCredential = this.#secretCodec.create();
    const checksum = sha256Canonical(state);
    const ledgerRows = flattenLedger(runId, state.ledger.transactions, 0);
    const now = this.#clock();

    await this.#db.transaction(async (tx) => {
      await tx.insert(gameRuns).values({
        id: runId,
        accessSecretHash: credential.secretHash,
        accessSecretHashVersion: credential.secretHashVersion,
        stateSchemaVersion: state.schemaVersion,
        engineVersion: state.engineVersion,
        currentRevision: state.revision,
        currentMonth: state.currentMonth,
        status: state.outcome ? "terminal" : "active",
        currentState: state,
        currentStateChecksum: checksum,
        terminalAt: state.outcome ? now : null,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(runStateSnapshots).values({
        runId,
        revision: 0,
        stateSchemaVersion: state.schemaVersion,
        engineVersion: state.engineVersion,
        state,
        stateChecksum: checksum,
        snapshotKind: "run_start",
        causalCommandId: null,
        createdAt: now,
      });
      if (ledgerRows.transactions.length > 0) {
        await tx.insert(ledgerTransactions).values(ledgerRows.transactions);
        await tx.insert(ledgerPostings).values(ledgerRows.postings);
      }
      await tx.insert(transactionalOutbox).values({
        runId,
        topic: "run.created",
        idempotencyKey: `${runId}:created`,
        payload: { runId, revision: 0, stateChecksum: checksum },
        status: "pending",
        availableAt: now,
        createdAt: now,
      });
    });

    return Object.freeze({
      runId,
      accessSecret: credential.secret,
      state,
      stateChecksum: checksum,
    });
  }

  async createRunV2(
    initialStateFactory: (runId: string) => GameStateV2,
  ): Promise<CreatedRunV2> {
    const runId = this.#runIdFactory();
    assertUuid(runId);
    const state = initialStateFactory(runId);
    assertValidGameStateV2(state);
    const catalogSnapshot = state.gameplay.catalogSnapshot;
    const catalogChecksum = state.gameplay.catalogSnapshotChecksum;
    if (
      state.runId !== runId ||
      state.revision !== 0 ||
      state.migration !== null ||
      catalogSnapshot === null ||
      catalogChecksum === null ||
      sha256Canonical(catalogSnapshot) !== catalogChecksum
    ) {
      throw new RunRepositoryError(
        "PERSISTENCE_INVARIANT",
        "native v2 state must use the generated run id, revision zero, and a valid catalog snapshot",
      );
    }
    const credential: RunCredential = this.#secretCodec.create();
    const checksum = sha256Canonical(state);
    const ledgerRows = flattenLedger(runId, state.ledger.transactions, 0);
    const now = this.#clock();

    await this.#db.transaction(async (tx) => {
      await tx.insert(gameRuns).values({
        id: runId,
        accessSecretHash: credential.secretHash,
        accessSecretHashVersion: credential.secretHashVersion,
        stateSchemaVersion: state.schemaVersion,
        engineVersion: state.engineVersion,
        currentRevision: state.revision,
        currentMonth: state.currentMonth,
        status: state.outcome ? "terminal" : "active",
        currentState: state,
        currentStateChecksum: checksum,
        terminalAt: state.outcome ? now : null,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(runStateSnapshots).values({
        runId,
        revision: 0,
        stateSchemaVersion: state.schemaVersion,
        engineVersion: state.engineVersion,
        state,
        stateChecksum: checksum,
        snapshotKind: "run_start",
        causalCommandId: null,
        createdAt: now,
      });
      await tx.insert(runScenarioSnapshots).values({
        runId,
        catalogVersion: catalogSnapshot.catalog.version,
        snapshotChecksum: catalogChecksum,
        snapshot: catalogSnapshot,
        createdAt: now,
      });
      if (ledgerRows.transactions.length > 0) {
        await tx.insert(ledgerTransactions).values(ledgerRows.transactions);
        await tx.insert(ledgerPostings).values(ledgerRows.postings);
      }
      await tx.insert(transactionalOutbox).values({
        runId,
        topic: "run.v2.created",
        idempotencyKey: `${runId}:v2:created`,
        payload: {
          runId,
          revision: 0,
          stateChecksum: checksum,
          catalogVersion: catalogSnapshot.catalog.version,
          catalogSnapshotChecksum: catalogChecksum,
        },
        status: "pending",
        availableAt: now,
        createdAt: now,
      });
    });

    return Object.freeze({
      runId,
      accessSecret: credential.secret,
      state,
      stateChecksum: checksum,
    });
  }

  async loadAuthorizedRun(
    runId: string,
    accessSecret: string,
  ): Promise<GameState> {
    return loadAuthorizedRun(this.#db, this.#secretCodec, runId, accessSecret);
  }

  async loadAuthorizedRunV2(
    runId: string,
    accessSecret: string,
  ): Promise<GameStateV2> {
    return loadAuthorizedRunV2(this.#db, this.#secretCodec, runId, accessSecret);
  }

  async loadCheckpointEvidenceV2(
    runId: string,
    accessSecret: string,
    fromRevision: number,
  ): Promise<CheckpointEvidenceV2> {
    return loadCheckpointEvidenceV2(
      this.#db,
      this.#secretCodec,
      runId,
      accessSecret,
      fromRevision,
    );
  }

  async loadAcceptedMonthlyCommandV2(
    runId: string,
    accessSecret: string,
    commandId: string,
  ) {
    return loadAcceptedMonthlyCommandV2(
      this.#db,
      this.#secretCodec,
      runId,
      accessSecret,
      commandId,
    );
  }

  async loadAcceptedCommandV2(
    runId: string,
    accessSecret: string,
    commandId: string,
  ) {
    return loadAcceptedCommandV2(
      this.#db,
      this.#secretCodec,
      runId,
      accessSecret,
      commandId,
    );
  }

  async previewPlayerPolicyCommandV2(
    runId: string,
    accessSecret: string,
    command: PlayerPolicyCommandV2,
  ) {
    const state = await this.loadAuthorizedRunV2(runId, accessSecret);
    const resulting = reduceGameCommandV2(state, command).state;
    return buildPlayerPolicyCommandPreviewV2(state, command, resulting);
  }

  async loadMonthlyTaxEvidenceForCommand(
    runId: string,
    accessSecret: string,
    commandId: string,
  ): Promise<MonthlyTaxEvidence | null> {
    return loadMonthlyTaxEvidenceForCommand(
      this.#db,
      this.#secretCodec,
      runId,
      accessSecret,
      commandId,
    );
  }

  async loadMonthlyTaxEvidenceForContext(
    runId: string,
    accessSecret: string,
    contextFingerprint: string,
  ): Promise<MonthlyTaxEvidence | null> {
    return loadMonthlyTaxEvidenceForContext(
      this.#db,
      this.#secretCodec,
      runId,
      accessSecret,
      contextFingerprint,
    );
  }

  async loadAcceptedTimeAdvanceV2(
    runId: string,
    accessSecret: string,
    batchId: string,
    requestFingerprint: string,
  ): Promise<AppliedTimeAdvanceV2 | null> {
    assertUuid(runId);
    await loadAuthorizedRunV2(
      this.#db,
      this.#secretCodec,
      runId,
      accessSecret,
    );
    const [row] = await this.#db
      .select({ payload: transactionalOutbox.payload })
      .from(transactionalOutbox)
      .where(
        eq(
          transactionalOutbox.idempotencyKey,
          `${runId}:v2:advance:${batchId}`,
        ),
      )
      .limit(1);
    if (!row) return null;
    const payload = requireTimeAdvancePayloadV2(row.payload);
    if (
      payload.batchId !== batchId ||
      payload.requestFingerprint !== requestFingerprint
    ) {
      throw new RunRepositoryError(
        "IDEMPOTENCY_MISMATCH",
        "time advance id was already used with different request content",
      );
    }
    return replayAppliedTimeAdvanceV2(
      this.#db,
      runId,
      payload,
    );
  }

  async applyCommand(
    runId: string,
    accessSecret: string,
    command: GameCommand,
  ): Promise<AppliedCommand> {
    assertUuid(runId);
    return this.#db.transaction(async (tx) => {
      const [run] = await tx
        .select()
        .from(gameRuns)
        .where(eq(gameRuns.id, runId))
        .for("update")
        .limit(1);
      if (
        !run ||
        !isAuthorized(
          this.#secretCodec,
          accessSecret,
          run.accessSecretHash,
          run.accessSecretHashVersion,
        )
      ) {
        throw new RunRepositoryError(
          "NOT_FOUND_OR_UNAUTHORIZED",
          "run was not found or the credential is invalid",
        );
      }
      const currentState = requireV1State(
        assertPersistedState(run.currentState, {
          runId,
          checksum: run.currentStateChecksum,
          schemaVersion: run.stateSchemaVersion,
          engineVersion: run.engineVersion,
          revision: run.currentRevision,
          currentMonth: run.currentMonth,
        }),
      );

      const [existing] = await tx
        .select()
        .from(acceptedCommands)
        .where(
          and(
            eq(acceptedCommands.runId, runId),
            eq(acceptedCommands.commandId, command.id),
          ),
        )
        .limit(1);
      if (existing) {
        if (!samePersistedCommand(existing, command)) {
          throw new RunRepositoryError(
            "IDEMPOTENCY_MISMATCH",
            "command id was already used with different command content",
          );
        }
        const [snapshot] = await tx
          .select()
          .from(runStateSnapshots)
          .where(
            and(
              eq(runStateSnapshots.runId, runId),
              eq(runStateSnapshots.revision, existing.resultingRevision),
            ),
          )
          .limit(1);
        if (!snapshot) {
          throw new RunRepositoryError(
            "CORRUPT_STATE",
            "idempotent command is missing its immutable snapshot",
          );
        }
        const snapshotState = requireV1State(
          assertPersistedState(snapshot.state, {
            runId,
            checksum: snapshot.stateChecksum,
            schemaVersion: snapshot.stateSchemaVersion,
            engineVersion: snapshot.engineVersion,
            revision: snapshot.revision,
          }),
        );
        return Object.freeze({
          state: snapshotState,
          stateChecksum: snapshot.stateChecksum,
          idempotentReplay: true,
        });
      }

      if (run.currentRevision !== command.expectedRevision) {
        throw new RunRepositoryError(
          "OPTIMISTIC_CONFLICT",
          `expected revision ${command.expectedRevision}, current revision is ${run.currentRevision}`,
        );
      }
      const nextState = reduceGameCommand(currentState, command);
      const checksum = sha256Canonical(nextState);
      const previousTransactionCount = currentState.ledger.transactions.length;
      const newTransactions = newLedgerTransactions(currentState, nextState);
      const ledgerRows = flattenLedger(
        runId,
        newTransactions,
        previousTransactionCount,
      );
      const now = this.#clock();

      await tx.insert(runStateSnapshots).values({
        runId,
        revision: nextState.revision,
        stateSchemaVersion: nextState.schemaVersion,
        engineVersion: nextState.engineVersion,
        state: nextState,
        stateChecksum: checksum,
        snapshotKind: "legacy_command_result",
        causalCommandId: command.id,
        createdAt: now,
      });
      await tx.insert(acceptedCommands).values({
        runId,
        commandId: command.id,
        commandSchemaVersion: command.schemaVersion,
        commandType: command.type,
        expectedRevision: command.expectedRevision,
        resultingRevision: nextState.revision,
        effectiveMonth: command.effectiveMonth,
        payload: command.payload,
        resultingStateChecksum: checksum,
        createdAt: now,
      });
      if (ledgerRows.transactions.length > 0) {
        await tx.insert(ledgerTransactions).values(ledgerRows.transactions);
        await tx.insert(ledgerPostings).values(ledgerRows.postings);
      }
      const [updated] = await tx
        .update(gameRuns)
        .set({
          stateSchemaVersion: nextState.schemaVersion,
          engineVersion: nextState.engineVersion,
          currentRevision: nextState.revision,
          currentMonth: nextState.currentMonth,
          status: nextState.outcome ? "terminal" : "active",
          currentState: nextState,
          currentStateChecksum: checksum,
          terminalAt: nextState.outcome ? now : null,
          updatedAt: now,
        })
        .where(
          and(
            eq(gameRuns.id, runId),
            eq(gameRuns.currentRevision, command.expectedRevision),
          ),
        )
        .returning({ id: gameRuns.id });
      if (!updated) {
        throw new RunRepositoryError(
          "OPTIMISTIC_CONFLICT",
          "run revision changed before the command could commit",
        );
      }
      await tx.insert(transactionalOutbox).values({
        runId,
        commandId: command.id,
        topic: "run.command.accepted",
        idempotencyKey: `${runId}:${command.id}`,
        payload: {
          runId,
          commandId: command.id,
          revision: nextState.revision,
          stateChecksum: checksum,
          outcome: nextState.outcome,
        },
        status: "pending",
        availableAt: now,
        createdAt: now,
      });

      return Object.freeze({
        state: nextState,
        stateChecksum: checksum,
        idempotentReplay: false,
      });
    });
  }

  async applyCommandV2(
    runId: string,
    accessSecret: string,
    command: GameCommandV2,
  ): Promise<AppliedCommandV2> {
    assertUuid(runId);
    return this.#db.transaction(async (tx) => {
      const [run] = await tx
        .select()
        .from(gameRuns)
        .where(eq(gameRuns.id, runId))
        .for("update")
        .limit(1);
      if (
        !run ||
        !isAuthorized(
          this.#secretCodec,
          accessSecret,
          run.accessSecretHash,
          run.accessSecretHashVersion,
        )
      ) {
        throw new RunRepositoryError(
          "NOT_FOUND_OR_UNAUTHORIZED",
          "run was not found or the credential is invalid",
        );
      }
      const currentState = requireV2State(
        assertPersistedState(run.currentState, {
          runId,
          checksum: run.currentStateChecksum,
          schemaVersion: run.stateSchemaVersion,
          engineVersion: run.engineVersion,
          revision: run.currentRevision,
          currentMonth: run.currentMonth,
        }),
      );
      const [catalogRow] = await tx
        .select()
        .from(runScenarioSnapshots)
        .where(eq(runScenarioSnapshots.runId, runId))
        .limit(1);
      assertScenarioSnapshotRecord(currentState, catalogRow);

      const [existing] = await tx
        .select()
        .from(acceptedCommands)
        .where(
          and(
            eq(acceptedCommands.runId, runId),
            eq(acceptedCommands.commandId, command.id),
          ),
        )
        .limit(1);
      if (existing) {
        if (!samePersistedCommand(existing, command)) {
          throw new RunRepositoryError(
            "IDEMPOTENCY_MISMATCH",
            "command id was already used with different command content",
          );
        }
        const replayed = await loadRunStateAtRevisionV2(
          tx,
          runId,
          existing.resultingRevision,
          run.engineVersion,
        );
        let monthlyRecord: MonthlyTurnV2Record | null = null;
        if (command.type === "process_month_v2") {
          const [[storedRecord], [storedEvidence]] = await Promise.all([
            tx
              .select()
              .from(monthlyTurnRecords)
              .where(
                and(
                  eq(monthlyTurnRecords.runId, runId),
                  eq(monthlyTurnRecords.commandId, command.id),
                ),
              )
              .limit(1),
            tx
              .select()
              .from(monthlyTaxEvidence)
              .where(
                and(
                  eq(monthlyTaxEvidence.runId, runId),
                  eq(
                    monthlyTaxEvidence.traceId,
                    command.payload.taxEvidence.traceId,
                  ),
                ),
              )
              .limit(1),
          ]);
          if (
            !storedRecord ||
            !storedEvidence ||
            storedRecord.processedMonth !== command.effectiveMonth ||
            storedRecord.resultingRevision !== existing.resultingRevision ||
            storedRecord.taxTraceId !== command.payload.taxEvidence.traceId ||
            storedEvidence.commandId !== command.id ||
            storedEvidence.effectiveMonth !== command.effectiveMonth ||
            sha256Canonical(storedRecord.record) !== storedRecord.recordChecksum ||
            sha256Canonical(storedEvidence.evidence) !==
              storedEvidence.evidenceChecksum ||
            canonicalJson(storedEvidence.evidence) !==
              canonicalJson(command.payload.taxEvidence)
          ) {
            throw new RunRepositoryError(
              "CORRUPT_STATE",
              "idempotent monthly command is missing a consistent immutable record",
            );
          }
          monthlyRecord = storedRecord.record;
        }
        return Object.freeze({
          state: replayed.state,
          stateChecksum: replayed.stateChecksum,
          idempotentReplay: true,
          monthlyRecord,
        });
      }

      if (run.currentRevision !== command.expectedRevision) {
        throw new RunRepositoryError(
          "OPTIMISTIC_CONFLICT",
          `expected revision ${command.expectedRevision}, current revision is ${run.currentRevision}`,
        );
      }
      const reduction = reduceGameCommandV2(currentState, command);
      const nextState = reduction.state;
      const checksum = sha256Canonical(nextState);
      const previousTransactionCount = currentState.ledger.transactions.length;
      const newTransactions = newLedgerTransactions(currentState, nextState);
      const ledgerRows = flattenLedger(
        runId,
        newTransactions,
        previousTransactionCount,
      );
      const now = this.#clock();
      const recordChecksum = reduction.monthlyRecord
        ? sha256Canonical(reduction.monthlyRecord)
        : null;

      await persistSparseSnapshotsV2(
        tx,
        runId,
        snapshotRequestsForAcceptedCommandV2(
          currentState,
          nextState,
          command,
        ),
        now,
      );
      await tx.insert(acceptedCommands).values({
        runId,
        commandId: command.id,
        commandSchemaVersion: command.schemaVersion,
        commandType: command.type,
        expectedRevision: command.expectedRevision,
        resultingRevision: nextState.revision,
        effectiveMonth: command.effectiveMonth,
        payload: command.payload,
        resultingStateChecksum: checksum,
        createdAt: now,
      });
      if (command.type === "process_month_v2" && reduction.monthlyRecord) {
        const evidence = command.payload.taxEvidence;
        const monthlyRecordChecksum = sha256Canonical(reduction.monthlyRecord);
        await tx.insert(monthlyTaxEvidence).values({
          runId,
          traceId: evidence.traceId,
          commandId: command.id,
          effectiveMonth: command.effectiveMonth,
          taxContextFingerprint: evidence.contextFingerprint ?? null,
          evidenceChecksum: sha256Canonical(evidence),
          evidence,
          createdAt: now,
        });
        await tx.insert(monthlyTurnRecords).values({
          runId,
          processedMonth: reduction.monthlyRecord.processedMonth,
          commandId: command.id,
          resultingRevision: nextState.revision,
          taxTraceId: evidence.traceId,
          recordChecksum: monthlyRecordChecksum,
          record: reduction.monthlyRecord,
          createdAt: now,
        });
      }
      if (ledgerRows.transactions.length > 0) {
        await tx.insert(ledgerTransactions).values(ledgerRows.transactions);
        await tx.insert(ledgerPostings).values(ledgerRows.postings);
      }
      const [updated] = await tx
        .update(gameRuns)
        .set({
          stateSchemaVersion: nextState.schemaVersion,
          engineVersion: nextState.engineVersion,
          currentRevision: nextState.revision,
          currentMonth: nextState.currentMonth,
          status: nextState.outcome ? "terminal" : "active",
          currentState: nextState,
          currentStateChecksum: checksum,
          terminalAt: nextState.outcome ? now : null,
          updatedAt: now,
        })
        .where(
          and(
            eq(gameRuns.id, runId),
            eq(gameRuns.currentRevision, command.expectedRevision),
          ),
        )
        .returning({ id: gameRuns.id });
      if (!updated) {
        throw new RunRepositoryError(
          "OPTIMISTIC_CONFLICT",
          "run revision changed before the v2 command could commit",
        );
      }
      await tx.insert(transactionalOutbox).values({
        runId,
        commandId: command.id,
        topic:
          command.type === "process_month_v2"
            ? "run.v2.month.processed"
            : "run.v2.command.accepted",
        idempotencyKey: `${runId}:v2:${command.id}`,
        payload: {
          runId,
          commandId: command.id,
          commandType: command.type,
          revision: nextState.revision,
          stateChecksum: checksum,
          monthlyRecordChecksum: recordChecksum,
          outcome: nextState.outcome,
        },
        status: "pending",
        availableAt: now,
        createdAt: now,
      });

      return Object.freeze({
        state: nextState,
        stateChecksum: checksum,
        idempotentReplay: false,
        monthlyRecord: reduction.monthlyRecord,
      });
    });
  }

  async applyTimeAdvanceV2(
    runId: string,
    accessSecret: string,
    prepared: PreparedTimeAdvanceV2,
  ): Promise<AppliedTimeAdvanceV2> {
    assertUuid(runId);
    return this.#db.transaction(async (tx) => {
      const [run] = await tx
        .select()
        .from(gameRuns)
        .where(eq(gameRuns.id, runId))
        .for("update")
        .limit(1);
      if (
        !run ||
        !isAuthorized(
          this.#secretCodec,
          accessSecret,
          run.accessSecretHash,
          run.accessSecretHashVersion,
        )
      ) {
        throw new RunRepositoryError(
          "NOT_FOUND_OR_UNAUTHORIZED",
          "run was not found or the credential is invalid",
        );
      }
      const currentState = requireV2State(
        assertPersistedState(run.currentState, {
          runId,
          checksum: run.currentStateChecksum,
          schemaVersion: run.stateSchemaVersion,
          engineVersion: run.engineVersion,
          revision: run.currentRevision,
          currentMonth: run.currentMonth,
        }),
      );
      const [catalogRow] = await tx
        .select()
        .from(runScenarioSnapshots)
        .where(eq(runScenarioSnapshots.runId, runId))
        .limit(1);
      assertScenarioSnapshotRecord(currentState, catalogRow);

      const outboxKey = `${runId}:v2:advance:${prepared.batchId}`;
      const [existingBatch] = await tx
        .select({ payload: transactionalOutbox.payload })
        .from(transactionalOutbox)
        .where(eq(transactionalOutbox.idempotencyKey, outboxKey))
        .limit(1);
      if (existingBatch) {
        const payload = requireTimeAdvancePayloadV2(existingBatch.payload);
        if (
          payload.batchId !== prepared.batchId ||
          payload.requestFingerprint !== prepared.requestFingerprint
        ) {
          throw new RunRepositoryError(
            "IDEMPOTENCY_MISMATCH",
            "time advance id was already used with different request content",
          );
        }
        return replayAppliedTimeAdvanceV2(
          tx,
          runId,
          payload,
        );
      }

      if (
        run.currentRevision !== prepared.openingRevision ||
        run.currentStateChecksum !== prepared.openingStateChecksum
      ) {
        throw new RunRepositoryError(
          "OPTIMISTIC_CONFLICT",
          "run changed before the time advance could commit",
        );
      }
      if (
        prepared.controllerVersion !== TIME_CONTROLLER_V2_VERSION ||
        prepared.engineVersion !== run.engineVersion ||
        !isTimeAdvanceRequestV2(prepared.request) ||
        prepared.request.id !== prepared.batchId ||
        prepared.request.expectedRevision !== prepared.openingRevision ||
        prepared.request.effectiveMonth !== currentState.currentMonth ||
        sha256Canonical(prepared.request) !== prepared.requestFingerprint ||
        prepared.steps.length > prepared.request.maxMonths ||
        prepared.steps.length !== prepared.controllerResult.monthsAdvanced ||
        prepared.steps.length !== prepared.controllerResult.records.length ||
        sha256Canonical(prepared.controllerResult.state) !==
          prepared.finalStateChecksum ||
        canonicalJson(prepared.steps) !==
          canonicalJson(prepared.controllerResult.steps) ||
        canonicalJson(prepared.controllerResult.records) !==
          canonicalJson(prepared.steps.map(({ record }) => record)) ||
        prepared.controllerResult.uiChanges.monthsAdvanced !==
          prepared.steps.length ||
        new Set(prepared.steps.map(({ command }) => command.id)).size !==
          prepared.steps.length
      ) {
        throw new RunRepositoryError(
          "PERSISTENCE_INVARIANT",
          "prepared time advance has inconsistent controller evidence",
        );
      }

      let replayState = currentState;
      const now = this.#clock();
      for (const step of prepared.steps) {
        if (
          step.command.type !== "process_month_v2" ||
          step.command.expectedRevision !== replayState.revision ||
          step.command.effectiveMonth !== replayState.currentMonth
        ) {
          throw new RunRepositoryError(
            "PERSISTENCE_INVARIANT",
            "prepared monthly command is not contiguous with the locked run",
          );
        }
        const reduction = reduceGameCommandV2(replayState, step.command);
        const nextState = reduction.state;
        const checksum = sha256Canonical(nextState);
        if (
          step.resultingRevision !== nextState.revision ||
          step.resultingMonth !== nextState.currentMonth ||
          canonicalJson(step.record) !== canonicalJson(reduction.monthlyRecord) ||
          !reduction.monthlyRecord
        ) {
          throw new RunRepositoryError(
            "PERSISTENCE_INVARIANT",
            "prepared monthly result does not match authoritative replay",
          );
        }
        const newTransactions = newLedgerTransactions(replayState, nextState);
        const ledgerRows = flattenLedger(
          runId,
          newTransactions,
          replayState.ledger.transactions.length,
        );
        await persistSparseSnapshotsV2(
          tx,
          runId,
          snapshotRequestsForAcceptedCommandV2(
            replayState,
            nextState,
            step.command,
          ),
          now,
        );
        await tx.insert(acceptedCommands).values({
          runId,
          commandId: step.command.id,
          commandSchemaVersion: step.command.schemaVersion,
          commandType: step.command.type,
          expectedRevision: step.command.expectedRevision,
          resultingRevision: nextState.revision,
          effectiveMonth: step.command.effectiveMonth,
          payload: step.command.payload,
          resultingStateChecksum: checksum,
          createdAt: now,
        });
        const evidence = step.command.payload.taxEvidence;
        await tx.insert(monthlyTaxEvidence).values({
          runId,
          traceId: evidence.traceId,
          commandId: step.command.id,
          effectiveMonth: step.command.effectiveMonth,
          taxContextFingerprint: evidence.contextFingerprint ?? null,
          evidenceChecksum: sha256Canonical(evidence),
          evidence,
          createdAt: now,
        });
        await tx.insert(monthlyTurnRecords).values({
          runId,
          processedMonth: reduction.monthlyRecord.processedMonth,
          commandId: step.command.id,
          resultingRevision: nextState.revision,
          taxTraceId: evidence.traceId,
          recordChecksum: sha256Canonical(reduction.monthlyRecord),
          record: reduction.monthlyRecord,
          createdAt: now,
        });
        if (ledgerRows.transactions.length > 0) {
          await tx.insert(ledgerTransactions).values(ledgerRows.transactions);
          await tx.insert(ledgerPostings).values(ledgerRows.postings);
        }
        replayState = nextState;
      }

      if (
        canonicalJson(replayState) !==
          canonicalJson(prepared.controllerResult.state) ||
        sha256Canonical(replayState) !== prepared.finalStateChecksum
      ) {
        throw new RunRepositoryError(
          "PERSISTENCE_INVARIANT",
          "prepared final state does not match authoritative batch replay",
        );
      }
      if (
        prepared.controllerResult.pauseReason.kind === "periodic_checkpoint"
      ) {
        await persistSparseSnapshotsV2(
          tx,
          runId,
          [
            {
              state: replayState,
              snapshotKind: "checkpoint",
              causalCommandId:
                prepared.steps.at(-1)?.command.id ?? null,
            },
          ],
          now,
        );
      }
      const [updated] = await tx
        .update(gameRuns)
        .set({
          stateSchemaVersion: replayState.schemaVersion,
          engineVersion: replayState.engineVersion,
          currentRevision: replayState.revision,
          currentMonth: replayState.currentMonth,
          status: replayState.outcome ? "terminal" : "active",
          currentState: replayState,
          currentStateChecksum: prepared.finalStateChecksum,
          terminalAt: replayState.outcome ? (run.terminalAt ?? now) : null,
          updatedAt: now,
        })
        .where(
          and(
            eq(gameRuns.id, runId),
            eq(gameRuns.currentRevision, prepared.openingRevision),
            eq(gameRuns.currentStateChecksum, prepared.openingStateChecksum),
          ),
        )
        .returning({ id: gameRuns.id });
      if (!updated) {
        throw new RunRepositoryError(
          "OPTIMISTIC_CONFLICT",
          "run changed before the time advance could commit",
        );
      }
      const {
        state: _state,
        steps: _steps,
        records: _records,
        ...persistedResult
      } = prepared.controllerResult;
      void _state;
      void _steps;
      void _records;
      const payload: TimeAdvanceOutboxPayloadV2 = Object.freeze({
        kind: "time_advance_v2",
        controllerVersion: prepared.controllerVersion,
        engineVersion: prepared.engineVersion,
        request: prepared.request,
        batchId: prepared.batchId,
        requestFingerprint: prepared.requestFingerprint,
        openingRevision: prepared.openingRevision,
        finalRevision: replayState.revision,
        finalStateChecksum: prepared.finalStateChecksum,
        result: persistedResult,
      });
      await tx.insert(transactionalOutbox).values({
        runId,
        commandId: prepared.batchId,
        topic: "run.v2.time_advanced",
        idempotencyKey: outboxKey,
        payload,
        status: "pending",
        availableAt: now,
        createdAt: now,
      });
      return Object.freeze({
        ...prepared.controllerResult,
        stateChecksum: prepared.finalStateChecksum,
        idempotentReplay: false,
      });
    });
  }

  async migrateRunStateToV2(
    runId: string,
    accessSecret: string,
  ): Promise<MigratedRun> {
    assertUuid(runId);
    return this.#db.transaction(async (tx) => {
      const [run] = await tx
        .select()
        .from(gameRuns)
        .where(eq(gameRuns.id, runId))
        .for("update")
        .limit(1);
      if (
        !run ||
        !isAuthorized(
          this.#secretCodec,
          accessSecret,
          run.accessSecretHash,
          run.accessSecretHashVersion,
        )
      ) {
        throw new RunRepositoryError(
          "NOT_FOUND_OR_UNAUTHORIZED",
          "run was not found or the credential is invalid",
        );
      }

      const currentState = assertPersistedState(run.currentState, {
        runId,
        checksum: run.currentStateChecksum,
        schemaVersion: run.stateSchemaVersion,
        engineVersion: run.engineVersion,
        revision: run.currentRevision,
        currentMonth: run.currentMonth,
      });
      const [existingMigration] = await tx
        .select()
        .from(runStateMigrations)
        .where(
          and(
            eq(runStateMigrations.runId, runId),
            eq(
              runStateMigrations.migrationVersion,
              V1_TO_V2_MIGRATION_VERSION,
            ),
          ),
        )
        .limit(1);

      if (currentState.schemaVersion === 2) {
        if (
          currentState.migration === null ||
          !existingMigration ||
          existingMigration.sourceSchemaVersion !==
            currentState.migration.sourceSchemaVersion ||
          existingMigration.sourceEngineVersion !==
            currentState.migration.sourceEngineVersion ||
          existingMigration.targetSchemaVersion !== currentState.schemaVersion ||
          existingMigration.targetEngineVersion !== currentState.engineVersion ||
          existingMigration.sourceRevision !== currentState.revision ||
          existingMigration.targetStateChecksum !== run.currentStateChecksum
        ) {
          throw new RunRepositoryError(
            "CORRUPT_STATE",
            "migrated run is missing a consistent immutable migration record",
          );
        }
        const recordedTarget = assertPersistedState(
          existingMigration.targetState,
          {
            runId,
            checksum: existingMigration.targetStateChecksum,
            schemaVersion: existingMigration.targetSchemaVersion,
            engineVersion: existingMigration.targetEngineVersion,
            revision: existingMigration.sourceRevision,
          },
        );
        if (
          recordedTarget.schemaVersion !== 2 ||
          canonicalJson(recordedTarget) !== canonicalJson(currentState)
        ) {
          throw new RunRepositoryError(
            "CORRUPT_STATE",
            "migration record does not match the authoritative run state",
          );
        }
        return Object.freeze({
          state: currentState,
          stateChecksum: run.currentStateChecksum,
          idempotentReplay: true,
        });
      }

      if (existingMigration) {
        throw new RunRepositoryError(
          "CORRUPT_STATE",
          "v1 run already has a conflicting migration record",
        );
      }
      const targetState = migrateGameStateV1ToV2(currentState);
      const targetChecksum = sha256Canonical(targetState);
      const now = this.#clock();

      await tx.insert(runStateMigrations).values({
        runId,
        migrationVersion: V1_TO_V2_MIGRATION_VERSION,
        sourceSchemaVersion: currentState.schemaVersion,
        sourceEngineVersion: currentState.engineVersion,
        targetSchemaVersion: targetState.schemaVersion,
        targetEngineVersion: targetState.engineVersion,
        sourceRevision: currentState.revision,
        sourceStateChecksum: run.currentStateChecksum,
        targetState,
        targetStateChecksum: targetChecksum,
        createdAt: now,
      });
      const [updated] = await tx
        .update(gameRuns)
        .set({
          stateSchemaVersion: targetState.schemaVersion,
          engineVersion: targetState.engineVersion,
          currentState: targetState,
          currentStateChecksum: targetChecksum,
          updatedAt: now,
        })
        .where(
          and(
            eq(gameRuns.id, runId),
            eq(gameRuns.stateSchemaVersion, currentState.schemaVersion),
            eq(gameRuns.engineVersion, currentState.engineVersion),
            eq(gameRuns.currentRevision, currentState.revision),
            eq(gameRuns.currentStateChecksum, run.currentStateChecksum),
          ),
        )
        .returning({ id: gameRuns.id });
      if (!updated) {
        throw new RunRepositoryError(
          "OPTIMISTIC_CONFLICT",
          "run state changed before migration could commit",
        );
      }
      await tx.insert(transactionalOutbox).values({
        runId,
        topic: "run.state.migrated",
        idempotencyKey: `${runId}:${V1_TO_V2_MIGRATION_VERSION}`,
        payload: {
          runId,
          migrationVersion: V1_TO_V2_MIGRATION_VERSION,
          sourceSchemaVersion: currentState.schemaVersion,
          targetSchemaVersion: targetState.schemaVersion,
          revision: targetState.revision,
          sourceStateChecksum: run.currentStateChecksum,
          targetStateChecksum: targetChecksum,
        },
        status: "pending",
        availableAt: now,
        createdAt: now,
      });

      return Object.freeze({
        state: targetState,
        stateChecksum: targetChecksum,
        idempotentReplay: false,
      });
    });
  }
}
