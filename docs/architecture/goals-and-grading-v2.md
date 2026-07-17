# Goals, end conditions, and grading v2

Prompt 04 establishes one deterministic authority for current-product financial
goals, terminal conditions, and grades. It also preserves the exact historical
behavior of already accepted commands instead of silently regrading old runs.

## Authority and version boundary

- `financial-goals-v2.ts` owns goal validation, target calculation, investable
  asset selection, and progress projection.
- `outcome-policy-v2.ts` owns the immutable `1.0.0` retirement age and grade
  ladder. Calculation code selects a policy from the registry by its persisted
  version; callers cannot inject a custom threshold object.
- `outcomes.ts` owns terminal precedence and creates the structured outcome from
  completed-month financial evidence.
- `monthly-turn-v2.ts` invokes outcome assessment after the financial kernel,
  career completion, command acceptance, and exposure recording. A terminal
  result prevents later macro or personal-event scheduling.
- `game-state.ts` and `game-state-v2-validation.ts` validate the persisted
  outcome's bounded structure plus its goal, net-worth, age, policy, grade, and
  terminal-precedence relationships on load and after every transition.

New Web monthly commands are server-stamped with both financial kernel `2.0.0`
and outcome policy `1.0.0`. The monthly record retains the policy discriminator.
Missing `outcomePolicyVersion` means frozen historical semantics: the private
compatibility path keeps its original configured-spending behavior, target-age
stop, reason strings, and checksum. Unknown versions reject instead of falling
forward. Policy `1.0.0` is invalid with a legacy financial kernel because its
solvency evidence depends on the `2.0.0` completed-month funding record.

## Financial goal semantics

All currency is integer cents and all rates are integer parts per million.

```text
FI target cents = ceil(desired annual spending cents * 1,000,000 / SWR PPM)
FI progress PPM = min(1,000,000,
                      investable asset cents * 1,000,000 / FI target cents)
```

The default safe-withdrawal rate is 40,000 PPM (4%), equivalent to a 25-times
annual-spending target. Supported rates are 2% through 6%, and current-product
annual spending must be positive.

Two goal sources have deliberately different update behavior:

- `current_lifestyle_default` follows the authoritative current annual living
  cost. A permanent lifestyle change therefore moves the finish line.
- `player_selected` retains the player's selected desired annual spending even
  when current living cost changes. Its selected target age is planning context;
  it does not replace the grading policy's retirement age.

Investable assets are cash, taxable investments, retirement accounts, and other
investable assets. Home equity and unrelated other assets are excluded from the
FI numerator. Displayed net worth remains all assets minus all liabilities and
is not used as the FI or bankruptcy test.

## Terminal precedence and exact grades

After a `2.0.0` month completes, policy `1.0.0` applies this order:

1. An actual residual required-obligation shortfall ends the run as bankruptcy,
   grade F.
2. Otherwise, investable assets at or above the exact FI target end the run as
   financial independence, grade S.
3. Otherwise, current age at or above the configured retirement age (65 in
   policy `1.0.0`) ends the run with the FI-progress grade.
4. Otherwise the run remains active.

Bankruptcy uses the completed financial kernel's single funding plan. Automatic
liquidity is available cash, after-cost eligible taxable liquidation, then
remaining credit. Home equity and restricted retirement assets are not ordinary
liquidity. A monthly cash-flow deficit is only a controller warning when the
actual required obligations were still funded.

The retirement ladder has inclusive lower bounds and no ambiguous gaps:

| FI progress | Grade |
| --- | --- |
| 800,000–999,999 PPM | A |
| 600,000–799,999 PPM | B |
| 400,000–599,999 PPM | C |
| 200,000–399,999 PPM | D |
| 0–199,999 PPM | E |

FI is evaluated before retirement, so exactly 1,000,000 PPM is S rather than A.
An actual shortfall is evaluated before both, so an otherwise wealthy or
retirement-age state with no permitted bill-paying liquidity is F.

## Persisted outcome evidence

A policy `1.0.0` terminal outcome stores:

- policy version, end kind, headline grade, reached month, primary reason, and a
  bounded machine-readable reason list;
- goal source, investable assets, FI target, and FI progress;
- displayed net worth;
- required cash, automatic liquidity, residual shortfall, and the solvency flag;
- configured retirement age, current age, whether the age was reached, and the
  grade that current progress would receive at retirement.

State validation recalculates the goal, net-worth, age, policy, grade, reason,
and terminal-precedence relationships. Solvency amounts must be nonnegative
safe integers and the solvent flag must match whether residual shortfall is
zero. A bankruptcy outcome additionally requires `required cash = automatic
liquidity + residual shortfall`; FI and retirement outcomes must be solvent.
The outcome is immutable once set and round-trips through canonical save/load
without checksum drift.

## Consumer boundary

- The time controller stops on the code-owned terminal outcome and returns the
  same structured evidence as its end condition.
- Checkpoints use the canonical goal projection, net-worth selector, and age
  selector; they do not own a second grading formula.
- The play UI uses the canonical age selector. While active it shows the current
  projection; after termination it presents the persisted FI, solvency, net
  worth, retirement, grade, and reason evidence without recalculation.
- AI context uses persisted rich terminal FI and net-worth amounts when present.
  The Teacher receives an immutable engine grade plus bounded evidence and may
  explain it, but response validation prevents a model from changing the grade.
- Historical outcomes remain displayable with an explicit compatibility note;
  they are not upgraded or regraded on read.

## Verification and remaining boundaries

Unit tests cover every exact grade threshold, exact FI equality, retirement-age
entry, invalid or zero default expenses, responsive versus fixed goal sources,
home-equity exclusion, restricted assets, negative-net-worth solvency,
positive-net-worth illiquidity, completed-month bankruptcy exhaustion, outcome
precedence, structured-state tampering, and canonical save/load. Integration
tests exercise monthly wrapper to financial kernel to outcome/state validation,
and service/repository replay keeps the persisted policy discriminator.

The conditional real-PostgreSQL suite still requires `TEST_DATABASE_URL`; an
environment skip is not a database pass. Policy `1.0.0` intentionally contains
one immutable default retirement age and grade ladder. A future tuned policy
must receive a new version and fixtures rather than editing `1.0.0` in place.
