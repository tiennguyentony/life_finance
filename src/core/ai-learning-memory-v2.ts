import type { RatePpm } from "./domain/money";
import type { SimulationMonth } from "./domain/month";

export const AI_LEARNING_MEMORY_VERSION = "ai-learning-v1" as const;
export const MAX_LEARNING_CONCEPTS = 64;
export const MAX_LEARNING_INTERACTIONS = 64;

export type LearningConfidence = "unknown" | "needs_practice" | "developing" | "confident";

export type AiLearningMemoryV1 = Readonly<{
  version: typeof AI_LEARNING_MEMORY_VERSION;
  audienceLevel: "beginner" | "intermediate";
  concepts: readonly Readonly<{
    conceptId: string;
    exposureCount: number;
    lastSeenMonth: SimulationMonth;
    confidence: LearningConfidence;
    relevancePpm: RatePpm;
  }>[];
  recentInteractions: readonly Readonly<{
    interactionId: string;
    conceptId: string;
    kind: "glossary" | "ai_explanation" | "decision_feedback" | "debrief";
    month: SimulationMonth;
    revision: number;
  }>[];
}>;

export function emptyAiLearningMemory(): AiLearningMemoryV1 {
  return Object.freeze({
    version: AI_LEARNING_MEMORY_VERSION,
    audienceLevel: "beginner",
    concepts: Object.freeze([]),
    recentInteractions: Object.freeze([]),
  });
}

export function validateAiLearningMemory(memory: AiLearningMemoryV1): void {
  if (
    memory.version !== AI_LEARNING_MEMORY_VERSION ||
    !["beginner", "intermediate"].includes(memory.audienceLevel) ||
    memory.concepts.length > MAX_LEARNING_CONCEPTS ||
    memory.recentInteractions.length > MAX_LEARNING_INTERACTIONS
  ) {
    throw new RangeError("AI learning memory version, level, or bounds are invalid");
  }
  const conceptIds = memory.concepts.map(({ conceptId }) => conceptId);
  const interactionIds = memory.recentInteractions.map(({ interactionId }) => interactionId);
  if (
    new Set(conceptIds).size !== conceptIds.length ||
    new Set(interactionIds).size !== interactionIds.length ||
    memory.concepts.some((concept) =>
      !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(concept.conceptId) ||
      !Number.isSafeInteger(concept.exposureCount) || concept.exposureCount < 1 ||
      !["unknown", "needs_practice", "developing", "confident"].includes(concept.confidence) ||
      !Number.isSafeInteger(concept.relevancePpm) ||
      concept.relevancePpm < 0 || concept.relevancePpm > 1_000_000
    ) ||
    memory.recentInteractions.some((interaction) =>
      !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(interaction.interactionId) ||
      !conceptIds.includes(interaction.conceptId) ||
      !Number.isSafeInteger(interaction.revision) || interaction.revision < 0
    )
  ) {
    throw new RangeError("AI learning memory identifiers or values are invalid");
  }
}

export function recordLearningInteraction(
  memory: AiLearningMemoryV1,
  interaction: AiLearningMemoryV1["recentInteractions"][number],
): AiLearningMemoryV1 {
  validateAiLearningMemory(memory);
  if (memory.recentInteractions.some(({ interactionId }) => interactionId === interaction.interactionId)) {
    return memory;
  }
  const previous = memory.concepts.find(({ conceptId }) => conceptId === interaction.conceptId);
  const nextConcept = Object.freeze({
    conceptId: interaction.conceptId,
    exposureCount: (previous?.exposureCount ?? 0) + 1,
    lastSeenMonth: interaction.month,
    confidence: previous?.confidence ?? "unknown",
    relevancePpm: previous?.relevancePpm ?? (500_000 as RatePpm),
  });
  const next = Object.freeze({
    ...memory,
    concepts: Object.freeze([
      ...memory.concepts.filter(({ conceptId }) => conceptId !== interaction.conceptId),
      nextConcept,
    ].slice(-MAX_LEARNING_CONCEPTS)),
    recentInteractions: Object.freeze([
      ...memory.recentInteractions,
      Object.freeze({ ...interaction }),
    ].slice(-MAX_LEARNING_INTERACTIONS)),
  });
  validateAiLearningMemory(next);
  return next;
}
