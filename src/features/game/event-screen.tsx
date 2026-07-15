"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { EventCard } from "@/components/event-card";
import { useGame } from "@/components/game-provider";
import { Sprout } from "@/components/sprout";

import { DashboardBoard } from "./dashboard-board";

export function EventScreen() {
  const router = useRouter();
  const {
    continueAfterEvent,
    dashboard,
    decisionId,
    pendingEvent,
    revealEvent,
    status,
  } = useGame();
  const requested = useRef(false);

  useEffect(() => {
    if (!decisionId) {
      router.replace("/game");
      return;
    }
    if (!requested.current) {
      requested.current = true;
      void revealEvent();
    }
  }, [decisionId, revealEvent, router]);

  function handleContinue() {
    continueAfterEvent();
    router.replace("/game");
  }

  if (!dashboard) {
    return null;
  }

  return (
    <div className="screen game-screen event-impact">
      <DashboardBoard dashboard={dashboard} muted />
      <div className="modal-backdrop event-backdrop">
        <section aria-live="polite" aria-modal="true" className="modal-panel event-modal" role="dialog">
          {!pendingEvent || status === "loading" ? (
            <div className="event-loading" role="status">
              <div className="impact-lines" aria-hidden="true" />
              <Sprout emotion="shocked" size="large" />
              <p>Life is happening...</p>
              <span className="loading-line" />
            </div>
          ) : (
            <>
              <div className="event-sprout-column">
                <span className={`severity severity-${pendingEvent.event.severity}`}>{pendingEvent.event.severity}</span>
                <Sprout emotion={pendingEvent.event.emotion} size="large" />
              </div>
              <div className="event-content">
                <EventCard result={pendingEvent} />
                <button className="button button-primary button-large" onClick={handleContinue} type="button">
                  Face the consequences
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
