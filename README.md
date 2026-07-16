# Life Finance

Life Finance is a browser-first financial-life simulation backed by an exact,
replayable TypeScript engine. Player actions are persisted in PostgreSQL, tax
estimates come from a separately deployed and version-pinned PolicyEngine US
service, and GPT-5.6 is restricted to structured educational and narrative
roles. The deterministic engine—not the model—owns money, state transitions,
events, grades, and outcomes.

The V4 backend is implemented and independently runnable. A deliberately plain
developer play UI now exercises the authoritative v2 API end to end: onboarding,
benefits, strategy, detailed actions, monthly turns, taxes, events, outcomes,
checkpoints, and contextual financial education. It is a testable product
surface, not the final visual design.

## Production services

| Service | URL | Purpose |
| --- | --- | --- |
| Developer play UI | <https://life-finance-mu.vercel.app/play> | Runnable educational game backed by the authoritative v2 API |
| Next.js web/API | <https://life-finance-mu.vercel.app> | Versioned REST API, engine, persistence, and application routes |
| API readiness | <https://life-finance-mu.vercel.app/api/v1/health> | Safe configuration, PostgreSQL, and tax-policy checks |
| PolicyEngine tax | <https://life-finance-tax.vercel.app> | Authenticated frozen-2026 US tax calculations |
| Tax readiness | <https://life-finance-tax.vercel.app/healthz> | Public pinned policy-version check |

The production database is a Supabase PostgreSQL project in `us-west-1`. The
web/API and tax service are intentionally separate Vercel projects.

## Try the game

Open <https://life-finance-mu.vercel.app/play> and select **Start over** to see
the current onboarding. The developer UI exposes rather than hides the model:

- Choose a quick start or customize age, location, career, household, salary,
  cash, student debt, benefits, optional insurance, and a personal FI finish
  line. Health coverage can be explicitly waived rather than silently assumed.
- Allocate pre-tax 401(k)/HSA contributions and after-tax IRA, investments, or
  extra debt payments, with eligibility and affordability validation.
- Use detailed one-time actions for investing, liquidation, retirement
  accounts, debt, credit, housing, lifestyle, and education/upskilling.
- Inspect gross income, payroll deductions, modeled tax, take-home cash,
  obligations, employer match, debt interest, market return, asset funding, and
  credit funding after every processed month.
- Review FI progress, balance sheet, liabilities, benefits, exposure, macro
  conditions, event alternatives, decision consequences, and checkpoint
  evidence.
- Plan real-life expenses such as moving, a vehicle, a wedding, a child,
  education, travel, or caregiving; when due, pay, postpone, or cancel them
  through an evidence-backed lifecycle.
- Open contextual concepts such as 401(k), employer match, HSA, tax estimates,
  debt-to-income, liquidity, diversification, and compounding. Definitions,
  relevance, and tradeoffs come from a versioned education catalog.
- With explicit consent, request a state-grounded adaptive lesson, let the World
  Director select one already-eligible engine event, and receive a final
  evidence-grounded debrief. A deterministic fallback keeps every surface
  usable when the configured model is unavailable.

Fast-forward stops at required decisions and terminal outcomes. A fully cold
first PolicyEngine calculation can take up to roughly two minutes; duplicate
submissions remain disabled while it completes. Later months with an unchanged
annual tax context use persisted evidence and expose a `tax.cache.*` trace.

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
- Persisted annual tax-context fingerprints reuse a checksum-validated monthly
  tax snapshot when jurisdiction, filing status, household, salary, projected
  401(k)/HSA contributions, deductions, and tax year are unchanged. Command
  traces and evidence remain unique; PolicyEngine runs again on a real context
  change rather than on every Next Month click.
- Drizzle/PostgreSQL persistence with RLS, a checksum-validated current save,
  sparse verified historical anchors, immutable ledger entries, optimistic
  revisions, command idempotency, and a transactional outbox.
- Anonymous 256-bit run credentials whose server-side representation is a
  peppered HMAC digest.
- Strict REST/Zod contracts, OpenAPI 3.1, response-validating TypeScript client,
  request-size limits, and safe public errors.
- A bounded AI context assembled from authoritative state, capped learning
  memory, and three structured gameplay surfaces: adaptive explanations,
  eligible-template World Director events, and immutable-grade final debriefs.
  Responses use strict structured output and cannot calculate money, invent an
  event effect, alter a grade, or directly mutate authoritative state.
- Mandatory AI privacy consent, prompt minimization, identifier blocking and
  redaction, `store: false`, and append-only AES-256-GCM encrypted audits with a
  versioned keyring and administrator-only decryption.

## Repository layout

```text
src/core/             Framework-free engine, contracts, handlers, and invariants
src/server/api/       REST contracts, handlers, OpenAPI, and typed client
src/server/db/        Drizzle schema, repository contracts, invariants, and transactions
src/server/tax/       Server-only resilient PolicyEngine client
src/server/ai/        GPT role contracts, privacy, transport, and audit runtime
src/app/api/          Thin v1/v2 Next.js route adapters and readiness endpoint
src/features/play/    Gameplay controller, focused panels, models, and actions
src/**/__tests__/      Tests separated from production module directories
src/data/education-content.ts  Versioned finance education catalog
services/tax/         Independently deployable FastAPI/PolicyEngine service
drizzle/              Reviewed PostgreSQL migrations
docs/architecture/    Architecture contracts and repository boundaries
```

Read [the V4 backend architecture](docs/architecture/backend-v4.md),
[repository architecture](docs/architecture/repository.md), and
[authoritative state and ledger contract](docs/architecture/state-and-ledger.md)
before changing an authority boundary.

## Prerequisites

- Node.js 22 or newer
- Corepack and pnpm
- Python 3.12 and [uv](https://docs.astral.sh/uv/)
- PostgreSQL 17, or a Supabase PostgreSQL connection
- A Groq key for the hosted `openai/gpt-oss-120b` runtime, or an OpenAI project
  key with access to the configured GPT-5.6 role models
- Optional for local AI development: Ollama with `gpt-oss:20b`

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
| `AI_PROVIDER` | `groq`, `openai`, or local-only `ollama`; the committed production-oriented default is `groq` |
| `GROQ_API_KEY` | Server-only Groq key for pinned `openai/gpt-oss-120b` inference |
| `OPENAI_API_KEY` | Optional server-only OpenAI project key |
| `OLLAMA_BASE_URL` | Loopback-only Ollama origin used by the local provider |
| `AI_AUDIT_ENCRYPTION_KEYS` | Versioned JSON keyring of canonical base64 AES-256 keys |
| `AI_AUDIT_ACTIVE_KEY_VERSION` | Positive version selected for new audit records |
| `AI_AUDIT_ADMIN_TOKEN` | Independent 256-bit administrator bearer for audit reads |

Generation commands and exact value shapes are documented in
[`.env.example`](.env.example). Keep the tax bearer, AI provider keys,
encryption keys, database credentials, run-secret pepper, and audit
administrator token out of browser-visible variables and application logs.

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

### Hosted and local gpt-oss models

Production uses Groq-hosted `openai/gpt-oss-120b` when `AI_PROVIDER=groq`.
The adapter pins the model and HTTPS endpoint, requires strict JSON Schema,
bounds response size and timeout, sanitizes provider errors, caps rate-limit
waits for serverless execution, and records the actual provider/model in the
encrypted audit. The deterministic engine still owns all financial effects,
event eligibility, and grades.

The runtime model is separate from Build Week authorship evidence: the project
was designed and implemented with Codex using GPT-5.6, while the deployed game
uses an open-weight model because event credits are Codex credits rather than
API credits. The README, commit history, demo narration, and required Codex
`/feedback` session ID document that build-time collaboration.

When GPT-5.6 API access is temporarily unavailable, deterministic integration
work can use OpenAI's open-weight `gpt-oss-20b` through Ollama. This is a local
development transport, not a silent fallback and not evidence of the required
GPT-5.6 submission path.

```sh
ollama pull gpt-oss:20b
ollama list
RUN_OLLAMA_INTEGRATION=1 pnpm test -- src/server/ai/__tests__/ollama-transport.integration.test.ts
```

Set the following in the uncommitted `.env.local` file:

```dotenv
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
```

The adapter calls Ollama's non-streaming `/api/chat` endpoint with the same
strict JSON Schema used by the production role contract. It accepts only a
loopback HTTP origin, never sends the OpenAI API key, discards model thinking
from audit output, and records the actual model as `ollama/gpt-oss:20b`.
Production Vercel configuration rejects the Ollama provider. Before submission,
run the hosted gpt-oss success path with encrypted audit evidence and separately
retain the Codex GPT-5.6 session evidence required by the hackathon.

The bounded role contracts, privacy controls, transports, failure handling, and
encrypted audit path are implemented. Local `gpt-oss:20b` proves development
compatibility; hosted `gpt-oss-120b` is production runtime evidence; neither is
misrepresented as a GPT-5.6 API call.

## API surface

| Method and path | Behavior |
| --- | --- |
| `GET /api/v1/health` | Dependency readiness without secret details |
| `GET /api/v1/openapi.json` | Generated OpenAPI 3.1 contract |
| `POST /api/v1/runs` | Return HTTP 410; legacy creation is retired, so create a v2 run instead |
| `GET /api/v1/runs/{runId}` | Inspect an authenticated legacy run before migration |
| `POST /api/v1/runs/{runId}/commands` | Return HTTP 410; legacy state is read-only and must be migrated before mutation |
| `POST /api/v2/runs` | Create a native catalog-backed v2 run and return its one-time access secret |
| `GET /api/v2/runs/{runId}` | Read an authorized detailed v2 state |
| `POST /api/v2/runs/{runId}/migrate` | Authenticated, idempotent migration of an existing v1 save to authoritative v2 |
| `POST /api/v2/runs/{runId}/commands` | Configure strategy, take a detailed action, or request server-owned monthly processing |
| `POST /api/v2/runs/{runId}/ai/explanation` | Generate an adaptive evidence-grounded lesson and update bounded learning memory |
| `POST /api/v2/runs/{runId}/ai/world-event` | Select and queue one engine-eligible event without delegating financial authority |
| `POST /api/v2/runs/{runId}/ai/debrief` | Explain a terminal run without changing its engine-owned outcome or grade |

Authenticated v1 reads remain available so an old save can be inspected before
migration. Both public v1 write endpoints return `STATE_SCHEMA_DEPRECATED`
without invoking legacy mutation code; use the v2 migration endpoint with the
same run bearer secret before submitting new gameplay commands.

Only player-authored choices cross the public command boundary. A v2
`process_month` request contains only its idempotency/revision/month envelope;
the application service builds the annual household request, calls the pinned
PolicyEngine adapter, derives monthly evidence, and commits it with the turn.
Clients cannot submit raw journals, market returns, tax results, event effects,
grades, or replacement state. The AI and audit runtimes are server-only; there
is deliberately no public audit route.

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
run creation/testing uses an access secret returned by `POST /api/v2/runs` and
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
