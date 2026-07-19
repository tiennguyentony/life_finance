"use client";

import Image from "next/image";

import type { RunViewWire } from "@/contracts/api/contracts";
import { useModalDialog } from "@/features/board/use-modal-dialog";

import {
  formatPreciseCents,
  formatSignedCents,
  formatSignedPreciseCents,
} from "../hq-view";

const IMPULSO = "/assets/characters/impulso/impulso-sale.png";

type Props = Readonly<{
  busy: boolean;
  onResolve: (choiceId: string) => void;
  run: RunViewWire;
}>;

export function HqEventDialog({ busy, onResolve, run }: Props) {
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

        <div className="hq-choices">
          {event.choices.map((choice) => {
            const { preview } = choice;
            const recurring = preview.recurringCashFlows;
            return (
              <button
                className="hq-choice"
                disabled={busy || !choice.enabled}
                key={choice.id}
                onClick={() => onResolve(choice.id)}
                type="button"
              >
                <span className="hq-choice-title">{choice.label}</span>
                {choice.description ? (
                  <span className="hq-choice-body">{choice.description}</span>
                ) : null}

                {preview.immediateCashChangeCents !== 0 ? (
                  <span className="hq-choice-effect">
                    <span>Cash now</span>
                    <b
                      data-tone={
                        preview.immediateCashChangeCents > 0 ? "positive" : "negative"
                      }
                    >
                      {formatSignedPreciseCents(preview.immediateCashChangeCents)}
                    </b>
                  </span>
                ) : (
                  <span className="hq-choice-effect">
                    <span>Cash now</span>
                    <b data-tone="neutral">$0.00</b>
                  </span>
                )}

                {recurring.map((flow, index) => (
                  <span className="hq-choice-effect" key={`${choice.id}-flow-${index}`}>
                    <span>
                      {flow.direction === "expense" ? "Then pay" : "Then receive"}
                    </span>
                    <b data-tone={flow.direction === "expense" ? "negative" : "positive"}>
                      {formatPreciseCents(flow.monthlyCents)}/mo × {flow.durationMonths}{" "}
                      = {formatPreciseCents(flow.totalCents)}
                    </b>
                  </span>
                ))}

                {preview.annualLivingCostChangeCents !== 0 ? (
                  <span className="hq-choice-effect">
                    <span>Annual living cost</span>
                    <b
                      data-tone={
                        preview.annualLivingCostChangeCents > 0 ? "negative" : "positive"
                      }
                    >
                      {formatSignedCents(preview.annualLivingCostChangeCents)}
                    </b>
                  </span>
                ) : null}

                {preview.wellbeingChangesPpm.happiness !== 0 ? (
                  <span className="hq-choice-effect">
                    <span>Happiness</span>
                    <b
                      data-tone={
                        preview.wellbeingChangesPpm.happiness > 0 ? "positive" : "negative"
                      }
                    >
                      {(preview.wellbeingChangesPpm.happiness / 10_000).toFixed(1)} pts
                    </b>
                  </span>
                ) : null}

                {!choice.enabled && preview.unavailableReason ? (
                  <span
                    className="hq-note"
                    data-tone="negative"
                    style={{ marginTop: "0.375rem" }}
                  >
                    {preview.unavailableReason}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <p className="hq-note" style={{ marginTop: "0.75rem" }}>
          Every figure here is the engine&rsquo;s own preview of the choice.
          Whichever you pick lands in this month&rsquo;s report.
        </p>
      </div>
    </dialog>
  );
}
