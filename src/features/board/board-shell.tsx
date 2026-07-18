"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { RunViewWire } from "@/contracts/api/contracts";
import { LifeFinanceClient } from "@/lib/api-client/client";

import type { BoardMode } from "./board-scene";
import { boardViewFromRun } from "./board-model";
import { BoardHud } from "./hud";
import { standPointForIsland, HOME_ISLAND_ID } from "./islands";
import type { HopRequest } from "./sprout-3d";
import { TRACK, destinationLandmarkId, standPointAt } from "./track";

const BoardScene = dynamic(() => import("./board-scene"), {
  ssr: false,
  loading: () => (
    <div className="board-loading" role="status">
      Setting up the board...
    </div>
  ),
});

/** Free mode travels by island id; loop mode by track index. */
type ActiveHop = HopRequest & Readonly<{ toId?: string; toIndex?: number }>;

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
  const [currentIslandId, setCurrentIslandId] = useState<string>(HOME_ISLAND_ID);
  const [trackIndex, setTrackIndex] = useState(0);
  const [hop, setHop] = useState<ActiveHop | null>(null);
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

  const startFreeHop = (islandId: string) => {
    if (hop) return; // one hop at a time
    // Hopping to the island you are on gives a bounce-in-place as feedback.
    setHop({
      from: standPointForIsland(currentIslandId),
      to: standPointForIsland(islandId),
      toId: islandId,
    });
  };

  const hopToTrackIndex = (toIndex: number, fromIndex: number) => {
    setHop({ from: standPointAt(fromIndex), to: standPointAt(toIndex), toIndex });
  };

  const handleSelect = (islandId: string) => {
    if (mode === "loop") {
      // The loop removes navigation choices: islands are stops, not links.
      if (islandId !== currentIslandId) showToast("Sprout only moves forward. Press Move.");
      else if (!hop) hopToTrackIndex(trackIndex, trackIndex); // bounce in place
      return;
    }
    startFreeHop(islandId);
  };

  const handleHopEnd = () => {
    if (!hop) return;
    if (mode === "free") {
      if (hop.toId) setCurrentIslandId(hop.toId);
      setHop(null);
      return;
    }
    // Loop: keep hopping tile-to-tile until the next landmark, Monopoly-style.
    const landedIndex = hop.toIndex ?? trackIndex;
    setTrackIndex(landedIndex);
    const landed = TRACK[landedIndex]!;
    if (landed.kind === "landmark") {
      setCurrentIslandId(landed.islandId);
      setHop(null);
    } else {
      hopToTrackIndex((landedIndex + 1) % TRACK.length, landedIndex);
    }
  };

  const handleTakeAction = async () => {
    if (!run || busy || hop || !run.capabilities.canAdvance) return;
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
      if (mode === "loop") {
        hopToTrackIndex((trackIndex + 1) % TRACK.length, trackIndex);
      } else {
        startFreeHop(currentIslandId);
      }
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
      <div className="board-canvas">
        <BoardScene
          currentIslandId={currentIslandId}
          flagIslandId={mode === "loop" ? destinationLandmarkId(trackIndex) : null}
          hop={hop}
          mode={mode}
          onHopEnd={handleHopEnd}
          onSelect={handleSelect}
          reducedMotion={reducedMotion}
          standingAt={
            mode === "loop" ? standPointAt(trackIndex) : standPointForIsland(currentIslandId)
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
