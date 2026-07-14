# Life Finance Repository Design

## Objective

Create a lean, GitHub-ready repository that starts on localhost and establishes durable folder boundaries for four future critical user journeys (CUJs):

1. Character spawning and localization
2. Monthly dashboard and turn loop
3. Adversarial Game Master events
4. Psychology traps and speculative decisions

This phase is a structural shell. It does not implement financial simulation rules, stochastic markets, tax calculation, persistence, or AI generation.

## Product Boundaries

- The product is a browser-first, single-player application.
- The first release runs locally without authentication or a database.
- Future saves will be local-first and portable through JSON export/import.
- AI may eventually write narrative text, but it will never calculate money, select events, validate choices, or mutate game state.
- Financial and simulation behavior will eventually be deterministic, versioned, and testable independently from the UI.

## Technical Approach

Use one Next.js App Router application written in TypeScript and managed with pnpm. Keep it as a single deployable repository until a real scaling constraint justifies extracting packages or services.

Avoid a component framework, global state library, database client, AI SDK, and monorepo tooling in this phase. Use React, Next.js, TypeScript, and plain CSS.

## Repository Structure

```text
.
|-- .github/
|   `-- workflows/             # Continuous integration
|-- docs/
|   |-- architecture/          # Stable architectural guidance
|   `-- superpowers/specs/     # Approved designs
|-- public/                    # Static browser assets
|-- src/
|   |-- app/                   # Routes, layouts, and page composition
|   |-- components/            # Truly shared presentational components
|   |-- core/                  # Domain contracts and future pure engine seams
|   |-- data/                  # Static catalogs and development fixtures
|   `-- features/              # CUJ-owned UI and feature boundaries
|       |-- character/
|       |-- dashboard/
|       |-- game-master/
|       `-- psychology-traps/
|-- tests/                     # Cross-feature and repository-level tests
`-- package.json
```

### Ownership Rules

- `src/app` owns URLs and composes feature entry points. It must not own financial rules.
- `src/features/<feature>` owns code specific to one CUJ. A feature may contain its own components, types, and fixtures when they are not shared.
- `src/core` contains only cross-feature domain contracts and, later, pure deterministic simulation code. It must not import React or Next.js.
- `src/data` contains shared static catalogs and fixtures, not mutable player state.
- `src/components` is reserved for components used by multiple features. A component remains inside its feature until a second real consumer exists.
- `tests` is reserved for repository-level behavior. Unit tests should live beside the module they exercise when implementation begins.

## Initial Localhost Shell

The scaffold will provide:

- A home page explaining the project status and linking to all CUJs
- One placeholder route for each CUJ
- Shared application navigation and a small visual system in plain CSS
- Minimal domain contracts that name the main concepts without implementing financial rules
- Empty-but-documented data boundaries for locations, careers, events, and market instruments
- Architecture and contribution documentation
- A continuous-integration workflow that runs the same verification commands used locally

Placeholder pages communicate intended ownership and future scope. They do not simulate a complete user flow or pretend that deferred calculations work.

## Future Data Flow

When gameplay is implemented, the intended direction is:

```text
route -> feature UI -> application command -> pure simulation engine
                                      |              |
                                      |              `-> deterministic state result
                                      `-> storage adapter -> browser save

deterministic event result -> optional server narrative adapter -> display text
```

The deterministic state result is authoritative. Narrative generation may describe an existing result but cannot alter it.

## Error Handling

The shell will use framework-native not-found and error boundaries where useful. Placeholder data access will return explicit empty states rather than silently inventing values. Future save import will require schema and version validation before state is accepted.

No generalized error framework or logging abstraction will be introduced during scaffolding.

## Testing and Verification

The repository must expose commands for:

- Linting
- Type checking
- Unit tests
- Production build

Initial tests should verify structural or pure contract behavior only when they provide real value. The scaffold will not add tests that merely assert placeholder copy. Continuous integration will run all verification commands on pushes and pull requests.

## GitHub Readiness

The repository will include:

- A concise README with prerequisites and localhost commands
- A `.gitignore` suitable for Next.js and local environment files
- An example environment file only if the shell actually reads environment variables
- Contribution guidance describing folder ownership
- CI configuration
- No secrets, generated build output, lockfile alternatives, or unused configuration

The initial publication target is a new GitHub repository created from this workspace after the scaffold passes local verification.

## Deferred Work

The following are explicitly outside this skeleton:

- Tax, income, debt, burnout, inflation, allocation, and asset-yield calculations
- Stochastic event selection and exposure scoring
- Geometric Brownian Motion and speculative market behavior
- LLM calls and AI-generated narratives
- Authentication, accounts, cloud saves, databases, and multiplayer
- Production deployment configuration
- A shared design-system package or extracted simulation package

These capabilities should be added as CUJ-sized vertical slices after the repository shell is established.
