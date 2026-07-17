import { describe, expect, it } from "vitest";

import { sha256Canonical } from "../canonical";
import { moneyCents, ratePpm } from "../domain/money";
import { addMonths, simulationMonth } from "../domain/month";
import {
  queueScheduledDeclarativePersonalEventV2,
  resolveEventChoiceV2,
} from "../event-lifecycle-v2";
import { finalizeGameStateV2 } from "../game-state-v2";
import { createNativeGameStateV2 } from "../native-game-state-v2";
import { decodePersistedGameState } from "../persisted-game-state";
import { analyzeRiskV1 } from "../risk-v1";
import {
  projectScenarioDirectorStateContextV2,
  scenarioDirectorTagsForCandidateV2,
} from "../scenario-director-context-v2";
import { rankScenarioCandidatesV2 } from "../scenario-director-v2";
import { SCENARIO_DIRECTOR_V2_VERSION } from "../scenario-director-policy-v2";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";
import { getPersonalEventTemplateV2 } from "../../data/personal-event-templates-v2";
import { resolveScenarioCatalogSelection } from "../scenario-catalog";

function state() {
  const resolvedScenario = resolveScenarioCatalogSelection(
    US_2026_SCENARIO_CATALOG,
    {
      catalogVersion: US_2026_SCENARIO_CATALOG_VERSION,
      locationId: "location.seattle",
      careerId: "career.software",
      householdId: "household.single",
      benefitsPackageId: "benefits.corporate_flex",
      healthPlanId: "health.hdhp_hsa",
      retirementPlanId: "retirement.401k_standard",
      insuranceCoverageIds: ["insurance.renters"],
      scenarioId: "scenario.fresh_start",
    },
  );
  return createNativeGameStateV2({
    runId: "run.scenario-director-context",
    playerId: "player.scenario-director-context",
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "scenario-director-context",
    resolvedScenario,
    annualGrossSalaryCents: moneyCents(12_000_000),
    finances: {
      cashCents: moneyCents(2_000_000),
      taxableBroadIndexCents: moneyCents(0),
      taxableSectorCents: moneyCents(0),
      taxableSpeculativeCents: moneyCents(0),
      retirement401kCents: moneyCents(0),
      retirementIraCents: moneyCents(0),
      hsaCents: moneyCents(0),
      homeValueCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      termDebts: [],
      revolvingCreditLimitCents: moneyCents(1_000_000),
      revolvingCreditUsedCents: moneyCents(0),
    },
    wellbeing: {
      burnoutPpm: ratePpm(100_000),
      happinessPpm: ratePpm(900_000),
    },
  });
}

function stateWithChoiceAndStory() {
  const opening = state();
  const medical = getPersonalEventTemplateV2("personal.medical_bill", 2);
  const queued = queueScheduledDeclarativePersonalEventV2(opening, {
    proposal: {
      eventId: "event.context.medical",
      templateId: medical.id,
      templateVersion: medical.version,
      parameters: { gross_bill_cents: 100_000 },
    },
    template: medical,
    targetedWeakness: "unrelated_hazard",
  });
  const resolved = resolveEventChoiceV2(queued, {
    schemaVersion: 2,
    id: "cmd.context.use-insurance",
    type: "resolve_event_choice",
    expectedRevision: queued.revision,
    effectiveMonth: queued.currentMonth,
    payload: {
      eventId: queued.gameplay.eventLifecycle.pending!.eventId,
      choiceId: "use_insurance",
    },
  });
  return finalizeGameStateV2({
    ...resolved,
    gameplay: {
      ...resolved.gameplay,
      eventLifecycle: {
        ...resolved.gameplay.eventLifecycle,
        activeStoryIds: ["story.2026-07.macro.tech_boom"],
        macroStories: [{
          storyId: "story.2026-07.macro.tech_boom",
          templateId: "macro.tech_boom",
          templateVersion: 1,
          parameters: { equity_boost_ppm: 10_000 },
          startedMonth: resolved.currentMonth,
          expiresMonth: addMonths(resolved.currentMonth, 2),
          returnModifiersPpm: {
            equity: ratePpm(10_000),
            bonds: ratePpm(-2_000),
            cash: ratePpm(0),
            housing: ratePpm(0),
          },
        }],
      },
    },
  });
}

describe("Scenario Director state context v2 integration", () => {
  it("projects bounded immutable choice and active macro-story evidence", () => {
    const rich = stateWithChoiceAndStory();
    const context = projectScenarioDirectorStateContextV2(rich);

    expect(context.recentDecisions).toEqual([{
      decisionId: "cmd.context.use-insurance",
      month: simulationMonth("2026-07"),
      reasonCode: "choice.use_insurance",
      semanticTags: expect.arrayContaining([
        "choice.use_insurance",
        "category.health",
        "lesson.insurance",
      ]),
    }]);
    expect(context.storyArc).toEqual({
      arcId: "story.2026-07.macro.tech_boom",
      tags: expect.arrayContaining([
        "story.template.macro.tech_boom",
        "category.opportunity",
      ]),
    });
    expect(context.macro.tags).toContain("macro.expansion");
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.recentDecisions)).toBe(true);
    expect(Object.isFrozen(context.storyArc?.tags)).toBe(true);
  });

  it("makes a verified response choice and macro story relevant only through ranking tags", () => {
    const rich = stateWithChoiceAndStory();
    const context = projectScenarioDirectorStateContextV2(rich);
    const medical = getPersonalEventTemplateV2("personal.medical_bill", 2);
    const bonus = getPersonalEventTemplateV2("personal.performance_bonus", 2);
    const input = {
      version: SCENARIO_DIRECTOR_V2_VERSION,
      month: rich.currentMonth,
      riskSnapshot: analyzeRiskV1(rich),
      macro: context.macro,
      candidates: [medical, bonus].map((template) => ({
        templateId: template.id,
        templateVersion: template.version,
        category: template.category,
        tier: template.severityTier,
        targetedWeakness: "unrelated_hazard" as const,
        lessonTags: template.lessonTags,
        directorTags: scenarioDirectorTagsForCandidateV2(
          template,
          "unrelated_hazard",
        ),
      })),
      recentDecisions: context.recentDecisions,
      recentEvents: context.recentEvents,
      lessonExposureCounts: context.lessonExposureCounts,
      difficulty: context.difficulty,
      storyArc: context.storyArc,
    };

    const decision = rankScenarioCandidatesV2(input);
    const medicalScore = decision.ranked.find(
      ({ templateId }) => templateId === medical.id,
    )!;
    const bonusScore = decision.ranked.find(
      ({ templateId }) => templateId === bonus.id,
    )!;
    expect(medicalScore.scoreComponents.recentDecisionRelevance).toBeGreaterThan(0);
    expect(bonusScore.scoreComponents.recentDecisionRelevance).toBe(0);
    expect(bonusScore.scoreComponents.narrativeContinuity).toBeGreaterThan(0);
    expect(medicalScore.scoreComponents.narrativeContinuity).toBe(0);
  });

  it("round-trips identical context and rejects tampered lifecycle evidence", () => {
    const rich = stateWithChoiceAndStory();
    const reloaded = decodePersistedGameState(
      JSON.parse(JSON.stringify(rich)) as unknown,
    );
    if (reloaded.schemaVersion !== 2) throw new Error("expected v2 replay");
    expect(sha256Canonical(projectScenarioDirectorStateContextV2(reloaded))).toBe(
      sha256Canonical(projectScenarioDirectorStateContextV2(rich)),
    );

    const tamperedChoice = JSON.parse(JSON.stringify(rich)) as typeof rich;
    (tamperedChoice.gameplay.eventLifecycle.history[0] as { choiceId: string }).choiceId =
      "spoofed_choice";
    expect(() => decodePersistedGameState(tamperedChoice)).toThrow();

    const tamperedStory = JSON.parse(JSON.stringify(rich)) as typeof rich;
    (tamperedStory.gameplay.eventLifecycle.macroStories[0] as {
      templateVersion: number;
    }).templateVersion = 999;
    expect(() => projectScenarioDirectorStateContextV2(tamperedStory)).toThrow(
      /macro story/i,
    );
  });
});
