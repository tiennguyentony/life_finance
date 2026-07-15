import type { CheckpointV2Response } from "@/server/api/contracts-v2";

import { formatMoney } from "./play-model";

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
  activity: readonly string[];
  onRunMonths: (count: number) => void;
  onLoadCheckpoint: () => void;
}>) {
  return (
    <>
      <section className="play-turn">
        <button className="play-primary" disabled={busy || blocked} onClick={() => onRunMonths(1)} type="button">Run 1 month</button>
        <button disabled={busy || blocked} onClick={() => onRunMonths(3)} type="button">Run up to 3 months</button>
        <button disabled={busy || blocked} onClick={() => onRunMonths(12)} type="button">Run to next year/event</button>
        <button disabled={busy} onClick={onLoadCheckpoint} type="button">Load checkpoint</button>
      </section>
      <p className="play-note">
        Fast-forward stops immediately at a required event or terminal outcome. A
        fully cold first tax calculation may take up to roughly two minutes.
      </p>

      {checkpoint ? (
        <section className="play-panel">
          <div><p className="hero-kicker">Reconciled evidence</p><h2>Checkpoint · {checkpoint.evidence.monthsProcessed} month(s)</h2></div>
          <div className="cashflow-grid">
            <div><span>Gross income</span><strong>{formatMoney(checkpoint.evidence.totalGrossIncomeCents)}</strong></div>
            <div><span>Modeled tax</span><strong>{formatMoney(checkpoint.evidence.totalTaxCents)}</strong></div>
            <div><span>Required cash</span><strong>{formatMoney(checkpoint.evidence.totalRequiredCashCents)}</strong></div>
            <div><span>Debt interest</span><strong>{formatMoney(checkpoint.evidence.totalDebtInterestCents)}</strong></div>
            <div><span>Net-worth change</span><strong>{formatMoney(checkpoint.evidence.netWorthChangeCents)}</strong></div>
            <div><span>Market change</span><strong>{formatMoney(checkpoint.evidence.totalMarketValueChangeCents)}</strong></div>
          </div>
          <p className="play-note">Every total reconciles to immutable monthly command and tax records.</p>
        </section>
      ) : null}

      <section className="play-panel">
        <h2>Decision log</h2>
        {activity.length ? (
          <ol className="play-activity">
            {activity.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
          </ol>
        ) : (
          <p className="play-note">No commands yet.</p>
        )}
      </section>
    </>
  );
}
