import { canonicalJson } from "./canonical";
import { addMonths } from "./domain/month";
import {
  FINANCIAL_CLOSING_STATE_V2_KIND,
  type FinancialClosingStateV2,
} from "./financial-kernel-v2";
import { finalizeGameStateV2, type GameStateV2 } from "./game-state-v2";
import type { GameStateV2ValidationOptions } from "./game-state-v2-validation";
import { ownForDeepFreeze } from "./immutable-ownership";
import { assertValidGameStateTransitionV2 } from "./state-transition-v2";

export type FinancialTransitionV2ErrorCode =
  | "INVALID_COMMAND_ID"
  | "DUPLICATE_COMMAND"
  | "RUN_MISMATCH"
  | "SCHEMA_MISMATCH"
  | "ENGINE_MISMATCH"
  | "MONTH_NOT_ADVANCED_ONCE"
  | "REVISION_MUTATED"
  | "ACCEPTED_COMMAND_IDS_MUTATED"
  | "OUTCOME_MUTATED"
  | "INVALID_CLOSING_STATE_KIND"
  | "AUTHORITATIVE_METADATA_PRESENT"
  | "INVALID_FINANCIAL_STATE";

export class FinancialTransitionV2Error extends Error {
  readonly code: FinancialTransitionV2ErrorCode;
  override readonly cause?: unknown;

  constructor(
    code: FinancialTransitionV2ErrorCode,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = "FinancialTransitionV2Error";
    this.code = code;
    this.cause = cause;
  }
}

const COMMAND_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,95}$/;

function canonicalEqual(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function sameAcceptedCommandIds(
  previous: readonly string[],
  financial: readonly string[],
): boolean {
  return (
    financial.length === previous.length &&
    previous.every((commandId, index) => financial[index] === commandId)
  );
}

function assertSameFinancialIdentityAndMonth(
  previous: GameStateV2,
  financialState: Pick<
    GameStateV2,
    "runId" | "schemaVersion" | "engineVersion" | "currentMonth"
  >,
): void {
  if (financialState.runId !== previous.runId) {
    throw new FinancialTransitionV2Error(
      "RUN_MISMATCH",
      "financial state must belong to the same run",
    );
  }
  if (financialState.schemaVersion !== previous.schemaVersion) {
    throw new FinancialTransitionV2Error(
      "SCHEMA_MISMATCH",
      "financial state must preserve the game-state schema",
    );
  }
  if (financialState.engineVersion !== previous.engineVersion) {
    throw new FinancialTransitionV2Error(
      "ENGINE_MISMATCH",
      "financial state must preserve the engine version",
    );
  }
  if (financialState.currentMonth !== addMonths(previous.currentMonth, 1)) {
    throw new FinancialTransitionV2Error(
      "MONTH_NOT_ADVANCED_ONCE",
      "financial state must advance exactly one month",
    );
  }
}

export function rehydrateFinancialClosingStateV2(
  previous: GameStateV2,
  financialState: FinancialClosingStateV2,
): GameStateV2 {
  if (
    "revision" in financialState ||
    "acceptedCommandIds" in financialState ||
    "outcome" in financialState
  ) {
    throw new FinancialTransitionV2Error(
      "AUTHORITATIVE_METADATA_PRESENT",
      "financial closing state must not contain authoritative command metadata",
    );
  }
  assertSameFinancialIdentityAndMonth(previous, financialState);

  const ownedFinancialState = ownForDeepFreeze(financialState);
  const { closingStateKind, ...financialEvidence } =
    ownedFinancialState;
  if (closingStateKind !== FINANCIAL_CLOSING_STATE_V2_KIND) {
    throw new FinancialTransitionV2Error(
      "INVALID_CLOSING_STATE_KIND",
      "financial kernel returned an invalid closing-state kind",
    );
  }
  return Object.freeze({
    ...financialEvidence,
    revision: previous.revision,
    acceptedCommandIds: ownForDeepFreeze(previous.acceptedCommandIds),
    outcome: ownForDeepFreeze(previous.outcome),
  });
}

export function acceptFinancialClosingStateV2(
  previous: GameStateV2,
  financialState: FinancialClosingStateV2,
  commandId: string,
  validationOptions: GameStateV2ValidationOptions = {},
): GameStateV2 {
  return acceptFinancialMonthCommandV2(
    previous,
    rehydrateFinancialClosingStateV2(previous, financialState),
    commandId,
    validationOptions,
  );
}

export function acceptFinancialMonthCommandV2(
  previous: GameStateV2,
  financialState: GameStateV2,
  commandId: string,
  validationOptions: GameStateV2ValidationOptions = {},
): GameStateV2 {
  if (!COMMAND_ID.test(commandId)) {
    throw new FinancialTransitionV2Error(
      "INVALID_COMMAND_ID",
      "financial month command id is invalid",
    );
  }
  if (previous.acceptedCommandIds.includes(commandId)) {
    throw new FinancialTransitionV2Error(
      "DUPLICATE_COMMAND",
      "financial month command was already accepted",
    );
  }
  assertSameFinancialIdentityAndMonth(previous, financialState);
  if (financialState.revision !== previous.revision) {
    throw new FinancialTransitionV2Error(
      "REVISION_MUTATED",
      "financial kernel must not mutate revision",
    );
  }
  if (
    !sameAcceptedCommandIds(
      previous.acceptedCommandIds,
      financialState.acceptedCommandIds,
    )
  ) {
    throw new FinancialTransitionV2Error(
      "ACCEPTED_COMMAND_IDS_MUTATED",
      "financial kernel must preserve accepted command ids exactly",
    );
  }
  if (!canonicalEqual(financialState.outcome, previous.outcome)) {
    throw new FinancialTransitionV2Error(
      "OUTCOME_MUTATED",
      "financial kernel must not mutate terminal outcome",
    );
  }

  try {
    const ownedFinancialState = ownForDeepFreeze(financialState);
    const ownedOutcome = ownForDeepFreeze(previous.outcome);
    const accepted = finalizeGameStateV2({
      ...ownedFinancialState,
      revision: previous.revision + 1,
      acceptedCommandIds: [...previous.acceptedCommandIds, commandId],
      outcome: ownedOutcome,
    }, validationOptions);
    assertValidGameStateTransitionV2(
      previous,
      accepted,
      commandId,
      validationOptions,
    );
    return accepted;
  } catch (cause) {
    throw new FinancialTransitionV2Error(
      "INVALID_FINANCIAL_STATE",
      "financial state cannot be accepted as an authoritative month transition",
      cause,
    );
  }
}
