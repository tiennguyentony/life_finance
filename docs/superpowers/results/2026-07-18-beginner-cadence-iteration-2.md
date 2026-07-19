# Beginner Cadence Calibration — Iteration 2

Date: 2026-07-18
Decision: **DO NOT ACTIVATE**

This iteration fixed catalog-version contamination and tested a deterministic, state-aware cadence policy. It materially improved event quality and safety, but eight configured acceptance rules still fail. Production therefore remains on the historical V2 scheduling catalog with beginner cadence disabled.

## Correctness fixes

1. The Balance Lab owner now derives a highest-version active catalog from the complete exact replay catalog. Previously, V2 and V3 copies of the same event ID were both eligible roots.
2. Historical exact versions remain available for save replay and declared follow-ups.
3. Cadence can deterministically supplement a due beat from valid, eligible active templates instead of depending only on that month's random hazard hits.
4. Follow-ups retain causal priority, but the controller can inspect safe root alternatives if the follow-up is rejected.
5. Challenge quotas carry forward when a milestone month is occupied by recovery, a follow-up, or a required positive beat.
6. A challenge candidate must evaluate inside the personalized `meaningful` or `crisis` band. Runtime Balance still rejects above-band and unavoidable failures.
7. The active V3 transport-repair follow-up ceiling is $13,500. Historical V2 remains unchanged.

## Reproducibility

| Evidence | Value |
| --- | --- |
| Code commit | `5d50de9fdbc390b1319fa80c1deb2cb23b5a85df` |
| Configuration hash | `5b75acf77af8e97e089a11b5196d65f62cbf9a7e7068114f2879adac564d2260` |
| Code source hash | `db7d3e1e4bba702ef6c5fda0e72e07cb62828b017c74723e00c673a647dcef95` |
| Deterministic result fingerprint | `6d809cc43cf7e3298a30d0824720ed559cda2e6a39d8da2b14e91c581e47a7c6` |
| Observed report fingerprint | `dfc59738c934cabcfc3d942661a1fe53f0a852fa99617da6fc6c5e0a1e62db2e` |
| Runs | 3,600 |
| Processed production months | 43,185 |
| Runtime | 82,066 ms |

The report was generated with `pnpm balance:beginner`. Exit code 2 is expected while configured acceptance gates fail; the report artifacts were still produced successfully.

## Improvements over the prior documented cohort

| Metric | Prior | Iteration 2 |
| --- | ---: | ---: |
| Meaningful/crisis approved rate | 120,892 ppm | 419,362 ppm |
| Extreme approved challenges | 278 ppm | 0 ppm |
| Root event-streak violations | 108 | 0 |
| Median meaningful decisions | 6 | 7 |
| Runs with at least six meaningful decisions | 555,555 ppm | 733,333 ppm |
| Prepared-impact reduction | 515,803 ppm | 588,811 ppm |

## Final observed engagement and safety

| Metric | Observed | Target | Status |
| --- | ---: | ---: | --- |
| Median total prompts | 7 | 8–10 | Fail |
| Median meaningful decisions | 7 | 6–8 | Pass |
| At least six meaningful decisions | 733,333 ppm | at least 750,000 ppm | Fail |
| Median unique decision templates | 7 | at least 5 | Pass |
| Median humorous roots | 3 | 4–6 | Fail |
| Median absurd roots | 1 | 1–2 | Pass |
| Positive or recovery beat | 965,555 ppm | at least 900,000 ppm | Pass |
| Meaningful/crisis challenge mix | 419,362 ppm | 400,000–600,000 ppm | Pass |
| Extreme challenges | 0 | 0 | Pass |
| Adjacent absurd violations | 0 | 0 | Pass |
| Root event-streak violations | 0 | 0 | Pass |
| Prepared funny unavoidable failures | 0 | 0 | Pass |

## Remaining structural blockers

The following are not safely solvable by changing cadence ordering alone:

- The current 11 eligible scheduling opportunities and two-root recovery rule leave little room for four humorous roots, four serious roots, and a positive beat. Adding light fallbacks increased prompt coverage but pushed challenge mix below its gate, so that experiment was removed.
- The existing serious catalog does not always offer a state-specific meaningful candidate within the bounded top-five evaluation set. More educational event content with complementary cost and recovery shapes is preferable to weakening the impact gate.
- Beginner completion uses only the absolute terminal preparedness threshold. All debt-burdened persona runs begin far below it, so improvement from the opening state is not credited.
- The “average” bot has zero bankruptcy and the reckless bot has only 30,000 ppm bankruptcy. Their policies do not create the 100,000–200,000 and 300,000–450,000 ppm outcome bands demanded by configuration. This is a bot/persona calibration problem, not evidence that safe events should be made arbitrarily destructive.

## Next implementation sequence

1. Add opening preparedness evidence to the chapter assessment and define a reviewed progress-aware completion rule without deleting the absolute safety floor.
2. Recalibrate average and reckless bot actions using explicit bounded borrowing/spending behavior, then validate prepared-versus-reckless separation.
3. Add several serious educational event templates that cover complementary impact ranges and lessons; keep gross parameters wealth-independent.
4. Add one or more causal micro follow-ups so prompt coverage can increase without violating the two-root pacing invariant.
5. Run separate deterministic calibration and validation cohorts, then repeat the full acceptance suite.
6. Activate the V3 catalog and cadence only after all gates pass from a clean commit.
