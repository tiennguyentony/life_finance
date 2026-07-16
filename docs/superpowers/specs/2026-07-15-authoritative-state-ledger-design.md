# Authoritative Game State and Ledger Design

Date: 2026-07-15
Prompt: 01 — Authoritative Game State and Ledger
Status: approved compatibility-first direction

## Goal

Make schema-v2 game state the only model that may receive new gameplay changes while preserving old saves through deterministic migration. Strengthen state transition validation, ledger provenance, snapshot efficiency, and migration access without moving financial formulas into the state layer or rewriting the working v2 engine.

## Existing strengths to preserve

- Money uses integer cents and rates use integer parts per million.
- Rate multiplication and proportional allocation use BigInt intermediates with half-away-from-zero rounding.
- State and ledger values are immutable after finalization.
- The ledger is double-entry and aggregate financial balances reconcile against ledger accounts.
- State checksums use canonical serialization.
- v1 and v2 state decoders reject malformed or internally inconsistent data.
- v1-to-v2 migration is deterministic and journaled transactionally.
- Commands use optimistic revisions and idempotency identifiers.
- Tax evidence and command payloads are persisted for deterministic replay.

## Alternatives considered

### A. Introduce schema v3 and rewrite every v2 reducer

This gives the strictest new type but forces nearly every financial, event, API, and persistence module to change at once. It creates another temporary competing state model and exceeds Prompt 01's instruction to avoid rewriting working code.

Decision: reject.

### B. Keep both v1 and v2 writable

This preserves every legacy endpoint but leaves two mutable authorities, two engines, and two command paths. Every future repair would need to be implemented twice.

Decision: reject.

### C. Keep v2 as the sole writable model and add backward-compatible guarantees

Old v1 saves remain decodable and migrate through the existing deterministic transformer. Existing schema-v2 saves remain readable. Additive fields are optional only for old persisted v2 fixtures; all newly created or migrated states contain them. Public v1 mutation endpoints stop creating new legacy state, while an authenticated migration endpoint upgrades old saves.

Decision: adopt.

## Canonical state authority

Create an explicit state-authority module:

- AuthoritativeGameState is GameStateV2.
- requireAuthoritativeGameState accepts PersistedGameState and returns v2 or throws a structured migration-required error.
- v1 remains a supported persisted input and migration source, not a mutable gameplay target.
- The v1 core/repository code may remain temporarily for fixture compatibility and migration tests, but production mutation routes no longer call it.

The authoritative aggregate continues to own:

- run/player identity, schema/engine version, revision, dates, RNG state, accepted command identifiers, and terminal outcome;
- aggregate finances and wellbeing;
- the immutable ledger;
- detailed employment, portfolio, debt, benefits, insurance, contribution, recurring-policy, market, exposure, event, career, goal, milestone, and learning state;
- pending decisions;
- an additive Runtime Balance state container.

## Runtime Balance state container

Prompt 09 will implement balance behavior. Prompt 01 only establishes a valid persisted container:

- version: 1;
- pressurePpm: bounded from zero through one million;
- recoveryUntilMonth: nullable simulation month;
- catastropheCount: non-negative safe integer;
- lastApprovedEventMonth: nullable simulation month.

New native v2 states and v1-to-v2 migrations persist the zero/default value. Older schema-v2 states may omit it and receive the same value through a selector; their stored checksum is not silently changed on read. The next accepted command normalizes the additive field into the resulting state.

## Authoritative versus derived values

Authoritative persisted values:

- ledger transactions and account definitions;
- aggregate balances in finances, intentionally cached and validated against the ledger;
- detailed portfolio/debt balances, intentionally cached and validated against aggregate balances;
- calendar, RNG, policies, pending decisions, histories needed by deterministic gameplay, and outcome;
- versioned catalog selection/snapshot and external tax evidence references.

Derived values:

- age;
- net worth;
- remaining credit;
- investable assets;
- goal progress and grade projections;
- checkpoint and debrief aggregates.

Derived values are exposed through code selectors. Existing compatibility exports may remain, but UI and AI adapters should consume the selectors rather than repeat formulas. Automatic-liquidity and goal formulas remain financial-engine/outcome concerns and are not moved into the state authority module.

## State transition invariants

Add a transition validator that receives previous and next v2 states. It validates facts that a single-state validator cannot:

- run identity, schema version, and engine version do not change during a normal command;
- revision increases exactly once;
- current month never moves backward;
- birth month and start month never change;
- accepted command identifiers preserve the old prefix and append exactly the current command;
- existing ledger accounts are unchanged and no account ID is removed;
- existing ledger transactions are an immutable prefix;
- a terminal outcome cannot disappear or change;
- a pending event may only change through internally consistent lifecycle states;
- RNG metadata remains valid.

The repository invokes this validator after reduction and before checksumming or persistence. Migration uses its separate migration validator because schema/engine changes are expected there.

## Ledger provenance

Preserve the existing double-entry structure and add provenance to every newly appended transaction:

- sourceSystem: bounded identifier describing the code system that produced it;
- category: bounded financial/audit category;
- causalReference: kind and stable identifier linking the transaction to a command, event, milestone, or system initialization;
- existing transaction ID, command ID, effective simulation month, reason code, description, account postings, and optional reversal reference remain.

For compatibility, persisted legacy transactions may lack provenance. The stored transaction type represents that possibility, while appendTransaction accepts a stricter NewJournalTransaction type that requires provenance. Thus all new writes are complete at compile time without inventing facts for historical entries.

Reversals copy the original source/category and causally reference the reversal command while retaining reversesTransactionId.

## Money and rounding

- All balances and ledger amounts remain safe integer cents.
- Rates remain safe integer PPM.
- Addition/subtraction use BigInt intermediates and reject overflow.
- Rate multiplication and proportional allocation round exact half values away from zero.
- No floating-point dollar arithmetic enters state or ledger code.
- Rounding occurs only when a rational result is converted back to integer cents.

These boundaries are documented in the architecture guide and covered by fixed positive/negative half-cent tests.

## Sparse snapshot policy

game_runs.current_state remains the current save and transactional source of truth. Historical run_state_snapshots stop receiving a full copy after every command.

Persist historical snapshots at:

- run start;
- every twelve processed months as a checkpoint;
- immediately before and after an event choice or queued AI event;
- immediately before and after a life-milestone decision;
- terminal outcome;
- migration boundary.

Existing historical snapshots remain valid. Add snapshotKind and causalCommandId metadata. Remove database foreign keys that require every accepted command and monthly record to have a matching full-state snapshot.

Idempotency and checkpoint reads reconstruct an exact historical state from:

1. the nearest compatible snapshot or migration target at/before the requested revision;
2. ordered accepted commands;
3. persisted command payloads, including tax evidence;
4. checksum verification at every replayed revision.

Replay is a rare read path; command application remains a single reduction. Corruption or a checksum mismatch produces a structured CORRUPT_STATE error.

## Save/load and migration access

Add an authenticated POST migration endpoint under the v2 run namespace. It calls the existing transactional repository migration:

- lock and authenticate the run;
- validate source version, identity, revision, and checksum;
- deterministically map v1 to v2 without guessing missing detail;
- validate and checksum the target;
- journal source/target metadata and target state;
- update the current run atomically;
- emit an outbox record;
- return the same target on repeated calls.

Public v1 read remains available for old saves. Public v1 create and command submission return a structured deprecation response that points clients to v2 creation or migration. Internal v1 constructors/reducers remain only while compatibility fixtures need them.

## Error handling

- Invalid individual states retain structured path/code/message violations.
- Invalid transitions receive structured transition violations.
- Unsupported legacy writes return an HTTP 410 schema-deprecated response.
- A migration with bad credentials remains indistinguishable from a missing run.
- Corrupt checksums, missing replay anchors, invalid stored commands, or replay checksum drift return CORRUPT_STATE.
- Concurrent migration remains serialized and idempotent.

## Testing

Unit tests:

- authoritative v2 requirement and migration-required error;
- Runtime Balance defaults and bounds;
- transition monotonicity, immutable prefixes, terminal immutability, and stable IDs;
- half-away-from-zero monetary rounding;
- ledger provenance required for new appends and tolerated for legacy decode;
- sparse snapshot policy for start, annual checkpoint, event/milestone boundaries, terminal state, and ordinary months;
- replay from a sparse snapshot produces the same checksum as sequential reduction.

Integration/API tests:

- old v1 fixture migrates through the authenticated endpoint;
- repeated migration is idempotent;
- v1 public writes are rejected without mutating persistence;
- ordinary monthly commands no longer add historical snapshots every month;
- idempotent command retry reconstructs the original resulting state;
- checkpoint evidence works when the requested revision is not directly snapshotted;
- migration, corruption, rollback, and concurrency behavior remain intact.

Full verification:

- lint;
- TypeScript typecheck;
- complete Vitest suite;
- production build;
- database integration tests when TEST_DATABASE_URL is configured.

## Scope boundaries

- Do not implement Runtime Balance decisions; Prompt 09 owns them.
- Do not change financial calculation order or formulas; Prompt 02 owns them.
- Do not redesign event probability or severity; Prompts 06 and 08 own them.
- Do not implement multi-month advancement; Prompt 03 owns it.
- Do not implement causal graphs or counterfactuals; Prompt 11 owns them.
- Do not delete old saved data or guess missing historical detail.
