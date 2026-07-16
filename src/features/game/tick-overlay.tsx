"use client";

import { useEffect, useMemo, useState } from "react";

import { formatMoney } from "@/features/play/play-model";

import {
  DECISIONS,
  MONTHS_PER_CHAPTER,
  type RunResult,
} from "./model";

const REVEAL_STEP_MS = 620;

/** Plays the months that follow a decision, one ledger row at a time. */
export function TickOverlay({
  run,
  chapter,
  previouslyShown,
  reducedMotion,
  onDone,
}: Readonly<{
  run: RunResult;
  /** Chapter count AFTER the just-made choice (1-based). */
  chapter: number;
  previouslyShown: number;
  reducedMotion: boolean;
  onDone: () => void;
}>) {
  const decision = DECISIONS[chapter - 1]!;
  const choiceId = run.choices[chapter - 1]!;
  const option = decision.options.find(({ id }) => id === choiceId)!;
  const newMonths = useMemo(
    () => run.months.slice(previouslyShown),
    [run.months, previouslyShown],
  );
  const totalRows = newMonths.length + 1;
  const [revealed, setRevealed] = useState(reducedMotion ? totalRows : 1);

  useEffect(() => {
    if (reducedMotion || revealed >= totalRows) return;
    const timer = setTimeout(
      () => setRevealed((current) => current + 1),
      REVEAL_STEP_MS,
    );
    return () => clearTimeout(timer);
  }, [reducedMotion, revealed, totalRows]);

  const complete = revealed >= totalRows;
  const wentBankrupt = run.outcome === "bankrupt";
  const survivedAll = run.outcome === "survived";
  const monthSpan =
    newMonths.length > 0
      ? `Months ${previouslyShown + 1} to ${previouslyShown + newMonths.length}`
      : "Right away";

  return (
    <div aria-labelledby="tick-title" className="game-overlay" role="dialog">
      <article className="game-card tick-card">
        <div className="chip-row">
          <span className="chip chip-accent">{option.label}</span>
          <span className="chip">{monthSpan}</span>
        </div>
        <h2 id="tick-title">
          {wentBankrupt ? "The math stops working" : "Life keeps billing"}
        </h2>
        <ol className="tick-list">
          <li className="tick-row is-choice">
            <span>{option.effectChips.join(", ")}</span>
            <strong className="tnum">
              {option.effects.cashNow
                ? `${option.effects.cashNow > 0 ? "+" : "-"}${formatMoney(
                    Math.abs(option.effects.cashNow) * 100,
                  )}`
                : "Locked in"}
            </strong>
          </li>
          {newMonths.map((month, index) => (
            <li
              className={`tick-row${index + 2 <= revealed ? " is-shown" : ""}${
                month.cash < 0 ? " is-broke" : ""
              }`}
              key={month.month}
            >
              <span>
                Month {month.month}
                {month.notes.map((note) => (
                  <em key={note}> {note}</em>
                ))}
              </span>
              <span className="tick-figures tnum">
                <span className="money-positive">
                  +{formatMoney(month.inflow * 100)}
                </span>
                <span className="money-negative">
                  -{formatMoney(month.outflow * 100)}
                </span>
                <strong>{formatMoney(month.cash * 100)}</strong>
              </span>
            </li>
          ))}
          {newMonths.length === 0 ? (
            <li className="tick-row is-shown is-broke">
              <span>The payment clears... and the account does not.</span>
              <strong className="tnum">{formatMoney(run.finalCash * 100)}</strong>
            </li>
          ) : null}
        </ol>
        <button
          className={`btn btn-lg ${wentBankrupt ? "btn-danger" : "btn-primary"}`}
          disabled={!complete}
          onClick={onDone}
          type="button"
        >
          {wentBankrupt
            ? "Face it"
            : survivedAll
              ? "See how the year ends"
              : chapter < DECISIONS.length
                ? `On to month ${previouslyShown + MONTHS_PER_CHAPTER + 1}`
                : "Continue"}
        </button>
      </article>
    </div>
  );
}
