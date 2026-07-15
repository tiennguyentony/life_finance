import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  acceptedCommands,
  aiAuditRecords,
  gameRuns,
  ledgerPostings,
  ledgerTransactions,
  runStateSnapshots,
  transactionalOutbox,
} from "./schema";

describe("authoritative persistence schema", () => {
  it.each([
    [gameRuns, "game_runs"],
    [runStateSnapshots, "run_state_snapshots"],
    [acceptedCommands, "accepted_commands"],
    [ledgerTransactions, "ledger_transactions"],
    [ledgerPostings, "ledger_postings"],
    [transactionalOutbox, "transactional_outbox"],
    [aiAuditRecords, "ai_audit_records"],
  ])("defines the %s table", (table, expectedName) => {
    const config = getTableConfig(table);
    expect(config.name).toBe(expectedName);
    expect(config.enableRLS).toBe(true);
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
        "current_state",
        "current_state_checksum",
        "current_revision",
      ]),
    );
    expect(config.indexes.some(({ config: index }) => index.unique)).toBe(true);
  });

  it("links every accepted command to one immutable resulting revision", () => {
    const commandConfig = getTableConfig(acceptedCommands);
    const snapshotConfig = getTableConfig(runStateSnapshots);

    expect(commandConfig.primaryKeys).toHaveLength(1);
    expect(snapshotConfig.primaryKeys).toHaveLength(1);
    expect(
      commandConfig.foreignKeys.some(
        (key) => key.reference().foreignTable === runStateSnapshots,
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
});
