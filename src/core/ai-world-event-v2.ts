import type { SimulationMonth } from "./domain/month";
import { isAiContentSource, type AiContentSource } from "./ai-source";
import {
  demonstratedWeaknessesV2,
  eligiblePersonalEventTemplatesV2,
} from "./event-scheduler-v2";
import { queueScheduledPersonalEventV2 } from "./event-lifecycle-v2";
import { finalizeGameStateV2, type GameStateV2 } from "./game-state-v2";
import type { EventWeakness } from "./events";

export type QueueAiWorldEventV2Command = Readonly<{
  schemaVersion: 2;
  id: string;
  type: "queue_ai_world_event_v2";
  expectedRevision: number;
  effectiveMonth: SimulationMonth;
  payload: Readonly<{
    source: AiContentSource;
    templateId: string;
    templateVersion: number;
    targetedWeaknessId: EventWeakness;
    parameters: Readonly<Record<string, number>>;
    headline: string;
    narrative: string;
    rationale: string;
    citedEvidenceIds: readonly string[];
  }>;
}>;

export class AiWorldEventV2Error extends Error {
  readonly code:
    | "INVALID_COMMAND"
    | "DUPLICATE_COMMAND"
    | "STALE_REVISION"
    | "RUN_TERMINAL"
    | "PENDING_EVENT_EXISTS"
    | "INELIGIBLE_EVENT";

  constructor(code: AiWorldEventV2Error["code"], message: string) {
    super(message);
    this.name = "AiWorldEventV2Error";
    this.code = code;
  }
}

const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

export function queueAiWorldEventV2(
  state: GameStateV2,
  command: QueueAiWorldEventV2Command,
): GameStateV2 {
  const payload = command.payload;
  if (
    command.schemaVersion !== 2 ||
    command.type !== "queue_ai_world_event_v2" ||
    !ID.test(command.id) ||
    command.effectiveMonth !== state.currentMonth ||
    !Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0 ||
    !isAiContentSource(payload.source) ||
    !ID.test(payload.templateId) || !Number.isSafeInteger(payload.templateVersion) ||
    payload.headline.trim().length < 1 || payload.headline.length > 240 ||
    payload.narrative.trim().length < 1 || payload.narrative.length > 2_000 ||
    payload.rationale.trim().length < 1 || payload.rationale.length > 800
  ) {
    throw new AiWorldEventV2Error("INVALID_COMMAND", "invalid AI world-event command");
  }
  if (state.acceptedCommandIds.includes(command.id)) {
    throw new AiWorldEventV2Error("DUPLICATE_COMMAND", "command was already accepted");
  }
  if (command.expectedRevision !== state.revision) {
    throw new AiWorldEventV2Error("STALE_REVISION", "command revision is stale");
  }
  if (state.outcome) throw new AiWorldEventV2Error("RUN_TERMINAL", "terminal run rejects new events");
  if (state.gameplay.eventLifecycle.pending) {
    throw new AiWorldEventV2Error("PENDING_EVENT_EXISTS", "resolve the current event first");
  }
  const template = eligiblePersonalEventTemplatesV2(state).find(
    (candidate) => candidate.id === payload.templateId && candidate.version === payload.templateVersion,
  );
  const weaknesses = demonstratedWeaknessesV2(state);
  if (!template || !weaknesses.has(payload.targetedWeaknessId) || !template.targetsWeaknesses.includes(payload.targetedWeaknessId)) {
    throw new AiWorldEventV2Error("INELIGIBLE_EVENT", "AI event must target a currently demonstrated weakness with an eligible engine template");
  }
  const keys = Object.keys(payload.parameters).toSorted();
  const definitions = [...template.parameters].toSorted((left, right) => left.id.localeCompare(right.id));
  if (
    keys.length !== definitions.length ||
    definitions.some((definition, index) =>
      keys[index] !== definition.id ||
      !Number.isSafeInteger(payload.parameters[definition.id]) ||
      payload.parameters[definition.id]! < definition.minimum ||
      payload.parameters[definition.id]! > definition.maximum,
    )
  ) {
    throw new AiWorldEventV2Error("INELIGIBLE_EVENT", "AI event parameters must exactly match engine-owned bounds");
  }
  const queued = queueScheduledPersonalEventV2(state, {
    proposal: {
      eventId: `evt.ai.${state.currentMonth}.${state.revision}.${template.id}`,
      templateId: template.id,
      templateVersion: template.version,
      parameters: payload.parameters,
    },
    template,
    targetedWeakness: payload.targetedWeaknessId,
  });
  return finalizeGameStateV2({
    ...queued,
    revision: state.revision + 1,
    acceptedCommandIds: [...state.acceptedCommandIds, command.id],
    gameplay: {
      ...queued.gameplay,
      eventLifecycle: {
        ...queued.gameplay.eventLifecycle,
        pending: queued.gameplay.eventLifecycle.pending
          ? {
              ...queued.gameplay.eventLifecycle.pending,
              aiNarrative: {
                source: payload.source,
                headline: payload.headline,
                narrative: payload.narrative,
                rationale: payload.rationale,
                citedEvidenceIds: [...payload.citedEvidenceIds],
              },
            }
          : null,
      },
    },
  });
}
