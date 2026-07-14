# Life Finance

Life Finance is a browser-first, single-player financial life simulation. This repository currently provides the localhost shell and folder boundaries for four critical user journeys (CUJs). Gameplay calculations are intentionally deferred.

## Prerequisites

- Node.js 22
- Corepack enabled

## Run locally

```bash
corepack pnpm install
corepack pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Routes

| Route | Ownership |
| --- | --- |
| `/character` | Character spawning and localization |
| `/dashboard` | Monthly dashboard and turn orchestration |
| `/game-master` | Adversarial financial events |
| `/psychology-traps` | Speculative choices and behavioral traps |

## Verification

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

Run every check with `corepack pnpm verify`.

## Repository boundaries

```text
src/app/          Routes and page composition
src/components/   Shared presentation with multiple real consumers
src/core/         Framework-free domain contracts and future pure rules
src/data/         Immutable shared catalogs and fixtures
src/features/     Code owned by one CUJ
```

Read [the repository architecture](docs/architecture/repository.md) before adding gameplay behavior.

## Current non-goals

- Tax, income, debt, burnout, inflation, allocation, and yield calculations
- Random event selection and exposure scoring
- Market simulation and speculative pricing
- AI generation or third-party financial data
- Authentication, databases, cloud saves, multiplayer, and deployment configuration

The approved [design](docs/superpowers/specs/2026-07-14-life-finance-repository-design.md) and [implementation plan](docs/superpowers/plans/2026-07-14-life-finance-skeleton.md) record the reasoning behind this shell.
