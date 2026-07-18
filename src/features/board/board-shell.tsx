"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { RunViewWire } from "@/contracts/api/contracts";
import { LifeFinanceClient } from "@/lib/api-client/client";

import { boardMonthResult, boardViewFromRun, type BoardMonthResult } from "./board-model";
import type { BoardMode } from "./board-scene";
import { BoardHud } from "./hud";
import { HOME_ISLAND_ID, standPointForIsland } from "./islands";
import { MonthResultDialog } from "./month-result-dialog";
import {
  plansForDestination,
  type BoardDestinationId,
  type BoardPlan,
} from "./plan-catalog";
import { PlanningPanel } from "./planning-panel";
import type { HopRequest } from "./sprout-3d";
import {
  boardMonthRecoveryMessage,
  commitBoardTurn,
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

type ActiveHop = HopRequest & Readonly<{ toId: string }>;

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
  const [currentIslandId, setCurrentIslandId] = useState<string>(HOME_ISLAND_ID);
  const [hop, setHop] = useState<ActiveHop | null>(null);
  const [selectedDestinationId, setSelectedDestinationId] =
    useState<BoardDestinationId | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [monthResult, setMonthResult] = useState<BoardMonthResult | null>(null);
  const [planningError, setPlanningError] = useState<string | null>(null);
  const [finishMonthOnly, setFinishMonthOnly] = useState(false);
  const [recoveryPlan, setRecoveryPlan] = useState<BoardPlan | null>(null);
  const [recoveryPlanApplied, setRecoveryPlanApplied] = useState(false);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [reactionToken, setReactionToken] = useState(0);
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

  const startFreeHop = (islandId: string) => {
    if (hop) return;
    setHop({
      from: standPointForIsland(currentIslandId),
      to: standPointForIsland(islandId),
      toId: islandId,
    });
  };

  const handleSelect = (islandId: string) => {
    if (mode === "free") {
      startFreeHop(islandId);
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
    if (!hop) return;
    setCurrentIslandId(hop.toId);
    setHop(null);
  };

  const completeMonth = (
    opening: RunViewWire,
    ending: RunViewWire,
    plan: BoardPlan,
  ) => {
    setRun(ending);
    setMonthResult(boardMonthResult(opening, ending, plan.label));
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
      completeMonth(outcome.opening, outcome.run, failure.plan);
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
    let latestRun = run;
    setBusy(true);
    setPlanningError(null);
    try {
      const pendingFailure = pendingFailureRef.current;
      if (refreshRequired && pendingFailure) {
        const outcome = await recoverFailure(pendingFailure);
        if (outcome.kind !== "finish_month") {
          adoptRecovery(outcome, pendingFailure);
          return;
        }
        latestRun = outcome.run;
        setRun(latestRun);
        setRefreshRequired(false);
        pendingFailureRef.current = null;
      }

      const response = await new LifeFinanceClient().submitCommand(latestRun.runId, {
        id: `board.month.recovery.${crypto.randomUUID()}`,
        expectedRevision: latestRun.revision,
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

    if (finishMonthOnly) {
      await finishSavedMonth(plan);
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
        completeMonth(result.opening, result.run, plan);
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
    if (!run || busy || hop || !run.capabilities.canAdvance) return;
    setBusy(true);
    try {
      const response = await new LifeFinanceClient().submitCommand(run.runId, {
        id: `board.free.month.${crypto.randomUUID()}`,
        expectedRevision: run.revision,
        type: "process_month",
        payload: {},
      });
      setRun(response.run);
      showToast(`Advanced to ${response.run.currentMonth}. Your run is saved.`);
      startFreeHop(currentIslandId);
    } catch (reason) {
      showToast(errorMessage(reason, "The turn could not advance."));
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
        type: "resolve_event_choice",
        payload: { eventId: run.pendingInteraction.eventId, choiceId },
      });
      setRun(response.run);
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

  return (
    <div className="board-stage">
      <div className="board-canvas">
        <BoardScene
          currentIslandId={currentIslandId}
          hop={mode === "free" ? hop : null}
          mode={mode}
          onHopEnd={handleHopEnd}
          onSelect={handleSelect}
          reactionToken={reactionToken}
          reducedMotion={reducedMotion}
          selectedIslandId={mode === "strategy" ? selectedDestinationId : null}
          standingAt={
            mode === "strategy"
              ? standPointForIsland(HOME_ISLAND_ID)
              : standPointForIsland(currentIslandId)
          }
        />
      </div>
      <BoardHud
        actionHint={view.pendingEvent ? "Resolve the event first" : "Advance one financial month"}
        actionLabel={busy ? "Saving..." : view.pendingEvent ? "Decision Required" : "Take Action"}
        busy={busy}
        eventVisible={eventVisible}
        mode={mode}
        monthResultDialog={
          <MonthResultDialog
            busy={busy}
            onContinue={() => setMonthResult(null)}
            result={monthResult}
          />
        }
        onResolveEvent={(choiceId) => void handleResolveEvent(choiceId)}
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
