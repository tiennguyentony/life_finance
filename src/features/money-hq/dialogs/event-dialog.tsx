"use client";

import Image from "next/image";

import type { RunViewWire } from "@/contracts/api/contracts";
import { useModalDialog } from "@/features/board/use-modal-dialog";
import { InteractiveEventDecision } from "@/features/events/interactive-event-decision";

const IMPULSO = "/assets/characters/impulso/impulso-sale.png";

type Props = Readonly<{
  onCommitted: (run: RunViewWire, reaction: string) => void;
  run: RunViewWire;
}>;

export function HqEventDialog({ onCommitted, run }: Props) {
  const dialogRef = useModalDialog(run.pendingInteraction.kind === "event");

  if (run.pendingInteraction.kind !== "event") return null;
  const event = run.pendingInteraction;

  return (
    <dialog className="hq-dialog" ref={dialogRef}>
      <div className="hq">
        <div className="hq-screen-head">
          <Image
            alt="Impulso"
            className="hq-character"
            height={96}
            src={IMPULSO}
            unoptimized
            width={96}
          />
          <div>
            <p className="hq-chip" data-tone="negative" style={{ marginBottom: "0.375rem" }}>
              Decision required
            </p>
            <h2 className="hq-dialog-title">
              {event.headline ?? "A decision is waiting"}
            </h2>
            <p className="hq-screen-subtitle">
              This pauses the month until you choose.
            </p>
          </div>
        </div>

        {event.body ? (
          <p
            style={{
              font: "600 0.875rem var(--hq-body-font)",
              color: "var(--hq-body)",
              lineHeight: 1.5,
            }}
          >
            {event.body}
          </p>
        ) : null}

        <InteractiveEventDecision
          key={event.eventId}
          onCommitted={onCommitted}
          run={run}
        />
      </div>
    </dialog>
  );
}
