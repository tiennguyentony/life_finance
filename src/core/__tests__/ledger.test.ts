import { describe, expect, it } from "vitest";

import { moneyCents } from "../domain/money";
import { simulationMonth } from "../domain/month";
import {
  appendTransaction,
  calculateAccountBalance,
  createLedger,
  createReversalTransaction,
  InvalidLedgerError,
  validateLedger,
  type JournalTransaction,
  type Ledger,
  type LedgerAccount,
  type LedgerCausalReference,
  type NewJournalTransaction,
} from "../ledger";

const accounts: readonly LedgerAccount[] = [
  {
    id: "asset.cash",
    name: "Cash",
    category: "asset",
    normalBalance: "debit",
  },
  {
    id: "income.salary",
    name: "Salary income",
    category: "income",
    normalBalance: "credit",
  },
  {
    id: "expense.rent",
    name: "Rent expense",
    category: "expense",
    normalBalance: "debit",
  },
];

function salaryTransaction(
  overrides: Partial<NewJournalTransaction> = {},
): NewJournalTransaction {
  return {
    id: "txn.salary.1",
    commandId: "cmd.advance.1",
    effectiveMonth: simulationMonth("2026-07"),
    reasonCode: "monthly_salary",
    description: "Receive monthly salary",
    sourceSystem: "monthly_turn",
    category: "income.employment",
    causalReference: {
      kind: "command",
      id: "cmd.advance.1",
    },
    postings: [
      {
        accountId: "asset.cash",
        debitCents: moneyCents(500_000),
        creditCents: moneyCents(0),
      },
      {
        accountId: "income.salary",
        debitCents: moneyCents(0),
        creditCents: moneyCents(500_000),
      },
    ],
    ...overrides,
  };
}

function ledgerWith(transaction: JournalTransaction): Ledger {
  return {
    accounts: createLedger(accounts).accounts,
    transactions: [transaction],
  };
}

function withoutProvenance(
  transaction: NewJournalTransaction,
): JournalTransaction {
  return {
    id: transaction.id,
    commandId: transaction.commandId,
    effectiveMonth: transaction.effectiveMonth,
    reasonCode: transaction.reasonCode,
    description: transaction.description,
    postings: transaction.postings,
    ...(transaction.reversesTransactionId
      ? { reversesTransactionId: transaction.reversesTransactionId }
      : {}),
  };
}

describe("ledger", () => {
  it("appends balanced transactions without mutating prior history", () => {
    const empty = createLedger(accounts);
    const posted = appendTransaction(empty, salaryTransaction());

    expect(empty.transactions).toHaveLength(0);
    expect(posted.transactions).toHaveLength(1);
    expect(Object.isFrozen(posted.transactions[0].postings)).toBe(true);
    expect(calculateAccountBalance(posted, "asset.cash")).toBe(500_000);
    expect(calculateAccountBalance(posted, "income.salary")).toBe(500_000);
  });

  it("accepts complete provenance and legacy transactions with no provenance", () => {
    const complete = salaryTransaction();
    const legacy = withoutProvenance(complete);

    expect(validateLedger(ledgerWith(complete))).toEqual([]);
    expect(validateLedger(ledgerWith(legacy))).toEqual([]);
  });

  it.each([
    ["source only", { sourceSystem: "monthly_turn" }],
    [
      "source and category only",
      {
        sourceSystem: "monthly_turn",
        category: "income.employment",
      },
    ],
    [
      "causal reference only",
      {
        causalReference: {
          kind: "command" as const,
          id: "cmd.advance.1",
        },
      },
    ],
  ])("rejects partial provenance: %s", (_label, provenance) => {
    const complete = salaryTransaction();
    const base = withoutProvenance(complete);
    const violations = validateLedger(
      ledgerWith({ ...base, ...provenance } as JournalTransaction),
    );

    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "partial_provenance" }),
      ]),
    );
  });

  it.each([
    ["source system", { sourceSystem: "monthly turn" }, "sourceSystem"],
    ["category", { category: "" }, "category"],
    [
      "causal kind",
      { causalReference: { kind: "request", id: "cmd.advance.1" } },
      "causalReference.kind",
    ],
    [
      "causal id",
      { causalReference: { kind: "command", id: "not stable" } },
      "causalReference.id",
    ],
  ])("rejects an invalid provenance %s", (_label, override, pathSuffix) => {
    const transaction = {
      ...salaryTransaction(),
      ...override,
    } as NewJournalTransaction;
    const violations = validateLedger(ledgerWith(transaction));

    expect(violations.some(({ path }) => path.endsWith(pathSuffix))).toBe(true);
  });

  it("copies and freezes the appended causal reference", () => {
    const causalReference: LedgerCausalReference = {
      kind: "command",
      id: "cmd.advance.1",
    };
    const posted = appendTransaction(
      createLedger(accounts),
      salaryTransaction({ causalReference }),
    );
    const stored = posted.transactions[0] as NewJournalTransaction;

    expect(stored.causalReference).toEqual(causalReference);
    expect(stored.causalReference).not.toBe(causalReference);
    expect(Object.isFrozen(stored.causalReference)).toBe(true);
  });

  it("rejects unbalanced, unknown-account, duplicate, and one-sided entries", () => {
    const empty = createLedger(accounts);
    const invalid = salaryTransaction({
      postings: [
        {
          accountId: "asset.missing",
          debitCents: moneyCents(10),
          creditCents: moneyCents(0),
        },
        {
          accountId: "asset.cash",
          debitCents: moneyCents(0),
          creditCents: moneyCents(9),
        },
      ],
    });

    expect(() => appendTransaction(empty, invalid)).toThrow(InvalidLedgerError);

    const posted = appendTransaction(empty, salaryTransaction());
    expect(() => appendTransaction(posted, salaryTransaction())).toThrow(
      InvalidLedgerError,
    );
  });

  it("uses an exact opposite transaction for corrections", () => {
    const posted = appendTransaction(createLedger(accounts), salaryTransaction());
    const reversal = createReversalTransaction({
      ledger: posted,
      transactionId: "txn.salary.1",
      reversalId: "txn.salary.reversal.1",
      commandId: "cmd.correct.1",
      effectiveMonth: simulationMonth("2026-07"),
      reasonCode: "correct_salary",
      description: "Reverse an incorrectly posted salary",
    });
    const reversed = appendTransaction(posted, reversal);

    expect(reversal).toMatchObject({
      sourceSystem: "monthly_turn",
      category: "income.employment",
      causalReference: {
        kind: "command",
        id: "cmd.correct.1",
      },
    });
    expect(calculateAccountBalance(reversed, "asset.cash")).toBe(0);
    expect(calculateAccountBalance(reversed, "income.salary")).toBe(0);
    expect(() =>
      appendTransaction(reversed, {
        ...reversal,
        id: "txn.salary.reversal.2",
      }),
    ).toThrow(/ledger violates/);
  });

  it("enforces normal account sides", () => {
    expect(() =>
      createLedger([
        {
          id: "asset.cash",
          name: "Cash",
          category: "asset",
          normalBalance: "credit",
        },
      ]),
    ).toThrow(/ledger violates/);
  });
});
