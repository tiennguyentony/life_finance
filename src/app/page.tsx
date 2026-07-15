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
            Try the deterministic financial simulation through its live
            production backend.
          </p>
          <Link className="primary-link" href="/play">
            Play the live backend
          </Link>
        </div>
        <aside className="scope-panel">
          <h2>A thin UI over the real engine</h2>
          <p>
            This developer interface is intentionally replaceable. Every turn,
            tax result, event, and checkpoint comes from the authoritative API.
          </p>
          <div className="scope-facts">
            <span>Runtime</span>
            <strong>Vercel + Supabase</strong>
            <span>Players</span>
            <strong>Single-player</strong>
            <span>Persistence</span>
            <strong>PostgreSQL</strong>
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
