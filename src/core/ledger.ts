import { safeBigIntToNumber } from "./domain/integer";
import { moneyCents, type MoneyCents } from "./domain/money";
import { simulationMonth, type SimulationMonth } from "./domain/month";

export type AccountCategory =
  | "asset"
  | "liability"
  | "income"
  | "expense"
  | "equity";

export type LedgerAccount = Readonly<{
  id: string;
  name: string;
  category: AccountCategory;
  normalBalance: "debit" | "credit";
}>;

export type JournalPosting = Readonly<{
  accountId: string;
  debitCents: MoneyCents;
  creditCents: MoneyCents;
}>;

export type JournalTransaction = Readonly<{
  id: string;
  commandId: string;
  effectiveMonth: SimulationMonth;
  reasonCode: string;
  description: string;
  postings: readonly JournalPosting[];
  reversesTransactionId?: string;
}>;

export type Ledger = Readonly<{
  accounts: Readonly<Record<string, LedgerAccount>>;
  transactions: readonly JournalTransaction[];
}>;

export type LedgerViolation = Readonly<{
  path: string;
  code: string;
  message: string;
}>;

export class InvalidLedgerError extends Error {
  readonly violations: readonly LedgerViolation[];

  constructor(violations: readonly LedgerViolation[]) {
    super(
      `ledger violates ${violations.length} invariant${violations.length === 1 ? "" : "s"}`,
    );
    this.name = "InvalidLedgerError";
    this.violations = violations;
  }
}

const IDENTIFIER_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

function freezeLedger(ledger: Ledger): Ledger {
  for (const account of Object.values(ledger.accounts)) {
    Object.freeze(account);
  }
  Object.freeze(ledger.accounts);
  for (const transaction of ledger.transactions) {
    for (const posting of transaction.postings) {
      Object.freeze(posting);
    }
    Object.freeze(transaction.postings);
    Object.freeze(transaction);
  }
  Object.freeze(ledger.transactions);
  return Object.freeze(ledger);
}

function addViolation(
  violations: LedgerViolation[],
  path: string,
  code: string,
  message: string,
): void {
  violations.push({ path, code, message });
}

function hasValidIdentifier(value: string): boolean {
  return IDENTIFIER_PATTERN.test(value);
}

function validateTransaction(
  transaction: JournalTransaction,
  transactionIndex: number,
  accounts: Readonly<Record<string, LedgerAccount>>,
  transactionIds: Set<string>,
  knownTransactions: ReadonlyMap<string, JournalTransaction>,
  reversedIds: Set<string>,
): LedgerViolation[] {
  const violations: LedgerViolation[] = [];
  const path = `transactions.${transactionIndex}`;

  if (!hasValidIdentifier(transaction.id)) {
    addViolation(violations, `${path}.id`, "invalid_identifier", "is invalid");
  } else if (transactionIds.has(transaction.id)) {
    addViolation(violations, `${path}.id`, "duplicate_transaction", "must be unique");
  }
  transactionIds.add(transaction.id);

  if (!hasValidIdentifier(transaction.commandId)) {
    addViolation(
      violations,
      `${path}.commandId`,
      "invalid_identifier",
      "is invalid",
    );
  }
  if (!hasValidIdentifier(transaction.reasonCode)) {
    addViolation(
      violations,
      `${path}.reasonCode`,
      "invalid_identifier",
      "is invalid",
    );
  }
  if (transaction.description.length < 1 || transaction.description.length > 500) {
    addViolation(
      violations,
      `${path}.description`,
      "invalid_description",
      "must contain 1 through 500 characters",
    );
  }
  try {
    simulationMonth(transaction.effectiveMonth);
  } catch {
    addViolation(
      violations,
      `${path}.effectiveMonth`,
      "invalid_month",
      "must use canonical YYYY-MM",
    );
  }

  if (transaction.postings.length < 2) {
    addViolation(
      violations,
      `${path}.postings`,
      "too_few_postings",
      "must contain at least two postings",
    );
  }

  let debits = BigInt(0);
  let credits = BigInt(0);
  const postedAccountIds = new Set<string>();
  for (const [postingIndex, posting] of transaction.postings.entries()) {
    const postingPath = `${path}.postings.${postingIndex}`;
    postedAccountIds.add(posting.accountId);
    if (!Object.hasOwn(accounts, posting.accountId)) {
      addViolation(
        violations,
        `${postingPath}.accountId`,
        "unknown_account",
        "must reference a registered account",
      );
    }
    if (
      !Number.isSafeInteger(posting.debitCents) ||
      !Number.isSafeInteger(posting.creditCents) ||
      posting.debitCents < 0 ||
      posting.creditCents < 0
    ) {
      addViolation(
        violations,
        postingPath,
        "invalid_posting_amount",
        "debit and credit must be non-negative safe integer cents",
      );
      continue;
    }
    if (
      (posting.debitCents === 0 && posting.creditCents === 0) ||
      (posting.debitCents > 0 && posting.creditCents > 0)
    ) {
      addViolation(
        violations,
        postingPath,
        "invalid_posting_side",
        "must have a positive amount on exactly one side",
      );
    }
    debits += BigInt(posting.debitCents);
    credits += BigInt(posting.creditCents);
  }

  if (postedAccountIds.size < 2) {
    addViolation(
      violations,
      `${path}.postings`,
      "single_account_transaction",
      "must affect at least two distinct accounts",
    );
  }
  if (debits !== credits) {
    addViolation(
      violations,
      `${path}.postings`,
      "unbalanced_transaction",
      "total debits must equal total credits",
    );
  }

  if (transaction.reversesTransactionId) {
    const original = knownTransactions.get(transaction.reversesTransactionId);
    if (!original) {
      addViolation(
        violations,
        `${path}.reversesTransactionId`,
        "unknown_reversal_target",
        "must reference an earlier transaction",
      );
    } else if (reversedIds.has(original.id)) {
      addViolation(
        violations,
        `${path}.reversesTransactionId`,
        "duplicate_reversal",
        "a transaction may only be reversed once",
      );
    } else if (!isExactReversal(original, transaction)) {
      addViolation(
        violations,
        `${path}.postings`,
        "invalid_reversal",
        "must exactly swap every debit and credit in the original transaction",
      );
    }
    reversedIds.add(transaction.reversesTransactionId);
  }

  return violations;
}

function isExactReversal(
  original: JournalTransaction,
  reversal: JournalTransaction,
): boolean {
  if (original.postings.length !== reversal.postings.length) {
    return false;
  }

  return original.postings.every((posting, index) => {
    const reversedPosting = reversal.postings[index];
    return (
      reversedPosting.accountId === posting.accountId &&
      reversedPosting.debitCents === posting.creditCents &&
      reversedPosting.creditCents === posting.debitCents
    );
  });
}

export function validateLedger(ledger: Ledger): readonly LedgerViolation[] {
  const violations: LedgerViolation[] = [];
  const accountIds = new Set<string>();

  for (const [key, account] of Object.entries(ledger.accounts)) {
    if (!hasValidIdentifier(key) || account.id !== key) {
      addViolation(
        violations,
        `accounts.${key}`,
        "invalid_account_key",
        "key must be a valid identifier matching the account id",
      );
    }
    if (accountIds.has(account.id)) {
      addViolation(
        violations,
        `accounts.${key}.id`,
        "duplicate_account",
        "must be unique",
      );
    }
    accountIds.add(account.id);
    if (account.name.length < 1 || account.name.length > 100) {
      addViolation(
        violations,
        `accounts.${key}.name`,
        "invalid_account_name",
        "must contain 1 through 100 characters",
      );
    }
    const expectedNormalBalance =
      account.category === "asset" || account.category === "expense"
        ? "debit"
        : "credit";
    if (account.normalBalance !== expectedNormalBalance) {
      addViolation(
        violations,
        `accounts.${key}.normalBalance`,
        "invalid_normal_balance",
        `${account.category} accounts must have a ${expectedNormalBalance} normal balance`,
      );
    }
  }

  const transactionIds = new Set<string>();
  const knownTransactions = new Map<string, JournalTransaction>();
  const reversedIds = new Set<string>();
  for (const [index, transaction] of ledger.transactions.entries()) {
    violations.push(
      ...validateTransaction(
        transaction,
        index,
        ledger.accounts,
        transactionIds,
        knownTransactions,
        reversedIds,
      ),
    );
    knownTransactions.set(transaction.id, transaction);
  }

  return violations;
}

export function assertValidLedger(ledger: Ledger): void {
  const violations = validateLedger(ledger);
  if (violations.length > 0) {
    throw new InvalidLedgerError(violations);
  }
}

export function createLedger(accounts: readonly LedgerAccount[]): Ledger {
  const accountRecord: Record<string, LedgerAccount> = {};
  for (const account of accounts) {
    if (Object.hasOwn(accountRecord, account.id)) {
      throw new InvalidLedgerError([
        {
          path: `accounts.${account.id}`,
          code: "duplicate_account",
          message: "must be unique",
        },
      ]);
    }
    accountRecord[account.id] = { ...account };
  }

  const ledger: Ledger = { accounts: accountRecord, transactions: [] };
  assertValidLedger(ledger);
  return freezeLedger(ledger);
}

export function appendTransaction(
  ledger: Ledger,
  transaction: JournalTransaction,
): Ledger {
  const next: Ledger = {
    accounts: ledger.accounts,
    transactions: [
      ...ledger.transactions,
      {
        ...transaction,
        postings: transaction.postings.map((posting) => ({ ...posting })),
      },
    ],
  };
  assertValidLedger(next);
  return freezeLedger(next);
}

export function createReversalTransaction(input: Readonly<{
  ledger: Ledger;
  transactionId: string;
  reversalId: string;
  commandId: string;
  effectiveMonth: SimulationMonth;
  reasonCode: string;
  description: string;
}>): JournalTransaction {
  const original = input.ledger.transactions.find(
    ({ id }) => id === input.transactionId,
  );
  if (!original) {
    throw new InvalidLedgerError([
      {
        path: "transactionId",
        code: "unknown_reversal_target",
        message: "must reference an existing transaction",
      },
    ]);
  }

  return {
    id: input.reversalId,
    commandId: input.commandId,
    effectiveMonth: input.effectiveMonth,
    reasonCode: input.reasonCode,
    description: input.description,
    reversesTransactionId: original.id,
    postings: original.postings.map((posting) => ({
      accountId: posting.accountId,
      debitCents: posting.creditCents,
      creditCents: posting.debitCents,
    })),
  };
}

export function calculateAccountBalance(
  ledger: Ledger,
  accountId: string,
): MoneyCents {
  const account = ledger.accounts[accountId];
  if (!account) {
    throw new InvalidLedgerError([
      {
        path: "accountId",
        code: "unknown_account",
        message: "must reference a registered account",
      },
    ]);
  }

  let balance = BigInt(0);
  for (const transaction of ledger.transactions) {
    for (const posting of transaction.postings) {
      if (posting.accountId !== accountId) continue;
      const debit = BigInt(posting.debitCents);
      const credit = BigInt(posting.creditCents);
      balance += account.normalBalance === "debit" ? debit - credit : credit - debit;
    }
  }

  return moneyCents(safeBigIntToNumber(balance, `balance for ${accountId}`));
}
