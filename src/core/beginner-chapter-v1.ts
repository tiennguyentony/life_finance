import { monthsBetween, type SimulationMonth } from "./domain/month";
import type { PreparednessAssessmentV1 } from "./preparedness-assessment-v1";

export const BEGINNER_CHAPTER_VERSION_V1 = "beginner-chapter-v1" as const;

export type BeginnerChapterOutcomeV1 =
  | "bankrupt"
  | "fragile"
  | "developing"
  | "strong";

export type BeginnerChapterWeakestComponentV1 =
  | "liquidity"
  | "cash_flow"
  | "debt"
  | "insurance"
  | "diversification";

export type BeginnerChapterAssessmentV1 = Readonly<{
  version: typeof BEGINNER_CHAPTER_VERSION_V1;
  checkpointMonth: SimulationMonth;
  outcome: BeginnerChapterOutcomeV1;
  completed: boolean;
  scorePpm: number;
  preparednessBand: PreparednessAssessmentV1["band"];
  weakestComponent: BeginnerChapterWeakestComponentV1;
  lessonKey: string;
}>;

type ComponentEvidence = Readonly<{
  id: BeginnerChapterWeakestComponentV1;
  scorePpm: number;
  lessonKey: string;
}>;

function weakestComponent(
  components: PreparednessAssessmentV1["components"],
): ComponentEvidence {
  const evidence: readonly ComponentEvidence[] = [
    { id: "liquidity", scorePpm: components.liquidityPpm, lessonKey: "lesson.emergency_fund" },
    { id: "cash_flow", scorePpm: components.cashFlowPpm, lessonKey: "lesson.cash_flow" },
    { id: "debt", scorePpm: components.debtPpm, lessonKey: "lesson.debt_management" },
    { id: "insurance", scorePpm: components.insurancePpm, lessonKey: "lesson.insurance" },
    { id: "diversification", scorePpm: components.diversificationPpm, lessonKey: "lesson.diversification" },
  ];
  return evidence.reduce((weakest, candidate) =>
    candidate.scorePpm < weakest.scorePpm ? candidate : weakest);
}

export function assessBeginnerChapterV1(input: Readonly<{
  startMonth: SimulationMonth;
  currentMonth: SimulationMonth;
  preparedness: PreparednessAssessmentV1;
  outcome: Readonly<{ kind: string }> | null;
}>): BeginnerChapterAssessmentV1 | null {
  if (monthsBetween(input.startMonth, input.currentMonth) !== 12) return null;

  const weakest = weakestComponent(input.preparedness.components);
  const bankrupt = input.outcome?.kind === "bankruptcy";
  const outcome: BeginnerChapterOutcomeV1 = bankrupt
    ? "bankrupt"
    : input.preparedness.scorePpm < 350_000
      ? "fragile"
      : input.preparedness.scorePpm < 500_000
        ? "developing"
        : "strong";

  return Object.freeze({
    version: BEGINNER_CHAPTER_VERSION_V1,
    checkpointMonth: input.currentMonth,
    outcome,
    completed: outcome === "developing" || outcome === "strong",
    scorePpm: input.preparedness.scorePpm,
    preparednessBand: input.preparedness.band,
    weakestComponent: weakest.id,
    lessonKey: weakest.lessonKey,
  });
}
