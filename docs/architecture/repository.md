# Repository Architecture

## Runtime shape

Life Finance is one Next.js application plus one independently deployed Python
tax service. The web application owns the browser experience, versioned API,
deterministic TypeScript engine, PostgreSQL persistence, and bounded AI
adapters. The Python service owns the pinned PolicyEngine calculation only.

Keep this deployment shape until a module has a genuinely independent release,
security, or scaling requirement.

## Dependency direction

```text
app routes -> feature controllers -> feature presentation
    |                  |
    v                  v
API adapters -> application services -> deterministic core
                         |                    ^
                         v                    |
                 persistence / tax / AI   versioned catalogs
```

Dependencies point inward. `src/core` never imports React, Next.js, browser
APIs, PostgreSQL, tax transports, or AI clients. Storage and external services
adapt to core contracts; they do not recreate financial rules.

## Folder rules

- `src/app` owns URL structure, metadata, layouts, and thin route adapters.
- `src/features` owns user-facing controllers and presentation. Network/state
  orchestration and display panels stay separate when they change for different
  reasons.
- `src/components` contains presentation shared by proven consumers.
- `src/core` owns exact, deterministic state transitions and invariants. Money
  uses integer cents and rates use parts per million.
- `src/data` contains immutable, versioned catalogs; mutable player state never
  belongs there.
- `src/server/api` owns public contracts and application orchestration.
- `src/server/db`, `src/server/tax`, and `src/server/ai` are server-only adapters.
- Unit and integration suites live in the adjacent `__tests__` directory, never
  mixed into the production module directory.

Large modules are divided by authority, not arbitrary line count. Public
contracts, validation, orchestration, and specialized domain handlers should
be separate when each has an independent reason to change. Barrel/facade files
may re-export stable public names so refactors do not churn consumers.

## State and persistence

Supabase PostgreSQL is authoritative. Each accepted command stores the
versioned state, canonical checksum, immutable revision snapshot, append-only
ledger delta, command envelope, and outbox event in one transaction. Native v2
runs also store their resolved scenario snapshot. Monthly turns store
checksum-protected tax evidence and result records linked to the accepted
command and resulting revision.

Repository code validates identity, authorization, immutable prefixes,
checksums, idempotency, and optimistic revisions. It persists deterministic
results but never independently recalculates money.

### Outbox delivery

`TransactionalOutboxDispatcher` provides bounded at-least-once delivery.
Workers claim eligible rows with `FOR UPDATE SKIP LOCKED`, publish outside the
database transaction, and compare attempt numbers when acknowledging success
or failure. Consumers deduplicate the stable `idempotencyKey`.

## AI boundary

AI roles may produce structured education and narrative content after privacy
filtering. They cannot calculate balances, choose authoritative events, validate
player actions, or mutate state. The deterministic engine remains authoritative
even when an AI provider is unavailable.

## Change checklist

1. Put the rule in the narrowest authoritative layer.
2. Add or update tests in the adjacent `__tests__` folder.
3. Preserve public contracts unless a versioned migration is intentional.
4. Run `corepack pnpm verify` before committing.
5. For persistence changes, also run database integration tests against a
   disposable PostgreSQL database and review the generated migration.
