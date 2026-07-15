import { sha256Canonical } from "./canonical";
import { isAiContentSource } from "./ai-source";
import { compareMonths, simulationMonth } from "./domain/month";
import type { StateInvariantViolation } from "./game-state";
import type { GameStateV2 } from "./game-state-v2";

function violation(
  path: string,
  code: string,
  message: string,
): StateInvariantViolation {
  return { path, code, message };
}

export function validateEventAndCareerStateV2(
  state: GameStateV2,
): readonly StateInvariantViolation[] {
  const violations: StateInvariantViolation[] = [];

  const lifecycle = state.gameplay.eventLifecycle;
  const pending = lifecycle.pending;
  if (pending) {
    if (
      pending.eventId.length === 0 ||
      pending.templateId.length === 0 ||
      !Number.isSafeInteger(pending.templateVersion) ||
      pending.templateVersion < 1 ||
      pending.choiceIds.length === 0 ||
      new Set(pending.choiceIds).size !== pending.choiceIds.length ||
      pending.choiceIds.some((choiceId) => choiceId.length === 0) ||
      (pending.aiNarrative !== undefined &&
        (!isAiContentSource(pending.aiNarrative.source) ||
          pending.aiNarrative.headline.trim().length < 1 ||
          pending.aiNarrative.headline.length > 240 ||
          pending.aiNarrative.narrative.trim().length < 1 ||
          pending.aiNarrative.narrative.length > 2_000 ||
          pending.aiNarrative.rationale.trim().length < 1 ||
          pending.aiNarrative.rationale.length > 800 ||
          new Set(pending.aiNarrative.citedEvidenceIds).size !==
            pending.aiNarrative.citedEvidenceIds.length)) ||
      Object.entries(pending.parameters).some(
        ([id, value]) =>
          id.length === 0 || !Number.isSafeInteger(value),
      )
    ) {
      violations.push(
        violation(
          "gameplay.eventLifecycle.pending",
          "invalid_pending_event",
          "pending event evidence must contain stable ids, parameters, and choices",
        ),
      );
    }
    try {
      simulationMonth(pending.scheduledMonth);
      simulationMonth(pending.expiresMonth);
      if (
        pending.scheduledMonth !== state.currentMonth ||
        compareMonths(pending.expiresMonth, pending.scheduledMonth) <= 0
      ) {
        violations.push(
          violation(
            "gameplay.eventLifecycle.pending",
            "invalid_pending_window",
            "pending event must begin in the current month and expire later",
          ),
        );
      }
    } catch {
      violations.push(
        violation(
          "gameplay.eventLifecycle.pending",
          "invalid_month",
          "pending event months must use canonical YYYY-MM",
        ),
      );
    }
  }
  const eventIds = lifecycle.history.map(({ eventId }) => eventId);
  if (
    new Set(eventIds).size !== eventIds.length ||
    (pending !== null && eventIds.includes(pending.eventId))
  ) {
    violations.push(
      violation(
        "gameplay.eventLifecycle.history",
        "duplicate_event",
        "event ids must be unique across pending and resolved evidence",
      ),
    );
  }
  lifecycle.history.forEach((event, index) => {
    try {
      simulationMonth(event.scheduledMonth);
      simulationMonth(event.resolvedMonth);
      if (
        compareMonths(event.resolvedMonth, event.scheduledMonth) < 0 ||
        compareMonths(event.resolvedMonth, state.currentMonth) > 0 ||
        event.commandId.length === 0 ||
        !Number.isSafeInteger(event.resultingRevision) ||
        event.resultingRevision < 1 ||
        event.resultingRevision > state.revision ||
        event.eventId.length === 0 ||
        event.templateId.length === 0 ||
        event.choiceId.length === 0 ||
        event.availableChoiceIds.length === 0 ||
        !event.availableChoiceIds.includes(event.choiceId) ||
        new Set(event.availableChoiceIds).size !== event.availableChoiceIds.length ||
        !Number.isSafeInteger(event.playerCostCents) ||
        event.playerCostCents < 0 ||
        !Number.isSafeInteger(event.insurerCostCents) ||
        event.insurerCostCents < 0
      ) {
        throw new RangeError("invalid resolved event");
      }
    } catch {
      violations.push(
        violation(
          `gameplay.eventLifecycle.history.${index}`,
          "invalid_resolved_event",
          "resolved event evidence must be chronological and financially bounded",
        ),
      );
    }
  });
  if (new Set(state.gameplay.eventLifecycle.activeStoryIds).size !== state.gameplay.eventLifecycle.activeStoryIds.length) {
    violations.push(
      violation("gameplay.eventLifecycle.activeStoryIds", "duplicate_story", "active story ids must be unique"),
    );
  }
  const storyIds = state.gameplay.eventLifecycle.macroStories.map(
    ({ storyId }) => storyId,
  );
  if (
    new Set(storyIds).size !== storyIds.length ||
    sha256Canonical(storyIds.toSorted()) !==
      sha256Canonical([...state.gameplay.eventLifecycle.activeStoryIds].toSorted())
  ) {
    violations.push(
      violation(
        "gameplay.eventLifecycle.macroStories",
        "story_identity_mismatch",
        "active story ids must exactly identify persisted macro stories",
      ),
    );
  }
  state.gameplay.eventLifecycle.macroStories.forEach((story, index) => {
    try {
      simulationMonth(story.startedMonth);
      simulationMonth(story.expiresMonth);
      const modifiers = Object.values(story.returnModifiersPpm);
      if (
        story.storyId.length === 0 ||
        story.templateId.length === 0 ||
        !Number.isSafeInteger(story.templateVersion) ||
        story.templateVersion < 1 ||
        compareMonths(story.startedMonth, state.currentMonth) > 0 ||
        compareMonths(story.expiresMonth, state.currentMonth) < 0 ||
        compareMonths(story.expiresMonth, story.startedMonth) < 0 ||
        modifiers.length !== 4 ||
        modifiers.some(
          (modifier) =>
            !Number.isSafeInteger(modifier) ||
            modifier < -500_000 ||
            modifier > 500_000,
        )
      ) {
        throw new RangeError("invalid macro story");
      }
    } catch {
      violations.push(
        violation(
          `gameplay.eventLifecycle.macroStories.${index}`,
          "invalid_macro_story",
          "macro stories must be current, bounded, and chronological",
        ),
      );
    }
  });
  const cooldownTemplateIds = state.gameplay.eventLifecycle.cooldowns.map(
    ({ templateId }) => templateId,
  );
  if (new Set(cooldownTemplateIds).size !== cooldownTemplateIds.length) {
    violations.push(
      violation("gameplay.eventLifecycle.cooldowns", "duplicate_cooldown", "each template may have one cooldown"),
    );
  }
  state.gameplay.eventLifecycle.cooldowns.forEach((cooldown, index) => {
    try {
      simulationMonth(cooldown.eligibleAgainMonth);
      if (cooldown.templateId.length === 0) throw new RangeError("empty template");
    } catch {
      violations.push(
        violation(
          `gameplay.eventLifecycle.cooldowns.${index}`,
          "invalid_cooldown",
          "cooldown requires a template id and canonical month",
        ),
      );
    }
  });
  const development = state.gameplay.careerDevelopment;
  const developmentCommands = [
    ...development.pending.map(({ commandId }) => commandId),
    ...development.history.map(({ commandId }) => commandId),
  ];
  if (new Set(developmentCommands).size !== developmentCommands.length) {
    violations.push(
      violation(
        "gameplay.careerDevelopment",
        "duplicate_upskill",
        "upskill command ids must be unique across pending and history",
      ),
    );
  }
  development.pending.forEach((entry, index) => {
    try {
      simulationMonth(entry.startedMonth);
      simulationMonth(entry.completesMonth);
      if (
        entry.commandId.length === 0 ||
        entry.programId.length === 0 ||
        entry.catalogVersion.length === 0 ||
        entry.annualSalaryIncreaseCents <= 0 ||
        compareMonths(entry.completesMonth, state.currentMonth) <= 0 ||
        compareMonths(entry.completesMonth, entry.startedMonth) <= 0
      ) {
        throw new RangeError("invalid pending upskill");
      }
    } catch {
      violations.push(
        violation(
          `gameplay.careerDevelopment.pending.${index}`,
          "invalid_upskill",
          "pending upskill must have valid evidence and a future completion",
        ),
      );
    }
  });
  development.history.forEach((entry, index) => {
    try {
      simulationMonth(entry.startedMonth);
      simulationMonth(entry.completedMonth);
      if (
        entry.annualSalaryIncreaseCents <= 0 ||
        compareMonths(entry.completedMonth, entry.startedMonth) <= 0 ||
        compareMonths(entry.completedMonth, state.currentMonth) > 0
      ) {
        throw new RangeError("invalid completed upskill");
      }
    } catch {
      violations.push(
        violation(
          `gameplay.careerDevelopment.history.${index}`,
          "invalid_upskill",
          "completed upskill must be chronological and financially bounded",
        ),
      );
    }
  });

  return violations;
}
