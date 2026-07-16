import type { CheckpointV2Response } from "@/server/api/contracts-v2";

import { formatMoney } from "./play-model";
import type { ActivityEntry } from "./play-types";

export function RunControls({
  busy,
  blocked,
  checkpoint,
  activity,
  onRunMonths,
  onLoadCheckpoint,
}: Readonly<{
  busy: boolean;
  blocked: boolean;
  checkpoint: CheckpointV2Response | null;
  activity: readonly ActivityEntry[];
  onRunMonths: (count: number) => void;
  onLoadCheckpoint: () => void;
}>) {
  return (
    <>
      <section className="play-turn">
        <button
          className="btn btn-primary btn-lg"
          disabled={busy || blocked}
          onClick={() => onRunMonths(1)}
          type="button"
        >
          Run 1 month
        </button>
        <button
          className="btn btn-quiet btn-lg"
          disabled={busy || blocked}
          onClick={() => onRunMonths(3)}
          type="button"
        >
          Run up to 3 months
        </button>
        <button
          className="btn btn-quiet btn-lg"
          disabled={busy || blocked}
          onClick={() => onRunMonths(12)}
          type="button"
        >
          Run to next year/event
        </button>
        <button
          className="btn btn-quiet btn-lg"
          disabled={busy}
          onClick={onLoadCheckpoint}
          type="button"
        >
          Load checkpoint
        </button>
      </section>
      <p className="play-note">
        Fast-forward stops immediately at a required event or terminal outcome.
        A fully cold first tax calculation may take up to roughly two minutes.
      </p>

      {checkpoint ? (
        <section className="play-panel">
          <div className="chip-row">
            <span className="chip chip-accent">Reconciled evidence</span>
            <span className="chip">
              {checkpoint.evidence.monthsProcessed} month
              {checkpoint.evidence.monthsProcessed === 1 ? "" : "s"}
            </span>
          </div>
          <h2 className="after-chips">Checkpoint</h2>
          <div className="cashflow-grid">
            <div>
              <span>Gross income</span>
              <strong className="tnum">
                {formatMoney(checkpoint.evidence.totalGrossIncomeCents)}
              </strong>
            </div>
            <div>
              <span>Modeled tax</span>
              <strong className="tnum">
                {formatMoney(checkpoint.evidence.totalTaxCents)}
              </strong>
            </div>
            <div>
              <span>Required cash</span>
              <strong className="tnum">
                {formatMoney(checkpoint.evidence.totalRequiredCashCents)}
              </strong>
            </div>
            <div>
              <span>Debt interest</span>
              <strong className="tnum">
                {formatMoney(checkpoint.evidence.totalDebtInterestCents)}
              </strong>
            </div>
            <div>
              <span>Net-worth change</span>
              <strong className="tnum">
                {formatMoney(checkpoint.evidence.netWorthChangeCents)}
              </strong>
            </div>
            <div>
              <span>Market change</span>
              <strong className="tnum">
                {formatMoney(checkpoint.evidence.totalMarketValueChangeCents)}
              </strong>
            </div>
          </div>
          <p className="play-note">
            Every total reconciles to immutable monthly command and tax records.
          </p>
        </section>
      ) : null}

      <section className="play-panel">
        <h2>Decision log</h2>
        {activity.length ? (
          <ol className="play-activity">
            {activity.map((entry) => (
              <li key={entry.id}>{entry.message}</li>
            ))}
          </ol>
        ) : (
          <p className="play-note">No commands yet.</p>
        )}
      </section>
    </>
  );
}
