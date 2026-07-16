"use client";

import { formatMoney } from "./format";
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
    <div aria-labelledby="cashflow-title" className="modal-backdrop" role="dialog">
      <article className="modal-panel" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <div>
            <p>Monthly ledger</p>
            <h2 id="cashflow-title">Where a month goes</h2>
          </div>
        </div>
        <div className="event-changes">
          {lines.map((line) => (
            <div className="event-change" key={line.label}>
              <span>{line.label}</span>
              {line.amount === 0 ? (
                <strong>{formatMoney(0)}</strong>
              ) : (
                <strong className={line.amount > 0 ? "bw-money-positive" : "bw-money-negative"}>
                  {line.amount > 0 ? "+" : "-"}
                  {formatMoney(Math.abs(line.amount))}
                </strong>
              )}
            </div>
          ))}
          <div className="event-change" style={{ background: "var(--gold)" }}>
            <span>Net each month</span>
            <strong className={monthlyNet >= 0 ? "bw-money-positive" : "bw-money-negative"}>
              {monthlyNet >= 0 ? "+" : "-"}
              {formatMoney(Math.abs(monthlyNet))}
            </strong>
          </div>
        </div>
        <p className="event-explanation">
          Decisions you have not made yet are not billed yet. The ledger grows as your
          life does.
        </p>
        <button
          autoFocus
          className="button button-primary"
          onClick={onClose}
          style={{ marginTop: "1rem" }}
          type="button"
        >
          Back to the city
        </button>
      </article>
    </div>
  );
}
