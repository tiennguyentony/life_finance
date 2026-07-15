# Contributing

## Before changing code

1. Read `docs/architecture/repository.md`.
2. Keep the change inside one authority boundary when possible.
3. Add financial behavior to `src/core` only when it is deterministic and framework-free.
4. Run `corepack pnpm verify` before opening a pull request.

## Folder ownership

- `src/app` owns route files and page composition. It does not own game rules.
- `src/features/<feature>` owns one user-facing capability and keeps controller
  orchestration separate from presentation components.
- `src/components` contains presentation shared by at least two real consumers.
- `src/core` contains the deterministic simulation and its contracts. It cannot import React or Next.js.
- `src/data` contains immutable shared catalogs. It never contains mutable player state.
- Tests live in an adjacent `__tests__` directory. The automated layout check
  rejects test files mixed into production directories.

## Adding a vertical slice

Start from one user-visible outcome. Define the deterministic rule in `src/core`, prove it with a failing test, add the smallest feature UI that consumes it, and keep the route file thin.

AI may describe a result that deterministic code already produced. AI cannot calculate balances, select events, validate choices, or mutate game state.
