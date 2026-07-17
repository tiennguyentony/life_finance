import { sha256Canonical } from "./canonical";
import { compareMonths } from "./domain/month";
import {
  type GameStateV2,
  type ResolvedEventEvidenceV2,
} from "./game-state-v2";
import type { GameStateV2ValidationOptions } from "./game-state-v2-validation";
import type {
  PersonalEventTemplateV2,
} from "./personal-event-v2";
import { SCENARIO_DIRECTOR_POLICY_V1 } from "./scenario-director-policy-v2";
import type {
  ScenarioDirectorInputV2,
  ScenarioDirectorRecentDecisionV2,
} from "./scenario-director-v2";
import { getEventTemplate } from "../data/event-templates";
import { getPersonalEventTemplateV2 } from "../data/personal-event-templates-v2";

export const SCENARIO_DIRECTOR_CONTEXT_V2_VERSION =
  "scenario-director-context-v2" as const;

export type ScenarioDirectorStateContextV2 = Readonly<{
  version: typeof SCENARIO_DIRECTOR_CONTEXT_V2_VERSION;
  macro: ScenarioDirectorInputV2["macro"];
  recentDecisions: ScenarioDirectorInputV2["recentDecisions"];
  recentEvents: ScenarioDirectorInputV2["recentEvents"];
  lessonExposureCounts: ScenarioDirectorInputV2["lessonExposureCounts"];
  difficulty: ScenarioDirectorInputV2["difficulty"];
  storyArc?: ScenarioDirectorInputV2["storyArc"];
}>;

type ProjectContextOptions = GameStateV2ValidationOptions;

const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

/**
 * Version-bound semantic evidence for engine-owned macro templates. These are
 * identifiers used only to rank an already-generated candidate permutation.
 */
const MACRO_STORY_TAGS_V1 = Object.freeze({
  "macro.tech_boom@1": Object.freeze([
    "category.opportunity",
    "theme.growth",
  ]),
  "macro.rate_hike@1": Object.freeze([
    "category.behavioral_trap",
    "theme.fixed_costs",
  ]),
  "macro.housing_surge@1": Object.freeze([
    "category.behavioral_trap",
    "theme.fixed_costs",
  ]),
  "macro.recession_warning@1": Object.freeze([
    "category.opportunity",
    "theme.resilience",
  ]),
  "macro.oil_shock@1": Object.freeze([
    "category.health",
    "theme.resilience",
  ]),
} satisfies Readonly<Record<string, readonly string[]>>);

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function uniqueBoundedTags(values: readonly string[]): readonly string[] {
  const tags = [...new Set(values)].slice(
    0,
    SCENARIO_DIRECTOR_POLICY_V1.maximumTagsPerRecord,
  );
  if (tags.some((tag) => !IDENTIFIER.test(tag))) {
    throw new RangeError("Scenario Director context contains an unsafe tag");
  }
  return Object.freeze(tags);
}

export function scenarioDirectorTagsForCandidateV2(
  template: Pick<
    PersonalEventTemplateV2,
    "id" | "category" | "severityTier" | "responses"
  >,
  targetedWeakness: ScenarioDirectorInputV2["candidates"][number]["targetedWeakness"],
): readonly string[] {
  return uniqueBoundedTags([
    `template.${template.id}`,
    `category.${template.category}`,
    `tier.${template.severityTier}`,
    ...(targetedWeakness === "unrelated_hazard"
      ? []
      : [`weakness.${targetedWeakness}`]),
    ...template.responses.map(({ id }) => `choice.${id}`),
  ]);
}

function exactDeclarativeTemplate(
  event: ResolvedEventEvidenceV2,
  catalog: readonly PersonalEventTemplateV2[] | undefined,
): PersonalEventTemplateV2 {
  const suppliedTemplate = catalog?.find(
        ({ id, version }) =>
          id === event.templateId && version === event.templateVersion,
      );
  let template = suppliedTemplate;
  if (template === undefined) {
    try {
      template = getPersonalEventTemplateV2(
        event.templateId,
        event.templateVersion,
      );
    } catch {
      template = undefined;
    }
  }
  if (
    template === undefined ||
    event.eventSchemaVersion !== 2 ||
    event.category !== template.category ||
    event.tier !== template.severityTier ||
    event.classification !== template.classification ||
    sha256Canonical(event.lessonTags) !== sha256Canonical(template.lessonTags) ||
    !template.responses.some(({ id }) => id === event.choiceId)
  ) {
    throw new RangeError(
      "Scenario Director recent decision does not match verified event lifecycle evidence",
    );
  }
  return template;
}

function recentDecision(
  event: ResolvedEventEvidenceV2,
  catalog: readonly PersonalEventTemplateV2[] | undefined,
): ScenarioDirectorRecentDecisionV2 {
  const template = exactDeclarativeTemplate(event, catalog);
  return Object.freeze({
    decisionId: event.commandId,
    month: event.resolvedMonth,
    reasonCode: `choice.${event.choiceId}`,
    semanticTags: uniqueBoundedTags([
      `choice.${event.choiceId}`,
      `category.${template.category}`,
      `tier.${template.severityTier}`,
      ...(event.targetedWeakness === "unrelated_hazard"
        ? []
        : [`weakness.${event.targetedWeakness}`]),
      template.lessonTags.primary,
      ...template.lessonTags.secondary,
    ]),
  });
}

function activeStoryContext(
  state: GameStateV2,
): ScenarioDirectorInputV2["storyArc"] {
  const stories = [...state.gameplay.eventLifecycle.macroStories].sort(
    (left, right) => {
      const byMonth = compareMonths(left.startedMonth, right.startedMonth);
      return byMonth || left.storyId.localeCompare(right.storyId);
    },
  );
  const story = stories.at(-1);
  if (story === undefined) return undefined;

  let template;
  try {
    template = getEventTemplate(story.templateId, story.templateVersion);
  } catch {
    throw new RangeError(
      "Scenario Director macro story must match an engine-owned template version",
    );
  }
  const expectedStoryId = `story.${story.startedMonth}.${template.id}`;
  const parameterDefinitions = new Map(
    template.parameters.map((parameter) => [parameter.id, parameter]),
  );
  const parameterEntries = Object.entries(story.parameters);
  const semanticTags = MACRO_STORY_TAGS_V1[
    `${template.id}@${template.version}` as keyof typeof MACRO_STORY_TAGS_V1
  ];
  if (
    template.kind !== "macro" ||
    story.storyId !== expectedStoryId ||
    semanticTags === undefined ||
    parameterEntries.length !== template.parameters.length ||
    parameterEntries.some(([id, value]) => {
      const definition = parameterDefinitions.get(id);
      return (
        definition === undefined ||
        !Number.isSafeInteger(value) ||
        value < definition.minimum ||
        value > definition.maximum
      );
    })
  ) {
    throw new RangeError(
      "Scenario Director macro story evidence is not canonical or bounded",
    );
  }
  return Object.freeze({
    arcId: story.storyId,
    tags: uniqueBoundedTags([
      `story.template.${template.id}`,
      ...semanticTags,
    ]),
  });
}

export function projectScenarioDirectorStateContextV2(
  state: GameStateV2,
  options: ProjectContextOptions = {},
): ScenarioDirectorStateContextV2 {
  const balance = state.gameplay.runtimeBalance?.version === 2
    ? state.gameplay.runtimeBalance
    : undefined;
  const declarativeHistory = state.gameplay.eventLifecycle.history.filter(
    (event) => event.eventSchemaVersion === 2,
  );
  const recentDecisions = declarativeHistory
    .slice(-SCENARIO_DIRECTOR_POLICY_V1.maximumRecentDecisions)
    .map((event) => recentDecision(event, options.personalEventCatalog));
  const recentEvents = (balance?.recentEvents ?? [])
    .slice(-SCENARIO_DIRECTOR_POLICY_V1.maximumRecentEvents)
    .map((event) => Object.freeze({
      templateId: event.templateId,
      templateVersion: event.templateVersion,
      category: event.category,
      tier: event.tier,
      targetedWeakness: event.targetedWeakness,
      lessonTags: Object.freeze([...event.lessonTags]),
      month: event.approvedMonth,
    }));
  const storyArc = activeStoryContext(state);

  return deepFreeze({
    version: SCENARIO_DIRECTOR_CONTEXT_V2_VERSION,
    macro: Object.freeze({
      regime: state.marketRegime,
      tags: uniqueBoundedTags([
        `macro.${state.marketRegime}`,
        ...(storyArc?.tags ?? []),
      ]),
    }),
    recentDecisions: Object.freeze(recentDecisions),
    recentEvents: Object.freeze(recentEvents),
    lessonExposureCounts: Object.freeze(
      (balance?.lessonExposureCounts ?? []).map(({ lessonTag, count }) =>
        Object.freeze({ lessonTag, count }),
      ),
    ),
    difficulty: balance?.difficulty ?? "normal",
    ...(storyArc === undefined ? {} : { storyArc }),
  });
}
