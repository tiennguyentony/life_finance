# Data and deterministic engine

## Current authority

Schema 2 is the only writable game-state format. New onboarding runs are created directly as schema 2 and all board commands use the schema-2 engine internally.

The authoritative state includes exact financial balances, player and scenario data, recurring strategy, events, market state, wellbeing, outcomes, replay evidence, and an immutable ledger. Money is stored as integer cents; rates use integer parts per million; simulation time uses `YYYY-MM` months.

## Persistence

`RunRepository` stores and verifies:

- the current run and revision;
- accepted commands and idempotency keys;
- sparse state snapshots and migration evidence;
- monthly tax evidence and turn records;
- ledger transactions;
- scenario and causal-history evidence;
- transactional outbox messages.

Writes are transactionally coupled so a failed reduction, tax calculation, checksum, or outbox insert does not partially advance a run.

## Why versioned names remain

Names such as `GameStateV2`, `contracts-v2.ts`, and `onboarding-v1-contracts.ts` describe persisted or replayed data formats. They are not alternative HTTP APIs.

Schema-1 decoding and migration code remains because historical records must be interpreted deterministically. It must not be imported by `src/contracts/api`, `src/lib/api-client`, or board components.

## Server-owned inputs

The browser never supplies tax results, market results, event probability, ledger postings, checksums, or random draws. `RunService` calculates or obtains those inputs, applies the deterministic reducer, and persists the result before returning a new `RunView`.

## External services

- The tax service is required to process financial months that need fresh tax evidence.
- AI providers are optional. Typed onboarding remains available without AI; narrative features fall back or report unavailability according to their contract.
