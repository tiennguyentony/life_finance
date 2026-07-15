import Link from "next/link";

import { Sprout } from "@/components/sprout";

export function Landing() {
  return (
    <div className="screen landing-screen">
      <section className="landing-copy">
        <div className="game-tag">A financial life game</div>
        <h1>Life is expensive. Make your move.</h1>
        <p>Pick a life. Survive the month. Try not to get financially jump-scared.</p>
        <div className="landing-actions">
          <Link className="button button-primary button-large" href="/start">
            Start a new life
          </Link>
          <span>No spreadsheets. Probably.</span>
        </div>
        <div className="landing-stats" aria-label="Game features">
          <div><strong>01</strong><span>decision per month</span></div>
          <div><strong>100%</strong><span>questionable luck</span></div>
          <div><strong>1</strong><span>financial Sprout</span></div>
        </div>
      </section>
      <section className="landing-mascot" aria-label="Meet Sprout">
        <div className="mascot-orbit mascot-orbit-one" />
        <div className="mascot-orbit mascot-orbit-two" />
        <div className="sprout-speech">I have a money gun and zero credentials.</div>
        <Sprout emotion="celebrate" priority size="large" variant="money" />
        <div className="landing-sticker">CHAOS<br />READY</div>
      </section>
    </div>
  );
}
