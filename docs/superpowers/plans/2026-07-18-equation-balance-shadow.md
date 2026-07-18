# Equation-Driven Balance Shadow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement deterministic preparedness and event-challenge equations, observe them in the offline Balance Lab without changing production event selection, and add a 12-month beginner calibration cohort.

**Architecture:** Two pure core calculators own all score math and validation. The Balance Lab production adapter derives immutable opening/monthly/terminal observations from authoritative game state and existing Runtime Balance V1 decision evidence; the runner and metrics layers carry and summarize those observations without feeding them back into gameplay. Production `runtime-balance-v1` commands, decisions, random consumption, and replay contracts remain unchanged until the calibration gate in the approved design passes.

**Tech Stack:** TypeScript 5.9, Vitest 4, existing safe-integer domain helpers, existing Risk V1 and Runtime Balance impact/policy contracts.

## Global Constraints

- Use safe-integer parts-per-million arithmetic; all bounded scores are integers in `[0, 1_000_000]`.
- Preparedness is diagnostic evidence only and never changes event parameters, costs, hazards, or candidate selection.
- Challenge is derived from projected consequences after existing engine-owned mitigation.
- Missing risk evidence is neutral at `500_000`; malformed evidence fails validation.
- Existing `runtime-balance-v1` commands, decisions, API contracts, persistence, RNG consumption, and replay checksums remain unchanged.
- Shadow observations are offline Balance Lab output only.
- Do not enable catastrophe-tail exceptions or production challenge-fit selection in this plan.

---

### Task 1: Preparedness Assessment V1

**Files:**
- Create: `src/core/preparedness-assessment-v1.ts`
- Create: `src/core/__tests__/preparedness-assessment-v1.test.ts`

**Interfaces:**
- Consumes: `RiskSnapshotV1` from `src/core/risk-v1.ts`.
- Produces: `assessPreparednessV1(snapshot: RiskSnapshotV1): PreparednessAssessmentV1` and frozen `PREPAREDNESS_POLICY_V1`.

- [ ] **Step 1: Write the failing calculator tests**

Create tests covering the frozen contract, weighted result, worst-metric component rule, exact band boundaries, neutral unknown insurance/correlation evidence, input immutability, and malformed snapshot rejection. Use a fixture builder that starts from a real `analyzeRiskV1(createInitialGameStateV2(...))` snapshot and replaces only the metric fields under test.

```ts
expect(assessPreparednessV1(snapshot)).toEqual(expect.objectContaining({
  version: "preparedness-assessment-v1",
  scorePpm: 500_000,
  band: "stable",
}));
expect(() => assessPreparednessV1(malformed)).toThrow(RangeError);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm vitest run src/core/__tests__/preparedness-assessment-v1.test.ts`

Expected: FAIL because `../preparedness-assessment-v1` does not exist.

- [ ] **Step 3: Implement the pure calculator**

Export the exact version, weights, bands, component keys, types, and calculator. Use `BigInt` products plus `divideRoundHalfAwayFromZero` and `safeBigIntToNumber` for the aggregate.

```ts
export const PREPAREDNESS_POLICY_V1 = Object.freeze({
  version: "preparedness-assessment-v1" as const,
  neutralPpm: 500_000,
  weightsPpm: Object.freeze({
    liquidity: 350_000,
    cashFlow: 250_000,
    debt: 200_000,
    insurance: 150_000,
    diversification: 50_000,
  }),
});

export function assessPreparednessV1(
  snapshot: RiskSnapshotV1,
): PreparednessAssessmentV1;
```

Validate snapshot version/month, exact metric identity, normalized-input availability, integer severity, and `[0, 1_000_000]` bounds before calculating. `preparedKnown` returns `null` for unavailable normalized input; `preparedOrNeutral` substitutes `500_000`; `minimumKnown` ignores nulls and returns neutral when every input is null.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm vitest run src/core/__tests__/preparedness-assessment-v1.test.ts`

Expected: PASS with all preparedness cases green.

- [ ] **Step 5: Commit the calculator**

```bash
git add src/core/preparedness-assessment-v1.ts src/core/__tests__/preparedness-assessment-v1.test.ts
git commit -m "Add preparedness assessment equation"
```

### Task 2: Runtime Balance Challenge Assessment V1

**Files:**
- Create: `src/core/runtime-balance-challenge-v1.ts`
- Create: `src/core/__tests__/runtime-balance-challenge-v1.test.ts`

**Interfaces:**
- Consumes: the four consequence fields from `PersonalEventImpactEstimateV2` and the four positive maxima from `RuntimeBalanceDifficultyPolicyV2`.
- Produces: `assessRuntimeBalanceChallengeV1(impact, limits): RuntimeBalanceChallengeAssessmentV1`.

- [ ] **Step 1: Write the failing challenge tests**

Cover each limiting dimension, deterministic tie order, exact band boundaries, `1_000_000` as `extreme`, evidence above the limit capped at `10_000_000`, half-away-from-zero rounding, immutable output, zero maxima, negative inputs, unsafe integers, and malformed versions.

```ts
expect(assessRuntimeBalanceChallengeV1(impact, limits)).toMatchObject({
  version: "runtime-balance-challenge-v1",
  scorePpm: 750_000,
  band: "crisis",
  limitingDimension: "impact_score",
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm vitest run src/core/__tests__/runtime-balance-challenge-v1.test.ts`

Expected: FAIL because `../runtime-balance-challenge-v1` does not exist.

- [ ] **Step 3: Implement the pure calculator**

```ts
export const RUNTIME_BALANCE_CHALLENGE_POLICY_V1 = Object.freeze({
  version: "runtime-balance-challenge-v1" as const,
  evidenceCeilingPpm: 10_000_000,
});

export function assessRuntimeBalanceChallengeV1(
  impact: RuntimeBalanceChallengeImpactV1,
  limits: RuntimeBalanceChallengeLimitsV1,
): RuntimeBalanceChallengeAssessmentV1;
```

Calculate each ratio with `divideRoundHalfAwayFromZero(BigInt(value) * 1_000_000n, BigInt(maximum))`, clamp only to the evidence ceiling, select the first maximum in documented dimension order, and freeze the nested ratios object.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm vitest run src/core/__tests__/runtime-balance-challenge-v1.test.ts`

Expected: PASS with all challenge cases green.

- [ ] **Step 5: Commit the calculator**

```bash
git add src/core/runtime-balance-challenge-v1.ts src/core/__tests__/runtime-balance-challenge-v1.test.ts
git commit -m "Add runtime challenge equation"
```

### Task 3: Shadow Observation Extraction

**Files:**
- Create: `src/lab/balance-lab-balance-observation-v1.ts`
- Create: `src/lab/__tests__/balance-lab-balance-observation-v1.test.ts`
- Modify: `src/lab/balance-lab-v1-runner.ts`
- Modify: `src/lab/balance-lab-v1-production.ts`
- Modify: `src/lab/__tests__/balance-lab-v1-runner.test.ts`
- Modify: `src/lab/__tests__/balance-lab-v1.production-owners.integration.test.ts`

**Interfaces:**
- Consumes: authoritative `GameStateV2`, optional production monthly record, preparedness calculator, challenge calculator, and decision-owned impact limits.
- Produces: `observeBalanceLabMonthV1(state, record, monthIndex): BalanceLabBalanceObservationV1` plus an optional runner owner port that records opening and post-month observations.

- [ ] **Step 1: Write failing extraction and runner tests**

Assert that opening evidence contains preparedness and no challenges; a monthly V1 decision produces challenge evidence for every successfully impact-evaluated candidate; rejected candidates retain above-limit ratios; approved challenge identity is explicit; observations are frozen; and enabling the observer does not change state checksums, world RNG, bot RNG, or monthly records.

```ts
expect(observation.preparedness.version).toBe("preparedness-assessment-v1");
expect(observation.candidateChallenges).toHaveLength(2);
expect(resultWithObserver.runs[0]!.finalStateChecksum)
  .toBe(resultWithoutObserver.runs[0]!.finalStateChecksum);
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm vitest run src/lab/__tests__/balance-lab-balance-observation-v1.test.ts src/lab/__tests__/balance-lab-v1-runner.test.ts`

Expected: FAIL because the observation module and runner port are absent.

- [ ] **Step 3: Implement extraction and optional runner collection**

Add this optional port without changing existing owner implementations:

```ts
observeBalance?(input: Readonly<{
  state: State;
  record: MonthlyRecord | undefined;
  monthIndex: number;
}>): BalanceLabBalanceObservationV1;
```

Collect index `-1` for opening state and each processed month afterward. Pass the frozen observations to `readAuthoritativeMetrics`; make `balanceObservations` optional on `BalanceLabAuthoritativeMetricsV1` so non-production test owners remain compatible. The production adapter implements `observeBalance` using only existing Risk V1 and Runtime Balance V1 evidence.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `pnpm vitest run src/lab/__tests__/balance-lab-balance-observation-v1.test.ts src/lab/__tests__/balance-lab-v1-runner.test.ts src/lab/__tests__/balance-lab-v1.production-owners.integration.test.ts`

Expected: PASS and matched runs retain identical authoritative outcomes.

- [ ] **Step 5: Commit shadow extraction**

```bash
git add src/lab/balance-lab-balance-observation-v1.ts src/lab/balance-lab-v1-runner.ts src/lab/balance-lab-v1-production.ts src/lab/__tests__
git commit -m "Record balance equation shadow evidence"
```

### Task 4: Shadow Metrics and Reports

**Files:**
- Modify: `src/lab/balance-lab-v1-metrics.ts`
- Modify: `src/lab/balance-lab-v1-reports.ts`
- Modify: `src/lab/__tests__/balance-lab-v1-metrics.test.ts`
- Modify: `src/lab/__tests__/balance-lab-v1-config-acceptance-reports.test.ts`

**Interfaces:**
- Consumes: optional `balanceObservations` from Task 3.
- Produces: deterministic preparedness/challenge distributions, grouped bankruptcy and recovery evidence, and JSON/CSV/Markdown report fields.

- [ ] **Step 1: Write failing summary/report tests**

Construct matched prepared and reckless runs with explicit observations. Assert opening/terminal band distributions, challenge-band distribution, limiting-dimension counts, bankruptcy rate by opening preparedness band, prepared-minus-reckless bankruptcy delta, stable/resilient unavoidable-failure rate, six-month nonfatal recovery rate, and deterministic report round trips. Empty shadow evidence must produce zero-count distributions rather than fabricated values.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm vitest run src/lab/__tests__/balance-lab-v1-metrics.test.ts src/lab/__tests__/balance-lab-v1-config-acceptance-reports.test.ts`

Expected: FAIL because the shadow summary fields are absent.

- [ ] **Step 3: Implement aggregation and rendering**

Add a frozen `balanceShadow` object to `BalanceLabMetricSummaryV1` containing counts and rate objects. Reuse the existing Wilson confidence interval helper for every bankruptcy/failure/recovery rate. Extend report validation and rendering with exact keys; keep canonical JSON deterministic and add compact CSV columns for opening score, terminal score, approved challenge score, and their bands.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `pnpm vitest run src/lab/__tests__/balance-lab-v1-metrics.test.ts src/lab/__tests__/balance-lab-v1-config-acceptance-reports.test.ts`

Expected: PASS with deterministic report snapshots.

- [ ] **Step 5: Commit shadow metrics**

```bash
git add src/lab/balance-lab-v1-metrics.ts src/lab/balance-lab-v1-reports.ts src/lab/__tests__
git commit -m "Report balance equation shadow metrics"
```

### Task 5: Twelve-Month Beginner Cohort

**Files:**
- Modify: `src/lab/balance-lab-v1-config.ts`
- Modify: `src/lab/balance-lab-v1-pipeline.ts`
- Modify: `scripts/run-balance-lab.mjs`
- Modify: `balance-lab.config.json`
- Modify: `src/lab/__tests__/balance-lab-v1-config-acceptance-reports.test.ts`
- Modify: `src/lab/__tests__/balance-lab-v1-cli.integration.test.ts`

**Interfaces:**
- Consumes: existing strict tier configuration.
- Produces: `BalanceLabBatchSizeV1 = "beginner" | "quick" | "medium" | "large"` with a guided 12-month cohort while retaining existing 24/120/480-month cohorts.

- [ ] **Step 1: Write failing config and CLI tests**

Assert that `beginner` resolves to 12 months and guided difficulty; quick, medium, and large remain 24, 120, and 480; unknown sizes still fail; and the CLI accepts `--size beginner`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm vitest run src/lab/__tests__/balance-lab-v1-config-acceptance-reports.test.ts src/lab/__tests__/balance-lab-v1-cli.integration.test.ts`

Expected: FAIL because `beginner` is unsupported.

- [ ] **Step 3: Implement the tier**

Add an exact `beginner` config object with `horizonMonths: 12`, `difficulty: "guided"`, bounded seed count, existing beginner-relevant personas, and an explicit runtime budget. Update strict key validation and CLI help/argument parsing without changing the three existing tiers.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `pnpm vitest run src/lab/__tests__/balance-lab-v1-config-acceptance-reports.test.ts src/lab/__tests__/balance-lab-v1-cli.integration.test.ts`

Expected: PASS and all four sizes resolve deterministically.

- [ ] **Step 5: Commit the cohort**

```bash
git add src/lab/balance-lab-v1-config.ts src/lab/balance-lab-v1-pipeline.ts scripts/run-balance-lab.mjs balance-lab.config.json src/lab/__tests__
git commit -m "Add beginner balance calibration cohort"
```

### Task 6: Compatibility and Calibration Gate

**Files:**
- Modify only if test evidence exposes a defect in files already listed above.
- Create: `docs/superpowers/results/2026-07-18-equation-balance-shadow.md`

**Interfaces:**
- Consumes: Tasks 1-5 and existing V1 fixtures.
- Produces: fresh verification evidence and a written go/no-go decision for a separate production-controller implementation plan.

- [ ] **Step 1: Verify focused compatibility**

Run: `pnpm vitest run src/core/__tests__/runtime-balance-controller-v2.test.ts src/core/__tests__/monthly-turn-v2.test.ts src/server/db/__tests__/causal-history-replay.integration.test.ts`

Expected: PASS; existing V1 decisions and replay fixtures remain unchanged.

- [ ] **Step 2: Verify the complete repository**

Run: `pnpm verify`

Expected: lint, typecheck, all test suites, and production build exit successfully.

- [ ] **Step 3: Run the beginner shadow cohort**

Run: `node scripts/run-balance-lab.mjs --size beginner --experiment equation-shadow-v1`

Expected: deterministic JSON/CSV/Markdown artifacts containing preparedness and challenge shadow evidence. Acceptance may pass, fail, or report insufficient samples; record the actual result without overriding it.

- [ ] **Step 4: Write the calibration result**

Record command, configuration hash, sample counts, confidence intervals, every approved-design target, and the go/no-go conclusion in `docs/superpowers/results/2026-07-18-equation-balance-shadow.md`. A no-go conclusion keeps `runtime-balance-v1` authoritative and identifies which version-owned weight, band, target, content tier, or sample count needs a follow-up calibration change.

- [ ] **Step 5: Commit verified shadow delivery**

```bash
git add docs/superpowers/results/2026-07-18-equation-balance-shadow.md
git commit -m "Record equation balance shadow calibration"
```

The separate `runtime-balance-v2` production controller plan is created only after this gate has sufficient matched-seed evidence and meets the approved thresholds. This prevents uncalibrated challenge-fit logic from changing live selection or replay behavior.
