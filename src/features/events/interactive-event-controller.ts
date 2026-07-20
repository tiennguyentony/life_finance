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
      interactionMode?: "interpret" | "recommend";
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
  interactionMode: "interpret" | "recommend" = "interpret",
): Promise<InteractiveEventDecisionResult> {
  if (run.pendingInteraction.kind !== "event") {
    throw new Error("The game has no event waiting for a decision.");
  }
  const event = run.pendingInteraction;
  const interpretation = await client.interpretEvent(run.runId, {
    eventId: event.eventId,
    expectedRevision: run.revision,
    interactionMode,
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

export async function commitInteractiveEventChoice(
  client: Pick<EventClient, "submitCommand">,
  run: RunViewWire,
  choiceId: string,
  commandId: string,
): Promise<RunViewWire> {
  if (run.pendingInteraction.kind !== "event") {
    throw new Error("The game has no event waiting for a decision.");
  }
  const event = run.pendingInteraction;
  const choice = event.choices.find(({ id, enabled }) => id === choiceId && enabled);
  if (choice === undefined) {
    throw new Error("That recommended action is no longer available.");
  }
  const response = await client.submitCommand(run.runId, {
    id: commandId,
    expectedRevision: run.revision,
    effectiveMonth: run.currentMonth,
    type: "resolve_event_choice",
    payload: {
      eventId: event.eventId,
      choiceId,
    },
  });
  return response.run;
}
