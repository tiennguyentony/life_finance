import type { RunViewWire } from "@/contracts/api/contracts";

import { plansForDestination, type BoardPlan } from "./plan-catalog";

export type BoardContinuationStopReasonV1 =
  | "pending_event"
  | "course_completed"
  | "chapter_checkpoint"
  | "run_complete"
  | "warning_crossed"
  | "plan_unavailable";

export type BoardContinuationDecisionV1 =
  | Readonly<{
      kind: "repeat_transaction";
      plan: BoardPlan;
      primaryLabel: string;
    }>
  | Readonly<{
      kind: "advance_only";
      primaryLabel: "Continue one month";
    }>
  | Readonly<{
      kind: "stop";
      reason: BoardContinuationStopReasonV1;
      message: string;
    }>;

function courseCompleted(opening: RunViewWire, ending: RunViewWire): boolean {
  const endingPrograms = new Set(ending.career.pendingProgramIds);
  return opening.career.pendingProgramIds.some((id) => !endingPrograms.has(id));
}

function highCreditUtilization(run: RunViewWire): boolean {
  const { creditLimitCents, creditUsedCents } = run.finances;
  return creditLimitCents > 0 &&
    BigInt(creditUsedCents) * BigInt(1_000_000) >=
      BigInt(creditLimitCents) * BigInt(800_000);
}

function warningCrossed(opening: RunViewWire, ending: RunViewWire): boolean {
  const criticalCrossing = opening.preparedness.band !== "critical" &&
    ending.preparedness.band === "critical";
  const creditCrossing = !highCreditUtilization(opening) && highCreditUtilization(ending);
  return criticalCrossing || creditCrossing;
}

export function evaluateBoardContinuationV1(input: Readonly<{
  opening: RunViewWire;
  ending: RunViewWire;
  plan: BoardPlan;
}>): BoardContinuationDecisionV1 {
  if (input.ending.pendingInteraction.kind === "event") {
    return Object.freeze({
      kind: "stop",
      reason: "pending_event",
      message: "Review the life decision before continuing.",
    });
  }
  if (courseCompleted(input.opening, input.ending)) {
    return Object.freeze({
      kind: "stop",
      reason: "course_completed",
      message: "Review your completed course before continuing.",
    });
  }
  if (input.ending.beginnerCheckpoint !== null) {
    return Object.freeze({
      kind: "stop",
      reason: "chapter_checkpoint",
      message: "Review your 12-month financial checkpoint before continuing.",
    });
  }
  if (input.ending.status === "completed") {
    return Object.freeze({
      kind: "stop",
      reason: "run_complete",
      message: "This run is complete.",
    });
  }
  if (warningCrossed(input.opening, input.ending)) {
    return Object.freeze({
      kind: "stop",
      reason: "warning_crossed",
      message: "Review the new financial safety warning before continuing.",
    });
  }

  if (input.plan.continuation.kind === "advance_only") {
    return Object.freeze({
      kind: "advance_only",
      primaryLabel: "Continue one month",
    });
  }

  const currentPlan = plansForDestination(input.ending, input.plan.destinationId)
    .find(({ id }) => id === input.plan.id);
  if (currentPlan === undefined || currentPlan.disabledReason !== null ||
      currentPlan.continuation.kind !== "repeat_transaction") {
    return Object.freeze({
      kind: "stop",
      reason: "plan_unavailable",
      message: currentPlan?.disabledReason ?? "This plan is no longer available.",
    });
  }

  return Object.freeze({
    kind: "repeat_transaction",
    plan: currentPlan,
    primaryLabel: currentPlan.continuation.actionLabel,
  });
}
