import { addMonths, simulationMonth, type SimulationMonth } from "./domain/month";
import { applyFinancialAction, type FinancialAction } from "./actions";
import {
  finalizeGameState,
  reconcileFinancesWithLedger,
  type GameState,
} from "./game-state";
import {
  appendTransaction,
  type JournalPosting,
  type JournalTransaction,
} from "./ledger";

export const GAME_COMMAND_SCHEMA_VERSION = 1 as const;

type CommandEnvelope = Readonly<{
  schemaVersion: typeof GAME_COMMAND_SCHEMA_VERSION;
  id: string;
  expectedRevision: number;
  effectiveMonth: SimulationMonth;
}>;

export type AdvanceMonthCommand = CommandEnvelope &
  Readonly<{
    type: "advance_month";
    payload: Readonly<{ months: 1 }>;
  }>;

export type PostTransactionCommand = CommandEnvelope &
  Readonly<{
    type: "post_transaction";
    payload: Readonly<{
      transactionId: string;
      reasonCode: string;
      description: string;
      postings: readonly JournalPosting[];
      reversesTransactionId?: string;
    }>;
  }>;

export type TakeActionCommand = CommandEnvelope &
  Readonly<{
    type: "take_action";
    payload: Readonly<{ action: FinancialAction }>;
  }>;

export type GameCommand =
  | AdvanceMonthCommand
  | PostTransactionCommand
  | TakeActionCommand;

export type CommandErrorCode =
  | "UNSUPPORTED_COMMAND_SCHEMA"
  | "INVALID_COMMAND_ID"
  | "INVALID_REVISION"
  | "DUPLICATE_COMMAND"
  | "STALE_REVISION"
  | "INVALID_EFFECTIVE_MONTH"
  | "RUN_TERMINAL"
  | "UNSUPPORTED_COMMAND"
  | "TRANSITION_INVARIANT";

export class GameCommandError extends Error {
  readonly code: CommandErrorCode;
  override readonly cause?: unknown;

  constructor(code: CommandErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "GameCommandError";
    this.code = code;
    this.cause = cause;
  }
}

const COMMAND_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

function validateEnvelope(state: GameState, command: GameCommand): void {
  if (command.schemaVersion !== GAME_COMMAND_SCHEMA_VERSION) {
    throw new GameCommandError(
      "UNSUPPORTED_COMMAND_SCHEMA",
      `command schema ${String(command.schemaVersion)} is unsupported`,
    );
  }
  if (!COMMAND_ID_PATTERN.test(command.id)) {
    throw new GameCommandError(
      "INVALID_COMMAND_ID",
      "command id must contain 1 through 128 safe identifier characters",
    );
  }
  if (!Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0) {
    throw new GameCommandError(
      "INVALID_REVISION",
      "expected revision must be a non-negative safe integer",
    );
  }
  if (state.acceptedCommandIds.includes(command.id)) {
    throw new GameCommandError(
      "DUPLICATE_COMMAND",
      `command ${command.id} was already accepted`,
    );
  }
  if (command.expectedRevision !== state.revision) {
    throw new GameCommandError(
      "STALE_REVISION",
      `expected revision ${command.expectedRevision}, current revision is ${state.revision}`,
    );
  }
  try {
    simulationMonth(command.effectiveMonth);
  } catch (cause) {
    throw new GameCommandError(
      "INVALID_EFFECTIVE_MONTH",
      "effective month must use canonical YYYY-MM",
      cause,
    );
  }
  if (command.effectiveMonth !== state.currentMonth) {
    throw new GameCommandError(
      "INVALID_EFFECTIVE_MONTH",
      `effective month must equal current month ${state.currentMonth}`,
    );
  }
  if (state.outcome) {
    throw new GameCommandError("RUN_TERMINAL", "terminal runs reject new commands");
  }
}

function acceptCommand(
  state: GameState,
  commandId: string,
  changes: Partial<GameState>,
): GameState {
  return finalizeGameState({
    ...state,
    ...changes,
    revision: state.revision + 1,
    acceptedCommandIds: [...state.acceptedCommandIds, commandId],
  });
}

function postTransaction(
  state: GameState,
  command: PostTransactionCommand,
): GameState {
  if (
    command.payload.postings.some(
      ({ accountId }) => accountId === "equity.opening",
    )
  ) {
    throw new GameCommandError(
      "TRANSITION_INVARIANT",
      "opening equity cannot be changed after initialization",
    );
  }

  const transaction: JournalTransaction = {
    id: command.payload.transactionId,
    commandId: command.id,
    effectiveMonth: command.effectiveMonth,
    reasonCode: command.payload.reasonCode,
    description: command.payload.description,
    postings: command.payload.postings,
    ...(command.payload.reversesTransactionId
      ? { reversesTransactionId: command.payload.reversesTransactionId }
      : {}),
  };
  const ledger = appendTransaction(state.ledger, transaction);
  const finances = reconcileFinancesWithLedger(state.finances, ledger);
  return acceptCommand(state, command.id, { ledger, finances });
}

export function reduceGameCommand(
  state: GameState,
  command: GameCommand,
): GameState {
  validateEnvelope(state, command);

  try {
    switch (command.type) {
      case "advance_month":
        if (command.payload.months !== 1) {
          throw new GameCommandError(
            "TRANSITION_INVARIANT",
            "the engine advances exactly one month per command",
          );
        }
        return acceptCommand(state, command.id, {
          currentMonth: addMonths(state.currentMonth, 1),
        });
      case "post_transaction":
        return postTransaction(state, command);
      case "take_action": {
        const application = applyFinancialAction(
          state,
          command.id,
          command.effectiveMonth,
          command.payload.action,
        );
        return acceptCommand(state, command.id, application);
      }
      default: {
        const exhaustive: never = command;
        throw new GameCommandError(
          "UNSUPPORTED_COMMAND",
          `unsupported command ${(exhaustive as GameCommand).type}`,
        );
      }
    }
  } catch (error) {
    if (error instanceof GameCommandError) throw error;
    throw new GameCommandError(
      "TRANSITION_INVARIANT",
      "command would violate a game-state invariant",
      error,
    );
  }
}
