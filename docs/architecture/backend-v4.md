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
  -> application service
       |-> tax port -> pinned PolicyEngine US service -> persisted evidence
       |-> optional narrative port -> model service
       |-> Drizzle transaction/repository -> reducer dispatcher
              |-> financial kernel 2.0.0 + non-financial wrapper
              |-> private legacy-4.1.0 replay adapter
            -> Supabase Postgres
```

The deterministic core may depend only on domain modules. It must not import
React, Next.js, Drizzle, database drivers, OpenAI SDKs, environment variables,
filesystem APIs, clocks, or network clients. Nondeterministic values such as
identifiers, tax results, market RNG evidence, and model output enter through
explicit commands or ports. Tax evidence is resolved and persisted before
reduction. Model output never enters the financial kernel.

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

New schema-v2 monthly commands run the `2.0.0` financial kernel documented in
`financial-engine-v2.md`. The exact financial order is validation; annual
policy reset; claim adjudication; complete supplied market step; CPI and living
cost inflation; payroll, tax, pre-tax contributions, and match; resolved income;
debt/mandatory-obligation planning; one cash -> after-cost taxable liquidation
-> credit funding plan; mandatory settlement; bounded after-tax allocations;
one month advance; and invariant validation. The product wrapper then owns
career completion, command acceptance, exposure, outcome, macro-story, and event
orchestration.

When the one funding plan has a residual shortfall, the kernel records the
attempt and advances the month without a partial sale, credit draw, obligation
payment, debt settlement, or optional allocation. The wrapper labels bankruptcy
only from that actual `FinancialShortfallV2`; it does not predict failure from a
future obligation after a fully paid month. Unversioned and explicit
`legacy-4.1.0` commands use a private frozen replay adapter. New Web commands are
server-stamped `2.0.0`, and public clients cannot select a reducer.

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
  liquidation value after transaction costs, then remaining credit, using one
  immutable plan for assessment and execution.
- Bankruptcy occurs only from the completed month's actual residual shortfall;
  negative net worth alone is not bankruptcy.
- Home equity, retirement, HSA, and other restricted/illiquid assets do not
  supply automatic liquidity; they require an explicit validated action.
- Financial independence is reached when investable/yielding assets meet the
  versioned finish line: desired annual spending divided by the safe-withdrawal
  rate. A player-selected spending goal stays fixed; the default goal follows
  current annual living cost. Home equity is excluded. FI ends the run
  immediately with grade S.
- Outcome policy `1.0.0` stops a non-FI, solvent run at age 65. Its inclusive
  FI-progress lower bounds are A at 0.8, B at 0.6, C at 0.4, D at 0.2, and E at
  zero. An actual required-obligation shortfall takes precedence and is F.
- The terminal state persists the policy version, bounded reason codes, FI
  numerator/target/progress, displayed net worth, actual automatic-liquidity
  evidence, and retirement readiness. Cross-field state validation rejects
  inconsistent evidence rather than recalculating a replacement grade.

## Exposure evidence

Schema-v2 records an explainable end-of-month exposure snapshot. Emergency-fund
months are liquid cash divided by current required obligations and capped at 12;
zero obligations explicitly produce the 12-month cap. DTI is total term plus
revolving debt divided by authoritative annual salary and is `null` when income
is unknown or zero. Revolving utilization, insurance gap, non-diversified
sector/speculative concentration, and catalog-sector job correlation are bounded
to 0–1,000,000 PPM. No investable assets produce zero concentration/correlation.

The hidden score is 1,000,000 plus twice a 0–1,000,000 weighted risk: emergency
fund 30%, DTI 20%, revolving utilization 15%, insurance gap 10%, concentration
15%, and job correlation 10%. Unknown DTI or insurance receives a documented
neutral 500,000 risk; unknown job correlation contributes zero. The score and
all components are retained together for fairness audits and debrief evidence.

Personal-event scheduling uses versioned `fairness-v1`. The monthly probability
scales linearly from 8% at a 1,000,000 exposure score to 30% at 3,000,000. The
scheduler consumes persisted RNG in a fixed frequency → sorted-template →
parameter order. It considers only engine-owned, deterministically eligible
personal templates that target a demonstrated metric weakness and are off
cooldown. Catastrophes additionally require score 2,400,000 or higher. A
terminal run or pending player choice schedules nothing and consumes no RNG.

## External ports

### Tax

The TypeScript application calls a pinned, self-hosted PolicyEngine US service.
The request and response schemas include policy year, jurisdiction, filing
status, household members, income components, deductions, and a trace identifier.
Future nominal values are deflated into 2026 dollars, evaluated under frozen 2026
policy, then the computed tax is re-inflated. Results are educational estimates
until independently validated. The Web service resolves or reuses this evidence
before entering the repository reducer. The monthly core and replay path make no
network call; replay uses the persisted evidence. Tests mock only this remote
calculator boundary and run the reducer/kernel integrations with real local
modules.

### Narrative and game-master output

GPT output is never authoritative financial math. Strict structured responses may
propose events, explanations, and presentation text; deterministic services
validate and apply their numeric effects. Transport failures are retried twice
and schema failures once. Exhaustion returns a retryable service error and causes
no state mutation. There is no narrative fallback.

Prompt and response bodies are minimized, redacted, encrypted with AES-256-GCM,
and stored in an administrator-only audit trail. They are never written to normal
application logs.

## Verified multi-turn journey

On 2026-07-15 the native v2 HTTP flow completed six consecutive months against
the pinned local PolicyEngine service and a fresh PostgreSQL 17 database. The
journey created a run, configured strategy, started a cataloged upskill, bought
a mortgaged home, processed and persisted six tax-backed monthly turns, resolved
a server-scheduled personal choice, materialized the salary increase in the
completion month, and built a six-month checkpoint. The final state was active
at 2027-01 with salary increased from 12,000,000 to 12,300,000 cents. Database
counts reconciled to 6 monthly records, 6 tax-evidence rows, 10 commands, 11
snapshots, and 11 outbox rows. A separate high-leverage journey reached
bankruptcy and correctly rejected later progression with HTTP 409.

## Persistence and API

Supabase Postgres is authoritative. Drizzle repositories execute each accepted
command, resulting state snapshot, ledger transactions, and outbox/audit records
in one database transaction. Optimistic concurrency uses the expected revision.

REST endpoints live below `/api/v1`. Shared Zod schemas define inputs and outputs,
generate OpenAPI, and feed a typed TypeScript client. Anonymous players receive a
high-entropy opaque run secret; only a hash is persisted. Secrets must never
appear in URLs or logs.

`RunApiServiceV2` converts a public empty `process_month` payload into an
internal command containing server-owned tax evidence,
`financialKernelVersion: "2.0.0"`, and resolved cash-flow evidence. Strict
persisted decoding keeps historical absence/`legacy-4.1.0` compatible while
preventing resolved flows from being attached to a legacy reducer. Monthly API
summaries expose a strict legacy-or-2.0.0 evidence union. New commands also carry
`outcomePolicyVersion: "1.0.0"`; historical absence retains the frozen outcome
semantics and checksum. The goal/outcome contract is detailed in
[`goals-and-grading-v2.md`](./goals-and-grading-v2.md).

## Verification gates

Each stable subsystem must pass lint, type checking, unit/property tests, and a
production build before it merges to `main`. Deterministic systems additionally
need golden replay, invariant, boundary, and fixed-seed tests. External adapters
need schema/contract tests and must prove that failures cannot partially commit a
turn.

Prompt 02 adds real credential-free integrations for persisted decode through
the wrapper/kernel, checksum replay through the repository reducer, and
multi-year projection through the production market and financial paths. Its
480-month event-free projection has an 8,000 ms assertion; two isolated measured
runs completed in 4,999.987 ms and 5,088.119 ms. The real PostgreSQL integration
is conditional and remains unexecuted here because `TEST_DATABASE_URL` is not
configured; the explicit skip must not be reported as a database pass.
