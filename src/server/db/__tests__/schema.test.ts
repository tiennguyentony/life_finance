import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  acceptedCommands,
  aiAuditRecords,
  gameRuns,
  ledgerPostings,
  ledgerTransactions,
  monthlyTaxEvidence,
  monthlyTurnRecords,
  runStateMigrations,
  runStateSnapshots,
  transactionalOutbox,
} from "../schema";

describe("authoritative persistence schema", () => {
  it.each([
    [gameRuns, "game_runs"],
    [runStateSnapshots, "run_state_snapshots"],
    [runStateMigrations, "run_state_migrations"],
    [acceptedCommands, "accepted_commands"],
    [ledgerTransactions, "ledger_transactions"],
    [ledgerPostings, "ledger_postings"],
    [monthlyTaxEvidence, "monthly_tax_evidence"],
    [transactionalOutbox, "transactional_outbox"],
    [aiAuditRecords, "ai_audit_records"],
  ])("defines the %s table", (table, expectedName) => {
    const config = getTableConfig(table);
    expect(config.name).toBe(expectedName);
    expect(config.enableRLS).toBe(true);
  });

  it("stores immutable state migrations separately from command revisions", () => {
    const config = getTableConfig(runStateMigrations);
    expect(config.primaryKeys).toHaveLength(1);
    expect(config.foreignKeys[0]?.onDelete).toBe("cascade");
    expect(config.checks.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "run_state_migrations_version_progression",
        "run_state_migrations_revision_nonnegative",
        "run_state_migrations_source_checksum_format",
        "run_state_migrations_target_checksum_format",
      ]),
    );
  });

  it("stores AI audit content only as an authenticated encrypted envelope", () => {
    const config = getTableConfig(aiAuditRecords);
    const columnNames = config.columns.map(({ name }) => name);

    expect(columnNames).toEqual(
      expect.arrayContaining([
        "key_version",
        "initialization_vector",
        "authentication_tag",
        "ciphertext",
      ]),
    );
    expect(columnNames).not.toEqual(
      expect.arrayContaining(["prompt", "request", "response", "output"]),
    );
    expect(config.foreignKeys[0]?.onDelete).toBe("restrict");
    expect(config.checks.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "ai_audit_records_role_valid",
        "ai_audit_records_iv_length",
        "ai_audit_records_tag_length",
        "ai_audit_records_ciphertext_length",
      ]),
    );
  });

  it("stores only a secret hash and keeps the authoritative state checksum", () => {
    const config = getTableConfig(gameRuns);
    const columnNames = config.columns.map(({ name }) => name);

    expect(columnNames).toContain("access_secret_hash");
    expect(columnNames).not.toContain("access_secret");
    expect(columnNames).toEqual(
      expect.arrayContaining([
        "owner_user_id",
        "save_status",
        "current_state",
        "current_state_checksum",
        "current_revision",
      ]),
    );
    expect(config.indexes.some(({ config: index }) => index.unique)).toBe(true);
  });

  it("stores sparse snapshot metadata without requiring per-command snapshots", () => {
    const commandConfig = getTableConfig(acceptedCommands);
    const monthlyRecordConfig = getTableConfig(monthlyTurnRecords);
    const snapshotConfig = getTableConfig(runStateSnapshots);
    const snapshotColumnNames = snapshotConfig.columns.map(({ name }) => name);

    expect(commandConfig.primaryKeys).toHaveLength(1);
    expect(snapshotConfig.primaryKeys).toHaveLength(1);
    expect(snapshotColumnNames).toEqual(
      expect.arrayContaining(["snapshot_kind", "causal_command_id"]),
    );
    expect(
      commandConfig.foreignKeys.some(
        (key) => key.reference().foreignTable === runStateSnapshots,
      ),
    ).toBe(false);
    expect(
      monthlyRecordConfig.foreignKeys.some(
        (key) => key.reference().foreignTable === runStateSnapshots,
      ),
    ).toBe(false);
    expect(
      monthlyRecordConfig.foreignKeys.some(
        (key) => key.reference().foreignTable === acceptedCommands,
      ),
    ).toBe(true);
    expect(
      monthlyRecordConfig.foreignKeys.some(
        (key) => key.reference().foreignTable === monthlyTaxEvidence,
      ),
    ).toBe(true);
  });

  it("normalizes ledger postings and protects outbox idempotency", () => {
    const postingConfig = getTableConfig(ledgerPostings);
    const outboxConfig = getTableConfig(transactionalOutbox);

    expect(postingConfig.foreignKeys).toHaveLength(1);
    expect(postingConfig.checks.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "ledger_postings_safe_integer_cents",
        "ledger_postings_exactly_one_side",
      ]),
    );
    expect(
      outboxConfig.indexes.some(
        ({ config: index }) =>
          index.unique &&
          index.name === "transactional_outbox_idempotency_uidx",
      ),
    ).toBe(true);
  });

  it("stores legacy-compatible causal provenance on ledger transactions", () => {
    const transactionConfig = getTableConfig(ledgerTransactions);
    const columnNames = transactionConfig.columns.map(({ name }) => name);

    expect(columnNames).toEqual(
      expect.arrayContaining([
        "source_system",
        "category",
        "causal_reference_kind",
        "causal_reference_id",
      ]),
    );
    expect(transactionConfig.checks.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "ledger_transactions_complete_provenance",
        "ledger_transactions_causal_kind_valid",
      ]),
    );
  });

  it("indexes validated tax contexts for persisted annual reuse", () => {
    const config = getTableConfig(monthlyTaxEvidence);

    expect(
      config.indexes.some(
        ({ config: index }) =>
          index.name === "monthly_tax_evidence_run_context_idx",
      ),
    ).toBe(true);
    expect(config.checks.map(({ name }) => name)).toContain(
      "monthly_tax_evidence_context_fingerprint_format",
    );
  });
});
