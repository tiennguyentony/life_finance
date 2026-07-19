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

Open `http://localhost:3000`, choose **Instant demo**, process a month, and resolve any pending event. No `.env.local`, database, tax service, or AI key is required for deterministic play.

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
5. Enable Supabase email/password signup and disable **Confirm email**. The checked-in local Supabase configuration already sets `auth.email.enable_confirmations = false`.
6. Configure and start the tax service using `services/tax/README.md`.
7. Run `pnpm dev`, create an account with an email and password of at least eight characters, and use the normal **Start** onboarding path. No confirmation email is sent.

For a disposable full local Supabase stack:

```bash
pnpm dlx supabase@latest start
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:migrate
```

Use the local API URL and publishable key printed by the CLI. Email is captured by local Mailpit. HTTP Supabase URLs are accepted only for `localhost` and `127.0.0.1`; non-loopback environments require HTTPS.

Generate a local pepper with the command documented in `.env.example`. Never commit `.env.local`.

A Vercel access token is a deployment credential, not application runtime configuration. Supabase/Vercel production resources do not automatically make another developer’s local process work: their `.env.local` still needs the Supabase public values, database connection, pepper, tax URL, and matching bearer token. If a teammate is intentionally given shared credentials, they will be operating on shared infrastructure.

Do not run migrations casually against a shared or production Supabase database. Confirm the target, take a backup for production changes, and prefer a disposable/local database for development.

## Monthly operational ML

No model setup is required. Instant Demo and persistent play both load the
committed self-trained artifact and rank safe candidates in-process. Ranking
evidence remains available in command responses and persisted audit records but
is intentionally omitted from the player-facing result dialog. No API key,
Ollama process, or network model call is involved.

To reproduce the artifact:

```bash
pnpm ml:event-data
pnpm ml:event-train
git diff -- src/data/operational-event-ranker-artifact-v1.json
```

Training rows are written under ignored `.ml-dist/`. Repeating both commands
without source/data changes must produce an identical artifact. Python is
training-only and is not needed by Next.js, Vercel, or players.

## Expected failure modes

- Missing `DATABASE_URL`: normal onboarding fails at run creation; Instant demo still works locally.
- Invalid/missing pepper: persistent session-secret hashing fails.
- Unavailable tax service: a month needing fresh evidence fails without committing a new revision.
- Missing/corrupt ranker artifact: monthly play records a compact fallback reason and preserves deterministic Scenario Director behavior.
- Provider environment variables are not needed for monthly play. Existing provider adapters are reserved for optional future asynchronous narration/onboarding.
- No Supabase account session in production: protected pages redirect to `/login`.
- A valid account with no active save: onboarding starts a new save.
- A pre-auth capability save is claimed at first sign-in; a save owned by another account cannot be claimed.
- Demo cookie after server restart: the in-memory run is gone; start another demo.
- Stale `.next` route types after switching branches/architectures: run `pnpm exec next typegen`, then `pnpm typecheck`.

This authentication mode is suitable for the hackathon demo, not a public production service: email ownership is not verified and the app does not expose a reliable password-recovery flow. Production deployment requires verified email (or another trusted provider), custom SMTP, abuse controls, and password recovery.

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
