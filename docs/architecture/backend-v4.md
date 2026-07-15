# Backend V4 architecture

This document defines the implementation boundary for Life Finance's non-UI
systems. It is a contract for code and tests, not a description of a particular
screen.

## Goals

- Produce the same result for the same initial state, seed, engine version, and
  ordered commands.
- Keep financial calculations separate from generated narrative.
- Make every state transition explainable through commands, ledger entries, and
  versioned rules.
- Keep clients untrusted: the server owns authoritative state and accepts
  validated commands rather than client-authored state.
- Permit the simulation core to run in tests without React, Next.js, a database,
  network access, or OpenAI.

## Layer boundaries

```text
UI (out of backend scope)
  -> typed API client
  -> versioned REST command/query handlers
  -> application services and transaction boundary
  -> deterministic simulation core
       |-> tax port -> pinned PolicyEngine US service
       |-> narrative port -> OpenAI Responses API
  -> Drizzle repositories -> Supabase Postgres
```

The deterministic core may depend only on domain modules. It must not import
React, Next.js, Drizzle, database drivers, OpenAI SDKs, environment variables,
filesystem APIs, clocks, or network clients. Nondeterministic values such as the
current time, identifiers, tax results, and model output enter through explicit
commands or ports and are persisted before they can affect state.

## Exact domain representation

### Money

Money uses signed integer cents and must remain within JavaScript's safe integer
range. Floating-point currency is forbidden at domain boundaries.

### Rates

Rates use signed integer parts per million (PPM): `1_000_000` is 100%, `50_000`
is 5%, and `2_500` is 0.25%. Multiplication and division round half away from
zero. The same rule applies to positive and negative amounts.

### Simulation time

Simulation time is an ISO calendar month (`YYYY-MM`). Month arithmetic must use
integer year/month operations and must not depend on time zones or wall clocks.

### Randomness

The core owns a seeded, serializable pseudo-random generator state. Every draw
returns both a value and the next generator state. `Math.random()` is forbidden.
Random draws must occur in a stable documented order so replay is insensitive to
process or platform.

## State and command model

`GameState` is a deeply immutable, versioned value. A state includes:

- engine and schema versions;
- run and player identifiers;
- current simulation month and player age;
- financial accounts, obligations, credit, and wellbeing;
- market regime and persisted random-generator state;
- append-only ledger and accepted-command sequence;
- outcome, if the run has ended.

The core exposes a reducer shaped like:

```text
reduce(previousState, command) -> nextState | domain error
```

Commands carry a unique identifier, expected state revision, effective month,
and a versioned payload. A command is rejected when its identifier was already
accepted, its expected revision is stale, its month is invalid, or its payload
violates an invariant. State is never partially mutated.

The schema-v2 monthly reducer uses one stable order: validate the command and
external tax evidence; adjudicate the optional insurance claim; apply the
persisted market draw and inflation; apply payroll, withholding, benefits, and
employer match; calculate debt service and all non-debt obligations; assess and
prepare automatic liquidity; pay mandatory items; apply the bounded recurring
strategy; then advance time, accept the command, and evaluate terminal outcomes.
If total automatic liquidity cannot cover mandatory items, the reducer records
bankruptcy without making partial obligation or strategy payments.

Canonical serialization sorts object keys and preserves array order. A SHA-256
checksum covers all replay-relevant state. Checksums are evidence of accidental
or unauthorized changes, not a substitute for authorization.

## Ledger contract

All financial movements produce append-only journal transactions. A transaction
contains at least two postings, and signed posting amounts must sum to zero.
Accounts declare whether they are assets, liabilities, income, expenses, or
equity. Balances are derived from postings; summary fields must reconcile with
the ledger at every committed transition.

The simulation records both the economic reason and the originating command for
each transaction. Corrections use reversing transactions; existing journal
entries are never edited or deleted.

## Core financial invariants

- Displayed net worth is all assets minus all liabilities.
- Required-obligation shortfalls are funded in order: cash, taxable-investment
  liquidation value, then remaining credit.
- Bankruptcy occurs only when those three sources together cannot cover required
  obligations for the period.
- Home equity and retirement assets do not supply automatic bankruptcy liquidity;
  they require explicit sale or withdrawal commands.
- Financial independence is reached when investable/yielding assets are at least
  25 times annual living cost. It ends the run immediately with grade S.
- At age 65, non-FI grades use goal progress: A at 0.8, B at 0.6, C at 0.4, D at
  0.2, and E below 0.2. Bankruptcy is F.

## External ports

### Tax

The TypeScript application calls a pinned, self-hosted PolicyEngine US service.
The request and response schemas include policy year, jurisdiction, filing
status, household members, income components, deductions, and a trace identifier.
Future nominal values are deflated into 2026 dollars, evaluated under frozen 2026
policy, then the computed tax is re-inflated. Results are educational estimates
until independently validated.

### Narrative and game-master output

GPT output is never authoritative financial math. Strict structured responses may
propose events, explanations, and presentation text; deterministic services
validate and apply their numeric effects. Transport failures are retried twice
and schema failures once. Exhaustion returns a retryable service error and causes
no state mutation. There is no narrative fallback.

Prompt and response bodies are minimized, redacted, encrypted with AES-256-GCM,
and stored in an administrator-only audit trail. They are never written to normal
application logs.

## Persistence and API

Supabase Postgres is authoritative. Drizzle repositories execute each accepted
command, resulting state snapshot, ledger transactions, and outbox/audit records
in one database transaction. Optimistic concurrency uses the expected revision.

REST endpoints live below `/api/v1`. Shared Zod schemas define inputs and outputs,
generate OpenAPI, and feed a typed TypeScript client. Anonymous players receive a
high-entropy opaque run secret; only a hash is persisted. Secrets must never
appear in URLs or logs.

## Verification gates

Each stable subsystem must pass lint, type checking, unit/property tests, and a
production build before it merges to `main`. Deterministic systems additionally
need golden replay, invariant, boundary, and fixed-seed tests. External adapters
need schema/contract tests and must prove that failures cannot partially commit a
turn.
