"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useReducer, useRef, useState } from "react";
import type { RunViewWire } from "@/contracts/api/contracts";
import { LifeFinanceClient } from "@/lib/api-client/client";

import { INITIAL_NAV_STATE, boardNavReducer } from "./board-nav";
import type { BoardMode } from "./board-scene";
import { boardViewFromRun } from "./board-model";
import { BoardHud } from "./hud";
import { islandById, standPointForIsland } from "./islands";
import { destinationLandmarkId, standPointAt } from "./track";

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

type BoardShellProps = Readonly<{
  /** "free": click any island to travel. "loop": one Move button, fixed order. */
  mode?: BoardMode;
}>;

export function BoardShell({ mode = "free" }: BoardShellProps) {
  const router = useRouter();
  const [run, setRun] = useState<RunViewWire | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [nav, dispatch] = useReducer(boardNavReducer, INITIAL_NAV_STATE);
  // The message persists through the exit transition; `visible` drives it.
  // Kept mounted (not conditionally rendered) so the aria-live region is
  // already in the DOM when its text changes and reliably announces.
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
      () => setToast((prev) => ({ ...prev, visible: false })),
      TOAST_MS,
    );
  };

  const handleSelect = (islandId: string) => {
    if (mode === "loop") {
      // The loop removes navigation choices: islands are stops, not links.
      if (islandId !== nav.currentIslandId) {
        showToast("Sprout only moves forward. Press Move.");
      } else {
        dispatch({ type: "loop-bounce" }); // bounce in place as feedback
      }
      return;
    }
    dispatch({ type: "free-select", islandId });
  };

  const handleHopEnd = () => dispatch({ type: "hop-end", mode });

  const handleTakeAction = async () => {
    if (!run || busy || nav.hop || !run.capabilities.canAdvance) return;
    setBusy(true);
    try {
      const response = await new LifeFinanceClient().submitCommand(run.runId, {
        id: `board.month.${crypto.randomUUID()}`,
        expectedRevision: run.revision,
        type: "process_month",
        payload: {},
      });
      setRun(response.run);
      showToast(`Advanced to ${response.run.currentMonth}. Your run is saved.`);
      dispatch(mode === "loop" ? { type: "loop-advance" } : { type: "free-bounce" });
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : "The turn could not advance.");
    } finally {
      setBusy(false);
    }
  };

  const handleResolveEvent = async (choiceId: string) => {
    if (!run || busy || run.pendingInteraction.kind !== "event") return;
    setBusy(true);
    try {
      const response = await new LifeFinanceClient().submitCommand(run.runId, {
        id: `board.event.${crypto.randomUUID()}`,
        expectedRevision: run.revision,
        type: "resolve_event_choice",
        payload: { eventId: run.pendingInteraction.eventId, choiceId },
      });
      setRun(response.run);
      showToast("Decision applied. Your board is ready to move again.");
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : "The decision could not be applied.");
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
          hop={nav.hop}
          mode={mode}
          onHopEnd={handleHopEnd}
          onSelect={handleSelect}
          reducedMotion={reducedMotion}
          standingAt={
            mode === "loop"
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
        actionLabel={busy ? "Saving..." : view.pendingEvent ? "Decision Required" : mode === "loop" ? "Move" : "Take Action"}
        busy={busy}
        onStub={(label) => showToast(`${label} opens in a later milestone.`)}
        onTakeAction={handleTakeAction}
        onResolveEvent={(choiceId) => void handleResolveEvent(choiceId)}
        toastMessage={toast.message}
        toastVisible={toast.visible}
        view={view}
      />
    </div>
  );
}
