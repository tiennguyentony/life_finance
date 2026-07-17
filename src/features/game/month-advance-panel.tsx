import type { MonthlyProcessItem } from "@/types/game";

import { formatMoney } from "./game-format";

export function MonthAdvancePanel({
  changes,
  summary,
  onReadNews,
}: {
  readonly changes: readonly MonthlyProcessItem[];
  readonly summary: string;
  readonly onReadNews: () => void;
}) {
  return (
    <div className="sim-interruption" role="status">
      <section className="sim-month-receipt">
        <div className="sim-receipt-header">
          <span>Month 2 processed</span>
          <strong>August 2026</strong>
        </div>
        <div className="sim-process-list">
          {changes.map((change, index) => (
            <div className="sim-process-item" key={change.id} style={{ "--item-index": index } as React.CSSProperties}>
              <i aria-hidden="true" />
              <div><strong>{change.label}</strong><small>{change.note}</small></div>
              <b>{change.direction === "in" ? "+" : "-"}{formatMoney(change.amount)}</b>
            </div>
          ))}
        </div>
        <p>{summary}</p>
        <button autoFocus className="sim-news-button" onClick={onReadNews} type="button">
          Read breaking news
          <span>The City Ledger is interrupting</span>
        </button>
      </section>
    </div>
  );
}
