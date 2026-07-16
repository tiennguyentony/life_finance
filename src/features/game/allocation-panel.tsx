"use client";

import { useState } from "react";

import { formatMoney } from "@/features/play/play-model";

import { BUCKET_RATES, type Allocation } from "./model";

type BucketKey = keyof Allocation;

const BUCKETS: readonly Readonly<{
  key: BucketKey;
  label: string;
  rate: string;
  note: string;
}>[] = [
  {
    key: "cash",
    label: "Cash reserve",
    rate: "0%/mo",
    note: "Sleeps well, earns nothing",
  },
  {
    key: "index",
    label: "Broad index",
    rate: "+0.9%/mo",
    note: "Steady, diversified growth",
  },
  {
    key: "growth",
    label: "Growth stocks",
    rate: "-2.4% to +5%/mo",
    note: "A rollercoaster with upside",
  },
  {
    key: "reit",
    label: "Housing REIT",
    rate: "+0.55%/mo",
    note: "Real estate without the roof",
  },
];

const GROWTH_PREVIEW = BUCKET_RATES.growthCycle
  .map((rate) => `${rate > 0 ? "+" : ""}${(rate * 100).toFixed(1)}%`)
  .join(", ");

/**
 * Sprout Bank: the asset-allocation dashboard. Sliders shape where invested
 * money sits; transfer buttons move cash in and out of the pool.
 */
export function AllocationPanel({
  allocation,
  cash,
  invested,
  onAllocate,
  onMove,
  onClose,
}: Readonly<{
  allocation: Allocation;
  cash: number;
  invested: number;
  onAllocate: (allocation: Allocation) => void;
  onMove: (toInvested: number) => void;
  onClose: () => void;
}>) {
  const [weights, setWeights] = useState<Record<BucketKey, number>>({
    cash: Math.round(allocation.cash * 100),
    index: Math.round(allocation.index * 100),
    growth: Math.round(allocation.growth * 100),
    reit: Math.round(allocation.reit * 100),
  });
  const total = weights.cash + weights.index + weights.growth + weights.reit;

  const effective = (key: BucketKey): number =>
    total === 0 ? (key === "cash" ? 100 : 0) : (weights[key] / total) * 100;

  const apply = () => {
    if (total === 0) {
      onAllocate({ cash: 1, index: 0, growth: 0, reit: 0 });
    } else {
      onAllocate({
        cash: weights.cash / total,
        index: weights.index / total,
        growth: weights.growth / total,
        reit: weights.reit / total,
      });
    }
    onClose();
  };

  const moveOptions = [500, 2_000].filter((amount) => amount <= cash);
  const halfCash = Math.floor(cash / 2 / 100) * 100;

  return (
    <div aria-labelledby="bank-title" className="game-overlay" role="dialog">
      <article className="game-card bank-card">
        <div className="chip-row">
          <span className="chip chip-gold">Sprout Bank</span>
          <span className="chip tnum">Cash {formatMoney(cash * 100)}</span>
          <span className="chip tnum">Invested {formatMoney(invested * 100)}</span>
        </div>
        <h2 id="bank-title">Put your money to work</h2>
        <p className="panel-sub">
          Growth compounds monthly with mocked, deterministic returns. Invested
          money cannot rescue your cash: if cash hits zero, the run ends.
        </p>

        <section className="bank-section">
          <h3>Move money</h3>
          <div className="chip-row">
            {moveOptions.map((amount) => (
              <button
                className="btn btn-quiet"
                key={amount}
                onClick={() => onMove(amount)}
                type="button"
              >
                Invest {formatMoney(amount * 100)}
              </button>
            ))}
            {halfCash >= 500 ? (
              <button
                className="btn btn-quiet"
                onClick={() => onMove(halfCash)}
                type="button"
              >
                Invest half ({formatMoney(halfCash * 100)})
              </button>
            ) : null}
            {invested > 0 ? (
              <button
                className="btn btn-quiet"
                onClick={() => onMove(-invested)}
                type="button"
              >
                Sell everything to cash
              </button>
            ) : null}
          </div>
          {moveOptions.length === 0 && invested === 0 ? (
            <p className="play-note">
              Nothing spare to invest yet. Survive a little first.
            </p>
          ) : null}
        </section>

        <section className="bank-section">
          <h3>Allocation</h3>
          <div className="bank-sliders">
            {BUCKETS.map((bucket) => (
              <label className="bank-slider" key={bucket.key}>
                <span className="bank-slider-head">
                  <strong>{bucket.label}</strong>
                  <span className="chip tnum">{bucket.rate}</span>
                  <output className="tnum">
                    {Math.round(effective(bucket.key))}%
                  </output>
                </span>
                <input
                  max={100}
                  min={0}
                  onChange={(event) =>
                    setWeights((current) => ({
                      ...current,
                      [bucket.key]: event.target.valueAsNumber,
                    }))
                  }
                  step={5}
                  type="range"
                  value={weights[bucket.key]}
                />
                <small>{bucket.note}</small>
              </label>
            ))}
          </div>
          <p className="play-note">
            Growth stocks cycle deterministically: {GROWTH_PREVIEW}, repeating.
          </p>
        </section>

        <div className="game-card-actions">
          <button className="btn btn-primary" onClick={apply} type="button">
            Apply allocation
          </button>
          <button className="btn btn-quiet" onClick={onClose} type="button">
            Close
          </button>
        </div>
      </article>
    </div>
  );
}
