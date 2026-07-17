# Adaptive Scenario Director v2

The Adaptive Scenario Director (the presentation calls it the Hostile Fed) is
the deterministic ranking stage between causal event candidacy and Runtime
Balance. It ranks only candidates already produced by the Event System. It may
add bounded narrative setup, but it never makes an event occur, samples event
parameters, approves an event, calculates financial impact, mutates `GameStateV2`,
or applies an effect.

This document records the implemented Prompt 10 contract and its verification
evidence. It uses Prompt 09's final Runtime Balance v2 state and
`runtime-balance-v1` controller boundary directly; it does not introduce a
parallel approval or history model.

## Audit of the existing implementation

Useful pieces already exist:

- `analyzeRiskV1` returns a deterministic, versioned `RiskSnapshotV1` with
  bounded integer severity values, bands, weakness tags, and fact IDs.
- personal-event v2 owns immutable IDs, versions, categories, tiers, lesson
  tags, weakness targets, eligibility, causal hazard, parameter bounds, and
  response/effect declarations;
- event lifecycle history and RuntimeBalanceStateV2 provide bounded recency,
  lesson-exposure, recovery, and repetition evidence;
- the AI transport validates schema-constrained output, uses privacy guards,
  records bounded audit evidence, and has a deterministic-fallback pattern;
- `queueAiWorldEventV2` strictly validates historical AI event commands and the
  repository replays persisted commands through production reducers.

The existing director is not a safe Prompt 10 implementation:

- `fallbackSelection` and the LLM both select one template instead of ranking
  the eligible candidate set;
- both choose event parameters, including unrestricted authority over values
  inside the template bounds;
- `AiWorldDirectorService.createEvent` emits `queue_ai_world_event_v2`, which
  queues a pending event without Runtime Balance pressure, cooldown, recovery,
  impact, or approval checks;
- weakness scoring is a second hand-written exposure model instead of a
  production use of `RiskSnapshotV1`;
- selection uses a checksum rotation rather than the required relevance,
  lesson, macro, novelty, difficulty, and repetition components;
- the existing Hostile Fed response includes a single approval-like selection,
  targeted weakness, and parameters; and
- the response/API assumes an event is always queued, so it cannot represent an
  ordinary `no_approved_event` result.

The repair must not delete or reinterpret the old reducer. Persisted
`queue_ai_world_event_v2` commands are historical replay inputs.

## Chosen migration approach

Three approaches were considered:

1. **Change `queue_ai_world_event_v2` in place.** This is the smallest diff but
   changes the meaning and checksum of persisted historical commands. Reject.
2. **Let an unpersisted AI response control gameplay order.** This cannot be
   replayed safely and would make provider availability change financial
   outcomes. Reject.
3. **Add an explicitly versioned rank-only director and keep the old command
   frozen.** This creates a small new pure core boundary, lets the normal month
   use a local deterministic ranker, and lets the optional AI endpoint return a
   privacy-minimized validated rank preview. Runtime Balance remains the only
   approval authority. Choose this approach.

New monthly commands opt in with a literal equivalent to
`scenarioDirectorVersion: "scenario-director-v2"`. It is valid only with the
Prompt 09 controller version and declarative event-candidate version required by
that controller. An absent field preserves the exact old path. Unknown values or
invalid version combinations are rejected before any mutation or random draw.

The normal monthly path always uses the deterministic ranker and makes no AI,
network, or remote-database call. The optional AI endpoint is deliberately
read-only: it returns a validated ranking preview or complete deterministic
fallback, never a queued or approved event. Thus an AI outage cannot block or
change ordinary simulation. If AI-authored ordering is ever allowed to affect a
run, it will require a future persisted rank-command version; this implementation
does not infer that authority.

## Authority and data flow

The owner order for a controller-enabled monthly turn is:

1. Financial Engine and Macro System finish the month.
2. `analyzeRiskV1` calculates the post-financial `RiskSnapshotV1`.
3. Event System evaluates intrinsic eligibility and causal hazard using its
   versioned opportunity RNG stream. Risk is not an input to this step.
4. Scenario Director ranks exactly that candidate set using immutable metadata,
   risk, macro, recent decisions, recent events, lesson history, difficulty, and
   optional story-arc IDs.
5. Runtime Balance receives the ordered candidates. It independently rechecks
   candidate identity and evidence, owns parameter sampling and impact preflight,
   and may approve one candidate or return null.
6. Event lifecycle queues only the controller-approved proposal and may attach
   the matching director setup. The resolver later applies declared effects
   through the production financial path.
7. The state transition atomically persists RNG changes, balance changes,
   director evidence, controller evidence, and the optional pending event.

The director never changes candidate membership. In particular, risk severity,
low cash, missing insurance, a recent player decision, or narrative continuity
can change rank only. They cannot create a candidate, raise hazard, force an
approval, or guarantee punishment.

## Pure core contract

Create one pure API equivalent to:

```text
rankScenarioCandidatesV2(input, policy) -> ScenarioDirectorDecisionV2
```

The input contains only structured values:

```text
version: "scenario-director-v2"
riskSnapshot: RiskSnapshotV1
macro: regime, difficulty, and versioned non-monetary macro facts
candidates[]:
  templateId, templateVersion, category, tier,
  lessonTags, targetedWeakness/evidence, and configured director tags
recentDecisions[]: decisionId, month, reasonCode, and semantic tags
recentEvents[]: templateId, category, lessonTags, tier, target, month
lessonExposureCounts[]: lessonTag and non-negative count
difficulty: guided | normal | hard
storyArc: optional versioned arc ID and semantic tags
```

The candidate records must come from the Event System after causal hazard. The
director accepts no parameter definitions, parameter values, response effects,
balances, salaries, dollar costs, approval flags, or mutation callback.

The result is deeply immutable and contains:

```text
version: "scenario-director-v2"
policyVersion: "scenario-director-policy-v1"
riskVersion and riskAsOfMonth
rankingSource: deterministic_fallback
candidateSetChecksum
ranked[]:
  rank, templateId, templateVersion, intendedLesson,
  scoreComponents, totalScore, reasonCodes, optional narrativeSetup
```

`ranked` is an exact permutation of the supplied candidates: no unknown IDs,
duplicates, omissions, version substitutions, or candidate additions. An empty
candidate set returns an empty ranked list and is not an error. The controller,
not this result, records `approved` or `no_approved_event`.

The `candidateSetChecksum` covers canonical, stably sorted candidate identity
and non-monetary ranking metadata. It is evidence against a stale or substituted
AI ranking; it is not a random seed.

## Deterministic scoring policy

Keep weights and affinity mappings in a frozen, startup-validated policy module.
All scores are safe integers in bounded fixed-point units. Do not use
floating-point money, current wall time, source-file order, object-key order, or
random tie-breaking. Final ties sort by `templateId`, then `templateVersion`.

Each candidate receives these independently visible components:

- `weakness_relevance`: maximum verified risk severity mapped to one of the
  candidate's declared targets. `unrelated_hazard` receives no vulnerability
  bonus. The mapping from Risk v1 metric IDs to event weakness IDs is explicit,
  versioned, and total for every mapped metric.
- `lesson_relevance`: bounded overlap between the candidate's immutable lesson
  tags and lessons associated with current verified risk/decision facts.
- `macro_coherence`: a policy-table affinity between immutable
  `templateId@version` or category tags and the current macro regime. Macro can
  affect ordering only, never the causal opportunity draw.
- `recent_decision_relevance`: bounded semantic-tag overlap with recent
  structured player decisions. A risky decision is not a trigger and the score
  cannot bypass any controller rejection.
- `novelty`: positive preference for a template/category absent from the bounded
  recent window.
- `lesson_coverage`: positive preference for the least-exposed immutable lesson
  tags using Runtime Balance's persisted lesson counts.
- `difficulty_fit`: a bounded tier preference from the versioned difficulty
  profile. It cannot alter the template tier or controller impact band.
- `narrative_continuity`: bounded overlap with an optional structured story arc;
  zero when story arcs are unsupported.
- `repetition_penalty`: a non-positive penalty for recent template, category,
  target, or lesson repetition.

Every non-zero component emits one or more stable reason codes. Zero components
may emit a bounded diagnostic reason such as `no_recent_decision_context` only
when useful; diagnostics cannot affect total score. Total score is the checked
weighted sum defined by the policy version.

Risk v1 is a real production input on every director-v2 path. Do not reconstruct
emergency-fund, debt, insurance, portfolio, income, or cash-flow severity in the
director. Tests must fail if the local fallback can rank without the supplied
Risk v1 snapshot. Risk is evaluated after the month's deterministic financial
transition so `asOfMonth` and state month agree.

Until Prompt 11 provides richer causal decision records, recent-decision input
must use a bounded, structured source already persisted in authoritative state
or commands. If a trustworthy semantic record is unavailable, pass an empty
array and score zero; never parse free-form command IDs, UI prose, or AI memory
into financial causality. The interface remains ready for Prompt 11 without
inventing facts now.

## Optional AI ranker

The Hostile Fed personality is allowed in ordering reasons and narrative setup,
not financial authority. Add a new AI contract version/role rather than changing
the existing Hostile Fed v1 request or response in place.

The privacy-minimized AI request contains only:

- candidate IDs/versions, categories, tiers, lesson tags, target tags, and
  deterministic local reason codes;
- risk metric IDs and coarse severity bands, with exact severity PPM, raw
  values, and money omitted;
- macro regime/difficulty and non-monetary macro IDs;
- bounded recent decision/event reason codes and lesson counts; and
- optional structured story-arc IDs/tags.

It excludes names, location, birth date, balances, income, raw risk values,
parameter definitions/bounds/values, response effects, ledger entries, and
free-form player text.

The strict AI response contains only an exact candidate permutation plus, per
candidate, the unchanged engine-owned reason codes and immutable intended
lesson ID. Narrative setup IDs, when present in the deterministic candidate,
remain engine-owned and cannot be authored or changed by AI. The response has
no parameter, amount, severity, impact, effect, approval, selected-event, or
state field. Unknown
fields fail strict validation. Caller-authored narrative prose is never accepted.
Safe logs retain schema-validated reason codes and transport audit metadata, not
hidden chain-of-thought.

Malformed JSON, schema failure, unknown/duplicate/missing candidate IDs, version
substitution, unsafe narrative, timeout, transport error, or audit failure uses
the complete deterministic ranking for the exact same input. Partial AI output
is never merged with fallback output.

The current public AI endpoint retains its existing request envelope but is now
a read-only rank preview. Its response has `eventId: null`, an explicit
`rank_preview_only` outcome, the validated permutation, and the unchanged state
checksum. It performs no repository write and new service calls stop emitting
legacy `queue_ai_world_event_v2` commands. A future AI ranking that affects
gameplay must be introduced as a separately versioned persisted command; until
then the deterministic monthly rank is the only authoritative order.

## Persistence and exact replay

Historical compatibility is strict:

- keep `QueueAiWorldEventV2Command`, `queueAiWorldEventV2`, its persisted Zod
  schema, and its reducer dispatch semantics frozen for old rows;
- absent `scenarioDirectorVersion` retains the exact previous scheduler/director
  path, RNG draw order, state shape, command JSON, and checksum;
- do not synthesize director evidence while decoding old snapshots;
- keep legacy AI contract v1 decodable for audit history; and
- add a golden replay vector proving an existing `queue_ai_world_event_v2`
  command still produces the pre-Prompt-10 checksum.

Director v2 activation is explicit persisted command evidence. New command
schemas reject unsupported cross-version combinations before mutation. The
persisted `scenario-director-v2` literal is permanently mapped to
`scenario-director-policy-v1`; replay recomputes the same complete decision and
monthly record through the production reducer. A future scoring change requires
a new director/policy literal and golden vector, not an in-place policy change.

The complete bounded `ScenarioDirectorDecisionV2` is recorded with the
corresponding monthly result and exposed through a compact API summary. This is
the source for Prompt 11 causal history and Prompt 14 lab metrics. Both an empty
ranking and a controller null decision are explicit; downstream metrics do not
infer "no event" from missing data.

Director scoring consumes no random values. Event opportunity draws stay with
the Event System; parameter draws stay with Runtime Balance. AI transport and
fallback behavior do not advance simulation RNG. Stable ordering therefore
cannot perturb macro or opportunity streams.

## Error handling

Core input validation uses structured codes such as:

- `unsupported_director_version`;
- `risk_snapshot_month_mismatch`;
- `duplicate_candidate` or `invalid_candidate_identity`;
- `candidate_set_mismatch`;
- `unknown_ranked_candidate`, `duplicate_ranked_candidate`, or
  `missing_ranked_candidate`;
- `unknown_reason_code` or `lesson_mismatch`; and
- `unsafe_narrative_setup`.

Invalid deterministic core inputs reject the command without state/RNG mutation.
Invalid optional AI output falls back to the deterministic ranking. Runtime
Balance rejections remain controller reason codes, not director errors.

## Implemented file map

Core ownership is implemented in:

- `src/core/scenario-director-policy-v2.ts` for frozen, startup-validated
  weights, affinities, bounds, mappings, reason codes, and setup IDs;
- `src/core/scenario-director-v2.ts` for total input validation, pure scoring,
  stable ordering, exact-permutation checks, checksums, and immutable decisions;
- `src/core/scenario-director-ai-adapter-v2.ts` for the privacy projection,
  timeout/error handling, strict whole-response validation, and deterministic
  fallback;
- `src/core/monthly-turn-v2.ts` for explicit activation, post-finance Risk v1,
  deterministic ranking, Runtime Balance handoff, and monthly evidence; and
- `src/core/runtime-balance-controller-v2.ts` for revalidating the exact
  candidate permutation and preserving director order while retaining all
  pressure, cooldown, impact, parameter, and approval authority.

Persistence and public boundaries are implemented in:

- `src/server/db/persisted-command-v2.ts` for the optional literal and invalid
  cross-version rejection;
- `src/server/api/service-v2.ts`, `src/server/api/v2/monthly-record.ts`, and
  `src/server/api/contracts-v2.ts` for new-command activation and bounded
  monthly summaries;
- `src/server/ai/contracts.ts` and `src/server/ai/client.ts` for the additive
  `scenario_director` role and semantic exact-permutation validation;
- `src/server/ai/world-director-service.ts` and its response contract for a
  read-only preview with unchanged state and no repository write; and
- `src/features/play/play-console.tsx` plus `world-director-panel.tsx` so the UI
  accurately presents ranking rather than claiming an event was queued.

The historical `hostile_fed` contract, `queue_ai_world_event_v2` command, and
`src/core/ai-world-event-v2.ts` reducer remain frozen for old replay rows.

## Test and replay evidence

The Prompt 10 suites cover:

- deterministic ranking, stable tie breaks, all score components, policy
  validation, bounded scores, empty input, exact candidate membership, strict
  months/metadata, deep immutability, and input-sensitive checksums;
- production Risk v1 plus Event candidate generation plus Director ordering plus
  Runtime Balance parameter/impact checks plus Event Lifecycle queueing;
- top-proposal rejection followed by a later approval, all-proposal rejection,
  unchanged candidate membership under different risk, and independent RNG
  ownership;
- explicit version gating, persisted command decoding, deterministic monthly
  replay, full decision evidence, and the unchanged absent-version golden path;
- privacy-minimized AI serialization and complete fallback for malformed schema,
  unsafe extra fields, stale checksum, unknown/duplicate/missing/wrong-version
  candidates, lesson/reason changes, timeout, provider failure, and audit/client
  failure;
- HTTP request validation through service and core fallback with an unchanged
  state checksum and a repository spy proving zero writes; and
- legacy AI reducer/contract tests that remain green without semantic changes.

No separate AI rank command was added. The authoritative monthly path already
accepts the deterministic director decision atomically, while the optional AI
path is intentionally non-authoritative and read-only. Persisting an AI order
would add replay authority that Prompt 10 neither needs nor grants.

## Compatibility hazards to review before commit

- Prompt 09 may settle different names or persistence locations for candidates,
  controller decisions, named RNG streams, and balance state. Reuse those final
  boundaries; do not create parallel controller or RNG models.
- Adding a new field without an explicit command version can alter historical
  checksums even if TypeScript marks it optional. Old decode/re-encode must not
  synthesize it.
- Changing the existing global `AI_CONTRACT_VERSION` or `hostile_fed` schema in
  place can invalidate teacher/onboarding/explanation clients and old AI audit
  records. Use an additive contract/role version.
- Extending personal-event templates with director metadata can change catalog
  checksums. Prefer a separate versioned director policy keyed by immutable
  `templateId@version` unless a new catalog version is intentionally introduced.
- Recomputing Risk v1 before the financial month closes can persist a stale
  `asOfMonth` and rank from the wrong state.
- Passing raw `RiskSnapshotV1` to AI leaks monetary raw values and exact
  severities. Project only the allow-listed metric ID and coarse band.
- Accepting an AI subset instead of an exact permutation lets the model silently
  suppress eligible candidates. Treat omissions as malformed and fall back.
- Letting director ranking consume RNG changes later parameter, event, or macro
  sequences. Ranking and tie-breaking must be deterministic and draw-free.
- Storing only an approved event loses evidence for Prompt 11/14 and makes null
  ambiguous. Persist the ranking and explicit controller result.
- Reusing `queueAiWorldEventV2` for new work would still bypass Prompt 09 even if
  the server first asked the controller. The persisted reducer itself must
  enforce the new authority boundary.
- UI/API code currently assumes the service always queues an event. Null must be
  a normal successful response, not a 500 or `WORLD_EVENT_NOT_READY` error.

## Completion evidence

Prompt 10 is complete only when new production paths use Risk v1, director
output is rank-only, Runtime Balance can reject any or all proposals, exact old
replay remains green, the optional AI path falls back locally on every invalid or
unavailable response, and integration tests cross at least two independent
system owners. A unit test calling several director helpers does not count as an
integration test.
