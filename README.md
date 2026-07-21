<div align="center">

<!-- TODO: replace this line with a banner/logo image, e.g. <img src="public/banner.png" alt="Life Finance" width="640" /> -->
<h1>Life Finance</h1>

<p><strong>A 3D personal-finance board game where an LLM plays the antagonist, but a deterministic engine holds every dollar.</strong></p>

<p>
  <a href="https://github.com/tiennguyentony/life_finance/actions/workflows/ci.yml"><img src="https://github.com/tiennguyentony/life_finance/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/React-19-149eca?logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Three.js-r182-000000?logo=three.js" alt="Three.js" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs welcome" />
</p>

<p>
  <!-- TODO: paste the production URL -->
  <a href="#"><strong>Live demo</strong></a>
  &nbsp;-&nbsp;
  <a href="#getting-started"><strong>Getting started</strong></a>
  &nbsp;-&nbsp;
  <a href="#features"><strong>Features</strong></a>
  &nbsp;-&nbsp;
  <a href="#architecture"><strong>Architecture</strong></a>
  &nbsp;-&nbsp;
  <a href="#roadmap"><strong>Roadmap</strong></a>
</p>

<!--
  TODO: demo GIF goes here. This is the single highest-impact thing on the page.
  Capture a 10-15 second clip of a month turn plus an AI free-text event answer,
  save it to docs/media/demo.gif, then replace this comment with:
  <img src="docs/media/demo.gif" alt="Life Finance gameplay demo" width="720" />
-->

</div>

---

## Table of contents

- [About](#about)
- [Why this is interesting](#why-this-is-interesting)
- [Features](#features)
- [Built with](#built-with)
- [Getting started](#getting-started)
- [Architecture](#architecture)
- [Routes](#routes)
- [Verify](#verify)
- [Roadmap](#roadmap)
- [Documentation](#documentation)

## About

You live a simulated financial life one month at a time.
An AI narrates your choices, interprets what you type in plain English, and voices a cast of characters that taunt and cheer as your numbers move.
The twist that makes it safe: the language model never touches your money.
It advises, classifies, and narrates; a deterministic core owns every cash, debt, and net-worth mutation and re-checks the AI before anything is applied.

## Why this is interesting

Most "AI + finance" demos let the model do the math, which means the model can hallucinate money.
We inverted that.

- The deterministic engine is the source of truth for all balances, taxes, debt, and financial-independence progress.
- The AI is only ever an advisor: it interprets free text, ranks pre-approved events, and writes character dialogue.
- Every AI decision passes back through the engine, which re-validates it before applying anything.

Concretely, in the live path today: when you answer an event in your own words ("just pay for the repair now"), the model does not compute a charge.
It maps your sentence to one of a fixed set of engine-defined choices (`pay_now`, `save_bonus`, ...) with a confidence score, and the deterministic core applies the real financial effect.
A prompt-injected or hallucinating model can, at worst, pick the wrong pre-approved option; it can never invent a number.

That safety boundary is the whole point: the engine stays in control no matter what the model says, which is exactly what makes it safe to layer more aggressive AI on top later (see [Roadmap](#roadmap)).

## Features

- **3D board game.** A strategy-first monthly loop rendered with Three.js and React Three Fiber. No dice, no luck; you choose a destination and a financial plan, then advance one month.
- **Deterministic finance engine.** Authoritative cash, debt, net-worth, and FI tracking, with a real tax adapter and a self-trained ML model that ranks which life event fires next (runs locally, no API key, no network call).
- **Talk to the game in plain English.** Free-text event answers are interpreted by the AI into engine-owned choices, with a confidence gate that falls back to buttons when it is unsure.
- **A living cast.** Characters (including villains like Debtzilla, Inflato, and Impulso) react to your run with banter that is grounded in your actual numbers and cannot invent amounts.
- **Instant demo, zero setup.** One command, no database, no keys. Real HTTP, cookies, and the real engine; state lives in memory.

## Built with

- **Framework:** Next.js 16, React 19, TypeScript.
- **3D:** Three.js, React Three Fiber, Drei, postprocessing.
- **State and data:** Drizzle ORM, PostgreSQL, Supabase Auth.
- **AI:** provider-agnostic role client (Groq, OpenAI, or local Ollama), with per-role model routing, structured-output validation, and encrypted audit records.
- **ML:** a self-trained operational event-ranking model bundled as an artifact; trains via `pnpm ml:event-train`, runs with no network call.
- **Validation:** Zod contracts end to end.
- **Deploy:** Vercel, with a private service binding to a pinned PolicyEngine tax service.

## Getting started

The fastest path needs only Node.js 22+ and pnpm 11.
No database, no tax service, no AI key.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000` and choose **Instant demo**.
The demo exercises the real HTTP, cookie, application, and deterministic-engine boundaries, but keeps state in server memory and uses a simplified deterministic tax adapter.
A browser refresh preserves the run; restarting Next.js clears it.

### Enable the AI features

Set a provider in `.env.local` (see [`.env.example`](.env.example)).
`AI_PROVIDER=groq` with a `GROQ_API_KEY` is the quickest; `AI_PROVIDER=ollama` runs fully local with no key.
The monthly finance loop never waits on any of this: event ranking uses the bundled self-trained ML artifact.

### Full persistent path

For accounts and cross-device saves, copy `.env.example` to `.env.local`, configure Supabase Auth, PostgreSQL, the run-secret pepper, and the tax service, then:

```bash
pnpm db:migrate
pnpm dev
```

Required persistent variables: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `RUN_SECRET_PEPPER_BASE64URL`, and `TAX_SERVICE_TOKEN` (plus `TAX_SERVICE_URL` locally).
See [`docs/operations/local-development.md`](docs/operations/local-development.md) for exact setup and shared-environment safety notes.

The demo build auto-confirms email signups so a new account gets a session immediately.
That is intentional for the hackathon and is not production-grade auth; enable email confirmation and real SMTP before treating it as such.

## Architecture

```
player free text / choice
        |
        v
   AI role client  --- interprets, ranks, narrates (never computes money)
        |
        v  (proposed choice + confidence)
 deterministic core (monthly-turn-v2)  --- re-validates, then owns every
        |                                   cash / debt / tax / net-worth change
        v
   authoritative run state  --->  UI, characters, audit trail
```

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Landing and instant-demo entry |
| `/start`, `/profile`, `/generating` | Persona onboarding and run creation |
| `/board` | Canonical strategy-first board |
| `/board/free` | Direct-travel review variant |
| `/api/health` | Process liveness |
| `/api/openapi.json` | Browser API route description |

## Verify

```bash
pnpm verify
```

Runs lint, TypeScript, test-layout enforcement, parallel tests, long-run simulations, and a production build.
PostgreSQL and provider integration suites are opt-in and described in the operations guide.

## Roadmap

**Nemesis Mode** is the headline idea on our roadmap: an opt-in adversarial mode where a rival AI villain studies your run each month, picks the life event that best attacks your weakest evidenced defense, and taunts you with its reasoning.
The targeting is the lesson: when Debtzilla says it chose a repair bill "because your emergency fund only covers 1.4 months," you learn exactly which defense to build.

It fits our safety model by design.
The villain would get selection-only authority over events the engine has already certified as fair, with parameters pinned by the engine, so even a maximally hostile prompt could at worst reorder safe, recoverable events, never invent one.
Full design and plan: [`docs/superpowers/specs/2026-07-19-nemesis-mode-design.md`](docs/superpowers/specs/2026-07-19-nemesis-mode-design.md) and [`docs/superpowers/plans/2026-07-19-nemesis-mode.md`](docs/superpowers/plans/2026-07-19-nemesis-mode.md).

Alongside it:

- Villain defeat as a real win condition: sustained defense of the targeted metrics retires the villain.
- A power meter that visibly drains as you shore up the weakness it targets.
- Production-grade auth: email confirmation and real SMTP instead of the demo auto-confirm.

## Documentation

Start with [`docs/README.md`](docs/README.md).
The implementation audit in [`docs/architecture/current-system-audit.md`](docs/architecture/current-system-audit.md) is deliberately honest about what exists in the engine versus what is exposed through today's API and UI.
Contribution guidelines live in [`CONTRIBUTING.md`](CONTRIBUTING.md).
