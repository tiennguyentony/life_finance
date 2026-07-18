# Life Finance

Life Finance is a deterministic personal-finance simulation presented as a 3D board game. The product flow is:

1. Choose a persona and complete a short profile.
2. The backend reviews the profile and creates an authoritative run.
3. The browser receives an HttpOnly run-session cookie.
4. The player moves around `/board`; moves and event choices are submitted to the backend.

The 3D board is the canonical gameplay UI. There is no parallel mock or prototype game path.

## Instant local demo

The playable demo needs only Node.js 22+ and pnpm 11. It still uses the real backend HTTP boundary, session cookie, and deterministic game engine; run state and simplified tax estimates stay in memory.

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`, select **Instant demo**, and play on the canonical 3D board. Refreshing keeps the run; restarting the dev server resets it. Demo creation is disabled in production.

## Full backend setup

Normal onboarding uses PostgreSQL and the Python tax service described in `services/tax/README.md`.

```bash
pnpm db:migrate
pnpm dev
```

Copy `.env.example` to `.env.local` and provide at least:

- `DATABASE_URL`
- `RUN_SECRET_PEPPER_BASE64URL`
- `TAX_SERVICE_URL`
- `TAX_SERVICE_TOKEN`

Without a database, normal onboarding intentionally fails at run creation. It never falls back to the demo adapters or fake frontend financial data.

## Main routes

- `/` — landing page
- `/start` and `/profile` — onboarding
- `/generating` — backend run creation
- `/board` — canonical board game
- `/board/free` — direct-travel board variant for development
- `/api/demo` — development-only local demo creation
- `/api/openapi.json` — current browser API description

## Verification

```bash
pnpm verify
```

The command runs lint, TypeScript checking, unit/integration tests, long-run simulation tests, and a production build.

## Documentation

Start at [`docs/README.md`](docs/README.md). It links the current architecture, API, board experience, persistence model, and local operations. Historical prompt plans and superseded prototype specifications are intentionally not part of the live documentation.
