"use client";

import { formatMoney } from "@/features/play/play-model";

import { cashflowLines, type ChoiceId } from "./model";

/** The monthly ledger: where every dollar goes once a month ticks. */
export function CashflowSheet({
  choices,
  monthlyNet,
  onClose,
}: Readonly<{
  choices: readonly ChoiceId[];
  monthlyNet: number;
  onClose: () => void;
}>) {
  const lines = cashflowLines(choices);
  return (
    <div aria-labelledby="cashflow-title" className="game-overlay" role="dialog">
      <article className="game-card cashflow-card">
        <div className="chip-row">
          <span className="chip chip-accent">Monthly ledger</span>
        </div>
        <h2 id="cashflow-title">Where a month goes</h2>
        <dl className="cashflow-lines">
          {lines.map((line) => (
            <div key={line.label}>
              <dt>{line.label}</dt>
              <dd
                className={`tnum${
                  line.amount > 0
                    ? " money-positive"
                    : line.amount < 0
                      ? " money-negative"
                      : ""
                }`}
              >
                {line.amount > 0 ? "+" : line.amount < 0 ? "-" : ""}
                {formatMoney(Math.abs(line.amount) * 100)}
              </dd>
            </div>
          ))}
          <div className="cashflow-total">
            <dt>Net each month</dt>
            <dd
              className={`tnum ${
                monthlyNet >= 0 ? "money-positive" : "money-negative"
              }`}
            >
              {monthlyNet >= 0 ? "+" : "-"}
              {formatMoney(Math.abs(monthlyNet) * 100)}
            </dd>
          </div>
        </dl>
        <p className="play-note">
          Decisions you have not made yet are not billed yet. The ledger grows
          as your life does.
        </p>
        <div className="game-card-actions">
          <button autoFocus className="btn btn-primary" onClick={onClose} type="button">
            Back to the city
          </button>
        </div>
      </article>
    </div>
  );
}
