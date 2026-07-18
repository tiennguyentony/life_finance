# Local development

## Prerequisites

- Node.js 22 or newer
- Corepack/pnpm 11.4.0
- For the persistent path: Supabase CLI/Docker, or equivalent Supabase Auth + PostgreSQL, and the Python tax-service prerequisites from `services/tax/README.md`

## Fastest playable path

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000`, choose **Instant demo**, process a month, and resolve any pending event. No `.env.local`, database, tax service, or AI key is required.

This path still exercises the real same-origin API, HttpOnly cookie, use cases, schema-2 core, command idempotency, and board. It substitutes an in-memory repository and simplified deterministic tax adapter. Refreshing preserves the run while the same server process lives; restarting Next.js loses it. Demo creation is disabled in production.

## Persistent local path

1. Copy `.env.example` to `.env.local`.
2. Set the persistent runtime variables:

   ```dotenv
   DATABASE_URL=postgresql://...
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   RUN_SECRET_PEPPER_BASE64URL=...
   TAX_SERVICE_URL=http://127.0.0.1:8000
   TAX_SERVICE_TOKEN=use-the-same-high-entropy-token-at-least-32-characters
   ```

3. Install packages: `pnpm install --frozen-lockfile`.
4. Run `pnpm db:migrate` against a database you are authorized to modify.
5. In Supabase Auth, allow `${APP_ORIGIN}/auth/callback` redirects. The checked-in local confirmation and magic-link template is `supabase/templates/email-link.html` and uses `{{ .ConfirmationURL }}`.
6. Configure and start the tax service using `services/tax/README.md`.
7. Run `pnpm dev`, sign in by email code, and use the normal **Start** onboarding path.

For a disposable full local Supabase stack:

```bash
pnpm dlx supabase@latest start
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:migrate
```

Use the local API URL and publishable key printed by the CLI. Email is captured by local Mailpit. HTTP Supabase URLs are accepted only for `localhost` and `127.0.0.1`; non-loopback environments require HTTPS.

Generate a local pepper with the command documented in `.env.example`. Never commit `.env.local`.

A Vercel access token is a deployment credential, not application runtime configuration. Supabase/Vercel production resources do not automatically make another developer’s local process work: their `.env.local` still needs the Supabase public values, database connection, pepper, tax URL, and matching bearer token. If a teammate is intentionally given shared credentials, they will be operating on shared infrastructure.

Do not run migrations casually against a shared or production Supabase database. Confirm the target, take a backup for production changes, and prefer a disposable/local database for development.

## Optional AI

The current typed onboarding and monthly board require no AI provider. Optional server adapters support:

- `AI_PROVIDER=groq` with `GROQ_API_KEY`;
- `AI_PROVIDER=openai` with `OPENAI_API_KEY` and actual project/model entitlement;
- local `AI_PROVIDER=ollama` with a loopback `OLLAMA_BASE_URL` (for example `gpt-oss:20b` configured by the local runtime).

Provider keys are server-only. AI audit encryption/admin variables are needed only when exercising the encrypted audit path. The active UI does not call AI onboarding parse, world direction, teaching, or debrief.

## Expected failure modes

- Missing `DATABASE_URL`: normal onboarding fails at run creation; Instant demo still works locally.
- Invalid/missing pepper: persistent session-secret hashing fails.
- Unavailable tax service: a month needing fresh evidence fails without committing a new revision.
- No AI provider: typed onboarding and board work; optional parse is unavailable.
- No Supabase session in production: protected pages redirect to `/login`.
- A valid account with no active save: onboarding starts a new save.
- A pre-auth capability save is claimed at first sign-in; a save owned by another account cannot be claimed.
- Demo cookie after server restart: the in-memory run is gone; start another demo.
- Stale `.next` route types after switching branches/architectures: run `pnpm exec next typegen`, then `pnpm typecheck`.

## Verification matrix

The normal gate is:

```bash
pnpm verify
```

It runs:

1. ESLint.
2. TypeScript without emit.
3. test-layout enforcement.
4. normal Vitest suites in parallel.
5. financial projection, time-controller, and balance/performance suites serially.
6. a production Next.js build.

Additional integrations are intentionally conditional:

- PostgreSQL repository/history tests require `TEST_DATABASE_URL`.
- Groq integration requires `RUN_GROQ_INTEGRATION=1` plus credentials.
- Ollama integration requires `RUN_OLLAMA_INTEGRATION=1` plus a local runtime.
- Python verification is separate: `uv run ruff format --check .`, `uv run ruff check .`, `uv run mypy tax_service`, and `uv run pytest` from `services/tax`.

Do not add browser-stored secrets, versioned public routes, mock financial fixtures, or a silent demo fallback to make setup appear successful.
