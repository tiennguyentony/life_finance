import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { canonicalJson, sha256Canonical } from "../../core/canonical";
import {
  reduceGameCommand,
  type GameCommand,
} from "../../core/commands";
import {
  assertValidGameState,
  type GameState,
} from "../../core/game-state";
import {
  migrateGameStateV1ToV2,
  V1_TO_V2_MIGRATION_VERSION,
  type GameStateV2,
} from "../../core/game-state-v2";
import type { JournalTransaction } from "../../core/ledger";
import {
  decodePersistedGameState,
  type PersistedGameState,
} from "../../core/persisted-game-state";
import {
  RUN_SECRET_HASH_VERSION,
  RunSecretCodec,
  type RunCredential,
} from "../auth/run-secret";
import type { LifeFinanceDatabase } from "./client";
import {
  acceptedCommands,
  gameRuns,
  ledgerPostings,
  ledgerTransactions,
  runStateMigrations,
  runStateSnapshots,
  transactionalOutbox,
} from "./schema";

export type CreatedRun = Readonly<{
  runId: string;
  accessSecret: string;
  state: GameState;
  stateChecksum: string;
}>;

export type AppliedCommand = Readonly<{
  state: GameState;
  stateChecksum: string;
  idempotentReplay: boolean;
}>;

export type MigratedRun = Readonly<{
  state: GameStateV2;
  stateChecksum: string;
  idempotentReplay: boolean;
}>;

export class RunRepositoryError extends Error {
  readonly code:
    | "INVALID_RUN_ID"
    | "NOT_FOUND_OR_UNAUTHORIZED"
    | "IDEMPOTENCY_MISMATCH"
    | "CORRUPT_STATE"
    | "UNSUPPORTED_STATE_SCHEMA"
    | "OPTIMISTIC_CONFLICT"
    | "PERSISTENCE_INVARIANT";
  override readonly cause?: unknown;

  constructor(
    code: RunRepositoryError["code"],
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = "RunRepositoryError";
    this.code = code;
    this.cause = cause;
  }
}

type LedgerRows = {
  transactions: (typeof ledgerTransactions.$inferInsert)[];
  postings: (typeof ledgerPostings.$inferInsert)[];
};

function flattenLedger(
  runId: string,
  transactions: readonly JournalTransaction[],
  startingIndex: number,
): LedgerRows {
  const transactionRows: (typeof ledgerTransactions.$inferInsert)[] = [];
  const postingRows: (typeof ledgerPostings.$inferInsert)[] = [];
  for (const [offset, transaction] of transactions.entries()) {
    transactionRows.push({
      runId,
      transactionId: transaction.id,
      commandId: transaction.commandId,
      effectiveMonth: transaction.effectiveMonth,
      reasonCode: transaction.reasonCode,
      description: transaction.description,
      reversesTransactionId: transaction.reversesTransactionId,
      transactionIndex: startingIndex + offset,
    });
    for (const [postingIndex, posting] of transaction.postings.entries()) {
      postingRows.push({
        runId,
        transactionId: transaction.id,
        postingIndex,
        accountId: posting.accountId,
        debitCents: posting.debitCents,
        creditCents: posting.creditCents,
      });
    }
  }
  return { transactions: transactionRows, postings: postingRows };
}

function assertUuid(value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new RunRepositoryError("INVALID_RUN_ID", "run id must be a random UUID");
  }
}

type PersistedStateExpectation = Readonly<{
  runId: string;
  checksum: string;
  schemaVersion: number;
  engineVersion: string;
  revision: number;
  currentMonth?: string;
}>;

function assertPersistedState(
  state: unknown,
  expected: PersistedStateExpectation,
): PersistedGameState {
  let decoded: PersistedGameState;
  try {
    decoded = decodePersistedGameState(state);
  } catch (cause) {
    throw new RunRepositoryError(
      "CORRUPT_STATE",
      "persisted run state violates engine invariants",
      cause,
    );
  }
  if (
    decoded.runId !== expected.runId ||
    decoded.schemaVersion !== expected.schemaVersion ||
    decoded.engineVersion !== expected.engineVersion ||
    decoded.revision !== expected.revision ||
    (expected.currentMonth !== undefined &&
      decoded.currentMonth !== expected.currentMonth) ||
    sha256Canonical(decoded) !== expected.checksum
  ) {
    throw new RunRepositoryError(
      "CORRUPT_STATE",
      "persisted run state does not match its identity and checksum",
    );
  }
  return decoded;
}

function requireV1State(state: PersistedGameState): GameState {
  if (state.schemaVersion !== 1) {
    throw new RunRepositoryError(
      "UNSUPPORTED_STATE_SCHEMA",
      "commands for this state schema are not enabled yet",
    );
  }
  assertValidGameState(state);
  return state;
}

function isAuthorized(
  secretCodec: RunSecretCodec,
  accessSecret: string,
  storedHash: string,
  storedHashVersion: number,
): boolean {
  return (
    storedHashVersion === RUN_SECRET_HASH_VERSION &&
    secretCodec.verify(accessSecret, storedHash)
  );
}

function newLedgerTransactions(
  previousState: GameState,
  nextState: GameState,
): readonly JournalTransaction[] {
  const previous = previousState.ledger.transactions;
  const next = nextState.ledger.transactions;
  if (next.length < previous.length) {
    throw new RunRepositoryError(
      "PERSISTENCE_INVARIANT",
      "accepted commands must only append to ledger history",
    );
  }
  const prefixMatches = previous.every(
    (transaction, index) =>
      canonicalJson(transaction) === canonicalJson(next[index]),
  );
  if (!prefixMatches) {
    throw new RunRepositoryError(
      "PERSISTENCE_INVARIANT",
      "accepted commands must only append to ledger history",
    );
  }
  return next.slice(previous.length);
}

function samePersistedCommand(
  row: typeof acceptedCommands.$inferSelect,
  command: GameCommand,
): boolean {
  return (
    row.commandSchemaVersion === command.schemaVersion &&
    row.commandType === command.type &&
    row.expectedRevision === command.expectedRevision &&
    row.effectiveMonth === command.effectiveMonth &&
    canonicalJson(row.payload) === canonicalJson(command.payload)
  );
}

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
