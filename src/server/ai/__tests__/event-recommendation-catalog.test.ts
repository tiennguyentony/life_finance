import { describe, expect, it } from "vitest";

import { projectRunView } from "@/application/game/run-view";
import { currentRunState } from "@/application/game/__tests__/run-state.fixture";
import { queueScheduledDeclarativePersonalEventV2 } from "@/core/event-lifecycle-v2";
import { PRODUCTION_PERSONAL_EVENT_TEMPLATES_V2 } from "@/data/personal-event-templates-v2";

import { buildEventRecommendationPolicy } from "../event-recommendation-policy";

const PRIORITY_PROMPTS = [
  ["What would you recommend to protect my cash?", "protect_cash"],
  ["Recommend the lowest total cost.", "minimize_total_cost"],
  ["I want to avoid an ongoing monthly payment. What do you recommend?", "avoid_ongoing_cost"],
  ["Recommend what best protects my wellbeing and happiness.", "protect_wellbeing"],
] as const;

function midpointParameters(
  template: (typeof PRODUCTION_PERSONAL_EVENT_TEMPLATES_V2)[number],
): Readonly<Record<string, number>> {
  return Object.fromEntries(template.parameters.map(({ id, minimum, maximum }) => [
    id,
    Math.floor(minimum + (maximum - minimum) / 2),
  ]));
}

describe("event recommendation production catalog", () => {
  it("produces deterministic, bounded recommendations for every active template and priority", () => {
    expect(PRODUCTION_PERSONAL_EVENT_TEMPLATES_V2.length).toBeGreaterThan(20);

    for (const template of PRODUCTION_PERSONAL_EVENT_TEMPLATES_V2) {
      const queued = queueScheduledDeclarativePersonalEventV2(currentRunState(), {
        proposal: {
          eventId: `evt.recommendation-audit.${template.id}.v${template.version}`,
          templateId: template.id,
          templateVersion: template.version,
          parameters: midpointParameters(template),
        },
        template,
        targetedWeakness: "unrelated_hazard",
      });
      const run = projectRunView(queued);
      if (run.pendingInteraction.kind !== "event") {
        throw new Error(`missing projected event for ${template.id}@${template.version}`);
      }
      const enabledIds = new Set(
        run.pendingInteraction.choices
          .filter(({ enabled }) => enabled)
          .map(({ id }) => id),
      );
      expect(enabledIds.size, `${template.id} must expose an enabled response`).toBeGreaterThan(0);

      for (const [prompt, expectedPriority] of PRIORITY_PROMPTS) {
        const conversation = [{ role: "player" as const, content: prompt }];
        const first = buildEventRecommendationPolicy(
          run,
          run.pendingInteraction,
          conversation,
        );
        const repeated = buildEventRecommendationPolicy(
          run,
          run.pendingInteraction,
          conversation,
        );

        expect(first, `${template.id} / ${expectedPriority}`).toEqual(repeated);
        expect(first.priority).toBe(expectedPriority);
        expect(enabledIds.has(first.choiceId)).toBe(true);
        expect(first.rationale).toContain(
          run.pendingInteraction.choices.find(({ id }) => id === first.choiceId)?.label,
        );
        expect(first.rationale.length).toBeLessThanOrEqual(500);
        expect(first.tradeoff.length).toBeLessThanOrEqual(500);
        expect(first.evidence).toHaveLength(2);
        expect(new Set(first.requiredEvidenceIds).size).toBe(2);
        expect(`${first.rationale} ${first.tradeoff}`).not.toMatch(
          /\b(?:NaN|undefined|Infinity)\b/u,
        );
      }
    }
  });
});
