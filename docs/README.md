# Life Finance documentation

These documents describe the current product and code. If a document conflicts with executable contracts or tests, the code and tests win and the document should be corrected.

## Read in this order

1. [`architecture/overview.md`](architecture/overview.md) — system boundaries and request flow.
2. [`product/board-experience.md`](product/board-experience.md) — canonical UI and player interactions.
3. [`architecture/api.md`](architecture/api.md) — the browser API, cookie session, and error contract.
4. [`architecture/data-and-engine.md`](architecture/data-and-engine.md) — authoritative state, deterministic engine, persistence, and internal versions.
5. [`operations/local-development.md`](operations/local-development.md) — setup, environment, and verification.
6. [`operations/schema-2-cutover.md`](operations/schema-2-cutover.md) — deployment rule for old persisted runs.

## Source-of-truth map

| Concern | Source |
| --- | --- |
| Board UI | `src/features/board` |
| Onboarding UI | `src/features/onboarding` |
| Browser API contracts | `src/contracts/api` |
| Browser API client | `src/lib/api-client` |
| HTTP boundary | `src/server/api/current-http.ts` |
| Application use cases | `src/application/game` |
| Deterministic simulation | `src/core` |
| Persistence | `src/server/db` and `drizzle` |
| Tax integration | `src/server/tax` and `services/tax` |
