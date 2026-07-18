# Contributing

## Before changing code

1. Read [`docs/architecture/overview.md`](docs/architecture/overview.md) and [`docs/architecture/current-system-audit.md`](docs/architecture/current-system-audit.md).
2. Confirm whether the behavior is core-only, server-exposed, or player-exposed; do not document an internal module as a shipped feature.
3. Keep deterministic financial behavior in `src/core`, framework-free and covered by adjacent tests.
4. Keep route files thin and expose browser data only through `RunView` and the unversioned contracts in `src/contracts/api`.
5. Run `pnpm verify` before merging.

## Folder ownership

- `src/app`: Next.js pages and route adapters; no game rules.
- `src/features/<feature>`: one user-facing capability, with orchestration separated from presentation.
- `src/components`: presentation shared by at least two real consumers.
- `src/contracts/api`: versionless browser contracts.
- `src/application/game`: use cases and the frontend-safe `RunView` projection.
- `src/server`: authentication, HTTP orchestration, persistence, tax, AI, and teaching adapters.
- `src/core`: deterministic simulation and replay contracts; it cannot import React or Next.js.
- `src/data`: immutable, versioned catalogs; never mutable player state.
- `services/tax`: independently runnable PolicyEngine service.

Tests belong in an adjacent `__tests__` directory. `pnpm check:test-layout` rejects test files mixed into production directories.

## Authority rules

- The browser sends player intent, never tax results, random draws, ledger postings, effective months, or schema versions.
- The server validates authorization and revision, supplies server-owned evidence, applies the reducer, persists atomically, then projects a `RunView`.
- AI output must not directly mutate balances or invent an event outside the deterministic candidate/effect contract. Current public gameplay does not call the AI world-director or teaching services.
- The local demo must remain explicitly development-only and must never become a silent fallback for failed persistent onboarding.
