"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { ErrorState, LoadingState } from "@/components/async-state";
import { useGame } from "@/components/game-provider";

import { MainGameStage } from "./main-game-stage";
import { MonthAdvancePanel } from "./month-advance-panel";

export function GameDashboard() {
  const router = useRouter();
  const {
    machine,
    operation,
    error,
    ensureGame,
    fastForward,
    completeReturn,
    replaySlice,
    dismissError,
  } = useGame();
  const requested = useRef(false);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    void ensureGame();
  }, [ensureGame]);

  useEffect(() => {
    if (machine?.phase === "returning-to-simulation") {
      completeReturn();
    }
  }, [completeReturn, machine?.phase]);

  useEffect(() => {
    if (machine?.phase !== "pending-event") return;
    const timer = window.setTimeout(() => router.push("/game/event"), 2400);
    return () => window.clearTimeout(timer);
  }, [machine?.phase, router]);

  if (!machine) {
    if (error) {
      return <ErrorState message={error} onRetry={() => void ensureGame()} />;
    }
    return <LoadingState label="Loading Big City Survivor..." />;
  }

  return (
    <div className="screen game-screen">
      <MainGameStage
        error={error}
        isFastForwarding={operation === "fast-forwarding" || machine.phase === "fast-forwarding"}
        onDismissError={dismissError}
        onFastForward={() => void fastForward()}
        onReplay={() => void replaySlice()}
        scenario={machine.snapshot}
      />
      {machine.phase === "pending-event" ? (
        <MonthAdvancePanel
          changes={machine.monthlyChanges}
          onReadNews={() => router.push("/game/event")}
          summary={machine.monthlySummary ?? "A new event is waiting."}
        />
      ) : null}
    </div>
  );
}
