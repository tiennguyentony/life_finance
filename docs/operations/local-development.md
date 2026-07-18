# Local development

## Requirements

- Node.js 22 or newer
- pnpm 11

## Instant playable demo

The local demo exercises the real same-origin API, HttpOnly run session, application use cases, and deterministic core engine. PostgreSQL, AI credentials, and the external tax service are not required.

1. Install packages with `pnpm install`.
2. Start Next.js with `pnpm dev`.
3. Open `http://localhost:3000`.
4. Select **Instant demo**.
5. Process a month and resolve any event on the canonical 3D board.

The run is held in server memory. Refreshing the browser preserves it, while restarting the dev server clears it. The demo uses a deterministic, simplified educational tax estimate and is available only when `NODE_ENV=development`.

## Full backend setup

The complete persistent path additionally requires PostgreSQL reachable through `DATABASE_URL` and the Python tax service configured from `services/tax/.env.example`.

1. Copy `.env.example` to `.env.local`.
2. Fill `DATABASE_URL`, `RUN_SECRET_PEPPER_BASE64URL`, `TAX_SERVICE_URL`, and `TAX_SERVICE_TOKEN`.
3. Install packages with `pnpm install`.
4. Apply migrations with `pnpm db:migrate`.
5. Start the tax service according to `services/tax/README.md`.
6. Start Next.js with `pnpm dev`.

Optional AI variables are documented in `.env.example`. Provider keys are server-only.

## Expected failure modes

- Missing `DATABASE_URL`: normal onboarding reaches run creation, then shows the backend error; the board is not opened. **Instant demo** remains available locally.
- Missing or unavailable tax service: commands that require tax calculation fail without advancing the run.
- No AI provider: typed onboarding still works; optional extraction reports unavailable.
- No run cookie: `/board` redirects to `/start`.
- Demo cookie after a dev-server restart: the in-memory run no longer exists; return to `/` and start a new demo.

## Verification

Use `pnpm verify` before merging. For fast work, run the focused test file first, then run the full gate. Database integration tests use `TEST_DATABASE_URL` and skip when it is absent. The tax service tests live under `services/tax/tests`.

Do not add mock delays, browser-stored run secrets, versioned public routes, or placeholder frontend financial state to make local setup appear successful. Normal onboarding must never fall back to the demo runtime.
