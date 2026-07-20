import Image from "next/image";
import Link from "next/link";

import { DemoLaunchButton } from "./demo-launch-button";

const landingPerformance = [
  { action: "money-burst", frame: 1 },
  { action: "victory-bounce", frame: 2 },
  { action: "confident-reset", frame: 3 },
  { action: "lucky-finale", frame: 4 },
] as const;

const runSteps = [
  {
    title: "Choose your life",
    body: "A persona sets your salary, city, cash buffer, and debts.",
    art: "/assets/characters/penny/penny-map.png",
    artAlt: "Penny holding a map",
    visual: "personas",
  },
  {
    title: "Plan the month",
    body: "Set the dials: budget, debt payments, investing, career.",
    art: "/assets/characters/richie/richie-chart.png",
    artAlt: "Richie pointing at a chart",
    visual: "dials",
  },
  {
    title: "Life happens",
    body: "Events pause the month until you pick a way through.",
    art: "/assets/characters/mr-layoff/mr-layoff-box.png",
    artAlt: "Mr. Layoff carrying an office box",
    visual: "event",
  },
  {
    title: "Reach independence",
    body: "Win when your investments can fund your life for good.",
    art: "/assets/characters/luckycat/luckycat-financial-freedom.png",
    artAlt: "Lucky Cat celebrating financial freedom",
    visual: "goal",
  },
] as const;

const castMembers = [
  { name: "Debtzilla", role: "feeds on interest", art: "/assets/characters/debtzilla/debtzilla-rage.png" },
  { name: "Mr. Layoff", role: "cuts the paycheck", art: "/assets/characters/mr-layoff/mr-layoff-idle.png" },
  { name: "Sneaky", role: "runs the scams", art: "/assets/characters/sneaky/sneaky-phone-scam.png" },
  { name: "Impulso", role: "one-click spending", art: "/assets/characters/impulso/impulso-sale.png" },
  { name: "Inflato", role: "raises every price", art: "/assets/characters/inflato/inflato-pizza.png" },
  { name: "Bear Market", role: "sinks portfolios", art: "/assets/characters/market-crash/market-crash-bear.png" },
  { name: "Lucky Cat", role: "windfalls happen too", art: "/assets/characters/luckycat/luckycat-moneybag.png" },
  { name: "Promotion", role: "so do raises", art: "/assets/characters/promotion/promotion-trophy.png" },
] as const;

type LandingProps = Readonly<{
  demoEnabled?: boolean;
}>;

export function Landing({ demoEnabled = false }: LandingProps) {
  return (
    <div className="landing-page">
      <header className="landing-nav">
        <div className="landing-brand" aria-label="Life Finance">
          <span className="landing-brand-mascot">
            <Image
              alt=""
              fill
              sizes="44px"
              src="/assets/characters/sprout/poses/idle.png"
              unoptimized
            />
          </span>
          <span>
            <strong>Life Finance</strong>
            <small>play your money</small>
          </span>
        </div>
        <div className="landing-run-pill">
          <small>New run</small>
          <strong>Month 1</strong>
        </div>
        <div className="landing-nav-spacer" />
        <Link className="landing-login" href="/login">
          Log in
        </Link>
        <Link className="landing-cta" href="/login">
          Play now
        </Link>
      </header>

      <section aria-labelledby="landing-hero-title" className="landing-hero">
        <div className="landing-hero-copy">
          <p className="landing-eyebrow">A financial life simulation</p>
          <h1 id="landing-hero-title">Learn money by living the choices</h1>
          <p className="landing-lede">
            Pick a persona, plan one month at a time, and watch cash, debt, and
            net worth respond to real life events - with Sprout cheering you on.
          </p>
          <ul className="landing-chips">
            <li data-tone="green">One month per turn</li>
            <li>No dice - just decisions</li>
            <li data-tone="gold">Real life events</li>
          </ul>
          <div className="landing-cta-row">
            <Link className="landing-cta landing-cta-large" href="/login">
              Play now
            </Link>
            {demoEnabled ? <DemoLaunchButton /> : null}
          </div>
          <p className="landing-fineprint">Free - runs right in your browser.</p>
        </div>

        <div className="landing-hero-stage">
          <div
            aria-label="Sprout performing a celebration loop"
            className="landing-stage-art"
            role="img"
          >
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
                  loading={index === 0 ? "eager" : "lazy"}
                  sizes="(max-width: 900px) 88vw, 520px"
                  src={`/assets/characters/sprout/reference/sprout-landing-${frame}.webp`}
                  unoptimized
                />
              </span>
            ))}
          </div>
          <div className="landing-stage-goal">
            <span className="landing-goal-eyebrow">
              Goal: financial independence
            </span>
            <span aria-hidden="true" className="landing-goal-meter">
              <i style={{ width: "36%" }} />
            </span>
            <span className="landing-goal-note">
              every run works toward one goal
            </span>
          </div>
        </div>
      </section>

      <section aria-labelledby="landing-how-title" className="landing-how">
        <p className="landing-eyebrow">How a run plays</p>
        <h2 id="landing-how-title">Four beats, every month</h2>
        <ol className="landing-steps">
          {runSteps.map((step, index) => (
            <li className="landing-step" key={step.title}>
              <span aria-hidden="true" className="landing-step-number">
                {index + 1}
              </span>
              <span className="landing-step-art">
                <Image
                  alt={step.artAlt}
                  fill
                  sizes="(max-width: 900px) 44vw, 220px"
                  src={step.art}
                  unoptimized
                />
              </span>
              <strong>{step.title}</strong>
              <p>{step.body}</p>
              <StepVisual visual={step.visual} />
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="landing-cast-title" className="landing-cast">
        <p className="landing-eyebrow">Real life events</p>
        <h2 id="landing-cast-title">Life keeps showing up</h2>
        <ul className="landing-cast-grid">
          {castMembers.map((member) => (
            <li className="landing-cast-card" key={member.name}>
              <span className="landing-cast-art">
                <Image
                  alt={member.name}
                  fill
                  sizes="(max-width: 900px) 40vw, 160px"
                  src={member.art}
                  unoptimized
                />
              </span>
              <strong>{member.name}</strong>
              <small>{member.role}</small>
            </li>
          ))}
        </ul>
      </section>

      <section className="landing-final">
        <div>
          <h2>Ready to grow?</h2>
          <p>One month per turn. Every number explained.</p>
        </div>
        <Link className="landing-cta landing-cta-large" href="/login">
          Play now
        </Link>
      </section>
    </div>
  );
}

/** Tiny data-free illustrations so each step reads as a picture, not a paragraph. */
function StepVisual({ visual }: Readonly<{ visual: string }>) {
  if (visual === "personas") {
    return (
      <span aria-hidden="true" className="landing-mini landing-mini-chips">
        <i>Developer</i>
        <i>Educator</i>
        <i>Big city</i>
      </span>
    );
  }
  if (visual === "dials") {
    return (
      <span aria-hidden="true" className="landing-mini landing-mini-dials">
        <i style={{ width: "72%" }} />
        <i data-tone="gold" style={{ width: "48%" }} />
        <i data-tone="red" style={{ width: "30%" }} />
      </span>
    );
  }
  if (visual === "event") {
    return (
      <span aria-hidden="true" className="landing-mini landing-mini-chips">
        <i data-tone="red">Take the hit</i>
        <i data-tone="green">Push back</i>
      </span>
    );
  }
  return (
    <span aria-hidden="true" className="landing-mini landing-mini-goal">
      <i style={{ width: "82%" }} />
    </span>
  );
}
