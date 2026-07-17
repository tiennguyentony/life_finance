# Prompt 15 final integration and regression audit

Audit date: 2026-07-16

Branch: `codex/prompts-02-15`

Scope: the complete Prompt 02 through Prompt 15 implementation, including the
previously landed Prompt 00 and Prompt 01 foundations.

## Result

The audited local branch is release-candidate clean for all credential-free
paths. Prompt 15 found and repaired eight cross-system defects. The complete
TypeScript verification, production build, Python tax-service verification,
480-month production journey, deterministic Offline Balance Lab run, and
credential-free end-to-end journeys pass.

No known P0 or P1 product defect remains in an active modern path. Two optional
live integration groups remain environment-gated: PostgreSQL requires
`TEST_DATABASE_URL`, and Groq/Ollama require explicit live-provider settings.
Those tests were collected and skipped, not treated as passes.

## Commit ledger

Each requested prompt has an isolated implementation commit with a detailed
commit body. Prompt 02 includes the completion of the partial implementation
that existed at the start of this work.

| Prompt | Commit | Delivered result |
| --- | --- | --- |
| 00 | `8ac8535` | Repository-wide architecture audit. |
| 01 | `9fa486b` | Authoritative state and ledger completion; earlier Prompt 01 slices remain in its commit series. |
| 02 | `4db776f` | Strict financial transitions, persisted selectors, migration, and historical replay. |
| 03 | `80c41d6` | Deterministic bounded time control and typed stop behavior. |
| 04 | `70ed2c6` | Deterministic financial goals, terminal outcomes, and grading. |
| 05 | `c106eed` | Strict detailed actions, preview parity, and recurring strategy policies. |
| 06 | `704998b` | Immutable, transparent Risk v1 analysis. |
| 07 | `3984230` | Seeded macro/market model and isolated world-random streams. |
| 08 | `a44a36f` | Declarative personal-event catalog, resolver, lifecycle, and effects. |
| 09 | `d8ad48f` | Runtime Balance policy, impact preflight, approval/rejection, and recovery. |
| 10 | `4e0ff2d` | Scenario Director rank-only policy with strict deterministic fallback. |
| 11 | `d1d8ade` | Verified causal history, turning points, and bounded counterfactual replay. |
| 12 | `9048632` | Verified teaching moments, checkpoints, debriefs, and safe optional rewriting. |
| 13 | `9884678` | Review/confirm onboarding and authoritative native state construction. |
| 14 | `99f1a61` | Offline Balance Lab, production-owner adapters, bots, reports, and CLI. |
| 15 | current audit commit | Cross-system repair, final journeys, verification evidence, and this report. |

## Final system ownership matrix

| System | Authoritative owner and public boundary | State/evidence owned | Final verification |
| --- | --- | --- | --- |
| Onboarding | `onboarding-v1.ts`, onboarding contracts, API service, browser flow | confirmed typed inputs and immutable opening evidence | review/confirm browser, API, state, and 480-month journey tests pass |
| GameState and Ledger | `game-state-v2.ts`, validators, `state-transition-v2.ts`, `ledger.ts` | authoritative aggregate, accepted commands, balanced immutable transactions | validation, overflow, immutability, transition, and replay tests pass |
| Player Policies | `detailed-actions-v2.ts`, recurring/action policy modules | player intent and recurring policy only | preview/apply parity and cross-month policy tests pass |
| Time Controller | `time-controller-v2.ts` and v2 service orchestration | ordered progress and typed pause/terminal reasons | multi-month, FI stop, terminal re-entry, and long-run tests pass |
| Financial Engine | Financial Kernel, payroll, debt, obligation funding, financial transition | every monetary change, shortfall, and ledger delta | units, integration journeys, custom-catalog continuation, and reconciliation pass |
| Macro and Market | `market.ts`, `macro-story-v2.ts`, named world RNG | regime, return, inflation, macro story, macro RNG namespace | deterministic and stream-isolation tests pass |
| Risk and Resilience | `risk-v1.ts`, `risk-policy-v1.ts` | derived facts/bands only; never an incident or money change | formula delegation, immutability, UI/AI consumption tests pass |
| Personal Events | catalog, scheduler, lifecycle, resolver, event effects | eligibility, pending/history state, scheduled financial flows | matched-event, exactly-once, preparation, lifestyle, and recovery journeys pass |
| Scenario Director | director policy plus canonical `scenario-director-context-v2.ts` | candidate ordering, reasons, and bounded context evidence only | tamper rejection, context equality, AI fallback, and controller integration pass |
| Runtime Balance | state/policy/impact/controller v2 modules | pressure, cooldown, recovery, sampled approval/rejection evidence | all-rejected, later-candidate, recovery countdown, and exact context tests pass |
| Causal History | causal history, turning point, counterfactual, verified repository reader | derived source-linked graph and read-only branch evidence | reducer, HTTP, repository, and teaching consumption tests pass |
| Teaching and Debrief | teaching fact/memory/moment/checkpoint/debrief owners | cited presentation memory; no gameplay authority | deterministic local and invalid/unavailable-AI fallback tests pass |
| Goals and Grading | financial goals, outcome policy, outcomes | FI/retirement/bankruptcy decision and final grade | precedence, exact goal projection, 480-month retirement, and FI stop pass |
| Persistence and Replay | persisted command, repository, replay, snapshot policy | atomic durable commands/evidence/current save and verified anchors | pure replay and in-memory/service tests pass; PostgreSQL live gate is blocked by missing URL |
| Offline Balance Lab | `src/lab/*` production adapter, runner, reports, CLI | offline-only experiment results and aggregates | production import guard, matched runs, two deterministic quick runs, and performance pass |
| Tax service | Python PolicyEngine service plus TypeScript tax orchestrator | versioned tax request/result evidence | 64 Python tests, formatting, lint, types, and TypeScript orchestration tests pass |
| Optional AI | server AI adapters with schema validation and local fallback | rank/rewrite audit data only | invalid/unavailable provider paths pass; six live transport tests are environment-gated |

## Authority and boundary conclusions

- Only the Financial Engine mutates money. Event resolution schedules typed
  flows; the kernel funds them and records one causal ledger transaction.
- Only Goal/Outcome owners assign terminal reason and grade in modern commands.
  The remaining direct bankruptcy block in `monthly-turn-v2.ts` is the frozen
  legacy selector path needed for historical replay.
- Risk measures state but does not create opportunity membership, hazards,
  parameter values, approval, or money changes.
- Scenario Director ranks canonical candidates. Runtime Balance independently
  revalidates and approves/rejects; neither AI nor Director can invent events.
- Teaching consumes verified typed facts and source IDs. Optional AI can only
  rewrite within a strict schema and falls back without changing simulation.
- UI financial displays delegate to core selectors. Display conversion remains
  presentation-only. Total liabilities and net worth retain exact safe-integer
  behavior, including large values that cancel before the final net result.
- Balance Lab imports production owners and has no competing net-worth, FI,
  interest, event-effect, tax, or world-random formula.
- Named RNG streams isolate macro, opportunity, event parameters, balance/
  director, and bot randomness. Static audit found no unseeded randomness in
  active core/lab paths.
- Remaining Exposure v2 calls are compatibility branches selected only for
  legacy/default historical commands. Modern onboarding and monthly execution
  leave Exposure empty; current checkpoint teaching, UI, and AI consumers use
  Risk v1, while frozen checkpoint-v2.1 preserves its legacy replay slot.

## Prompt 15 remediation log

| ID | Severity | Finding | Repair and regression proof |
| --- | --- | --- | --- |
| P15-001 | P1 | Risk duplicated monthly debt interest, minimum-payment, and FI projection formulas. | Delegated to Debt Service and Financial Goal owners; rounding, payoff-capping, and tiny-value tests pass. |
| P15-002 | P1 | Lifestyle changes could apply annual cost deltas outside the Financial owner or be counted twice. | Added `financial-living-cost-plan-v2.ts`; event/action/runtime paths use its exact monthly allocation delta and structured evidence. Two production months prove one bill per month without duplicate flow. |
| P15-003 | P1 | Modern onboarding/UI/teaching/AI paths still treated the legacy Exposure snapshot as current authority. | Redirected active paths to Risk v1, preserved strict legacy compatibility, and added checkpoint/UI/AI regression tests. |
| P15-004 | P1 | Scenario Director's declared recent-decision/story/lesson context was not reachable through the real monthly owner. | Added a canonical bounded context projector, exact tag validation, AI reuse, tamper rejection, and root monthly wiring. |
| P15-005 | P1 | Immutable onboarding expense evidence was compared with inflation-adjusted living cost in later revisions. | Reconcile internally at every revision but compare against authoritative opening living cost only at revision zero; 480-month onboarding journey now passes. |
| P15-006 | P1 | A custom event catalog validated at resolution was lost before the next Financial Kernel month. | Threaded explicit validation options through monthly, kernel, payroll, debt, obligations, transitions, macro, exposure, and event finalizers. Custom large-event continuation passes without globals or relaxed validation. |
| P15-007 | P1 | Onboarding goal UI retained an old local FI calculation. | UI delegates to `financialGoalTargetCents`; display input conversion is the only UI arithmetic left. |
| P15-008 | P1 | Overview UI summed liability fields itself, and the first selector implementation caused premature overflow in net worth. | Added core `calculateTotalLiabilities`; restored bigint-to-final-result net-worth arithmetic; direct and downstream high-value regressions pass. |

All P1 findings above are fixed. The final static review found no P0 and no
unresolved P1 in active modern paths.

## Required end-to-end journeys

| Journey | Executable evidence | Result |
| --- | --- | --- |
| 1. Confirm onboarding, apply production policy, reach retirement with one grade | onboarding state/browser integrations, production Balance Lab integrations, 480-month performance journey | PASS |
| 2. Prepared path reaches FI and Time Controller stops immediately | `final-system-journeys-v1.integration.test.ts` | PASS |
| 3. Bankruptcy only after Financial Engine residual shortfall | `final-system-journeys-v1.integration.test.ts` | PASS |
| 4. Runtime Balance rejects all candidates and next ordinary month continues | final-system and director/controller integrations | PASS |
| 5. Major event resolves/funds once, enters recovery, blocks catastrophe, then exits | final-system plus personal-event integrations | PASS |
| 6. Prepared/unprepared matched gross event produces different player funding impact | final-system plus personal-event integrations | PASS |
| 7. Save/reload continuation preserves selectors, evidence, RNG, ledger, causal history, checksum | `run-repository.integration.test.ts` | BLOCKED_ENV for PostgreSQL execution; equivalent pure reducer/repository-contract coverage passes |
| 8. Invalid/unavailable AI exactly matches deterministic Director and Teaching fallback | final-system, world-director, and teaching service integrations | PASS |
| 9. 480 headless production months complete within release budget | `balance-lab-v1.performance.test.ts` | PASS: 480 months, retirement, grade, 23.75s focused run, budget <40s |
| 10. Matched-seed Balance Lab repeats and matches production owners | production/owner/CLI integrations plus two `balance:quick` executions | PASS |

The public service integration also covers contracts, tax evidence,
time/command mapping, repository port behavior, response schemas, deterministic
fallback, and retry/idempotency without external credentials.

## Verification record

### TypeScript application

Command: `corepack pnpm verify`

- ESLint: pass.
- TypeScript: pass.
- test-layout policy: pass.
- main suite: 132 files and 1,010 tests passed; four files and 38 tests skipped.
- serialized long-run suite: three files and 67 tests passed.
- combined: 135 passing files, 1,077 passing tests, four skipped files, 38
  skipped tests.
- Next.js 16.2.10 production build: pass, including all pages and v1/v2 API
  routes.

The skipped tests are explicit environment gates:

- PostgreSQL: two files and 32 tests skipped because `TEST_DATABASE_URL` is
  absent.
- live Groq/Ollama transports: two files and six tests skipped because live
  integration flags/credentials/endpoints are absent.

Credential-free deterministic AI fallbacks, fake-repository service
integrations, pure replay, and persisted contract tests are included in the
1,077 passing tests.

### Python PolicyEngine tax service

Pinned setup: `python -m uv sync --frozen`

- `ruff format --check .`: pass, seven files already formatted.
- `ruff check .`: pass.
- `mypy tax_service`: pass, four source files.
- `pytest -q`: pass, 64 tests (60 API and four calculator tests).

### Performance and deterministic balance evidence

- 480-month onboarding-to-retirement production run: exactly 480 processed
  months, terminal reason `retirement`, one grade, 480 world-evidence records,
  and all monthly owner/version selector tuples verified. Focused observed time
  was 23.75s against a 40s budget.
- two quick Balance Lab runs: 18 matched runs and 428 production months each.
- both runs produced authoritative deterministic result fingerprint
  `466b411247b23b47c337723925c706413f3a84d2016b5dbfec4c595d7794ef16`.
- observed runtimes were 4,149ms and 4,214ms against a 30,000ms budget.
- six acceptance checks passed and four reported `insufficient_sample`; zero
  acceptance check failed. Report fingerprints intentionally differ because
  observed runtime and dirty-worktree metadata are report fields, not simulation
  inputs.

## Known limitations and operator follow-up

1. Set `TEST_DATABASE_URL` to a disposable PostgreSQL database and run the two
   repository integration files before a database-backed deployment. This is a
   missing environment, not a known persistence failure.
2. Enable Groq/Ollama live integration flags and credentials/endpoints to run
   the six transport tests. Deterministic unavailable/invalid fallbacks already
   pass and remain authoritative.
3. The checked-in PolicyEngine evidence is deliberately pinned to the quick
   cohort's years, salary, filing status, and pretax contribution contexts.
   Medium/large cohorts require a broader pinned evidence tape; live network
   tax calculation is not used as release evidence.
4. The production event catalog has no `large` or `catastrophe` template. Custom
   catalog integration tests prove approval, recovery, blocking, funding, and
   continuation mechanics, but production content must be authored separately.
5. Quick Balance Lab has only 18 runs. Its four insufficient-sample gates are
   honest evidence that it is a smoke/regression cohort, not a population
   estimate. Run medium/large after expanding pinned tax evidence.
6. Legacy Exposure, shared-selector, and frozen outcome branches remain solely
   for replaying historical records. They must not be removed without a formal
   migration and checksum plan.

## Completion decision

Prompt 15 is complete for the local branch: every discovered active-path audit
finding is repaired, all credential-free gates pass, every environment-gated
test is identified with its exact requirement, and Prompts 02 through 15 have
separate detailed commits. GitHub publication is a separate operation and is
not implied by this audit.
