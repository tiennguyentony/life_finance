# Life Finance

Life Finance is a browser-first financial-life simulation backed by an exact,
replayable TypeScript engine. Player actions are persisted in PostgreSQL, tax
estimates come from a separately deployed and version-pinned PolicyEngine US
service, and GPT-5.6 is restricted to structured educational and narrative
roles. The deterministic engine—not the model—owns money, state transitions,
events, grades, and outcomes.

The non-UI V4 backend is implemented and independently runnable. Existing UI
routes remain a separate integration surface and may still use feature-local
mock services while that work is in progress.

## Production services

| Service | URL | Purpose |
| --- | --- | --- |
| Next.js web/API | <https://life-finance-mu.vercel.app> | UI shell, versioned REST API, engine, and persistence |
| API readiness | <https://life-finance-mu.vercel.app/api/v1/health> | Safe configuration, PostgreSQL, and tax-policy checks |
| PolicyEngine tax | <https://life-finance-tax.vercel.app> | Authenticated frozen-2026 US tax calculations |
| Tax readiness | <https://life-finance-tax.vercel.app/healthz> | Public pinned policy-version check |

The production database is a Supabase PostgreSQL project in `us-west-1`. The
web/API and tax service are intentionally separate Vercel projects.

## Implemented backend

- Exact integer cents and parts-per-million rates; floating-point money is
  excluded from the core.
- Immutable, versioned game state with seeded randomness, canonical checksums,
  balanced append-only journals, reversals, and deterministic replay.
- Correlated market regimes, engine-owned event catalog, bounded adversarial
  event proposals, player actions, liquidity waterfalls, bankruptcy, financial
  independence, retirement grading, and elastic checkpoint pacing.
- PolicyEngine US `4.21.0`, pinning rules `1.764.6`, for all 50 states and DC and
  all supported filing statuses. Future scenarios use frozen 2026 policy after
  exact deflation/re-inflation.
- Drizzle/PostgreSQL persistence with RLS, immutable snapshots and ledger
  entries, optimistic revisions, command idempotency, and a transactional
  outbox.
- Anonymous 256-bit run credentials whose server-side representation is a
  peppered HMAC digest.
- Strict REST/Zod contracts, OpenAPI 3.1, response-validating TypeScript client,
  request-size limits, and safe public errors.
- GPT-5.6 Sol for Hostile Fed and Teacher roles; GPT-5.6 Terra for onboarding
  extraction and explanations. Responses use strict structured output and
  cannot directly mutate authoritative state.
- Mandatory AI privacy consent, prompt minimization, identifier blocking and
  redaction, `store: false`, and append-only AES-256-GCM encrypted audits with a
  versioned keyring and administrator-only decryption.

## Repository layout

```text
src/core/             Framework-free deterministic financial engine
src/server/api/       REST contracts, handlers, OpenAPI, and typed client
src/server/db/        Drizzle schema, runtime, and atomic repositories
src/server/tax/       Server-only resilient PolicyEngine client
src/server/ai/        GPT role contracts, privacy, transport, and audit runtime
src/app/api/v1/       Next.js route adapters and readiness endpoint
services/tax/         Independently deployable FastAPI/PolicyEngine service
drizzle/              Reviewed PostgreSQL migrations
docs/architecture/    Architecture contracts and repository boundaries
```

Read [the V4 backend architecture](docs/architecture/backend-v4.md) and
[repository architecture](docs/architecture/repository.md) before changing an
authority boundary.

## Prerequisites

- Node.js 22 or newer
- Corepack and pnpm
- Python 3.12 and [uv](https://docs.astral.sh/uv/)
- PostgreSQL 17, or a Supabase PostgreSQL connection
- An OpenAI project key with access to `gpt-5.6-sol` and `gpt-5.6-terra`

## Environment

Copy the committed template; never commit the populated file.

```sh
cp .env.example .env.local
```

The server requires:

| Variable | Use |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection; use a serverless transaction pooler in production |
| `RUN_SECRET_PEPPER_BASE64URL` | 256-bit HMAC pepper for anonymous run secrets |
| `TAX_SERVICE_URL` | Base URL of the separately running tax service |
| `TAX_SERVICE_TOKEN` | Shared server-only bearer used by both services |
| `OPENAI_API_KEY` | Server-only OpenAI project key |
| `AI_AUDIT_ENCRYPTION_KEYS` | Versioned JSON keyring of canonical base64 AES-256 keys |
| `AI_AUDIT_ACTIVE_KEY_VERSION` | Positive version selected for new audit records |
| `AI_AUDIT_ADMIN_TOKEN` | Independent 256-bit administrator bearer for audit reads |

Generation commands and exact value shapes are documented in
[`.env.example`](.env.example). Keep the tax bearer, OpenAI key, encryption
keys, database credentials, run-secret pepper, and audit administrator token
out of browser-visible variables and application logs.

## Install and migrate

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm db:check
corepack pnpm db:migrate
```

`db:migrate` is idempotent. For Supabase, use the IPv4 Supavisor session-pooler
connection on port 5432 for migrations. The deployed server uses transaction
mode on port 6543 with prepared statements disabled.

Install and verify the tax service separately:

```sh
cd services/tax
uv sync --frozen
uv run ruff format --check .
uv run ruff check .
uv run mypy tax_service
uv run pytest
```

## Run locally

Start PolicyEngine in one terminal:

```sh
cd services/tax
TAX_SERVICE_TOKEN='<same server-only bearer>' \
  uv run uvicorn tax_service.app:app --port 8001
```

Set `TAX_SERVICE_URL=http://127.0.0.1:8001` in `.env.local`, then start Next.js:

```sh
corepack pnpm dev
```

Open <http://localhost:3000>. API readiness is available at
<http://localhost:3000/api/v1/health>.

## API surface

| Method and path | Behavior |
| --- | --- |
| `GET /api/v1/health` | Dependency readiness without secret details |
| `GET /api/v1/openapi.json` | Generated OpenAPI 3.1 contract |
| `POST /api/v1/runs` | Create an authoritative run and return its one-time access secret |
| `GET /api/v1/runs/{runId}` | Read a run using its bearer secret |
| `POST /api/v1/runs/{runId}/commands` | Submit a player action with optimistic revision and idempotency ID |

Only player actions cross the public command boundary. Clients cannot submit
raw journals, market returns, tax results, event effects, grades, or replacement
state. The AI and audit runtimes are server-only; there is deliberately no
public audit route.

## Verification

Run the full Node release gate:

```sh
corepack pnpm verify
```

This runs ESLint with zero warnings, strict TypeScript, Vitest, and a production
Next.js build. Database integration cases run when `TEST_DATABASE_URL` points to
a disposable PostgreSQL 17 database. The Python commands above form the pinned
PolicyEngine release gate.

For a quick deployed smoke test:

```sh
curl --fail https://life-finance-tax.vercel.app/healthz
curl --fail https://life-finance-mu.vercel.app/api/v1/health
curl --fail https://life-finance-mu.vercel.app/api/v1/openapi.json >/dev/null
```

Judges can use the public readiness and OpenAPI URLs without credentials. Full
run creation/testing uses an access secret returned by `POST /api/v1/runs` and
does not require a user account. The tax calculation endpoint is intentionally
server-authenticated and should be exercised through the Next.js backend or a
provided test credential, never by exposing its bearer in browser code.

## Deployment

1. Create a Supabase project, use its PostgreSQL/Supavisor connection, and run
   `pnpm db:migrate`.
2. Create a Vercel project rooted at `services/tax`, configure
   `TAX_SERVICE_TOKEN`, and deploy. Its checked-in `vercel.json` provides the
   Python entrypoint and 300-second maximum duration.
3. Create a second Vercel project at the repository root with the Next.js preset.
4. Configure every variable from `.env.example` for Production and Preview.
   Use Vercel Sensitive variables for all credentials and cryptographic values.
5. Deploy the web project and require `/api/v1/health` to return HTTP 200 with
   `configuration`, `database`, and `taxPolicy` all `ok`.

Environment changes require a new deployment. Do not use an automatically
generated Vercel multi-service preset; the two projects have independent
resource limits, environment scopes, and deployment roots.

## AI privacy and authority

Every GPT request must affirm the exact versioned privacy notice. Direct
identifiers and account numbers are prohibited; deterministic filters reject or
redact recognized sensitive data before transport. OpenAI receives minimized
role input with provider storage disabled. Complete attempts are encrypted
before durable audit persistence and retained for administrator-only review.

Model output is advisory and bounded. The deterministic engine and pinned
PolicyEngine results remain authoritative, and all financial/tax content is
educational rather than professional advice.

## How Codex was used

Codex was used throughout the backend implementation to turn the architecture
contract into small, reviewable feature slices; implement exact financial
primitives, persistence, APIs, PolicyEngine isolation, GPT role boundaries, and
encrypted auditing; generate adversarial and integration tests; run clean
PostgreSQL/Python/Node release gates; diagnose deployment connectivity; and
prepare reproducible operator documentation.

Key product and engineering decisions remained explicit human-owned constraints:
the engine is authoritative, money uses exact integer units, randomness is
seeded, tax policy is pinned and labeled educational, GPT cannot mutate state,
privacy consent is mandatory, audits are encrypted and access-restricted, and
each coherent feature is committed and verified separately.

The Devpost submission must include the `/feedback` Codex Session ID for the
thread where most core functionality was built, in addition to the public demo
video and repository access required by the official rules.
