import Link from "next/link";

import type { CujDefinition } from "@/core/cuj";

type FeatureShellProps = {
  readonly journey: CujDefinition;
  readonly responsibilities: readonly string[];
};

export function FeatureShell({
  journey,
  responsibilities,
}: FeatureShellProps) {
  return (
    <article className="feature-shell">
      <div className="feature-intro">
        <Link className="back-link" href="/">
          Back to repository map
        </Link>
        <p className="journey-label">Critical journey {journey.number}</p>
        <h1>{journey.title}</h1>
        <p className="lede">{journey.summary}</p>
        <dl className="status-pair">
          <div>
            <dt>Repository status</dt>
            <dd>Scaffolded</dd>
          </div>
          <div>
            <dt>Gameplay logic</dt>
            <dd>Deferred</dd>
          </div>
        </dl>
      </div>

      <section className="ownership-panel">
        <h2>This folder will own</h2>
        <ul>
          {responsibilities.map((responsibility) => (
            <li key={responsibility}>{responsibility}</li>
          ))}
        </ul>
        <p>
          Add behavior here as a focused vertical slice. Keep deterministic
          financial rules in the framework-free core.
        </p>
      </section>
    </article>
  );
}
