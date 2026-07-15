import type { DetailedFinanceCommand } from "../../core/detailed-actions-v2";
import type { GameState } from "../../core/game-state";
import type { GameStateV2 } from "../../core/game-state-v2";
import type { ResolveEventChoiceV2Command } from "../../core/event-lifecycle-v2";
import type {
  MonthlyTurnV2Record,
  ProcessMonthV2Command,
} from "../../core/monthly-turn-v2";
import type { SetRecurringStrategyCommand } from "../../core/recurring-strategy-v2";
import type { ManageLifeMilestoneV2Command } from "../../core/life-milestones-v2";
import type { RecordLearningInteractionV2Command } from "../../core/learning-interaction-v2";
import type { QueueAiWorldEventV2Command } from "../../core/ai-world-event-v2";

export type CreatedRun = Readonly<{
  runId: string;
  accessSecret: string;
  state: GameState;
  stateChecksum: string;
}>;

export type CreatedRunV2 = Readonly<{
  runId: string;
  accessSecret: string;
  state: GameStateV2;
  stateChecksum: string;
}>;

export type AppliedCommand = Readonly<{
  state: GameState;
  stateChecksum: string;
  idempotentReplay: boolean;
}>;

export type GameCommandV2 =
  | DetailedFinanceCommand
  | SetRecurringStrategyCommand
  | ResolveEventChoiceV2Command
  | ManageLifeMilestoneV2Command
  | RecordLearningInteractionV2Command
  | QueueAiWorldEventV2Command
  | ProcessMonthV2Command;

export type AppliedCommandV2 = Readonly<{
  state: GameStateV2;
  stateChecksum: string;
  idempotentReplay: boolean;
  monthlyRecord: MonthlyTurnV2Record | null;
}>;

export type MigratedRun = Readonly<{
  state: GameStateV2;
  stateChecksum: string;
  idempotentReplay: boolean;
}>;

export class RunRepositoryError extends Error {
  readonly code:
    | "INVALID_RUN_ID"
    | "NOT_FOUND_OR_UNAUTHORIZED"
    | "IDEMPOTENCY_MISMATCH"
    | "CORRUPT_STATE"
    | "UNSUPPORTED_STATE_SCHEMA"
    | "OPTIMISTIC_CONFLICT"
    | "PERSISTENCE_INVARIANT";
  override readonly cause?: unknown;

  constructor(
    code: RunRepositoryError["code"],
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = "RunRepositoryError";
    this.code = code;
    this.cause = cause;
  }
}
