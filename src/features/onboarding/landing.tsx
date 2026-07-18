import Image from "next/image";
import Link from "next/link";

import { DemoLaunchButton } from "./demo-launch-button";

const landingPerformance = [
  { action: "money-burst", frame: 1 },
  { action: "victory-bounce", frame: 2 },
  { action: "confident-reset", frame: 3 },
  { action: "lucky-finale", frame: 4 },
] as const;

type LandingProps = Readonly<{
  demoEnabled?: boolean;
}>;

export function Landing({ demoEnabled = false }: LandingProps) {
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
              unoptimized
            />
          </span>
          <strong>Life<br />Finance</strong>
        </div>
        <div className="landing-account-actions">
          {demoEnabled ? <DemoLaunchButton /> : null}
          <Link className="landing-start" href="/start">Start</Link>
        </div>
      </header>

      <nav aria-label="Landing navigation" className="landing-rail">
        <Link aria-current="page" href="/">Play</Link>
        <Link href="/game">Goals</Link>
        <Link href="/game">Stats</Link>
      </nav>

      <section aria-label="Sprout performing a celebration loop" className="landing-character-stage">
        {landingPerformance.map(({ action, frame }, index) => (
          <span
            className={`landing-sprout-act landing-sprout-act-${frame}`}
            data-action={action}
            key={action}
          >
            <Image
              alt={index === 0 ? "Sprout celebrating with a money gun" : ""}
              aria-hidden={index === 0 ? undefined : true}
              className={`landing-sprout-art landing-sprout-art-${frame}`}
              fill
              loading="eager"
              sizes="(max-width: 820px) 96vw, 900px"
              src={`/assets/characters/sprout/reference/sprout-landing-${frame}.png`}
              unoptimized
            />
          </span>
        ))}
      </section>

      <Link className="landing-play-button" href="/start">
        Play
      </Link>

    </div>
  );
}
