# Repository-wide system audit

Date: 2026-07-16

Scope: current repository behavior, with emphasis on the v2 browser game, server application layer, deterministic core, persistence, tax adapter, and optional AI adapters. The original audit was read-only; this document now includes the verified Prompt 01 authority, ledger, replay, and migration repair.
It also includes the verified Prompt 02 financial-kernel, replay, projection, integration, and consumer-authority repair.

## Status legend

| Status | Meaning |
| --- | --- |
| complete | One clear authority exists and the inspected requirements are substantially implemented and tested. |
| partial | Useful implementation exists, but one or more required capabilities or proof points are absent. |
| missing | No substantive implementation was found. |
| duplicated | More than one live or reusable implementation owns the same decision or formula. |
| incorrectly coupled | The capability exists, but it owns decisions or dependencies that belong in another system. |

## Executive findings

1. The `2.0.0` financial kernel is now the sole new-product financial authority: money is integer cents, rates are PPM, market input is complete and seeded, tax enters as persisted evidence, one funding plan owns liquidity, and event-free projection reuses the production kernel. Web, AI, goal, and checkpoint consumers use canonical selectors/evidence.
2. GameStateV2 is the sole mutable gameplay authority. Public v1 creation and command submission return HTTP 410 without mutation; authenticated v1 reads and deterministic migration remain for old saves. Unversioned/`legacy-4.1.0` monthly formulas are private frozen replay compatibility, not a competing new-product engine. Legacy action interfaces still belong to Prompt 05.
3. Personal-event causality is wrong for the intended simulation. Exposure weaknesses decide which bad events may occur, the exposure score raises monthly event chance, and the same score unlocks catastrophe-tier templates. A weak emergency fund can therefore make bad luck more available and more frequent, rather than only making an independently caused shock more damaging.
4. There is no Runtime Balance Controller. Cooldowns and recency checks exist inside the scheduler, but there is no independent fairness approval, pressure budget, recovery window, catastrophe limit, difficulty profile, lesson coverage check, or impact estimator.
5. The Adaptive Scenario Director is not a ranking-only layer. The optional AI path selects a candidate and parameter values within core bounds, and the service queues that event directly after validation. There is no balance-controller approval between selection and insertion.
6. Time advancement is split. A tested v1 in-process checkpoint loop exists but is not used by production. The v2 UI advances multiple months through sequential network/database commands, so there is no authoritative v2 controller with tagged pause reasons.
7. Persistence is robust but may not scale linearly. The event-free financial projection now has a measured 480-month gate and immutable-prefix fast path, but real Web progression still validates, checksums, and persists growing current state once per month. Full controller/database/storage long-run budgets remain open.
8. Causal evidence is rich enough to build on, but causal analysis is not implemented. Commands, revisions, checksums, ledger entries, monthly records, event history, and milestones are persisted; direct/contributing cause links, turning points, and counterfactual replay are absent.
9. The Offline Balance Lab is missing. A deterministic 480-month financial projection benchmark now exists, but there is no matched-seed strategy runner, difficulty comparison, bot set, or distributional balance report.

## Actual architecture

### Primary v2 command path

~~~mermaid
flowchart LR
    UI["Next.js play UI"] --> ROUTE["Versioned API route"]
    ROUTE --> SERVICE["RunApiServiceV2"]
    SERVICE --> TAX["Resolve or reuse tax evidence"]
    SERVICE --> REPO["RunRepository transaction"]
    REPO --> LOCK["Lock run and verify auth, revision, checksum, idempotency"]
    LOCK --> REDUCE["Versioned reducer dispatcher"]
    REDUCE --> KERNEL["2.0.0 financial kernel"]
    REDUCE --> LEGACY["Private legacy replay adapter"]
    KERNEL --> WRAP["Career, exposure, outcome, macro, event wrapper"]
    LEGACY --> WRAP
    WRAP --> FINALIZE["Validate and deep-freeze state"]
    FINALIZE --> PERSIST["Current save, sparse boundary anchors, accepted command, evidence, ledger rows, outbox"]
    PERSIST --> RESPONSE["Versioned API response"]
~~~

The financial reducer does not call the network or database. The application service obtains or reuses external tax evidence before entering the core and stamps every new Web month `2.0.0`. The repository is the transactional authority for accepted commands, exact evidence, records, checksums, and persisted revisions.

### Legacy compatibility path

GameState remains a valid persisted input for authenticated inspection and deterministic migration, but public v1 writes are retired. `POST /api/v1/runs` and `POST /api/v1/runs/{runId}/commands` return `STATE_SCHEMA_DEPRECATED`; `POST /api/v2/runs/{runId}/migrate` authenticates and atomically upgrades an old save. The v1 monthly reducer, v1 outcome/checkpoint formulas, and the module-private `legacy-4.1.0` reducer are frozen compatibility paths covered by fixed replay checksums. They are not available as alternate new-product financial entry points. Legacy action interfaces remain for Prompt 05.

### External and optional services

- Tax: src/server/tax/client.ts may call PolicyEngine; resolved evidence is persisted and supplied to the deterministic reducer. Prompt 02 tests mock this remote boundary only; core/replay integrations use real local modules and persisted evidence.
- World director: src/server/ai/world-director-service.ts may call an AI model or use a deterministic fallback, then submits a validated event-queue command.
- Education and debrief: AI services produce bounded explanatory content with deterministic fallbacks; they do not directly mutate financial state.
- Database: src/server/db/run-repository.ts owns transactionality, optimistic revision checks, idempotency, the current save, sparse historical anchors, verified replay, normalized ledger persistence, migrations, and outbox writes.

## System matrix

| # | System | Status | Current authority | Principal finding | Next prompt |
| --- | --- | --- | --- | --- | --- |
| 1 | Onboarding and State Initialization | duplicated | Onboarding UI/model, scenario catalog, native v2 state factory, legacy compatibility constructor | v2 is the only public creation path, but legacy construction remains for migration fixtures and the UI repeats salary math. | Prompt 13 |
| 2 | Authoritative Game State and Ledger | complete | state-authority-v2.ts, game-state-v2.ts, ledger.ts, repository/replay modules | GameStateV2 is the sole mutable gameplay authority; v1 is decode/migrate/read-only; current state is the save authority and sparse verified anchors support historical reconstruction. | Complete in Prompt 01 |
| 3 | Time and Turn Controller | incorrectly coupled | v2 play-console loop; dormant v1 checkpoints.ts | Multi-month control is in the browser and crosses API/DB once per month; no v2 tagged controller. | Prompt 03 |
| 4 | Deterministic Financial Simulation Engine | complete | financial-kernel-v2.ts, financial-transition-v2.ts, obligation-funding-v2.ts, financial-projection-v2.ts, versioned monthly wrapper | New months, projections, Web/AI/goal/checkpoint consumers, and replay have one documented financial authority; old formulas are frozen compatibility only. | Complete in Prompt 02 |
| 5 | Player Actions and Persistent Policies | duplicated | actions.ts and detailed/recurring v2 modules | v2 has broad, ledger-backed actions and persistent strategies; legacy v1 action reducers remain reusable compatibility code. | Prompt 05 |
| 6 | Goals, End Conditions, and Grading | partial | financial-goals-v2.ts and evaluateTerminalOutcomeV2 | v2 goal consumers share canonical selectors and bankruptcy consumes actual shortfall; the full Prompt 04 outcome/grade audit remains pending. Frozen v1 rules are replay compatibility. | Prompt 04 |
| 7 | Risk and Resilience Analyzer | incorrectly coupled | exposure-v2.ts and event-scheduler-v2.ts | Exposure measures vulnerability but also causes event eligibility, frequency, and catastrophe access. | Prompt 06 |
| 8 | Macro and Market System | complete | market.ts and macro-story-v2.ts | Seeded, bounded, ordered, and tested; difficulty and balance integration remain future work. | Prompt 07 |
| 9 | Personal Event and Trap System | incorrectly coupled | event scheduler, lifecycle, templates, and events.ts | Deterministic and bounded, but event cause is vulnerability-driven and financial effects bypass a dedicated financial-effect interface. | Prompt 08 after Prompt 06 |
| 10 | Adaptive Scenario Director | incorrectly coupled | world-director-service.ts and ai-world-event-v2.ts | AI selects an event and parameter values, then the service queues it without an independent fairness gate. | Prompt 10 after Prompt 09 |
| 11 | Runtime Balance Controller | missing | None; scheduler contains fragments | Cooldown is not a balance controller. No pressure, recovery, catastrophe, difficulty, or impact policy exists. | Prompt 09 |
| 12 | Causal History and Counterfactuals | partial | commands, snapshots, ledger, monthly records, event/milestone histories | Evidence exists, but no causal graph, turning-point detector, or controlled replay comparison exists. | Prompt 11 |
| 13 | Teaching, Checkpoints, and Debrief | partial | checkpoint-v2.ts, education service, debrief service | Checkpoint aggregation and fallbacks are good; explanations do not yet rest on causal/counterfactual evidence. | Prompt 12 after Prompt 11 |
| 14 | Offline Balance Lab | missing | None | The financial projection has a 480-month performance gate, but there is no matched-seed lab, strategy bots, or balance report. | Prompt 14 |

## Detailed system maps

### 1. Onboarding and State Initialization

Status: duplicated.

- Authoritative files and entry points: src/features/play/onboarding-model.ts, onboarding form components, src/data/scenario-catalog.ts, src/core/scenario-catalog.ts, src/core/native-game-state-v2.ts, RunApiServiceV2.createRun, and the v2 run-creation route. The v1 constructor remains for decoding/migration compatibility, not public creation.
- Inputs: preset, catalog career and region, salary point, benefits, health and household fields, assets, liabilities, goal target/age, seed, and request identifiers.
- Outputs: immutable catalog snapshot plus a reconciled initial state with player, finances, goal, insurance, career, recurring strategy, ledger, RNG state, and revision metadata.
- State owned: the UI owns only draft form state; the created run owns authoritative scenario assumptions and financial opening balances. The repository owns run identity and persistence.
- Dependencies: scenario catalog, branded money/rate types, ledger construction, state validation, API contracts, and database repository.
- Tests found: onboarding-model, play-model, scenario-catalog, native-game-state-v2, API service, and repository integration tests.
- Determinism/performance risks: the start month is hard-coded in the browser flow; new run/player/command UUIDs are intentionally replay-relevant identifiers; UI salary bounds use floating multiplication rather than the core money/rate helper.
- Missing requirements: a single versioned creation contract, explicit persisted assumption/provenance records for every repaired/defaulted input, and an onboarding replay fixture independent of browser-generated IDs.
- Duplicate formulas or authority: the public create path is v2-only, but legacy construction remains for compatibility and salary range projection is repeated in UI and core.
- AI boundary: no AI is needed for authoritative initialization. If free-text intake is added, AI output must remain a proposal validated and normalized by this system.
- Next action: Prompt 13 should make one catalog-backed initializer and remove UI-owned financial formulas.

### 2. Authoritative Game State and Ledger

Status: complete.

- Authoritative files and entry points: src/core/state-authority-v2.ts, src/core/game-state-v2.ts, src/core/state-transition-v2.ts, src/core/ledger.ts, canonical serialization/decoder modules, src/server/db/run-repository.ts, run-repository-read.ts, run-state-replay-v2.ts, snapshot-policy-v2.ts, and database schema/migrations.
- Inputs: initial state or prior persisted revision, validated command, external evidence, and deterministic reducer output.
- Outputs: finalized authoritative state, canonical checksum, balanced ledger, current save, sparse boundary anchors, accepted command, normalized transaction/posting rows, monthly record, and outbox message.
- State owned: GameStateV2 owns player identity, calendar, finances, detailed gameplay state, outcome, RNG, immutable ledger, revision, histories, Runtime Balance storage, and catalog snapshot. `game_runs.current_state` is the current save authority; accepted commands, sparse snapshots, and migration targets provide replay evidence.
- Dependencies: branded primitives, canonical serializer, validators, reducer dispatch, Drizzle/Postgres, tax-evidence schema, and outbox.
- Tests found: authoritative-v2 guards, Runtime Balance defaults/bounds, transition invariants, game-state v1/v2 compatibility, precise rounding, ledger provenance/reconciliation, canonical serialization, strict command replay, sparse snapshot policy, persistence decoding, repository integration, concurrency, rollback, idempotency, and authenticated migration/legacy-retirement tests.
- Determinism/performance risks: every accepted command still validates/freezes the aggregate, computes a canonical checksum, and persists `current_state`. Sparse historical anchors remove per-command snapshot duplication, but growing embedded histories and normalized evidence still need 120/480-month budgets under Prompt 14.
- Missing requirements: no Prompt 01 authority, ledger, migration, or replay requirement remains open. Full persistence/storage long-run budgets belong to Prompt 14, and the browser/API-per-month loop belongs to Prompt 03.
- Duplicate formulas or authority: v1 constructors/reducers remain read/migrate fixture compatibility rather than mutable production authority. The embedded validated ledger is gameplay authority; normalized SQL ledger rows are an audit/query projection. Prompt 02 removed active Web/AI/goal financial-selector duplication.
- AI boundary: AI does not own state validation or ledger writes, which is correct.
- Next action: keep this boundary stable while later prompts consume the v2 authority; do not move financial formulas or Runtime Balance behavior into the state layer.

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

Status: complete for Prompt 02.

- Authoritative files and entry points: `simulateFinancialMonthV2` in src/core/financial-kernel-v2.ts; funding in obligation-funding-v2.ts; debt, payroll, recurring, insurance, inflation, and annual helpers in their named v2 modules; transition acceptance in financial-transition-v2.ts; product orchestration/dispatch in monthly-turn-v2.ts; and `projectWithoutEventsV2` in financial-projection-v2.ts. Exact order and boundaries are in financial-engine-v2.md.
- Inputs: immutable GameStateV2, persisted `2.0.0` tax/claim/resolved-flow evidence, one complete seeded market step, and a liquidation policy rate. Projection accepts the same evidence as a strict serializable versioned packet.
- Outputs: immutable financial closing state, balanced ledger transactions, complete financial month record, one exact funding plan, optional actual shortfall, updated financial RNG/market/CPI state, and a branded event-free projection result.
- State owned: financial balances/details, contribution and insurance accumulators, market financial effects, ledger postings, current month, and financial records. Career, exposure, macro/event selection, terminal labeling, persistence, and UI remain outside the kernel.
- Dependencies: cents/PPM primitives, authoritative GameState selectors and ledger, market evidence, payroll, debt, recurring strategy, insurance, annual/inflation helpers, and transition validation. There is no React, Next.js, AI, network, database, filesystem, clock, or unseeded randomness dependency.
- Tests found: manual golden kernel, shortfall/solvency/restricted-wealth boundaries, debt/cap/match/insurance/inflation/market cases, wrapper orchestration, persisted decode/replay and four fixed legacy checksums, API contract/service evidence, projection reproducibility/lifecycle/invariants, Web/AI/goal/checkpoint selector parity, and conditional PostgreSQL integration.
- Determinism/performance evidence: fixed inputs reproduce state, record, ledger, IDs, fingerprints, RNG, and checksums. Two isolated 480-month projections measured 4,999.987 ms and 5,088.119 ms under an 8,000 ms threshold. Immutable-prefix identity avoids repeated canonical history work; cloned equivalent prefixes retain the canonical fallback.
- Missing requirements: no Prompt 02 calculation, projection, replay, consumer-authority, or headless-performance requirement remains open. Delinquency/default stages remain intentionally absent because no product terms exist. Full multi-system controller/lab/persistence budgets belong to Prompts 03 and 14.
- Duplicate formulas or authority: none in active new-product consumers. `monthly-turn.ts`, v1 outcomes/checkpoints/25x rules, and the private unversioned/`legacy-4.1.0` v2 body are frozen replay compatibility. Schemas, fixtures, field displays, event consequence rules, risk metrics, and native input normalization are not competing monthly formulas.
- Integration boundary: real local tests cross decoder -> wrapper -> kernel -> ledger/outcome/event orchestration, replay -> reducer -> transition -> checksum, and projection -> production market/kernel. Only the remote PolicyEngine tax client is mocked. The real PostgreSQL suite is defined but skipped here because `TEST_DATABASE_URL` is absent.
- AI boundary: Web/AI context consumes canonical net-worth/investable evidence and exposes no competing liquidity formula. AI never computes or mutates a financial month.
- Next action: keep this authority stable while Prompt 03 adds multi-month orchestration; future systems must submit resolved evidence or call the production projection rather than copying formulas.

### 5. Player Actions and Persistent Policies

Status: duplicated.

- Authoritative files and entry points: src/core/actions.ts, detailed-actions-v2.ts and support modules, recurring-strategy-v2.ts, life-milestones-v2.ts, command contracts/mappers, and play action-builder/decision panels.
- Inputs: typed one-time action or policy change, current state, command/revision identity, and any selected milestone/event choice.
- Outputs: ledger-backed transfers and debt/investment changes, updated recurring allocation policy, lifestyle obligations, career state, or milestone lifecycle state.
- State owned: recurring strategy, career/progression, insurance decisions, detailed debts/assets, lifestyle cost, milestone choices, and action-derived ledger history.
- Dependencies: state/ledger, finance primitives, debt/payroll/insurance modules, validation contracts, and UI builders.
- Tests found: actions, detailed actions, recurring strategy, debt service, payroll, insurance, milestones, command mapping, and API service tests.
- Determinism/performance risks: actions are deterministic after validation. The principal risk is semantic drift between legacy v1 action code retained for compatibility and the v2 detailed command families.
- Missing requirements: one action taxonomy, one policy interface, explicit affordability/effect previews derived from core formulas, and removal or isolation of alternate legacy action implementations.
- Duplicate formulas or authority: legacy v1 actions remain callable compatibility code while v2 detailed actions own production mutation; some UI previews reconstruct values rather than call selectors.
- AI boundary: AI must not create or execute financial actions without typed player confirmation; current authoritative actions remain code-driven.
- Next action: Prompt 05 after Prompts 01-04.

### 6. Goals, End Conditions, and Grading

Status: partial.

- Authoritative files and entry points: src/core/financial-goals-v2.ts, src/core/outcomes.ts, outcome checks in monthly-turn-v2.ts, legacy hasReachedFinancialIndependence in game-state.ts, onboarding goal fields, and debrief display.
- Inputs: player-selected FI target/age or legacy living-cost target, canonical investable assets, age/current month, and the completed month's actual `FinancialShortfallV2 | null`.
- Outputs: progress projection, terminal FI/retirement/bankruptcy outcome, immutable grade, reason code, and reached month.
- State owned: financialGoal and terminal outcome on the run aggregate.
- Dependencies: financial snapshot, canonical investable-asset selector, kernel shortfall evidence, calendar, onboarding, checkpoint/debrief.
- Tests found: financial-goals-v2, outcomes boundary tests, game-state FI tests, monthly-turn bankruptcy/FI tests, and API contract tests.
- Determinism/performance risks: exact integer comparisons are deterministic. New-product investable assets and net worth now have one selector authority; age display logic still needs the Prompt 04 boundary audit.
- Missing requirements: the full configured outcome/grade matrix and exact interval audit, one age selector surface, and counterfactual grading evidence for debrief.
- Duplicate formulas or authority: Web, AI, goal, and checkpoint financial sums now delegate to canonical selectors/evidence. The 25-times-living-cost helper and v1 outcome rules are frozen compatibility paths; UI age calculation remains a later-system duplicate.
- AI boundary: the final grade is immutable and code-owned, which is correct; AI may explain but not alter it.
- Next action: Prompt 04 should complete the configured goal/outcome/grade matrix and consolidate age evidence without reintroducing financial formulas.

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
- Duplicate formulas or authority: AI context now consumes canonical net-worth and goal evidence; teaching remains incomplete because causal/counterfactual grounding is absent, not because it owns a financial formula.
- AI boundary: AI correctly cannot alter the grade or state, but prose claims need stronger grounding than valid evidence IDs alone.
- Next action: Prompt 12 after Prompt 11; preserve the Prompt 02 selector/evidence boundary.

### 14. Offline Balance Lab

Status: missing.

- Authoritative files and entry points: none found.
- Inputs required: versioned scenario catalog, difficulty profile, seed set, deterministic strategy bots, horizon, engine configuration, and optional event/director policy variants.
- Outputs required: terminal outcome distributions, FI timing, bankruptcy rate, event frequency/severity, pressure/recovery metrics, strategy sensitivity, invariants, and performance measurements.
- State owned: offline run specifications and reports only; it must not become production simulation authority.
- Dependencies: stable engine, time controller, goals, actions/policies, risk, macro, events, balance controller, and causal metrics.
- Tests found: the production financial projection has a deterministic 480-month performance/invariant suite, but no lab, matched-seed comparison, bot policy suite, distributional report, or whole-pipeline benchmark exists.
- Determinism/performance risks: the financial path now reuses immutable history prefixes, but per-command checksumming and `current_state` persistence may still be a blocker if the lab uses the Web persistence path. The lab needs an in-memory headless controller plus explicit parity checks with production orchestration.
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
- Current state, sparse boundary snapshots, ledger rows, monthly records, tax evidence, and exact command payloads are persisted transactionally.
- Historical/idempotent reads replay strictly decoded contiguous commands from the latest compatible snapshot or migration target and verify the checksum after every revision.
- Authenticated v1-to-v2 migration is transactional and idempotent; public v1 writes return HTTP 410 without mutation while authenticated legacy reads remain available.
- Tax evidence is resolved outside the core and can be reused on retry/replay.
- Every new Web month is internally stamped `financialKernelVersion: "2.0.0"`;
  historical absence and explicit `legacy-4.1.0` dispatch to a private frozen
  adapter. Persisted resolved flows are accepted only with `2.0.0`.
- Tests cover fixed-checksum monthly transitions, four unversioned legacy
  fixtures, strict 2.0.0 command/flow replay, market long paths, deterministic
  projection IDs/fingerprint, repository rollback/concurrency/idempotency, and
  version migration.

### Replay boundary

Exact replay requires:

- the same exact initial state, including run/player identifiers and RNG state;
- the same ordered command payloads and command IDs;
- the same catalog/config version;
- the same external evidence, especially tax evidence; and
- the same financial-kernel discriminator or an explicit migration boundary.

Creating semantically equivalent commands with new UUIDs is not checksum-identical because IDs are used in accepted-command, event, and ledger identities. This is acceptable if documented: command identity is part of the replay record, not incidental metadata.

An AI request is not itself deterministic. Once the selected candidate and parameters are accepted as a typed command, replay is deterministic because that command is persisted. Re-running the AI request may yield a different proposal and must not be treated as replay.

### Remaining gaps

- No repository-level golden replay covers a full v2 life from onboarding through terminal outcome.
- No parity test compares sequential one-month commands with an in-process AdvanceNMonths controller.
- A 480-month in-memory financial projection is measured, but a complete
  controller/repository replay over that horizon is not yet proven.
- Snapshot/ledger compaction and PostgreSQL storage behavior over hundreds of
  accepted Web months remain unproven. The conditional database suite did not
  execute here because `TEST_DATABASE_URL` is absent.

## Formula and authority duplication

| Concept | Intended authority | Other implementation found | Risk |
| --- | --- | --- | --- |
| Net worth | src/core/game-state.ts `calculateNetWorth` | No active duplicate; Web, AI, checkpoint, and kernel import it. | Resolved in Prompt 02; parity includes large restricted-wealth cancellation. |
| Age | src/core/outcomes.ts calculateAgeYears | UI calculation | Pause/end/display boundaries can disagree. |
| Salary bounds | core scenario catalog using money/rate primitives | onboarding-model floating multiplication | Rounding or validation preview mismatch. |
| FI investable input/target/progress | game-state.ts selector plus financial-goals-v2.ts projection | v1 25x helper is frozen compatibility | New Web/AI/checkpoint/outcome consumers share the versioned projection; Prompt 04 still owns the complete goal/grade audit. |
| Automatic liquidity and gross liquidation | obligation-funding-v2.ts immutable plan | v1 outcomes.ts functions are frozen compatibility | New assessment, execution, kernel shortfall, record, and outcome evidence cannot drift. |
| Monthly simulation | financial-kernel-v2.ts through the 2.0.0 wrapper | monthly-turn.ts and private legacy-4.1.0 body are replay-only | New commands cannot select or import the compatibility reducers; fixed checksums protect history. |
| Multi-month control | future v2 controller | v1 checkpoints.ts and v2 browser loop | Different stop rules and performance behavior. |
| Event selection | deterministic scheduler/controller | seeded uniform scheduler and optional director | Different candidate policies; neither has fairness approval. |

No AI-owned exact financial formula was found. The AI game-context adapter now
consumes canonical net worth and versioned goal projection amounts and exposes
no independently calculated automatic-liquidity value.

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
4. Each accepted command persists the full current save, while historical v2 snapshots are limited to run start, annual checkpoints, event/milestone boundaries, terminal outcome, and migration anchors.
5. Ledger transactions/postings and monthly records are also stored in normalized tables.
6. The v2 browser fast-forward performs one request/transaction per month.

Prompt 02's in-memory projection exposed and repaired one concrete scaling
problem: cloned growing immutable histories forced repeated ownership and
canonical transition work. Shared immutable prefixes now use an identity proof,
with canonical comparison retained for equivalent cloned prefixes. Two isolated
480-month financial runs measured 4,999.987 ms and 5,088.119 ms under the 8,000
ms gate. That evidence covers the event-free financial kernel, not the browser
loop, remote tax resolution, PostgreSQL persistence, full event/controller
pipeline, or storage growth. Prompt 03 should add an in-process application loop;
Prompt 14 should enforce complete-run time and size budgets.

## Dependency-aware implementation order

The prompt numbers below refer to the prompt pack in .codex/AGENTS.md.

1. Prompt 01 — Authoritative Game State and Ledger. Complete: GameStateV2 is the sole mutable state, v1 is decode/migrate/read-only, ledger provenance is enforced for new writes, and historical anchors are sparse and replay-verified.
2. Prompt 13 — Onboarding and State Initialization. Create only the canonical state and persist normalized assumptions/provenance.
3. Prompt 02 — Deterministic Financial Simulation Engine. Complete: one 2.0.0 kernel, funding authority, versioned replay boundary, event-free projection, consumer parity, and measured 480-month gate.
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

1. Prompt 03 should now replace the browser/network month loop with one tagged, deterministic in-process controller that calls the 2.0.0 wrapper exactly once per tick.
2. Prompt 04 should finish the complete goal/end-condition/grade matrix while consuming actual shortfall and canonical selector evidence.
3. Prompt 13 can later consume the authoritative v2 state and remove remaining onboarding/UI initialization duplication.
4. Prompts 06 then 08, followed by Prompt 09 before Prompt 10, must repair event causality and add independent fairness approval before changing director authority.
5. Prompt 14 remains required before tuning or release claims because the financial projection benchmark does not prove distributional fairness or full-run storage performance.

## Audit completion checklist

- All fourteen requested systems are mapped with status, authority, inputs, outputs, owned state, dependencies, tests, risks, missing requirements, duplicate/AI authority, and next action.
- The actual event pipeline identifies eligibility, hazard, selection/ranking, fairness approval, parameter sampling, choice handling, exact effect, causal logging, and teaching/debrief.
- Probability, severity, exposure, and difficulty are analyzed separately.
- Save/load, external evidence, seeded replay, and command-identity boundaries are documented.
- Duplicate formulas and remaining legacy compatibility implementations are identified without treating them as mutable state authority.
- Prompt 01 and Prompt 02 findings are updated from verified implementations;
  Prompts 03-14 remain incomplete unless their own requirements are proven.
- Prompt 02's active formulas, frozen compatibility paths, schemas/fixtures,
  presentation fields, local integration boundaries, mocked remote tax client,
  measured projection, and unavailable conditional PostgreSQL gate are
  classified explicitly.
