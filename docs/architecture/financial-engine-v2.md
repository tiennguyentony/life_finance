# Financial Engine v2 authority

Date: 2026-07-16
Kernel version: `2.0.0`

The Financial Engine is the one synchronous, deterministic authority for money
moved during a new schema-v2 month. It has no UI, AI, network, database,
filesystem, clock, or unseeded-random dependency. The Web application resolves
external evidence before reduction and persists the exact evidence used.

## Authoritative modules and interfaces

- `src/core/financial-kernel-v2.ts` owns
  `simulateFinancialMonthV2(input) -> FinancialMonthResultV2`, the financial
  month record, and actual `FinancialShortfallV2` evidence.
- `src/core/obligation-funding-v2.ts` owns
  `planV2ObligationFunding`, `assessV2Liquidity`, and
  `executeV2ObligationFunding`. Assessment and execution consume the same
  immutable plan.
- `src/core/debt-service-v2.ts`, `recurring-strategy-v2.ts`,
  `payroll-v2.ts`, `insurance-v2.ts`, `inflation-v2.ts`, and
  `financial-year-v2.ts` own their named calculations and annual boundaries.
- `src/core/game-state.ts` owns `calculateNetWorth` and
  `calculateInvestableAssets`. Web, AI context, goals, and checkpoints consume
  those selectors rather than summing account buckets.
- `src/core/financial-transition-v2.ts` rehydrates a financial closing state,
  verifies the exact one-month transition, and accepts the command once.
- `src/core/monthly-turn-v2.ts` is the product wrapper. It validates the
  command, samples one complete market step, calls the kernel once, and owns
  non-financial orchestration.
- `src/core/financial-projection-v2.ts` owns
  `projectWithoutEventsV2(input) -> FinancialProjectionResultV2` and repeatedly
  calls the production kernel with a serializable assumption packet.

The reusable exact helpers include `calculateMonthlyDebtInterestV2`,
`calculateTotalMinimumDebtPaymentV2`, `applyDebtPaymentV2`,
`calculateEmployerMatchV2`, `netTaxableLiquidationValueV2`, and
`minimumGrossTaxableLiquidationV2`. UI and AI code do not reproduce them.

## Canonical monthly order

`simulateFinancialMonthV2` performs this exact order:

1. Validate the versioned input, state, tax evidence, complete market step,
   claim, resolved cash flows, command ID, and liquidation rate.
2. Record opening displayed net worth and zero-obligation automatic liquidity.
3. At a policy-year boundary, reset employee/employer 401(k), IRA, HSA,
   deductible, and health out-of-pocket year-to-date accumulators.
4. Adjudicate the supplied insurance claim against the reset policy state.
5. Apply every supplied market return and persist the supplied next
   regime/RNG state and cumulative price index.
6. Inflate annual living cost and its monthly obligation component.
7. Apply persisted payroll/tax evidence, pre-tax contributions, HSA, and
   employer match.
8. Apply resolved income and temporary-income lines with ledger provenance.
9. Plan debt interest and payoff-capped required payments.
10. Combine living/premium obligations, claim responsibility, resolved
    expenses, and debt service into required cash.
11. Create one funding plan: cash, eligible taxable sale after costs, then
    unused revolving credit.
12. If the plan has a residual shortfall, record the attempted plan atomically,
    skip every partial mandatory payment and optional allocation, advance one
    month, and return the exact shortfall.
13. Otherwise execute that same plan, then journal resolved expenses and base
    non-debt obligations.
14. Accrue debt interest and settle the planned debt payments and payoff.
15. Apply bounded after-tax savings, investments, IRA, and optional extra debt
    payments only from post-obligation cash.
16. Record closing displayed net worth and automatic liquidity, advance exactly
    one month, validate ledger/detail/aggregate invariants, and return the
    immutable record and state.

The wrapper then rehydrates and validates the closing state, completes due
career development, accepts the command, records exposure, evaluates terminal
outcome from the actual shortfall, advances macro stories, and schedules a
personal event only when the run remains active. Those systems are outside the
financial kernel.

## Exact units and rounding

Money is a safe integer number of cents. Rates and percentages are integer PPM,
where `1_000_000` is 100%. Rate multiplication, annual-to-month allocation,
debt interest, contribution allocation, market revaluation, inflation, and
amortization use `BigInt` intermediates and round half away from zero at the
cent boundary. Sums use `BigInt` and reject a result outside JavaScript's safe
integer range. Tax is not recomputed in the kernel: the kernel verifies that
persisted after-tax cash equals gross income less exact pre-tax contributions
and modeled tax.

## Income, expenses, and provenance

The base salary enters through versioned `MonthlyTaxEvidence`. Resolved cash
flows are already-approved `other_income`, `recurring_expense`,
`temporary_income`, or `temporary_expense` lines with a stable ID, source
system, and non-negative exact amount. Income is posted before funding;
expenses are included in required cash and paid only when the complete month is
fundable. Their ledger transactions carry the monthly command ID and a
`system` causal reference to the resolved-flow ID, so the month and underlying
effect are both traceable.

## Annual policy, CPI, and insurance boundaries

Contribution and health accumulators reset before a January claim or payroll
calculation when the stored policy year differs from the processed year. The
kernel does not rewrite catalog rule years. `cumulativePriceIndexPpm` starts at
`1_000_000` for a native run; older v2 saves without the additive field read as
that value. Each supplied inflation month compounds the index and separately
inflates annual living cost and monthly obligations. Lifestyle changes are not
used as an inflation proxy.

A covered health claim consumes the selected self/family deductible,
coinsurance, and out-of-pocket maximum. An uncovered claim or missing health
plan leaves the entire bill with the player. Other selected coverage applies
its deductible and remaining coverage limit. Non-health usage is not guessed
to reset annually because the catalog has no authoritative reset period.

## Debt, contributions, match, and market evidence

Monthly debt interest is principal times annual PPM divided by twelve, rounded
once to cents. Scheduled minimums never exceed payoff; the final term pays the
remaining balance, balances cannot become negative, and optional extra payment
uses cash left after mandatory funding rather than triggering liquidation or
credit. Employee 401(k), employer addition, IRA, and HSA contributions respect
their annual catalog caps. Employer match uses eligible compensation and the
selected tier schedule, and combined employee/employer additions cannot exceed
the applicable plan limit.

The wrapper samples exactly one `MarketSimulationResult` with active macro
return modifiers. The kernel validates its opening regime/RNG, all return and
shock fields, and its next state; applies cash, equity, bond, and housing returns
to their intended buckets; journals the complete revaluation; and persists the
next regime, RNG, months-in-regime, and CPI. It never samples randomness itself.

## Net worth, automatic liquidity, and shortfall

Displayed net worth includes cash, taxable investments, retirement, home,
other investable assets, and other assets, less term and revolving liabilities.
Goal-eligible investable assets use the canonical product selector and exclude
home equity. Neither number is a solvency decision.

Automatic bill-paying liquidity is only:

1. current cash;
2. eligible taxable buckets sold in stable order for the minimum gross amount,
   after the configured transaction cost; and
3. unused revolving credit.

Retirement, HSA, home equity, and other restricted/illiquid wealth are not
automatic sources. Early retirement access remains a separate explicit player
action with withholding and penalty. A negative displayed net worth does not
cause bankruptcy, and high displayed net worth does not cure a cash shortfall.

A residual `FinancialShortfallV2` is normal result data, not an exception. The
shortfall month retains annual reset, insurance, market, payroll, resolved
income, and one calendar advance, but executes no partial liquidation, credit
draw, mandatory payment, debt settlement, or optional contribution. The wrapper
currently maps an actual residual shortfall to the supported bankruptcy outcome.
With `shortfall: null`, it must not predict bankruptcy from a future month's
obligations. Delinquency/default stages are not modeled because the product has
no authoritative terms for them.

## Versioning and replay boundary

New Web `process_month` commands are stamped inside `RunApiServiceV2` with
`financialKernelVersion: "2.0.0"` and server-owned resolved-flow evidence;
clients cannot select a reducer or inject tax/flow evidence. Monthly records and
strict API summaries carry the same version and exact kernel evidence.

Persisted commands without a discriminator, or explicitly stamped
`legacy-4.1.0`, dispatch only to the private frozen reducer in
`monthly-turn-v2.ts`. The original v1 `monthly-turn.ts`, v1 outcome funding, and
v1 checkpoint formulas also remain historical compatibility code. They are not
new-product authorities. Four fixed unversioned command fixtures preserve exact
decoder -> reducer -> transition -> record -> state-checksum replay. New
features are never added to the compatibility reducers.

## Event-free projection

`projectWithoutEventsV2` accepts `0..1_200` months and a version-1 serializable
packet containing one tax entry, claim/null, and resolved-flow list per month;
one liquidation rate; and either complete fixed market steps or the production
state-seeded market policy with fixed modifiers. Canonical serialization of the
complete assumptions plus requested horizon creates the SHA-256 assumption
fingerprint. Each deterministic projection command ID is derived from that
fingerprint and the zero-based month index.

Every month calls `simulateFinancialMonthV2` and the same financial-transition
acceptance helper. The projection stops after accepting and recording the first
shortfall month. It rejects a terminal state, pending event, or non-financial
lifecycle boundary that would occur inside the horizon; it does not run career,
exposure, macro, event, outcome, UI, AI, network, or persistence behavior. Its
branded closing state is comparison/replay evidence, not a persistable real run.

The performance path reuses already deeply frozen input graphs, owns mutable
inputs before freezing, and proves shared immutable history prefixes by identity
inside transition validation. Canonically equivalent cloned prefixes use the
full canonical fallback, preserving correctness without forcing the slower path
for normal chained projections.

## Integration, mocks, and measured performance

Credential-free tests exercise real local boundaries:

- strict persisted command decode -> monthly wrapper -> sampled market and
  claim -> production kernel -> payroll, debt, funding, recurring allocations,
  ledger, outcome, exposure, macro, and event scheduling;
- persisted command replay -> real reducer -> transition validation -> canonical
  record and state checksum, including four frozen legacy fixtures; and
- event-free projection -> production market policy -> production kernel ->
  transition and ledger invariants across years.

The only mocked external dependency in Prompt 02 service tests is the remote
PolicyEngine tax calculator boundary. The application resolves or reuses its
response before reduction; replay consumes persisted evidence. Kernel, market,
insurance, payroll, debt, funding, ledger, reducer, transition, repository port,
and projection behavior are not mocked. No AI API is part of the month path.

The warmed 480-month projection initially measured 12,578.997 ms. Profiling
located repeated deep ownership/canonical transition work; immutable-prefix
reuse reduced a manual profiled run to 4,596.225 ms. Two isolated required runs
measured 4,999.987 ms and 5,088.119 ms, both below the 8,000 ms assertion and
15,000 ms test timeout.

The conditional PostgreSQL repository integration is defined and verifies the
stored `2.0.0` command, full financial record, ledger rows, checksum, API
summary, and idempotent replay. It has not executed in this environment because
`TEST_DATABASE_URL` is absent; this is an explicit skip, not a database pass.
