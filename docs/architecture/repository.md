# Repository Architecture

## Why one application

Life Finance is at the localhost skeleton stage. One Next.js application keeps installation, development, testing, and eventual deployment simple. Packages or services should be extracted only after a real independent release or scaling requirement appears.

## Dependency direction

```text
app routes -> feature modules -> shared components
                         |
                         `-> core contracts and deterministic rules

static catalogs -> feature modules or core rules
```

`src/core` is the stable center. It must not depend on React, Next.js, browser APIs, storage providers, or AI clients.

## Folder rules

### `src/app`

Owns URL structure, metadata, layouts, and composition. Route files import feature entry points and stay free of business logic.

### `src/features`

Each folder maps to one CUJ. Feature-local components, types, and fixtures stay together until another genuine consumer appears.

### `src/components`

Contains presentational code used by multiple features. Do not move a component here in anticipation of reuse.

### `src/core`

Contains shared domain contracts and future deterministic simulation rules. Monetary amounts use integer cents. Every new behavior begins with a failing test.

### `src/data`

Contains immutable shared catalogs such as locations, careers, event templates, and market instruments. Mutable player state never belongs here.

## State and persistence

Supabase PostgreSQL is authoritative. Each accepted command stores the versioned
`GameState`, canonical checksum, immutable revision snapshot, append-only ledger
delta, command envelope, and outbox event in one transaction. Native schema-v2
runs additionally store their resolved scenario snapshot once. Monthly turns
store checksum-protected tax evidence and a checksum-protected result record
linked to the accepted command and resulting state revision. Persistence remains
an adapter around deterministic core transitions; it never recalculates money.

## AI boundary

An optional server adapter may eventually turn a resolved event into narrative text. The deterministic result remains authoritative. AI cannot author or change player state.

## Extraction rule

Keep one repository and one application until a module has a separate release cadence, runtime, or proven reuse case. A folder boundary is enough before that point.
