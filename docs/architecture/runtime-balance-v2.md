# Runtime balance controller v2

Runtime balance v2 is the deterministic fairness gate between ranked personal-
event candidates and the event lifecycle. It decides whether the current month
may queue one bounded proposal. It may return no event. It does not create
eligibility, change incident probability, write financial ledger entries, or
use AI.

This document is the implementation contract for Prompt 09. Exact exported
type and function names may follow repository conventions, but the ownership,
versioning, replay, causality, and fairness boundaries below are requirements.

## Ownership and monthly order

The subsystems have separate authority:

| System | Owns | Must not own |
| --- | --- | --- |
| Personal events v2 | Immutable templates, intrinsic eligibility, causal hazard, hard parameter bounds, declared responses, and exact effect vocabulary | Runtime approval, difficulty rubber-banding, or financial arithmetic |
| Scenario Director | Ranking already-eligible candidates and structured relevance/lesson reasons | Event occurrence, parameter values, approval, or state mutation |
| Runtime Balance | Pressure, pacing cooldowns, recovery, repetition, difficulty policy, bounded parameter sampling, lightweight impact preflight, and approve/reject/null | Inventing eligibility, changing hazard, applying effects, or authoring narrative amounts |
| Event lifecycle | Exact proposal verification, pending-event persistence, response selection, resolution evidence, and follow-up intents | Re-evaluating fairness after approval or doing financial calculations |
| Financial Engine | Authoritative income, expense, insurance, funding, liquidation, debt, ledger, shortfall, and goal calculations | Choosing an event or changing its declared values |

For a non-terminal monthly command with no pending event, the intended order is:

1. run the versioned market and Financial Engine transition;
2. advance balance timers/recovery into the same closing-month draft before any
   subsystem finalizes that new-month state;
3. persist the financial closing state, verified monthly cash margin, exposure
   snapshot, terminal outcome, and negative-cash-flow streak;
4. have the event system form candidates from intrinsic eligibility and causal
   hazard only;
5. have the director, or a frozen deterministic fallback, rank those candidates;
6. pass only the configured leading candidates to Runtime Balance;
7. approve at most one proposal or return null; and
8. atomically persist the next RNG state, next balance state, decision evidence,
   and any queued pending event.

The controller is not called while a personal event is already pending. A
terminal financial outcome prevents scheduling. An approval and its pressure,
recent-event, and recovery updates are one state transition; there must be no
queued event without the matching balance update or consumed pressure.

## State and policy versions

The existing `RuntimeBalanceStateV1` is historical replay data. Its fields,
validation, default-on-absence behavior, repository summaries, and checksum
behavior must remain unchanged for commands that do not opt into v2. It must
not be reinterpreted as the richer state described here.

New controller-enabled runs use an explicit state version equivalent to:

```text
RuntimeBalanceStateV2
  version: 2
  difficulty: guided | normal | hard
  pressureUnits: non-negative integer
  maximumPressureUnits: positive integer
  monthlyRegenerationUnits: positive integer
  monthsSinceAnyEvent: non-negative integer or null when never
  monthsSinceMediumEvent: non-negative integer or null when never
  monthsSinceLargeEvent: non-negative integer or null when never
  monthsSinceCatastrophe: non-negative integer or null when never
  catastropheCount: non-negative integer
  legacyCarryover: optional explicit v1 upgrade evidence
  recovery: null or
    sourceEventId
    sourceTier
    targetedWeakness
    remainingMonths
  recentEvents: bounded ordered records of
    eventId, templateId, templateVersion, category, lessonTags, tier,
    targetedWeakness, approvedMonth
  lessonExposureCounts: stable lesson ID and non-negative count pairs
  recentNegativeCashFlowMonths: non-negative integer
  lastApprovedImpactScorePpm: bounded non-negative integer or null
  developmentRejections: optional bounded structured diagnostics
```

`null` means an event tier has never occurred; a large sentinel number is not
used. Collections have explicit maximum lengths and stable deterministic retention so state
size, JSON, and checksums remain deterministic. Duplicate lesson-count keys,
unknown difficulty values, invalid months, negative
counters, pressure above the configured maximum, and inconsistent recovery
records are validation errors.

The immutable event lifecycle history remains the canonical record of what was
queued and resolved. The bounded balance history is a pacing cache updated
atomically at approval. Validation must reject a cache that contradicts the
corresponding recent lifecycle evidence; it must not silently repair drift.
Template event/category/lesson cooldowns already enforced by personal events v2
remain hard minimums. Runtime Balance may add stricter difficulty-specific
pacing, including tier cooldowns, but can never shorten the template minimum.

Algorithm choices live in an immutable policy selected by a literal such as
`runtime-balance-v1`. An explicit first selection may atomically convert
historical v1 pressure, last-event, recovery, and catastrophe summaries into
v2 with typed `legacyCarryover`; conversion is never performed for an absent
controller command. The policy contains, rather than scatters through code:

- candidate preflight limit;
- initial and maximum pressure, monthly regeneration, and tier costs;
- template/category/lesson/tier cooldown minimums;
- recovery durations and recovery penalties/blocks;
- repetition penalties and underrepresented-lesson bonuses;
- difficulty impact bands, warning strength, and catastrophe limits;
- recent-history and diagnostic retention limits; and
- estimator/controller arithmetic version identifiers.

Policy validation runs at startup and in tests. Unsupported policy or state
versions fail before state mutation.

## Pressure budget

`pressureUnits` is available pacing capacity, not player stress, money, or a
probability. Each tier consumes a configured whole-unit cost. Typical relative
costs may begin near micro 1, medium 2, large 4, and catastrophe 7, but the
authoritative values belong to policy and must be justified by tests and
offline tuning.

A month is calm only when no event is approved. At the close of such a month,
pressure regenerates by the difficulty profile and clamps to the configured
maximum. An approved event consumes its cost instead. This ordering prevents a
month from both being called calm and spending its regeneration immediately.
Insufficient pressure rejects that candidate; it never creates negative
pressure. A null decision may still return an updated balance state because the
calm month advances timers and regenerates pressure.

Pressure cannot be purchased with low resilience, increased because the player
is wealthy, or replenished by arbitrary free money. It is exclusively a
controller pacing budget.

## Cooldowns, repetition, and lesson coverage

The controller checks four independently configured cooldown scopes:

- exact event template ID and version;
- category;
- primary and secondary lesson IDs; and
- severity tier.

Large and catastrophic tiers have the strongest spacing. A candidate that
violates any hard cooldown is rejected with a stable reason code. The checks
derive from immutable event evidence plus the bounded, validated balance cache;
parallel mutable `eligibleAgain` counters must not disagree with lifecycle
history.

Within candidates that pass hard checks, recent repetition applies a
deterministic penalty for the same ID, category, or lesson. An underrepresented
lesson may receive a bounded policy bonus. These values affect priority only;
they cannot make an intrinsically ineligible event eligible, bypass recovery,
increase hazard, widen a parameter bound, or make an unfair impact pass.
Stable candidate order is the final tie-breaker.

If every leading candidate fails, the result is null. The controller must not
reach farther into an unbounded catalog until it finds something harmful.

## Recovery windows

Approval of a configured large or catastrophic event starts a bounded recovery
record. Each successfully processed month decrements `remainingMonths` once.
During recovery:

- catastrophes are blocked;
- large events are blocked or strongly restricted according to the versioned
  difficulty profile;
- immediate reuse of the same meaningful targeted weakness is blocked;
- ordinary simulation, player policies, and player decisions continue; and
- no cash, insurance benefit, debt forgiveness, or market return is fabricated.

The neutral `unrelated_hazard` target used by current declarative events is not
a player weakness and must not become a global recovery lock. Those events are
spaced by ID/category/lesson/tier policy. Future meaningful weakness targets
may use the recovery retarget rule only when the event system declares that
target through a versioned causal contract.

Recovery duration comes from validated template metadata subject to policy
minimums/maximums. It is pacing evidence, not an event-probability modifier.

## Difficulty profiles

Guided, Normal, and Hard are separate immutable profiles. Each configures:

- starting/max pressure and calm-month regeneration;
- tier pressure costs and cooldown minimums;
- recovery duration and the treatment of large events during recovery;
- acceptable direct-impact, cash-burn, recovery-time, and failure-risk bands;
- warning strength and structured warning codes;
- catastrophe count limits; and
- bounded repetition and lesson-coverage weights.

Difficulty does not multiply every bill. Event template bounds and a seeded
sample are the same source of gross amounts at every difficulty. The profile
may approve or reject a sampled proposal based on pacing and impact, but must
not scale costs from player wealth or secretly erase preparation. Hard may
accept a wider risk band and shorter pacing, yet still respects hard template
bounds, causal eligibility, catastrophe limits, and deterministic resolution.

Guided and Normal require at least one currently available, reasonable declared
response whose deterministic preflight does not cause immediate unavoidable
failure. The controller does not invent that response or add a subsidy. If no
bounded sample has a fair response, it rejects the candidate. Hard remains
bounded but may accept a response with a higher explicit risk warning.

## Lightweight impact estimator

Only the first configured number of ranked candidates is preflighted; the
initial contract uses at most five. Catalog eligibility and director ranking
may scan more metadata, but the financial estimator must never run for a sixth
candidate in that decision.

For each declared response, a pure estimator returns structured integer
evidence equivalent to:

```text
directCostCents
lostIncomeCents
temporaryCostCents and durationMonths
coverageBenefitCents and otherBenefitCents
uncoveredCostCents
liquidResourcesUsedCents
likelyTaxableLiquidationCents
likelyCreditUsedCents
cashBurnMonthsPpm
negativeCashFlowDurationMonths
estimatedRecoveryMonths
bankruptcyRisk: none | possible | immediate
estimatedGoalDelayMonths: integer or null when unsupported by bounded preflight
impactScorePpm
```

The estimate reuses production Financial Engine primitives for money/rate
rounding, insurance adjudication rules, the verified completed-month cash
margin, obligation funding order, liquidity, and debt. Negative-cash-flow
duration is a deterministic 120-month bound over declared event flows and
permanent plan deltas. True FI goal delay is intentionally `null` because the
runtime path does not run a full projection. It may
call pure planning helpers such as the existing obligation-funding and
liquidity planners with projected inputs. It must not duplicate those formulas,
append ledger entries, mutate deductibles or coverage usage, commit an event,
run the full monthly transition, or perform Monte Carlo simulation.

The estimator compares the same sampled gross proposal against each player's
verified state. Insurance, emergency savings, liquidity, debt capacity, income,
and obligations may therefore change uncovered cost and consequences. They do
not change the event's gross parameter sample. Prepared and unprepared players
can have different impact evidence from the same plausible incident without
changing its probability or price.

All calculations use integer cents/PPM and safe checked arithmetic. A missing
required helper or an out-of-domain estimate rejects the candidate with a
structured internal reason; it never falls back to floating-point or an
unverified approximation.

## Approval API and decision evidence

The public pure boundary is equivalent to:

```text
chooseBalancedEvent(state, rankedCandidates, seededRng,
                    authoritativeCatalog, verifiedMonthlyCashFlow, policy)
  -> {
       approved: ApprovedEvent | null,
       nextRandom,
       nextBalanceState,
       decision
     }
```

The richer result is necessary because null may regenerate pressure and every
attempted parameter draw must advance replay state deterministically. A simple
`ApprovedEvent | null` facade may wrap this result only if it cannot discard
those state transitions.

For each of no more than the configured top candidates, the controller:

1. verifies the candidate's exact immutable template identity and confirms the
   event subsystem's eligibility evidence;
2. checks pressure, template/policy cooldowns, recovery, catastrophe limit, and
   hard repetition rules;
3. samples declared parameters exactly once in canonical parameter order;
4. rejects unsafe/out-of-range values, or clamps only where the immutable event
   hard-bound contract explicitly requires it;
5. estimates every currently available response through the lightweight
   estimator;
6. compares the best legitimate response with the selected difficulty bands;
7. applies bounded repetition and lesson-coverage priority without bypassing a
   hard rejection; and
8. returns the first approved candidate under stable deterministic ordering, or
   continues and ultimately returns null.

Repeatedly resampling one candidate until it happens to be affordable is not
allowed. That would hide distribution changes and create variable RNG
consumption. A rejection proceeds to the next ranked candidate.

Decision evidence includes controller/policy/estimator versions, difficulty,
candidate limit, selected identity or null, sampled parameters for the approved
proposal, pressure before/after, impact summary, warning codes, and stable
approval/rejection reason codes. Production state may retain a compact approved
summary. Development mode may retain a bounded list of candidate rejections;
diagnostics never affect the decision and are excluded or explicitly versioned
in checksums according to the persistence contract.

Representative rejection codes include `ineligible`, `insufficient_pressure`,
`event_cooldown`, `category_cooldown`, `lesson_cooldown`, `tier_cooldown`,
`recovery_block`, `recovery_retarget`, `catastrophe_limit`,
`parameter_out_of_bounds`, `impact_above_band`,
`unavoidable_failure`, `no_reasonable_response`, and `estimator_error`. Null is an ordinary
successful result, not an exception.

## Causality and fairness guarantees

Runtime Balance is an approval filter after causal hazard. Therefore:

- low cash, missing savings, missing insurance, debt, drawdown, or a high risk
  score cannot increase an unrelated candidate's hazard or create a candidate;
- vulnerability may only worsen the impact estimate and cause rejection or a
  stronger warning;
- wealth does not scale gross event parameters, costs, hazard, or pressure;
- buying an asset does not trigger an immediate crash or repair unless a
  separate versioned causal rule makes the incident intrinsically plausible;
- preparation remains visible through lower uncovered costs, less liquidation
  or credit use, shorter recovery, and lower failure risk;
- a difficulty profile cannot exceed template hard bounds or bypass intrinsic
  eligibility; and
- no event is a valid result whenever all candidates fail.

Tests that compare prepared and unprepared players must hold the candidate,
gross parameter values, difficulty, and RNG evidence constant. Tests for low
cash must prove the candidate-generation/hazard evidence is unchanged, not
merely that both runs happened to return null.

## RNG streams and deterministic draw ownership

The repository currently persists one `mulberry32-v1` `RandomState`. Prompt 09
must not silently replace it with ad hoc derived seeds. The controller version
defines exact draw ownership and order:

- event hazard draws occur before Runtime Balance and remain owned by the event
  scheduler version;
- Runtime Balance owns only bounded parameter draws for the inspected
  candidates, in ranked order and canonical parameter order;
- rejected samples still consume their documented draws;
- cooldown, impact, repetition, and null decisions consume no random values;
  and
- every result persists the returned RNG state, including a null result.

Diagnostics should name the logical stream, for example
`runtime_balance.parameter_sampling.v1`, even while it is serialized through
the single run RNG. If independent named streams are introduced later, each
stream's algorithm, derivation, and current state must become explicit
authoritative state under a new schema/controller version. Existing commands
must retain their old shared-stream order. Merely hashing the current RNG value
inside the controller is not a compatible stream split.

Stable input ranking, candidate limits, and parameter order are part of the
replay contract. Source-file order, object-key iteration, diagnostics mode, or
catalog insertion order must not alter draws.

## Persistence and replay

Controller activation is explicit command evidence, not a changing server
default. A new command field equivalent to `runtimeBalanceControllerVersion`
selects the controller policy. Its supported v1 literal requires the compatible
Financial Engine and declarative event scheduler. It either continues an
existing RuntimeBalanceStateV2 or atomically upgrades v1 in that explicit
command.
Unknown literals and invalid cross-version combinations are rejected before
mutation.

For historical commands:

- an absent controller version preserves the existing scheduler path, exact RNG
  consumption, optional/absent balance-state handling, and
  `RuntimeBalanceStateV1` behavior;
- `causal-hazard-v1` and old `declarative-events-v2` commands are not silently
  upgraded to balance approval;
- old JSON snapshots decode and re-encode without synthesized v2 fields; and
- old replay checksums, repository summaries, and persisted command decoding
  remain byte-for-byte compatible where the existing contract requires it.

For controller-enabled commands, persistence records the exact command version,
next RuntimeBalanceStateV2, next RNG state, compact decision evidence, and exact
approved proposal before lifecycle queueing. Replay uses the persisted version
and immutable template `id@version`; it never reruns against a newest policy or
template. A versioned upgrade requires a new literal plus golden replay vectors.

Difficulty is authoritative state/configuration chosen at run construction, not
an unpersisted request-time override. Development rejection diagnostics must be
bounded and must not make production replay depend on an environment flag.
New API runs explicitly start at Normal; direct native construction remains v1
unless a Guided, Normal, or Hard difficulty is explicitly supplied.

## Performance contract

The normal monthly path is local and bounded. Runtime Balance performs no AI,
network, remote database, background job, full multi-month projection, or Monte
Carlo call. It evaluates at most the configured candidate limit and a bounded
number of responses/effects per candidate.

With limit `K` (initially at most five), bounded response/effect counts, and a
bounded recent-history cache, controller work is effectively `O(K)`. Tests
instrument estimator calls to prove a large ranked input still preflights no
more than `K` candidates. A deterministic benchmark should cover a production-
sized state and catalog without sharing a mutable global timer or random source.

## Test contract

Unit tests cover the independently exported pressure, cooldown, recovery,
repetition, lesson-coverage, difficulty, estimator, and approval functions:

- identical approval, sampled values, reasons, and next RNG under the same seed;
- insufficient pressure and no negative pressure;
- calm-month regeneration and maximum clamping;
- event, category, lesson, and tier cooldown enforcement;
- large/catastrophic recovery activation, countdown, catastrophe block, large-
  event handling, and meaningful-weakness retarget protection;
- catastrophe limits for every difficulty;
- bounded repetition penalties and underrepresented-lesson bonuses;
- intrinsic-ineligible candidate rejection at the trust boundary;
- hard parameter bounds, unsafe-sample rejection, and no affordability
  resampling loop;
- all candidates rejected returning null with the expected next balance/RNG;
- unchanged unrelated eligibility/hazard evidence when only cash changes;
- lower prepared-player impact for the same candidate and gross parameters;
- unchanged gross parameters across wealth levels;
- Guided and Normal rejection when every available response causes immediate
  unavoidable failure;
- Hard accepting wider risk only within causal and event bounds; and
- no more than five estimator invocations for a larger candidate list.

Replay regression tests cover `RuntimeBalanceStateV1`, missing command fields,
old scheduler versions, exact old RNG/checksum vectors, new state validation,
new command/version decoding, JSON continuation, and controller-version upgrade
vectors.

Integration tests cross real subsystem boundaries:

- financial month result to balance timer/negative-cash-flow update to candidate
  approval/null to pending lifecycle persistence;
- event candidate and director/fallback ranking to controller sampling to exact
  template queue verification;
- insurance and obligation-funding helpers to impact evidence without state or
  ledger mutation; and
- lifecycle-backed large-event evidence to persisted recovery state to a later
  monthly command that blocks a catastrophe and still runs ordinary finance.

An integration test must involve two or more subsystem owners; calling multiple
functions from one balance module is only a unit test.

## Prompt 10 boundary and incremental migration

Prompt 09 consumes ranked candidates but does not own the Adaptive Scenario
Director. Until Prompt 10 is enabled, a frozen deterministic adapter may supply
stable candidate order. That adapter must be explicitly versioned and cannot
use AI, approve events, sample parameters, calculate impact, or mutate state.

Prompt 10 may later replace only the ranking input with structured candidate
IDs and reason components. It cannot send unrestricted monetary values,
pre-sampled parameters, or an approval flag. Runtime Balance re-verifies exact
candidate identity, eligibility evidence, hard bounds, and every fairness rule
regardless of the ranking source.

The existing direct `declarative-events-v2` scheduler is preserved for replay.
Controller-enabled scheduling is a new pipeline opt-in, not an in-place semantic
change to an old version literal. Follow-ups remain exact-version eligibility
intents: when due, they must pass intrinsic/history checks and Runtime Balance
under the controller-enabled path; they do not bypass pressure or recovery.

The first implementation should prefer the smallest coherent v2 state, policy,
estimator, and approval integration. Broader balance tuning belongs in Prompt
14's offline Balance Lab and must reuse this production controller rather than
forking a second gameplay algorithm.
