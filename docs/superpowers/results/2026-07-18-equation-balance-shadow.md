# Equation-driven balance shadow calibration result

## Decision

**NO-GO for `runtime-balance-v2` production selection.** Keep
`runtime-balance-v1` authoritative.

The deterministic preparedness and challenge equations, their Balance Lab
shadow observations, reporting, and the 12-month beginner cohort are ready.
The available calibration evidence does not justify changing live event
selection: the exploratory cohort is too easy, lacks preparedness-band
coverage, misses the recovery target, and contains only 25 matched seeds.

## Delivered behavior

- `preparedness-assessment-v1` calculates a weighted, safe-integer score from
  Risk V1 evidence and classifies it as critical, exposed, stable, or
  resilient.
- `runtime-balance-challenge-v1` normalizes projected consequences against the
  selected difficulty limits, preserving deterministic limiting-dimension and
  above-limit evidence.
- Balance Lab records opening, monthly, and terminal preparedness plus every
  evaluated and approved candidate challenge without feeding those values back
  into gameplay.
- JSON, CSV, and Markdown reports expose score distributions, matched-strategy
  deltas, Wilson confidence intervals, recovery evidence, and challenge tiers.
- The new `beginner` cohort runs guided difficulty for 12 months. Its committed
  default remains 200 matched seeds.
- Existing Runtime Balance V1 selection, commands, replay evidence, and RNG
  consumption remain unchanged.

## Verification evidence

Focused compatibility command:

```text
pnpm vitest run src/core/__tests__/runtime-balance-controller-v2.test.ts src/core/__tests__/monthly-turn-v2.test.ts src/server/db/__tests__/causal-history-replay.integration.test.ts
```

Result: 3 files and 74 tests passed.

Fresh final `pnpm verify` passed after the implementation, persona-boundary
fix, and this result record: lint, typecheck, 144 regular test files (1,093
passed, 36 skipped), 3 long-run test files (67 passed), and the production
Next.js build.

The first full calibration command used the committed 200-seed configuration:

```text
node scripts/run-balance-lab.mjs --size beginner
```

It exposed and led to a fix for an invalid `low-cash-v1` persona whose starting
cash was below scenario bounds. After that fix, the 200-seed cohort still had
not completed after more than ten minutes (3,600 runs and 43,200 production
months were requested), so it was terminated without calibration artifacts.

To obtain directional evidence, the same cohort was run once with
`matchedSeedCount` temporarily reduced to 25, then restored to the committed
default of 200. This exploratory run completed and correctly failed acceptance:

```text
ACCEPTANCE_FAILED: configured acceptance rules blocked beginner: prepared-vs-reckless-bankruptcy,runtime-budget
```

Exploratory run identity:

| Evidence | Value |
|---|---:|
| Matched seeds | 25 |
| Personas / bots / horizon | 3 / 6 / 12 months |
| Runs | 450 |
| Production months | 5,400 |
| Balance observations | 5,850 |
| Internal measured runtime | 57,585 ms |
| Internal throughput | 93 months/second |
| Configuration hash | `b845781b849e8e83eabbc5c218846177a8b59b2ae66e2f8dd04e35cfc2e18331` |
| Result fingerprint | `899266e7fcf3004c7184160f2c376c8058184e09164f05d6074c2591552ffc34` |
| Report fingerprint | `36f7c2d050478aaf9cd14950c1ab2557210ac82140032dffd8d61bb7db36c13b` |
| Source commit | `1fb5e8eed06c3e032f6b0e3c505fe7b83ff4661b` |

The report marks the source dirty because the seed count was temporarily
changed for this exploratory run. The configuration was restored immediately;
the committed beginner configuration still requires 200 matched seeds.

## Beginner target comparison

| Approved design target | Exploratory observation | Result |
|---|---:|---|
| First-attempt completion: 650,000-750,000 ppm | Not measurable: all 450 runs ended `active`; the current lab has no 12-month chapter-completion owner | Insufficient |
| Stable/resilient bankruptcy: at most 80,000 ppm | No opening run was stable or resilient; denominator 0 | Insufficient |
| Average beginner bankruptcy: 150,000-250,000 ppm | 0/75, or 0 ppm | Fail: too easy |
| Reckless bankruptcy: 400,000-550,000 ppm | 0/75 debt-heavy-lifestyle runs, or 0 ppm | Fail: too easy |
| Reckless minus prepared bankruptcy: at least 250,000 ppm | 0 ppm across 75 matched comparisons | Fail |
| Unavoidable failure: at most 10,000 ppm | 0/450; 95% Wilson interval 0-8,465 ppm | Pass directionally |
| Prepared impact reduction: at least 300,000 ppm | 507,949 ppm across 20 matched observations | Pass directionally |
| Nonfatal recovery within six months: at least 750,000 ppm | 109/186, or 586,021 ppm; 95% Wilson interval 514,194-654,368 ppm | Fail |
| Any strategy objective dominance: at most 650,000 ppm | 500,000 ppm | Pass directionally |
| Ordinary distribution evidence | 25 matched seeds versus required 200 | Insufficient |
| Runtime budget | 57,585 ms versus 30,000 ms; full cohort exceeded ten minutes | Fail |

Overall bankruptcy was 0/450, with a 95% Wilson interval of 0-8,465 ppm. All
450 runs remained active after month 12. This supports the concern that the
current beginner experience teaches that personal-finance consequences are too
easy to absorb rather than demonstrating meaningful differences between
prepared and reckless play.

## Shadow distribution findings

Opening preparedness was narrowly distributed: all 450 runs were `exposed`,
with a mean score of 347,014 ppm. Terminal evidence contained 45 `critical` and
405 `exposed` runs, with a mean of 357,334 ppm; there were no `stable` or
`resilient` runs. Stable/resilient safety therefore cannot be validated.

Candidate challenge assessments were:

| Band | Evaluated candidates | Approved events |
|---|---:|---:|
| Light | 794 | 794 |
| Meaningful | 36 | 36 |
| Crisis | 0 | 0 |
| Extreme | 0 | 0 |
| Above limit | 139 | 0 |

Of the 830 approved assessments, 95.7% were light. No large or catastrophe
templates were exercised. Limiting dimensions were impact score (597),
negative cash flow (141), and recovery time (231); burn months never limited a
candidate.

## Required follow-up before activation

1. Make the 200-seed beginner cohort finish within its explicit runtime budget,
   likely by profiling the production runner or executing deterministic shards
   that merge to the same canonical report.
2. Add an authoritative 12-month completion/grade metric so the primary
   beginner outcome is measurable rather than inferred from `active` runs.
3. Expand persona coverage so opening stable and resilient cohorts exist, while
   retaining matched seeds for prepared-versus-reckless comparisons.
4. Calibrate beginner content and consequence parameters so average and
   reckless strategies separate, recovery improves for prepared play, and the
   accepted challenge distribution is not almost entirely light. Do not scale
   costs or hazards from player wealth or preparedness.
5. Add medium, large, and eventual catastrophe V2 templates before attempting
   those tier distributions.
6. Repeat at 200 matched seeds and require every ordinary target to pass; use at
   least 1,000 relevant observations before allowing rare-event gates to block
   or approve activation.

Do not create or enable the separate production-controller plan until that
calibration gate passes.

## Local artifacts

The exploratory artifacts are intentionally ignored build output under:

```text
.balance-lab-dist/beginner/
```

They include `beginner.report.json`, `beginner.summary.json`, CSV exports, and a
Markdown report. Their fingerprints above make the recorded evidence
reproducible and tamper-evident.
