import type {
  CommandResponseWire,
  InterpretEventResponse,
  RunViewWire,
} from "@/contracts/api/contracts";

type EventClient = Readonly<{
  interpretEvent(
    runId: string,
    request: Readonly<{
      eventId: string;
      expectedRevision: number;
      selectedChoiceId?: string;
      conversation: readonly Readonly<{
        role: "player" | "sprout";
        content: string;
      }>[];
    }>,
  ): Promise<InterpretEventResponse>;
  submitCommand(
    runId: string,
    command: Readonly<{
      id: string;
      expectedRevision: number;
      effectiveMonth: string;
      type: "resolve_event_choice";
      payload: Readonly<{ eventId: string; choiceId: string }>;
    }>,
  ): Promise<CommandResponseWire>;
}>;

export type InteractiveEventDecisionResult = Readonly<{
  interpretation: InterpretEventResponse;
  committedRun: RunViewWire | null;
}>;

export async function processInteractiveEventDecision(
  client: EventClient,
  run: RunViewWire,
  conversation: readonly Readonly<{
    role: "player" | "sprout";
    content: string;
  }>[],
  commandId: string,
  selectedChoiceId?: string,
): Promise<InteractiveEventDecisionResult> {
  if (run.pendingInteraction.kind !== "event") {
    throw new Error("The game has no event waiting for a decision.");
  }
  const event = run.pendingInteraction;
  const interpretation = await client.interpretEvent(run.runId, {
    eventId: event.eventId,
    expectedRevision: run.revision,
    conversation,
    ...(selectedChoiceId === undefined ? {} : { selectedChoiceId }),
  });
  if (interpretation.status !== "mapped" || interpretation.choiceId === null) {
    return Object.freeze({ interpretation, committedRun: null });
  }
  const response = await client.submitCommand(run.runId, {
    id: commandId,
    expectedRevision: run.revision,
    effectiveMonth: run.currentMonth,
    type: "resolve_event_choice",
    payload: {
      eventId: event.eventId,
      choiceId: interpretation.choiceId,
    },
  });
  return Object.freeze({ interpretation, committedRun: response.run });
}
