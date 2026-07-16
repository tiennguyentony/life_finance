import { moneyCents, type MoneyCents } from "./domain/money";
import { simulationMonth } from "./domain/month";
import { reconcileFinancesWithLedger } from "./game-state";
import { finalizeGameStateV2, type GameStateV2 } from "./game-state-v2";
import { appendTransaction, type JournalPosting } from "./ledger";
import {
  DETAILED_FINANCE_COMMAND_SCHEMA_VERSION,
  DetailedFinanceError,
  type DetailedFinanceCommand,
} from "./detailed-actions-v2-contracts";

const COMMAND_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

export function debit(accountId: string, amountCents: MoneyCents): JournalPosting {
  return { accountId, debitCents: amountCents, creditCents: moneyCents(0) };
}

export function credit(accountId: string, amountCents: MoneyCents): JournalPosting {
  return { accountId, debitCents: moneyCents(0), creditCents: amountCents };
}

export function assertPositive(value: MoneyCents): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new DetailedFinanceError(
      "INVALID_AMOUNT",
      "amount must be positive safe integer cents",
    );
  }
}

export function validateEnvelope(
  state: GameStateV2,
  command: DetailedFinanceCommand,
): void {
  if (
    command.schemaVersion !== DETAILED_FINANCE_COMMAND_SCHEMA_VERSION ||
    command.type !== "take_detailed_action" ||
    !COMMAND_ID.test(command.id) ||
    !Number.isSafeInteger(command.expectedRevision) ||
    command.expectedRevision < 0
  ) {
    throw new DetailedFinanceError("INVALID_COMMAND", "invalid v2 command envelope");
  }
  try {
    simulationMonth(command.effectiveMonth);
  } catch {
    throw new DetailedFinanceError("INVALID_COMMAND", "invalid effective month");
  }
  if (command.effectiveMonth !== state.currentMonth) {
    throw new DetailedFinanceError(
      "INVALID_COMMAND",
      "effective month must equal the authoritative current month",
    );
  }
  if (state.acceptedCommandIds.includes(command.id)) {
    throw new DetailedFinanceError("DUPLICATE_COMMAND", "command was already accepted");
  }
  if (command.expectedRevision !== state.revision) {
    throw new DetailedFinanceError("STALE_REVISION", "command revision is stale");
  }
  if (state.outcome !== null) {
    throw new DetailedFinanceError("RUN_TERMINAL", "terminal runs reject commands");
  }
}

export function appendAction(
  state: GameStateV2,
  command: DetailedFinanceCommand,
  reasonCode: string,
  description: string,
  postings: readonly JournalPosting[],
): Pick<GameStateV2, "ledger" | "finances"> {
  const ledger = appendTransaction(state.ledger, {
    id: `txn.${command.id}`,
    commandId: command.id,
    effectiveMonth: command.effectiveMonth,
    reasonCode,
    description,
    sourceSystem: "detailed_financial_actions_v2",
    category: `action.${reasonCode}`,
    causalReference: {
      kind: "command",
      id: command.id,
    },
    postings,
  });
  return {
    ledger,
    finances: reconcileFinancesWithLedger(state.finances, ledger),
  };
}

export function accept(
  state: GameStateV2,
  command: DetailedFinanceCommand,
  changes: Partial<GameStateV2>,
): GameStateV2 {
  return finalizeGameStateV2({
    ...state,
    ...changes,
    revision: state.revision + 1,
    acceptedCommandIds: [...state.acceptedCommandIds, command.id],
  });
}

export function requireCash(state: GameStateV2, amountCents: MoneyCents): void {
  if (amountCents > state.finances.cashCents) {
    throw new DetailedFinanceError(
      "INSUFFICIENT_CASH",
      "action exceeds available cash",
    );
  }
}
