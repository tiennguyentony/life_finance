"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { ErrorState, LoadingState } from "@/components/async-state";
import { useGame } from "@/components/game-provider";

import { DashboardBoard } from "./dashboard-board";
import { DecisionModal } from "./decision-modal";

export function GameDashboard() {
  const { dashboard, decisionId, ensureGame, error, status } = useGame();
  const loaded = useRef(false);
  const [decisionOpen, setDecisionOpen] = useState(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void ensureGame();
  }, [ensureGame]);

  if (status === "error") {
    return <ErrorState message={error ?? "The run could not load."} onRetry={() => void ensureGame()} />;
  }

  if (!dashboard) {
    return <LoadingState label="Loading your tiny financial universe..." />;
  }

  const controls = (
    <>
      <button className="button button-secondary" onClick={() => setDecisionOpen(true)} type="button">
        {decisionId ? "Change decision" : "Make a decision"}
      </button>
      {decisionId ? (
        <Link className="button button-primary" href="/game/event">
          Advance one month
        </Link>
      ) : (
        <button className="button button-primary" disabled type="button">
          Pick a move first
        </button>
      )}
      <span className="turn-note">{decisionId ? "Move locked. Life is ready." : "One strategic move per turn."}</span>
    </>
  );

  return (
    <div className="screen game-screen">
      <DashboardBoard controls={controls} dashboard={dashboard} />
      {decisionOpen ? <DecisionModal onClose={() => setDecisionOpen(false)} /> : null}
    </div>
  );
}
