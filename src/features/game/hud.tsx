"use client";

import Image from "next/image";
import { useState } from "react";

import { CHARACTERS } from "@/features/play/persona-art";
import { formatMoney } from "@/features/play/play-model";
import { useAnimatedNumber } from "@/features/play/use-animated-number";

import { TOTAL_MONTHS } from "./model";

function Money({ cents }: Readonly<{ cents: number }>) {
  const animated = useAnimatedNumber(cents * 100, 450);
  return <>{formatMoney(animated)}</>;
}

export function GameHud({
  cash,
  invested,
  monthlyNet,
  month,
  chapter,
  objective,
  showControls,
  onOpenBank,
  onOpenCashflow,
  onRestart,
}: Readonly<{
  cash: number;
  invested: number;
  monthlyNet: number;
  month: number;
  chapter: number;
  objective: string | null;
  showControls: boolean;
  onOpenBank: () => void;
  onOpenCashflow: () => void;
  onRestart: () => void;
}>) {
  const [confirming, setConfirming] = useState(false);
  const netTone = monthlyNet >= 0 ? "chip-accent" : "chip-danger";
  const netLabel = `${monthlyNet >= 0 ? "+" : "-"}${formatMoney(
    Math.abs(monthlyNet) * 100,
  )}/mo`;

  return (
    <>
      <header className="game-topbar">
        <div className="game-player">
          <Image
            alt=""
            className="game-portrait"
            height={CHARACTERS.buddi.height}
            sizes="52px"
            src={CHARACTERS.buddi.src}
            width={CHARACTERS.buddi.width}
          />
          <div>
            <strong>Buddi</strong>
            <span className="chip-row">
              <span className="chip">
                Month {Math.min(month, TOTAL_MONTHS)} / {TOTAL_MONTHS}
              </span>
              <span className="chip">Decision {Math.min(chapter + 1, 5)} / 5</span>
            </span>
          </div>
        </div>
        {showControls ? (
          <div className="game-actions">
            <button className="btn btn-quiet" onClick={onOpenCashflow} type="button">
              Cashflow
            </button>
            <button className="btn btn-quiet" onClick={onOpenBank} type="button">
              Bank
            </button>
            <button
              className={confirming ? "btn btn-danger" : "btn btn-quiet"}
              onBlur={() => setConfirming(false)}
              onClick={() => {
                if (confirming) {
                  setConfirming(false);
                  onRestart();
                } else {
                  setConfirming(true);
                }
              }}
              type="button"
            >
              {confirming ? "Abandon run?" : "Restart"}
            </button>
          </div>
        ) : null}
      </header>

      {objective ? (
        <p className="game-objective" role="status">
          {objective}
        </p>
      ) : null}

      <footer className="game-wallet" aria-live="off">
        <span className="wallet-label">Cash</span>
        <strong className={`wallet-cash tnum${cash < 800 ? " is-danger" : ""}`}>
          <Money cents={cash} />
        </strong>
        <span className="chip-row wallet-chips">
          <span className={`chip tnum ${netTone}`}>{netLabel}</span>
          <span className="chip tnum">
            Invested <Money cents={invested} />
          </span>
        </span>
      </footer>
    </>
  );
}
