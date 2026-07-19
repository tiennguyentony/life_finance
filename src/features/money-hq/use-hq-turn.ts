"use client";

import { useRef, useState } from "react";

import type { RunViewWire } from "@/contracts/api/contracts";
import type { BoardPlan } from "@/features/board/plan-catalog";
import {
  boardMonthRecoveryMessage,
  boardRecoveryPlanLabel,
  commitBoardTurn,
  finishBoardMonthAfterRefresh,
  recoverBoardTurnFailure,
  type BoardTurnFailurePhase,
  type BoardTurnRecoveryResult,
} from "@/features/board/turn-commit";
import { LifeFinanceClient } from "@/lib/api-client/client";

import { boardMonthResult, type BoardMonthResult } from "@/features/board/board-model";

type PendingFailure = Readonly<{
  phase: BoardTurnFailurePhase;
  error: unknown;
  opening: RunViewWire;
  failedRun: RunViewWire;
  plan: BoardPlan;
  planApplied: boolean;
}>;

/**
 * The commit is two commands: apply the plan, then advance the month. If the
 * second fails after the first succeeded, re-sending the plan would apply it
 * twice — so the hook tracks that partial state and offers a month-only finish.
 * The recovery decisions themselves come from the tested helpers in
 * `turn-commit.ts` rather than being re-derived here.
 */
export type HqCommitMode = "plan" | "finish_month" | "refresh";

export type HqTurn = Readonly<{
  busy: boolean;
  error: string | null;
  commitMode: HqCommitMode;
  monthResult: BoardMonthResult | null;
  /** True only when the authoritative run advanced to the next month. */
  commit: (plan: BoardPlan | null) => Promise<boolean>;
  dismissResult: () => void;
  clearError: () => void;
}>;

function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

/** A no-op plan used when the player advances without choosing a move. */
const STAY_PLAN: BoardPlan = Object.freeze({
  id: "hq.advance-only",
  destinationId: "home",
  label: "No change this month",
  description: "Advance the month without an immediate change.",
  effects: Object.freeze([]),
  disabledReason: null,
  command: Object.freeze({ type: "none" as const }),
});

type UseHqTurnInput = Readonly<{
  run: RunViewWire | null;
  onRun: (run: RunViewWire) => void;
}>;

export function useHqTurn({ run, onRun }: UseHqTurnInput): HqTurn {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [monthResult, setMonthResult] = useState<BoardMonthResult | null>(null);
  const [commitMode, setCommitMode] = useState<HqCommitMode>("plan");
  const [recoveryPlan, setRecoveryPlan] = useState<BoardPlan | null>(null);
  const [recoveryPlanApplied, setRecoveryPlanApplied] = useState(false);
  const openingRef = useRef<RunViewWire | null>(null);
  const failureRef = useRef<PendingFailure | null>(null);

  const completeMonth = (
    opening: RunViewWire,
    ending: RunViewWire,
    planLabel: string,
    monthlyExplanation: BoardMonthResult["monthlyExplanation"] = null,
  ) => {
    onRun(ending);
    setMonthResult(boardMonthResult(opening, ending, planLabel, monthlyExplanation));
    setError(null);
    setCommitMode("plan");
    setRecoveryPlan(null);
    setRecoveryPlanApplied(false);
    openingRef.current = null;
    failureRef.current = null;
    return true;
  };

  const adoptRecovery = (
    outcome: BoardTurnRecoveryResult,
    failure: PendingFailure,
  ): boolean => {
    if (outcome.kind === "completed") {
      completeMonth(
        outcome.opening,
        outcome.run,
        boardRecoveryPlanLabel(outcome, failure.plan.label),
      );
      return true;
    }

    onRun(outcome.run);

    if (outcome.kind === "planning") {
      setCommitMode("plan");
      setRecoveryPlan(null);
      setRecoveryPlanApplied(false);
      openingRef.current = null;
      failureRef.current = null;
      setError(errorMessage(failure.error, "The plan could not be saved."));
      return false;
    }

    setRecoveryPlan(failure.plan);
    setRecoveryPlanApplied(failure.planApplied);
    openingRef.current = failure.opening;

    if (outcome.kind === "finish_month") {
      setCommitMode("finish_month");
      failureRef.current = null;
      setError(
        failure.phase === "plan"
          ? "The run changed while saving. To avoid repeating a plan that may already be saved, finish this month only."
          : boardMonthRecoveryMessage(failure.planApplied),
      );
      return false;
    }

    setCommitMode("refresh");
    failureRef.current = failure;
    setError(
      failure.phase === "month"
        ? "The latest run could not be refreshed. Finishing the month will refresh it again before advancing."
        : "The latest run could not be refreshed. Refresh before trying this plan again.",
    );
    return false;
  };

  const recoverFailure = (failure: PendingFailure) =>
    recoverBoardTurnFailure({
      phase: failure.phase,
      error: failure.error,
      opening: failure.opening,
      failedRun: failure.failedRun,
      getSession: () => new LifeFinanceClient().getSession(),
    });

  const finishSavedMonth = async (
    current: RunViewWire,
    plan: BoardPlan,
  ): Promise<boolean> => {
    const opening = openingRef.current ?? current;
    setBusy(true);
    setError(null);
    try {
      const pending = failureRef.current;
      if (commitMode === "refresh" && pending) {
        const outcome = await finishBoardMonthAfterRefresh({
          client: new LifeFinanceClient(),
          opening,
          failedRun: pending.failedRun,
          error: pending.error,
          commandId: `hq.month.recovery.${crypto.randomUUID()}`,
        });
        return adoptRecovery(
          outcome,
          outcome.kind === "completed"
            ? pending
            : { ...pending, phase: "month", error: outcome.error, failedRun: outcome.run },
        );
      }

      const response = await new LifeFinanceClient().submitCommand(current.runId, {
        id: `hq.month.recovery.${crypto.randomUUID()}`,
        expectedRevision: current.revision,
        effectiveMonth: current.currentMonth,
        type: "process_month",
        payload: {},
      });
      return completeMonth(
        opening,
        response.run,
        plan.label,
        response.result.monthlyExplanation ?? null,
      );
    } catch (reason) {
      const failure: PendingFailure = {
        phase: "month",
        error: reason,
        opening,
        failedRun: current,
        plan,
        planApplied: recoveryPlanApplied,
      };
      failureRef.current = failure;
      return adoptRecovery(await recoverFailure(failure), failure);
    } finally {
      setBusy(false);
    }
  };

  const commit = async (plan: BoardPlan | null): Promise<boolean> => {
    if (!run || busy || run.pendingInteraction.kind === "event") return false;

    if (commitMode === "finish_month") {
      return finishSavedMonth(run, recoveryPlan ?? STAY_PLAN);
    }

    if (commitMode === "refresh") {
      const pending = failureRef.current;
      if (!pending) return false;
      setBusy(true);
      setError(null);
      try {
        return adoptRecovery(await recoverFailure(pending), pending);
      } finally {
        setBusy(false);
      }
    }

    const chosen = plan ?? STAY_PLAN;
    if (chosen.disabledReason !== null) return false;

    const opening = run;
    openingRef.current = opening;
    setBusy(true);
    setError(null);
    try {
      const result = await commitBoardTurn({
        client: new LifeFinanceClient(),
        opening,
        plan: chosen,
        createId: (phase) => `hq.turn.${phase}.${crypto.randomUUID()}`,
      });

      if (result.kind === "completed") {
        return completeMonth(
          result.opening,
          result.run,
          chosen.label,
          result.monthlyExplanation,
        );
      }

      const failure: PendingFailure = {
        phase: result.kind === "plan_failed" ? "plan" : "month",
        error: result.error,
        opening,
        failedRun: result.run,
        plan: chosen,
        planApplied: result.kind === "month_failed" ? result.planApplied : false,
      };
      failureRef.current = failure;
      return adoptRecovery(await recoverFailure(failure), failure);
    } finally {
      setBusy(false);
    }
  };

  return {
    busy,
    error,
    commitMode,
    monthResult,
    commit,
    dismissResult: () => setMonthResult(null),
    clearError: () => setError(null),
  };
}
