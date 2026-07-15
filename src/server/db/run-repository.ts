import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, gt, lte } from "drizzle-orm";

import { canonicalJson, sha256Canonical } from "../../core/canonical";
import {
  buildCheckpointEvidenceV2,
  type CheckpointEvidenceV2,
} from "../../core/checkpoint-v2";
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
import type { MonthlyTaxEvidence } from "../../core/payroll-v2";
import { RunSecretCodec, type RunCredential } from "../auth/run-secret";
import type { LifeFinanceDatabase } from "./client";
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
  type CreatedRun,
  type CreatedRunV2,
  type GameCommandV2,
  type MigratedRun,
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

export {
  RunRepositoryError,
  type AppliedCommand,
  type AppliedCommandV2,
  type CreatedRun,
  type CreatedRunV2,
  type GameCommandV2,
  type MigratedRun,
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

  async loadAuthorizedRun(runId: string, accessSecret: string): Promise<GameState> {
    assertUuid(runId);
    const [row] = await this.#db
      .select()
      .from(gameRuns)
      .where(eq(gameRuns.id, runId))
      .limit(1);
    if (
      !row ||
      !isAuthorized(
        this.#secretCodec,
        accessSecret,
        row.accessSecretHash,
        row.accessSecretHashVersion,
      )
    ) {
      throw new RunRepositoryError(
        "NOT_FOUND_OR_UNAUTHORIZED",
        "run was not found or the credential is invalid",
      );
    }
    return requireV1State(
      assertPersistedState(row.currentState, {
        runId,
        checksum: row.currentStateChecksum,
        schemaVersion: row.stateSchemaVersion,
        engineVersion: row.engineVersion,
        revision: row.currentRevision,
        currentMonth: row.currentMonth,
      }),
    );
  }

  async loadAuthorizedRunV2(
    runId: string,
    accessSecret: string,
  ): Promise<GameStateV2> {
    assertUuid(runId);
    const [row] = await this.#db
      .select()
      .from(gameRuns)
      .where(eq(gameRuns.id, runId))
      .limit(1);
    if (
      !row ||
      !isAuthorized(
        this.#secretCodec,
        accessSecret,
        row.accessSecretHash,
        row.accessSecretHashVersion,
      )
    ) {
      throw new RunRepositoryError(
        "NOT_FOUND_OR_UNAUTHORIZED",
        "run was not found or the credential is invalid",
      );
    }
    const state = requireV2State(
      assertPersistedState(row.currentState, {
        runId,
        checksum: row.currentStateChecksum,
        schemaVersion: row.stateSchemaVersion,
        engineVersion: row.engineVersion,
        revision: row.currentRevision,
        currentMonth: row.currentMonth,
      }),
    );
    const [catalogRow] = await this.#db
      .select()
      .from(runScenarioSnapshots)
      .where(eq(runScenarioSnapshots.runId, runId))
      .limit(1);
    assertScenarioSnapshotRecord(state, catalogRow);
    return state;
  }

  async loadCheckpointEvidenceV2(
    runId: string,
    accessSecret: string,
    fromRevision: number,
  ): Promise<CheckpointEvidenceV2> {
    if (!Number.isSafeInteger(fromRevision) || fromRevision < 0) {
      throw new RunRepositoryError(
        "PERSISTENCE_INVARIANT",
        "checkpoint start revision must be a non-negative safe integer",
      );
    }
    const endingState = await this.loadAuthorizedRunV2(runId, accessSecret);
    if (fromRevision > endingState.revision) {
      throw new RunRepositoryError(
        "PERSISTENCE_INVARIANT",
        "checkpoint start revision cannot exceed current revision",
      );
    }
    const [startRow] = await this.#db
      .select()
      .from(runStateSnapshots)
      .where(
        and(
          eq(runStateSnapshots.runId, runId),
          eq(runStateSnapshots.revision, fromRevision),
        ),
      )
      .limit(1);
    if (!startRow) {
      throw new RunRepositoryError(
        "PERSISTENCE_INVARIANT",
        "checkpoint start snapshot does not exist",
      );
    }
    const startingState = requireV2State(
      assertPersistedState(startRow.state, {
        runId,
        checksum: startRow.stateChecksum,
        schemaVersion: startRow.stateSchemaVersion,
        engineVersion: startRow.engineVersion,
        revision: startRow.revision,
      }),
    );
    const rows = await this.#db
      .select()
      .from(monthlyTurnRecords)
      .where(
        and(
          eq(monthlyTurnRecords.runId, runId),
          gt(monthlyTurnRecords.resultingRevision, fromRevision),
          lte(monthlyTurnRecords.resultingRevision, endingState.revision),
        ),
      )
      .orderBy(asc(monthlyTurnRecords.processedMonth));
    const records = rows.map((row) => {
      if (
        sha256Canonical(row.record) !== row.recordChecksum ||
        row.record.commandId !== row.commandId ||
        row.record.processedMonth !== row.processedMonth ||
        row.record.taxTraceId !== row.taxTraceId
      ) {
        throw new RunRepositoryError(
          "CORRUPT_STATE",
          "checkpoint monthly evidence failed checksum or identity validation",
        );
      }
      return row.record;
    });
    return buildCheckpointEvidenceV2(startingState, endingState, records);
  }

  async loadMonthlyTaxEvidenceForCommand(
    runId: string,
    accessSecret: string,
    commandId: string,
  ): Promise<MonthlyTaxEvidence | null> {
    assertUuid(runId);
    const [run] = await this.#db
      .select()
      .from(gameRuns)
      .where(eq(gameRuns.id, runId))
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
    const [accepted] = await this.#db
      .select()
      .from(acceptedCommands)
      .where(
        and(
          eq(acceptedCommands.runId, runId),
          eq(acceptedCommands.commandId, commandId),
        ),
      )
      .limit(1);
    if (!accepted) return null;
    if (accepted.commandSchemaVersion !== 2 || accepted.commandType !== "process_month_v2") {
      throw new RunRepositoryError(
        "IDEMPOTENCY_MISMATCH",
        "command id belongs to a different accepted command",
      );
    }
    const [stored] = await this.#db
      .select()
      .from(monthlyTaxEvidence)
      .where(
        and(
          eq(monthlyTaxEvidence.runId, runId),
          eq(monthlyTaxEvidence.commandId, commandId),
        ),
      )
      .limit(1);
    const payload = accepted.payload as { taxEvidence?: unknown };
    if (
      !stored ||
      sha256Canonical(stored.evidence) !== stored.evidenceChecksum ||
      canonicalJson(stored.evidence) !== canonicalJson(payload.taxEvidence)
    ) {
      throw new RunRepositoryError(
        "CORRUPT_STATE",
        "accepted monthly command is missing consistent tax evidence",
      );
    }
    return stored.evidence;
  }

  async loadMonthlyTaxEvidenceForContext(
    runId: string,
    accessSecret: string,
    contextFingerprint: string,
  ): Promise<MonthlyTaxEvidence | null> {
    assertUuid(runId);
    if (!/^[0-9a-f]{64}$/.test(contextFingerprint)) {
      throw new TypeError("tax context fingerprint must be canonical SHA-256");
    }
    const [run] = await this.#db
      .select()
      .from(gameRuns)
      .where(eq(gameRuns.id, runId))
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
    const [stored] = await this.#db
      .select()
      .from(monthlyTaxEvidence)
      .where(
        and(
          eq(monthlyTaxEvidence.runId, runId),
          eq(monthlyTaxEvidence.taxContextFingerprint, contextFingerprint),
        ),
      )
      .orderBy(desc(monthlyTaxEvidence.createdAt))
      .limit(1);
    if (!stored) return null;
    if (
      stored.evidence.contextFingerprint !== contextFingerprint ||
      sha256Canonical(stored.evidence) !== stored.evidenceChecksum
    ) {
      throw new RunRepositoryError(
        "CORRUPT_STATE",
        "cached tax evidence failed fingerprint or checksum validation",
      );
    }
    return stored.evidence;
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
            "idempotent v2 command is missing its immutable snapshot",
          );
        }
        const snapshotState = requireV2State(
          assertPersistedState(snapshot.state, {
            runId,
            checksum: snapshot.stateChecksum,
            schemaVersion: snapshot.stateSchemaVersion,
            engineVersion: snapshot.engineVersion,
            revision: snapshot.revision,
          }),
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
          state: snapshotState,
          stateChecksum: snapshot.stateChecksum,
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

      await tx.insert(runStateSnapshots).values({
        runId,
        revision: nextState.revision,
        stateSchemaVersion: nextState.schemaVersion,
        engineVersion: nextState.engineVersion,
        state: nextState,
        stateChecksum: checksum,
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
