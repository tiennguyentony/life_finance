# Time Controller V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide deterministic elastic monthly pacing from core through persistence and UI, with one authoritative tagged pause result and one aggregate UI update per pause.

**Architecture:** A pure core controller consumes already-resolved monthly payloads and delegates each accepted tick exactly once to `processMonthlyTurnV2`; it owns bounds and pause priority, not simulation formulas. The application layer materializes tax evidence in pure in-memory segments separated by external context-fingerprint lookups, then the repository atomically persists the complete accepted batch and replay evidence before the UI receives one aggregate response.

**Tech Stack:** TypeScript 5.9, Vitest 4, Next.js 16 route handlers, Zod 4 contracts, Drizzle/PostgreSQL repository, React 19 play console, pnpm 11.

## Global Constraints

- The monthly reducer is `processMonthlyTurnV2`; call it exactly once per processed command/tick.
- Stop priority after every tick is terminal outcome > pending event > due life milestone/policy decision > financial warning > checkpoint > requested duration.
- Core hidden loops import no React/Next UI, AI, network, database, filesystem, clock, or unseeded-random facility.
- Tax evidence is resolved before entering each pure in-memory segment; remote calls never occur inside a controller call.
- Runtime Balance pressure behavior belongs to Prompt 09; Prompt 03 must not implement it.
- Preserve `src/core/checkpoints.ts` byte-for-byte as schema-v1 compatibility.
- Every mode is bounded to `1..480` months; explicit stop advances zero months.
- Same starting state, seed, advance command, monthly inputs, and policies must produce the same pause sequence and checksum.
- Use TDD: observe a relevant failing test before production changes, then verify focused and repository-wide gates before each commit.

---

## File map

- `src/core/time-controller-v2.ts`: pure advance command validation, tick loop, pause classification, checkpoint evidence, compact persistence steps, and aggregate UI change calculation.
- `src/core/__tests__/time-controller-v2.test.ts`: real-core controller behavior, dependency boundary, determinism, immutability, and 480-month budget.
- `src/server/api/contracts-v2.ts`: public advance request/response Zod schemas and exported types.
- `src/server/api/service-v2.ts`: authorization, segmented tax-evidence materialization, pure controller execution, and one repository batch call.
- `src/server/api/v2/repository-port.ts`: exposes the batch repository operation.
- `src/server/db/run-repository-contracts.ts`: batch input/result types shared by service and repository.
- `src/server/db/run-repository.ts`: one locked transaction that verifies and persists all accepted segment steps.
- `src/app/api/v2/runs/[runId]/advance/route.ts`: authenticated HTTP entry point for one time-advance request.
- `src/server/api/http.ts`: request parsing and error mapping for the advance route.
- `src/server/api/client.ts`: browser client method for the advance endpoint.
- `src/server/api/__tests__/contracts.test.ts`, `src/server/api/__tests__/service-v2.test.ts`, `src/server/db/__tests__/run-repository.integration.test.ts`: public schema, segmented evidence, atomic persistence/replay, rollback, concurrency, and idempotency proof.
- `src/features/play/play-console.tsx`: replace the sequential request loop with one batch request and exhaustive pause rendering.
- `src/features/play/__tests__/play-model.test.ts`: aggregate UI/pause behavior proof.
- `docs/architecture/system-audit.md`: mark the v2 controller authority and remaining Prompt 03 concerns.

### Task A: Pure deterministic time controller

**Files:**
- Create: `src/core/time-controller-v2.ts`
- Create: `src/core/__tests__/time-controller-v2.test.ts`
- Create: `docs/superpowers/plans/2026-07-16-time-controller-v2.md`

**Interfaces:**
- Consumes: `processMonthlyTurnV2(state, command, dependencies)`, `dueLifeMilestones(state)`, `buildCheckpointEvidenceV2(start, end, records)`, and ordered `ProcessMonthV2Command["payload"]` values.
- Produces:

```ts
export const MAX_TIME_CONTROLLER_MONTHS_V2 = 480;
export type TimeAdvanceModeV2 =
  | { readonly kind: "one_month" }
  | { readonly kind: "months"; readonly months: number }
  | { readonly kind: "until_event" }
  | { readonly kind: "until_checkpoint"; readonly intervalMonths: number }
  | { readonly kind: "until_decision" }
  | { readonly kind: "until_end" }
  | { readonly kind: "resume"; readonly resolvedDecisionId: string; readonly months: number }
  | { readonly kind: "stop" };
export type AdvanceTimeV2Command = Readonly<{
  schemaVersion: 2;
  id: string;
  type: "advance_time_v2";
  maxMonths: number;
  mode: TimeAdvanceModeV2;
  checkpointIntervalMonths?: number;
  monthlyInputs: readonly Readonly<{
    commandId: string;
    payload: ProcessMonthV2Command["payload"];
  }>[];
}>;
export function advanceTimeV2(
  state: GameStateV2,
  command: AdvanceTimeV2Command,
  dependencies?: TimeControllerV2Dependencies,
): TimeControllerV2Result;
```

- `TimeControllerV2Result` returns `monthsAdvanced`, immutable final `state`, tagged `pauseReason`, pending event/decision, checkpoint evidence or `null`, terminal end condition or `null`, ordered `{ command, record, resultingMonth, resultingRevision }` steps, records, and one `uiChanges` aggregate.

- [ ] **Step 1: Write the controller tests before the module exists.** Add fixtures from the native scenario catalog and tests for calm 12 months, forced event, FI/retirement/bankruptcy, checkpoint, resolved-event resume, exact counts, exact call count through one counting wrapper, deterministic checksum/pause sequence, zero-month interruptions/stop, validation, immutable input, one aggregate payload, forbidden-import scan, and 480 calm months under a 25,000 ms Windows CI budget.
- [ ] **Step 2: Run the red suite.** Run `pnpm exec vitest run src/core/__tests__/time-controller-v2.test.ts`; expect failure resolving `../time-controller-v2` because production code does not exist.
- [ ] **Step 3: Implement the minimal controller.** Validate identifier, tagged mode, bounds, checkpoint interval (`1..12`), unique input command IDs, and sufficient inputs; detect zero-month interrupts; build each exact monthly command from current state; call the injected/default reducer once; apply pause priority; build checkpoint evidence only at a checkpoint; freeze all returned arrays/objects; calculate one aggregate from opening/final state and records.
- [ ] **Step 4: Run the green and focused suites.** Run `pnpm exec vitest run src/core/__tests__/time-controller-v2.test.ts src/core/__tests__/monthly-turn-v2.test.ts src/core/__tests__/life-milestones-v2.test.ts`; expect all tests to pass with the 480-month test below 25,000 ms.
- [ ] **Step 5: Run Task A static gates.** Run `pnpm exec tsc --noEmit`, `pnpm exec eslint src/core/time-controller-v2.ts src/core/__tests__/time-controller-v2.test.ts`, and `git diff --check`; expect exit code 0 from each.
- [ ] **Step 6: Commit Task A only.** Run `git add docs/superpowers/plans/2026-07-16-time-controller-v2.md src/core/time-controller-v2.ts src/core/__tests__/time-controller-v2.test.ts` followed by a detailed `git commit` describing contracts, pause priority, purity, red/green proof, terminal/event/milestone/checkpoint coverage, deterministic aggregation, and 480-month timing.

### Task B: Segmented evidence service and atomic batch persistence

**Files:**
- Modify: `src/server/api/contracts-v2.ts`
- Modify: `src/server/api/service-v2.ts`
- Modify: `src/server/api/v2/repository-port.ts`
- Modify: `src/server/db/run-repository-contracts.ts`
- Modify: `src/server/db/run-repository.ts`
- Create: `src/app/api/v2/runs/[runId]/advance/route.ts`
- Modify: `src/server/api/http.ts`
- Modify: `src/server/api/client.ts`
- Modify: `src/server/api/__tests__/contracts.test.ts`
- Modify: `src/server/api/__tests__/service-v2.test.ts`
- Modify: `src/server/db/__tests__/run-repository.integration.test.ts`

**Interfaces:**
- Produces `RunApiServiceV2.advanceTime(runId, accessSecret, request): Promise<AdvanceTimeV2Response>` and `RunRepository.applyTimeAdvanceV2(runId, accessSecret, batch): Promise<AppliedTimeAdvanceV2>`.
- `PreparedTimeAdvanceV2` contains the public request fingerprint, opening revision/checksum, controller result, every exact internal monthly command/record, and final checksum; it contains no callbacks.

- [ ] **Step 1: Write failing contract/service tests.** Assert bounds, exhaustive pause parsing, authorization before tax lookup, no lookup for zero-month interruption, one lookup per distinct tax-context fingerprint, no duplicate lookup while the fingerprint is unchanged, and exactly one repository batch call after all pure segments succeed.
- [ ] **Step 2: Run the service red suite.** Run `pnpm exec vitest run src/server/api/__tests__/contracts.test.ts src/server/api/__tests__/service-v2.test.ts`; expect missing advance schema/method failures.
- [ ] **Step 3: Add public contracts and route plumbing.** Add `advanceTimeV2RequestSchema`, `advanceTimeV2ResponseSchema`, HTTP handler, `POST /api/v2/runs/[runId]/advance`, and client `advanceTimeV2` using the exact Task A mode tags and `1..480` bounds.
- [ ] **Step 4: Implement segmented evidence materialization outside the controller.** In `advanceTime`, load/authorize state once; compute the canonical tax-context fingerprint from economic year, state, filing status, employment gross, pre-tax election amounts, and policy metadata; resolve repository-cached or remote evidence only when that fingerprint differs from the last segment; run a pure in-memory controller segment with that evidence; append its exact steps; recompute the fingerprint from the returned state; continue locally when unchanged or leave the pure segment for one new external lookup when changed. Stop immediately on the controller pause reason. Never call `TaxCalculator` from `advanceTimeV2` or any callback passed into it.
- [ ] **Step 5: Write failing repository integration tests.** Cover the real sequence `authorized opening state -> N commands -> records/tax evidence/ledger -> final state/checksum/outbox`, whole-request idempotency, optimistic conflict, a middle-step reducer/persistence failure with zero committed rows, replay parity, and one outbox aggregate rather than N notifications.
- [ ] **Step 6: Run repository red tests.** Run `pnpm exec vitest run src/server/db/__tests__/run-repository.integration.test.ts`; with `TEST_DATABASE_URL`, expect missing `applyTimeAdvanceV2`; without it, record the suite's explicit database skip and use service unit proof until an integration database is available.
- [ ] **Step 7: Implement one atomic batch transaction.** Lock the run, recheck access/opening revision/checksum and request idempotency, replay each prepared command against the locked state and compare command/record/resulting revision/month/final checksum, insert each accepted command, tax evidence, monthly record, normalized ledger rows, and sparse anchor in order, then update current state once and insert one aggregate outbox row before commit. Reject the entire transaction on any mismatch.
- [ ] **Step 8: Verify Task B.** Run the contract/service/repository commands above, `pnpm exec tsc --noEmit`, targeted ESLint for every Task B file, and `git diff --check`; expect zero failures, while reporting an unavailable PostgreSQL URL as a concern rather than a pass.
- [ ] **Step 9: Commit Task B.** Stage only Task B files and commit with the segmented fingerprint/cache algorithm, remote boundary, transactional replay checks, idempotency/concurrency behavior, exact test counts, and database skip/status in the message.

### Task C: Aggregate play UI, authority documentation, and release verification

**Files:**
- Modify: `src/features/play/play-console.tsx`
- Modify: `src/features/play/__tests__/play-model.test.ts`
- Modify: `docs/architecture/system-audit.md`

**Interfaces:**
- Consumes `client.advanceTimeV2` and the exact Task A pause tags.
- Produces one rendered pause/summary state per batch response; no browser month loop remains.

- [ ] **Step 1: Write failing UI/model tests.** Assert one client request for a 12-month advance, one aggregate notification render, exhaustive event/decision/checkpoint/FI/retirement/bankruptcy/stop labels, and resume after the existing event/milestone resolution commands.
- [ ] **Step 2: Run the UI red suite.** Run `pnpm exec vitest run src/features/play/__tests__/play-model.test.ts`; expect the current sequential month-client behavior to fail the one-request assertion.
- [ ] **Step 3: Replace the browser loop.** Send one advance request, update local run state once from its final state, render the aggregate UI changes and tagged pause, and issue `resume` only after a successful authoritative decision command supplies its resolved ID.
- [ ] **Step 4: Document the repaired authority.** Update the system matrix and Time Controller section with tick authority, segmented external tax boundary, pause priority, one atomic persistence operation, exact save/load resumption, deterministic inputs, UI aggregation, and Prompt 09 exclusion; retain any database/performance gap as partial rather than complete.
- [ ] **Step 5: Run release verification.** Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `git diff --check`; expect exit 0. Also run the PostgreSQL integration command with `TEST_DATABASE_URL` and record its exact pass/skip result.
- [ ] **Step 6: Commit Task C.** Stage only UI/tests/audit changes and commit with the removed browser loop, exhaustive pause UX, documentation authority, full verification counts/timings, and any external API/database omissions.

## Execution record

- Task A is complete: the original missing-module RED and three independent-review regression REDs were observed; the final controller suite passes all 17 tests and the real 480-month run completes in approximately 17–18 seconds under the 25-second Windows CI budget.
- Task B is complete: the contract/service/HTTP/replay focused run passes 120 tests; TypeScript, focused ESLint, and diff checks pass. The 26-test real PostgreSQL suite is present but explicitly skipped because `TEST_DATABASE_URL` is absent.
- Task C implementation and focused verification are complete: the browser loop is removed, one advance request and one pause activity are source-locked by tests, all pause variants render exhaustively, and verified event/milestone resolutions supply resume provenance.
- The task-level commit steps above were intentionally consolidated into one Prompt 03 commit so the repository never lands a partially integrated controller.

## Self-review

- Spec coverage: every Prompt 03 API mode, result field, pause kind/priority, pure-loop boundary, deterministic replay, exact resume, aggregate UI update, persistence evidence, and 480-month proof maps to Tasks A-C.
- Placeholder scan: the plan contains no TBD/TODO, generic error-handling instruction, or unspecified file.
- Type consistency: Task B and Task C consume `AdvanceTimeV2Command`, `TimeControllerV2Result`, and pause tags exactly as Task A defines them.
