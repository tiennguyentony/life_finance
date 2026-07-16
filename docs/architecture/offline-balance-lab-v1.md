# Offline Balance Lab v1

## Purpose and boundary

The Offline Balance Lab is a development and CI harness. It never runs in a
normal player session and never owns financial, goal, event, or grading
formulas. It compares explicit strategies on matched deterministic worlds by
calling the production reducers and selectors.

The production adapter in `src/lab/balance-lab-v1-production.ts` delegates to:

- recurring strategy and detailed action reducers;
- the Time Controller and monthly Financial Engine;
- regime-v2 Macro/Market simulation;
- declarative Event candidates, Scenario Director fallback, Runtime Balance,
  and the Event Resolver;
- production net-worth, automatic-liquidity, FI-goal, outcome, and grade owners.

The lab adds only orchestration, bot policy evidence, aggregation, acceptance,
and reports. Money changes remain production commands.

## Real CLI pipeline

`scripts/run-balance-lab.mjs` registers the repository TypeScript loader and
executes `scripts/balance-lab-cli.ts`. It is not a test launcher. The CLI:

1. strictly decodes `balance-lab.config.json`;
2. validates the complete event catalog before reading tax evidence or creating
   an artifact directory;
3. resolves the requested bounded cohort;
4. preflights exact tax-evidence coverage;
5. runs the production cohort;
6. runs the same production cohort again and requires byte-equivalent canonical
   run evidence and the same deterministic result fingerprint;
7. aggregates authoritative metrics and evaluates typed acceptance rules;
8. strictly decodes its own report serialization; and
9. atomically replaces the output directory only after every artifact renders.

An invalid catalog raises `INVALID_EVENT_CONFIG`, exits 2, and writes no partial
report. A missing tax context raises `MISSING_TAX_EVIDENCE`; absent medium/large
external evidence raises `TAX_SERVICE_UNAVAILABLE`. No tax estimate fallback is
allowed.

## Commands

```text
pnpm balance:quick
pnpm balance:medium
pnpm balance:large
```

Optional CLI arguments are `--config <file>`, `--output <directory>`, and
`--event-catalog <file>`. Quick uses the checked-in pinned PolicyEngine evidence
bundle in `src/lab/fixtures/quick-tax-evidence-v1.json`.

Medium and large require `BALANCE_LAB_TAX_EVIDENCE_PATH` to identify a
pre-resolved JSON tape with version `policyengine-evidence-tape-v1`, exact
PolicyEngine bundle/rules versions, and every annual salary/pretax context for
the requested horizon. The current workspace has no such external tape, so
medium and large intentionally fail preflight.

Default artifacts are written under `.balance-lab-dist/<size>/`:

- `<size>.report.json` — strict full report and run evidence;
- `<size>.runs.csv` — one row per persona/seed/bot run;
- `<size>.matched.csv` — objective wins and ties by matched cohort;
- `<size>.report.md` — reviewable summary, acceptance, warnings, limitations;
- `<size>.summary.json` — compact automation summary.

Reports include the Git commit, dirty flag, automatic SHA-256 of Prompt 14
source, decoded configuration hash, exact tax-evidence fingerprint, world RNG
version, production-result fingerprint, report fingerprint, and measured
runtime. Runtime changes between executions; the production-result fingerprint
must not.

## Matched world and bot decisions

Each persona/seed cohort starts from the same production-state checksum and four
named world streams: macro, event opportunity, event parameters, and balance
director. Raw opportunity fingerprints contain keyed catalog draws, not
strategy-dependent hazard values. A strategy that terminates does not schedule
another event; matched assertions therefore cover the shared pre-terminal
scheduling prefix.

The six frozen policies are disciplined, average beginner, aggressive investor,
debt-heavy lifestyle, cash hoarder, and random control. Every policy publishes:

- recurring allocations and reserve/insurance targets;
- an explicit monthly intent and description;
- a complete event response map, or an explicit random-valid-choice rule; and
- a reviewable policy summary.

Every processed month records intent id, command, disposition, and any event
id/choice id. Random monthly and event choices consume only the lab-owned bot
cursor; they never read or advance world randomness.

## Metrics and acceptance

The report aggregates bankruptcy, FI, retirement progress, grades, displayed
net worth, liquid solvency, high-interest debt, interest, forced sales, event
tiers, catastrophes, observed liquidity recovery, lesson coverage/repetition,
no-event decisions, authoritative unavoidable failure, matched objective wins,
variance, and runtime.

Recovery is observed, not copied from configured recovery duration: after a
negative player-cost event, the lab counts months until production automatic
liquidity reaches its pre-resolution level. Unavoidable failure is true only for
a production bankruptcy with a Financial Kernel residual shortfall; rejected
event candidates do not imply unavoidable failure.

Typed configurable checks cover:

- prepared-versus-reckless bankruptcy delta;
- healthy-persona cohort-backed unavoidable failure;
- event impact reduction from insurer-paid versus gross cost;
- major-event pacing;
- matched strategy win rate;
- maximum strategy share of sampled objectives led;
- lesson repetition, unavoidable failure, and runtime.

Each check is `pass`, `fail`, or `insufficient_sample` and carries explicit
sample evidence. A report never rewrites production configuration.

## Verification observed on 2026-07-16 (Windows)

- focused Prompt 14 suite: 12 files, 32 tests passed sequentially in 47.85 s;
- real CLI integration: artifact pipeline and invalid-catalog/no-partial-output
  cases both passed;
- global TypeScript check passed;
- focused ESLint passed;
- two independent `pnpm balance:quick` executions both produced result
  fingerprint `30d50a6f1b9c85af692f5491d434753ea77c1b39e54312e8032d9701ac0d7775`;
- the quick cohort planned 432 production months, processed 431 because one
  strategy reached a production terminal outcome, and measured 7.57 s / 6.61 s
  for the first pass (each command also performed the repeatability pass);
- the full 480-month production-equivalent run measured 33.30 s on this host and
  is guarded by a generous 40 s / 45 s test budget.

## Honest limitations

1. The checked-in quick tax bundle covers only 2026–2027, the current Seattle
   single-filer salary, and the documented pretax contribution contexts.
2. Medium/large cannot run without a separately supplied pinned PolicyEngine
   evidence tape; no API or tape is available in this workspace.
3. The four production personal-event templates contain micro and medium events,
   but no large or catastrophe template. Major/catastrophe distribution claims
   remain unsupported until the production catalog changes under versioning.
4. Confidence intervals and matched seeds do not remove persona or policy
   selection bias. These results apply only to the checked-in cohorts and bots.
5. Wall-clock runtime and the report fingerprint can vary by host load. The
   canonical production-result fingerprint and world evidence must remain exact.
6. The external PolicyEngine service is asynchronous; the synchronous headless
   runner consumes only pre-resolved evidence and never makes a monthly network
   call.
