import { sql } from "drizzle-orm";
import {
  bigint,
  char,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import type { GameState } from "../../core/game-state";
import type { JournalPosting } from "../../core/ledger";

export const runStatus = pgEnum("run_status", ["active", "terminal"]);
export const outboxStatus = pgEnum("outbox_status", [
  "pending",
  "processing",
  "delivered",
  "failed",
]);

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

const createdAt = timestamp("created_at", {
  withTimezone: true,
  mode: "date",
})
  .notNull()
  .defaultNow();

export const gameRuns = pgTable(
  "game_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accessSecretHash: char("access_secret_hash", { length: 64 }).notNull(),
    accessSecretHashVersion: smallint("access_secret_hash_version")
      .notNull()
      .default(1),
    stateSchemaVersion: integer("state_schema_version").notNull(),
    engineVersion: varchar("engine_version", { length: 32 }).notNull(),
    currentRevision: integer("current_revision").notNull().default(0),
    currentMonth: char("current_month", { length: 7 }).notNull(),
    status: runStatus("status").notNull().default("active"),
    currentState: jsonb("current_state").$type<GameState>().notNull(),
    currentStateChecksum: char("current_state_checksum", { length: 64 }).notNull(),
    terminalAt: timestamp("terminal_at", { withTimezone: true, mode: "date" }),
    createdAt,
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("game_runs_access_secret_hash_uidx").on(table.accessSecretHash),
    index("game_runs_status_updated_idx").on(table.status, table.updatedAt),
    check("game_runs_revision_nonnegative", sql`${table.currentRevision} >= 0`),
    check(
      "game_runs_schema_version_positive",
      sql`${table.stateSchemaVersion} > 0`,
    ),
    check(
      "game_runs_secret_hash_version_positive",
      sql`${table.accessSecretHashVersion} > 0`,
    ),
    check(
      "game_runs_month_format",
      sql`${table.currentMonth} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`,
    ),
    check(
      "game_runs_checksum_format",
      sql`${table.currentStateChecksum} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "game_runs_terminal_consistency",
      sql`(${table.status} = 'active' AND ${table.terminalAt} IS NULL) OR (${table.status} = 'terminal' AND ${table.terminalAt} IS NOT NULL)`,
    ),
  ],
).enableRLS();

export const runStateSnapshots = pgTable(
  "run_state_snapshots",
  {
    runId: uuid("run_id")
      .notNull()
      .references(() => gameRuns.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    stateSchemaVersion: integer("state_schema_version").notNull(),
    engineVersion: varchar("engine_version", { length: 32 }).notNull(),
    state: jsonb("state").$type<GameState>().notNull(),
    stateChecksum: char("state_checksum", { length: 64 }).notNull(),
    createdAt,
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.revision] }),
    check("run_state_snapshots_revision_nonnegative", sql`${table.revision} >= 0`),
    check(
      "run_state_snapshots_schema_version_positive",
      sql`${table.stateSchemaVersion} > 0`,
    ),
    check(
      "run_state_snapshots_checksum_format",
      sql`${table.stateChecksum} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
).enableRLS();

export const acceptedCommands = pgTable(
  "accepted_commands",
  {
    runId: uuid("run_id")
      .notNull()
      .references(() => gameRuns.id, { onDelete: "cascade" }),
    commandId: varchar("command_id", { length: 128 }).notNull(),
    commandSchemaVersion: integer("command_schema_version").notNull(),
    commandType: varchar("command_type", { length: 64 }).notNull(),
    expectedRevision: integer("expected_revision").notNull(),
    resultingRevision: integer("resulting_revision").notNull(),
    effectiveMonth: char("effective_month", { length: 7 }).notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    resultingStateChecksum: char("resulting_state_checksum", { length: 64 }).notNull(),
    createdAt,
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.commandId] }),
    uniqueIndex("accepted_commands_run_revision_uidx").on(
      table.runId,
      table.resultingRevision,
    ),
    index("accepted_commands_run_created_idx").on(table.runId, table.createdAt),
    foreignKey({
      columns: [table.runId, table.resultingRevision],
      foreignColumns: [runStateSnapshots.runId, runStateSnapshots.revision],
      name: "accepted_commands_resulting_snapshot_fk",
    }).onDelete("cascade"),
    check(
      "accepted_commands_revision_sequence",
      sql`${table.expectedRevision} >= 0 AND ${table.resultingRevision} = ${table.expectedRevision} + 1`,
    ),
    check(
      "accepted_commands_schema_version_positive",
      sql`${table.commandSchemaVersion} > 0`,
    ),
    check(
      "accepted_commands_month_format",
      sql`${table.effectiveMonth} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`,
    ),
    check(
      "accepted_commands_checksum_format",
      sql`${table.resultingStateChecksum} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
).enableRLS();

export const ledgerTransactions = pgTable(
  "ledger_transactions",
  {
    runId: uuid("run_id")
      .notNull()
      .references(() => gameRuns.id, { onDelete: "cascade" }),
    transactionId: varchar("transaction_id", { length: 128 }).notNull(),
    commandId: varchar("command_id", { length: 128 }).notNull(),
    effectiveMonth: char("effective_month", { length: 7 }).notNull(),
    reasonCode: varchar("reason_code", { length: 128 }).notNull(),
    description: varchar("description", { length: 500 }).notNull(),
    reversesTransactionId: varchar("reverses_transaction_id", { length: 128 }),
    transactionIndex: integer("transaction_index").notNull(),
    createdAt,
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.transactionId] }),
    uniqueIndex("ledger_transactions_run_index_uidx").on(
      table.runId,
      table.transactionIndex,
    ),
    index("ledger_transactions_run_command_idx").on(table.runId, table.commandId),
    check(
      "ledger_transactions_index_nonnegative",
      sql`${table.transactionIndex} >= 0`,
    ),
    check(
      "ledger_transactions_month_format",
      sql`${table.effectiveMonth} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`,
    ),
  ],
).enableRLS();

export const ledgerPostings = pgTable(
  "ledger_postings",
  {
    runId: uuid("run_id").notNull(),
    transactionId: varchar("transaction_id", { length: 128 }).notNull(),
    postingIndex: integer("posting_index").notNull(),
    accountId: varchar("account_id", { length: 128 }).notNull(),
    debitCents: bigint("debit_cents", { mode: "number" })
      .$type<JournalPosting["debitCents"]>()
      .notNull(),
    creditCents: bigint("credit_cents", { mode: "number" })
      .$type<JournalPosting["creditCents"]>()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.runId, table.transactionId, table.postingIndex],
    }),
    foreignKey({
      columns: [table.runId, table.transactionId],
      foreignColumns: [ledgerTransactions.runId, ledgerTransactions.transactionId],
      name: "ledger_postings_transaction_fk",
    }).onDelete("cascade"),
    index("ledger_postings_run_account_idx").on(table.runId, table.accountId),
    check("ledger_postings_index_nonnegative", sql`${table.postingIndex} >= 0`),
    check(
      "ledger_postings_safe_integer_cents",
      sql`${table.debitCents} BETWEEN 0 AND 9007199254740991 AND ${table.creditCents} BETWEEN 0 AND 9007199254740991`,
    ),
    check(
      "ledger_postings_exactly_one_side",
      sql`(${table.debitCents} > 0 AND ${table.creditCents} = 0) OR (${table.creditCents} > 0 AND ${table.debitCents} = 0)`,
    ),
  ],
).enableRLS();

export const transactionalOutbox = pgTable(
  "transactional_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => gameRuns.id, { onDelete: "cascade" }),
    commandId: varchar("command_id", { length: 128 }),
    topic: varchar("topic", { length: 128 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    status: outboxStatus("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true, mode: "date" }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true, mode: "date" }),
    lastErrorCode: varchar("last_error_code", { length: 128 }),
    createdAt,
  },
  (table) => [
    uniqueIndex("transactional_outbox_idempotency_uidx").on(table.idempotencyKey),
    index("transactional_outbox_dispatch_idx").on(table.status, table.availableAt),
    index("transactional_outbox_run_created_idx").on(table.runId, table.createdAt),
    check(
      "transactional_outbox_attempt_nonnegative",
      sql`${table.attemptCount} >= 0`,
    ),
  ],
).enableRLS();

export const aiAuditRecords = pgTable(
  "ai_audit_records",
  {
    invocationId: uuid("invocation_id").primaryKey(),
    runId: uuid("run_id").references(() => gameRuns.id, { onDelete: "restrict" }),
    contractVersion: smallint("contract_version").notNull(),
    role: varchar("role", { length: 32 }).notNull(),
    model: varchar("model", { length: 64 }).notNull(),
    outcome: varchar("outcome", { length: 16 }).notNull(),
    attemptCount: smallint("attempt_count").notNull(),
    keyVersion: smallint("key_version").notNull(),
    initializationVector: bytea("initialization_vector").notNull(),
    authenticationTag: bytea("authentication_tag").notNull(),
    ciphertext: bytea("ciphertext").notNull(),
    createdAt,
  },
  (table) => [
    index("ai_audit_records_run_created_idx").on(table.runId, table.createdAt),
    index("ai_audit_records_role_created_idx").on(table.role, table.createdAt),
    check("ai_audit_records_contract_version_positive", sql`${table.contractVersion} > 0`),
    check(
      "ai_audit_records_role_valid",
      sql`${table.role} IN ('hostile_fed', 'teacher', 'onboarding', 'explanation')`,
    ),
    check(
      "ai_audit_records_outcome_valid",
      sql`${table.outcome} IN ('success', 'failure')`,
    ),
    check(
      "ai_audit_records_attempt_count_bounded",
      sql`${table.attemptCount} BETWEEN 1 AND 8`,
    ),
    check("ai_audit_records_key_version_positive", sql`${table.keyVersion} > 0`),
    check(
      "ai_audit_records_iv_length",
      sql`octet_length(${table.initializationVector}) = 12`,
    ),
    check(
      "ai_audit_records_tag_length",
      sql`octet_length(${table.authenticationTag}) = 16`,
    ),
    check(
      "ai_audit_records_ciphertext_length",
      sql`octet_length(${table.ciphertext}) BETWEEN 1 AND 2097152`,
    ),
  ],
).enableRLS();

export type GameRunRow = typeof gameRuns.$inferSelect;
export type NewGameRunRow = typeof gameRuns.$inferInsert;
export type RunStateSnapshotRow = typeof runStateSnapshots.$inferSelect;
export type AcceptedCommandRow = typeof acceptedCommands.$inferSelect;
export type LedgerTransactionRow = typeof ledgerTransactions.$inferSelect;
export type LedgerPostingRow = typeof ledgerPostings.$inferSelect;
export type TransactionalOutboxRow = typeof transactionalOutbox.$inferSelect;
export type AiAuditRecordRow = typeof aiAuditRecords.$inferSelect;
