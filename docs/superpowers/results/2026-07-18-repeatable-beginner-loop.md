# Repeatable beginner loop calibration result

## Decision

**NO-GO for `runtime-balance-v2` production selection.** Keep
`runtime-balance-v1` authoritative.

The repeatable one-month interaction loop, hybrid 12-month checkpoint,
expanded event decisions, mathematical reporting, and bounded worker runner are
ready. The committed 200-seed cohort now completes inside its runtime budget
and demonstrates meaningful interaction, but six activation checks still fail:
chapter completion, overall bankruptcy differentiation, average-beginner
bankruptcy, reckless bankruptcy, prepared-versus-reckless bankruptcy delta,
and the zero-extreme-event rule.

## Delivered behavior

- Keep going advances exactly one month. Investments and revolving-credit
  payments repeat from a freshly rebuilt plan; courses, strategy changes,
  lifestyle changes, and credit draws are applied only once.
- Continuation stops for pending events, course completion, the 12-month
  checkpoint, terminal outcomes, newly crossed warnings, or unavailable plans.
- The beginner checkpoint reports `bankrupt`, `fragile`, `developing`, or
  `strong` from the authoritative outcome and preparedness equation.
- Eleven deterministic event templates now provide eight genuine decision
  identities. Deferred repairs and extended income gaps have higher total
  consequences than prepared responses.
- Balance Lab records raw available choices, selected responses, chapter
  outcomes, censored recovery evidence, decision pacing, and approved challenge
  bands. Single-response acknowledgements do not count as decisions.
- Beginner-only acceptance rules do not affect quick, medium, or large tiers.
- Four bounded workers partition complete matched-seed cohorts, then sort and
  assemble them into the exact canonical single-worker result. Eight matched
  seeds are re-executed as an exact repeatability audit.

## Final cohort identity

Command:

```text
node scripts/run-balance-lab.mjs --size beginner
```

The command correctly exited with `ACCEPTANCE_FAILED` after writing the complete
artifact set.

| Evidence | Value |
|---|---:|
| Source commit | `bf167a9d1741bcb67ccff0f434cbf508c418cc69` |
| Code source hash | `9e5fb5b132f432cdd8ba50dbea9d48a55c587845dc29a715a76505642f4f951d` |
| Configuration hash | `548955c09c40b9d55bd3c960a0da452d382a2c3ee1ebf983a1b460fd5ff79bad` |
| Deterministic result fingerprint | `6d39d2069f550bf9b49e8e9360a6bee1404f2dafe613f4b66e7e08777769a9f9` |
| Observed report fingerprint | `893fcdcda190543a8a888097313066e7394582c71f40202abeb7a83d35106b8d` |
| Matched seeds | 200 |
| Personas / bots / horizon | 3 / 6 / 12 months |
| Runs | 3,600 |
| Processed production months | 43,149 |
| Balance observations | 46,749 |
| Measured full-pass runtime | 197,102 ms |
| End-to-end command wall time | 218.6 seconds |
| Throughput | 218 production months/second |
| Repeatability audit | 8 matched seeds, exact run equality |

The report marks the worktree dirty because unrelated untracked `.agents/` and
`skills-lock.json` files were already present. They were not staged or modified;
the source commit and source hash above identify the calibrated implementation.

## Hybrid outcome evidence

| Metric | Observation | 95% Wilson interval | Target | Result |
|---|---:|---:|---:|---|
| Chapter completion | 1,899/3,600 = 527,500 ppm | 511,171-543,771 | 650,000-750,000 | Fail low |
| Overall bankruptcy | 51/3,600 = 14,166 ppm | 10,791-18,578 | 50,000-150,000 | Fail low |
| Average-beginner bankruptcy | 0/600 = 0 ppm | 0-6,362 | 100,000-200,000 | Fail low |
| Reckless bankruptcy | 46/600 = 76,666 ppm | 57,968-100,752 | 300,000-450,000 | Fail low |
| Disciplined bankruptcy | 0/600 = 0 ppm | 0-6,362 | comparative evidence | Safer |
| Reckless minus disciplined | 46/600 = 76,666 ppm | matched evidence | at least 200,000 | Fail low |
| Unavoidable failure | 0/3,600 = 0 ppm | 0-1,066 | at most 10,000 | Pass |

Checkpoint outcomes were 51 bankrupt, 1,650 fragile, 1,898 developing, and one
strong. Fragile outcomes are common, so the chapter no longer equates survival
with success. However, the severe debt persona remains fragile under every bot,
while bankruptcy remains rarer than the activation target. Raising bankruptcy
further would currently require implausible beginner costs or weakening the
controller's protection against unavoidable failure; neither was done merely to
manufacture a pass.

## Interaction and challenge evidence

| Metric | Observation | 95% Wilson interval | Target | Result |
|---|---:|---:|---:|---|
| Median decision events | 3 | n/a | 3-5 | Pass |
| Runs with 3-5 decisions | 1,956/3,600 = 543,333 ppm | 527,024-559,551 | diagnostic | Measured |
| Unique decision templates | 8 | n/a | diverse | Pass |
| Meaningful or crisis approvals | 5,927/12,400 = 477,983 ppm | 469,200-486,782 | 400,000-600,000 | Pass |
| Observable recovery within six months | 2,756/3,454 = 797,915 ppm | 784,196-810,973 | at least 750,000 | Pass |
| Major-event pacing violations | 0/8,331 = 0 ppm | n/a | 0 | Pass |
| Extreme approvals | 15/12,400 = 1,209 ppm | diagnostic tail | 0 | Fail |

Approved challenge counts were 6,458 light, 5,829 meaningful, 98 crisis, 15
extreme, and zero above-limit. The meaningful/crisis mixture is now on target,
but the 15 extreme approvals prevent activation and require seed-level review.

Recovery uses right-censor-aware evidence: an event near month 12 is excluded
from the six-month denominator when six observable months are unavailable.
Recovered events and events observed for at least six months remain in the
denominator, so the passing rate is not inflated by late censored cases.

## Verification evidence

- Focused board, monthly-turn, controller, and causal-replay compatibility:
  16 files and 173 tests passed.
- Full Balance Lab suite: 11 files and 48 tests passed.
- Event catalog/effect/bot suite: 4 files and 38 tests passed.
- TypeScript typecheck, ESLint, and the Next.js production build passed after
  the final cohort. The production build compiled successfully and generated
  all routes.
- One-worker, two-worker, and shuffled-shard assembly produce the exact same
  deterministic result in automated tests.
- A 25-seed throughput benchmark reduced measured first-pass runtime from
  70,653 ms sequentially to 21,281 ms with four workers. Eight workers were
  slower on this host, so the bounded production setting remains four.

An earlier full `pnpm verify` run passed all 1,119 regular tests but exceeded two
unrelated 480-month wall-clock assertions while two Life Finance Next.js servers
and numerous connector processes were active. Those performance limits were not
weakened. In the final retry, lint and typecheck passed, but Windows/Bitdefender
blocked Vitest's config-loader child process at startup with `spawn EPERM`, so no
test assertions ran in that retry. A separate final `pnpm build` passed. Repeat
the full verification on a quiet host with the antivirus child-process block
cleared; this does not change the explicit no-go decision.

## Required follow-up before activation

1. Inspect the 15 extreme approved seeds and tune only version-owned event
   parameters, durations, or approval policy; keep above-limit events rejected.
2. Decide whether the severe debt persona should remain one-third of an
   unweighted beginner activation cohort or be retained as a separate stress
   tier. Do not change preparedness weights simply to lift completion.
3. Add realistic strategy-dependent paths that make reckless cash-flow choices
   fail more often without increasing unavoidable failures for prepared play.
4. Re-run at 200 matched seeds and require every blocking ordinary gate to pass.
5. Keep `runtime-balance-v1` authoritative until a new committed report records
   a go decision.

## Local artifacts

Ignored reproducible artifacts are under:

```text
.balance-lab-dist/beginner/
```

They include canonical JSON, run and matched CSV exports, Markdown, and the
summary file. The hashes above make the recorded evidence tamper-evident.
