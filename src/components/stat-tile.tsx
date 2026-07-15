import type { StatView } from "@/types/game";

type StatTileProps = {
  readonly stat: StatView;
  readonly featured?: boolean;
};

export function StatTile({ stat, featured = false }: StatTileProps) {
  return (
    <article className={`stat-tile${featured ? " stat-tile-featured" : ""}`}>
      <div className="stat-heading">
        <span>{stat.label}</span>
        {stat.trend ? <i aria-hidden="true" className={`trend trend-${stat.trend}`} /> : null}
      </div>
      <strong className="stat-value" key={stat.value}>{stat.value}</strong>
      <p>{stat.note}</p>
    </article>
  );
}
