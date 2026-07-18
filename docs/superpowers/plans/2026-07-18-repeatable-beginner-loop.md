# Repeatable Beginner Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-month contextual continuation that safely repeats eligible transactions, then strengthen and measure the 12-month beginner game with a hybrid checkpoint and meaningful event choices.

**Architecture:** Pure core/application calculators own checkpoint and continuation decisions; the React board only renders those decisions and submits one authoritative turn at a time. New event templates use existing deterministic effect primitives, while Balance Lab measures the resulting chapter and interaction distributions without enabling challenge-fit selection.

**Tech Stack:** TypeScript 5.9, React 19, Next.js 16, Zod, Vitest 4, existing command/replay engine and Balance Lab V1.

## Global Constraints

- Keep going advances exactly one month per click and never batches months.
- Only taxable investments and revolving-credit payments repeat in this release.
- Courses, strategy changes, lifestyle changes, and credit draws are advance-only after their first application.
- Every repeat rebuilds the plan from the latest authoritative run and uses a fresh command ID and expected revision.
- Events, course completion, chapter checkpoint, terminal outcome, new critical preparedness, new 80% credit utilization, and unavailable actions stop continuation in that priority order.
- Event occurrence and gross parameters remain seeded and independent of player wealth or preparedness.
- Existing template identities, Runtime Balance V1 decisions, replay evidence, and persisted commands retain their meanings.
- `runtime-balance-v2` remains disabled unless a sufficient calibration run passes.
- Preserve untracked `.agents/` and `skills-lock.json`; they are outside this implementation.

---

### Task 1: Beginner Checkpoint and Run Projection

**Files:**
- Create: `src/core/beginner-chapter-v1.ts`
- Create: `src/core/__tests__/beginner-chapter-v1.test.ts`
- Modify: `src/application/game/run-view.ts`
- Modify: `src/application/game/__tests__/run-view.test.ts`
- Modify: `src/contracts/api/contracts.ts`
- Modify: `src/contracts/api/__tests__/contracts.test.ts`

**Interfaces:**
- Consumes: `PreparednessAssessmentV1`, `GameStateV2.startMonth`, `GameStateV2.currentMonth`, and authoritative outcome.
- Produces: `assessBeginnerChapterV1(input): BeginnerChapterAssessmentV1 | null`, plus `startMonth`, `preparedness`, and `beginnerCheckpoint` in `RunView`.

- [ ] **Step 1: Write failing checkpoint boundary and grading tests**

Cover months 0, 11, 12, and 13; exact score boundaries 349,999, 350,000, and 500,000; bankruptcy override; frozen output; deterministic weakest-component tie order.

```ts
expect(assessBeginnerChapterV1({
  startMonth: simulationMonth("2026-01"),
  currentMonth: simulationMonth("2027-01"),
  preparedness: assessment({ scorePpm: 350_000, band: "exposed" }),
  outcome: null,
})).toMatchObject({
  version: "beginner-chapter-v1",
  outcome: "developing",
  completed: true,
  scorePpm: 350_000,
});
```

- [ ] **Step 2: Run the new core test and verify RED**

Run: `pnpm vitest run src/core/__tests__/beginner-chapter-v1.test.ts`

Expected: FAIL because `../beginner-chapter-v1` does not exist.

- [ ] **Step 3: Implement the pure checkpoint calculator**

```ts
export type BeginnerChapterOutcomeV1 =
  | "bankrupt"
  | "fragile"
  | "developing"
  | "strong";

export type BeginnerChapterAssessmentV1 = Readonly<{
  version: "beginner-chapter-v1";
  checkpointMonth: SimulationMonth;
  outcome: BeginnerChapterOutcomeV1;
  completed: boolean;
  scorePpm: number;
  preparednessBand: PreparednessAssessmentV1["band"];
  weakestComponent: keyof PreparednessAssessmentV1["components"];
  lessonKey: string;
}>;
```

Return `null` unless `monthsBetween(startMonth, currentMonth) === 12`. Use the
first minimum in `liquidity`, `cashFlow`, `debt`, `insurance`,
`diversification` order. Bankruptcy returns `bankrupt` and `completed: false`;
otherwise scores below 350,000 are fragile, 350,000-499,999 are developing,
and 500,000 or more are strong.

- [ ] **Step 4: Project checkpoint evidence through RunView and Zod**

In `projectRunView`, calculate risk once, call `assessPreparednessV1(risk)`,
then call `assessBeginnerChapterV1`. Add strict schemas for the exact versions,
bands, component keys, and checkpoint outcomes. Add contract tests that reject
unknown versions and out-of-range scores.

- [ ] **Step 5: Run focused projection and contract tests**

Run: `pnpm vitest run src/core/__tests__/beginner-chapter-v1.test.ts src/application/game/__tests__/run-view.test.ts src/contracts/api/__tests__/contracts.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit checkpoint projection**

```bash
git add src/core/beginner-chapter-v1.ts src/core/__tests__/beginner-chapter-v1.test.ts src/application/game/run-view.ts src/application/game/__tests__/run-view.test.ts src/contracts/api/contracts.ts src/contracts/api/__tests__/contracts.test.ts
git commit -m "Add beginner chapter checkpoint"
```

### Task 2: Explicit Continuation Policy and Evaluation

**Files:**
- Modify: `src/features/board/plan-catalog.ts`
- Modify: `src/features/board/__tests__/plan-catalog.test.ts`
- Create: `src/features/board/board-continuation.ts`
- Create: `src/features/board/__tests__/board-continuation.test.ts`

**Interfaces:**
- Consumes: `RunViewWire`, a previously selected `BoardPlan`, and `plansForDestination`.
- Produces: `evaluateBoardContinuationV1(input): BoardContinuationDecisionV1`.

- [ ] **Step 1: Write failing policy tests**

Assert that all three taxable investment plans and `bank.pay-credit` use
`repeat_transaction`; every other current plan uses `advance_only`.

```ts
expect(planById(run, "financial.broad-index").continuation).toEqual({
  kind: "repeat_transaction",
  verb: "Invest another",
});
```

- [ ] **Step 2: Add explicit plan continuation metadata**

```ts
export type BoardPlanContinuationV1 =
  | Readonly<{ kind: "repeat_transaction"; verb: string }>
  | Readonly<{ kind: "advance_only" }>;
```

Add the field to every plan literal. Do not infer continuation from the action
type in the evaluator.

- [ ] **Step 3: Write failing evaluator tests**

Cover the exact stop priority, course disappearance, exact 800,000 ppm credit
crossing, critical-band crossing, existing warning bands, a recalculated
partial debt payment, an unavailable repeat, and advance-only continuation.

```ts
expect(evaluateBoardContinuationV1({ opening, ending, plan })).toEqual({
  kind: "stop",
  reason: "pending_event",
  message: "Review the life decision before continuing.",
});
```

- [ ] **Step 4: Implement the pure evaluator**

```ts
export type BoardContinuationDecisionV1 =
  | Readonly<{ kind: "repeat_transaction"; plan: BoardPlan; primaryLabel: string }>
  | Readonly<{ kind: "advance_only"; primaryLabel: "Continue one month" }>
  | Readonly<{ kind: "stop"; reason: BoardContinuationStopReasonV1; message: string }>;
```

Use `BigInt(creditUsedCents) * 1_000_000n / BigInt(creditLimitCents)` for safe
utilization comparison. Rebuild the repeated plan from `ending`; use its
current label/effect amount and disabled reason.

- [ ] **Step 5: Run continuation policy tests**

Run: `pnpm vitest run src/features/board/__tests__/plan-catalog.test.ts src/features/board/__tests__/board-continuation.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit continuation decisions**

```bash
git add src/features/board/plan-catalog.ts src/features/board/board-continuation.ts src/features/board/__tests__/plan-catalog.test.ts src/features/board/__tests__/board-continuation.test.ts
git commit -m "Add board continuation policy"
```

### Task 3: One-Month Continuation Execution

**Files:**
- Modify: `src/features/board/turn-commit.ts`
- Modify: `src/features/board/__tests__/turn-commit.test.ts`

**Interfaces:**
- Consumes: `BoardContinuationDecisionV1`, `TurnClient`, latest `RunViewWire`, and fresh phase IDs.
- Produces: `continueBoardTurn(input): Promise<BoardTurnCommitResult | BoardContinuationStoppedV1>`.

- [ ] **Step 1: Write failing executor tests**

Assert one repeat click sends exactly `take_detailed_action`, then
`process_month`; advance-only sends only `process_month`; stop sends no command;
action failure stops before month; month failure preserves applied-plan
recovery evidence.

- [ ] **Step 2: Implement the executor by reusing `commitBoardTurn`**

```ts
export async function continueBoardTurn(input: Readonly<{
  client: TurnClient;
  opening: RunViewWire;
  decision: BoardContinuationDecisionV1;
  previousPlan: BoardPlan;
  createId: (phase: "plan" | "month") => string;
}>): Promise<BoardTurnCommitResult | Readonly<{ kind: "stopped" }>>;
```

For `repeat_transaction`, pass `decision.plan` to `commitBoardTurn`. For
`advance_only`, pass an immutable copy of `previousPlan` whose command is
`{ type: "none" }`. Return `stopped` without invoking the client for a stop
decision.

- [ ] **Step 3: Verify idempotent recovery behavior**

Add an ambiguous action-acceptance test using `recoverBoardTurnFailure` and
assert that the recovery path submits only `process_month`, never the detailed
action again.

- [ ] **Step 4: Run executor tests**

Run: `pnpm vitest run src/features/board/__tests__/turn-commit.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit continuation execution**

```bash
git add src/features/board/turn-commit.ts src/features/board/__tests__/turn-commit.test.ts
git commit -m "Execute one-month board continuations"
```

### Task 4: Contextual Result Dialog and Board Integration

**Files:**
- Modify: `src/features/board/month-result-dialog.tsx`
- Modify: `src/features/board/board-shell.tsx`
- Modify: `src/features/board/board-model.ts`
- Modify: `src/features/board/__tests__/planning-surfaces.test.tsx`
- Modify: `src/features/board/__tests__/board-mode-integration.test.ts`
- Modify: `src/app/styles/board.css`

**Interfaces:**
- Consumes: the continuation evaluator/executor and beginner checkpoint.
- Produces: explicit primary/secondary result actions and interruption copy.

- [ ] **Step 1: Write failing dialog rendering tests**

Test **Invest another $500**, **Pay another $320**, **Continue one month**,
**Review life decision**, checkpoint review, warning copy, unavailable-plan
copy, **Choose a different plan**, and disabled busy actions.

- [ ] **Step 2: Extend the dialog contract**

```ts
type MonthResultDialogProps = Readonly<{
  busy: boolean;
  onPrimary: () => void;
  onSecondary: () => void;
  primaryLabel: string;
  secondaryLabel: string | null;
  summary: string | null;
  result: BoardMonthResult | null;
  returnFocusTarget: HTMLElement | null;
}>;
```

Keep event review as the primary owner when an event is pending. Render the
secondary action only when non-null.

- [ ] **Step 3: Integrate continuation in BoardShell**

Retain the previous `BoardPlan` alongside `monthResult`. On primary click,
evaluate against that result's opening and current run. Close the result for an
event; otherwise call `continueBoardTurn`, then replace the result with the next
month. On secondary click, clear the result and return to ordinary planning.
Use the existing failure adoption path for both first turns and continuations.

- [ ] **Step 4: Add checkpoint and interruption presentation**

Show checkpoint outcome, preparedness score, weakest component, and lesson key
at month 12. A stop decision never submits a command. Style the action row with
the existing board visual language and preserve focus trapping/restoration.

- [ ] **Step 5: Run focused board tests**

Run: `pnpm vitest run src/features/board/__tests__/planning-surfaces.test.tsx src/features/board/__tests__/board-mode-integration.test.ts src/features/board/__tests__/modal-focus.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the board experience**

```bash
git add src/features/board/month-result-dialog.tsx src/features/board/board-shell.tsx src/features/board/board-model.ts src/features/board/__tests__ src/app/styles/board.css
git commit -m "Add contextual keep-going turns"
```

### Task 5: Meaningful Beginner Event Content

**Files:**
- Modify: `src/data/personal-event-templates-v2.ts`
- Modify: `src/core/__tests__/personal-event-v2.test.ts`
- Modify: `src/core/__tests__/personal-event-v2.integration.test.ts`
- Modify: `src/lab/balance-lab-v1-bots.ts`
- Modify: `src/lab/__tests__/balance-lab-v1-bots.test.ts`

**Interfaces:**
- Consumes: existing personal-event V2 effects, follow-ups, validation, and bot mappings.
- Produces: at least six new unique template IDs and deterministic prepared/reckless response policies.

- [ ] **Step 1: Write failing catalog-quality tests**

Require at least ten active templates, at least six multi-choice beginner
decisions, unique identities, deep freezing, valid follow-up references, and
materially distinct canonical response effects.

- [ ] **Step 2: Add the transport-repair pair**

Add `personal.transport_repair` with pay-now, three-month payment-plan, and
defer responses. Defer schedules `personal.transport_repair_followup`, whose
independently seeded range is strictly higher than the original range.

- [ ] **Step 3: Add four more trade-off templates**

Add `personal.rent_renewal`, `personal.family_care_request`,
`personal.work_device_replacement`, `personal.reduced_work_hours`, and
`personal.social_commitment`. Use only `temporary_expense`,
`recurring_expense`, `annual_living_cost_delta`, and `wellbeing_delta` effects.
Every template has two or three responses with different canonical effect
arrays and bounded one-to-six-month recovery.

- [ ] **Step 4: Map prepared and reckless bot responses**

Prepared bots select lower-total-cost or recoverable responses; reckless bots
select deferral, higher-total payment plans, or permanent lifestyle cost where
available. Random control remains unchanged.

- [ ] **Step 5: Run catalog, effect, integration, and bot tests**

Run: `pnpm vitest run src/core/__tests__/personal-event-v2.test.ts src/core/__tests__/personal-event-effects-v2.test.ts src/core/__tests__/personal-event-v2.integration.test.ts src/lab/__tests__/balance-lab-v1-bots.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit event content**

```bash
git add src/data/personal-event-templates-v2.ts src/core/__tests__/personal-event-v2.test.ts src/core/__tests__/personal-event-v2.integration.test.ts src/lab/balance-lab-v1-bots.ts src/lab/__tests__/balance-lab-v1-bots.test.ts
git commit -m "Expand beginner financial decisions"
```

### Task 6: Beginner Interaction and Hybrid Outcome Metrics

**Files:**
- Modify: `src/lab/balance-lab-v1-contracts.ts`
- Modify: `src/lab/balance-lab-v1-production.ts`
- Modify: `src/lab/balance-lab-v1-metrics.ts`
- Modify: `src/lab/balance-lab-v1-reports.ts`
- Modify: `src/lab/balance-lab-v1-acceptance.ts`
- Modify: `src/lab/__tests__/balance-lab-v1-metrics.test.ts`
- Modify: `src/lab/__tests__/balance-lab-v1-config-acceptance-reports.test.ts`
- Modify: `balance-lab.config.json`

**Interfaces:**
- Consumes: terminal balance observations, resolved event evidence, and `assessBeginnerChapterV1`.
- Produces: checkpoint distribution, completion rate, decision-event pacing, unique-choice coverage, and beginner-scoped acceptance evidence.

- [ ] **Step 1: Write failing aggregation tests**

Build frozen synthetic runs covering all four chapter outcomes, 0/1/6 decision
events, repeated template identities, single-response acknowledgements, and
approved light/meaningful/crisis bands. Assert counts, rates, Wilson intervals,
and stable CSV/Markdown output.

- [ ] **Step 2: Add raw production evidence**

Record whether each resolved event had at least two available choices, its
template identity, and its chosen response. Derive the terminal checkpoint from
the final preparedness observation for 12-month runs.

- [ ] **Step 3: Aggregate hybrid and interaction metrics**

Add `beginnerChapter` to the metric summary with outcome distribution,
completion rate, median decision count, unique decision-template count, and
meaningful-or-crisis approved rate. Reuse the existing integer rate and Wilson
interval functions.

- [ ] **Step 4: Scope acceptance rules to beginner**

Add optional `tierIds` to acceptance rules. Absence continues to apply a rule
to every tier; `tierIds: ["beginner"]` applies the new checkpoint, hybrid
bankruptcy, recovery, challenge-mix, and pacing gates only to beginner.
Replace the obsolete prepared-versus-reckless threshold of 1 ppm with the
approved 200,000 ppm beginner target.

- [ ] **Step 5: Render and validate reports**

Extend strict JSON decoding, canonical CSV, and Markdown with the new fields.
Empty or non-12-month cohorts produce zero-count evidence and insufficient
sample results, never fabricated passes.

- [ ] **Step 6: Run focused lab tests**

Run: `pnpm vitest run src/lab/__tests__/balance-lab-v1-metrics.test.ts src/lab/__tests__/balance-lab-v1-config-acceptance-reports.test.ts src/lab/__tests__/balance-lab-v1.production-owners.integration.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit lab gates**

```bash
git add src/lab balance-lab.config.json
git commit -m "Measure hybrid beginner outcomes"
```

### Task 7: Operational Calibration and Final Gate

**Files:**
- Modify only when profiling identifies a measured bottleneck in `src/lab/` or `scripts/run-balance-lab.mjs`.
- Create: `docs/superpowers/results/2026-07-18-repeatable-beginner-loop.md`

**Interfaces:**
- Consumes: Tasks 1-6 and the committed 200-seed beginner configuration.
- Produces: fresh verification evidence and an evidence-backed production activation decision.

- [ ] **Step 1: Run focused compatibility tests**

Run: `pnpm vitest run src/features/board/__tests__ src/core/__tests__/monthly-turn-v2.test.ts src/core/__tests__/runtime-balance-controller-v2.test.ts src/server/db/__tests__/causal-history-replay.integration.test.ts`

Expected: PASS with unchanged historical V1 replay evidence.

- [ ] **Step 2: Run the complete repository verification**

Run: `pnpm verify`

Expected: lint, typecheck, all regular and long-run tests, and production build pass.

- [ ] **Step 3: Run an exploratory 25-seed calibration**

Copy `balance-lab.config.json` to the ignored path
`.balance-lab-dist/beginner-25.config.json`, change only
`tiers.beginner.matchedSeedCount` from 200 to 25 in that copy, and leave the
committed default untouched. Run:

```text
node scripts/run-balance-lab.mjs --size beginner --config .balance-lab-dist/beginner-25.config.json --output .balance-lab-dist/beginner-25
```

Record outcome, interaction, recovery, and challenge distributions. Use the
result only for tuning, never activation.

- [ ] **Step 4: Make the 200-seed run complete within 300,000 ms**

Profile before editing. If the measured bottleneck is repeated report work,
move aggregation after all runs; if it is sequential independent seeds, add
bounded deterministic workers whose results are sorted by persona, seed, and
bot before canonical aggregation. Add a determinism test comparing one worker
and multiple workers on the same small cohort.

- [ ] **Step 5: Run the committed 200-seed cohort**

Run: `node scripts/run-balance-lab.mjs --size beginner`

Expected: complete artifacts and explicit pass/fail/insufficient evidence, with
no timeout and no manual threshold override.

- [ ] **Step 6: Record every target and activation decision**

Write the exact configuration hash, commit, fingerprints, sample counts,
confidence intervals, checkpoint outcomes, bankruptcy groups, recovery,
challenge mix, event pacing, runtime, limitations, and go/no-go decision. Keep
Runtime Balance V1 authoritative on any failed or insufficient gate.

- [ ] **Step 7: Run final verification and commit**

Run: `pnpm verify`

Then:

```bash
git add docs/superpowers/results/2026-07-18-repeatable-beginner-loop.md
git commit -m "Record repeatable beginner calibration"
```
