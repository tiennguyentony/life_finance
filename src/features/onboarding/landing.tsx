import Image from "next/image";
import Link from "next/link";

const landingFrames = [1, 2, 3, 4] as const;

export function Landing() {
  return (
    <div className="splash-screen">
      <Image
        alt=""
        aria-hidden="true"
        className="splash-background"
        fill
        priority
        sizes="100vw"
        src="/assets/game/landing-background.png"
        unoptimized
      />

      <header className="landing-topbar">
        <div className="landing-brand" aria-label="Life Finance">
          <span className="landing-brand-mascot">
            <Image
              alt=""
              fill
              sizes="72px"
              src="/assets/characters/sprout/reference/sprout-landing-3.png"
            />
          </span>
          <strong>Life<br />Finance</strong>
        </div>
        <div className="landing-account-actions">
          <Link className="landing-login" href="/game">Log in</Link>
          <Link className="landing-start" href="/start">Start</Link>
        </div>
      </header>

      <nav aria-label="Landing navigation" className="landing-rail">
        <Link aria-current="page" href="/">Play</Link>
        <Link href="/game">Goals</Link>
        <Link href="/game">Stats</Link>
      </nav>

      <section aria-label="Sprout character showcase" className="landing-character-stage">
        {landingFrames.map((frame, index) => (
          <Image
            alt={index === 0 ? "Sprout celebrating with a money gun" : ""}
            aria-hidden={index === 0 ? undefined : true}
            className={`landing-sprout-frame landing-sprout-frame-${frame}`}
            fill
            key={frame}
            loading="eager"
            sizes="(max-width: 700px) 92vw, 760px"
            src={`/assets/characters/sprout/reference/sprout-landing-${frame}.png`}
            unoptimized
          />
        ))}
      </section>

      <Link className="landing-play-button" href="/start">
        Play
      </Link>

      <div aria-label="Available Sprout styles" className="landing-skins">
        {landingFrames.map((frame) => (
          <span className="landing-skin" key={frame}>
            <Image
              alt=""
              fill
              sizes="44px"
              src={`/assets/characters/sprout/reference/sprout-landing-${frame}.png`}
            />
          </span>
        ))}
        <strong>+4</strong>
      </div>

      <aside className="landing-challenge">
        <div>
          <span>Current challenge</span>
          <strong>Survive 24 months.</strong>
          <progress aria-label="Eight of twenty-four months survived" max="24" value="8" />
        </div>
        <b>24</b>
      </aside>
    </div>
  );
}
