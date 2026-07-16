# Authoritative Game State and Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Make GameStateV2 the only writable state authority, add transition and ledger provenance guarantees, replace per-command historical snapshots with verified sparse replay, and expose safe migration for old saves.

**Architecture:** Preserve the working v2 financial reducers. Add focused state-authority, transition-validation, runtime-balance-state, snapshot-policy, and state-replay modules around them. Keep v1 as a decoded migration source, make public legacy writes read-only, and reconstruct rare historical/idempotent reads from sparse snapshots plus accepted commands.

**Tech Stack:** TypeScript 5.9, Vitest 4, Next.js 16 route handlers, Drizzle ORM 0.45, PostgreSQL, Zod 4, pnpm 11.

## Global Constraints

- No floating-point dollar storage; money remains safe integer cents.
- Rates remain safe integer parts per million.
- Prompt 01 stores and validates state; it does not introduce financial-engine formulas.
- Existing v1 saves remain readable and deterministically migratable.
- Existing schema-v2 saves remain decodable without silent checksum changes.
- Every production behavior change follows red-green-refactor.
- Preserve the untracked .codex/AGENTS.md file and unrelated workspace changes.

---

## File structure

New focused modules:

- src/core/state-authority-v2.ts — canonical writable-state guard and migration-required error.
- src/core/runtime-balance-state-v1.ts — storage shape, default, selector, and validation only.
- src/core/state-transition-v2.ts — cross-revision invariants.
- src/server/db/snapshot-policy-v2.ts — pure decision about historical snapshot boundaries.
- src/server/db/run-state-replay-v2.ts — reconstruct/verify a v2 state at a revision.
- src/app/api/v2/runs/[runId]/migrate/route.ts — authenticated migration route.
- docs/architecture/state-and-ledger.md — authority, rounding, snapshot, replay, and migration contract.

Existing modules modified:

- src/core/game-state-v2.ts and game-state-v2-validation.ts — additive Runtime Balance field/default validation.
- src/core/native-game-state-v2.ts — initialize Runtime Balance state.
- src/core/ledger.ts and transaction producers — provenance on all new transactions.
- src/server/db/schema.ts and a generated Drizzle SQL migration — sparse snapshot metadata and FK changes.
- src/server/db/run-repository.ts, run-repository-read.ts, run-repository-support.ts, and contracts — transition guard, snapshot policy, replay, migration response.
- src/server/api/contracts-v2.ts, service-v2.ts, http.ts, openapi.ts, runtime.ts, and route tests — migration endpoint.
- v1 HTTP handlers/tests — reject new v1 writes while preserving reads.

---

### Task 1: Canonical state authority, Runtime Balance storage, and transition invariants

**Files:**

- Create: src/core/state-authority-v2.ts
- Create: src/core/runtime-balance-state-v1.ts
- Create: src/core/state-transition-v2.ts
- Create: src/core/__tests__/state-authority-v2.test.ts
- Create: src/core/__tests__/runtime-balance-state-v1.test.ts
- Create: src/core/__tests__/state-transition-v2.test.ts
- Modify: src/core/game-state-v2.ts
- Modify: src/core/game-state-v2-validation.ts
- Modify: src/core/native-game-state-v2.ts
- Modify: src/server/db/run-repository-support.ts

**Interfaces:**

- Produces: AuthoritativeGameState alias for GameStateV2.
- Produces: requireAuthoritativeGameState(state: PersistedGameState): GameStateV2.
- Produces: RuntimeBalanceStateV1, createInitialRuntimeBalanceStateV1(), runtimeBalanceStateV1(state).
- Produces: validateGameStateTransitionV2(previous, next, commandId) and assertValidGameStateTransitionV2.
- Consumes: existing v1/v2 decoder, single-state validators, SimulationMonth, RatePpm, and GameCommandV2 reducers.

- [ ] **Step 1: Write failing authority and Runtime Balance tests**

Add tests that express the desired APIs:

~~~typescript
expect(requireAuthoritativeGameState(v2)).toBe(v2);
expect(() => requireAuthoritativeGameState(v1)).toThrowError(
  expect.objectContaining({ code: "MIGRATION_REQUIRED" }),
);
expect(createInitialRuntimeBalanceStateV1()).toEqual({
  version: 1,
  pressurePpm: 0,
  recoveryUntilMonth: null,
  catastropheCount: 0,
  lastApprovedEventMonth: null,
});
expect(validateRuntimeBalanceStateV1({ ...initial, pressurePpm: 1_000_001 }))
  .toContainEqual(expect.objectContaining({ code: "rate_out_of_bounds" }));
~~~

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

    corepack pnpm vitest run src/core/__tests__/state-authority-v2.test.ts src/core/__tests__/runtime-balance-state-v1.test.ts

Expected: FAIL because the new modules do not exist.

- [ ] **Step 3: Implement the minimal authority and Runtime Balance modules**

Use this public shape:

~~~typescript
export type RuntimeBalanceStateV1 = Readonly<{
  version: 1;
  pressurePpm: RatePpm;
  recoveryUntilMonth: SimulationMonth | null;
  catastropheCount: number;
  lastApprovedEventMonth: SimulationMonth | null;
}>;

export type AuthoritativeGameState = GameStateV2;

export class MigrationRequiredError extends Error {
  readonly code = "MIGRATION_REQUIRED" as const;
  readonly sourceSchemaVersion: number;
}
~~~

Add gameplay.runtimeBalance as an optional compatibility field. New native v2 states and v1-to-v2 migration must populate it. The selector returns the frozen zero state for older v2 saves without mutating them.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2.

Expected: all focused tests PASS.

- [ ] **Step 5: Write failing transition-invariant tests**

Cover exact revision increment, monotonic month, immutable run/player/start identity, accepted-command prefix, immutable ledger prefix/accounts, immutable terminal outcome, and the current command ID:

~~~typescript
const violations = validateGameStateTransitionV2(
  previous,
  { ...next, currentMonth: previousMonth(previous.currentMonth) },
  "cmd.transition",
);
expect(violations).toContainEqual(
  expect.objectContaining({ path: "currentMonth", code: "month_regressed" }),
);
~~~

- [ ] **Step 6: Run the transition test and verify RED**

Run:

    corepack pnpm vitest run src/core/__tests__/state-transition-v2.test.ts

Expected: FAIL because the transition validator does not exist.

- [ ] **Step 7: Implement and integrate transition validation**

The assertion must throw InvalidGameStateTransitionV2Error with readonly violations. Invoke it in reduceGameCommandV2 after the reducer returns and before repository checksum/persistence. Normalize a missing Runtime Balance field only in the resulting state, then validate the transition.

- [ ] **Step 8: Run state tests and verify GREEN**

Run:

    corepack pnpm vitest run src/core/__tests__/state-authority-v2.test.ts src/core/__tests__/runtime-balance-state-v1.test.ts src/core/__tests__/state-transition-v2.test.ts src/core/__tests__/game-state-v2.test.ts src/core/__tests__/persisted-game-state.test.ts

Expected: all tests PASS.

- [ ] **Step 9: Commit Task 1**

    git add src/core src/server/db/run-repository-support.ts
    git commit -m "Establish authoritative v2 state invariants"

---

### Task 2: Require provenance for every new ledger transaction

**Files:**

- Modify: src/core/ledger.ts
- Modify: src/core/game-state.ts
- Modify: src/core/actions.ts
- Modify: src/core/commands.ts
- Modify: src/core/monthly-turn.ts
- Modify: src/core/monthly-turn-v2.ts
- Modify: src/core/payroll-v2.ts
- Modify: src/core/debt-service-v2.ts
- Modify: src/core/obligation-funding-v2.ts
- Modify: src/core/detailed-actions-v2-support.ts
- Modify: src/core/life-milestones-v2.ts
- Modify: src/core/outcomes.ts
- Modify: src/core/__tests__/ledger.test.ts
- Modify: affected reducer tests with exact transaction fixtures

**Interfaces:**

- Produces: LedgerSourceSystem, LedgerCausalReference, NewJournalTransaction.
- Changes: appendTransaction(ledger, transaction: NewJournalTransaction): Ledger.
- Preserves: JournalTransaction accepts absent provenance when decoding historical saves.

- [ ] **Step 1: Write failing provenance tests**

~~~typescript
const posted = appendTransaction(empty, {
  ...salaryTransaction(),
  sourceSystem: "payroll",
  category: "income.salary",
  causalReference: { kind: "command", id: "cmd.salary" },
});
expect(posted.transactions[0]).toMatchObject({
  sourceSystem: "payroll",
  category: "income.salary",
  causalReference: { kind: "command", id: "cmd.salary" },
});
~~~

Add validation tests for partial provenance, invalid identifiers, and a legacy transaction with all provenance fields absent.

- [ ] **Step 2: Run the ledger test and verify RED**

Run:

    corepack pnpm vitest run src/core/__tests__/ledger.test.ts

Expected: FAIL because the provenance fields/types/validation are absent.

- [ ] **Step 3: Implement strict-new/compatible-old ledger types**

~~~typescript
export type LedgerCausalReference = Readonly<{
  kind: "command" | "event" | "milestone" | "system";
  id: string;
}>;

export type NewJournalTransaction = JournalTransaction &
  Required<Pick<JournalTransaction, "sourceSystem" | "category" | "causalReference">>;
~~~

JournalTransaction stores the three fields as optional for legacy decode. validateLedger accepts either all absent or all valid, never a partial set. appendTransaction accepts only NewJournalTransaction and freezes copied provenance.

- [ ] **Step 4: Run the ledger test and observe TypeScript producer failures**

Run:

    corepack pnpm typecheck

Expected: FAIL at every transaction producer that has not supplied provenance.

- [ ] **Step 5: Add explicit provenance at every producer**

Use stable system/category names, and reference the current command/event/milestone:

~~~typescript
sourceSystem: "payroll",
category: "income.payroll",
causalReference: { kind: "command", id: command.id },
~~~

Opening balances use sourceSystem "state_initialization", category "equity.opening", and causalReference { kind: "system", id: "run.opening" }. Reversals retain the original source/category and reference the reversal command.

- [ ] **Step 6: Run ledger, reducer, and type checks and verify GREEN**

Run:

    corepack pnpm vitest run src/core/__tests__/ledger.test.ts src/core/__tests__/commands.test.ts src/core/__tests__/monthly-turn.test.ts src/core/__tests__/monthly-turn-v2.test.ts src/core/__tests__/detailed-actions-v2.test.ts src/core/__tests__/life-milestones-v2.test.ts
    corepack pnpm typecheck

Expected: tests and typecheck PASS.

- [ ] **Step 7: Commit Task 2**

    git add src/core
    git commit -m "Add causal provenance to ledger writes"

---

### Task 3: Replace per-command historical snapshots with sparse verified replay

**Files:**

- Create: src/server/db/snapshot-policy-v2.ts
- Create: src/server/db/run-state-replay-v2.ts
- Create: src/server/db/__tests__/snapshot-policy-v2.test.ts
- Create: src/server/db/__tests__/run-state-replay-v2.test.ts
- Modify: src/server/db/schema.ts
- Modify: src/server/db/run-repository.ts
- Modify: src/server/db/run-repository-read.ts
- Modify: src/server/db/run-repository-support.ts
- Modify: src/server/db/run-repository-contracts.ts
- Modify: src/server/db/__tests__/run-repository.integration.test.ts
- Create: one generated Drizzle migration under drizzle/

**Interfaces:**

- Produces: SnapshotKind and decideSnapshotBoundary(previous, next, command): readonly SnapshotWrite[].
- Produces: replayGameStateV2(anchor, commands, targetRevision): GameStateV2 for pure tests.
- Produces: loadGameStateAtRevisionV2(tx, runId, revision): Promise<GameStateV2> for repository reads.
- Consumes: accepted command rows, migration target state, existing reducer, canonical checksum, and persisted tax evidence embedded in process-month payloads.

- [ ] **Step 1: Write failing pure snapshot-policy tests**

Cover no snapshot for an ordinary month, annual checkpoint every twelve processed months, pre/post event and milestone snapshots, terminal state, and run start:

~~~typescript
expect(decideSnapshotBoundary(month11, month12, processMonthCommand))
  .toEqual([{ state: month12, kind: "checkpoint", causalCommandId: processMonthCommand.id }]);
expect(decideSnapshotBoundary(month1, month2, ordinaryAction)).toEqual([]);
~~~

- [ ] **Step 2: Run policy tests and verify RED**

Run:

    corepack pnpm vitest run src/server/db/__tests__/snapshot-policy-v2.test.ts

Expected: FAIL because the policy module does not exist.

- [ ] **Step 3: Implement the pure sparse policy**

Snapshot kinds:

~~~typescript
export type SnapshotKind =
  | "run_start"
  | "checkpoint"
  | "before_event"
  | "after_event"
  | "before_milestone"
  | "after_milestone"
  | "terminal"
  | "migration"
  | "legacy_command_result";
~~~

Deduplicate writes by revision and choose the highest-priority reason when two boundaries share a revision.

- [ ] **Step 4: Write failing pure replay tests**

Build a native v2 anchor, apply several real GameCommandV2 commands sequentially, retain only the anchor, replay the command list, and assert canonical state/checksum equality. Add checksum-mismatch and revision-gap cases.

- [ ] **Step 5: Run replay tests and verify RED**

Run:

    corepack pnpm vitest run src/server/db/__tests__/run-state-replay-v2.test.ts

Expected: FAIL because replay support does not exist.

- [ ] **Step 6: Implement replay with checksum verification**

Each persisted command record supplies expectedRevision, resultingRevision, effectiveMonth, payload, and resultingStateChecksum. Rebuild the internal GameCommandV2, require contiguous revisions, reduce it, and verify sha256Canonical(result) at every step. Throw RunRepositoryError("CORRUPT_STATE", ...) on gaps, invalid commands, or mismatch.

- [ ] **Step 7: Change the database model and generate SQL**

Add snapshotKind and causalCommandId to runStateSnapshots. Remove accepted_commands_resulting_snapshot_fk and monthly_turn_records_snapshot_fk. Keep primary key (runId, revision), snapshot checksum constraints, and all existing data.

Run:

    corepack pnpm db:generate
    corepack pnpm db:check

Expected: one readable migration that adds metadata/defaults and drops only the two per-command snapshot foreign keys; schema check PASS.

- [ ] **Step 8: Write/adjust failing repository integration tests**

Assert:

- start plus eleven ordinary monthly commands still has one historical snapshot;
- month twelve adds one checkpoint snapshot;
- event/milestone/terminal commands add boundary snapshots;
- retrying a command without an exact snapshot returns its original state/checksum;
- checkpoint evidence reconstructs an unsnapshotted fromRevision;
- corruption during replay returns CORRUPT_STATE.

Run:

    corepack pnpm vitest run src/server/db/__tests__/run-repository.integration.test.ts

Expected when TEST_DATABASE_URL is configured: failures reflecting the old per-command snapshot behavior. If it is absent, record the suite as skipped and rely on unit replay/policy tests plus typecheck.

- [ ] **Step 9: Integrate policy and replay**

In applyCommandV2:

- validate the transition;
- compute sparse boundary writes;
- insert boundary snapshots with onConflictDoNothing;
- always persist accepted command/current state/normalized ledger/monthly evidence/outbox atomically;
- use loadGameStateAtRevisionV2 for idempotent retry instead of requiring an exact snapshot.

In checkpoint reads, use the same replay loader for fromRevision.

- [ ] **Step 10: Run focused persistence checks and verify GREEN**

Run:

    corepack pnpm vitest run src/server/db/__tests__/snapshot-policy-v2.test.ts src/server/db/__tests__/run-state-replay-v2.test.ts src/server/db/__tests__/run-repository.integration.test.ts
    corepack pnpm db:check
    corepack pnpm typecheck

Expected: unit tests, schema check, and typecheck PASS; integration tests PASS when configured or report only the existing environment skip.

- [ ] **Step 11: Commit Task 3**

    git add src/server/db drizzle
    git commit -m "Use sparse verified run snapshots"

---

### Task 4: Expose authenticated migration and retire public v1 writes

**Files:**

- Create: src/app/api/v2/runs/[runId]/migrate/route.ts
- Modify: src/server/api/contracts-v2.ts
- Modify: src/server/api/service-v2.ts
- Modify: src/server/api/http.ts
- Modify: src/server/api/openapi.ts
- Modify: src/server/api/client.ts
- Modify: src/server/api/__tests__/service-v2.test.ts
- Modify: src/server/api/__tests__/http-client.test.ts
- Modify: src/app/api/v1/runs/route.ts
- Modify: src/app/api/v1/runs/[runId]/commands/route.ts
- Modify: relevant v1 HTTP tests

**Interfaces:**

- Produces: RunApiServiceV2.migrateRun(runId, accessSecret): Promise<RunV2Response>.
- Produces: POST /api/v2/runs/{runId}/migrate with bearer authentication.
- Changes: public v1 POST creation and command submission return HTTP 410 with STATE_SCHEMA_DEPRECATED.
- Preserves: public v1 GET for authenticated old-save inspection.

- [ ] **Step 1: Write failing service and HTTP migration tests**

~~~typescript
const response = await service.migrateRun(runId, secret);
expect(response.state.schemaVersion).toBe(2);
expect(response.idempotentReplay).toBe(false);
~~~

HTTP tests cover missing/bad auth, successful migration, repeated migration, and structured error mapping.

- [ ] **Step 2: Run API tests and verify RED**

Run:

    corepack pnpm vitest run src/server/api/__tests__/service-v2.test.ts src/server/api/__tests__/http-client.test.ts

Expected: FAIL because the service method, handler, contract, and route do not exist.

- [ ] **Step 3: Implement migration API**

Use the existing repository migrateRunStateToV2 operation. The public response includes state, stateChecksum, and idempotentReplay. Reuse bearer-secret extraction and repository error mapping. Add the OpenAPI operation and client method.

- [ ] **Step 4: Write failing legacy-write retirement tests**

Assert that v1 POST /runs and POST /runs/{id}/commands return:

~~~json
{
  "error": {
    "code": "STATE_SCHEMA_DEPRECATED",
    "message": "Legacy state is read-only; create or migrate a v2 run."
  }
}
~~~

Also assert the old service/repository mutation methods are not called.

- [ ] **Step 5: Run legacy HTTP tests and verify RED**

Run the v1 HTTP test file selected by rg for handleCreateRun and handleSubmitCommand.

Expected: FAIL because v1 writes still execute.

- [ ] **Step 6: Implement read-only v1 public behavior**

Keep v1 GET unchanged. Return HTTP 410 from v1 POST route handlers without invoking RunApiService. Do not delete v1 constructors, decoders, repository migration source methods, or fixtures.

- [ ] **Step 7: Run API and migration tests and verify GREEN**

Run:

    corepack pnpm vitest run src/server/api
    corepack pnpm typecheck

Expected: API tests and typecheck PASS.

- [ ] **Step 8: Commit Task 4**

    git add src/app/api src/server/api
    git commit -m "Expose safe legacy save migration"

---

### Task 5: Document authority and run complete verification

**Files:**

- Create: docs/architecture/state-and-ledger.md
- Modify: docs/architecture/system-audit.md
- Modify: README.md only if its API/version examples still advertise v1 writes

**Interfaces:**

- Documents: source-of-truth table, derived selectors, rounding boundaries, ledger provenance, sparse snapshot triggers, replay boundary, migration path, and Prompt 01 scope exclusions.

- [ ] **Step 1: Write the architecture document**

Include exact statements:

- GameStateV2 is the only mutable gameplay state.
- v1 is decode/migrate/read-only.
- current_state is the current save; run_state_snapshots are sparse historical anchors.
- normalized ledger SQL rows are an audit/query projection, while state ledger plus validation is the gameplay authority.
- cents/PPM and half-away-from-zero are the only rounding conventions.
- replay requires initial/migration anchor, ordered exact commands/IDs, external evidence, RNG state, and compatible engine.

- [ ] **Step 2: Update Prompt 00 audit statuses narrowly**

Change only findings now proven by Prompt 01. Leave future Prompt 02-14 gaps intact.

- [ ] **Step 3: Run documentation and diff checks**

Run:

    git diff --check
    cmd /c rg -n -e "GameStateV2 is the only" -e "half-away-from-zero" -e "sparse historical" docs\architecture\state-and-ledger.md

Expected: no whitespace errors and all authority statements found.

- [ ] **Step 4: Run the full verification gate**

Run:

    corepack pnpm verify
    corepack pnpm db:check

Expected: lint, typecheck, complete Vitest suite, Next.js production build, and Drizzle schema check all exit zero.

- [ ] **Step 5: Inspect final scope**

Run:

    git status --short --untracked-files=all
    git diff --stat main...HEAD
    git diff --check main...HEAD

Expected: only Prompt 01 code/tests/docs/migration plus the pre-existing untracked .codex/AGENTS.md.

- [ ] **Step 6: Commit Task 5**

    git add docs README.md
    git commit -m "Document authoritative state and ledger"

Do not push the Prompt 01 branch unless the user explicitly requests it.
