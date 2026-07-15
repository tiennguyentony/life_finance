import { addMoney, moneyCents } from "./domain/money";
import { addMonths, type SimulationMonth } from "./domain/month";
import { applyEvent, type EventTier } from "./events";
import { finalizeGameStateV2, type GameStateV2 } from "./game-state-v2";
import { adjudicateHealthClaim } from "./insurance-v2";
import type { ScheduledPersonalEventV2 } from "./event-scheduler-v2";
import { getEventTemplate } from "../data/event-templates";

const COMMAND_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

export type ResolveEventChoiceV2Command = Readonly<{
  schemaVersion: 2;
  id: string;
  type: "resolve_event_choice";
  expectedRevision: number;
  effectiveMonth: SimulationMonth;
  payload: Readonly<{
    eventId: string;
    choiceId: string;
  }>;
}>;

export class EventLifecycleV2Error extends Error {
  readonly code:
    | "INVALID_COMMAND"
    | "DUPLICATE_COMMAND"
    | "STALE_REVISION"
    | "RUN_TERMINAL"
    | "PENDING_EVENT_EXISTS"
    | "NO_PENDING_EVENT"
    | "EVENT_MISMATCH"
    | "INVALID_CHOICE";

  constructor(code: EventLifecycleV2Error["code"], message: string) {
    super(message);
    this.name = "EventLifecycleV2Error";
    this.code = code;
  }
}

function cooldownMonths(tier: Exclude<EventTier, "ambient">): number {
  switch (tier) {
    case "micro":
      return 3;
    case "medium":
      return 6;
    case "large":
      return 9;
    case "catastrophe":
      return 12;
  }
}

export function queueScheduledPersonalEventV2(
  state: GameStateV2,
  scheduled: ScheduledPersonalEventV2,
): GameStateV2 {
  if (state.outcome) {
    throw new EventLifecycleV2Error("RUN_TERMINAL", "terminal runs reject new events");
  }
  if (state.gameplay.eventLifecycle.pending) {
    throw new EventLifecycleV2Error(
      "PENDING_EVENT_EXISTS",
      "a pending event must be resolved before another can be queued",
    );
  }
  const { proposal, template, targetedWeakness } = scheduled;
  if (
    template.kind !== "personal_shock" ||
    template.tier === "ambient" ||
    proposal.templateId !== template.id ||
    proposal.templateVersion !== template.version ||
    !template.targetsWeaknesses.includes(targetedWeakness)
  ) {
    throw new EventLifecycleV2Error(
      "INVALID_COMMAND",
      "scheduler output does not match its engine-owned personal template",
    );
  }
  return finalizeGameStateV2({
    ...state,
    gameplay: {
      ...state.gameplay,
      eventLifecycle: {
        ...state.gameplay.eventLifecycle,
        pending: {
          eventId: proposal.eventId,
          templateId: proposal.templateId,
          templateVersion: proposal.templateVersion,
          tier: template.tier,
          targetedWeakness,
          parameters: { ...proposal.parameters },
          choiceIds: template.choices.map(({ id }) => id),
          scheduledMonth: state.currentMonth,
          expiresMonth: addMonths(state.currentMonth, 1),
        },
      },
    },
  });
}

function validateChoiceCommand(
  state: GameStateV2,
  command: ResolveEventChoiceV2Command,
): void {
  if (
    command.schemaVersion !== 2 ||
    command.type !== "resolve_event_choice" ||
    !COMMAND_ID.test(command.id) ||
    !Number.isSafeInteger(command.expectedRevision) ||
    command.expectedRevision < 0 ||
    command.effectiveMonth !== state.currentMonth ||
    command.payload.eventId.length === 0 ||
    command.payload.choiceId.length === 0
  ) {
    throw new EventLifecycleV2Error("INVALID_COMMAND", "invalid event choice envelope");
  }
  if (state.acceptedCommandIds.includes(command.id)) {
    throw new EventLifecycleV2Error("DUPLICATE_COMMAND", "event choice was already accepted");
  }
  if (command.expectedRevision !== state.revision) {
    throw new EventLifecycleV2Error("STALE_REVISION", "event choice revision is stale");
  }
  if (state.outcome) {
    throw new EventLifecycleV2Error("RUN_TERMINAL", "terminal runs reject event choices");
  }
}

export function resolveEventChoiceV2(
  state: GameStateV2,
  command: ResolveEventChoiceV2Command,
): GameStateV2 {
  validateChoiceCommand(state, command);
  const pending = state.gameplay.eventLifecycle.pending;
  if (!pending) {
    throw new EventLifecycleV2Error("NO_PENDING_EVENT", "run has no pending event");
  }
  if (pending.eventId !== command.payload.eventId) {
    throw new EventLifecycleV2Error(
      "EVENT_MISMATCH",
      "choice must reference the server-owned pending event",
    );
  }
  if (!pending.choiceIds.includes(command.payload.choiceId)) {
    throw new EventLifecycleV2Error(
      "INVALID_CHOICE",
      "choice is not declared by the pending event template",
    );
  }
  const template = getEventTemplate(pending.templateId, pending.templateVersion);
  const proposal = {
    eventId: pending.eventId,
    templateId: pending.templateId,
    templateVersion: pending.templateVersion,
    parameters: pending.parameters,
  };
  const projection = { ...state, schemaVersion: 1 as const, engineVersion: "4.0.0" as const };
  const application = applyEvent(projection, template, proposal, command.payload.choiceId);
  let finances = application.finances;
  let insurance = state.gameplay.insurance;
  let playerCostCents = moneyCents(
    Math.max(
      0,
      application.finances.requiredObligationsCents -
        state.finances.requiredObligationsCents,
    ),
  );
  let insurerCostCents = moneyCents(0);

  if (
    pending.templateId === "personal.medical_bill" &&
    command.payload.choiceId === "use_insurance"
  ) {
    const grossBillCents = moneyCents(pending.parameters.gross_bill_cents!);
    const settlement = adjudicateHealthClaim(state, grossBillCents, true);
    playerCostCents = settlement.playerResponsibilityCents;
    insurerCostCents = settlement.insurerResponsibilityCents;
    insurance = settlement.nextInsurance;
    finances = {
      ...application.finances,
      requiredObligationsCents: addMoney(
        state.finances.requiredObligationsCents,
        playerCostCents,
      ),
    };
  }

  const cooldowns = state.gameplay.eventLifecycle.cooldowns.filter(
    ({ templateId }) => templateId !== pending.templateId,
  );
  return finalizeGameStateV2({
    ...state,
    revision: state.revision + 1,
    acceptedCommandIds: [...state.acceptedCommandIds, command.id],
    finances,
    wellbeing: application.wellbeing,
    gameplay: {
      ...state.gameplay,
      insurance,
      eventLifecycle: {
        ...state.gameplay.eventLifecycle,
        pending: null,
        history: [
          ...state.gameplay.eventLifecycle.history,
          {
            eventId: pending.eventId,
            templateId: pending.templateId,
            templateVersion: pending.templateVersion,
            tier: pending.tier,
            targetedWeakness: pending.targetedWeakness,
            parameters: { ...pending.parameters },
            choiceId: command.payload.choiceId,
            scheduledMonth: pending.scheduledMonth,
            resolvedMonth: state.currentMonth,
            playerCostCents,
            insurerCostCents,
          },
        ],
        cooldowns: [
          ...cooldowns,
          {
            templateId: pending.templateId,
            eligibleAgainMonth: addMonths(state.currentMonth, cooldownMonths(pending.tier)),
          },
        ],
      },
    },
  });
}
