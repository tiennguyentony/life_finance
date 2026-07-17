import { addMonths, compareMonths } from "./domain/month";
import { nextInt } from "./domain/rng";
import { applyEvent, eventApplicabilityReasons, type MarketAssetClass } from "./events";
import { finalizeGameStateV2, type GameStateV2 } from "./game-state-v2";
import type { GameStateV2ValidationOptions } from "./game-state-v2-validation";
import { ratePpm } from "./domain/money";
import type { MarketReturnModifiers } from "./market";
import { EVENT_TEMPLATES } from "../data/event-templates";

export type MacroStoryPolicyV2 = Readonly<{
  version: "macro-story-v1";
  monthlyChancePpm: number;
  minimumDurationMonths: number;
  maximumDurationMonths: number;
}>;

export const DEFAULT_MACRO_STORY_POLICY_V2: MacroStoryPolicyV2 = Object.freeze({
  version: "macro-story-v1",
  monthlyChancePpm: 120_000,
  minimumDurationMonths: 2,
  maximumDurationMonths: 4,
});

function projection(state: GameStateV2) {
  return { ...state, schemaVersion: 1 as const, engineVersion: "4.0.0" as const };
}

function clamp(value: number): number {
  return Math.max(-500_000, Math.min(500_000, value));
}

export function activeMacroReturnModifiersV2(
  state: GameStateV2,
): MarketReturnModifiers {
  const totals: Record<MarketAssetClass, number> = {
    equity: 0,
    bonds: 0,
    cash: 0,
    housing: 0,
  };
  for (const story of state.gameplay.eventLifecycle.macroStories) {
    if (
      compareMonths(story.startedMonth, state.currentMonth) <= 0 &&
      compareMonths(story.expiresMonth, state.currentMonth) >= 0
    ) {
      for (const assetClass of Object.keys(totals) as MarketAssetClass[]) {
        totals[assetClass] = clamp(
          totals[assetClass] + story.returnModifiersPpm[assetClass],
        );
      }
    }
  }
  return Object.freeze({
    equity: ratePpm(totals.equity),
    bonds: ratePpm(totals.bonds),
    cash: ratePpm(totals.cash),
    housing: ratePpm(totals.housing),
  });
}

export function advanceMacroStoriesV2(
  state: GameStateV2,
  policy: MacroStoryPolicyV2 = DEFAULT_MACRO_STORY_POLICY_V2,
  validationOptions: GameStateV2ValidationOptions = {},
): GameStateV2 {
  if (
    policy.version !== "macro-story-v1" ||
    !Number.isSafeInteger(policy.monthlyChancePpm) ||
    policy.monthlyChancePpm < 0 ||
    policy.monthlyChancePpm > 1_000_000 ||
    !Number.isSafeInteger(policy.minimumDurationMonths) ||
    !Number.isSafeInteger(policy.maximumDurationMonths) ||
    policy.minimumDurationMonths < 1 ||
    policy.maximumDurationMonths > 24 ||
    policy.minimumDurationMonths > policy.maximumDurationMonths
  ) {
    throw new RangeError("macro story policy is outside versioned bounds");
  }
  const retained = state.gameplay.eventLifecycle.macroStories.filter(
    ({ expiresMonth }) => compareMonths(expiresMonth, state.currentMonth) >= 0,
  );
  let working = finalizeGameStateV2({
    ...state,
    gameplay: {
      ...state.gameplay,
      eventLifecycle: {
        ...state.gameplay.eventLifecycle,
        macroStories: retained,
        activeStoryIds: retained.map(({ storyId }) => storyId),
      },
    },
  }, validationOptions);
  if (working.outcome || retained.length > 0) return working;

  const candidates = EVENT_TEMPLATES.filter(
    (template) =>
      template.kind === "macro" &&
      eventApplicabilityReasons(template, projection(working)).length === 0,
  ).toSorted((left, right) => left.id.localeCompare(right.id));
  const frequency = nextInt(working.random, 1, 1_000_000);
  working = finalizeGameStateV2(
    { ...working, random: frequency.nextState },
    validationOptions,
  );
  if (candidates.length === 0 || frequency.value > policy.monthlyChancePpm) {
    return working;
  }
  const selection = nextInt(working.random, 0, candidates.length - 1);
  const template = candidates[selection.value]!;
  let random = selection.nextState;
  const parameters: Record<string, number> = {};
  for (const definition of template.parameters) {
    const draw = nextInt(random, definition.minimum, definition.maximum);
    parameters[definition.id] = draw.value;
    random = draw.nextState;
  }
  const duration = nextInt(
    random,
    policy.minimumDurationMonths,
    policy.maximumDurationMonths,
  );
  random = duration.nextState;
  const storyId = `story.${working.currentMonth}.${template.id}`;
  const application = applyEvent(
    projection(working),
    template,
    {
      eventId: storyId,
      templateId: template.id,
      templateVersion: template.version,
      parameters,
    },
  );
  const story = Object.freeze({
    storyId,
    templateId: template.id,
    templateVersion: template.version,
    parameters: Object.freeze(parameters),
    startedMonth: working.currentMonth,
    expiresMonth: addMonths(working.currentMonth, duration.value - 1),
    returnModifiersPpm: application.marketReturnModifiers,
  });
  return finalizeGameStateV2({
    ...working,
    random,
    gameplay: {
      ...working.gameplay,
      eventLifecycle: {
        ...working.gameplay.eventLifecycle,
        macroStories: [story],
        activeStoryIds: [storyId],
      },
    },
  }, validationOptions);
}
