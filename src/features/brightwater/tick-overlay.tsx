"use client";

import { useEffect, useMemo, useState } from "react";

import { formatMoney } from "./format";
import { DECISIONS, MONTHS_PER_CHAPTER, type RunResult } from "./model";

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
      ? `Months ${previouslyShown + 1}-${previouslyShown + newMonths.length}`
      : "Right away";

  return (
    <div aria-labelledby="tick-title" className="modal-backdrop" role="dialog">
      <article className="modal-panel" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <div>
            <p>
              {option.label} &middot; {monthSpan}
            </p>
            <h2 id="tick-title">
              {wentBankrupt ? "The math stops working" : "Life keeps billing"}
            </h2>
          </div>
        </div>
        <ol className="bw-tick-list">
          <li className="bw-tick-row is-choice">
            <span>{option.effectChips.join(", ")}</span>
            <strong>
              {option.effects.cashNow
                ? `${option.effects.cashNow > 0 ? "+" : "-"}${formatMoney(
                    Math.abs(option.effects.cashNow),
                  )}`
                : "Locked in"}
            </strong>
          </li>
          {newMonths.map((month, index) => (
            <li
              className={`bw-tick-row${index + 2 <= revealed ? " is-shown" : ""}${
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
              <span className="bw-tick-figures">
                <span className="bw-money-positive">+{formatMoney(month.inflow)}</span>
                <span className="bw-money-negative">-{formatMoney(month.outflow)}</span>
                <strong>{formatMoney(month.cash)}</strong>
              </span>
            </li>
          ))}
          {newMonths.length === 0 ? (
            <li className="bw-tick-row is-shown is-broke">
              <span>The payment clears... and the account does not.</span>
              <strong>{formatMoney(run.finalCash)}</strong>
            </li>
          ) : null}
        </ol>
        <button
          className={`button button-large ${wentBankrupt ? "" : "button-primary"}`}
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
