# Gameplay V4 requirements and verification contract

This document translates the approved Life Finance V4 product design into an
implementation and verification contract for the repository. It is intentionally
UI-independent. Product behavior is defined by the V4 product specification;
technical invariants and layer boundaries are defined by
[`backend-v4.md`](./backend-v4.md). Earlier repository skeleton documents are
historical scaffolding, not gameplay requirements.

## Source-of-truth order

When two documents appear inconsistent, use this order:

1. The approved V4 product specification defines player experience, gameplay,
   outcomes, and judging intent.
2. `backend-v4.md` defines deterministic math, state authority, persistence,
   security, and external-service boundaries.
3. This document defines traceability, edge cases, and delivery order.
4. Repository skeleton plans describe the initial shell only.

Any unresolved conflict must become a recorded decision before implementation.
Do not silently choose whichever behavior is easiest to code.

## Locked gameplay decisions

### Time and pacing

- The authoritative simulation step is one calendar month.
- A calm period may be presented as an elastic checkpoint spanning several
  months, but the engine still processes and records each month in order.
- The engine shortens checkpoints around scheduled events, insolvency risk,
  choices, or terminal outcomes. A checkpoint must never skip a required player
  decision or a terminal month.
- Age is derived from birth month and simulation month, never from wall-clock
  time. The age-65 outcome is evaluated on the first processed month at or after
  age 65.

### Money, solvency, and outcomes

- Displayed net worth is every owned asset minus every liability, including the
  home, retirement accounts, and credit balances.
- Automatic funding for required obligations is strictly: available cash,
  after-cost taxable-investment liquidation value, then remaining credit.
- Home equity and retirement assets are excluded from automatic liquidity. They
  may affect net worth and financial-independence progress, but supply cash only
  through explicit validated sale or withdrawal actions.
- Bankruptcy occurs only when required obligations cannot be covered by all
  automatic liquidity sources. A negative net worth alone is not bankruptcy.
- Financial independence ends the run immediately with grade S when yielding or
  investable assets reach 25 times annual living cost. Home equity is excluded.
- At age 65, non-FI progress is graded A at 80%, B at 60%, C at 40%, D at 20%,
  and E below 20% of the current FI target. Bankruptcy is F.
- Exposure must not change the final grade until a separate product decision
  explicitly enables the optional grade modifier.

### Authority and explainability

- The server owns state. Clients submit versioned commands, never replacement
  state or authoritative numeric outcomes.
- Every accepted financial transition reconciles to balanced append-only ledger
  transactions and records its originating command and reason.
- Numeric effects of markets, taxes, events, choices, and outcomes are computed
  or validated deterministically. AI may supply bounded structured narrative or
  proposals but cannot grade the player, calculate money, select arbitrary event
  timing, or mutate state.
- The same initial state, catalog versions, engine version, seed, tax result, and
  ordered commands must replay to the same canonical checksum.

## System requirements

### R1 — Player and scenario catalogs

The run records immutable version identifiers for location, career, household,
and scenario catalogs. Catalog entries supply the initial salary range, living
cost assumptions, tax jurisdiction, job sector, benefits options, and scenario
constraints. Updating a catalog must not alter an existing run.

Acceptance criteria:

- Invalid or incompatible catalog identifiers reject run creation atomically.
- A run snapshot contains the selected values and their source versions.
- Replay never reads mutable "latest" catalog values.
- Currency and rates use integer cents and PPM at domain boundaries.

### R2 — Detailed balance sheet and obligations

The financial model distinguishes cash, broad index funds, sector funds,
speculative/meme assets, retirement accounts, HSA, home, other assets, credit,
and term debts. Debts record principal, rate, minimum payment, and remaining term
when applicable. Monthly required obligations include fixed living costs, debt
service, insurance premiums, taxes due, and committed recurring costs.

Acceptance criteria:

- Detailed accounts reconcile exactly to aggregate API summaries and the ledger.
- No asset or liability can be counted twice in net worth or FI assets.
- Negative balances are allowed only for account types whose rules permit them.
- Interest, minimum payments, and maturity boundaries use documented rounding.
- Paying off a debt cannot create a negative principal or a later phantom payment.

### R3 — Income, tax, benefits, and insurance

Employment and other gross income enter the monthly turn explicitly. The
application service obtains a persisted tax projection through the pinned tax
adapter; the core applies only validated tax results. Employer retirement match,
health-plan premium, HSA eligibility, and insured event coverage follow the
selected benefits contract.

Acceptance criteria:

- A tax timeout, invalid response, or persistence failure commits no partial turn.
- Tax results include policy year, jurisdiction, trace identifier, and adapter
  version so replay does not make a new network request.
- Contributions cannot exceed income, plan eligibility, configured game limits,
  or available cash after mandatory items.
- Employer match follows the plan formula and never exceeds its cap.
- HSA contributions are rejected when the selected health plan is ineligible.
- Insurance applies deductible, coinsurance, coverage cap, and exclusions in a
  deterministic order; uncovered costs remain obligations.

### R4 — Recurring strategy and explicit actions

Players can configure recurring salary allocations to broad index, sector,
retirement, IRA, HSA, and accelerated debt payment. One-off actions include
taxable investment trades, debt payment, home purchase or sale, refinancing,
retirement withdrawal, lifestyle change, and upskilling where scenario rules
allow them.

Acceptance criteria:

- Percent allocations use PPM and define whether their base is gross or net pay.
- Mandatory obligations are not silently displaced by an overcommitted strategy.
- Allocation totals over the allowed base reject atomically with field-level
  reasons; zero allocations are valid.
- Recurring strategy changes take effect in a specified month and remain in force
  until replaced.
- Early retirement withdrawal records withholding, penalty, cash proceeds, and
  reduced retirement balance as one balanced transition.
- Home and refinance actions include closing costs and cannot rely on home equity
  before the transaction commits.
- Repeating a command identifier is idempotent and cannot repeat a purchase,
  withdrawal, payment, or employer match.

### R5 — Markets and macro story

The engine creates a deterministic monthly market result for broad equity,
sector exposure, speculative assets, bonds/cash, housing, inflation, rates, and
labor demand. Macro events alter bounded model parameters and may form a
multi-month story. They do not directly rewrite arbitrary wallet balances.

Acceptance criteria:

- Random draws use one documented order and persist the next RNG state.
- Asset effects depend only on owned exposure; a zero balance receives no gain or
  loss.
- Losses cannot push a long-only asset below zero.
- Macro modifiers are clamped to versioned bounds and expire predictably.
- Fast-forward produces the same final checksum as processing identical months
  individually and stops at decisions or terminal outcomes.

### R6 — Personal events and player choices

Personal shocks use engine-owned templates with eligibility, severity bounds,
choice definitions, cooldowns, and numeric effects. Supported domains include
employment, health, property, household, lifestyle, and investment behavior.
Choice text and narrative may be generated, but accepted effects must map to a
known template and pass validation.

Acceptance criteria:

- An ineligible, expired, unknown, or out-of-bounds proposal causes no mutation.
- Required-choice events pause progression until one valid choice is submitted.
- A choice cannot be applied twice or to another event instance.
- Insurance, emergency cash, career, home ownership, and portfolio exposure
  affect only events whose templates declare those dependencies.
- Event cooldown and story state survive process restarts and replay.
- Medical, repair, layoff, and catastrophe cases distinguish immediate cash cost,
  recurring obligation, income interruption, and insured reimbursement.

### R7 — Hostile Fed and exposure

The engine computes a hidden, explainable exposure value from versioned metrics:
emergency-fund months, debt-to-income ratio, revolving debt, insurance gaps,
portfolio concentration, and job-to-investment correlation. The Hostile Fed may
target a demonstrated weakness by choosing among eligible engine-owned templates
inside a fairness envelope. It cannot invent an unbounded financial effect.

Acceptance criteria:

- Exposure calculation is deterministic and retains a metric breakdown for audit
  and the final debrief.
- Missing or zero income has an explicit DTI policy; division by zero is
  impossible.
- A player with no investable assets is not falsely marked concentrated.
- Correlation uses cataloged job and asset sectors, not AI interpretation.
- Severity and frequency remain within age, recovery, cooldown, and solvency
  guardrails.
- The same weakness cannot be targeted indefinitely when alternatives or a
  recovery window are required by fairness rules.

### R8 — Checkpoints, evidence, and debrief

Checkpoints summarize the months actually processed, including changes in net
worth, cash flow, liabilities, exposure drivers, events, and decisions. The final
debrief cites recorded evidence and explains tradeoffs. AI wording is optional to
game-state correctness and cannot replace evidence.

Acceptance criteria:

- Checkpoint aggregates reconcile to their underlying monthly records.
- Important decisions and event choices retain their alternatives and effects.
- Debrief evidence references stable command, ledger, event, and month identifiers.
- AI failure may delay narrative but cannot lose or alter the deterministic run.
- Player-facing explanations clearly label educational tax and finance estimates.

### R9 — Localization and educational content

Locale affects presentation strings and catalog selection, not core math or
canonical state. Financial terms and just-in-time explanations use versioned
content identifiers so wording can improve without changing replay.

Acceptance criteria:

- Canonical money remains cents; formatting and translated text never enter
  financial calculations.
- Missing translations use an explicit fallback locale and are observable.
- Event and educational content contain no unauthorized third-party material.

## Current implementation traceability

Status meanings: **implemented** has production code and direct tests;
**partial** has reusable core behavior but not the complete product path;
**missing** has no authoritative end-to-end implementation yet.

| Requirement | Status | Current evidence | Required next work |
| --- | --- | --- | --- |
| Exact domain primitives, immutable state, seeded RNG | Implemented | `src/core/domain`, `src/core/game-state.ts` | Preserve through state v2 migration |
| Balanced ledger and reconciliation | Implemented | `src/core/ledger.ts`, invariant tests | Add detailed v2 accounts and debt subledgers |
| Net worth, FI, age-65 grading, cash-flow bankruptcy | Implemented | `src/core/game-state.ts`, `src/core/outcomes.ts` | Reverify against detailed accounts |
| Monthly market processing | Partial | `src/core/market.ts`, `src/core/monthly-turn.ts` | Add asset classes, story state, orchestrator consumer |
| Event templates and bounded choices | Partial | `src/core/events.ts`, `src/data/event-templates.ts` | Add scheduler, cooldowns, story state, insurance and behavioral events |
| Explicit financial actions | Partial | `src/core/actions.ts`, `src/core/detailed-actions-v2.ts`, `src/core/recurring-strategy-v2.ts` | Apply recurring plan in turn orchestration; add claims, home/refi/upskill, and API |
| Elastic checkpoints | Partial | `src/core/checkpoints.ts` | Integrate decisions/events and persist monthly records |
| Versioned commands and concurrency | Partial | `src/core/commands.ts`, repository transaction tests | Expose process-turn command and replay contract |
| Tax adapter | Partial | `src/server/tax`, `src/core/payroll-v2.ts` | Build/persist evidence in turn service before atomic core application |
| AI contracts, privacy, encrypted audit | Partial | `src/server/ai` | Connect bounded roles to events/debrief; quota is not required for core work |
| Run persistence and REST API | Partial | `src/server/db`, `src/server/api` | Add gameplay application service, queries, outbox dispatcher |
| Location/career/benefits catalogs | Partial | `src/core/scenario-catalog.ts`, `src/data/scenario-catalog.ts` | Persist resolved catalog snapshots during native v2 run creation |
| Detailed portfolio, debt, insurance, HSA | Partial | `src/core/game-state-v2.ts`, `src/core/detailed-actions-v2.ts`, `src/core/debt-service-v2.ts`, `src/core/insurance-v2.ts` | Apply these subsystems in atomic turns and repository commands |
| Exposure and Hostile Fed targeting | Missing | — | Implement metrics, fairness policy, scheduler, audit breakdown |
| Psychology traps and multi-month macro story | Missing | — | Add bounded templates and persisted story lifecycle |
| Teacher evidence/debrief pipeline | Missing | — | Build deterministic evidence first, AI narrative second |
| Gameplay API integration and multi-turn E2E | Missing | — | Prove create → configure → process → choose → checkpoint → terminal |

## State evolution requirements

The deployed schema-v1 state must not be reinterpreted as schema v2. State v2
work must include all of the following in one stable subsystem:

1. A discriminated persisted-state decoder supporting every still-supported
   schema version.
2. A pure, deterministic v1-to-v2 migration with golden fixtures and an explicit
   mapping for every old field and ledger account.
3. A migration marker recording source schema, target schema, and migration
   version without changing historical ledger transactions.
4. Replay behavior that either reproduces the original engine result or records
   a deliberate engine upgrade boundary. Commands from different engine versions
   must never be mixed silently.
5. Repository compare-and-swap behavior so concurrent migration or command
   processing cannot overwrite a newer revision.
6. Rollback safety: old persisted snapshots remain recoverable until migrated
   runs and fresh v2 runs pass integration and production smoke tests.

The v1-to-v2 persistence boundary uses an immutable `run_state_migrations`
journal rather than a command snapshot. Schema migration does not represent a
player command, so it preserves the authoritative revision, month, status,
command history, and ledger while recording both canonical state checksums. The
repository locks the run, validates row metadata against the decoded state, and
updates it with compare-and-swap conditions in the same transaction as the
migration journal and outbox event. Replaying the migration validates the saved
target and returns it idempotently.

This migration is deliberately not exposed through the public gameplay API yet.
Existing command and query paths reject schema v2 until v2 reducers and response
contracts are enabled; this prevents a partially upgraded run from being
processed by schema-v1 logic. Production invocation remains gated on the later
v2 gameplay integration and smoke-test slices.

## Required edge-case suites

Each feature must add unit boundaries plus at least one integrated state
transition. The final game loop must cover these scenario families:

- exact threshold cases: FI at one cent below/at target; grades around every
  boundary; age 65 month; full/zero credit; full/zero liquidation cost;
- liquidity ordering: cash only, cash plus investments, all three sources, one
  cent insolvency, high net worth but illiquid, explicit retirement/home rescue;
- allocation ordering: no income, income below obligations, exact allocation,
  over-allocation, employer match cap, ineligible HSA, debt paid mid-month;
- lifecycle: duplicate/stale/out-of-order commands, terminal-run rejection,
  decision pause, event expiry, cooldown expiry, checkpoint boundary;
- markets and events: extreme bounded returns, zero holdings, correlated exposure,
  repeated shocks, recovery protection, insured and uninsured catastrophe;
- external failures: tax timeout/schema error, AI timeout/schema error, database
  conflict, outbox retry, restart after commit, retry after unknown client result;
- replay and migration: fixed seed, individual versus fast-forward equivalence,
  v1 fixture migration, canonical checksum, catalog update isolation;
- security and privacy: invalid run secret, cross-run access, secret redaction,
  minimized encrypted AI audit, no prompt body in ordinary logs.

## Delivery sequence

Every numbered slice is independently tested, committed, and pushed before the
next slice begins.

1. **State evolution foundation:** state-v2 design, decoder, v1 migration, and
   golden replay fixtures.
2. **Scenario catalogs:** versioned location, career, benefits, and sector data
   with immutable run snapshots.
3. **Detailed finances:** portfolio buckets, debts, benefits, insurance, and
   ledger reconciliation.
4. **Recurring strategy:** contribution ordering, employer match, HSA/retirement
   rules, debt acceleration, and explicit actions.
5. **Turn orchestration:** gross income, persisted tax result, strategy, market,
   obligations, outcomes, monthly record, and atomic repository transaction.
6. **Exposure and scheduling:** metric breakdown, fairness envelope, event
   eligibility/cooldowns, and multi-month story state.
7. **Gameplay API and outbox:** command/query contracts, authorization,
   idempotency, dispatcher, and typed client.
8. **Evidence and debrief:** checkpoint reconciliation, decision evidence, and
   optional bounded AI narrative.
9. **End-to-end verification:** multi-turn golden journeys, failure injection,
   deployment smoke tests, and requirement-matrix closure.

No slice is considered complete merely because its unit tests pass. Completion
requires traceability to this contract, lint, type checking, relevant integration
tests, production build, a clean secret scan, and evidence recorded in the local
work context.
