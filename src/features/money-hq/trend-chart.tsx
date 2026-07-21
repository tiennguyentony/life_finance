"use client";

import type { TrailPoint } from "./run-trail";
import { formatCents, formatShortMonthLabel } from "./hq-view";

type Props = Readonly<{
  trail: readonly TrailPoint[];
  /** Which recorded series to draw. */
  series?: "netWorthCents" | "cashCents";
  /** Hide the chips when the host card already summarises the change. */
  withSummary?: boolean;
}>;

const WIDTH = 560;
const HEIGHT = 120;
const PADDING_TOP = 14;
const PADDING_BOTTOM = 8;

/**
 * Draws the recorded balance trail. Points come from real month responses, so
 * the caption says what the line is rather than implying a server-side history.
 */
export function TrendChart({
  trail,
  series = "netWorthCents",
  withSummary = true,
}: Props) {
  if (trail.length < 2) {
    return (
      <p className="hq-unavailable">
        Play a second month and the trend line appears here.
      </p>
    );
  }

  const values = trail.map((point) => point[series]);
  const minimum = Math.min(...values, 0);
  const maximum = Math.max(...values);
  const span = maximum - minimum || 1;
  const usableHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;

  const coordinates = trail.map((point, index) => {
    const x = trail.length === 1 ? WIDTH : (index / (trail.length - 1)) * WIDTH;
    const y =
      PADDING_TOP + usableHeight - ((point[series] - minimum) / span) * usableHeight;
    return { x, y };
  });

  const line = coordinates
    .map(({ x, y }, index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`;
  const last = coordinates.at(-1)!;
  const first = trail[0]!;
  const latest = trail.at(-1)!;
  const change = latest[series] - first[series];
  const rising = change >= 0;

  return (
    <>
      <svg
        aria-label={`${series === "cashCents" ? "Cash" : "Net worth"} across ${trail.length} recorded months`}
        role="img"
        style={{ width: "100%", height: HEIGHT, display: "block" }}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      >
        <path
          d={area}
          fill={rising ? "rgba(52,180,106,.16)" : "rgba(217,75,63,.14)"}
        />
        <path
          d={line}
          fill="none"
          stroke={rising ? "var(--hq-green)" : "var(--hq-red)"}
          strokeLinecap="round"
          strokeWidth={3.5}
        />
        <circle
          cx={last.x}
          cy={last.y}
          fill={rising ? "var(--hq-green)" : "var(--hq-red)"}
          r={5}
        />
      </svg>
      {withSummary ? (
        <div className="hq-chip-row">
          <span className="hq-chip" data-tone={rising ? "positive" : "negative"}>
            {rising ? "▲" : "▼"} {formatCents(Math.abs(change))} since{" "}
            {formatShortMonthLabel(first.month)}
          </span>
          <span className="hq-chip">{trail.length} months recorded</span>
        </div>
      ) : null}
    </>
  );
}
