import {
  emptyAiLearningMemory,
  recordLearningInteraction,
  type AiLearningMemoryV1,
} from "./ai-learning-memory-v2";
import type { SimulationMonth } from "./domain/month";
import { finalizeGameStateV2, type GameStateV2 } from "./game-state-v2";

export type RecordLearningInteractionV2Command = Readonly<{
  schemaVersion: 2;
  id: string;
  type: "record_learning_interaction_v2";
  expectedRevision: number;
  effectiveMonth: SimulationMonth;
  payload: Readonly<{
    conceptId: string;
    kind: AiLearningMemoryV1["recentInteractions"][number]["kind"];
  }>;
}>;

export class LearningInteractionV2Error extends Error {
  readonly code: "INVALID_COMMAND" | "DUPLICATE_COMMAND" | "STALE_REVISION" | "RUN_TERMINAL";

  constructor(code: LearningInteractionV2Error["code"], message: string) {
    super(message);
    this.name = "LearningInteractionV2Error";
    this.code = code;
  }
}

const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

export function recordLearningInteractionV2(
  state: GameStateV2,
  command: RecordLearningInteractionV2Command,
): GameStateV2 {
  if (
    command.schemaVersion !== 2 ||
    command.type !== "record_learning_interaction_v2" ||
    !ID.test(command.id) ||
    !ID.test(command.payload.conceptId) ||
    command.effectiveMonth !== state.currentMonth ||
    !Number.isSafeInteger(command.expectedRevision) ||
    command.expectedRevision < 0
  ) {
    throw new LearningInteractionV2Error("INVALID_COMMAND", "invalid learning interaction command");
  }
  if (state.acceptedCommandIds.includes(command.id)) {
    throw new LearningInteractionV2Error("DUPLICATE_COMMAND", "command was already accepted");
  }
  if (command.expectedRevision !== state.revision) {
    throw new LearningInteractionV2Error("STALE_REVISION", "command revision is stale");
  }
  if (state.outcome) {
    throw new LearningInteractionV2Error("RUN_TERMINAL", "terminal run learning is recorded in the final debrief");
  }
  const memory = recordLearningInteraction(
    state.gameplay.aiLearningMemory ?? emptyAiLearningMemory(),
    {
      interactionId: command.id,
      conceptId: command.payload.conceptId,
      kind: command.payload.kind,
      month: state.currentMonth,
      revision: state.revision,
    },
  );
  return finalizeGameStateV2({
    ...state,
    revision: state.revision + 1,
    acceptedCommandIds: [...state.acceptedCommandIds, command.id],
    gameplay: { ...state.gameplay, aiLearningMemory: memory },
  });
}
