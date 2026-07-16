# Deterministic Financial Engine Design

Date: 2026-07-15
Prompt: 02 — Deterministic Financial Engine
Status: approved under delegated best judgment

## Goal

Create one pure, deterministic financial kernel that owns every dollar moved during a schema-v2 month. The Web command path remains the product entry point, but UI, AI, event scheduling, outcome labeling, networking, and persistence stay outside the kernel. The same kernel must support normal monthly turns, event-free projections, golden tests, long-run invariant tests, and a measured 480-month budget.

## Existing strengths to preserve

- All money remains integer cents and all rates remain integer parts per million.
- The immutable, double-entry ledger remains the audit authority for balance changes.
- Tax calculations consume persisted evidence rather than making remote calls during simulation.
- Market behavior remains seeded and replayable.
- Taxable liquidation follows a stable bucket order and applies transaction cost explicitly.
- Retirement, HSA, and home equity are excluded from ordinary automatic liquidity.
- Early retirement access remains an explicit player action with withholding and penalty.
- v1 remains historical compatibility code; new gameplay writes continue through schema v2 only.
- The Web application, API routes, and repository continue to consume the existing monthly command contract.

## Alternatives considered

### A. Compatible extraction of the working v2 financial path

Extract the financial phases from `processMonthlyTurnV2` into a pure kernel, keep the command wrapper responsible for validation and non-financial orchestration, consolidate funding calculations, export reusable pure helpers, and add a projection runner over the same kernel.

Decision: adopt. It creates one financial authority while minimizing save, API, and replay risk.

### B. Expand the product model while extracting the kernel

Add new recurring-income catalogs, revolving-credit APRs, late fees, delinquency states, default timelines, and new insurance periods as part of Prompt 02.

Decision: reject. The repository has no authoritative product rules for those values. Inventing them would create false financial behavior and collide with later prompts. The kernel will accept versioned resolved inputs where future systems need to supply such facts, but production defaults remain the currently supported behavior.

### C. Keep the current monthly turn intact and add a facade plus tests

Wrap `processMonthlyTurnV2` with a new name and test the wrapper without moving formulas or removing duplicated funding calculations.

Decision: reject. That would leave multiple financial authorities and would not satisfy the projection, performance, or duplication requirements.

## Authority and boundaries

The new `financial-kernel-v2.ts` module owns:

- the processed month and next simulation month;
- annual accumulator reset at a calendar-year boundary;
- adjudicated insurance costs supplied as deterministic input;
- a supplied seeded market month and its balance effects;
- living-cost inflation;
- payroll, withholding, employee benefits, and employer match;
- required non-debt and debt cash obligations;
- automatic cash, taxable liquidation, and credit funding;
- debt interest, minimums, extra payment, and payoff boundaries;
- after-tax recurring savings and investment allocation;
- balances for cash, taxable investments, retirement, HSA, home, debt, and credit;
- immutable ledger transactions and a compact financial month result;
- a precise residual shortfall when the supported funding waterfall is exhausted.

The kernel does not own:

- HTTP, authentication, persistence, database transactions, or remote tax calls;
- UI formatting or AI context construction;
- random number generation itself;
- macro-story progression or personal-event selection;
- exposure snapshots, teaching messages, grading, goal completion, or terminal outcome labels;
- career-development completion decisions;
- multi-month player commands, Runtime Balance, causal graphs, or the standalone lab.

The monthly-turn wrapper retains command validation, claim and market sampling, RNG advancement, career progression, exposure recording, outcome labeling, macro stories, event scheduling, revision acceptance, and final state validation. This preserves the Web/API contract while making the financial transition independently testable.

## Public kernel contract

The kernel exports a versioned, pure operation:

```ts
export const FINANCIAL_KERNEL_V2_VERSION = "2.0.0" as const;

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

export type FinancialMonthResultV2 = Readonly<{
  version: typeof FINANCIAL_KERNEL_V2_VERSION;
  processedMonth: SimulationMonth;
  nextMonth: SimulationMonth;
  state: GameStateV2;
  record: FinancialMonthRecordV2;
  shortfall: FinancialShortfallV2 | null;
}>;

export function simulateFinancialMonthV2(
  input: FinancialMonthInputV2,
): FinancialMonthResultV2;
```

`MarketSimulationResult` contains both the sampled month and its next regime/RNG state, so a projection cannot accidentally replay a draw or return stale market state. `insuranceClaim` moves the existing typed claim request into the kernel so an annual health reset happens before claim adjudication and the resulting deductible/out-of-pocket state is persisted.

`resolvedCashFlows` is a list of stable IDs, a kind (`other_income`, `recurring_expense`, `temporary_income`, or `temporary_expense`), a non-negative exact amount, and causal source. The owning event or policy system decides eligibility and duration before calling the kernel; the kernel applies and journals the resolved effect without reproducing those rules. It defaults to an empty list. The current production wrapper supplies no other-income lines until the product has authoritative tax-category rules. Existing base expenses and premiums remain represented by the authoritative monthly-obligation aggregate and are reported separately from claim and resolved-flow amounts.

The input state is never mutated. The result contains a new state whose financial fields and ledger reflect the month, while orchestration-only fields remain unchanged except for the current month required by the financial transition. The wrapper applies command acceptance, revision, histories, and orchestration fields after the kernel returns.

The state schema and existing `ENGINE_V2_VERSION` remain unchanged, but reducer behavior is explicitly versioned in the persisted monthly command and monthly record. New Web/API commands are stamped internally with `financialKernelVersion: "2.0.0"`; clients cannot choose an older reducer. Historical persisted monthly commands that lack the field replay through a frozen `legacy-4.1.0` adapter. New commands always use this kernel. This preserves old checksums without pretending that annual-reset and shortfall repairs are bit-for-bit identical.

The legacy adapter is replay-only, receives no new product features, and is covered by fixed checksum fixtures. New native/migrated state uses the new command version. A database cutover check counts unversioned commands and verifies their replay anchors; the absence of a configured integration database is reported rather than hidden.

## Canonical financial order

The kernel executes this exact order:

1. Validate the kernel input and financial invariants.
2. Reset annual contribution and health cost-sharing accumulators if the processed month begins a new policy year.
3. Adjudicate the supplied insurance claim and persist its deductible, out-of-pocket, and coverage-usage effects.
4. Apply the supplied seeded market step to all modeled investment buckets and persist its next regime/RNG state.
5. Apply market inflation to annual and monthly living cost.
6. Apply payroll, tax evidence, pre-tax employee contributions, HSA contributions, and employer match.
7. Apply resolved income, expense, and temporary cash-flow lines with causal ledger provenance.
8. Plan mandatory debt interest and minimum payments with exact payoff caps.
9. Calculate total required cash for base living costs/premiums, claim cost, resolved mandatory expenses, and mandatory debt service.
10. Produce one immutable funding plan using cash, permitted taxable liquidation, and remaining credit in that order.
11. If the funding plan has a residual shortfall, record it without partially paying the month's obligations, skip debt settlement and after-tax allocations, then continue to month advancement and validation.
12. Otherwise execute the same funding plan, then pay non-debt obligations.
13. Accrue debt interest and apply the planned debt payments.
14. Apply after-tax recurring savings, investment allocations, and optional extra debt payments only from available post-obligation cash. Optional extra debt never triggers taxable liquidation or credit use.
15. Advance the current month once.
16. Validate money safety, non-negative bounded balances, ledger balance, and aggregate/detail reconciliation.

Market sampling happens before the kernel, but the complete market step and its next state are supplied together. This prevents event branch counts from changing a financial calculation after its market input is supplied and prevents projections from losing RNG progress. The current production wrapper still owns its serialized RNG stream; separating the production market and event streams belongs with their owning systems in later prompts. Event-free projections are independent because their market policy is versioned in the projection assumptions.

## Annual resets

At the first processed month whose calendar year differs from the stored contribution policy year:

- employee pre-tax contribution year-to-date becomes zero;
- employer contribution year-to-date becomes zero;
- IRA contribution year-to-date becomes zero;
- HSA contribution year-to-date becomes zero;
- the contribution policy year becomes the processed calendar year.

At the corresponding health-insurance policy boundary:

- deductible paid year-to-date becomes zero;
- out-of-pocket paid year-to-date becomes zero;
- the insurance policy year becomes the processed calendar year.

Catalog rule years and persisted tax evidence versions are not rewritten. Non-health coverage usage is not reset because the current catalog does not define its period; adding a guessed annual period would be incorrect.

The reset helper is pure and independently tested at December, January, and multi-year boundaries.

## Inflation index

The v2 market state gains an additive `cumulativePriceIndexPpm` field. New native state starts at `1_000_000`; each new-kernel month compounds it by the supplied market inflation using integer half-away-from-zero rounding. A selector returns `1_000_000` for an older persisted v2 state that lacks the field without silently changing its stored checksum. The first new-kernel command normalizes and advances the field.

The tax orchestrator consumes this explicit index. It no longer infers CPI from current living cost divided by starting living cost, because lifestyle and event changes are not inflation. Historical unversioned commands retain their frozen behavior for checksum replay. Prompt 07 may replace the market inflation process, but it must continue updating this explicit index rather than reintroducing a living-cost proxy.

## Debt, payroll, match, and inflation helpers

Existing correct formulas become exported pure helpers rather than copied formulas:

- `calculateMonthlyDebtInterestV2` computes interest with integer-cent rounding.
- `calculateTotalMinimumDebtPaymentV2` sums per-account minimums capped at payoff.
- `applyDebtPaymentV2` applies interest, minimum, extra, and payoff without a negative balance.
- `calculateEmployerMatchV2` applies eligible compensation, match rate, employee deferral, and annual cap.
- `planPretaxRecurringAllocationsV2` and `planAfterTaxRecurringAllocationsV2` separate payroll deductions from spendable-cash allocations.
- `calculateMonthlyLivingCostInflationV2` owns the annual and monthly inflation deltas.
- `advanceCumulativePriceIndexV2` compounds the explicit price index from a supplied inflation rate.

The monthly kernel, detailed actions, UI selectors, projections, and future lab import these helpers. Historical v1 checksummed reducers remain untouched and are explicitly marked as compatibility-only.

## One funding plan

`obligation-funding-v2.ts` becomes the only automatic-liquidity authority. It produces an immutable plan containing:

- required cash;
- cash available and cash consumed;
- taxable buckets sold in stable order;
- gross sale, transaction cost, and net proceeds per bucket;
- credit available and credit consumed;
- residual shortfall;
- whether obligations are fully fundable.

The sale calculation uses a single pure minimum-gross-sale function. Assessment and execution consume the same plan; execution does not recalculate affordability. Exact-boundary tests cover equality and one-cent-over cases.

The waterfall is:

1. cash;
2. only optional contribution behavior already allowed by the recurring strategy;
3. taxable liquidation;
4. unused credit;
5. residual shortfall.

On a residual shortfall, the returned state commits the year's reset, claim adjudication, market step, payroll, resolved income/effects, their ledger entries, and one month of calendar advancement. It does not execute taxable sales or credit draws that cannot complete the plan, pay any part of the month's obligations, accrue/settle the planned debt service, or make after-tax allocations. The record exposes the complete attempted funding plan and residual amount. The wrapper persists that financial result, accepts the command once, then lets the outcome system attach the currently supported bankruptcy label. Replay fixtures cover this exact branch.

Home equity, retirement balances, HSA balances, and restricted assets are never ordinary liquidity. Early retirement access remains a separate explicit action with its existing withholding and early-withdrawal penalty. Delinquency and default are not implemented because no authoritative terms exist. The kernel reports the residual shortfall; the outcome system outside the kernel decides whether current supported rules label it bankruptcy.

Critically, terminal outcome evaluation must consume the completed financial month and its actual shortfall. It may not independently predict failure from a future obligation after the current month's obligations were fully paid.

## Net worth, liquidity, and solvency

The canonical state selectors remain distinct:

- net worth includes all modeled assets less liabilities;
- investable assets include the product's goal-eligible investment buckets;
- automatic liquidity includes only cash, net permitted taxable liquidation, and unused credit;
- solvency for the current month means the funding plan has no residual shortfall.

The Web play model, AI game context, goal calculations, event adapters, and teaching adapters import the canonical selectors or kernel result. They do not reproduce balance sums, taxable-sale costs, debt minimums, employer match, or shortfall formulas.

## Event-free projection

`financial-projection-v2.ts` repeatedly calls the same kernel:

```ts
export type FinancialProjectionInputV2 = Readonly<{
  initialState: GameStateV2;
  months: number;
  commandIdPrefix: string;
  assumptions: FinancialProjectionAssumptionsV2;
}>;

export type FinancialProjectionResultV2 = Readonly<{
  projectedState: ProjectedFinancialStateV2;
  records: readonly FinancialMonthRecordV2[];
  completedMonths: number;
  stopReason: "completed" | "shortfall";
  shortfall: FinancialShortfallV2 | null;
  assumptionFingerprint: string;
}>;

export function projectWithoutEventsV2(
  input: FinancialProjectionInputV2,
): FinancialProjectionResultV2;
```

`FinancialProjectionAssumptionsV2` is serializable and versioned. It contains materialized tax evidence for every requested month; liquidation policy; materialized claims and resolved cash-flow lines; and either fixed `MarketSimulationResult` steps or the production seeded market policy with fixed return modifiers. Arbitrary callbacks are not accepted. Canonical serialization produces `assumptionFingerprint`.

The projection has no event, macro, UI, AI, network, or database dependency. A shortfall month commits its incoming, market, insurance, and temporary effects, records no partial obligation payment, advances exactly once, and becomes the final projection record with the exact residual shortfall. `completedMonths` includes that recorded month.

After every kernel result, the projection driver applies the same deterministic command-acceptance helper as the Web wrapper: it increments the ephemeral revision and appends the generated projection command ID. `ProjectedFinancialStateV2` labels the result and carries the assumptions fingerprint and generated command IDs. It is valid for comparison and replay inside the projection system but cannot be persisted as a real run without an explicit repository command path.

## Errors and invariants

Kernel errors are structured and limited to invalid input or invariant failure. A normal inability to fund obligations is data in `shortfall`, not an exception.

Each successful month verifies:

- every money value is a safe integer number of cents;
- rates and percentages remain within their declared bounds;
- debt and asset bucket balances are non-negative;
- credit used is between zero and its limit;
- aggregate and detailed portfolio/debt balances reconcile;
- the ledger remains balanced and agrees with aggregate finances;
- contribution caps are not exceeded;
- current month advances exactly once;
- the input state and ledger are unchanged.

The wrapper continues to translate command validation and transition failures into the existing `MonthlyTurnV2Error` contract.

## Testing strategy

### Pure unit and golden tests

- a fully manual one-month golden case checks every opening balance, calculation, posting category, closing balance, and result field;
- zero income with negative cash flow;
- debt minimum, exact payoff, one-cent-over payoff, interest, and extra-payment boundaries;
- employee, employer, IRA, and HSA caps plus January reset;
- positive and negative market months;
- restricted retirement/HSA/home balances excluded from automatic liquidity;
- early withdrawal penalty and withholding remain explicit-action behavior;
- forced taxable sale after a market loss;
- exact credit exhaustion and one-cent residual shortfall;
- high net worth with no usable liquidity;
- deterministic identical inputs produce identical state, ledger, and result;
- input immutability and double-entry reconciliation.

### Local integration tests

At least two real local system boundaries run without external credentials:

1. command wrapper + sampled market/claim + financial kernel + outcome/event orchestration;
2. command repository replay + authoritative state transition + ledger/checksum persistence behavior using the available test store;
3. projection + kernel + ledger invariants over multiple years.

These tests use real project modules, not mocked kernel behavior. Network/API clients are mocked at their boundary because simulation must not depend on availability, credentials, or changing remote responses.

Database integration tests remain separate and run when `TEST_DATABASE_URL` is configured. Missing credentials cause an explicit skip and final-report entry, never a false pass.

### Long-run and performance tests

- identical seeds and inputs produce identical multi-year results and checksums;
- annual counters reset and caps remain valid across multiple January boundaries;
- long-run balances remain safe, non-negative where required, and ledger-balanced;
- an event-free 480-month projection completes under an 8,000 ms measured ceiling on a generous stable fixture;
- fixture construction and warm-up are excluded from the measured interval;
- the performance test has a 15,000 ms test timeout and asserts all 480 months completed.

## Documentation and audit evidence

Prompt 02 completion updates:

- the architecture guide with kernel ownership, order, rounding, liquidity, and projection boundaries;
- the engine audit checklist with evidence links and System 4 marked complete only after tests pass;
- module comments that identify v1 reducers as historical compatibility paths;
- the Prompt 02 implementation plan and commit history;
- verification output for lint, typecheck, complete tests, production Web build, integration tests, and the database check when configured.

## Scope boundaries for later prompts

- Prompt 03 owns multi-month player-facing advancement and progress streaming.
- Prompt 04 owns full life-state outcome, goal, age, and solvency semantics beyond consuming the kernel shortfall.
- Prompt 05 owns the finished strategy feature set and product policy additions.
- Prompts 06–08 own events, probability, and crisis behavior.
- Prompt 09 owns Runtime Balance behavior.
- Prompt 11 owns causal graphs and counterfactual explanation.
- Prompt 14 owns the standalone Balance Lab, which must import this kernel.
- Prompt 15 owns the final whole-repository audit and repairs.

No native/mobile application is introduced. Prompt 02 remains a browser-first Web engine repair.
