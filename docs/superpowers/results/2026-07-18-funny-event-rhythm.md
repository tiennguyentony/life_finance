# Funny Beginner Event Rhythm Calibration

Date: 2026-07-18
Decision: **DO NOT ACTIVATE**

The candidate mixed-tone catalog and `beginner-event-cadence-v1` were calibrated with the authoritative beginner cohort. Both executions produced the same deterministic simulation fingerprint, but ten blocking acceptance rules failed. Production therefore remains on the historical V2 catalog and has no active beginner cadence.

## Reproducibility

| Evidence | Value |
| --- | --- |
| Git commit | `96e70666cc13f975cafc0795e58bbed7e9d3762a` |
| Code source hash | `d8d095b73f214b15529db20f8f1ed4a5d46b867f17833181e79c343108ab40fb` |
| Configuration hash | `b6c135a9d377425a18cbb7b3b3f6f5e676a98a99dfe2f0f8773fbb7774c7034d` |
| First deterministic result fingerprint | `933435621bfb9205c9995e8d36bcec4a35c68b8e27af5c4f7233041e73405a63` |
| Second deterministic result fingerprint | `933435621bfb9205c9995e8d36bcec4a35c68b8e27af5c4f7233041e73405a63` |
| First observational report fingerprint | `cacea9c9982473edb2128ae3e846cf1bf9590d7eed0dbb4f4936b950714e8209` |
| Second observational report fingerprint | `00d726848eba8450eda2c6a92197dea77e1433c8d5469a7cd228956658b4df23` |

The deterministic fingerprints match exactly. The observational report fingerprints may differ because they include runtime observations.

## Cohort

- 200 matched seeds
- 3 personas: `healthy-v1`, `low-cash-v1`, and `debt-burdened-v1`
- 6 response bots: `disciplined-v1`, `average-beginner-v1`, `aggressive-investor-v1`, `debt-heavy-lifestyle-v1`, `cash-hoarder-v1`, and `random-control-v1`
- 3,600 total runs (`200 × 3 × 6`)
- 12-month guided beginner horizon
- 43,197 processed production months

## Outcome distribution

| Beginner outcome | Runs | Rate |
| --- | ---: | ---: |
| Bankrupt | 6 | 1,666 PPM |
| Fragile | 1,632 | 453,333 PPM |
| Developing | 1,961 | 544,722 PPM |
| Strong | 1 | 278 PPM |
| Completed (`developing` or `strong`) | 1,962 | 545,000 PPM |

The cohort had no financial-independence completions. Mean final displayed net worth was $2,522,772 and the no-event rate was 501,030 PPM.

## Prepared, average, and reckless differentiation

| Policy | Bot | Bankrupt runs | Bankruptcy rate |
| --- | --- | ---: | ---: |
| Prepared | `disciplined-v1` | 0 / 600 | 0 PPM |
| Average | `average-beginner-v1` | 0 / 600 | 0 PPM |
| Reckless | `debt-heavy-lifestyle-v1` | 6 / 600 | 10,000 PPM |

The bots selected distinct valid response policies, but their financial outcomes were not sufficiently differentiated. Reckless-minus-prepared bankruptcy was only 10,000 PPM against the required 200,000 PPM, average bankruptcy was below its 100,000 PPM minimum, and reckless bankruptcy was below its 300,000 PPM minimum.

## Engagement and safety evidence

| Evidence | Observed |
| --- | ---: |
| Median total prompts | 6 |
| Median meaningful decisions | 6 |
| Runs with at least six meaningful decisions | 2,000 / 3,600 (555,555 PPM) |
| Median unique decision templates per run | 6 |
| Catalog-wide distinct responses observed | 64 |
| Median humorous roots | 4 |
| Median absurd roots | 1 |
| Positive or recovery beat | 3,489 / 3,600 (969,166 PPM) |
| Adjacent absurd violations | 0 |
| Root event-streak violations | 108 |
| Funny roots above the meaningful challenge ceiling | 0 |
| Prepared funny unavoidable failures | 0 |
| Safety overrides | 2,926 |
| Player-caused follow-ups | 1,152 |

Safety boundaries worked: humorous roots stayed below the challenge ceiling, absurd roots were never adjacent, and prepared players had no unavoidable funny-event failures. However, 108 root-event streak violations and the low prompt/decision coverage prevent activation.

## Complete acceptance result

Rates are parts per million unless the metric is a direct count or median.

| Rule | Status | Observed | Required |
| --- | --- | ---: | --- |
| `repeated-lessons` | Pass | 50,217 | at most 300,000 |
| `prepared-impact-reduction` | Pass | 515,803 | at least 100,000 |
| `major-event-pacing` | Pass | 0 | at most 0 |
| `matched-strategy-win-rate` | Pass | 1,000,000 | at least 500,000 |
| `beginner-chapter-completion-minimum` | **Fail** | 545,000 | at least 650,000 |
| `beginner-chapter-completion-maximum` | Pass | 545,000 | at most 750,000 |
| `beginner-bankruptcy-minimum` | **Fail** | 1,666 | at least 50,000 |
| `beginner-bankruptcy-maximum` | Pass | 1,666 | at most 150,000 |
| `average-beginner-bankruptcy-minimum` | **Fail** | 0 | at least 100,000 |
| `average-beginner-bankruptcy-maximum` | Pass | 0 | at most 200,000 |
| `reckless-bankruptcy-minimum` | **Fail** | 10,000 | at least 300,000 |
| `reckless-bankruptcy-maximum` | Pass | 10,000 | at most 450,000 |
| `beginner-prepared-vs-reckless-bankruptcy` | **Fail** | 10,000 | at least 200,000 |
| `beginner-stable-resilient-bankruptcy` | Insufficient sample | 0 | at most 80,000 |
| `beginner-unavoidable-failure` | Pass | 0 | at most 10,000 |
| `beginner-six-month-recovery` | Pass | 960,537 | at least 750,000 |
| `beginner-challenge-mix-minimum` | **Fail** | 120,892 | at least 400,000 |
| `beginner-challenge-mix-maximum` | Pass | 120,892 | at most 600,000 |
| `beginner-zero-extreme-challenges` | **Fail** | 278 | at most 0 |
| `beginner-objective-domination` | Pass | 500,000 | at most 650,000 |
| `beginner-total-prompts-minimum` | **Fail** | 6 | at least 8 |
| `beginner-total-prompts-maximum` | Pass | 6 | at most 10 |
| `beginner-meaningful-decisions-minimum` | Pass | 6 | at least 6 |
| `beginner-meaningful-decisions-maximum` | Pass | 6 | at most 8 |
| `beginner-six-meaningful-decision-rate` | **Fail** | 555,555 | at least 750,000 |
| `beginner-unique-decision-templates` | Pass | 6 | at least 5 |
| `beginner-humorous-roots-minimum` | Pass | 4 | at least 4 |
| `beginner-humorous-roots-maximum` | Pass | 4 | at most 6 |
| `beginner-absurd-roots-minimum` | Pass | 1 | at least 1 |
| `beginner-absurd-roots-maximum` | Pass | 1 | at most 2 |
| `beginner-positive-or-recovery-beat` | Pass | 969,166 | at least 900,000 |
| `beginner-adjacent-absurd-violations` | Pass | 0 | exactly 0 |
| `beginner-root-event-streak-violations` | **Fail** | 108 | exactly 0 |
| `beginner-funny-root-challenge-ceiling` | Pass | 0 | exactly 0 |
| `beginner-prepared-funny-unavoidable-failures` | Pass | 0 | exactly 0 |
| `beginner-runtime-budget` | Pass | 251,392 ms | at most 300,000 ms |

## Activation decision

**Do not activate.** The full candidate behavior remains available for Balance Lab calibration, but production stays at:

```ts
ACTIVE_BEGINNER_EVENT_CADENCE_VERSION = null;
PERSONAL_EVENT_SCHEDULING_SELECTION_V2 = "historical-v2";
```

No thresholds or content probabilities were changed after observing this cohort. A future iteration should address the low serious-challenge rate, weak bot outcome separation, insufficient prompt coverage, root-event streak violations, and the remaining extreme challenge before repeating the complete calibration protocol.
