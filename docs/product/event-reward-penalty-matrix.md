# Event reward and penalty matrix

The active catalog is evaluated by
`personal-event-impact-matrix-v1`. This is a deterministic static projection of
every event response; it does not call an LLM or infer amounts at runtime.

## Active mix

| Classification | Active events | Share |
| --- | ---: | ---: |
| Positive | 7 | 28% |
| Neutral/trade-off | 7 | 28% |
| Negative | 11 | 44% |
| Total | 25 | 100% |

The enforceable policy requires positive events to remain between 20–40% and
negative events between 35–55%. It also requires at least 20 active events,
at least two responses per event on average, a financial reward path for every
positive event, and a financial or wellbeing penalty path for every negative
event.

## Effect authority

| Effect | Sign and timing | Authoritative application |
| --- | --- | --- |
| Cash award/refund | Positive; next financial month | Scheduled as exact one-month resolved income |
| Temporary income | Positive; exact amount × 2–120 months | Consumed once per eligible month by Financial Kernel v2 |
| Immediate/temporary expense | Negative; exact amount and duration | Included in required cash and liquidity funding |
| Recurring expense | Negative; exact monthly amount × bounded duration | Persists in event cash-flow state until consumed |
| Insurance claim | Negative player cost bounded between $0 and gross loss | Exact health/coverage deductible, coinsurance, and limits |
| Living-cost change | Signed annual amount | Updates annual living cost and rounded monthly obligations together |
| Required-obligation change | Signed monthly amount | Updates authoritative required cash base |
| Wellbeing change | Signed PPM | Clamped to the valid 0–1,000,000 range |

Every resolved choice stores its template/version, parameters, selected and
available responses, player/insurer cost, scheduled cash flows, living-cost
evidence, and resulting revision. AI and Operational ML may rank eligible event
templates, but cannot invent an effect, amount, response, or account mutation.

## Positive decision examples

- Performance bonus: keep all, celebrate and retain 70%, or retain 25% for a
  larger happiness increase.
- Employer wellness credit: retain all or keep 70% while reducing burnout.
- Paid professional development: larger three-month stipend with burnout cost,
  or half-sized six-month stipend with a happiness benefit.
- Side-project license: guaranteed upfront value or six monthly royalties worth
  120% in total, with timing risk.
- Consumer and utility refunds: retain cash, share some for wellbeing, or use a
  supported efficiency option where declared.

## Player-visible evidence

After a successful month, the result dialog receives a bounded backend summary
and explains gross employment income, taxes/withholding, after-tax cash,
event/other income and expense, required cash, debt interest/payment, insurance
claim cost, market movement, and inflation. These values come from the persisted
monthly record; the browser does not recalculate them.

## Local verification on 2026-07-18

The final local cohort for commit `501aa78` executed 3,600 matched runs and
41,873 production months. Its deterministic production fingerprint was
`e46d0df55fe2f66afdac6e598880cfab1a3ee7b3ce8240fac2a16f4808fc6fa8`.

The checks confirmed:

- all 25 active events and their response effects pass the static signed-impact
  matrix;
- prepared choices reduce event impact and matched strategy comparison passes;
- bankruptcy is behavior-linked: 9.17% overall, 11.50% for the average bot,
  34.67% for the debt-heavy lifestyle bot, and 0.33% for the disciplined bot;
- the prepared-versus-reckless bankruptcy gap is 34.33 percentage points;
- no major-event pacing, extreme-challenge, adjacent-absurd, root-event-streak,
  or prepared unavoidable-failure violations occurred;
- no failure was classified as unavoidable;
- six-month nonfatal recovery was 92.56%, above its 75% target; and
- the runtime was 88.31 seconds, below the 300-second budget.

The bankruptcy checks now pass their configured bands: 5–15% overall, 10–20%
for the average bot, and 30–45% for the reckless bot. The complete beginner
acceptance suite remains blocked by engagement and cadence checks: chapter
completion is 55% against a 65% minimum, meaningful/crisis prompts are 33.55%
against the 40–60% band, the median is seven prompts against the configured
eight-to-ten range, 58.83% of runs receive at least six meaningful decisions
against a 75% minimum, and the median is three humorous roots against the
four-to-six range. These separate gaps are not hidden by lowering thresholds.

## Behavior-linked difficulty mechanics

Difficulty is produced by authoritative financial consequences and causal
hazards, not by multiplying event penalties for a selected difficulty label:

- revolving credit accrues 24% APR and requires 3% of the statement balance,
  with a $25 floor, each month; interest and principal payment are separate
  ledger entries, and the same policy is shared by the kernel, risk analyzer,
  exposure model, and player-facing bank projection;
- persistent lifestyle costs and financing choices continue to consume cash in
  later months rather than disappearing after the response dialog;
- burnout below 40% keeps the reduced-hours event at its 3% base chance, while
  burnout at or above 40% raises that event's chance to 20%; and
- the average bot spreads an income gap onto credit, the prepared bot trims
  spending, and the reckless bot continues borrowing. This produces measurable
  outcome separation from the same event catalog.

Runtime Balance still rejects challenges that would create immediate,
unavoidable failure. Operational ML may rank only the candidates that survive
those deterministic rules; it cannot bypass them or mutate balances directly.

## Remaining modeling boundary

Temporary event income is currently recorded as resolved other income by the
financial kernel. The annual employment tax request is salary-based, so the
simulation does not yet calculate separate self-employment or miscellaneous-
income tax for royalties and stipends. This limitation is explicit and should
be addressed with a versioned tax-input extension rather than hidden in event
copy.
