# Authoritative State and Ledger

Date: 2026-07-15

Prompt 01 establishes the storage and validation boundary for the browser-first
Life Finance simulation. It does not change financial formulas or monthly
calculation order.

## Runtime boundary

GameStateV2 is the only mutable gameplay state. Schema v1 is
decode/migrate/read-only: authenticated legacy reads remain available, but new
v1 runs and v1 command submissions return HTTP 410. Existing v1 saves enter the
v2 command path only after deterministic migration.

The browser and Next.js routes do not own state or financial truth. The browser
sends versioned requests; thin route handlers call application services; the
repository commits accepted deterministic results. Framework-free code in
`src/core` owns state types, validation, exact primitives, and reducers without
importing React, Next.js, PostgreSQL, tax transports, or AI clients.

## Sources of truth

| Data | Stored form | Authority and validation |
| --- | --- | --- |
| Run/player identity, revision, calendar, schema/engine version, terminal outcome, accepted command IDs, and RNG state | `GameStateV2` in `game_runs.current_state` | Authoritative. Normal commands preserve identity and version, increment revision exactly once, append the accepted command ID, and never move time backward. |
| Financial balances | Aggregate cents in `state.finances` | Intentionally cached authoritative values. State validation reconciles every ledger-backed aggregate to its account balance. |
| Portfolio and debt detail | `state.gameplay.portfolio` and `state.gameplay.debts` | Intentionally cached detail. Validation reconciles portfolio buckets and debt principals to aggregate balances and enforces unique debt IDs. |
| Ledger accounts and journal transactions | Immutable ledger embedded in `GameStateV2` | Gameplay authority for financial postings. Account definitions and existing transactions are immutable prefixes across revisions. |
| Normalized ledger SQL rows | `ledger_transactions` and `ledger_postings` | Audit/query projection of the authoritative state ledger, not a second gameplay ledger. |
| Employment, benefits, insurance, recurring policies, market lifecycle, events, milestones, learning memory, goals, catalog selection, and external evidence references | Versioned fields in `GameStateV2` and associated immutable evidence rows | Persisted facts required for deterministic gameplay or replay. Each owning subsystem validates its fields. |
| Exposure and aggregate financial fields | Persisted bounded values | Explicit caches used by current gameplay. Their history/current pointers and aggregate totals are validated to prevent silent staleness. |
| Runtime Balance state | `state.gameplay.runtimeBalance` | Versioned persisted container only. Prompt 09 owns pressure, cooldown, recovery, catastrophe, and approval behavior. Older v2 saves receive a zero-value selector default without changing their stored checksum. |
| Age, net worth, remaining credit, investable assets, goal/grade projections, checkpoint summaries, and debrief aggregates | Computed selectors or evidence builders | Derived. Consumers should call the owning selector instead of persisting or reimplementing the value. Existing UI/AI selector duplication remains Prompt 04 work. |
| Historical state anchors and accepted commands | `run_state_snapshots`, `run_state_migrations`, and `accepted_commands` | Replay and audit evidence. They do not replace `current_state` as the current save authority. |

## Exact money and rounding

- Monetary amounts use safe integer cents (`MoneyCents`). Rates and allocations
  use safe integer parts per million (`RatePpm`), where 1,000,000 is 100%.
- Addition, subtraction, multiplication, allocation, and reconciliation use
  BigInt intermediates and reject conversion outside JavaScript's safe-integer
  range.
- Rounding occurs only when an exact rational result is converted back to
  integer cents. Exact half values round half-away-from-zero, for both positive
  and negative amounts.
- Cents/PPM and half-away-from-zero are the only state and ledger rounding
  conventions. Floating-point dollar arithmetic is not allowed in state or
  ledger code; formatting dollars for display is a presentation concern.

## Immutable double-entry ledger

The ledger requires registered accounts with category-correct normal balances.
Every transaction affects at least two accounts, balances total debits and
credits exactly, uses stable transaction and command identifiers, and records
an effective simulation month, reason code, and description. State validation
reconciles ledger account balances to the cached financial aggregate.

New writes are strict while old saves remain compatible:

- `NewJournalTransaction` requires `sourceSystem`, `category`, and a
  `causalReference` to a command, event, milestone, or system initialization.
- Persisted historical transactions may omit all three provenance fields.
  Partial or malformed provenance is invalid.
- Appended transactions, postings, and causal references are copied and frozen.
  Existing accounts and transactions must remain a canonical immutable prefix
  across state revisions.
- A reversal is a new transaction that exactly swaps every original debit and
  credit. It retains the original source/category and causally references the
  reversal command; historical provenance-free reversals remain decodable.

Normalized SQL transaction and posting rows preserve the same identifiers and
provenance for audits and queries. The embedded ledger plus state validation is
the gameplay authority.

## Current save and sparse historical anchors

`game_runs.current_state` is the current save authority. Every accepted command
still validates and freezes the resulting aggregate, computes its canonical
checksum, and atomically persists `current_state`, the exact command envelope,
new normalized ledger rows, relevant external evidence, and an outbox record.

`run_state_snapshots` are sparse historical anchors rather than a second full
copy after every v2 command. The repository retains anchors at:

- run start;
- every twelve processed months as an annual checkpoint;
- immediately before and after a pending event is created or resolved;
- immediately before and after a life-milestone command;
- the first terminal outcome; and
- the v1-to-v2 migration boundary, whose immutable target in
  `run_state_migrations` is also a compatible replay anchor.

When several reasons share a revision, the snapshot policy keeps one stable,
highest-priority kind. Ordinary v2 monthly and player commands do not create a
historical state snapshot solely because a command was accepted. Current-state
persistence and canonical checksumming remain per command; 120/480-month
time-and-size budgets remain Prompt 14 work.

## Strict replay and corruption handling

Historical and idempotent reads reconstruct an exact revision from:

1. the latest compatible run-start/checkpoint/event/milestone/terminal snapshot
   or migration target at or before the requested revision;
2. ordered accepted commands with their original command IDs and contiguous
   expected/resulting revisions;
3. strictly decoded command payloads and persisted external evidence, including
   tax evidence;
4. the persisted RNG state, catalog/config inputs, and a compatible engine; and
5. the expected canonical checksum after every replayed revision.

Unknown command types, unknown payload fields, invalid evidence, revision gaps,
missing anchors, invalid stored state, or checksum drift produce the structured
repository error `CORRUPT_STATE`. Replay uses the production v2 reducer and
does not maintain a second financial engine. Semantically similar commands with
new IDs are not checksum-identical because command identity is replay evidence.

## Save loading and v1 migration

Persisted states are version-decoded, validated, checksummed, and deeply frozen
before use. A v1 state presented to the authoritative mutation boundary raises
the structured `MIGRATION_REQUIRED` error. Invalid individual states and
cross-revision transitions retain structured path/code/message violations.

An authenticated client migrates an old save with
`POST /api/v2/runs/{runId}/migrate` and the run bearer secret. The repository
locks the run, validates identity/revision/checksum, deterministically maps the
v1 state without inventing missing detail, writes immutable migration evidence,
updates `current_state`, and emits an outbox record in one transaction. A
repeated migration returns the same target with `idempotentReplay: true`.
Missing or invalid credentials remain indistinguishable from a missing run.

Authenticated `GET /api/v1/runs/{runId}` remains available to inspect an old
save. `POST /api/v1/runs` and `POST /api/v1/runs/{runId}/commands` return HTTP
410 with `STATE_SCHEMA_DEPRECATED` and do not invoke legacy mutation services.

## Ownership and future prompts

The state layer stores, validates, versions, reconciles, and replays facts. It
does not own interest, tax, payroll, contribution, liquidity, market, event,
grading, or other financial-engine formulas.

- Prompt 02 owns financial formula consolidation and monthly calculation order.
- Prompt 03 owns multi-month orchestration and the current browser/API-per-month
  loop.
- Prompt 04 owns goal/outcome selector consolidation and removal of duplicate
  UI/AI calculations.
- Prompts 06 and 08 own risk/event causality and exact event-effect boundaries.
- Prompt 09 owns Runtime Balance behavior; Prompt 01 only created its state
  container.
- Prompt 11 owns causal graphs, turning points, and counterfactuals.
- Prompt 14 owns long-run headless performance and 120/480-month size budgets.

These exclusions are deliberate. They keep Prompt 01 from becoming a second
financial engine or prematurely marking later systems complete.
