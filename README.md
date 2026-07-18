# Life Finance

Life Finance is a deterministic US personal-finance simulation presented as a 3D board game. The current playable product is a monthly strategy loop:

1. Choose a persona and enter a short profile.
2. The server reviews the persona-derived draft and creates an authoritative run.
3. Supabase email OTP identifies the player; the server owns one active auto-save per account.
4. On `/board`, choose a destination and one financial plan.
5. Submit the plan and advance exactly one month.
6. Review authoritative cash, debt, net-worth, and financial-independence changes.
7. Resolve a pending life event before planning the next month.

`/board` is the canonical strategy-first UI. It does not use dice or tile traversal. `/board/free` is a direct-travel review variant built on the same backend state.

## Run it locally

The quickest path requires Node.js 22+ and pnpm 11, but no database, tax service, or AI key:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000` and choose **Instant demo**. The demo uses the real HTTP, cookie, application, and deterministic-engine boundaries, but keeps state in server memory and uses a simplified deterministic tax adapter. A browser refresh preserves the run; restarting Next.js clears it. `/api/demo` returns 404 in production.

For persistent onboarding, copy `.env.example` to `.env.local` and configure Supabase Auth, PostgreSQL, the run-secret pepper, and the tax service. Then run:

```bash
pnpm db:migrate
pnpm dev
```

The required variables are `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `RUN_SECRET_PEPPER_BASE64URL`, `TAX_SERVICE_URL`, and `TAX_SERVICE_TOKEN`. AI credentials are optional for the current typed onboarding and board loop. A Vercel access token alone is not runtime configuration and is not enough to run the persistent path.

See [`docs/operations/local-development.md`](docs/operations/local-development.md) for exact setup and shared-environment safety notes.

## Current routes

| Route | Purpose |
| --- | --- |
| `/` | Landing and development-only instant-demo entry |
| `/start`, `/profile`, `/generating` | Persona onboarding and run creation |
| `/board` | Canonical strategy-first board |
| `/board/free` | Direct-travel review variant |
| `/api/health` | Process liveness only |
| `/api/openapi.json` | Lightweight browser API route description |

## Verification

```bash
pnpm verify
```

This runs lint, TypeScript, test-layout enforcement, parallel tests, long-run simulations, and a production build. PostgreSQL and provider integration suites are opt-in and are described in the operations guide.

## Documentation

Start with [`docs/README.md`](docs/README.md). The implementation audit in [`docs/architecture/current-system-audit.md`](docs/architecture/current-system-audit.md) distinguishes what exists in the engine from what is actually exposed through today’s API and UI.
