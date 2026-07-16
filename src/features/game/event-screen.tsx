"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { LoadingState } from "@/components/async-state";
import { useGame } from "@/components/game-provider";

import { EventConsequenceView } from "./event-consequence";
import { NewspaperEvent } from "./newspaper-event";

export function EventScreen() {
  const router = useRouter();
  const { machine, operation, error, openEvent, chooseEventDecision, startReturn } = useGame();
  const opened = useRef(false);

  useEffect(() => {
    if (!machine) {
      router.replace("/game");
      return;
    }
    if (machine.phase === "pending-event" && !opened.current) {
      opened.current = true;
      openEvent();
      return;
    }
    if (machine.phase === "active-simulation" || machine.phase === "fast-forwarding") {
      router.replace("/game");
    }
  }, [machine, openEvent, router]);

  if (!machine || machine.phase === "pending-event") {
    return <LoadingState label="Unfolding The City Ledger..." />;
  }

  if (machine.phase === "showing-consequence" && machine.consequence) {
    return (
      <div className="screen event-screen">
        <EventConsequenceView
          consequence={machine.consequence}
          onContinue={() => {
            startReturn();
            router.push("/game");
          }}
        />
      </div>
    );
  }

  if (machine.phase === "returning-to-simulation") {
    return <LoadingState label="Returning to August..." />;
  }

  if (!machine.pendingEvent) {
    return <LoadingState label="The newspaper missed delivery..." />;
  }

  return (
    <div className="screen event-screen event-impact">
      <NewspaperEvent
        error={error}
        event={machine.pendingEvent}
        isResolving={operation === "resolving-event"}
        onChoose={(decisionId) => void chooseEventDecision(decisionId)}
        selectedDecisionId={machine.selectedDecisionId}
      />
    </div>
  );
}
