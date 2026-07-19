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

## Remaining modeling boundary

Temporary event income is currently recorded as resolved other income by the
financial kernel. The annual employment tax request is salary-based, so the
simulation does not yet calculate separate self-employment or miscellaneous-
income tax for royalties and stipends. This limitation is explicit and should
be addressed with a versioned tax-input extension rather than hidden in event
copy.
