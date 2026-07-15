import { describe, expect, it } from "vitest";

import { moneyCents } from "../domain/money";
import { simulationMonth } from "../domain/month";
import {
  appendTransaction,
  calculateAccountBalance,
  createLedger,
  createReversalTransaction,
  InvalidLedgerError,
  type JournalTransaction,
  type LedgerAccount,
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
  overrides: Partial<JournalTransaction> = {},
): JournalTransaction {
  return {
    id: "txn.salary.1",
    commandId: "cmd.advance.1",
    effectiveMonth: simulationMonth("2026-07"),
    reasonCode: "monthly_salary",
    description: "Receive monthly salary",
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
