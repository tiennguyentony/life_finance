import { addMoney, moneyCents } from "./domain/money";
import { addMonths, type SimulationMonth } from "./domain/month";
import {
  applyEvent,
  UNRELATED_HAZARD_TARGET,
  type EventTier,
} from "./events";
import { finalizeGameStateV2, type GameStateV2 } from "./game-state-v2";
import type { GameStateV2ValidationOptions } from "./game-state-v2-validation";
import { adjudicateHealthClaim } from "./insurance-v2";
import type { ScheduledPersonalEventV2 } from "./event-scheduler-v2";
import { getEventTemplate } from "../data/event-templates";
import {
  validatePersonalEventTemplateV2,
  type PersonalEventTemplateV2,
  type ScheduledDeclarativePersonalEventV2,
} from "./personal-event-v2";
import { resolvePersonalEventResponseV2 } from "./personal-event-effects-v2";
import { getPersonalEventTemplateV2 } from "../data/personal-event-templates-v2";
import { canonicalJson } from "./canonical";

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
    | "PENDING_EVENT_UNRESOLVED"
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
  validationOptions: GameStateV2ValidationOptions = {},
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
    (targetedWeakness !== UNRELATED_HAZARD_TARGET &&
      !template.targetsWeaknesses.includes(targetedWeakness))
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
  }, validationOptions);
}

export function queueScheduledDeclarativePersonalEventV2(
  state: GameStateV2,
  scheduled: ScheduledDeclarativePersonalEventV2,
  options: Readonly<{
    personalEventCatalog?: readonly PersonalEventTemplateV2[];
  }> = {},
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
  let canonicalTemplate: PersonalEventTemplateV2 | null;
  try {
    canonicalTemplate = options.personalEventCatalog === undefined
      ? getPersonalEventTemplateV2(template.id, template.version)
      : options.personalEventCatalog.find(
          ({ id, version }) => id === template.id && version === template.version,
        ) ?? null;
  } catch {
    canonicalTemplate = null;
  }
  if (
    canonicalTemplate === null ||
    canonicalJson(template) !== canonicalJson(canonicalTemplate) ||
    validatePersonalEventTemplateV2(template).length > 0 ||
    proposal.templateId !== template.id ||
    proposal.templateVersion !== template.version ||
    targetedWeakness !== UNRELATED_HAZARD_TARGET ||
    template.parameters.some((parameter) => {
      const value = proposal.parameters[parameter.id];
      return !Number.isSafeInteger(value) || value! < parameter.minimum || value! > parameter.maximum;
    }) ||
    Object.keys(proposal.parameters).length !== template.parameters.length
  ) {
    throw new EventLifecycleV2Error(
      "INVALID_COMMAND",
      "declarative scheduler output does not match its versioned template",
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
          tier: template.severityTier,
          targetedWeakness,
          parameters: { ...proposal.parameters },
          choiceIds: template.responses.map(({ id }) => id),
          scheduledMonth: state.currentMonth,
          expiresMonth: addMonths(state.currentMonth, 1),
          eventSchemaVersion: 2,
          category: template.category,
          classification: template.classification,
          lessonTags: template.lessonTags,
          pressureCost: template.pressureCost,
          recoveryDurationMonths: template.recovery.durationMonths,
          fallbackNarrative: template.fallbackNarrative,
          ...(scheduled.followUpSourceEventId === undefined
            ? {}
            : { followUpSourceEventId: scheduled.followUpSourceEventId }),
        },
        ...(scheduled.followUpSourceEventId === undefined
          ? {}
          : {
              scheduledFollowUps: (
                state.gameplay.eventLifecycle.scheduledFollowUps ?? []
              ).filter(
                (followUp) => !(
                  followUp.sourceEventId === scheduled.followUpSourceEventId &&
                  followUp.templateId === template.id &&
                  followUp.templateVersion === template.version
                ),
              ),
            }),
      },
    },
  }, { personalEventCatalog: options.personalEventCatalog });
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
  options: Readonly<{
    personalEventCatalog?: readonly PersonalEventTemplateV2[];
  }> = {},
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
  if (pending.eventSchemaVersion === 2) {
    const template = options.personalEventCatalog === undefined
      ? getPersonalEventTemplateV2(pending.templateId, pending.templateVersion)
      : options.personalEventCatalog.find(
          ({ id, version }) =>
            id === pending.templateId && version === pending.templateVersion,
        );
    if (template === undefined || validatePersonalEventTemplateV2(template).length > 0) {
      throw new EventLifecycleV2Error(
        "INVALID_COMMAND",
        "pending declarative event is absent from the validated resolver catalog",
      );
    }
    const proposal = {
      eventId: pending.eventId,
      templateId: pending.templateId,
      templateVersion: pending.templateVersion,
      parameters: pending.parameters,
    };
    const application = resolvePersonalEventResponseV2(
      state,
      template,
      proposal,
      command.payload.choiceId,
      command.id,
    );
    const cooldowns = state.gameplay.eventLifecycle.cooldowns.filter(
      ({ templateId }) => templateId !== pending.templateId,
    );
    const followUps = template.followUps
      .filter(({ whenResponseIds }) => whenResponseIds.includes(command.payload.choiceId))
      .map((followUp) => ({
        sourceEventId: pending.eventId,
        templateId: followUp.templateId,
        templateVersion: followUp.templateVersion,
        eligibleMonth: addMonths(state.currentMonth, followUp.delayMonths),
      }));
    return finalizeGameStateV2({
      ...state,
      revision: state.revision + 1,
      acceptedCommandIds: [...state.acceptedCommandIds, command.id],
      finances: application.finances,
      wellbeing: application.wellbeing,
      ledger: application.ledger,
      gameplay: {
        ...state.gameplay,
        debts: application.debts,
        insurance: application.insurance,
        eventLifecycle: {
          ...state.gameplay.eventLifecycle,
          pending: null,
          history: [
            ...state.gameplay.eventLifecycle.history,
            {
              commandId: command.id,
              resultingRevision: state.revision + 1,
              eventId: pending.eventId,
              templateId: pending.templateId,
              templateVersion: pending.templateVersion,
              tier: pending.tier,
              targetedWeakness: pending.targetedWeakness,
              parameters: { ...pending.parameters },
              choiceId: command.payload.choiceId,
              availableChoiceIds: [...pending.choiceIds],
              scheduledMonth: pending.scheduledMonth,
              resolvedMonth: state.currentMonth,
              playerCostCents: application.playerCostCents,
              insurerCostCents: application.insurerCostCents,
              eventSchemaVersion: 2,
              category: template.category,
              classification: template.classification,
              lessonTags: template.lessonTags,
              pressureCost: template.pressureCost,
              recoveryDurationMonths: template.recovery.durationMonths,
              fallbackNarrative: template.fallbackNarrative,
              ...(pending.followUpSourceEventId === undefined
                ? {}
                : { followUpSourceEventId: pending.followUpSourceEventId }),
              scheduledCashFlows: application.scheduledCashFlows,
              ...(application.originatedDebts.length === 0
                ? {}
                : { originatedDebts: application.originatedDebts }),
              ...(application.livingCostPlans.length === 0
                ? {}
                : { livingCostPlans: application.livingCostPlans }),
            },
          ],
          cooldowns: [
            ...cooldowns,
            {
              templateId: pending.templateId,
              eligibleAgainMonth: addMonths(
                state.currentMonth,
                template.cooldowns.eventMonths,
              ),
            },
          ],
          scheduledFollowUps: [
            ...(state.gameplay.eventLifecycle.scheduledFollowUps ?? []),
            ...followUps,
          ],
          activeCashFlows: application.activeCashFlows,
        },
      },
    }, { personalEventCatalog: options.personalEventCatalog });
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
            commandId: command.id,
            resultingRevision: state.revision + 1,
            eventId: pending.eventId,
            templateId: pending.templateId,
            templateVersion: pending.templateVersion,
            tier: pending.tier,
            targetedWeakness: pending.targetedWeakness,
            parameters: { ...pending.parameters },
            choiceId: command.payload.choiceId,
            availableChoiceIds: [...pending.choiceIds],
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
