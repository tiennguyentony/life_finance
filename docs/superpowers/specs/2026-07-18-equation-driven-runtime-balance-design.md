# Equation-driven runtime balance design

## Purpose

Add deterministic preparedness and event-challenge measurements to the simulation, calibrate them in the Balance Lab, and introduce a replay-safe runtime-balance controller that can use challenge fit without punishing financially prepared players.

The system must make preparation measurably valuable. It must not raise event prices merely because a player has accumulated cash, insurance, or diversified assets. AI remains outside the authoritative math and cannot alter scores, event parameters, effects, or state transitions.

## Scope

This design includes:

- a versioned preparedness assessment derived from the existing Risk V1 snapshot;
- a versioned event-challenge assessment derived from the existing Runtime Balance impact estimate and difficulty policy;
- shadow-mode Balance Lab metrics and reports;
- calibration gates for beginner, normal, and hard cohorts;
- a new runtime-balance controller and decision contract for challenge-aware selection;
- compatibility with existing `runtime-balance-v1` runs and replay evidence.

This design does not include:

- migrating legacy event templates into the V2 catalog;
- AI narrative generation or AI event approval;
- the 12-month chapter UI, grading UI, or difficulty-unlock UI;
- changing authoritative financial calculations, event effects, or bankruptcy rules.

Event-catalog expansion remains the next content project. The equation system can be implemented and calibrated against the current catalog, but production activation of large and catastrophe distributions requires V2 templates in those tiers.

## Design principles

1. Use safe-integer parts-per-million arithmetic for all scores.
2. Treat preparedness as evidence, not a rubber-band difficulty multiplier.
3. Calculate challenge from projected consequences after engine-owned mitigations and responses.
4. Preserve fixed seeded event occurrence. Player state changes consequences, not the underlying world draw.
5. Introduce new controller and evidence versions instead of mutating replayed V1 decisions.
6. Compute in shadow mode before enabling selection behavior.
7. Keep every calculator pure, independently testable, and free of persistence or AI dependencies.

## Preparedness assessment

### Contract

Add a pure domain module that accepts a `RiskSnapshotV1` and returns an immutable `PreparednessAssessmentV1`:

```ts
type PreparednessAssessmentV1 = Readonly<{
  version: "preparedness-assessment-v1";
  riskVersion: RiskSnapshotV1["version"];
  asOfMonth: RiskSnapshotV1["asOfMonth"];
  scorePpm: number;
  band: "critical" | "exposed" | "stable" | "resilient";
  components: Readonly<{
    liquidityPpm: number;
    cashFlowPpm: number;
    debtPpm: number;
    insurancePpm: number;
    diversificationPpm: number;
  }>;
}>;
```

Every score is an integer in `[0, 1_000_000]`, where a larger value means better preparation.

### Component equations

Risk metrics expose `severityPpm`, where a larger value means greater risk. Preparedness components use the complement:

```text
preparedKnown(metric) =
  null, when normalizedInput is unavailable
  1_000_000 - severityPpm(metric), otherwise

preparedOrNeutral(metric) = preparedKnown(metric) ?? 500_000
```

Composite components use the worst relevant metric so that one serious weakness is not hidden by averaging:

```text
liquidity = min(
  preparedOrNeutral(emergency_fund_months),
  preparedOrNeutral(liquid_resource_coverage)
)

cashFlow = min(
  preparedOrNeutral(monthly_free_cash_flow),
  preparedOrNeutral(fixed_cost_ratio),
  preparedOrNeutral(lifestyle_rigidity)
)

debt = min(
  preparedOrNeutral(debt_service_ratio),
  preparedOrNeutral(high_interest_debt_burden),
  preparedOrNeutral(interest_burden)
)

insurance = preparedOrNeutral(insurance_protection_gap)

diversification = minKnown(
  preparedKnown(portfolio_concentration),
  preparedKnown(job_investment_sector_correlation)
)
```

`minKnown` ignores `null` inputs and returns `500_000` if all inputs are unavailable. The neutral fallback is intentional: missing evidence is neither rewarded as perfect preparation nor punished as complete exposure. This also keeps the calculator total for valid legacy saves in which insurance or correlation evidence is unavailable.

The aggregate equation is:

```text
scorePpm = roundHalfAwayFromZero(
  (
    350_000 * liquidity
    + 250_000 * cashFlow
    + 200_000 * debt
    + 150_000 * insurance
    +  50_000 * diversification
  ) / 1_000_000
)
```

The weights sum to `1_000_000` and must be exported as a frozen, version-owned policy.

### Initial bands

| Score | Band |
|---:|---|
| `0–249_999` | critical |
| `250_000–499_999` | exposed |
| `500_000–749_999` | stable |
| `750_000–1_000_000` | resilient |

These bands support telemetry and beginner-facing explanations. They do not scale event cost or hazard probability.

## Event-challenge assessment

### Contract

Add a pure domain module that accepts an event impact estimate and the difficulty policy limits:

```ts
type RuntimeBalanceChallengeAssessmentV1 = Readonly<{
  version: "runtime-balance-challenge-v1";
  scorePpm: number;
  band: "light" | "meaningful" | "crisis" | "extreme" | "above_limit";
  limitingDimension:
    | "impact_score"
    | "burn_months"
    | "negative_cash_flow"
    | "recovery_time";
  ratios: Readonly<{
    impactScorePpm: number;
    burnMonthsPpm: number;
    negativeCashFlowPpm: number;
    recoveryTimePpm: number;
  }>;
}>;
```

Ratios may exceed `1_000_000` so rejected candidates retain evidence about how far they exceeded the policy. Ratios must remain non-negative safe integers and are capped at a version-owned evidence ceiling of `10_000_000`.

### Equation

For each dimension:

```text
ratio(value, maximum) = roundHalfAwayFromZero(value * 1_000_000 / maximum)
```

Difficulty-policy validation already requires positive maxima. The challenge score is the worst normalized dimension:

```text
scorePpm = max(
  ratio(impactScorePpm, maximumImpactScorePpm),
  ratio(burnMonthsPpm, maximumBurnMonthsPpm),
  ratio(negativeCashFlowDurationMonths, maximumNegativeCashFlowDurationMonths),
  ratio(recoveryTimeMonths, maximumRecoveryTimeMonths)
)
```

`limitingDimension` uses the first dimension in the order shown when ratios tie. This makes replay evidence deterministic.

### Initial bands

| Score | Band |
|---:|---|
| `0–349_999` | light |
| `350_000–699_999` | meaningful |
| `700_000–899_999` | crisis |
| `900_000–1_000_000` | extreme |
| `>1_000_000` | above_limit |

The existing per-dimension rejection remains authoritative during shadow mode.

## Shadow-mode rollout

### Production behavior

The first implementation computes preparedness and challenge assessments without changing event selection. Existing `runtime-balance-v1` commands, decisions, API contracts, and persisted replay evidence remain byte-for-byte compatible.

Do not add fields to `runtime-balance-decision-v1`. Shadow assessment belongs in Balance Lab observations and reports until the new controller contract is activated.

### Balance Lab additions

For each run and matched seed, collect:

- opening, monthly, and terminal preparedness score and band;
- challenge score, band, and limiting dimension for every evaluated candidate whose impact estimate succeeds;
- approved-event challenge score and band;
- bankruptcy rate grouped by opening preparedness band;
- prepared-versus-reckless bankruptcy delta;
- event-impact reduction for matched events;
- challenge-band distribution by difficulty and event tier;
- unavoidable-failure rate for stable and resilient players;
- recovery duration by preparedness band.

Add a 12-month beginner calibration cohort while retaining the existing 24-, 120-, and 480-month tiers.

### Initial calibration targets

The targets below are acceptance goals, not hidden per-run manipulation:

| Metric | Beginner target |
|---|---:|
| First-attempt 12-month completion | `650_000–750_000` ppm |
| Stable/resilient bankruptcy rate | at most `80_000` ppm |
| Average beginner bankruptcy rate | `150_000–250_000` ppm |
| Reckless bankruptcy rate | `400_000–550_000` ppm |
| Reckless minus prepared bankruptcy | at least `250_000` ppm |
| Unavoidable failure | at most `10_000` ppm |
| Prepared impact reduction | at least `300_000` ppm |
| Nonfatal recovery within six months | at least `750_000` ppm |
| Any strategy's objective dominance | at most `650_000` ppm |

Acceptance evaluation must use matched seeds for strategy comparisons and report confidence intervals. Rare-event gates require at least 1,000 observations before they may block production activation; ordinary distribution checks require at least 200 matched seeds.

## Versioned production controller

After shadow calibration passes, introduce new immutable versions rather than changing V1 meanings:

```text
runtime-balance-v2
runtime-balance-policy-v2
runtime-balance-impact-v1
runtime-balance-decision-v2
preparedness-assessment-v1
runtime-balance-challenge-v1
```

The impact estimator remains V1 because its financial calculation does not change. The new decision embeds:

- preparedness assessment for the current month;
- challenge assessment for each impact-evaluated candidate;
- target challenge score for the selected difficulty;
- challenge-fit contribution;
- final deterministic candidate score;
- the selected candidate and all rejection evidence.

Existing runs continue sending and replaying `runtime-balance-v1`. New runs may opt into V2 only after API, persistence, replay, and Balance Lab support ship together.

## Challenge-aware selection

### Difficulty targets

Initial targets are version-owned and subject to shadow calibration:

| Difficulty | Target challenge score |
|---|---:|
| guided | `450_000` |
| normal | `600_000` |
| hard | `750_000` |

### Fit equation

For candidates at or below the normal policy limit:

```text
distancePpm = abs(challengeScorePpm - targetChallengeScorePpm)
fitPpm = max(0, 1_000_000 - distancePpm)
challengeFitPoints = roundHalfAwayFromZero(
  fitPpm * maximumChallengeFitPoints / 1_000_000
)
```

`maximumChallengeFitPoints` begins at `150`, allowing challenge fit to influence but not erase narrative rank, lesson variety, or repetition penalties.

The final score is:

```text
finalScore = adjustedRank + challengeFitPoints
```

When the Scenario Director supplies an ordering, its rank is converted to the existing base-rank scale before applying the same lesson, repetition, and challenge-fit calculations. AI cannot supply or alter challenge values.

The controller evaluates every candidate within the existing candidate limit, then selects the highest-scoring candidate with no rejection codes. Ties resolve by Scenario Director order, then template ID, then template version. If impact estimation fails, the existing rejection behavior remains in force.

Preparedness score does not appear in the candidate score. This prevents the game from making events harsher simply because the player prepared well.

## Catastrophe policy

Catastrophe occurrence remains a fixed, seeded template hazard plus pressure and cooldown rules. Preparedness does not change the draw.

During the initial V2 controller release, all candidates above the ordinary challenge limit remain rejected. A future catastrophe-tail policy may allow a bounded exception only after V2 catastrophe templates exist and at least 1,000-run calibration proves:

- overall unavoidable failure remains at or below `10_000` ppm;
- stable/resilient unavoidable failure remains at or below the same limit;
- prepared players have materially lower conditional catastrophe fatality than reckless players.

This future exception requires its own versioned policy and is not implicitly enabled by this design.

## Data flow

1. The monthly financial close produces authoritative state and verified cash-flow evidence.
2. Risk V1 produces the current immutable risk snapshot.
3. Preparedness Assessment V1 derives the diagnostic preparedness score.
4. The Event System produces engine-owned candidates and parameters.
5. The Scenario Director supplies deterministic or validated-AI ordering.
6. Runtime Balance preflights every candidate response through the existing impact estimator.
7. Challenge Assessment V1 normalizes the impact against the selected difficulty policy.
8. Shadow mode records assessments without changing selection.
9. Runtime Balance V2 later adds challenge fit and chooses the highest valid final score.
10. The engine queues the selected canonical event; AI may later rewrite narrative only.

## Validation and error handling

- Calculators reject missing versions, non-safe integers, negative values, scores outside supported bounds, and policies with zero maxima.
- Calculators never coerce malformed evidence.
- Unavailable Risk V1 evidence uses the documented neutral preparedness fallback; malformed metrics still fail validation.
- Unknown preparedness or challenge versions fail API and replay validation rather than silently downgrading.
- Runtime Balance V2 preserves existing candidate rejection codes and adds no generic catch-all for mathematical errors.
- Shadow-report failures fail the Balance Lab job but cannot alter a production run.
- V2 controller activation is all-or-nothing across command parsing, API contracts, persistence, replay, and monthly-record projection.

## Testing strategy

### Preparedness unit tests

- all-safe metrics produce `1_000_000`;
- all-risky metrics produce `0` where policies permit those extremes;
- each component weight changes the aggregate by the expected amount;
- a severe metric controls its composite through the minimum rule;
- unavailable insurance and job-correlation evidence use the documented neutral/fallback behavior;
- band boundaries are exact;
- inputs remain immutable;
- unsafe or malformed values fail deterministically.

### Challenge unit tests

- each dimension can become the limiting dimension;
- tie order is deterministic;
- exact band boundaries are stable;
- a score of exactly `1_000_000` is extreme, not above-limit;
- above-limit evidence is retained up to the ceiling;
- integer rounding matches domain arithmetic;
- zero maxima and unsafe values fail validation.

### Controller tests

- V1 outputs remain unchanged;
- shadow mode does not change V1 candidate choice or random cursor consumption;
- V2 evaluates all bounded candidates;
- challenge fit selects the closest safe candidate when other scores are equal;
- narrative and lesson signals can still outweigh a small challenge-fit difference;
- above-limit candidates remain rejected;
- ties are replay-deterministic;
- preparedness never changes sampled parameters, nominal event cost, or hazard draws.

### Integration and replay tests

- monthly-turn evidence contains the correct V2 assessments;
- API and persisted-command schemas accept both supported controller versions;
- existing V1 fixtures replay without migration;
- V2 decisions replay to the same checksum;
- database round trips preserve every score and ratio;
- Scenario Director AI ordering cannot alter mathematical evidence;
- AI timeout or invalid output retains deterministic behavior.

### Balance Lab tests

- 12-month beginner cohort configuration and reports are reproducible;
- matched-seed grouping is preserved;
- preparedness and challenge distributions reconcile with raw runs;
- confidence-interval gates enforce minimum sample counts;
- prepared-versus-reckless deltas use identical persona and seed cohorts.

## Delivery sequence

1. Implement and unit-test both pure calculators.
2. Add shadow observations, metrics, reports, and the 12-month cohort.
3. Run calibration and adjust only version-owned weights, bands, and targets.
4. Add V2 command, decision, API, persistence, and replay contracts.
5. Enable challenge-aware selection for explicitly opted-in new runs.
6. Keep V1 supported for existing runs.
7. Expand the V2 event catalog in the subsequent content project before evaluating catastrophe-tail activation.

## Acceptance criteria

- Preparedness and challenge equations use deterministic safe-integer arithmetic.
- Preparedness never scales event parameters, event costs, or hazard probabilities.
- Shadow mode does not change V1 run state, event selection, random consumption, or replay checksums.
- Balance Lab exposes the new scores, distributions, matched-strategy deltas, and confidence evidence.
- V2 controller activation is versioned and replay-safe.
- V2 evaluates all bounded candidates and records complete rejection and scoring evidence.
- Existing V1 unit, integration, API, persistence, and replay tests continue to pass.
- New calculator, shadow-mode, V2 controller, and Balance Lab tests pass.
