import { describe, expect, it } from "vitest";

import { moneyCents } from "../../../core/domain/money";
import { simulationMonth } from "../../../core/domain/month";
import type {
  JournalTransaction,
  NewJournalTransaction,
} from "../../../core/ledger";
import { flattenLedger } from "../run-repository-support";

const runId = "10000000-0000-4000-8000-000000000001";

function transaction(): NewJournalTransaction {
  return {
    id: "txn.cmd.income",
    commandId: "cmd.income",
    effectiveMonth: simulationMonth("2026-07"),
    reasonCode: "income",
    description: "Record income",
    sourceSystem: "command_reducer",
    category: "income.other",
    causalReference: {
      kind: "command",
      id: "cmd.income",
    },
    postings: [
      {
        accountId: "asset.cash",
        debitCents: moneyCents(100),
        creditCents: moneyCents(0),
      },
      {
        accountId: "income.other",
        debitCents: moneyCents(0),
        creditCents: moneyCents(100),
      },
    ],
  };
}

describe("run repository support", () => {
  it("flattens complete ledger provenance into the append-only transaction row", () => {
    const rows = flattenLedger(runId, [transaction()], 4);

    expect(rows.transactions[0]).toMatchObject({
      runId,
      transactionId: "txn.cmd.income",
      transactionIndex: 4,
      sourceSystem: "command_reducer",
      category: "income.other",
      causalReferenceKind: "command",
      causalReferenceId: "cmd.income",
    });
  });

  it("keeps projected provenance nullable for legacy transactions", () => {
    const complete = transaction();
    const legacy: JournalTransaction = {
      id: complete.id,
      commandId: complete.commandId,
      effectiveMonth: complete.effectiveMonth,
      reasonCode: complete.reasonCode,
      description: complete.description,
      postings: complete.postings,
    };
    const rows = flattenLedger(runId, [legacy], 0);

    expect(rows.transactions[0]).toMatchObject({
      sourceSystem: undefined,
      category: undefined,
      causalReferenceKind: undefined,
      causalReferenceId: undefined,
    });
  });
});
