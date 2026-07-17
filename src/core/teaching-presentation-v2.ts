import type { EducationConcept } from "../data/education-content";
import type { CheckpointEvidenceV2 } from "./checkpoint-v2";
import type { TeachingFactPacketV2 } from "./teaching-facts-v2";

export type TeachingMomentV2 = Readonly<{
  version: "teaching-moment-v2";
  conceptId: string;
  title: string;
  paragraphs: readonly string[];
  reasonCode: "first_verified_relevance" | "player_requested_help";
  factIds: readonly string[];
}>;

export type TeachingMomentInputV2 = Readonly<{
  concept: EducationConcept;
  trigger: "automatic" | "requested_help";
  previouslyPresentedConceptIds: readonly string[];
  facts: TeachingFactPacketV2;
  triggerFactIds: readonly string[];
}>;

export type MissingTeachingDimensionV2 = Readonly<{
  dimensionId:
    | "essential_spending"
    | "discretionary_spending"
    | "employee_contributions"
    | "employer_match"
    | "emergency_fund_months"
    | "liquid_solvency"
    | "current_risks";
  reasonCode: "source_not_recorded" | "source_unknown";
}>;

export type TeachingCheckpointV2 = Readonly<{
  version: "teaching-checkpoint-v2";
  evidenceVersion: CheckpointEvidenceV2["evidenceVersion"];
  monthsAggregated: number;
  facts: TeachingFactPacketV2;
  missingDimensions: readonly MissingTeachingDimensionV2[];
  policyAdjustmentAvailable: true;
}>;

export class TeachingPresentationV2Error extends Error {
  constructor(readonly code: "INVALID_INPUT" | "UNSUPPORTED_FACT") {
    super(code);
    this.name = "TeachingPresentationV2Error";
  }
}

const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,191}$/;

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

export function buildTeachingMomentV2(
  input: TeachingMomentInputV2,
): TeachingMomentV2 | null {
  if (
    !IDENTIFIER.test(input.concept.id) ||
    input.concept.title.length === 0 ||
    input.concept.shortDefinition.length === 0 ||
    input.concept.whyItMatters.length === 0 ||
    input.triggerFactIds.length === 0 ||
    input.triggerFactIds.length > 8 ||
    new Set(input.triggerFactIds).size !== input.triggerFactIds.length ||
    new Set(input.previouslyPresentedConceptIds).size !==
      input.previouslyPresentedConceptIds.length
  ) {
    throw new TeachingPresentationV2Error("INVALID_INPUT");
  }
  if (
    input.trigger === "automatic" &&
    input.previouslyPresentedConceptIds.includes(input.concept.id)
  ) return null;
  const availableFacts = new Set(input.facts.facts.map(({ factId }) => factId));
  if (input.triggerFactIds.some((factId) => !availableFacts.has(factId))) {
    throw new TeachingPresentationV2Error("UNSUPPORTED_FACT");
  }
  return deepFreeze({
    version: "teaching-moment-v2",
    conceptId: input.concept.id,
    title: input.concept.title,
    paragraphs: [input.concept.shortDefinition, input.concept.whyItMatters],
    reasonCode:
      input.trigger === "automatic"
        ? "first_verified_relevance"
        : "player_requested_help",
    factIds: [...input.triggerFactIds],
  }) as TeachingMomentV2;
}
