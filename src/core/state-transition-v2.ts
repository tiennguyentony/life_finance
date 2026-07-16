import { canonicalJson } from "./canonical";
import { compareMonths } from "./domain/month";
import {
  validateGameStateV2,
  type GameStateV2,
} from "./game-state-v2";

export type GameStateTransitionV2Violation = Readonly<{
  path: string;
  code: string;
  message: string;
}>;

export class InvalidGameStateTransitionV2Error extends Error {
  readonly violations: readonly GameStateTransitionV2Violation[];

  constructor(violations: readonly GameStateTransitionV2Violation[]) {
    super(
      `game state v2 transition violates ${violations.length} invariant${violations.length === 1 ? "" : "s"}`,
    );
    this.name = "InvalidGameStateTransitionV2Error";
    this.violations = violations;
  }
}

function violation(
  path: string,
  code: string,
  message: string,
): GameStateTransitionV2Violation {
  return { path, code, message };
}

function canonicalEqual(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

export function validateGameStateTransitionV2(
  previous: GameStateV2,
  next: GameStateV2,
  commandId: string,
): readonly GameStateTransitionV2Violation[] {
  const violations: GameStateTransitionV2Violation[] = [];

  try {
    violations.push(
      ...validateGameStateV2(next).map((stateViolation) => ({
        ...stateViolation,
        path: `next.${stateViolation.path}`,
      })),
    );
  } catch {
    violations.push(
      violation(
        "next",
        "invalid_next_state",
        "must satisfy schema-v2 single-state invariants",
      ),
    );
  }

  if (next.runId !== previous.runId) {
    violations.push(
      violation("runId", "run_id_changed", "must not change during a command"),
    );
  }
  if (next.schemaVersion !== previous.schemaVersion) {
    violations.push(
      violation(
        "schemaVersion",
        "schema_version_changed",
        "must not change during a command",
      ),
    );
  }
  if (next.engineVersion !== previous.engineVersion) {
    violations.push(
      violation(
        "engineVersion",
        "engine_version_changed",
        "must not change during a command",
      ),
    );
  }
  if (next.startMonth !== previous.startMonth) {
    violations.push(
      violation(
        "startMonth",
        "start_month_changed",
        "must not change during a command",
      ),
    );
  }
  if (next.player.playerId !== previous.player.playerId) {
    violations.push(
      violation(
        "player.playerId",
        "player_id_changed",
        "must not change during a command",
      ),
    );
  }
  if (next.player.birthMonth !== previous.player.birthMonth) {
    violations.push(
      violation(
        "player.birthMonth",
        "birth_month_changed",
        "must not change during a command",
      ),
    );
  }
  if (next.revision !== previous.revision + 1) {
    violations.push(
      violation(
        "revision",
        "revision_not_incremented",
        "must increase by exactly one",
      ),
    );
  }
  try {
    if (compareMonths(next.currentMonth, previous.currentMonth) < 0) {
      violations.push(
        violation(
          "currentMonth",
          "month_regressed",
          "must not move backward",
        ),
      );
    }
  } catch {
    violations.push(
      violation(
        "currentMonth",
        "invalid_transition_month",
        "both transition months must be canonical YYYY-MM values",
      ),
    );
  }

  const commandHistoryAppended =
    next.acceptedCommandIds.length === previous.acceptedCommandIds.length + 1 &&
    previous.acceptedCommandIds.every(
      (acceptedCommandId, index) =>
        next.acceptedCommandIds[index] === acceptedCommandId,
    ) &&
    next.acceptedCommandIds[previous.acceptedCommandIds.length] === commandId;
  if (!commandHistoryAppended) {
    violations.push(
      violation(
        "acceptedCommandIds",
        "accepted_command_ids_not_appended",
        "must preserve the prior prefix and append exactly the accepted command id",
      ),
    );
  }

  if (
    previous.ledger.accounts !== next.ledger.accounts &&
    !canonicalEqual(previous.ledger.accounts, next.ledger.accounts)
  ) {
    violations.push(
      violation(
        "ledger.accounts",
        "ledger_accounts_changed",
        "account ids and definitions must not change during a command",
      ),
    );
  }
  const ledgerPrefixPreserved =
    next.ledger.transactions.length >= previous.ledger.transactions.length &&
    previous.ledger.transactions.every((transaction, index) => {
      const nextTransaction = next.ledger.transactions[index];
      return (
        transaction === nextTransaction ||
        canonicalEqual(transaction, nextTransaction)
      );
    });
  if (!ledgerPrefixPreserved) {
    violations.push(
      violation(
        "ledger.transactions",
        "ledger_transaction_prefix_changed",
        "prior transactions must remain an immutable canonical prefix",
      ),
    );
  }

  if (
    previous.outcome !== null &&
    !canonicalEqual(previous.outcome, next.outcome)
  ) {
    violations.push(
      violation(
        "outcome",
        "terminal_outcome_changed",
        "a terminal outcome must not disappear or change",
      ),
    );
  }

  return violations;
}

export function assertValidGameStateTransitionV2(
  previous: GameStateV2,
  next: GameStateV2,
  commandId: string,
): void {
  const violations = validateGameStateTransitionV2(previous, next, commandId);
  if (violations.length > 0) {
    throw new InvalidGameStateTransitionV2Error(violations);
  }
}
