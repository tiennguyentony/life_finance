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

The future authoritative state is a versioned `GameState`. The first persistence adapter will use browser storage and JSON export or import. Storage is an adapter around state, not part of financial calculation.

## AI boundary

An optional server adapter may eventually turn a resolved event into narrative text. The deterministic result remains authoritative. AI cannot author or change player state.

## Extraction rule

Keep one repository and one application until a module has a separate release cadence, runtime, or proven reuse case. A folder boundary is enough before that point.
