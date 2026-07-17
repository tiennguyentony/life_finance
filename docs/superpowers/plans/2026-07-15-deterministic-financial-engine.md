# Deterministic Financial Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Replace new schema-v2 monthly financial writes with one pure, versioned, deterministic kernel; preserve historical replay; add an event-free projection API; remove duplicate formulas; and prove correctness, integration, reproducibility, and 480-month performance.

**Architecture:** Keep the browser Web/API command contract. Stamp every new monthly command with financial-kernel version 2.0.0, route unversioned stored commands through the frozen 4.1 replay path, and route new commands through a pure kernel that consumes resolved tax, market, claim, and cash-flow inputs. The command wrapper owns validation, revision, outcomes, macro stories, and personal events. A serializable projection driver calls the same kernel without UI, AI, database, event, or network dependencies.

**Tech Stack:** TypeScript 5.9, Vitest 4, Next.js 16, React 19, Drizzle ORM 0.45, PostgreSQL, Zod 4, pnpm 11.

## Global constraints

- Work directly on `main`, preserving the untracked `.codex/AGENTS.md` file and unrelated changes.
- Money remains safe integer cents; rates and indices remain safe integer PPM values.
- Every production behavior change follows red-green-refactor.
- No external API, AI, UI, network, or database call may occur inside the kernel or projection.
- External tax/API clients are mocked only at their boundary; real local integration tests must compose real kernel, ledger, wrapper, replay, and repository modules.
- New product writes use one kernel. v1 and unversioned v2 reducers are frozen historical replay paths, not selectable product behavior.
- Do not invent revolving-credit APRs, fees, delinquency policy, taxable cost basis, other-income tax rules, or insurance periods absent from the repository catalog.
- A shortfall is a typed financial result. The outcome system outside the kernel attaches the supported terminal label.
- Run `git diff --check` and the focused tests before each commit.
- Use detailed multi-paragraph commit messages and do not push until Prompt 02 verification passes.

---

## File structure

New focused modules:

- `src/core/financial-kernel-v2.ts` — canonical pure monthly financial reducer and result types.
- `src/core/financial-projection-v2.ts` — serializable event-free multi-month projection.
- `src/core/financial-year-v2.ts` — annual contribution/insurance reset.
- `src/core/inflation-v2.ts` — living-cost inflation and explicit cumulative price index.
- `src/core/financial-transition-v2.ts` — shared deterministic month/revision/command acceptance helper.
- `src/core/__tests__/financial-kernel-v2.test.ts` — manual golden and required edge cases.
- `src/core/__tests__/financial-kernel-v2.integration.test.ts` — kernel/ledger/wrapper integration.
- `src/core/__tests__/financial-projection-v2.test.ts` — projection serialization, replay, long-run invariants, and performance.
- `src/server/db/__tests__/run-state-replay-v2.test.ts` — credential-free persisted-command decoding plus real reducer/checksum replay.
- `docs/architecture/financial-engine-v2.md` — authority, order, rounding, liquidity, replay, and projection contract.

Existing modules modified:

- `src/core/monthly-turn-v2.ts` — frozen legacy branch plus new-kernel orchestration branch.
- `src/core/obligation-funding-v2.ts` — one immutable funding-plan authority.
- `src/core/debt-service-v2.ts` — exported pure interest/minimum/payment helpers.
- `src/core/recurring-strategy-v2.ts` — exported match helper and explicit pre-tax/after-tax plans.
- `src/core/game-state-v2.ts`, `game-state-v2-validation.ts`, and `native-game-state-v2.ts` — additive cumulative price index.
- `src/core/payroll-v2.ts` — reusable payroll evidence derivation/validation where necessary.
- `src/core/outcomes.ts` — consume supplied/current funding assessment instead of duplicating v2 shortfall math.
- `src/core/financial-goals-v2.ts`, `src/features/play/play-model.ts`, and `src/server/ai/game-context.ts` — canonical metric selectors.
- `src/server/api/v2/tax-orchestrator.ts` — explicit CPI selector and separated pre-tax planning.
- `src/server/db/persisted-command-v2.ts`, repository contracts/support, and monthly record API schema — persisted kernel version and compatible decode.
- `docs/architecture/backend-v4.md` and `docs/architecture/system-audit.md` — implemented Prompt 02 evidence.

---

### Task 0: Freeze and version historical monthly replay

This task must complete before any shared financial helper changes. The replay fixtures are the alarm that prevents later refactors from silently changing historical checksums.

**Files:**

- Modify: `src/core/monthly-turn-v2.ts`
- Modify: `src/core/__tests__/monthly-turn-v2.test.ts`
- Modify: `src/server/db/persisted-command-v2.ts`
- Modify: `src/server/db/__tests__/run-state-replay-v2.test.ts`
- Modify: monthly-command API schema/tests only where internal stamping is represented.

- [ ] **Step 1: Add fixed legacy checksum fixtures before changing behavior**

Create representative unversioned command fixtures for a successful month, taxable liquidation/credit month, claim month, and shortfall month. Store their exact canonical result checksums and compact records. Run them through the real persisted decoder and reducer; do not mock financial helpers.

- [ ] **Step 2: Add the reducer-version discriminator compatibly**

`ProcessMonthV2Command.payload.financialKernelVersion` is optional only at persisted decode. Absence means `legacy-4.1.0`; `"2.0.0"` means the new kernel. Reject every other value. The HTTP client does not choose this value; server command construction stamps it.

```ts
export type FinancialKernelVersionV2 =
  | "legacy-4.1.0"
  | typeof FINANCIAL_KERNEL_V2_VERSION;

export function financialKernelVersionForCommandV2(
  command: ProcessMonthV2Command,
): FinancialKernelVersionV2;
```

- [ ] **Step 3: Isolate the current reducer as the legacy branch**

Rename the current body to `processMonthlyTurnV2Legacy410` without formula changes. Add a dispatcher named `processMonthlyTurnV2`. Until Task 3 supplies the new reducer, a 2.0.0 command must fail with a structured unsupported-version error rather than fall through to legacy behavior.

Shared compatibility APIs called by the legacy branch must retain bit-for-bit behavior during Tasks 1–2. New semantics use new helpers or the new kernel only. The checksum fixtures run after every task that touches a legacy dependency.

- [ ] **Step 4: Add credential-free replay integration**

Extend `run-state-replay-v2.test.ts` to decode the persisted unversioned payload, dispatch the real legacy reducer, validate the authoritative transition, and verify the expected state checksum. This is the second real local integration boundary together with wrapper + kernel + ledger. Do not claim repository persistence: real PostgreSQL persistence remains in the conditional `TEST_DATABASE_URL` suite.

- [ ] **Step 5: Verify and commit**

```bat
corepack pnpm exec vitest run src/core/__tests__/monthly-turn-v2.test.ts src/server/db/__tests__/run-state-replay-v2.test.ts src/server/db/__tests__/persisted-command-v2.test.ts
corepack pnpm typecheck
git diff --check
```

Use the actual adjacent persisted-command test filename if it differs; do not create a duplicate suite solely to match this command.

Commit:

```bat
git add src/core/monthly-turn-v2.ts src/core/__tests__/monthly-turn-v2.test.ts src/server/db/persisted-command-v2.ts src/server/db/__tests__/run-state-replay-v2.test.ts
git commit -m "Version Prompt 02 financial replay" -m "Freeze unversioned v2 monthly commands behind the legacy 4.1 reducer and add fixed successful, funding, claim, and shortfall checksum fixtures before changing shared formulas." -m "Reserve kernel version 2.0.0 for new server-stamped commands and prove credential-free persisted decode, real reduction, transition validation, and checksum replay."
```

Add any changed adjacent contract tests explicitly after inspecting status.

---

### Task 1: One funding plan with exact boundaries

**Files:**

- Modify: `src/core/obligation-funding-v2.ts`
- Modify: `src/core/outcomes.ts`
- Modify: `src/core/game-state.ts`
- Modify: `src/core/__tests__/obligation-funding-v2.test.ts`
- Modify: `src/core/__tests__/outcomes.test.ts`

**Interfaces:**

```ts
export type V2ObligationFundingPlan = Readonly<{
  requiredCashCents: MoneyCents;
  cashAvailableCents: MoneyCents;
  cashUsedCents: MoneyCents;
  taxableLiquidations: readonly V2TaxableLiquidation[];
  grossLiquidationCents: MoneyCents;
  liquidationCostCents: MoneyCents;
  netLiquidationProceedsCents: MoneyCents;
  remainingCreditCents: MoneyCents;
  creditUsedCents: MoneyCents;
  residualShortfallCents: MoneyCents;
  fullyFunded: boolean;
}>;

export function netTaxableLiquidationValueV2(
  grossCents: MoneyCents,
  costRatePpm: RatePpm,
): MoneyCents;

export function minimumGrossTaxableLiquidationV2(
  desiredNetCents: MoneyCents,
  availableGrossCents: MoneyCents,
  costRatePpm: RatePpm,
): MoneyCents;

export function planV2ObligationFunding(
  state: GameStateV2,
  requiredCashCents: MoneyCents,
  costRatePpm: RatePpm,
): V2ObligationFundingPlan;

export function executeV2ObligationFunding(
  state: GameStateV2,
  commandId: string,
  plan: V2ObligationFundingPlan,
): Readonly<{ state: GameStateV2; record: V2FundingRecord }>;
```

- [ ] **Step 1: Add failing pure-plan boundary tests**

Add tests for cash-only, post-cost taxable equality, exact remaining-credit equality, one cent beyond credit, stable liquidation bucket order, zero required cash, invalid rates, and large retirement/HSA/home balances excluded from funding.

```ts
const equality = planV2ObligationFunding(state, moneyCents(25_000), ratePpm(100_000));
expect(equality.fullyFunded).toBe(true);
expect(equality.residualShortfallCents).toBe(0);

const oneCentOver = planV2ObligationFunding(state, moneyCents(25_001), ratePpm(100_000));
expect(oneCentOver.fullyFunded).toBe(false);
expect(oneCentOver.residualShortfallCents).toBe(1);
```

Run: `corepack pnpm exec vitest run src/core/__tests__/obligation-funding-v2.test.ts`

Expected: FAIL because the immutable plan APIs do not exist.

- [ ] **Step 2: Implement the pure funding plan**

Move net-value and minimum-gross-sale math behind the exported helpers. Calculate the complete waterfall once. Preserve the existing stable bucket order. Make `assessV2Liquidity` a compatibility wrapper over the plan.

- [ ] **Step 3: Make execution consume the plan**

Replace recalculation in `prepareV2ObligationCash` with `executeV2ObligationFunding`. Reject execution when `fullyFunded` is false. Assert the executed gross sale, cost, proceeds, credit draw, and final cash exactly match the plan.

- [ ] **Step 4: Remove v2 outcome duplication**

Have v2 outcome callers consume the kernel's residual shortfall. Retain legacy v1 outcome/funding math only for v1 historical tests and label it compatibility-only. Redirect `calculateAutomaticLiquidity` to the canonical net-value helper or deprecate it where only gross display compatibility is needed.

- [ ] **Step 5: Verify and commit**

Run:

```bat
corepack pnpm exec vitest run src/core/__tests__/obligation-funding-v2.test.ts src/core/__tests__/outcomes.test.ts src/core/__tests__/game-state.test.ts
corepack pnpm exec vitest run src/core/__tests__/monthly-turn-v2.test.ts src/server/db/__tests__/run-state-replay-v2.test.ts
corepack pnpm typecheck
git diff --check
```

Commit:

```bat
git add src/core/obligation-funding-v2.ts src/core/outcomes.ts src/core/game-state.ts src/core/__tests__/obligation-funding-v2.test.ts src/core/__tests__/outcomes.test.ts
git commit -m "Unify Prompt 02 obligation funding" -m "Create one immutable cash-taxable-credit funding plan with exact liquidation-cost, credit-boundary, and residual-shortfall results." -m "Make execution and v2 solvency consume the same plan while retaining legacy formulas only for historical replay."
```

---

### Task 2: Pure debt, match, annual-reset, and inflation helpers

**Files:**

- Create: `src/core/financial-year-v2.ts`
- Create: `src/core/inflation-v2.ts`
- Create: `src/core/__tests__/financial-year-v2.test.ts`
- Create: `src/core/__tests__/inflation-v2.test.ts`
- Modify: `src/core/debt-service-v2.ts`
- Modify: `src/core/recurring-strategy-v2.ts`
- Modify: `src/core/game-state-v2.ts`
- Modify: `src/core/game-state-v2-validation.ts`
- Modify: `src/core/native-game-state-v2.ts`
- Modify: `src/core/payroll-v2.ts`
- Modify: `src/server/api/v2/tax-orchestrator.ts`
- Modify: adjacent tests.

**Interfaces:**

```ts
export function calculateMonthlyDebtInterestV2(
  principalCents: MoneyCents,
  annualInterestRatePpm: RatePpm,
): MoneyCents;

export function calculateTotalMinimumDebtPaymentV2(
  debts: DebtBreakdown["termDebts"],
): MoneyCents;

export function applyDebtPaymentV2(
  debt: DebtBreakdown["termDebts"][number],
  interestCents: MoneyCents,
  requestedPaymentCents: MoneyCents,
): Readonly<{
  debt: DebtBreakdown["termDebts"][number];
  appliedPaymentCents: MoneyCents;
}>;

export function calculateEmployerMatchV2(
  state: GameStateV2,
  grossSalaryCents: MoneyCents,
  employeeContributionCents: MoneyCents,
): MoneyCents;

export function resetAnnualFinancialAccumulatorsV2(
  state: GameStateV2,
): GameStateV2;

export function calculateMonthlyLivingCostInflationV2(
  annualLivingCostCents: MoneyCents,
  monthlyInflationPpm: RatePpm,
): Readonly<{
  annualIncreaseCents: MoneyCents;
  monthlyObligationIncreaseCents: MoneyCents;
}>;

export function advanceCumulativePriceIndexV2(
  currentIndexPpm: number,
  monthlyInflationPpm: RatePpm,
): number;
```

- [ ] **Step 1: Add failing helper and rollover tests**

Cover half-cent debt interest, below/exact/above payoff, total minimum cap, match tiers and defined-contribution cap, December no-reset, January reset, January claim-ready insurance values, multi-year reset, positive/negative inflation, and price-index compounding.

Run: `corepack pnpm exec vitest run src/core/__tests__/debt-service-v2.test.ts src/core/__tests__/recurring-strategy-v2.test.ts src/core/__tests__/financial-year-v2.test.ts src/core/__tests__/inflation-v2.test.ts`

Expected: FAIL on missing exports/modules and rollover behavior.

- [ ] **Step 2: Export debt and match authorities**

Rename the existing private formulas to the public names without changing their vectors. Make monthly debt settlement, recurring after-tax extra debt, native minimum calculation, and detailed actions call the same helpers. Split recurring planning into explicit pre-tax and after-tax helpers while retaining `planRecurringAllocations` as a composed compatibility API.

- [ ] **Step 3: Implement annual reset before claim/payroll**

Reset only the contribution counters and health deductible/out-of-pocket counters when the processed calendar year differs from their stored policy year. Do not reset non-health coverage usage because the catalog has no period rule.

- [ ] **Step 4: Add explicit CPI state and remove the living-cost proxy**

Add optional `cumulativePriceIndexPpm` to decoded v2 market state, initialize new state to `1_000_000`, validate it as a positive safe integer, and use a selector default for old state. Update the tax orchestrator to consume the selector instead of dividing current living cost by starting living cost.

- [ ] **Step 5: Verify and commit**

Run the focused tests, the Task 0 legacy replay fixtures, `corepack pnpm typecheck`, and `git diff --check`.

Commit:

```bat
git add src/core/financial-year-v2.ts src/core/inflation-v2.ts src/core/debt-service-v2.ts src/core/recurring-strategy-v2.ts src/core/game-state-v2.ts src/core/game-state-v2-validation.ts src/core/native-game-state-v2.ts src/core/payroll-v2.ts src/server/api/v2/tax-orchestrator.ts
git commit -m "Centralize Prompt 02 financial helpers" -m "Export the canonical debt-payment and employer-match formulas, split pre-tax from after-tax planning, and add deterministic annual contribution and health resets." -m "Track CPI explicitly with integer compounding so tax requests no longer treat lifestyle changes as inflation."
```

Before staging, inspect `git status --short`, add the four adjacent Task 2 test files explicitly, and never stage `.codex/`.

---

### Task 3: Version and extract the canonical financial kernel

**Files:**

- Create: `src/core/financial-kernel-v2.ts`
- Create: `src/core/financial-transition-v2.ts`
- Create: `src/core/__tests__/financial-kernel-v2.test.ts`
- Create: `src/core/__tests__/financial-kernel-v2.integration.test.ts`
- Modify: `src/core/monthly-turn-v2.ts`
- Modify: `src/core/__tests__/monthly-turn-v2.test.ts`
- Modify: `src/core/insurance-v2.ts`
- Modify: `src/server/db/persisted-command-v2.ts`
- Modify: `src/server/db/run-repository-support.ts`
- Modify: monthly-record API contracts/tests.

**Core types:**

```ts
export const FINANCIAL_KERNEL_V2_VERSION = "2.0.0" as const;

export type ResolvedCashFlowV2 = Readonly<{
  id: string;
  kind: "other_income" | "recurring_expense" | "temporary_income" | "temporary_expense";
  amountCents: MoneyCents;
  sourceSystem: string;
}>;

export type FinancialMonthInputV2 = Readonly<{
  version: typeof FINANCIAL_KERNEL_V2_VERSION;
  commandId: string;
  state: GameStateV2;
  taxEvidence: MonthlyTaxEvidence;
  marketStep: MarketSimulationResult;
  taxableLiquidationCostRatePpm: RatePpm;
  insuranceClaim?: MonthlyInsuranceClaimV2;
  resolvedCashFlows?: readonly ResolvedCashFlowV2[];
}>;

export type FinancialShortfallV2 = Readonly<{
  requiredCashCents: MoneyCents;
  residualShortfallCents: MoneyCents;
  fundingPlan: V2ObligationFundingPlan;
  netWorthCents: MoneyCents;
  automaticLiquidityCents: MoneyCents;
}>;

export function simulateFinancialMonthV2(
  input: FinancialMonthInputV2,
): FinancialMonthResultV2;
```

- [ ] **Step 1: Write a complete failing manual golden test**

Build a small native state with zero market movement and hand-selected salary, tax evidence, living cost, term debt, contribution rates, claim, and balances. Assert:

- every opening balance;
- reset values;
- payroll/tax/match;
- base expenses, premium aggregate, and claim cost;
- debt interest/minimum/payoff;
- funding plan;
- optional allocations;
- every closing financial/detail balance;
- exact ordered ledger categories and balanced postings;
- opening/closing net worth and liquidity;
- compact record and next month;
- unchanged input object and input ledger.

Run: `corepack pnpm exec vitest run src/core/__tests__/financial-kernel-v2.test.ts`

Expected: FAIL because the kernel does not exist.

- [ ] **Step 2: Implement the successful-month kernel path**

Move the existing v2 financial application helpers from `monthly-turn-v2.ts` into the kernel. Apply the exact approved order. Consume the complete market step, run annual reset before claim adjudication, use the pure payroll/debt/funding/recurring helpers, advance the month once, and finalize/validate the state. Do not import outcomes, macro stories, event scheduling, exposure, UI, AI, HTTP, or database modules.

- [ ] **Step 3: Add failing edge-case tests, then implement shortfall semantics**

Add zero-income solvent deficit, negative cash flow, market gain/loss, post-loss forced sale, restricted assets, exact credit exhaustion, one-cent shortfall, high-net-worth/illiquid insolvency, contribution caps, debt payoff boundaries, and all four resolved cash-flow kinds. Assert mandatory expense kinds participate in required funding, income kinds increase cash, temporary effects are applied once, and every line has causal ledger provenance.

On shortfall, commit reset/claim/market/payroll/resolved cash-flow effects and their ledger entries, advance once, but do not execute partial funding, obligations, debt settlement, or after-tax allocations.

- [ ] **Step 4: Persist resolved inputs and complete command-version tests**

Store `financialKernelVersion`, resolved cash-flow lines, and the compact result version in all new persisted commands/records. The service supplies empty other-income lines until authoritative product tax rules exist, while server-owned event/policy adapters may materialize stable resolved lines into the command before persistence. Public clients cannot inject arbitrary income. Prove all four cash-flow kinds survive encode/decode/replay and produce the same causal ledger entries. Preserve the Task 0 legacy checksum fixtures and prove new Web/service commands always stamp 2.0.0.

```ts
const historical = decodePersistedGameCommandV2(oldPayload);
expect(historical.payload.financialKernelVersion).toBeUndefined();
expect(replay(historical).checksum).toBe(EXPECTED_LEGACY_CHECKSUM);

const current = createProcessMonthCommandV2(input);
expect(current.payload.financialKernelVersion).toBe("2.0.0");
```

- [ ] **Step 5: Rebuild the wrapper around the kernel**

The new branch validates the command, samples a complete market step with active macro modifiers, calls the kernel, applies deterministic revision/command acceptance, records exposure, evaluates the outcome from the actual shortfall/current result, then advances macro stories and schedules events only if non-terminal. The legacy branch remains unchanged for unversioned replay.

- [ ] **Step 6: Prove two real local integration boundaries**

In `financial-kernel-v2.integration.test.ts`, use real insurance, market, payroll, debt, funding, recurring, ledger, wrapper, outcome, and event modules, including persisted resolved cash-flow evidence. In `run-state-replay-v2.test.ts`, use real persisted-command decoding, reducer dispatch, transition validation, and checksums. Mock only the remote tax calculator/API client. Actual repository persistence is credited only when the conditional PostgreSQL suite runs.

- [ ] **Step 7: Verify and commit**

Run:

```bat
corepack pnpm exec vitest run src/core/__tests__/financial-kernel-v2.test.ts src/core/__tests__/financial-kernel-v2.integration.test.ts src/core/__tests__/monthly-turn-v2.test.ts src/server/db/__tests__/run-state-replay-v2.test.ts src/server/api/__tests__/service-v2.test.ts
corepack pnpm typecheck
git diff --check
```

Commit:

```bat
git add src/core/financial-kernel-v2.ts src/core/financial-transition-v2.ts src/core/monthly-turn-v2.ts src/core/insurance-v2.ts src/core/__tests__/financial-kernel-v2.test.ts src/core/__tests__/financial-kernel-v2.integration.test.ts src/core/__tests__/monthly-turn-v2.test.ts src/server/db/persisted-command-v2.ts src/server/db/run-repository-support.ts
git commit -m "Extract Prompt 02 financial kernel" -m "Route every new Web monthly command through one pure versioned reducer that owns claims, market effects, payroll, obligations, debt, funding, allocations, balances, ledger entries, and compact month evidence." -m "Keep unversioned v2 commands on a frozen replay path, make shortfalls explicit without partial obligation payment, and retain outcome/event orchestration outside the kernel."
```

Add any changed API contract/test files explicitly after inspecting status.

---

### Task 4: Deterministic event-free projection and 480-month proof

**Files:**

- Create: `src/core/financial-projection-v2.ts`
- Create: `src/core/__tests__/financial-projection-v2.test.ts`
- Modify: `src/core/financial-transition-v2.ts`
- Modify: `src/core/market.ts` only if a small exported seeded-step adapter is required.

**Interfaces:**

```ts
export type FinancialProjectionAssumptionsV2 = Readonly<{
  version: 1;
  taxableLiquidationCostRatePpm: RatePpm;
  taxEvidenceByMonth: readonly MonthlyTaxEvidence[];
  insuranceClaimsByMonth: readonly (MonthlyInsuranceClaimV2 | null)[];
  resolvedCashFlowsByMonth: readonly (readonly ResolvedCashFlowV2[])[];
  market:
    | Readonly<{ kind: "fixed"; steps: readonly MarketSimulationResult[] }>
    | Readonly<{ kind: "state_seeded"; returnModifiersPpm: MarketReturnModifiers }>;
}>;

export type ProjectedFinancialStateV2 = Readonly<{
  state: GameStateV2;
  assumptionFingerprint: string;
  generatedCommandIds: readonly string[];
}>;

export function projectWithoutEventsV2(
  input: FinancialProjectionInputV2,
): FinancialProjectionResultV2;
```

- [ ] **Step 1: Write failing serialization and determinism tests**

Assert invalid/missing assumption lengths fail; fixed assumptions fingerprint identically; the same initial state and assumptions yield identical monthly records, ledger, final checksum, generated IDs, and fingerprint; changing one market step changes the fingerprint/result; no input is mutated.

- [ ] **Step 2: Implement the serializable projection driver**

Use only versioned arrays or the production seeded market simulator. Call `simulateFinancialMonthV2` once per month. Apply the shared ephemeral revision/command transition after each result. Stop after recording the first shortfall month. Return a labeled projected state that repository code cannot accept accidentally.

- [ ] **Step 3: Add multi-year invariant tests**

Across at least 60 months assert after every month:

- current month advances once;
- state validation has no violations;
- ledger is balanced;
- all money is a safe integer;
- assets and term-debt principal are non-negative;
- credit used does not exceed limit;
- contribution and health counters reset at January;
- caps remain respected.

- [ ] **Step 4: Add and measure the 480-month performance gate**

Use a generous stable fixture, a short untimed warm-up, and `performance.now()` around only the 480 projection iterations. No events, macro generation, UI, AI, API, database, or network. Assert 480 months, valid final state, balanced ledger, and elapsed time below 8,000 ms. Set the test timeout to 15,000 ms.

```ts
it("projects 480 headless months within budget", { timeout: 15_000 }, () => {
  const started = performance.now();
  const result = projectWithoutEventsV2(input);
  const elapsedMs = performance.now() - started;
  expect(result.completedMonths).toBe(480);
  expect(elapsedMs).toBeLessThan(8_000);
});
```

- [ ] **Step 5: Verify and commit**

Run the projection test alone twice, then with the core suite to detect shared-worker instability.

Commit:

```bat
git add src/core/financial-projection-v2.ts src/core/financial-transition-v2.ts src/core/__tests__/financial-projection-v2.test.ts
git commit -m "Add Prompt 02 deterministic projections" -m "Project event-free months through the production financial kernel using serializable tax, claim, cash-flow, and fixed-or-seeded market assumptions with a canonical fingerprint." -m "Prove multi-year reproducibility, annual resets, monetary invariants, shortfall stopping, and a measured 480-month headless performance budget."
```

---

### Task 5: Remove duplicate consumers and document the authority

**Files:**

- Modify: `src/features/play/play-model.ts`
- Modify: `src/server/ai/game-context.ts`
- Modify: `src/core/financial-goals-v2.ts`
- Modify: related UI/AI/goal tests.
- Create: `docs/architecture/financial-engine-v2.md`
- Modify: `docs/architecture/backend-v4.md`
- Modify: `docs/architecture/system-audit.md`

- [ ] **Step 1: Add failing selector-consumer tests**

Use a high-home/high-retirement/low-liquidity fixture and prove the play model, AI context, goal input, and kernel result agree with canonical `calculateNetWorth`, `calculateInvestableAssets`, and funding-plan liquidity values.

- [ ] **Step 2: Redirect consumers**

Remove copied account sums from the Web play model, AI context, and goal calculations. Import canonical selectors. Search for remaining debt minimum, employer match, taxable liquidation, shortfall, net-worth, investable-assets, and living-cost-inflation formulas. Preserve historical v1-only code with an explicit compatibility comment; redirect every new/product consumer.

Run searches:

```bat
rg -n "cashCents.*taxable|retirementCents.*homeEquity|minimumPaymentCents|employer.*match|liquidation|annualLivingCostCents" src
rg -n "processMonthlyTurn\(" src
```

- [ ] **Step 3: Update architecture and audit evidence**

Document exact order, integer rounding, versioned replay, annual reset, CPI, funding waterfall, restricted assets, shortfall semantics, projection assumptions/fingerprint, mocked API boundary, two real local integrations, and the measured 480-month result. Mark System 4 complete only when all evidence is green. Keep future systems' statuses unchanged.

- [ ] **Step 4: Verify and commit**

Commit:

```bat
git add src/features/play/play-model.ts src/server/ai/game-context.ts src/core/financial-goals-v2.ts docs/architecture/financial-engine-v2.md docs/architecture/backend-v4.md docs/architecture/system-audit.md
git commit -m "Complete Prompt 02 financial authority" -m "Redirect Web, AI, and goal consumers to canonical financial selectors and document the kernel's order, replay version, funding rules, projection contract, and external API boundary." -m "Record the integration, reproducibility, edge-case, and 480-month audit evidence required to mark the deterministic financial engine complete."
```

Add adjacent changed tests explicitly after status inspection.

---

### Task 6: Prompt 02 release verification, database check, and push

- [ ] **Step 1: Run focused Prompt 02 suites**

```bat
corepack pnpm exec vitest run src/core/__tests__/financial-kernel-v2.test.ts src/core/__tests__/financial-kernel-v2.integration.test.ts src/core/__tests__/financial-projection-v2.test.ts src/core/__tests__/obligation-funding-v2.test.ts src/core/__tests__/debt-service-v2.test.ts src/core/__tests__/recurring-strategy-v2.test.ts src/core/__tests__/insurance-v2.test.ts src/core/__tests__/monthly-turn-v2.test.ts src/server/api/__tests__/service-v2.test.ts src/server/db/__tests__/run-state-replay-v2.test.ts
```

- [ ] **Step 2: Run full Web verification**

```bat
corepack pnpm verify
corepack pnpm db:check
```

This must prove lint, typecheck, complete Vitest suite, and production Next.js Web build.

- [ ] **Step 3: Run credential-dependent integration when configured**

If `TEST_DATABASE_URL` exists, run the real PostgreSQL repository integration and the kernel replay/cutover query. If absent, preserve the explicit skipped-test result and write it into the Prompt 02 completion report. Do not substitute a mock and call it a real database pass.

- [ ] **Step 4: Independent review and repair loop**

Request one requirements review and one code-quality/security/replay review of the complete Prompt 02 diff. Fix every critical/high/medium correctness issue, add a regression test first for behavior changes, and rerun focused plus full verification.

- [ ] **Step 5: Final Prompt 02 evidence commit if verification changed files**

Commit only actual audit/test/document repairs with a detailed message. Do not create an empty commit.

- [ ] **Step 6: Push main and record evidence**

Confirm:

```bat
git status --short --branch
git log --oneline --decorate -8
git push origin main
```

Record commit hashes, test counts, skipped credential-dependent tests, measured 480-month time, build result, database-schema check, and push result. Then proceed directly to Prompt 03.
