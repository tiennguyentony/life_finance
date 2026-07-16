import Image from "next/image";
import Link from "next/link";

import { PLAYER_PRESETS, type PlayerPresetId } from "@/features/play/play-model";
import { MASCOT, personaCharacter } from "@/features/play/persona-art";

import moneyRoom from "../../public/assets/scenes/money-room.png";

const CAST_ORDER: readonly PlayerPresetId[] = [
  "software",
  "nurse",
  "teacher",
  "established",
];

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <h1>Make financial decisions. See the system react.</h1>
          <p className="hero-lede">
            Play through years of salaries, taxes, markets, and surprises in a
            simulated life. Every outcome traces back to a decision you made,
            with the receipts to prove it.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-primary btn-lg" href="/play">
              Start your run
            </Link>
            <a className="btn btn-quiet btn-lg" href="#playable">
              What is playable
            </a>
          </div>
          <ul className="fact-strip">
            <li>Deterministic engine</li>
            <li>Every turn auditable</li>
            <li>2026 US tax rules, pinned</li>
          </ul>
        </div>
        <div className="hero-art">
          <Image
            alt="A toy room piled with cash stacks, gold coins, a safe, and a piggy bank wearing sunglasses"
            className="hero-scene"
            placeholder="blur"
            priority
            sizes="(max-width: 780px) 100vw, 44vw"
            src={moneyRoom}
          />
        </div>
      </section>

      <section aria-labelledby="cast-heading" className="cast">
        <h2 className="section-title" id="cast-heading">
          Pick your player
        </h2>
        <p className="section-lede">
          Four starting lives, one deterministic world. Salary, city, benefits,
          and risk all come from the run you choose.
        </p>
        <div className="cast-grid">
          {CAST_ORDER.map((presetId) => {
            const preset = PLAYER_PRESETS[presetId];
            const character = personaCharacter(presetId);
            return (
              <Link
                className="cast-card"
                href={`/play?persona=${presetId}`}
                key={presetId}
              >
                <Image
                  alt={character.alt}
                  className="cast-portrait"
                  height={character.height}
                  sizes="(max-width: 540px) 88vw, (max-width: 780px) 44vw, 250px"
                  src={character.src}
                  width={character.width}
                />
                <strong className="cast-name">{character.name}</strong>
                <span className="cast-role">{preset.label}</span>
                <p className="cast-tagline">{character.tagline}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <section
        aria-labelledby="capabilities-heading"
        className="capabilities"
        id="playable"
      >
        <h2 className="section-title" id="capabilities-heading">
          What is playable now
        </h2>
        <div className="capability-grid">
          <article className="capability-card capability-card-engine">
            <h3>A balance sheet that actually moves</h3>
            <p>
              Income, living costs, debt service, investments, inflation, and
              market returns reconcile every simulated month.
            </p>
            <div aria-hidden="true" className="mini-receipt">
              <div>
                <span>Gross salary</span>
                <strong className="tnum">$10,000</strong>
              </div>
              <div>
                <span>Modeled tax</span>
                <strong className="tnum">-$2,180</strong>
              </div>
              <div>
                <span>Saved and invested</span>
                <strong className="tnum">-$1,400</strong>
              </div>
              <div className="mini-receipt-total">
                <span>Take-home cash</span>
                <strong className="tnum">$6,420</strong>
              </div>
            </div>
          </article>
          <article className="capability-card">
            <h3>Tax, benefits, and protection</h3>
            <p>
              Pinned tax estimates, 401(k), HSA, employer match, health plans,
              and insurance shape take-home pay and exposure.
            </p>
          </article>
          <article className="capability-card">
            <h3>Recurring strategy and one-time decisions</h3>
            <p>
              Allocate each paycheck, manage debt and liquidity, change
              lifestyle, buy a home, or invest in future earnings.
            </p>
          </article>
          <article className="capability-card capability-card-evidence">
            <h3>Evidence behind every consequence</h3>
            <p>
              Paycheck traces, checkpoints, event alternatives, and an embedded
              glossary connect financial concepts to decisions.
            </p>
            <div aria-hidden="true" className="evidence-chips">
              <span>trace tx.2027-03.a41</span>
              <span>checkpoint #38</span>
              <span>seed browser-9f2c</span>
            </div>
          </article>
        </div>
      </section>

      <section className="closing">
        <Image
          alt={MASCOT.alt}
          className="closing-portrait"
          height={MASCOT.height}
          sizes="132px"
          src={MASCOT.src}
          width={MASCOT.width}
        />
        <h2 className="section-title">Ready to grow?</h2>
        <p>
          Start with a persona, stress-test a whole life, and keep every
          receipt along the way.
        </p>
        <Link className="btn btn-primary btn-lg" href="/play">
          Start a simulation
        </Link>
      </section>
    </>
  );
}
