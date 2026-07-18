# Life Finance documentation

These files describe the code at the current `main` branch. Executable contracts and tests win if documentation ever disagrees.

## Read in this order

1. [`architecture/current-system-audit.md`](architecture/current-system-audit.md) — implemented, exposed, and incomplete behavior.
2. [`architecture/overview.md`](architecture/overview.md) — boundaries and end-to-end request flow.
3. [`product/board-experience.md`](product/board-experience.md) — current player flow and exact board plans.
4. [`architecture/api.md`](architecture/api.md) — routes, cookie session, commands, and errors.
5. [`architecture/data-and-engine.md`](architecture/data-and-engine.md) — state, monthly pipeline, tax, events, replay, and persistence.
6. [`operations/local-development.md`](operations/local-development.md) — demo, persistent setup, optional integrations, and verification.
7. [`operations/schema-2-cutover.md`](operations/schema-2-cutover.md) — production migration and schema compatibility.
8. [`operations/implementation-handoff.md`](operations/implementation-handoff.md) — current branch, invariants, verification, and deployment checklist.

Files in `docs/superpowers/` are historical implementation plans and specifications. They explain past decisions but are not descriptions of the live product.

## Source-of-truth map

| Concern | Primary source |
| --- | --- |
| Routes | `src/app/**/page.tsx`, `src/app/api/**/route.ts` |
| Board UI and plan menu | `src/features/board`, especially `plan-catalog.ts` |
| Onboarding UI mapping | `src/features/onboarding`, `src/services/player.service.ts` |
| Browser contracts/client | `src/contracts/api`, `src/lib/api-client` |
| Run projection/use cases | `src/application/game` |
| HTTP/runtime composition | `src/server/api` |
| Deterministic simulation | `src/core` |
| Immutable catalogs | `src/data` |
| PostgreSQL persistence | `src/server/db`, `drizzle/` |
| Tax integration | `src/server/tax`, `services/tax` |
| Optional AI/teaching modules | `src/server/ai`, `src/server/teaching` |
