import { canonicalJson, sha256Canonical } from "../../core/canonical";
import type { GameCommand } from "../../core/commands";
import { reduceDetailedFinanceCommand } from "../../core/detailed-actions-v2";
import { assertValidGameState, type GameState } from "../../core/game-state";
import type { GameStateV2 } from "../../core/game-state-v2";
import type { JournalTransaction } from "../../core/ledger";
import {
  EventLifecycleV2Error,
  resolveEventChoiceV2,
} from "../../core/event-lifecycle-v2";
import {
  processMonthlyTurnV2,
  type MonthlyTurnV2Record,
} from "../../core/monthly-turn-v2";
import {
  decodePersistedGameState,
  type PersistedGameState,
} from "../../core/persisted-game-state";
import { setRecurringStrategy } from "../../core/recurring-strategy-v2";
import {
  assertNoDueLifeMilestone,
  manageLifeMilestoneV2,
} from "../../core/life-milestones-v2";
import { recordLearningInteractionV2 } from "../../core/learning-interaction-v2";
import {
  RUN_SECRET_HASH_VERSION,
  RunSecretCodec,
} from "../auth/run-secret";
import type { GameCommandV2 } from "./run-repository-contracts";
import { RunRepositoryError } from "./run-repository-contracts";
import {
  acceptedCommands,
  ledgerPostings,
  ledgerTransactions,
  runScenarioSnapshots,
} from "./schema";

type LedgerRows = {
  transactions: (typeof ledgerTransactions.$inferInsert)[];
  postings: (typeof ledgerPostings.$inferInsert)[];
};

export function flattenLedger(
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

export function assertUuid(value: string): void {
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

export function assertPersistedState(
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

export function requireV1State(state: PersistedGameState): GameState {
  if (state.schemaVersion !== 1) {
    throw new RunRepositoryError(
      "UNSUPPORTED_STATE_SCHEMA",
      "commands for this state schema are not enabled yet",
    );
  }
  assertValidGameState(state);
  return state;
}

export function requireV2State(state: PersistedGameState): GameStateV2 {
  if (state.schemaVersion !== 2) {
    throw new RunRepositoryError(
      "UNSUPPORTED_STATE_SCHEMA",
      "v2 commands require a schema-v2 run",
    );
  }
  return state;
}

export function isAuthorized(
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

export function newLedgerTransactions(
  previousState: PersistedGameState,
  nextState: PersistedGameState,
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

export function samePersistedCommand(
  row: typeof acceptedCommands.$inferSelect,
  command: GameCommand | GameCommandV2,
): boolean {
  return (
    row.commandSchemaVersion === command.schemaVersion &&
    row.commandType === command.type &&
    row.expectedRevision === command.expectedRevision &&
    row.effectiveMonth === command.effectiveMonth &&
    canonicalJson(row.payload) === canonicalJson(command.payload)
  );
}

export function assertScenarioSnapshotRecord(
  state: GameStateV2,
  catalogRow: typeof runScenarioSnapshots.$inferSelect | undefined,
): void {
  const snapshot = state.gameplay.catalogSnapshot;
  const snapshotChecksum = state.gameplay.catalogSnapshotChecksum;
  if (
    (snapshot === null && catalogRow !== undefined) ||
    (snapshot !== null &&
      (!catalogRow ||
        snapshotChecksum === null ||
        catalogRow.catalogVersion !== snapshot.catalog.version ||
        catalogRow.snapshotChecksum !== snapshotChecksum ||
        sha256Canonical(catalogRow.snapshot) !== catalogRow.snapshotChecksum ||
        canonicalJson(catalogRow.snapshot) !== canonicalJson(snapshot)))
  ) {
    throw new RunRepositoryError(
      "CORRUPT_STATE",
      "v2 run scenario snapshot does not match its immutable catalog record",
    );
  }
}

export function reduceGameCommandV2(
  state: GameStateV2,
  command: GameCommandV2,
): Readonly<{ state: GameStateV2; monthlyRecord: MonthlyTurnV2Record | null }> {
  if (
    state.gameplay.eventLifecycle.pending &&
    command.type !== "resolve_event_choice" &&
    command.type !== "record_learning_interaction_v2"
  ) {
    throw new EventLifecycleV2Error(
      "PENDING_EVENT_UNRESOLVED",
      "pending event choice must be resolved before another command",
    );
  }
  if (command.type === "resolve_event_choice") {
    return { state: resolveEventChoiceV2(state, command), monthlyRecord: null };
  }
  if (command.type === "take_detailed_action") {
    return { state: reduceDetailedFinanceCommand(state, command), monthlyRecord: null };
  }
  if (command.type === "set_recurring_strategy") {
    return { state: setRecurringStrategy(state, command), monthlyRecord: null };
  }
  if (command.type === "manage_life_milestone") {
    return { state: manageLifeMilestoneV2(state, command), monthlyRecord: null };
  }
  if (command.type === "record_learning_interaction_v2") {
    return { state: recordLearningInteractionV2(state, command), monthlyRecord: null };
  }
  assertNoDueLifeMilestone(state);
  const result = processMonthlyTurnV2(state, command);
  return { state: result.state, monthlyRecord: result.record };
}
