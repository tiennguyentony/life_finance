# Repository-wide system audit

Date: 2026-07-15

Scope: current repository behavior, with emphasis on the v2 browser game, server application layer, deterministic core, persistence, tax adapter, and optional AI adapters. This is an audit only. No production code was changed.

## Status legend

| Status | Meaning |
| --- | --- |
| complete | One clear authority exists and the inspected requirements are substantially implemented and tested. |
| partial | Useful implementation exists, but one or more required capabilities or proof points are absent. |
| missing | No substantive implementation was found. |
| duplicated | More than one live or reusable implementation owns the same decision or formula. |
| incorrectly coupled | The capability exists, but it owns decisions or dependencies that belong in another system. |

## Executive findings

1. The v2 deterministic core is strong: money is integer cents, rates are parts per million, the random generator is seeded and serializable, market draw order is explicit, tax results enter as persisted evidence, and database writes are transactional and idempotent.
2. The repository still has two product stacks. v1 and v2 routes, services, state shapes, commands, outcomes, and monthly engines remain present. A single run is version-discriminated correctly, but repository-wide authority is duplicated until v1 becomes read/migrate-only or is removed.
3. Personal-event causality is wrong for the intended simulation. Exposure weaknesses decide which bad events may occur, the exposure score raises monthly event chance, and the same score unlocks catastrophe-tier templates. A weak emergency fund can therefore make bad luck more available and more frequent, rather than only making an independently caused shock more damaging.
4. There is no Runtime Balance Controller. Cooldowns and recency checks exist inside the scheduler, but there is no independent fairness approval, pressure budget, recovery window, catastrophe limit, difficulty profile, lesson coverage check, or impact estimator.
5. The Adaptive Scenario Director is not a ranking-only layer. The optional AI path selects a candidate and parameter values within core bounds, and the service queues that event directly after validation. There is no balance-controller approval between selection and insertion.
6. Time advancement is split. A tested v1 in-process checkpoint loop exists but is not used by production. The v2 UI advances multiple months through sequential network/database commands, so there is no authoritative v2 controller with tagged pause reasons.
7. Persistence is robust but may not scale linearly. Every transition validates, deep-freezes, checksums, and snapshots state containing the complete append-only ledger and histories, while ledger rows and monthly records are also stored separately. Long simulations can therefore incur repeated full-history serialization and storage.
8. Causal evidence is rich enough to build on, but causal analysis is not implemented. Commands, revisions, checksums, ledger entries, monthly records, event history, and milestones are persisted; direct/contributing cause links, turning points, and counterfactual replay are absent.
9. The Offline Balance Lab is missing. No matched-seed strategy runner, difficulty comparison, 480-month headless benchmark, or distributional balance report was found.

## Actual architecture

### Primary v2 command path

~~~mermaid
flowchart LR
    UI["Next.js play UI"] --> ROUTE["Versioned API route"]
    ROUTE --> SERVICE["RunApiServiceV2"]
    SERVICE --> TAX["Resolve or reuse tax evidence"]
    SERVICE --> REPO["RunRepository transaction"]
    REPO --> LOCK["Lock run and verify auth, revision, checksum, idempotency"]
    LOCK --> REDUCE["Reduce ProcessMonthV2 or player command"]
    REDUCE --> CORE["Deterministic core"]
    CORE --> FINALIZE["Validate and deep-freeze state"]
    FINALIZE --> PERSIST["State snapshot, accepted command, monthly record, ledger rows, tax evidence, outbox"]
    PERSIST --> RESPONSE["Versioned API response"]
~~~

The financial reducer does not call the network or database. The application service obtains external tax evidence before entering the core. The repository is the transactional authority for accepted commands and persisted revisions.

### Parallel legacy path

The repository also exposes v1 routes and RunApiService beside the v2 routes and RunApiServiceV2. GameState and GameStateV2 are both valid persisted types, and monthly-turn.ts and monthly-turn-v2.ts both implement financial progression. This is controlled compatibility, not accidental state corruption, but it is still duplicate product authority.

### External and optional services

- Tax: src/server/tax/client.ts may call PolicyEngine; resolved evidence is persisted and supplied to the deterministic reducer.
- World director: src/server/ai/world-director-service.ts may call an AI model or use a deterministic fallback, then submits a validated event-queue command.
- Education and debrief: AI services produce bounded explanatory content with deterministic fallbacks; they do not directly mutate financial state.
- Database: src/server/db/run-repository.ts owns transactionality, optimistic revision checks, idempotency, snapshots, normalized ledger persistence, and outbox writes.

## System matrix

| # | System | Status | Current authority | Principal finding | Next prompt |
| --- | --- | --- | --- | --- | --- |
| 1 | Onboarding and State Initialization | duplicated | Onboarding UI/model, scenario catalog, native v2 state factory, v1/v2 create services | v2 is catalog-backed and validated, but v1 accepts a separate state contract and UI repeats salary math. | Prompt 13 after Prompt 01 |
| 2 | Authoritative Game State and Ledger | duplicated | game-state.ts, game-state-v2.ts, ledger.ts, repository | Strong per-version invariants; two live state/command stacks and repeated full-history snapshots prevent one repository-wide authority. | Prompt 01 |
| 3 | Time and Turn Controller | incorrectly coupled | v2 play-console loop; dormant v1 checkpoints.ts | Multi-month control is in the browser and crosses API/DB once per month; no v2 tagged controller. | Prompt 03 after Prompt 02 |
| 4 | Deterministic Financial Simulation Engine | duplicated | monthly-turn.ts and monthly-turn-v2.ts plus finance modules | v2 is deterministic and exact, but v1 remains an alternate engine and some formulas are repeated. | Prompt 02 |
| 5 | Player Actions and Persistent Policies | duplicated | actions.ts and detailed/recurring v2 modules | v2 has broad, ledger-backed actions and persistent strategies; v1 commands remain live. | Prompt 05 |
| 6 | Goals, End Conditions, and Grading | duplicated | financial-goals-v2.ts, outcomes.ts, legacy FI helper | v2 player-selected FI goal is coherent, but a legacy 25x helper and UI/AI calculations remain alternate owners. | Prompt 04 |
| 7 | Risk and Resilience Analyzer | incorrectly coupled | exposure-v2.ts and event-scheduler-v2.ts | Exposure measures vulnerability but also causes event eligibility, frequency, and catastrophe access. | Prompt 06 |
| 8 | Macro and Market System | complete | market.ts and macro-story-v2.ts | Seeded, bounded, ordered, and tested; difficulty and balance integration remain future work. | Prompt 07 |
| 9 | Personal Event and Trap System | incorrectly coupled | event scheduler, lifecycle, templates, and events.ts | Deterministic and bounded, but event cause is vulnerability-driven and financial effects bypass a dedicated financial-effect interface. | Prompt 08 after Prompt 06 |
| 10 | Adaptive Scenario Director | incorrectly coupled | world-director-service.ts and ai-world-event-v2.ts | AI selects an event and parameter values, then the service queues it without an independent fairness gate. | Prompt 10 after Prompt 09 |
| 11 | Runtime Balance Controller | missing | None; scheduler contains fragments | Cooldown is not a balance controller. No pressure, recovery, catastrophe, difficulty, or impact policy exists. | Prompt 09 |
| 12 | Causal History and Counterfactuals | partial | commands, snapshots, ledger, monthly records, event/milestone histories | Evidence exists, but no causal graph, turning-point detector, or controlled replay comparison exists. | Prompt 11 |
| 13 | Teaching, Checkpoints, and Debrief | partial | checkpoint-v2.ts, education service, debrief service | Checkpoint aggregation and fallbacks are good; explanations do not yet rest on causal/counterfactual evidence. | Prompt 12 after Prompt 11 |
| 14 | Offline Balance Lab | missing | None | No headless matched-seed simulator, strategy bots, balance metrics, or long-run performance gate. | Prompt 14 |

## Detailed system maps

### 1. Onboarding and State Initialization

Status: duplicated.

- Authoritative files and entry points: src/features/play/onboarding-model.ts, onboarding form components, src/data/scenario-catalog.ts, src/core/scenario-catalog.ts, src/core/native-game-state-v2.ts, RunApiServiceV2.createRun, and the v1/v2 run-creation routes.
- Inputs: preset, catalog career and region, salary point, benefits, health and household fields, assets, liabilities, goal target/age, seed, and request identifiers.
- Outputs: immutable catalog snapshot plus a reconciled initial state with player, finances, goal, insurance, career, recurring strategy, ledger, RNG state, and revision metadata.
- State owned: the UI owns only draft form state; the created run owns authoritative scenario assumptions and financial opening balances. The repository owns run identity and persistence.
- Dependencies: scenario catalog, branded money/rate types, ledger construction, state validation, API contracts, and database repository.
- Tests found: onboarding-model, play-model, scenario-catalog, native-game-state-v2, API service, and repository integration tests.
- Determinism/performance risks: the start month is hard-coded in the browser flow; new run/player/command UUIDs are intentionally replay-relevant identifiers; UI salary bounds use floating multiplication rather than the core money/rate helper.
- Missing requirements: a single versioned creation contract, explicit persisted assumption/provenance records for every repaired/defaulted input, and an onboarding replay fixture independent of browser-generated IDs.
- Duplicate formulas or authority: v1 and v2 create paths coexist; salary range projection is repeated in UI and core.
- AI boundary: no AI is needed for authoritative initialization. If free-text intake is added, AI output must remain a proposal validated and normalized by this system.
- Next action: after Prompt 01 establishes one state authority, run Prompt 13 to make one catalog-backed initializer and remove UI-owned financial formulas.

### 2. Authoritative Game State and Ledger

Status: duplicated.

- Authoritative files and entry points: src/core/game-state.ts, src/core/game-state-v2.ts, src/core/ledger.ts, canonical serialization/decoder modules, src/server/db/run-repository.ts, run-repository-read.ts, and database schema/migrations.
- Inputs: initial state or prior persisted revision, validated command, external evidence, and deterministic reducer output.
- Outputs: finalized state, state checksum, balanced ledger, snapshot, accepted command, normalized transaction/posting rows, monthly record, and outbox message.
- State owned: player identity, calendar, finances, detailed v2 gameplay state, outcome, RNG, ledger, revision, histories, and catalog snapshot. The database owns accepted revision history and idempotency records.
- Dependencies: branded primitives, canonical serializer, validators, reducer dispatch, Drizzle/Postgres, tax-evidence schema, and outbox.
- Tests found: game-state v1/v2, ledger, canonical serialization, command replay, persistence decoder, repository integration, concurrency, rollback, idempotency, and migration tests.
- Determinism/performance risks: finalize validates and recursively freezes the full aggregate; checksums serialize it; every accepted command snapshots it. Because the aggregate contains full ledger and history arrays, total serialization/storage work can grow roughly quadratically with run length.
- Missing requirements: one mutable production version, an explicit snapshot/compaction policy, a 480-month size/time budget, and proof that normalized ledger/history tables can reconstruct or audit compacted state.
- Duplicate formulas or authority: GameState and GameStateV2, v1/v2 command reducers, full ledger in state and normalized ledger rows in SQL.
- AI boundary: AI does not own state validation or ledger writes, which is correct.
- Next action: Prompt 01 should designate v2 as the sole mutable authority, constrain v1 to migrate/read-only behavior, and define bounded snapshot/history ownership before other repairs.

### 3. Time and Turn Controller

Status: incorrectly coupled.

- Authoritative files and entry points: src/features/play/play-console.tsx runMonths, src/core/monthly-turn-v2.ts for a single month, src/core/checkpoints.ts for the unused v1 in-process fast-forward, and v2 month/checkpoint API routes.
- Inputs: requested month count, current state, stop conditions, command IDs, and per-month tax evidence.
- Outputs: one or more monthly transitions, or a pause at terminal outcome, pending event choice, or due milestone.
- State owned: no dedicated v2 controller state. The browser owns loop progress and busy state; the run state owns current month and pending interruptions.
- Dependencies: UI fetch loop, API client, service, repository, tax adapter, reducer, event lifecycle, milestone lifecycle, and checkpoint query.
- Tests found: v1 checkpoint planning/fast-forward determinism, monthly-turn v1/v2 tests, API/repository tests, and play model tests. No production v2 controller test exists.
- Determinism/performance risks: one browser request and database transaction per month; tax resolution is entered per command, even when cacheable; interruption reasons are inferred by UI conditions rather than returned as a tagged result.
- Missing requirements: AdvanceOneMonth, AdvanceNMonths, and AdvanceUntilEventOrCheckpoint as one application/core boundary; tagged pause reasons; no-network/no-remote-DB hidden loop; parity tests between one-at-a-time and fast-forward.
- Duplicate formulas or authority: dormant v1 fast-forward and active v2 browser loop.
- AI boundary: none required.
- Next action: Prompt 03, after engine authority is settled, should move loop control behind one server application command while keeping tax evidence pre-resolution outside the core.

### 4. Deterministic Financial Simulation Engine

Status: duplicated.

- Authoritative files and entry points: src/core/monthly-turn-v2.ts, payroll-v2.ts, debt-service-v2.ts, obligation-funding-v2.ts, recurring-strategy-v2.ts, insurance-v2.ts, detailed-actions-v2 modules, outcomes.ts, market.ts, plus legacy monthly-turn.ts.
- Inputs: immutable prior state, typed command, persisted tax evidence, configuration/catalog snapshot, and serialized RNG state.
- Outputs: finalized next state, balanced ledger transactions, monthly record, outcome, scheduled interruptions, and updated RNG.
- State owned: no external mutable state; it transforms the game aggregate. Financial account balances are reconciled against the ledger.
- Dependencies: money/rate primitives, market/macro, insurance, goals/outcomes, event/milestone systems, ledger, and tax-evidence contracts.
- Tests found: monthly turns v1/v2 with fixed checksums, payroll, debt, obligation funding, insurance, recurring strategy, detailed actions, market, outcomes, and repository application tests.
- Determinism/performance risks: no Math.random, clock, network, database, or AI dependency was found in core finance. The risk is repeated whole-state validation/serialization and the absence of a long-run benchmark.
- Missing requirements: one engine version, an explicit no-events projection interface for counterfactuals and UI forecasts, centralized formula ownership, and 480-month deterministic/performance fixtures.
- Duplicate formulas or authority: monthly-turn v1/v2; automatic liquidity and minimum-gross-liquidation logic appears in outcomes.ts and obligation-funding-v2.ts.
- AI boundary: financial computation correctly excludes AI.
- Next action: Prompt 02 should consolidate the v2 engine interface, centralize repeated liquidity formulas, and expose deterministic projection/replay APIs without changing outcomes.

### 5. Player Actions and Persistent Policies

Status: duplicated.

- Authoritative files and entry points: src/core/actions.ts, detailed-actions-v2.ts and support modules, recurring-strategy-v2.ts, life-milestones-v2.ts, command contracts/mappers, and play action-builder/decision panels.
- Inputs: typed one-time action or policy change, current state, command/revision identity, and any selected milestone/event choice.
- Outputs: ledger-backed transfers and debt/investment changes, updated recurring allocation policy, lifestyle obligations, career state, or milestone lifecycle state.
- State owned: recurring strategy, career/progression, insurance decisions, detailed debts/assets, lifestyle cost, milestone choices, and action-derived ledger history.
- Dependencies: state/ledger, finance primitives, debt/payroll/insurance modules, validation contracts, and UI builders.
- Tests found: actions, detailed actions, recurring strategy, debt service, payroll, insurance, milestones, command mapping, and API service tests.
- Determinism/performance risks: actions are deterministic after validation. The principal risk is semantic drift across v1 take_action and v2 detailed command families.
- Missing requirements: one action taxonomy, one policy interface, explicit affordability/effect previews derived from core formulas, and retirement of alternate v1 mutations.
- Duplicate formulas or authority: v1 actions and v2 detailed actions both mutate finance; some UI previews reconstruct values rather than call selectors.
- AI boundary: AI must not create or execute financial actions without typed player confirmation; current authoritative actions remain code-driven.
- Next action: Prompt 05 after Prompts 01-04.

### 6. Goals, End Conditions, and Grading

Status: duplicated.

- Authoritative files and entry points: src/core/financial-goals-v2.ts, src/core/outcomes.ts, outcome checks in monthly-turn-v2.ts, legacy hasReachedFinancialIndependence in game-state.ts, onboarding goal fields, and debrief display.
- Inputs: player-selected FI target/age or legacy living-cost target, investable assets, age/current month, required obligations, and available automatic liquidity.
- Outputs: progress projection, terminal FI/retirement/bankruptcy outcome, immutable grade, reason code, and reached month.
- State owned: financialGoal and terminal outcome on the run aggregate.
- Dependencies: financial snapshot, investable-asset selector, liquidity assessment, calendar, onboarding, checkpoint/debrief.
- Tests found: financial-goals-v2, outcomes boundary tests, game-state FI tests, monthly-turn bankruptcy/FI tests, and API contract tests.
- Determinism/performance risks: exact integer comparisons are deterministic; alternate target definitions can drift when both paths remain callable.
- Missing requirements: one goal definition for all versions and displays, a single age/net-worth/goal selector surface, and counterfactual grading evidence for debrief.
- Duplicate formulas or authority: legacy 25-times-living-cost helper versus player-selected v2 goal projection; net worth is separately reimplemented in play-model.ts and server/ai/game-context.ts; age is also recomputed in UI.
- AI boundary: the final grade is immutable and code-owned, which is correct; AI may explain but not alter it.
- Next action: Prompt 04 should make goal/outcome selectors the only UI and AI context source.

### 7. Risk and Resilience Analyzer

Status: incorrectly coupled.

- Authoritative files and entry points: src/core/exposure-v2.ts and its call sites in monthly-turn-v2.ts and event-scheduler-v2.ts.
- Inputs: emergency fund, debt-to-income, credit utilization, insurance gap, asset concentration, and job/macro correlation.
- Outputs: component scores, weighted exposure score, demonstrated weakness signals, and stored exposure snapshot/history.
- State owned: current exposure and exposure history inside v2 gameplay state.
- Dependencies: financial state, detailed debts/assets, insurance, career, macro regime, and event scheduler.
- Tests found: exposure-v2 tests and scheduler tests using exposure eligibility.
- Determinism/performance risks: calculation is deterministic and bounded. The design risk is causal: the score is consumed as an event generator rather than a damage/resilience measure.
- Missing requirements: measurement-only contract, separately named vulnerability versus incident-probability inputs, impact-estimation API, and evidence that improving resilience reduces loss without suppressing unrelated event incidence.
- Duplicate formulas or authority: no major duplicate risk formula found; the error is ownership at the scheduler boundary.
- AI boundary: AI may receive exposure signals for explanation/ranking, but must not reinterpret them as permission to invent incidents.
- Next action: Prompt 06 must decouple vulnerability from event cause before Prompt 08 changes event behavior.

### 8. Macro and Market System

Status: complete.

- Authoritative files and entry points: src/core/market.ts, src/core/macro-story-v2.ts, shared RNG/config types, and monthly-turn-v2.ts.
- Inputs: prior macro regime, portfolio/assets, active macro story, explicit configuration, current month, and serialized RNG.
- Outputs: bounded market returns, regime transition, asset repricing, optional time-bounded macro modifiers/story, and updated RNG.
- State owned: market/macro regime and active story in the run aggregate.
- Dependencies: shared RNG, rates/money, asset model, event template definitions for macro stories, and monthly engine.
- Tests found: market fixed-seed/long-path tests, macro-story tests, monthly-turn checksums, and state validation tests.
- Determinism/performance risks: draw order is explicit and RNG state is persisted. Configuration needs long-horizon statistical tests, not just path correctness.
- Missing requirements: difficulty-profile inputs, documented calibration targets, matched-seed distributions, and a boundary separating macro-story metadata from the personal-event lifecycle.
- Duplicate formulas or authority: no duplicate market return engine found.
- AI boundary: macro generation is code-owned; optional AI does not set market returns.
- Next action: Prompt 07, followed by Prompt 14 for calibration proof.

### 9. Personal Event and Trap System

Status: incorrectly coupled.

- Authoritative files and entry points: src/data/event-templates.ts, src/core/event-scheduler-v2.ts, event-lifecycle-v2.ts, events.ts, ai-world-event-v2.ts, monthly-turn-v2.ts, and event choice UI.
- Inputs: current state, exposure weaknesses/score, cooldown history, active/pending events, RNG, template bounds, player choice, and optional AI candidate.
- Outputs: pending event, sampled parameters, resolved exact choice effect, event history, cooldown, changed obligations/wellbeing/macro modifiers, and subsequent ledger-funded impact.
- State owned: pending event, active macro event, event history, family recency/cooldowns, and choice resolution evidence.
- Dependencies: exposure, RNG, insurance adjudication, financial plan fields, monthly engine, template catalog, UI, and optional director.
- Tests found: templates, scheduler eligibility/cooldown, lifecycle, event effects, AI candidate validation, monthly interruption, and repository event-command tests.
- Determinism/performance risks: seeded code path is deterministic and parameters are bounded. However, exposure controls eligibility, chance, and catastrophe access; the optional AI request can choose parameter values within bounds.
- Missing requirements: cause-independent incident eligibility, separate base hazard/frequency from severity, difficulty input, runtime fairness approval, pressure/recovery controls, impact estimates, catastrophe budget, lesson coverage, and immediate causal links to exact ledger/effect records.
- Duplicate formulas or authority: events.ts directly mutates plan obligations/wellbeing/macro values; finance later turns obligations into ledger activity, so exact effect ownership spans two systems.
- AI boundary: core revalidates template IDs and bounds, but AI is allowed more than ranking; it can choose the final candidate and numeric parameter values.
- Next action: Prompt 08 after Prompt 06, then integrate with Prompt 09 before enabling adaptive insertion.

### 10. Adaptive Scenario Director

Status: incorrectly coupled.

- Authoritative files and entry points: src/server/ai/world-director-service.ts, world-director contracts, src/core/ai-world-event-v2.ts, AI API route, and world-director UI.
- Inputs: eligible template summaries, weakness signals, recent history, run/month/revision identity, and AI response or deterministic hash fallback.
- Outputs: one selected candidate with bounded parameters and a queued event command.
- State owned: no independent director state; accepted output becomes normal event lifecycle state and accepted-command history.
- Dependencies: event scheduler eligibility, event templates, AI transport/privacy/audit, repository command application, and UI.
- Tests found: world-director service, contracts, AI-world-event validation, transport/fallback, and repository queue-command tests.
- Determinism/performance risks: the fallback is deterministic; a fresh AI call is not inherently replayable, but the accepted candidate/parameters are persisted as a command. Replaying accepted commands is deterministic.
- Missing requirements: candidate scoring/ranking interface, deterministic tie-break contract, director memory/lesson coverage, rank-only AI response, and mandatory Runtime Balance Controller approval.
- Duplicate formulas or authority: seeded core scheduler selects uniformly while the optional director selects separately; two selection policies exist.
- AI boundary: AI cannot exceed template bounds or bypass current eligibility validation, but it may select parameters and the service directly queues the result. This exceeds the intended advisory/ranking role.
- Next action: implement Prompt 09 first; Prompt 10 should then reduce the director to ranked proposals consumed by the deterministic controller.

### 11. Runtime Balance Controller

Status: missing.

- Authoritative files and entry points: none. Cooldown, recent-family suppression, pending-event guards, and one-active-story guards live inside event-scheduler-v2.ts and macro-story-v2.ts.
- Inputs required but absent: proposed event, predicted impact, recent pressure, recovery state, catastrophe count, difficulty profile, lesson coverage, upcoming obligations/milestones, and player resilience.
- Outputs required but absent: approve/reject/defer decision with stable reason code and updated pressure/recovery state.
- State owned: none today. A future controller should own pressure budget, recovery window, catastrophe budget, difficulty parameters, and fairness history—not event causality or financial formulas.
- Dependencies: risk impact estimator, event proposal interface, goals/time, causal history, difficulty configuration, and RNG only for deterministic tie-breaking if necessary.
- Tests found: scheduler cooldown tests only; these do not prove runtime balance.
- Determinism/performance risks: without one controller, fairness policy is scattered and difficult to replay or calibrate.
- Missing requirements: the complete controller, deterministic approval order, difficulty profiles, recovery/pressure accounting, catastrophe caps, lesson coverage, impact estimator, reason-coded audit trail, and matched-seed tests.
- Duplicate formulas or authority: fairness fragments are embedded in schedulers.
- AI boundary: AI must never approve its own proposal.
- Next action: Prompt 09 after exposure/event interfaces are separated, before Prompt 10.

### 12. Causal History and Counterfactuals

Status: partial.

- Authoritative files and entry points: accepted commands and snapshots in the repository, ledger transaction/posting records, monthly records, event and milestone histories, checksums, checkpoint query, and debrief evidence assembly.
- Inputs: command/revision chain, prior/current snapshots, ledger entries, external evidence, event/milestone outcomes, and selected comparison variable.
- Outputs today: chronological audit records and aggregates. Required future outputs are direct/contributing cause links, turning points, and baseline-versus-alternative deltas.
- State owned: evidence is distributed across run state and normalized database tables; there is no causal model or counterfactual record type.
- Dependencies: authoritative state/ledger, deterministic engine, time controller, goal/outcome evaluation, and stable command/effect identifiers.
- Tests found: canonical replay, command replay, snapshot checksum, repository idempotency/concurrency/migration, checkpoint aggregation, and debrief contract tests.
- Determinism/performance risks: deterministic replay is feasible when the initial state, exact commands/IDs, evidence, and RNG state are fixed. Loading and comparing full snapshots may be expensive for long runs.
- Missing requirements: causal-link schema, direct versus contributing cause rules, turning-point detector, branch/replay service, one-variable intervention contract, and explanation-ready evidence bundles.
- Duplicate formulas or authority: debrief currently infers importance from recent events/milestones rather than a causal authority.
- AI boundary: AI may phrase a validated causal bundle; it must not infer unsupported causes or generate counterfactual numbers.
- Next action: Prompt 11 after core/time/action stability.

### 13. Teaching, Checkpoints, and Debrief

Status: partial.

- Authoritative files and entry points: src/core/checkpoint-v2.ts, checkpoint API/repository query, src/data/education-content.ts, education service/contracts, debrief service/contracts, and play checkpoint/debrief panels.
- Inputs: bounded monthly interval, start/end snapshots, monthly records, ledger/event/milestone evidence, grade/outcome, content catalog, and optional AI request.
- Outputs: exact checkpoint aggregates, deterministic educational fallback or AI explanation, immutable-grade debrief, decisions/lessons, and bounded evidence references.
- State owned: gameplay outcome remains in core; educational content and AI learning memory are separate. Explanations do not own financial truth.
- Dependencies: repository evidence, selectors, goal/outcome system, causal history, content catalog, AI privacy/audit/transport, and UI.
- Tests found: checkpoint aggregation, education catalog/service, debrief service/contracts, AI learning memory, API route/service, and repository checkpoint tests.
- Determinism/performance risks: core checkpoint math and fallbacks are deterministic. Current debrief evidence selection is shallow, and AI text is structurally validated but not a numerical proof system.
- Missing requirements: causal turning points, controlled counterfactual comparisons, traceable amount/rate citations, lesson selection based on demonstrated decisions, and end-to-end evidence-link validation.
- Duplicate formulas or authority: AI context independently calculates net worth instead of consuming the core selector.
- AI boundary: AI correctly cannot alter the grade or state, but prose claims need stronger grounding than valid evidence IDs alone.
- Next action: Prompt 12 after Prompt 11; also replace duplicated AI/UI selectors during Prompt 04.

### 14. Offline Balance Lab

Status: missing.

- Authoritative files and entry points: none found.
- Inputs required: versioned scenario catalog, difficulty profile, seed set, deterministic strategy bots, horizon, engine configuration, and optional event/director policy variants.
- Outputs required: terminal outcome distributions, FI timing, bankruptcy rate, event frequency/severity, pressure/recovery metrics, strategy sensitivity, invariants, and performance measurements.
- State owned: offline run specifications and reports only; it must not become production simulation authority.
- Dependencies: stable engine, time controller, goals, actions/policies, risk, macro, events, balance controller, and causal metrics.
- Tests found: isolated deterministic/long-path tests exist, but no lab, matched-seed comparison, strategy bot, or 480-month performance suite exists.
- Determinism/performance risks: current per-command full-state freezing/checksumming/snapshotting is a likely blocker if the lab uses the production persistence path. The lab needs an in-memory headless path plus explicit parity checks.
- Missing requirements: all primary lab capabilities.
- Duplicate formulas or authority: none because the system is absent; future bots must use public action interfaces rather than reimplement finance.
- AI boundary: no AI is needed for balance truth or numeric tuning.
- Next action: Prompt 14 after the runtime systems stabilize, then use its reports as a release gate in Prompt 15.

## Actual event pipeline

~~~mermaid
flowchart TD
    MONTH["Monthly turn reaches exposure/event stage"] --> EXPOSURE["Calculate exposure and demonstrated weaknesses"]
    EXPOSURE --> ELIGIBLE["Filter templates by weakness, cooldown, family recency, pending state, and catastrophe threshold"]
    ELIGIBLE --> HAZARD["Exposure-scaled monthly chance: 12% to 35%"]
    HAZARD -->|miss| NONE["No personal event"]
    HAZARD -->|hit| SELECT["Seeded uniform selection from sorted candidates"]
    SELECT --> SAMPLE["Seeded parameter sampling inside template bounds"]
    SAMPLE --> QUEUE["Queue pending event and stop progression"]
    OPTIONAL["Optional world-director request"] --> AISELECT["AI or deterministic fallback selects candidate; AI may choose bounded parameters"]
    AISELECT --> VALIDATE["Core revalidates current eligibility and bounds"]
    VALIDATE --> QUEUE
    QUEUE --> CHOICE["Player submits resolve-event-choice command"]
    CHOICE --> EFFECT["Template choice applies exact state deltas; medical choice may run insurance adjudication"]
    EFFECT --> HISTORY["Append event history and cooldown"]
    EFFECT --> NEXTMONTH["Added obligations are funded by the next monthly financial turn and ledger"]
    HISTORY --> TEACH["Checkpoint/debrief may later include recent event evidence"]
~~~

### Stage ownership and gaps

| Stage | Actual owner | Actual behavior | Audit result |
| --- | --- | --- | --- |
| Eligibility | event-scheduler-v2.ts | Requires a template to target a demonstrated exposure weakness; applies cooldown/family/pending filters and catastrophe threshold. | Incorrect: vulnerability becomes incident cause. |
| Hazard/frequency | event-scheduler-v2.ts | Monthly chance rises from about 12% to 35% with the general exposure score. | Incorrect: weak finances create more bad luck. |
| Ranking | None in automatic path; world director in optional path | Automatic path uniformly selects a sorted eligible candidate. Optional AI/fallback chooses one candidate. | Missing deterministic ranking policy; duplicated selection policy. |
| Fairness approval | None | Cooldown and family recency are the only fairness-like checks. | Missing balance-controller approval. |
| Parameter sampling | scheduler or optional AI | Core uses seeded bounded sampling; AI may return bounded parameter values. | Core path is sound; AI should rank, not choose final amounts. |
| Choice handling | event-lifecycle-v2.ts | Validates pending event and choice, adjudicates special insurance case, applies template, records history/cooldown. | Deterministic and bounded. |
| Exact financial effect | events.ts, then later monthly finance | Choice changes required obligations/annual cost/wellbeing or macro modifiers; obligations later flow through funding and ledger. | Split ownership obscures immediate causal transaction. |
| Causal logging | event history, accepted command, snapshot, later ledger/monthly records | IDs and values are persisted, but no explicit link joins event choice to every resulting financial posting. | Partial evidence; causal link missing. |
| Teaching/debrief | checkpoint/debrief services | Recent event evidence can be shown after the fact. | No turning-point or counterfactual grounding. |

## Probability, severity, exposure, and difficulty audit

### Current mixing

- Exposure is a weighted vulnerability score derived from emergency reserves, debt-to-income, credit utilization, insurance gap, concentration, and job/macro correlation.
- Demonstrated weaknesses gate event-template eligibility. A resilient player with no matching weakness can receive no personal event from the automatic scheduler.
- The general exposure score raises monthly personal-event probability.
- The same score unlocks catastrophe-tier templates at a threshold.
- Within an eligible template, the core samples parameter magnitude from fixed bounds; the optional AI path can select a bounded value.
- No difficulty profile participates in event cause, frequency, severity, balance, or recovery.

### Consequence

The implementation currently mixes four separate concepts:

1. Incident cause: whether a layoff, illness, repair, rent increase, social obligation, or equipment failure occurs.
2. Hazard/frequency: how often incidents arrive.
3. Vulnerability/exposure: how severely the player is affected after an incident.
4. Difficulty/fairness: how much pressure the game intentionally permits over time.

That mixing violates the desired causal model. A general risk score should not make unrelated bad luck occur. Low emergency savings should increase the damage and recovery time from an independently caused repair; it should not be the reason a repair or social expense becomes eligible.

### Required separation

- Base incident hazard belongs to the event or macro system and should be scenario/difficulty configurable.
- Event cause eligibility should depend on facts causally related to that event, not a general vulnerability score.
- Exposure should feed impact estimation, mitigation, insurer share, liquidity strain, wellbeing loss, and recovery time.
- Difficulty and fairness should be consumed by the Runtime Balance Controller, which approves, defers, or rejects proposed events.
- Severity parameters should be sampled by deterministic core code from versioned configuration after approval.
- The director may rank eligible proposals but must not create unrestricted parameters or approve its own proposal.

## Save/load and seeded replay audit

### What is proven

- Persisted state is version-decoded, validated, and finalized.
- RNG algorithm/state is serialized; no Math.random usage was found in the deterministic core.
- Market, macro, and event draws use the shared persisted RNG in explicit order.
- Canonical state checksums detect drift.
- Accepted commands are idempotent and revision-checked.
- State snapshots, ledger rows, monthly records, tax evidence, and command payloads are persisted transactionally.
- Tax evidence is resolved outside the core and can be reused on retry/replay.
- Tests cover fixed-checksum monthly transitions, command replay, market long paths, repository rollback/concurrency/idempotency, and version migration.

### Replay boundary

Exact replay requires:

- the same exact initial state, including run/player identifiers and RNG state;
- the same ordered command payloads and command IDs;
- the same catalog/config version;
- the same external evidence, especially tax evidence; and
- the same reducer version or an explicit migration boundary.

Creating semantically equivalent commands with new UUIDs is not checksum-identical because IDs are used in accepted-command, event, and ledger identities. This is acceptable if documented: command identity is part of the replay record, not incidental metadata.

An AI request is not itself deterministic. Once the selected candidate and parameters are accepted as a typed command, replay is deterministic because that command is persisted. Re-running the AI request may yield a different proposal and must not be treated as replay.

### Remaining gaps

- No repository-level golden replay covers a full v2 life from onboarding through terminal outcome.
- No parity test compares sequential one-month commands with an in-process AdvanceNMonths controller.
- No long-run replay/performance budget exists.
- Snapshot/ledger compaction and migration behavior over hundreds of months is unproven.

## Formula and authority duplication

| Concept | Intended authority | Other implementation found | Risk |
| --- | --- | --- | --- |
| Net worth | src/core/game-state.ts calculateNetWorth | src/features/play/play-model.ts and src/server/ai/game-context.ts | UI or AI explanation can drift from core truth. |
| Age | src/core/outcomes.ts calculateAgeYears | UI calculation | Pause/end/display boundaries can disagree. |
| Salary bounds | core scenario catalog using money/rate primitives | onboarding-model floating multiplication | Rounding or validation preview mismatch. |
| FI target/progress | financial-goals-v2.ts and outcomes.ts | legacy hasReachedFinancialIndependence | Player-selected goal and legacy 25x rule can diverge. |
| Automatic liquidity and gross liquidation | shared finance concept | outcomes.ts and obligation-funding-v2.ts | Bankruptcy assessment and actual funding can drift. |
| Monthly simulation | v2 engine | v1 monthly-turn.ts | Two engines require duplicate fixes and fixtures. |
| Multi-month control | future v2 controller | v1 checkpoints.ts and v2 browser loop | Different stop rules and performance behavior. |
| Event selection | deterministic scheduler/controller | seeded uniform scheduler and optional director | Different candidate policies; neither has fairness approval. |

No AI-owned exact financial formula was found. The AI game-context adapter nevertheless recomputes net worth instead of consuming the authoritative core selector.

## AI authority audit

| AI capability | Current authority | Finding |
| --- | --- | --- |
| World-event director | Chooses one currently eligible template and may choose values within fixed bounds; core validates before queueing. | Bounded but too authoritative. Restrict to ranked IDs/reasons; core samples values and balance controller approves. |
| Education | Produces explanatory content from bounded context with deterministic fallback. | Appropriate if all amounts/rates are supplied facts and citations are validated. |
| Debrief | Explains an immutable code-owned grade from bounded evidence. | Appropriate boundary, but causal evidence is currently too shallow and prose-number grounding needs stronger checks. |
| Financial calculation | None intended. | Correct. Keep tax, returns, event effects, grading, and ledger code-owned. |

## Performance and persistence risks

1. Game state embeds the complete append-only ledger plus growing exposure, event, milestone, and learning histories.
2. Each transition validates and recursively freezes that graph.
3. Canonical checksum generation serializes the full graph.
4. Each accepted command stores a full state snapshot.
5. Ledger transactions/postings and monthly records are also stored in normalized tables.
6. The v2 browser fast-forward performs one request/transaction per month.

This is not evidence of a current user-visible failure, but it is a high-confidence scaling risk. Prompt 01 should define compact authoritative state versus audit history; Prompt 03 should add an in-process application loop; Prompt 14 should enforce 120- and 480-month time/size budgets.

## Dependency-aware implementation order

The prompt numbers below refer to the prompt pack in .codex/AGENTS.md.

1. Prompt 01 — Authoritative Game State and Ledger. Establish one mutable state version, one ledger/formula authority, and a bounded persistence/snapshot policy.
2. Prompt 13 — Onboarding and State Initialization. Create only the canonical state and persist normalized assumptions/provenance.
3. Prompt 02 — Deterministic Financial Simulation Engine. Consolidate repeated finance formulas and define projection/replay interfaces.
4. Prompt 03 — Time and Turn Controller. Add one in-process v2 controller with tagged stop reasons and sequential-parity tests.
5. Prompt 04 — Goals, End Conditions, and Grading. Centralize goal, age, net-worth, outcome, and display selectors.
6. Prompt 05 — Player Actions and Persistent Policies. Route all mutations and previews through the canonical engine/state interfaces.
7. Prompt 06 — Risk and Resilience Analyzer. Make exposure measurement-only and add an impact-estimation contract.
8. Prompt 07 — Macro and Market System. Add explicit difficulty/calibration inputs without weakening deterministic draw order.
9. Prompt 08 — Personal Event and Trap System. Separate event cause/hazard from vulnerability and route exact effects through typed financial interfaces.
10. Prompt 09 — Runtime Balance Controller. Add deterministic approve/reject/defer policy, pressure/recovery state, catastrophe limits, and difficulty.
11. Prompt 10 — Adaptive Scenario Director / Hostile Fed. Make the director ranking-only and subordinate every proposal to core sampling and balance approval.
12. Prompt 11 — Causal History and Counterfactuals. Link commands/events to exact effects, detect turning points, and replay one-variable alternatives.
13. Prompt 12 — Teaching, Checkpoints, and Debrief. Build explanations exclusively from validated causal/counterfactual evidence.
14. Prompt 14 — Offline Balance Lab. Add matched-seed bots, distributional balance reports, invariant checks, and 480-month performance gates.
15. Prompt 15 — Final integration and regression audit. Prove cross-system invariants after all targeted repairs.

Prompts 06, 08, 09, and 10 must remain ordered. Changing the director before separating risk/event causality and adding independent fairness approval would preserve the central architectural defect behind a different API.

## Recommended immediate next prompts

1. Prompt 01 first, because all subsequent work depends on one state, ledger, replay, and persistence authority.
2. Prompt 06 followed by Prompt 08, because the current exposure-to-event coupling changes game causality and player fairness.
3. Prompt 09 before Prompt 10, because the director currently has no independent approval gate.
4. Prompt 03 before large-scale balance work, because the browser/network month loop prevents a clean headless long-run path.
5. Prompt 14 before final tuning or release claims, because deterministic correctness alone does not prove distributional fairness or acceptable long-run performance.

## Audit completion checklist

- All fourteen requested systems are mapped with status, authority, inputs, outputs, owned state, dependencies, tests, risks, missing requirements, duplicate/AI authority, and next action.
- The actual event pipeline identifies eligibility, hazard, selection/ranking, fairness approval, parameter sampling, choice handling, exact effect, causal logging, and teaching/debrief.
- Probability, severity, exposure, and difficulty are analyzed separately.
- Save/load, external evidence, seeded replay, and command-identity boundaries are documented.
- Duplicate formulas and dual-version authorities are identified.
- No production code was modified.
