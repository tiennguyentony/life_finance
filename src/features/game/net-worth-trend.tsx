import type { NetWorthPoint } from "@/types/game";

import { formatMoney } from "./game-format";

export function NetWorthTrend({ points }: { readonly points: readonly NetWorthPoint[] }) {
  const values = points.map((point) => point.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(maximum - minimum, 1);
  const coordinates = points.map((point, index) => ({
    ...point,
    x: points.length === 1 ? 50 : 6 + (index / (points.length - 1)) * 88,
    y: 82 - ((point.value - minimum) / range) * 58,
  }));
  const polyline = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
  const latest = points.at(-1);

  return (
    <section className="sim-trend" aria-label="Net worth trend">
      <div className="sim-section-heading">
        <div>
          <span>Net worth trend</span>
          <strong>{latest ? formatMoney(latest.value) : "$0"}</strong>
        </div>
        <small>{latest?.value && latest.value > points[0].value ? "Moving up" : "Holding"}</small>
      </div>
      <svg aria-hidden="true" className="sim-trend-chart" preserveAspectRatio="none" viewBox="0 0 100 100">
        <line className="sim-chart-baseline" x1="5" x2="95" y1="82" y2="82" />
        <polyline className="sim-chart-line" fill="none" points={polyline} />
        {coordinates.map((point) => (
          <circle className="sim-chart-point" cx={point.x} cy={point.y} key={`${point.month}-${point.label}`} r="2.8" />
        ))}
      </svg>
      <div className="sim-trend-labels" aria-hidden="true">
        {points.map((point) => <span key={`${point.month}-${point.label}`}>{point.label}</span>)}
      </div>
    </section>
  );
}
