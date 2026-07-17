"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import type { BoardMode } from "./board-scene";
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

  const handleTakeAction = () => {
    if (mode === "loop") {
      // Kick off the first hop; handleHopEnd chains tile hops to the landmark.
      if (!hop) hopToTrackIndex((trackIndex + 1) % TRACK.length, trackIndex);
      return;
    }
    startFreeHop(currentIslandId);
    showToast("Nothing to roll yet. Turn logic arrives in the next milestone.");
  };

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
        actionHint={mode === "loop" ? "Hop to the next stop" : "Roll and see what happens"}
        actionLabel={mode === "loop" ? "Move" : "Take Action"}
        onStub={(label) => showToast(`${label} opens in a later milestone.`)}
        onTakeAction={handleTakeAction}
        toastMessage={toast.message}
        toastVisible={toast.visible}
      />
    </div>
  );
}
