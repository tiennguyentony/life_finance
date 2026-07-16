import { describe, expect, it } from "vitest";

import { sha256Canonical } from "../canonical";
import {
  GameCommandError,
  reduceGameCommand,
  type AdvanceMonthCommand,
  type PostTransactionCommand,
} from "../commands";
import { moneyCents, ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import { createInitialGameState, type GameState } from "../game-state";
import type { JournalTransaction } from "../ledger";

function initialState(): GameState {
  return createInitialGameState({
    runId: "run_reducer",
    startMonth: "2026-07",
    randomSeed: "replay-seed",
    player: {
      playerId: "player_reducer",
      birthMonth: "1990-01",
      locationId: "US-CA",
      careerTrackId: "engineer",
      filingStatus: "single",
    },
    finances: {
      cashCents: moneyCents(100_00),
      taxableInvestmentsCents: moneyCents(0),
      retirementCents: moneyCents(0),
      homeValueCents: moneyCents(0),
      otherInvestableAssetsCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      nonCreditLiabilitiesCents: moneyCents(0),
      creditLimitCents: moneyCents(50_000_00),
      creditUsedCents: moneyCents(0),
      annualLivingCostCents: moneyCents(40_000_00),
      requiredObligationsCents: moneyCents(2_000_00),
    },
    wellbeing: {
      burnoutPpm: ratePpm(100_000),
      happinessPpm: ratePpm(900_000),
    },
  });
}

function salaryCommand(): PostTransactionCommand {
  return {
    schemaVersion: 1,
    id: "cmd.salary.1",
    expectedRevision: 0,
    effectiveMonth: simulationMonth("2026-07"),
    type: "post_transaction",
    payload: {
      transactionId: "txn.salary.1",
      reasonCode: "monthly_salary",
      description: "Receive monthly salary",
      postings: [
        {
          accountId: "asset.cash",
          debitCents: moneyCents(500_000),
          creditCents: moneyCents(0),
        },
        {
          accountId: "income.employment",
          debitCents: moneyCents(0),
          creditCents: moneyCents(500_000),
        },
      ],
    },
  };
}

function advanceCommand(): AdvanceMonthCommand {
  return {
    schemaVersion: 1,
    id: "cmd.advance.1",
    expectedRevision: 1,
    effectiveMonth: simulationMonth("2026-07"),
    type: "advance_month",
    payload: { months: 1 },
  };
}

function replay(): GameState {
  return reduceGameCommand(
    reduceGameCommand(initialState(), salaryCommand()),
    advanceCommand(),
  );
}

function withoutProvenance(
  transaction: JournalTransaction,
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

describe("game command reducer", () => {
  it("posts financial movements and reconciles the immutable snapshot", () => {
    const before = initialState();
    const after = reduceGameCommand(before, salaryCommand());

    expect(before.finances.cashCents).toBe(100_00);
    expect(before.ledger.transactions).toHaveLength(1);
    expect(after.finances.cashCents).toBe(510_000);
    expect(after.ledger.transactions).toHaveLength(2);
    expect(after.revision).toBe(1);
    expect(after.acceptedCommandIds).toEqual(["cmd.salary.1"]);
    expect(Object.isFrozen(after)).toBe(true);
  });

  it("uses explicit fallback provenance when reversing a legacy transaction", () => {
    const posted = reduceGameCommand(initialState(), salaryCommand());
    const legacyState: GameState = {
      ...posted,
      ledger: {
        ...posted.ledger,
        transactions: [
          posted.ledger.transactions[0],
          withoutProvenance(posted.ledger.transactions[1]),
        ],
      },
    };
    const reversal: PostTransactionCommand = {
      schemaVersion: 1,
      id: "cmd.salary.reverse.1",
      expectedRevision: 1,
      effectiveMonth: simulationMonth("2026-07"),
      type: "post_transaction",
      payload: {
        transactionId: "txn.salary.reverse.1",
        reasonCode: "reverse_salary",
        description: "Reverse legacy salary",
        reversesTransactionId: "txn.salary.1",
        postings: [
          {
            accountId: "asset.cash",
            debitCents: moneyCents(0),
            creditCents: moneyCents(500_000),
          },
          {
            accountId: "income.employment",
            debitCents: moneyCents(500_000),
            creditCents: moneyCents(0),
          },
        ],
      },
    };

    const reversed = reduceGameCommand(legacyState, reversal);

    expect(reversed.ledger.transactions.at(-1)).toMatchObject({
      sourceSystem: "ledger",
      category: "ledger.legacy_reversal",
      causalReference: {
        kind: "command",
        id: reversal.id,
      },
    });
    expect(reversed.finances.cashCents).toBe(100_00);
  });

  it("advances exactly one calendar month", () => {
    const after = replay();

    expect(after.currentMonth).toBe("2026-08");
    expect(after.revision).toBe(2);
  });

  it("replays to an identical state fingerprint", () => {
    const first = replay();
    const second = replay();

    expect(first).toEqual(second);
    expect(sha256Canonical(first)).toBe(sha256Canonical(second));
    expect(sha256Canonical(first)).toBe(
      "e1f88985357229adf0f1817d887bc4a9eaaaa5a6ac7bca323a79d8f69b9a5b5b",
    );
  });

  it.each([
    ["duplicate", { ...salaryCommand(), id: "cmd.salary.1" }, "DUPLICATE_COMMAND"],
    [
      "stale revision",
      { ...advanceCommand(), expectedRevision: 0 },
      "STALE_REVISION",
    ],
    [
      "wrong month",
      { ...advanceCommand(), effectiveMonth: simulationMonth("2026-08") },
      "INVALID_EFFECTIVE_MONTH",
    ],
  ])("rejects %s without mutating state", (_label, command, code) => {
    const afterSalary = reduceGameCommand(initialState(), salaryCommand());
    const beforeChecksum = sha256Canonical(afterSalary);

    try {
      reduceGameCommand(afterSalary, command as AdvanceMonthCommand);
      throw new Error("expected reducer to reject command");
    } catch (error) {
      expect(error).toBeInstanceOf(GameCommandError);
      expect((error as GameCommandError).code).toBe(code);
    }
    expect(sha256Canonical(afterSalary)).toBe(beforeChecksum);
  });

  it("rejects unbalanced journals atomically", () => {
    const state = initialState();
    const invalid = salaryCommand();
    const unbalanced: PostTransactionCommand = {
      ...invalid,
      payload: {
        ...invalid.payload,
        postings: invalid.payload.postings.slice(0, 1),
      },
    };

    try {
      reduceGameCommand(state, unbalanced);
      throw new Error("expected reducer to reject command");
    } catch (error) {
      expect(error).toBeInstanceOf(GameCommandError);
      expect((error as GameCommandError).code).toBe("TRANSITION_INVARIANT");
    }
    expect(state.revision).toBe(0);
    expect(state.ledger.transactions).toHaveLength(1);
  });
});
