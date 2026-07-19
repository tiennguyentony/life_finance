"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useReducer, useRef, useState } from "react";
import type { RunViewWire } from "@/contracts/api/contracts";
import { LifeFinanceClient } from "@/lib/api-client/client";

import { INITIAL_NAV_STATE, boardNavReducer } from "./board-nav";
import {
  evaluateBoardContinuationV1,
  type BoardContinuationDecisionV1,
} from "./board-continuation";
import { boardMonthResult, boardViewFromRun, type BoardMonthResult } from "./board-model";
import type { BoardMode } from "./board-scene";
import { BoardHud } from "./hud";
import { HOME_ISLAND_ID, islandById, standPointForIsland } from "./islands";
import { MonthResultDialog } from "./month-result-dialog";
import {
  plansForDestination,
  type BoardDestinationId,
  type BoardPlan,
} from "./plan-catalog";
import { PlanningPanel } from "./planning-panel";
import { destinationLandmarkId, standPointAt } from "./track";
import {
  boardMonthRecoveryMessage,
  boardRecoveryPlanLabel,
  commitBoardTurn,
  continueBoardTurn,
  finishBoardMonthAfterRefresh,
  recoverBoardTurnFailure,
  type BoardTurnFailurePhase,
  type BoardTurnRecoveryResult,
} from "./turn-commit";

const BoardScene = dynamic(() => import("./board-scene"), {
  ssr: false,
  loading: () => (
    <div className="board-loading" role="status">
      Setting up the board...
    </div>
  ),
});

// Long enough that a screen reader can finish announcing before it hides.
const TOAST_MS = 4000;

type PendingTurnFailure = Readonly<{
  phase: BoardTurnFailurePhase;
  error: unknown;
  opening: RunViewWire;
  failedRun: RunViewWire;
  plan: BoardPlan;
  planApplied: boolean;
}>;

type BoardContinuationContext = Readonly<{
  opening: RunViewWire;
  plan: BoardPlan;
}>;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

type BoardShellProps = Readonly<{
  mode?: BoardMode;
}>;

export function BoardShell({ mode = "strategy" }: BoardShellProps) {
  const router = useRouter();
  const [run, setRun] = useState<RunViewWire | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [nav, dispatch] = useReducer(boardNavReducer, INITIAL_NAV_STATE);
  const [selectedDestinationId, setSelectedDestinationId] =
    useState<BoardDestinationId | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [monthResult, setMonthResult] = useState<BoardMonthResult | null>(null);
  const [aiDirector, setAiDirector] = useState<
    Awaited<ReturnType<LifeFinanceClient["submitCommand"]>>["result"]["aiDirector"]
  >(null);
  const [continuationContext, setContinuationContext] =
    useState<BoardContinuationContext | null>(null);
  const [planningError, setPlanningError] = useState<string | null>(null);
  const [finishMonthOnly, setFinishMonthOnly] = useState(false);
  const [recoveryPlan, setRecoveryPlan] = useState<BoardPlan | null>(null);
  const [recoveryPlanApplied, setRecoveryPlanApplied] = useState(false);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [reactionToken, setReactionToken] = useState(0);
  const [planningFocusTarget, setPlanningFocusTarget] = useState<HTMLElement | null>(null);
  const turnOpeningRef = useRef<RunViewWire | null>(null);
  const pendingFailureRef = useRef<PendingTurnFailure | null>(null);
  // The message persists through the exit transition; `visible` drives it.
  // Kept mounted so the aria-live region is present before its text changes.
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({
    message: "",
    visible: false,
  });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    let active = true;
    new LifeFinanceClient()
      .getSession()
      .then(({ session }) => {
        if (!active) return;
        if (!session) {
          router.replace("/start");
          return;
        }
        setRun(session.run);
      })
      .catch(() => {
        if (active) router.replace("/start");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const showToast = (message: string) => {
    setToast({ message, visible: true });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(
      () => setToast((previous) => ({ ...previous, visible: false })),
      TOAST_MS,
    );
  };

  const handleSelect = (islandId: string, focusTarget?: HTMLElement) => {
    if (mode === "free") {
      dispatch({ type: "free-select", islandId });
      return;
    }
    if (mode === "loop") {
      if (islandId !== nav.currentIslandId) {
        showToast("Sprout only moves forward. Press Move.");
      } else {
        dispatch({ type: "loop-bounce" });
      }
      return;
    }
    if (
      !run ||
      !run.capabilities.canAct ||
      run.pendingInteraction.kind === "event"
    ) {
      return;
    }
    if (
      busy ||
      monthResult ||
      finishMonthOnly ||
      refreshRequired
    ) {
      return;
    }

    const destinationId = islandId as BoardDestinationId;
    setPlanningFocusTarget(
      focusTarget ?? document.querySelector<HTMLElement>(
        `[data-board-destination="${destinationId}"]`,
      ),
    );
    const firstEnabledPlan = plansForDestination(run, destinationId).find(
      (plan) => plan.disabledReason === null,
    );
    setSelectedDestinationId(destinationId);
    setSelectedPlanId(firstEnabledPlan?.id ?? null);
    setPlanningError(null);
    setRecoveryPlan(null);
    setRecoveryPlanApplied(false);
  };

  const handleHopEnd = () => {
    if (mode !== "strategy") dispatch({ type: "hop-end", mode });
  };

  const completeMonth = (
    opening: RunViewWire,
    ending: RunViewWire,
    plan: BoardPlan,
    planLabel = plan.label,
    director: typeof aiDirector = null,
  ) => {
    setRun(ending);
    setMonthResult(boardMonthResult(opening, ending, planLabel));
    setAiDirector(director);
    setContinuationContext(Object.freeze({ opening, plan }));
    setSelectedDestinationId(null);
    setSelectedPlanId(null);
    setPlanningError(null);
    setFinishMonthOnly(false);
    setRecoveryPlan(null);
    setRecoveryPlanApplied(false);
    setRefreshRequired(false);
    turnOpeningRef.current = null;
    pendingFailureRef.current = null;
    setReactionToken((token) => token + 1);
  };

  const adoptRecovery = (
    outcome: BoardTurnRecoveryResult,
    failure: PendingTurnFailure,
  ) => {
    if (outcome.kind === "completed") {
      completeMonth(
        outcome.opening,
        outcome.run,
        failure.plan,
        boardRecoveryPlanLabel(outcome, failure.plan.label),
      );
      return;
    }

    setRun(outcome.run);
    if (outcome.kind === "planning") {
      setFinishMonthOnly(false);
      setRecoveryPlan(null);
      setRecoveryPlanApplied(false);
      setRefreshRequired(false);
      turnOpeningRef.current = null;
      pendingFailureRef.current = null;
      setPlanningError(errorMessage(failure.error, "The plan could not be saved."));
      return;
    }

    setRecoveryPlan(failure.plan);
    setRecoveryPlanApplied(failure.planApplied);
    turnOpeningRef.current = failure.opening;
    if (outcome.kind === "finish_month") {
      setFinishMonthOnly(true);
      setRefreshRequired(false);
      pendingFailureRef.current = null;
      setPlanningError(
        failure.phase === "plan"
          ? "The run changed while saving. To avoid repeating a plan that may already be saved, finish this month only."
          : boardMonthRecoveryMessage(failure.planApplied),
      );
      return;
    }

    setFinishMonthOnly(failure.phase === "month");
    setRefreshRequired(true);
    pendingFailureRef.current = failure;
    setPlanningError(
      failure.phase === "month"
        ? "The latest run could not be refreshed. Finish this month will refresh it again before advancing."
        : "The latest run could not be refreshed. Refresh the board before trying this plan again.",
    );
  };

  const recoverFailure = (failure: PendingTurnFailure) =>
    recoverBoardTurnFailure({
      phase: failure.phase,
      error: failure.error,
      opening: failure.opening,
      failedRun: failure.failedRun,
      getSession: () => new LifeFinanceClient().getSession(),
    });

  const finishSavedMonth = async (plan: BoardPlan) => {
    if (!run) return;
    const recoveryOpening = turnOpeningRef.current ?? run;
    const latestRun = run;
    setBusy(true);
    setPlanningError(null);
    try {
      const pendingFailure = pendingFailureRef.current;
      if (refreshRequired && pendingFailure) {
        const client = new LifeFinanceClient();
        const outcome = await finishBoardMonthAfterRefresh({
          client,
          opening: recoveryOpening,
          failedRun: pendingFailure.failedRun,
          error: pendingFailure.error,
          commandId: `board.month.recovery.${crypto.randomUUID()}`,
        });
        const nextFailure = outcome.kind === "completed"
          ? pendingFailure
          : {
              ...pendingFailure,
              phase: "month" as const,
              error: outcome.error,
              failedRun: outcome.run,
            };
        adoptRecovery(outcome, nextFailure);
        return;
      }

      const response = await new LifeFinanceClient().submitCommand(latestRun.runId, {
        id: `board.month.recovery.${crypto.randomUUID()}`,
        expectedRevision: latestRun.revision,
        effectiveMonth: latestRun.currentMonth,
        type: "process_month",
        payload: {},
      });
      completeMonth(recoveryOpening, response.run, plan);
    } catch (reason) {
      const failure: PendingTurnFailure = {
        phase: "month",
        error: reason,
        opening: recoveryOpening,
        failedRun: latestRun,
        plan,
        planApplied: recoveryPlanApplied,
      };
      pendingFailureRef.current = failure;
      adoptRecovery(await recoverFailure(failure), failure);
    } finally {
      setBusy(false);
    }
  };

  const handleCommitPlan = async () => {
    if (
      !run ||
      busy ||
      !selectedDestinationId ||
      !selectedPlanId ||
      run.pendingInteraction.kind === "event"
    ) {
      return;
    }
    const plan = finishMonthOnly
      ? recoveryPlan
      : plansForDestination(run, selectedDestinationId).find(
          (candidate) => candidate.id === selectedPlanId,
        );
    if (!plan || plan.disabledReason !== null) return;

    if (finishMonthOnly) {
      await finishSavedMonth(plan);
      return;
    }

    if (refreshRequired) {
      const pendingFailure = pendingFailureRef.current;
      if (!pendingFailure) return;
      setBusy(true);
      setPlanningError(null);
      try {
        adoptRecovery(await recoverFailure(pendingFailure), pendingFailure);
      } finally {
        setBusy(false);
      }
      return;
    }

    const opening = run;
    turnOpeningRef.current = opening;
    setBusy(true);
    setPlanningError(null);
    try {
      const result = await commitBoardTurn({
        client: new LifeFinanceClient(),
        opening,
        plan,
        createId: (phase) => `board.turn.${phase}.${crypto.randomUUID()}`,
      });
      if (result.kind === "completed") {
        completeMonth(result.opening, result.run, plan, plan.label, result.aiDirector);
      } else if (result.kind === "plan_failed") {
        const failure: PendingTurnFailure = {
          phase: "plan",
          error: result.error,
          opening,
          failedRun: result.run,
          plan,
          planApplied: false,
        };
        pendingFailureRef.current = failure;
        adoptRecovery(await recoverFailure(failure), failure);
      } else {
        const failure: PendingTurnFailure = {
          phase: "month",
          error: result.error,
          opening,
          failedRun: result.run,
          plan,
          planApplied: result.planApplied,
        };
        pendingFailureRef.current = failure;
        adoptRecovery(await recoverFailure(failure), failure);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleTakeAction = async () => {
    if (mode === "strategy" || !run || busy || nav.hop || !run.capabilities.canAdvance) return;
    setBusy(true);
    try {
      const response = await new LifeFinanceClient().submitCommand(run.runId, {
        id: `board.${mode}.month.${crypto.randomUUID()}`,
        expectedRevision: run.revision,
        effectiveMonth: run.currentMonth,
        type: "process_month",
        payload: {},
      });
      setRun(response.run);
      const director = response.result.aiDirector ?? null;
      if (director !== null) {
        showToast(
          director.mode === "operational"
            ? `Operational ML ${director.status}: ${director.candidateCount} safe candidates ranked locally.`
            : `AI Director ${director.mode}: ${director.status} via ${director.source} (${director.latencyMs} ms).`,
        );
      } else {
        showToast(`Advanced to ${response.run.currentMonth}. Your run is saved.`);
      }
      dispatch(mode === "loop" ? { type: "loop-advance" } : { type: "free-bounce" });
    } catch (reason) {
      showToast(errorMessage(reason, "The turn could not advance."));
    } finally {
      setBusy(false);
    }
  };

  const clearMonthResult = () => {
    setMonthResult(null);
    setAiDirector(null);
    setContinuationContext(null);
  };

  const handleContinueMonth = async () => {
    if (!run || !monthResult || !continuationContext || busy) return;
    const decision = evaluateBoardContinuationV1({
      opening: continuationContext.opening,
      ending: run,
      plan: continuationContext.plan,
    });
    if (decision.kind === "stop") {
      clearMonthResult();
      return;
    }

    const plan = decision.kind === "repeat_transaction"
      ? decision.plan
      : continuationContext.plan;
    const opening = run;
    setBusy(true);
    try {
      const result = await continueBoardTurn({
        client: new LifeFinanceClient(),
        opening,
        previousPlan: continuationContext.plan,
        decision,
        createId: (phase) => `board.continue.${phase}.${crypto.randomUUID()}`,
      });
      if (result.kind === "stopped") {
        clearMonthResult();
      } else if (result.kind === "completed") {
        completeMonth(result.opening, result.run, plan, plan.label, result.aiDirector);
      } else {
        setMonthResult(null);
        setContinuationContext(null);
        setSelectedDestinationId(plan.destinationId);
        setSelectedPlanId(plan.id);
        const failure: PendingTurnFailure = {
          phase: result.kind === "plan_failed" ? "plan" : "month",
          error: result.error,
          opening,
          failedRun: result.run,
          plan,
          planApplied: result.kind === "month_failed" && result.planApplied,
        };
        pendingFailureRef.current = failure;
        adoptRecovery(await recoverFailure(failure), failure);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleResolveEvent = async (choiceId: string) => {
    if (!run || busy || monthResult || run.pendingInteraction.kind !== "event") return;
    setBusy(true);
    try {
      const response = await new LifeFinanceClient().submitCommand(run.runId, {
        id: `board.event.${crypto.randomUUID()}`,
        expectedRevision: run.revision,
        effectiveMonth: run.currentMonth,
        type: "resolve_event_choice",
        payload: { eventId: run.pendingInteraction.eventId, choiceId },
      });
      setRun(response.run);
      setContinuationContext(null);
      showToast(
        mode === "strategy"
          ? "Decision applied. Your board is ready for a new focus."
          : "Decision applied. Your board is ready to travel again.",
      );
    } catch (reason) {
      showToast(errorMessage(reason, "The decision could not be applied."));
    } finally {
      setBusy(false);
    }
  };

  const handleNewGame = () => {
    if (busy) return;
    const confirmed = window.confirm(
      "Start setting up a new game? Your current game remains saved until the new game is successfully created. Creating it will archive this active game.",
    );
    if (confirmed) router.push("/start");
  };

  if (loading || !run) {
    return (
      <div className="board-loading" role="status">
        Loading your financial board...
      </div>
    );
  }

  const view = boardViewFromRun(run);
  const plans = selectedDestinationId
    ? finishMonthOnly && recoveryPlan
      ? plansForDestination(run, selectedDestinationId).map((plan) =>
          plan.id === recoveryPlan.id ? recoveryPlan : plan,
        )
      : plansForDestination(run, selectedDestinationId)
    : [];
  const planningPanel = selectedDestinationId ? (
    <PlanningPanel
      busy={busy}
      commitVariant={finishMonthOnly ? "finish_month" : refreshRequired ? "refresh" : "plan"}
      destinationId={selectedDestinationId}
      errorMessage={planningError}
      onClose={() => {
        if (finishMonthOnly || refreshRequired) return;
        setSelectedDestinationId(null);
        setSelectedPlanId(null);
        setPlanningError(null);
        setRecoveryPlan(null);
        setRecoveryPlanApplied(false);
      }}
      onCommit={() => void handleCommitPlan()}
      onSelectPlan={(planId) => {
        if (finishMonthOnly || refreshRequired) return;
        setSelectedPlanId(planId);
        setPlanningError(null);
      }}
      plans={plans}
      selectedPlanId={selectedPlanId}
    />
  ) : null;
  const eventVisible = view.pendingEvent !== null && monthResult === null;
  const continuationDecision: BoardContinuationDecisionV1 | null =
    monthResult !== null && continuationContext !== null
      ? evaluateBoardContinuationV1({
          opening: continuationContext.opening,
          ending: run,
          plan: continuationContext.plan,
        })
      : null;
  const resultPrimaryLabel = continuationDecision === null
    ? "Choose another plan"
    : continuationDecision.kind !== "stop"
      ? continuationDecision.primaryLabel
      : continuationDecision.reason === "pending_event"
        ? "Review decision"
        : continuationDecision.reason === "course_completed"
          ? "Review course completion"
          : continuationDecision.reason === "chapter_checkpoint"
            ? "Review financial checkpoint"
            : continuationDecision.reason === "warning_crossed"
              ? "Review safety warning"
              : "Choose another plan";
  const resultSecondaryLabel = continuationDecision !== null &&
      continuationDecision.kind !== "stop"
    ? "Choose a different plan"
    : null;
  const resultSummary = continuationDecision === null
    ? null
    : continuationDecision.kind === "stop"
      ? continuationDecision.message
      : continuationDecision.kind === "repeat_transaction"
        ? "Repeat the transaction using next month's latest available balance."
        : "The previous plan was applied once; continue without applying it again.";

  return (
    <div className="board-stage">
      <h1 className="sr-only">Life Finance board</h1>
      {/* Announces the character's location to screen readers as it moves,
          since the 3D canvas itself conveys that only visually. */}
      <p aria-live="polite" className="sr-only" role="status">
        Sprout is at {islandById(nav.currentIslandId).name}
      </p>
      <div className="board-canvas">
        <BoardScene
          currentIslandId={nav.currentIslandId}
          flagIslandId={mode === "loop" ? destinationLandmarkId(nav.trackIndex) : null}
          hop={mode === "strategy" ? null : nav.hop}
          mode={mode}
          onHopEnd={handleHopEnd}
          onSelect={handleSelect}
          reactionToken={reactionToken}
          reducedMotion={reducedMotion}
          selectedIslandId={mode === "strategy" ? selectedDestinationId : null}
          standingAt={
            mode === "strategy"
              ? standPointForIsland(HOME_ISLAND_ID)
              : mode === "loop"
                ? standPointAt(nav.trackIndex)
                : standPointForIsland(nav.currentIslandId)
          }
        />
      </div>
      <BoardHud
        actionHint={
          view.pendingEvent
            ? "Resolve the event first"
            : mode === "loop"
              ? "Advance one month and hop"
              : "Advance one financial month"
        }
        actionLabel={
          busy
            ? "Saving..."
            : view.pendingEvent
              ? "Decision Required"
              : mode === "loop"
                ? "Move"
                : "Take Action"
        }
        busy={busy}
        eventReturnFocusTarget={planningFocusTarget}
        eventVisible={eventVisible}
        mode={mode}
        monthResultDialog={
          <MonthResultDialog
            aiDirector={aiDirector}
            busy={busy}
            onPrimary={() => void handleContinueMonth()}
            onSecondary={clearMonthResult}
            primaryLabel={resultPrimaryLabel}
            result={monthResult}
            returnFocusTarget={planningFocusTarget}
            secondaryLabel={resultSecondaryLabel}
            summary={resultSummary}
          />
        }
        onResolveEvent={(choiceId) => void handleResolveEvent(choiceId)}
        onNewGame={handleNewGame}
        onSavedGames={() => router.push("/saves")}
        onStub={(label) => showToast(`${label} opens in a later milestone.`)}
        onTakeAction={handleTakeAction}
        planningPanel={planningPanel}
        toastMessage={toast.message}
        toastVisible={toast.visible}
        view={view}
      />
    </div>
  );
}
