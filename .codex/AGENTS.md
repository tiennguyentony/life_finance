# Codex Audit-and-Repair Prompt Pack
## Personal-Finance Simulation Game

This pack is designed for a repository where some systems already exist and may be incomplete, duplicated, or incorrectly coupled.

## Recommended workflow

1. Save the **Shared Codex contract** below into the repository root as `AGENTS.md`, or paste it before each system prompt.
2. Run **Prompt 00** first. It is audit-only and identifies which systems are complete, partial, or missing.
3. Give Codex **one system prompt at a time**, ideally on a separate branch or commit.
4. Review the diff and verification output before moving to the next dependent system.
5. Run **Prompt 15** after all relevant systems are complete.

## Dependency-aware order

Recommended implementation order:

1. Prompt 00 — architecture audit
2. Prompt 01 — Game State and Ledger
3. Prompt 02 — Financial Engine
4. Prompt 03 — Time Controller
5. Prompt 04 — Goals and Grading
6. Prompt 05 — Actions and Policies
7. Prompt 06 — Risk Analyzer
8. Prompt 07 — Macro and Market
9. Prompt 08 — Events and Traps
10. Prompt 09 — Runtime Balance Controller
11. Prompt 10 — Scenario Director
12. Prompt 11 — Causal History and Counterfactuals
13. Prompt 12 — Teaching and Debrief
14. Prompt 13 — Onboarding
15. Prompt 14 — Offline Balance Lab
16. Prompt 15 — final integration audit

Onboarding appears late in implementation order because it should construct the already-stable authoritative GameState rather than define a competing schema.

## Logical system ownership

| System | Owns | Must not own |
|---|---|---|
| Game State and Ledger | authoritative data, transaction records, snapshots | financial formulas |
| Financial Engine | exact monetary calculations | narrative, event ranking |
| Time Controller | tick order and pause orchestration | money formulas |
| Actions and Policies | validated player intent | direct duplicated calculation |
| Goals and Grading | end conditions and grades | prose grading |
| Risk Analyzer | vulnerability metrics | event occurrence |
| Macro System | structured economy and returns | personal-shock fairness |
| Event System | templates, eligibility, effects | runtime approval |
| Scenario Director | candidate ranking and story relevance | financial consequences |
| Runtime Balance | pacing and fairness approval | unrestricted event invention |
| Causal History | traceable causes and counterfactual inputs | invented explanations |
| Teaching System | verified explanations and feedback | financial truth |
| Onboarding | validated initial state construction | duplicate formulas |
| Balance Lab | offline testing and tuning evidence | production-only alternate engine |

## Shared Codex contract

Paste this block before any individual system prompt, unless equivalent rules already exist in the repository's root `AGENTS.md`.

```text
You are working inside my existing personal-finance simulation game repository.

This is an AUDIT-AND-REPAIR task. Some or all of the requested system may already exist. Do not assume it is missing, and do not build a duplicate implementation.

Before changing code:

1. Read all repository instructions, especially every applicable AGENTS.md.
2. Inspect package manifests, architecture docs, schemas, tests, and recent implementation patterns.
3. Search the repository for every existing implementation related to this system.
4. Identify the authoritative GameState, simulation entry points, event pipeline, seeded RNG, persistence format, and test framework.
5. Produce a concise audit:
   - what already exists;
   - what is complete;
   - what is partial or incorrect;
   - duplicated or conflicting responsibilities;
   - missing tests;
   - files you expect to change.
6. Then implement the smallest coherent fix that completes the system.
7. Preserve existing public APIs where practical. If an API must change, update all callers and document the migration.
8. Follow the repository's existing language, framework, naming, folder, dependency, and testing conventions.
9. Do not add a production dependency unless it is clearly justified.
10. Do not perform unrelated refactors.
11. Do not stop at recommendations. Implement and verify the work.
12. Do not claim a test passed unless you actually ran it and observed the result.

Global architecture rules:

- Deterministic code owns every financial calculation.
- AI may personalize language, rank already-eligible candidates, or explain verified results. AI must never calculate balances, invent monetary effects, directly mutate GameState, bypass eligibility, or override runtime balance rules.
- Use one authoritative GameState. Do not create competing PlayerState, FinanceState, EventState, or PortfolioState models.
- Same initial state, player actions, configuration, and random seeds must reproduce the same simulation results.
- Never use unseeded randomness inside simulation, market, event, balance, or grading logic.
- Keep event probability, player vulnerability, teaching relevance, and runtime fairness as separate concepts.
- No emergency fund must not cause a layoff. Missing insurance must not cause illness. Portfolio concentration must not cause a crash. Those conditions change consequences, not unrelated event probability.
- “No event” is a valid runtime result.
- Do not use hidden rubber-banding to erase successful preparation.
- The normal monthly simulation path must make no AI, network, or remote database call.
- Reuse production financial logic in tests and the Balance Lab. Never create a second set of financial formulas.

Engineering requirements:

- Prefer small, pure, independently testable functions for calculations and rules.
- Keep configuration separate from algorithms.
- Validate configuration at startup or in tests.
- Use structured errors or reason codes instead of silent failure.
- Add regression tests for every bug found.
- Run formatting, linting, type checking where applicable, unit tests, integration tests, and relevant performance tests.
- Inspect the final diff for duplicate logic and unrelated changes.

Final response format:

1. Audit findings
2. Design implemented
3. Files changed
4. Tests added or updated
5. Exact verification commands run
6. Verification results
7. Performance results where relevant
8. Assumptions
9. Remaining risks or future tuning
```

# Prompt 00 — Repository-wide architecture audit

```text
Perform a repository-wide architecture audit for the personal-finance simulation. Do not modify production code in this task unless a trivial documentation-only fix is required.

Map the existing implementation to these logical systems:

1. Onboarding and State Initialization
2. Authoritative Game State and Ledger
3. Time and Turn Controller
4. Deterministic Financial Simulation Engine
5. Player Actions and Persistent Policies
6. Goals, End Conditions, and Grading
7. Risk and Resilience Analyzer
8. Macro and Market System
9. Personal Event and Trap System
10. Adaptive Scenario Director
11. Runtime Balance Controller
12. Causal History and Counterfactuals
13. Teaching, Checkpoints, and Debrief
14. Offline Balance Lab

For each system, report:

- status: complete, partial, missing, duplicated, or incorrectly coupled;
- authoritative files and entry points;
- inputs and outputs;
- state it owns;
- other systems it depends on;
- tests that currently cover it;
- determinism risks;
- performance risks;
- missing requirements;
- duplicated financial formulas;
- AI boundary violations;
- recommended next action.

Also diagram the actual event pipeline in the current repository. Explicitly identify where the following happen:

- event eligibility;
- event probability or hazard;
- candidate ranking;
- runtime fairness approval;
- parameter sampling;
- player choice handling;
- exact financial effect application;
- causal logging;
- teaching or debrief generation.

Check whether event probability, severity, Exposure, and difficulty are currently mixed together. Flag cases where a general risk score creates unrelated bad luck or increases both frequency and severity.

Check save/load and seeded replay. Determine whether the same state, actions, configuration, and seed reproduce the same result.

Create or update a concise document such as `docs/architecture/system-audit.md`, following repository conventions. Include a dependency-aware implementation order and label which individual system prompts should be run next. Do not attempt to repair all systems in one change.
```

# Prompt 01 — Authoritative Game State and Ledger

```text
Audit and repair the Authoritative Game State and Ledger system.

Objective:
Create one dependable source of truth for the entire simulation without rewriting working code unnecessarily.

The authoritative state should be able to represent, using the repository's existing conventions:

- player profile and persona identifiers;
- current date, age, and simulation month;
- employment and income;
- expenses and lifestyle;
- liquid, taxable, retirement, restricted, and illiquid assets;
- debts and credit limits;
- insurance and benefits;
- recurring player policies;
- macro and market state;
- risk metrics or cached derived metrics;
- goal and grading progress;
- pending event or pending decision;
- Runtime Balance state;
- deterministic RNG seed or reproducible RNG state;
- schema version.

Audit for competing state models and duplicate balance calculations. Consolidate ownership where needed, but avoid a broad rewrite if adapters can safely preserve compatibility.

Implement or repair:

1. Money representation
   - Use the repository's established precise representation, such as integer minor units or an existing decimal type.
   - Prevent floating-point drift in balances, interest, and transaction totals.
   - Document rounding boundaries.

2. Derived versus persisted values
   - Identify which values are authoritative and which are derived.
   - Avoid persisting derived values that can silently become stale unless the project intentionally caches them with invalidation.
   - Provide selectors or calculation helpers for derived values.

3. Transaction ledger
   - Record meaningful financial changes with stable identifiers, simulation timestamp, source system, category, affected account or liability, amount, and causal reference.
   - Make ledger entries immutable after creation.
   - Ensure exact balances can be reconciled to ledger activity where the existing architecture supports this.
   - Do not write a remote database record for every hidden monthly operation unless that is already an explicit product requirement.

4. Snapshots
   - Save compact snapshots at run start, checkpoints, before and after major events, save-game points, and run end.
   - Avoid deep-cloning and serializing the entire state every month.
   - Preserve enough information for replay, debugging, and counterfactual analysis.

5. Save/load and migrations
   - Add schema versioning or repair existing version handling.
   - Validate loaded state.
   - Add safe migrations for existing save data where required.
   - Reject corrupt or impossible state with structured errors.

6. Invariants
   - Unique account and debt IDs.
   - No non-finite monetary values.
   - Allocations and percentages inside valid bounds.
   - Liabilities cannot silently become assets.
   - Credit usage cannot exceed configured limits unless delinquency/default logic explicitly allows it.
   - Simulation date and age move monotonically.
   - Pending decisions are internally consistent.

Tests must cover:

- serialization and deserialization;
- schema migration;
- monetary rounding;
- ledger reconciliation;
- invalid state rejection;
- stable IDs;
- deterministic replay metadata;
- compatibility with existing saved fixtures;
- no duplicate authoritative state.

Do not put financial-engine formulas into the state layer. This system stores and validates state; the Financial Engine calculates changes.
```

# Prompt 02 — Deterministic Financial Simulation Engine

```text
Audit and repair the Deterministic Financial Simulation Engine.

Objective:
Make one fast, testable financial kernel responsible for every dollar in the simulation. It must not depend on UI, AI, network access, or remote persistence.

Find the current monthly simulation order and consolidate conflicting calculation paths. Establish one documented canonical order. Adapt the details to existing product rules, but it should cover the equivalent of:

1. advance simulation date;
2. apply employment income and other recurring income;
3. calculate taxes and payroll deductions;
4. apply mandatory living expenses and insurance premiums;
5. apply required debt payments;
6. apply valid recurring savings and investment policies;
7. apply employer matching and benefit contributions;
8. accrue debt interest and fees;
9. apply deterministic, seeded market returns;
10. apply active temporary effects;
11. resolve cash shortfalls;
12. update accounts and liabilities;
13. emit ledger entries and a compact MonthResult;
14. leave risk, event selection, teaching, and grading to their owning systems.

Implement or repair:

- income and recurring expense handling;
- debt amortization, interest, minimum payments, extra payments, and payoff;
- employer retirement match;
- taxable and retirement contributions;
- asset returns using inputs from the Macro/Market System;
- inflation or cost changes using configured inputs;
- insurance premiums, deductibles, and approved claims;
- early retirement withdrawal penalties if supported;
- restricted and illiquid asset behavior;
- displayed net worth separately from liquid solvency;
- financial shortfall handling.

Shortfall behavior must be explicit and testable. Follow the product's configured waterfall, equivalent to:

- use unrestricted liquid cash;
- apply any allowed policy behavior for optional contributions;
- liquidate eligible taxable investments at current value;
- use available credit;
- enter delinquency/default stages if implemented;
- trigger bankruptcy only when the configured obligations cannot be met after all permitted sources are exhausted.

Do not count home equity or restricted retirement assets as ordinary bill-paying liquidity. If retirement assets can be accessed early, model that as an explicit action with taxes or penalties.

Expose a small API equivalent to:

- `simulateMonth(state, inputs) -> MonthResult`
- `projectWithoutEvents(state, months, assumptions) -> ProjectionResult`, if already useful;
- pure helpers for debt interest, match, and shortfall resolution.

Tests must include:

- golden monthly examples with manually verified expected values;
- zero-income and negative-cash-flow cases;
- debt payoff boundary conditions;
- contribution and employer-match caps;
- market gain and loss cases;
- restricted asset handling;
- forced sale at a loss;
- credit exhaustion;
- bankruptcy threshold;
- displayed net worth versus liquid solvency;
- exact reproducibility under the same seed and inputs;
- monetary invariants across long runs;
- a headless 480-month performance test with a generous, stable budget.

Remove or redirect duplicate financial formulas in UI, events, teaching, and the Balance Lab.
```

# Prompt 03 — Time and Turn Controller

```text
Audit and repair the Time and Turn Controller.

Objective:
Provide elastic pacing: the engine calculates in monthly ticks, while the player can fast-forward through calm periods and pause only at meaningful moments.

The controller owns orchestration and pause decisions. It must not own financial formulas, event effects, risk formulas, or grading formulas.

Implement or repair APIs equivalent to:

- advance one month;
- advance a requested number of months;
- advance until the next event;
- advance until the next checkpoint;
- advance until a player decision is required;
- advance until an end condition;
- resume after resolving a decision.

Each call should return a structured result containing:

- months advanced;
- final GameState reference or snapshot;
- pause reason;
- pending event or decision, if any;
- checkpoint summary input data;
- end condition, if any;
- compact aggregate changes for the UI.

Required behavior:

- Run the Financial Engine exactly once per hidden monthly tick.
- Regenerate Runtime Balance pressure and update cooldown counters at the correct point in the tick.
- Update macro state and event opportunity checks in a documented order.
- Stop immediately when a major event, required decision, checkpoint, bankruptcy, FI, or retirement condition fires.
- Do not update or rerender the UI for every hidden month.
- Do not call AI, network services, or remote persistence in the hidden monthly loop.
- Allow “no event” months and long calm periods.
- Ensure save/load can resume from an exact simulation month.
- Ensure the same seed and actions create the same pause sequence.

Use one authoritative enumeration or tagged type for pause reasons, such as:

- requested duration completed;
- periodic checkpoint;
- event requires response;
- policy decision required;
- financial warning;
- reached FI;
- reached retirement age;
- bankruptcy;
- explicit user stop.

Tests must cover:

- 12-month fast-forward with no pauses;
- stopping early for an event;
- stopping early for an end condition;
- checkpoint boundaries;
- resume after event resolution;
- no duplicate month processing;
- exact month count;
- deterministic pause sequence;
- UI notification emitted once per pause rather than once per hidden month;
- performance of a complete 480-month calm run.

Keep the controller small. If the current implementation has one oversized game loop, extract clear orchestration steps without rewriting unrelated systems.
```

# Prompt 04 — Goals, End Conditions, and Grading

```text
Audit and repair the Goals, End Conditions, and Grading system.

Objective:
Centralize all run-ending rules and grade calculations in deterministic code. Remove conflicting checks from UI, events, AI prompts, or unrelated services.

Implement the product rules or their configured equivalents:

1. Bankruptcy
   - Use the configured cash-flow solvency definition, not merely net worth less than or equal to zero.
   - Bankruptcy occurs only after permitted liquid resources, eligible investment liquidation, remaining credit, and any configured delinquency/default stages are exhausted.
   - Home equity and restricted retirement assets are not ordinary liquidity.
   - A monthly deficit is a warning state, not automatically bankruptcy.

2. Financial Independence
   - Calculate FI using configurable safe withdrawal rate assumptions.
   - Equivalent default:
     `FI target = annual cost of living / SWR`, with a 4% default producing a 25x multiplier.
   - Count the configured set of income-producing or investable assets.
   - Exclude home equity unless liquidated under product rules.
   - Keep FI target responsive to sustainable lifestyle spending.
   - End immediately with the configured top grade when FI is reached.

3. Retirement-age stop
   - End at the configured retirement age, defaulting to 65.
   - If FI was not reached and bankruptcy did not occur, grade deterministic FI progress.

Support the configured grade ladder, equivalent to:

- FI reached before retirement: S;
- at retirement: A for at least 0.8 progress;
- B for 0.6–0.8;
- C for 0.4–0.6;
- D for 0.2–0.4;
- E for 0–0.2;
- bankruptcy: F.

Resolve interval-boundary ambiguity explicitly and test every exact boundary.

Return a structured outcome containing:

- end reason;
- headline grade;
- FI target;
- FI progress;
- displayed net worth;
- liquid solvency;
- retirement readiness;
- relevant component scores if the product tracks discipline and learning separately;
- machine-readable reasons.

Do not let AI assign or alter the grade. AI may explain the deterministic result.

Tests must include:

- each grade boundary;
- exact FI boundary;
- zero or invalid annual expenses;
- starting at or beyond retirement age;
- negative net worth but positive current solvency;
- positive net worth but no bill-paying liquidity;
- restricted retirement assets;
- home equity exclusion;
- lifestyle change moving the FI target;
- bankruptcy waterfall exhaustion;
- deterministic outcome after save/load.

Keep scoring configuration separate from calculation code so designers can tune thresholds safely without editing financial formulas.
```

# Prompt 05 — Player Actions and Persistent Policies

```text
Audit and repair the Player Actions and Persistent Policies system.

Objective:
Represent player decisions as validated commands and persistent policies. The Action System changes strategy or requests a transaction; the Financial Engine calculates exact monetary consequences.

Support existing product actions and fill missing coverage for the equivalent of:

Persistent policies:
- cash or emergency-fund savings target;
- taxable index contribution;
- sector or thematic contribution;
- retirement contribution;
- HSA or benefit contribution where eligible;
- monthly extra debt payment;
- lifestyle tier or discretionary spending;
- insurance selection;
- automatic rebalancing if the product supports it.

One-time actions:
- make a lump-sum debt payment;
- buy or sell an investment;
- withdraw cash;
- withdraw retirement assets with configured penalties;
- refinance eligible debt;
- change lifestyle;
- buy or sell a home if in scope;
- move location;
- accept a job change;
- upskill or study.

Implement or repair a command flow equivalent to:

1. parse typed action input;
2. validate eligibility and required fields;
3. produce a deterministic preview;
4. show immediate cash-flow, liquidity, debt, and policy effects;
5. apply only after approval from the caller;
6. emit policy-change and ledger records;
7. mark affected derived metrics dirty;
8. make changes effective at an explicit simulation time.

Requirements:

- Recurring allocation percentages must respect valid ranges and total-allocation rules.
- Commands must use stable IDs or another idempotency mechanism so retries do not double-apply.
- Invalid actions return structured errors, not partial mutation.
- One action should not directly recalculate unrelated systems.
- Retirement and restricted accounts must respect eligibility, access, penalties, and contribution limits configured by the engine.
- A preview must use the same calculation helpers as actual execution where possible.
- The UI must not contain a second implementation of action rules.
- Optional AI parsing may translate free text into a typed command, but deterministic validation must approve it.

Tests must cover:

- valid and invalid recurring allocations;
- insufficient cash;
- duplicate command submission;
- action effective date;
- debt payoff exceeding remaining balance;
- restricted-account withdrawal;
- employer-match interaction;
- policy replacement versus accidental duplication;
- action preview matching actual immediate result;
- save/load persistence;
- deterministic action history.

Do not implement event choices in an entirely separate financial path. Event responses should be translated into the same validated effect or command mechanisms where practical.
```

# Prompt 06 — Risk and Resilience Analyzer

```text
Audit and repair the Risk and Resilience Analyzer.

Objective:
Calculate transparent financial vulnerability dimensions from verified GameState. This system measures risk; it does not create events, apply financial effects, or assign grades.

Calculate or repair clearly defined metrics for the equivalent of:

- emergency-fund months;
- monthly free cash flow;
- debt-service ratio;
- fixed-cost ratio;
- high-interest debt burden;
- liquid-resource coverage;
- insurance protection gaps;
- portfolio concentration;
- job-to-investment sector correlation;
- income stability;
- lifestyle rigidity;
- interest burden;
- retirement readiness;
- current drawdown or recent financial stress.

Return both:

- raw values with units;
- normalized severity bands or scores with explicit thresholds.

Do not rely only on one opaque Exposure Score. If an aggregate score remains useful for director ranking or analytics:

- keep the underlying dimensions available;
- document its formula;
- configure weights separately;
- prevent it from automatically increasing unrelated event probability and severity;
- test monotonic behavior.

Causality rules must be explicit:

- Low cash does not cause illness or layoffs.
- Missing insurance increases uncovered impact if a covered event occurs.
- Vehicle age and maintenance may affect vehicle-repair probability.
- Portfolio concentration affects losses during a related market move.
- High fixed expenses affect recovery, not arbitrary event occurrence.

Implementation requirements:

- Prefer pure functions from GameState to RiskSnapshot.
- Recalculate all metrics initially if inexpensive; introduce dirty-flag optimization only if profiling supports it.
- Do not persist stale derived metrics without versioning or invalidation.
- Return machine-readable weakness tags for the Scenario Director.
- Return explanation-ready facts for the Teaching System.
- Document formulas and units.

Tests must cover:

- zero and negative income;
- zero essential expenses;
- fully insured and uninsured cases;
- increasing cash improves liquidity but does not alter unrelated event hazard;
- paying down high-interest debt improves relevant metrics;
- increasing sector concentration worsens concentration;
- job-sector overlap worsens correlation;
- lifestyle reduction improves fixed-cost flexibility;
- stable repeatability;
- no state mutation;
- threshold boundaries.

Add property or monotonicity tests where the current test framework supports them.
```

# Prompt 07 — Macro and Market System

```text
Audit and repair the Macro and Market System.

Objective:
Create a fast, deterministic, seeded world model that affects asset returns and economically related variables without using real-time APIs or AI financial calculations.

The system should own structured macro state, such as:

- current regime;
- inflation;
- policy or borrowing-rate environment;
- labor-market strength;
- housing conditions;
- broad-market conditions;
- sector conditions;
- volatility;
- active macro narratives or temporary modifiers.

Use the repository's existing design. If no model exists, implement a bounded regime-based model rather than independent arbitrary random numbers. Example regimes may include:

- expansion;
- slow growth;
- high inflation;
- recession;
- recovery;
- speculative boom;
- market stress.

Requirements:

1. Seeded transitions
   - Use only the repository's seeded RNG.
   - Same state and seed must reproduce the same regime and return sequence.
   - Transition probabilities and durations must be configuration.

2. Asset-class effects
   - Produce deterministic monthly inputs for broad index, sector assets, speculative assets, cash yield, borrowing rates, housing, and inflation as supported.
   - Model correlation intentionally rather than giving every asset an unrelated random return.
   - Keep returns bounded by configuration and document units.

3. Economic causality
   - Recession may worsen eligible layoff hazards through explicit labor-market inputs.
   - Rate changes may affect new or variable-rate debt only through defined engine channels.
   - Inflation changes living costs through defined rules.
   - Macro ticker items should not directly mutate cash unless an event or financial rule explicitly connects them.

4. Narrative separation
   - Structured macro state is authoritative.
   - Template or AI headlines may describe it but may not invent a different regime or return.
   - Provide a deterministic fallback headline.

5. Performance
   - One monthly update should be lightweight.
   - No network or AI call in the monthly path.
   - Pre-index sector mappings if the event or portfolio library is large.

Tests must cover:

- deterministic sequence under the same seed;
- different seeds produce valid bounded sequences;
- transition configuration;
- regime-specific return tendencies;
- correlated sector effects;
- inflation propagation;
- interest-rate propagation;
- no direct arbitrary wallet damage;
- narrative facts matching structured state;
- long-run finite values and performance.

Keep macro event selection separate from the Runtime Balance Controller. The Macro System describes the world; the Balance Controller governs fair personal-event pacing.
```

# Prompt 08 — Personal Event and Trap System

```text
Audit and repair the Personal Event and Trap System.

Objective:
Represent personal shocks, opportunities, behavioral traps, and their response choices as validated, mostly declarative event templates. The Event System owns event definitions, eligibility, and effect descriptions. It does not decide final runtime fairness or calculate arbitrary money through AI.

Create or repair a common event schema supporting the equivalent of:

- stable event ID and version;
- category;
- positive, neutral, or negative classification;
- primary and secondary lesson tags;
- eligibility rules;
- base hazard or opportunity weight;
- causal probability modifiers;
- required or blocked macro conditions;
- severity tier;
- pressure cost;
- parameter distributions and hard bounds;
- mitigations, insurance, benefits, or prerequisites;
- response choices;
- declarative effects;
- follow-up conditions;
- event, category, and lesson cooldowns;
- maximum occurrences;
- recovery-window behavior;
- deterministic fallback narrative.

Prefer reusable declarative operations such as:

- add or subtract cash;
- reduce income for a duration;
- add a temporary or recurring expense;
- create or modify debt;
- liquidate an eligible asset;
- apply a deductible or coverage;
- change a policy;
- add a bounded penalty;
- add a market modifier;
- schedule a follow-up condition.

Use custom executable event code only when the operation system cannot express the behavior safely.

Separate these responsibilities:

- Eligibility: whether the event makes sense.
- Hazard: whether the event opportunity can occur.
- Director ranking: which relevant candidate is interesting.
- Runtime Balance approval: whether it is fair now.
- Resolution: exact approved effects after player choice.

Causality requirements:

- No emergency fund must not increase unrelated shock probability.
- Missing insurance changes coverage, not illness probability.
- Old vehicle condition may change repair hazard.
- Industry contraction may change layoff hazard.
- Portfolio concentration changes market loss impact.
- General Exposure must not be a universal probability and severity multiplier.

Add startup or test-time event validation for:

- duplicate IDs;
- invalid bounds;
- missing lesson tags;
- impossible response definitions;
- invalid effect operations;
- cooldown conflicts;
- unsupported account references;
- non-deterministic functions;
- response with no machine-readable effect.

Include both setbacks and opportunities. A balanced run should not consist only of punishments.

Tests must cover:

- representative eligibility rules;
- causal hazard modifiers;
- bounded parameter sampling;
- insurance mitigation;
- response effect resolution;
- follow-up scheduling;
- maximum occurrences;
- invalid configuration rejection;
- deterministic fallback text;
- no AI dependency for financial resolution.

Migrate existing bespoke events incrementally. Do not rewrite every event if adapters can safely normalize them behind the common interface.
```

# Prompt 09 — Runtime Balance Controller

```text
Audit and repair the Runtime Balance Controller.

Objective:
Place a fast fairness gate between the Scenario Director and Event Resolver. It should approve, reject, or safely parameterize proposed events based on pacing, impact, recovery, repetition, and difficulty.

The controller must not invent event eligibility, perform exact financial resolution, or use AI. It may inspect verified state and run a lightweight deterministic preflight.

Implement or repair:

1. BalanceState in the authoritative GameState
   - difficulty;
   - pressure and maximum pressure;
   - monthly pressure regeneration;
   - months since any, medium, large, and catastrophic event;
   - catastrophe count;
   - active recovery window and remaining duration;
   - recent event IDs, categories, and lesson tags;
   - lesson exposure counts;
   - recent negative-cash-flow months or drawdown indicators;
   - last approved impact score;
   - optional development-only rejection reason.

2. Pressure budget
   - Calm months regenerate pressure.
   - Events consume configured pressure.
   - Put values in configuration, not scattered constants.
   - Example initial costs may be micro 1, medium 2, large 4, catastrophe 7, but adapt to existing design and tune through tests.

3. Cooldowns
   - Support event, category, lesson, and tier cooldowns.
   - Large and catastrophic events need stronger spacing.
   - “No event” must be returned when no candidate passes.

4. Recovery windows
   - Large or catastrophic events activate a recovery period.
   - Block catastrophes and strongly penalize large events during recovery.
   - Prevent immediate retargeting of the same weakness.
   - Allow ordinary simulation and player decisions.
   - Do not grant arbitrary free money.

5. Repetition and lesson coverage
   - Penalize recently repeated IDs, categories, and lessons.
   - Favor underrepresented lessons without bypassing eligibility or fairness.

6. Difficulty profiles
   - Guided, Normal, and Hard should configure pressure regeneration, cooldowns, recovery duration, impact bands, warning strength, and catastrophe limits.
   - Difficulty must not merely multiply all bills.
   - Hard must still respect event hard bounds and causality.

7. Lightweight impact estimator
   - Evaluate only the top configured number of candidates, such as five.
   - Estimate direct cost, lost income, temporary cost, coverage, benefits, uncovered cost, liquid-resource use, likely asset liquidation, likely credit, burn months, negative-cash-flow duration, recovery time, bankruptcy risk, and inexpensive goal delay.
   - Reuse Financial Engine helpers.
   - Do not run Monte Carlo simulations during normal gameplay.

8. Approval API
   Implement the equivalent of:
   `chooseBalancedEvent(state, rankedCandidates, seededRng) -> ApprovedEvent | null`

   For each top candidate:
   - confirm eligibility;
   - check pressure;
   - check cooldowns;
   - check recovery rules;
   - check catastrophe limit;
   - check repetition;
   - sample parameters with the seeded RNG;
   - clamp or reject outside hard event limits;
   - estimate impact;
   - compare with difficulty impact bands;
   - ensure Guided and Normal have at least one reasonable response that avoids immediate unavoidable failure;
   - return an approved event or continue;
   - record structured rejection reasons in development mode.

Fairness requirements:

- Do not increase unrelated event probability because the player is vulnerable.
- Do not make every cost larger for wealthy players.
- Do not immediately crash an asset because the player bought it.
- Do not erase the benefit of preparation.
- Reject an event when no bounded parameter sample is fair.
- Allow prepared and unprepared players to experience different consequences from the same plausible event.

Tests must include:

- deterministic approval under the same seed;
- insufficient pressure;
- pressure regeneration;
- cooldown enforcement;
- recovery window activation and blocking;
- catastrophe limit;
- repetition penalties;
- underrepresented lesson bonus;
- ineligible candidate rejection;
- hard parameter bounds;
- all-candidates-rejected returning null;
- no unrelated probability change from low cash;
- prepared player lower impact under the same event;
- no wealth-based arbitrary cost increase;
- Guided and Normal unavoidable-failure rejection;
- Hard still bounded;
- candidate-limit performance.

Keep this system modular: pressure, cooldown, recovery, repetition, difficulty, impact estimation, and approval should be independently testable.
```

# Prompt 10 — Adaptive Scenario Director / Hostile Fed

```text
Audit and repair the Adaptive Scenario Director, also called the Hostile Fed.

Objective:
Rank already-eligible event candidates for relevance, narrative coherence, novelty, and lesson value. The director proposes; the Runtime Balance Controller decides whether the proposal is fair.

Inputs should be structured and minimal:

- current RiskSnapshot;
- current macro state;
- eligible event IDs and metadata;
- recent decisions;
- recent events and lesson history;
- difficulty;
- current story or narrative arc, if supported.

Outputs should be structured:

- ranked candidate IDs;
- score components or reason codes;
- intended lesson;
- optional narrative setup;
- no unrestricted dollar amount;
- no direct GameState mutation;
- no event approval flag that bypasses Balance Controller.

Implement or repair deterministic ranking using configured factors such as:

- weakness relevance;
- lesson relevance;
- macro coherence;
- recent player decision relevance;
- novelty;
- underrepresented lesson coverage;
- difficulty fit;
- narrative continuity;
- repetition penalty.

Do not let the director:

- decide that an ineligible event is eligible;
- increase an unrelated event hazard;
- choose severity outside event bounds;
- calculate balances or losses;
- apply financial effects;
- bypass pressure, cooldown, recovery, or impact checks;
- guarantee punishment after every risky choice.

AI is optional. If an LLM is used:

- send only structured, privacy-minimized facts;
- request schema-constrained output;
- validate candidate IDs against the supplied eligible list;
- ignore invented financial values;
- use a deterministic rules-based fallback on timeout, malformed output, or service failure;
- make the game's financial result independent of prose generation;
- log safe reason codes for debugging without storing hidden chain-of-thought.

Preserve the “Hostile Fed” personality in presentation, not in unrestricted financial authority.

Tests must cover:

- deterministic fallback ranking;
- only eligible IDs returned;
- macro-relevant candidate ranking;
- novelty and repetition behavior;
- lesson coverage;
- no financial mutation;
- malformed AI response fallback;
- unknown candidate rejection;
- AI outage;
- Runtime Balance Controller still able to reject the top proposal;
- “no approved event” flow.

Document the boundary between Event System, Scenario Director, Runtime Balance Controller, and Event Resolver.
```

# Prompt 11 — Causal History and Counterfactuals

```text
Audit and repair the Causal History and Counterfactual system.

Objective:
Record enough verified history to explain why outcomes happened and to compare a limited realistic alternative. Do not let AI invent causality.

Use the existing ledger and snapshots where possible. Avoid creating a second unrelated history store.

Record meaningful records for:

- player decisions and policy changes;
- event selection and approved parameters;
- player event responses;
- financial effects;
- risk-metric changes;
- milestone and checkpoint changes;
- end conditions;
- causal links between a decision, vulnerability, event, response, and consequence.

Each causal record should use stable IDs and machine-readable references, for example:

- decision ID;
- event ID;
- response ID;
- transaction IDs;
- affected metrics;
- before and after values;
- lesson tags;
- causal parent IDs;
- simulation timestamp.

Requirements:

1. Causal integrity
   - Explanations must be traceable to actual records.
   - Distinguish direct cause, contributing condition, and correlation.
   - A layoff may directly reduce income; low cash contributes to resulting debt but does not cause the layoff.

2. Turning-point detection
   - Add deterministic rules to identify a small number of high-impact moments.
   - Consider changes in net worth trend, liquidity, high-interest debt, FI projection, forced sales, and recovery.
   - Avoid selecting many nearly identical records.

3. Counterfactual engine
   - Run on demand, at major teaching moments, or at run end—not every month.
   - Start from a saved pre-decision or pre-event snapshot.
   - Change one clearly stated policy or response.
   - Reuse the production Financial Engine.
   - Hold future market and event seeds constant where conceptually valid.
   - Simulate a bounded horizon.
   - Return differences in cash, debt, forced sales, recovery time, FI progress, and other verified outcomes.
   - Label assumptions and avoid pretending the counterfactual is a prediction of real life.

4. Performance and storage
   - Keep compact snapshots at meaningful moments.
   - Do not deep-clone full state each month.
   - Allow pruning or summarizing low-value history while preserving auditability.

5. AI boundary
   - AI may phrase a verified causal explanation.
   - AI may not introduce a cause absent from the structured history.
   - Provide a deterministic template fallback.

Tests must cover:

- causal-link creation;
- distinction between event cause and vulnerability;
- turning-point selection;
- counterfactual changing only the intended decision;
- same future seed where applicable;
- production-engine reuse;
- no mutation of the real run;
- bounded runtime;
- save/load history integrity;
- deterministic explanation facts.
```

# Prompt 12 — Teaching, Checkpoints, and Debrief

```text
Audit and repair the Teaching, Checkpoint, and Debrief system.

Objective:
Convert verified game state and causal history into short, timely, beginner-friendly instruction. It must never become a second financial calculator.

Implement or repair three feedback levels:

1. Just-in-time explanation
   - Trigger the first time a concept becomes relevant or when the player requests help.
   - Explain what it is and why it matters now in one or two concise paragraphs.
   - Cover configured concepts such as emergency funds, DTI, deductible, employer match, diversification, compounding, FI, restricted retirement assets, and job-investment correlation.
   - Use verified player numbers supplied by the engine.

2. Periodic checkpoint
   - Trigger at configured intervals or important milestones.
   - Summarize income, essential spending, discretionary spending, debt change, contributions, employer match, investment change, net worth, liquid solvency, emergency-fund months, FI progress, age, and current risks.
   - Aggregate hidden monthly ticks rather than rendering each month.
   - Let the player adjust policies after the checkpoint.

3. Final debrief
   - Present the deterministic grade and end reason.
   - Show outcome, financial-discipline dimensions, and learning mastery if supported.
   - Select two or three verified turning points.
   - Explain direct causes and contributing vulnerabilities accurately.
   - Show one or two bounded counterfactuals.
   - Identify strong decisions as well as mistakes.
   - Recommend a small number of concrete improvements for another run.

Teaching requirements:

- Read only verified structured facts from GameState, Goal Result, Risk Snapshot, and Causal History.
- Do not recalculate balances, grades, or event impacts in the presentation layer.
- Keep internal fact IDs or source references so every displayed number can be traced.
- Avoid moralizing, shame, or implying that all financial hardship is personal failure.
- Distinguish bad luck from preparation and response.
- Avoid walls of text; use progressive disclosure and a glossary.
- Provide deterministic template copy when AI is unavailable.

If AI is used:

- send a constrained fact packet;
- require structured output;
- validate all mentioned amounts and percentages against supplied facts;
- reject or replace unsupported claims;
- use a timeout and fallback;
- do not block monthly simulation.

Learning mastery may track:

- concepts encountered;
- whether the player predicted consequences;
- whether a mistake was corrected;
- repeated mistakes;
- successful application of a principle.

Do not infer mastery solely from wealth.

Tests must cover:

- checkpoint aggregation;
- exact number traceability;
- grade matches Goal System;
- unsupported AI amount rejection;
- AI outage fallback;
- direct cause versus contributing condition wording;
- turning-point limit;
- glossary first-use behavior;
- no financial state mutation;
- concise output constraints where implemented.
```

# Prompt 13 — Onboarding and State Initialization

```text
Audit and repair the Onboarding and State Initialization system.

Objective:
Turn a persona selection or user-provided financial description into a valid initial GameState. Do not create a separate state model that diverges from the authoritative schema.

Support the repository's intended inputs, such as:

- age;
- location;
- employment and industry;
- gross or take-home income;
- essential and discretionary expenses;
- cash;
- investments;
- retirement accounts;
- debts and rates;
- dependents;
- insurance and benefits;
- employer match;
- lifestyle;
- financial goals.

Implement or repair a pipeline equivalent to:

1. collect typed input or select a persona;
2. optionally parse free text into a typed draft;
3. normalize units, time periods, and currency;
4. validate required fields and ranges;
5. resolve missing values through explicit defaults or product-approved lookup data;
6. record assumptions;
7. construct the authoritative GameState;
8. calculate initial derived metrics through owning systems;
9. show a review screen before starting;
10. persist the initial seed and schema version.

Rules:

- AI parsing is optional and untrusted.
- AI may extract candidate values but deterministic validation must approve them.
- Do not let AI silently invent debts, assets, salary, tax rates, or coverage.
- Clearly show assumed or estimated values.
- Keep localization data versioned and separate from calculation code.
- Do not make a live network request necessary to start or simulate a run.
- Provide stable built-in persona fixtures for tests and demos.
- Use privacy-minimized logs and avoid storing raw free text unnecessarily.

Handle ambiguous income periods and units explicitly, such as annual versus monthly and gross versus take-home. Reject impossible combinations with actionable errors.

Tests must cover:

- each built-in persona;
- complete typed input;
- partial input and documented defaults;
- malformed free-text parse;
- annual/monthly normalization;
- gross/take-home distinction;
- debt rate and balance validation;
- allocation validation;
- unknown location fallback;
- no AI availability;
- deterministic initial GameState for the same normalized input and seed;
- schema compatibility with save/load.

Do not duplicate risk, FI, tax, or cash-flow formulas here. Call the owning deterministic systems after initial state construction.
```

# Prompt 14 — Offline Balance Lab

```text
Audit and repair the Offline Balance Lab and headless simulation harness.

Objective:
Test whether player strategy matters more than luck and tune configuration before release. This system runs during development or CI, never inside a normal player run.

The harness must import and reuse the production:

- GameState;
- Financial Engine;
- Time Controller;
- Player Action System;
- Macro/Market System;
- Event System;
- Scenario Director fallback;
- Runtime Balance Controller;
- Goal and Grading System.

Do not duplicate formulas.

Support strategy bots equivalent to:

- disciplined;
- average beginner;
- aggressive investor;
- debt-heavy lifestyle;
- cash hoarder;
- random-choice control.

Each bot should use explicit, reviewable policies rather than hidden cheating.

Support matched-seed experiments:

- same persona;
- same macro seed;
- same event seed or event opportunity sequence where compatible;
- different player strategy.

Collect at least:

- bankruptcy rate;
- FI achievement rate;
- retirement FI progress;
- grade distribution;
- displayed net worth and liquid solvency;
- high-interest debt created;
- interest paid;
- forced-sale frequency;
- event count by tier;
- catastrophe count;
- recovery time;
- lesson coverage;
- repeated-lesson rate;
- no-event rate;
- unavoidable-failure rate;
- strategy win rate on matched seeds;
- variance across seeds;
- runtime performance.

Provide:

- a small deterministic sample suitable for CI;
- a separate command for large local or scheduled runs;
- JSON and CSV output, or the repository's preferred report format;
- summary tables;
- configuration hash and code version in reports;
- confidence intervals or sample-size warnings where useful.

Add configurable acceptance checks rather than hard-coding product claims. Initial checks may include:

- prepared strategy outperforms reckless strategy on most matched seeds;
- healthy starting personas have very low unavoidable bankruptcy on Normal;
- prepared players show a meaningful impact reduction for relevant events;
- major-event pacing respects configured limits;
- lesson repetition stays below a configured threshold;
- no single strategy dominates every objective.

Do not automatically rewrite production configuration from one noisy run. If tuning support is added, output recommended changes for human review.

Tests must cover:

- headless run completion;
- exact repeatability;
- matched-seed setup;
- bot policy validity;
- report schema;
- production-engine reuse;
- small CI sample;
- graceful handling of invalid event config;
- performance.

Document exact commands for quick, medium, and large simulation batches.
```

# Prompt 15 — Final integration and regression audit

```text
Perform a final integration audit after the individual systems have been repaired.

Do not redesign the game. Verify that the systems compose correctly and fix only integration defects.

Audit the end-to-end pipeline:

Onboarding
→ Authoritative GameState
→ Player Policies
→ Time Controller
→ Financial Engine
→ Macro update
→ Risk Snapshot
→ Event eligibility and hazard
→ Scenario Director ranking
→ Runtime Balance approval
→ Event response
→ Event Resolver
→ Financial Engine effects
→ Causal History
→ Checkpoint or Teaching
→ Goal and End Conditions
→ Save/load and replay
→ Offline Balance Lab

Verify ownership boundaries:

- only Financial Engine changes money through approved operations;
- only Goal System assigns end reason and grade;
- Risk Analyzer measures but does not create events;
- Event System defines eligibility and effects;
- Scenario Director ranks but does not approve;
- Runtime Balance Controller approves fairness but does not invent unrestricted effects;
- AI does not calculate or mutate financial state;
- Teaching uses verified facts;
- Balance Lab imports production logic.

Search for and remove or redirect:

- duplicate net-worth formulas;
- duplicate FI formulas;
- duplicate bankruptcy checks;
- duplicate interest calculations;
- unseeded randomness;
- network calls in monthly simulation;
- UI-side financial calculations;
- event logic bypassing balance;
- stale derived-state caches;
- deep state serialization every month;
- conflicting difficulty or Exposure logic.

Add or repair end-to-end tests for:

1. complete deterministic run from onboarding to retirement;
2. FI early ending;
3. bankruptcy ending;
4. event rejected by runtime balance and simulation continuing;
5. major event, recovery window, and later recovery;
6. prepared versus unprepared matched-seed outcome;
7. save, reload, and identical continuation;
8. AI unavailable with deterministic fallback;
9. 480-month headless performance;
10. one small Balance Lab batch.

Run all repository checks and provide a final system matrix containing:

- system;
- authoritative files;
- public interface;
- state owned;
- test coverage;
- known limitations.

Do not claim architectural completion if any system still has competing ownership or unverified financial formulas. Report remaining limitations honestly.
```
