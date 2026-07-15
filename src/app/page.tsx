import Link from "next/link";

const CAPABILITIES = [
  {
    label: "Monthly engine",
    title: "A balance sheet that actually moves",
    summary:
      "Income, living costs, debt service, investments, inflation, and market returns reconcile every simulated month.",
  },
  {
    label: "US financial rules",
    title: "Tax, benefits, and protection",
    summary:
      "Pinned tax estimates, 401(k), HSA, employer match, health plans, and insurance shape take-home pay and exposure.",
  },
  {
    label: "Player agency",
    title: "Recurring strategy and one-time decisions",
    summary:
      "Allocate each paycheck, manage debt and liquidity, change lifestyle, buy a home, or invest in future earnings.",
  },
  {
    label: "Explainable outcomes",
    title: "Evidence behind every consequence",
    summary:
      "Paycheck traces, checkpoints, event alternatives, and an embedded glossary connect financial concepts to decisions.",
  },
] as const;

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="hero-kicker">A financial life simulation</p>
          <h1>Make financial decisions. See the system react.</h1>
          <p>
            Build resilience and pursue financial independence through a
            deterministic simulation backed by persisted, auditable turns.
          </p>
          <Link className="primary-link" href="/play">
            Start a simulation
          </Link>
        </div>
        <aside className="scope-panel">
          <h2>A simple interface over the real engine</h2>
          <p>
            Every tax result, market move, personal event, and checkpoint comes
            from the same authoritative backend used for the complete game.
          </p>
          <div className="scope-facts">
            <span>Runtime</span>
            <strong>Vercel + Supabase</strong>
            <span>Simulation</span>
            <strong>Deterministic</strong>
            <span>Evidence</span>
            <strong>Immutable records</strong>
          </div>
        </aside>
      </section>

      <section className="capabilities" aria-labelledby="capabilities-heading">
        <h2 id="capabilities-heading">What is playable now</h2>
        <div className="capability-grid">
          {CAPABILITIES.map((capability) => (
            <article className="capability-card" key={capability.label}>
              <span>{capability.label}</span>
              <h3>{capability.title}</h3>
              <p>{capability.summary}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
