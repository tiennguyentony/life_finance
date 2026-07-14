import Link from "next/link";

import { CUJS } from "@/core/cuj";

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="hero-kicker">A financial life simulation</p>
          <h1>Build the game one clear journey at a time.</h1>
          <p>
            Four CUJs, deterministic rules, and local-first saves without
            premature infrastructure.
          </p>
          <Link className="primary-link" href="/character">
            Open the first journey
          </Link>
        </div>
        <aside className="scope-panel">
          <h2>The boundary is the product</h2>
          <p>
            Routes own presentation. Features own journeys. Core stays pure.
            Data stays static until gameplay needs it.
          </p>
          <div className="scope-facts">
            <span>Runtime</span>
            <strong>Browser</strong>
            <span>Players</span>
            <strong>Single-player</strong>
            <span>Persistence</span>
            <strong>Local-first</strong>
          </div>
        </aside>
      </section>

      <section className="journeys" aria-labelledby="journeys-heading">
        <h2 id="journeys-heading">Four journeys, separate ownership.</h2>
        <div className="journey-grid">
          {CUJS.map((journey) => (
            <Link className="journey-card" href={journey.href} key={journey.slug}>
              <span>CUJ {journey.number}</span>
              <h3>{journey.title}</h3>
              <p>{journey.summary}</p>
              <strong>View boundary</strong>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
