# Data and deterministic engine

## Current authority and numeric rules

Schema 2 is the only writable game-state format. New onboarding runs start in schema 2 and active browser commands use engine `4.1.0` internally. Schema-1 decoding, migration, and replay code remains for historical evidence; it is not another product path.

- Money uses signed integer cents.
- Rates use integer parts per million (ppm).
- Simulation time uses calendar months in `YYYY-MM` form.
- State validation, checksums, and a balanced immutable ledger guard each accepted transition.
- The browser never supplies external evidence or random outcomes.

Current monthly evidence stamps include Financial Kernel `2.0.0`, Outcome Policy `1.0.0`, event scheduler `declarative-events-v2`, Scenario Director `scenario-director-v2`, Runtime Balance `runtime-balance-v1`, named world RNG `named-world-rng-v1`, and market calibration `us-balanced-2026-v1`.

## Monthly pipeline

For `process_month`, `RunService` performs this sequence under revision and authorization checks:

1. Load an idempotent prior result or the current authorized state.
2. Reuse tax evidence when the annual tax context fingerprint is unchanged; otherwise obtain fresh evidence.
3. Run the monthly financial transition: income, payroll/tax, obligations, debt, strategy allocation, program progress, and wellbeing.
4. Generate the named market draw and apply calibrated market movement.
5. Evaluate deterministic outcomes and end conditions.
6. Generate eligible declarative event candidates with deterministic named RNG.
7. Freeze exact named-RNG parameters for the bounded candidate set and calculate every candidate's response/impact evidence with production financial logic.
8. Reject unsafe candidates with deterministic pacing, eligibility, response, bankruptcy, recovery, and impact-band rules.
9. Extract the frozen `operational-event-features-v1` numeric vector and rank safe candidates with the bundled `operational-event-ranker-v1` artifact. Invalid artifacts, out-of-domain features, empty safe sets, or unsafe scores fall back to Scenario Director order.
10. Re-run Runtime Balance verification, approve at most one candidate (or none), and persist compact model checksums with the monthly evidence.

The ranker cannot invent an event or change mechanics, probability, parameters, money, lessons, or state. Its only output is order. Feature and artifact checksums are recorded, wall-clock timing is deliberately excluded from authoritative replay evidence, and identical state/command/seed produces byte-identical results.

## Cash shortfall and bankruptcy

Required obligations use the deterministic funding waterfall: cash, then permitted taxable liquidation after the server-owned 1% liquidation cost, then available revolving credit. A residual unfunded obligation creates bankruptcy evidence. Negative cash or net worth by itself is not the bankruptcy rule.

## Production event catalog

The active schema-2 declarative catalog currently has four templates:

| Event | Base monthly hazard | Magnitude | Notes |
| --- | ---: | --- | --- |
| Medical bill | 5% | $1,000–$15,000 | Negative; insurance-dependent choice when eligible |
| Lifestyle upgrade | 8% | $1,200–$24,000 annual change | Trade cash-flow pressure against wellbeing/burnout |
| Performance bonus | 6% | $500–$5,000 | Positive; requires employment; may create utility-rebate follow-up intent |
| Utility rebate | 4% | $100–$1,000 | Positive follow-up/event |

Older templates in legacy modules and tests are retained for compatibility and are not active schema-2 production content. The current catalog does not yet cover job loss, weddings, repairs, dependents, disasters, or other broad life-event families. Documentation and UI must not imply that it does.

## Tax authority

The persistent runtime calls the separate FastAPI service in `services/tax`, pinned to `policyengine[us]` 4.21.0 and PolicyEngine US rules 1.764.6. Policy is frozen at 2026: the Next.js server converts future nominal context to the frozen-year basis and re-inflates returned values. Results are educational estimates, not tax advice; comprehensive local/city tax is out of scope.

Tax evidence is cached by an annual-context fingerprint, so advancing every month does not necessarily call PolicyEngine. A year or relevant household/tax-context change invalidates reuse.

New monthly evidence also preserves a reconciled component breakdown: federal
income tax, state income tax, employee payroll tax, and self-employment tax.
Older saved evidence without those optional fields remains readable and remains
reusable for month processing; its historical month result shows the compatible
total-tax line. The read-only tax summary obtains a fresh component estimate
when an older cache cannot supply one, and reads year-to-date gross income and
total tax from completed payroll ledger entries.

The instant demo does **not** call PolicyEngine. Its deterministic approximation uses simplified federal brackets, a 4% state estimate except configured no-income-tax states, 7.65% employee payroll tax, and 15.3% self-employment payroll tax. It satisfies the same adapter contract only for local play and is not accuracy evidence for the production tax service.

## Persistence

All Drizzle tables have row-level security enabled. The repository owns:

- `game_runs`: current state, revision, checksum, status, and access-secret hash;
- `run_state_snapshots` and `run_state_migrations`;
- `run_scenario_snapshots`;
- `accepted_commands` for revision/idempotency evidence;
- `monthly_tax_evidence` and `monthly_turn_records`;
- `ledger_transactions` and `ledger_postings`;
- `transactional_outbox`;
- `ai_audit_records` for encrypted provider audit data when configured.

Repository writes use transactions and optimistic revision checks. Sparse snapshots plus accepted commands and evidence support deterministic replay without treating every JSON response as authority.

## Operational ML

`pnpm ml:event-data` builds grouped training queries from the production personas, event catalog, Risk Analyzer, impact estimator, and Runtime Balance gates. `pnpm ml:event-train` fits deterministic pairwise logistic regression, applies monotonic constraints, blocks category/tier/template-identity shortcuts, and exports quantized integer coefficients. Seeds 1–18 train; seeds 19–24 validate, preventing row leakage across a query.

The committed v1 artifact trained on 648 queries and 3,240 candidates covering all 21 highest-supported template identities (including the not-yet-activated calibration catalog). Its held-out seed cohort reached 95.83% pairwise accuracy and 90.74% top-one agreement against reward-policy-v1. These numbers measure imitation of the versioned offline utility, not real-player learning or causal proof.

## Implemented but not publicly exposed

The codebase contains deterministic preview, multi-month time control (including stop conditions), checkpoints, causal history, counterfactual analysis, teaching moments, learning replay, debrief services, and an AI world-director service. The active route tree does not expose them. The current board also does not mount the teaching panels.

Teaching, counterfactual, causal-history, and debrief services remain unmounted. Provider-backed LLM modules remain available for future asynchronous narration, but normal monthly play never calls them.
