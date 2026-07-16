# Risk and resilience analyzer v1

`analyzeRiskV1(GameStateV2)` is a pure, deterministic measurement boundary. It
does not persist its result, schedule events, apply financial effects, or assign
grades. `risk-v1` is additive: the historical `exposure-v2` calculator and its
replay behavior remain available only for accepted commands without the new
event-scheduler version.

All ratios use integer parts per million (PPM): `1_000_000` is 100%. Month
coverage also uses PPM: `3_500_000` is 3.5 months. Money is integer cents. Each
metric returns its raw value and unit, the value used for normalization, a
bounded severity from 0 through 1,000,000, an explicit band, and its thresholds.
Threshold boundaries are inclusive on the safer side.

## Metrics and formulas

| Metric | Raw formula and unit | Low / moderate / high boundary | Analytics weight |
| --- | --- | --- | ---: |
| Emergency-fund months | cash / required monthly obligations, months PPM | at least 6 / 3 / 1 months | 12% |
| Monthly free cash flow | gross monthly employment income - required obligations, cents/month; normalized as a share of gross income | at least +20% / 0% / -20% | 10% |
| Debt-service ratio | term minimums plus 3% of revolving balance / gross monthly income, ratio PPM | at most 15% / 30% / 45% | 7% |
| Fixed-cost ratio | required obligations / gross monthly income, ratio PPM | at most 50% / 70% / 90% | 9% |
| High-interest debt burden | principal at 10% APR or above, plus revolving principal, / annual gross income, ratio PPM | 0% / 25% / 50% | 8% |
| Liquid-resource coverage | cash + taxable investments + other investable assets / required obligations, months PPM | at least 12 / 6 / 3 months | 8% |
| Insurance protection gap | uncovered home + contents + employed-income + dependent-life need / total modeled need, ratio PPM; renters coverage offsets contents only, never home value | at most 10% / 30% / 60% | 7% |
| Portfolio concentration | sector + speculative assets / all investable assets, ratio PPM | at most 20% / 40% / 70% | 6% |
| Job/investment sector correlation | employment-sector investment bucket / all investable assets, ratio PPM | at most 10% / 30% / 60% | 5% |
| Income stability | 100% when verified recurring employment income is positive, otherwise 0%, ratio PPM | at least 90% / 60% / 30% | 8% |
| Lifestyle rigidity | current monthly living cost / gross monthly income, ratio PPM | at most 40% / 60% / 80% | 6% |
| Interest burden | estimated term interest plus revolving interest at 24% APR / gross monthly income, ratio PPM | at most 5% / 10% / 20% | 5% |
| Retirement readiness | retirement accounts + HSA / configured spending target at the configured safe-withdrawal rate, ratio PPM | at least 80% / 50% / 25% | 6% |
| Recent financial stress | player-paid resolved-event costs in the trailing three months, cents; normalized against one month of gross income | 0% / 25% / 75% | 3% |

Values beyond each policy's best/worst normalization anchors are clamped, never
wrapped. With no positive recurring income, a positive income-relative burden
normalizes to maximum severity; a zero burden remains zero. Zero required
obligations produces the configured 24-month coverage cap rather than division
by zero. Unknown catalog-dependent values use the `unknown` band, are omitted
from aggregate weighting, and retain a midpoint severity only for display.

## Aggregate and causality

The optional aggregate is the weighted mean of known metric severities. Weights
live separately in `RISK_METRIC_WEIGHTS_V1` and sum to 1,000,000. Every
underlying dimension remains available; consumers must not infer an event from
the aggregate.

- Low cash may worsen coverage and recovery capacity. It must not make illness,
  layoffs, or other unrelated incidents occur.
- Missing insurance may increase the uncovered share after a covered incident.
  It must not increase incident occurrence.
- Sector and speculative concentration measure market-loss amplification.
- Fixed costs and lifestyle rigidity measure recovery difficulty.
- The current schema has one generic sector-investment bucket. While employed,
  v1 treats that bucket as overlapping the player's employment sector; a future
  multi-sector portfolio must replace this assumption with explicit sector IDs.

High/severe dimensions emit stable `risk.*` weakness tags. Every metric also
emits a structured fact (`factId`, `factCode`, raw and normalized values, units,
and band) so teaching and director systems can explain evidence without
recomputing or inventing financial facts.

New monthly commands persist event scheduler `causal-hazard-v1`. That scheduler
uses one fixed base occurrence chance, intrinsic catalog applicability,
cooldowns, family recency, and the serialized RNG. It does not read risk metrics,
the aggregate severity, or historical exposure. Scheduled causal incidents carry
the neutral relationship `unrelated_hazard`, never a fabricated weakness. Templates whose old eligibility
rules explicitly require low emergency savings or high credit use remain outside
the causal-v1 pool until Prompt 08 separates their real-world trigger from their
financial consequence. Commands without the scheduler version retain the frozen
exposure-driven scheduler so historical state checksums replay exactly.

Insurance-gap measurement uses the active recurring insurance policy, not merely
the onboarding coverage universe. A policy opt-out therefore worsens uncovered
impact while leaving the causal incident draw unchanged.
