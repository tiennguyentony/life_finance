import { describe, expect, it } from "vitest";

import { ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import {
  emptyAiLearningMemory,
  MAX_LEARNING_INTERACTIONS,
  recordLearningInteraction,
  validateAiLearningMemory,
} from "../ai-learning-memory-v2";

describe("bounded AI learning memory", () => {
  it("retains aggregate learning while bounding recent interaction context", () => {
    let memory = emptyAiLearningMemory();
    for (let index = 0; index < 100; index += 1) {
      memory = recordLearningInteraction(memory, {
        interactionId: `lesson.${index}`,
        conceptId: "liquidity",
        kind: "ai_explanation",
        month: simulationMonth("2026-07"),
        revision: index,
      });
    }

    expect(memory.concepts).toEqual([
      expect.objectContaining({ conceptId: "liquidity", exposureCount: 100 }),
    ]);
    expect(memory.recentInteractions).toHaveLength(MAX_LEARNING_INTERACTIONS);
    expect(memory.recentInteractions[0]?.interactionId).toBe("lesson.36");
    expect(validateAiLearningMemory(memory)).toBeUndefined();
  });

  it("treats an interaction id as idempotent and rejects corrupt confidence", () => {
    const interaction = {
      interactionId: "lesson.once",
      conceptId: "401k",
      kind: "glossary" as const,
      month: simulationMonth("2026-07"),
      revision: 1,
    };
    const once = recordLearningInteraction(emptyAiLearningMemory(), interaction);
    expect(recordLearningInteraction(once, interaction)).toBe(once);
    expect(() => validateAiLearningMemory({
      ...once,
      concepts: [{ ...once.concepts[0]!, confidence: "invented", relevancePpm: ratePpm(1) }],
    } as unknown as Parameters<typeof validateAiLearningMemory>[0])).toThrow();
  });
});
