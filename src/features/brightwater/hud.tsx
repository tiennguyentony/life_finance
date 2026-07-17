"use client";

import Image from "next/image";
import { useState } from "react";

import { formatMoney } from "./format";
import { PLAYER } from "./persona-art";
import { TOTAL_MONTHS } from "./model";

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
  const netLabel = `${monthlyNet >= 0 ? "+" : "-"}${formatMoney(Math.abs(monthlyNet))}/mo`;

  return (
    <>
      <header className="bw-topbar">
        <div className="bw-player">
          <Image
            alt=""
            className="bw-portrait"
            height={PLAYER.height}
            sizes="44px"
            src={PLAYER.src}
            width={PLAYER.width}
          />
          <div>
            <strong>Buddi</strong>
            <div className="bw-chip-row">
              <span className="bw-chip">
                Month {Math.min(month, TOTAL_MONTHS)} / {TOTAL_MONTHS}
              </span>
              <span className="bw-chip">Decision {Math.min(chapter + 1, 5)} / 5</span>
            </div>
          </div>
        </div>
        {showControls ? (
          <div className="bw-actions">
            <button className="button button-secondary" onClick={onOpenCashflow} type="button">
              Cashflow
            </button>
            <button className="button button-secondary" onClick={onOpenBank} type="button">
              Bank
            </button>
            <button
              className="button button-secondary"
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
        <p className="bw-objective" role="status">
          {objective}
        </p>
      ) : null}

      <footer className="bw-wallet" aria-live="off">
        <span className="bw-wallet-label">Cash</span>
        <strong className={`bw-wallet-cash${cash < 800 ? " is-danger" : ""}`} key={cash}>
          {formatMoney(cash)}
        </strong>
        <span className="bw-chip-row">
          <span className={`bw-chip ${monthlyNet >= 0 ? "is-positive" : "is-negative"}`}>
            {netLabel}
          </span>
          <span className="bw-chip">Invested {formatMoney(invested)}</span>
        </span>
      </footer>
    </>
  );
}
