# Teaching, checkpoints, and debrief v2

Teaching v2 converts already-verified simulation evidence into bounded learning
material. It never owns a balance, grade, risk calculation, causal judgment,
event effect, or counterfactual result. Its deterministic core selects the
lesson, facts, turning points, causal roles, and recommendations. Optional AI
may only rephrase explicitly supplied text slots; it cannot add or change a
number, fact, grade, cause, turning point, recommendation, or state value.

This document is the Prompt 12 audit and implementation contract. Prompt 11
defines the derived `CausalHistoryV1`, `CausalNodeV1`, `CausalEdgeV1`,
`turning-points-v1`, `CounterfactualResultV1`,
`buildCausalExplanationFactsV1`, and `renderCausalExplanationV1` boundaries.
Teaching v2 must reuse those exact records and renderers rather than create a
second run-history, turning-point, causal-copy, or counterfactual model.

## Implementation status

The Prompt 12 implementation provides deterministic typed fact packets,
Risk-owned first-use and requested-help lesson selection, replayable lesson
memory, an additive checkpoint wrapper, a Prompt 11-backed final-debrief
builder, strict AI claim validation, authenticated service routes, and live
play-console presentation. Automatic and requested lessons use the existing
`record_learning_interaction_v2` command, so the accepted state revision and
bounded learning memory replay through the normal command path without
changing finances, ledger entries, or random state.

The optional rewrite path accepts only allow-listed fact/claim references and
template vocabulary, rejects numeric, causal, and unsupported nonnumeric
claims, aborts at a configured deadline, and returns the identical
deterministic template on timeout, outage, malformed output, or semantic
failure. The legacy education and debrief AI services now apply the same
authority rule: provider output may retain deterministic owner claims and add
only known evidence references; any changed conclusion is discarded in full.

The production paths are `POST /api/v2/runs/{runId}/teaching/moment`,
`GET /api/v2/runs/{runId}/teaching/checkpoint`, and
`POST /api/v2/runs/{runId}/teaching/debrief`, plus the explicitly consented
`POST /api/v2/runs/{runId}/teaching/rewrite`. They authenticate the run,
strictly decode caller input, enforce optimistic revisions, and use repository
owner outputs. Checkpoint reads join exact checksummed monthly records,
start/end RiskSnapshotV1, the ending Goal projection, fresh Exposure, and the
unchanged `checkpoint-v2.1` evidence shape. Debrief reads bind the deterministic
terminal outcome to the exact Prompt 11 causal-history state checksum, verify
counterfactual result checksums and source-command evidence, and recheck the
run checksum after all reads. When the client supplies no counterfactual, the
server selects the newest verified recurring-strategy policy command, changes
the first nonzero supported field in a fixed allow-list to zero, and asks the
production Counterfactual Engine for a bounded 12-month comparison. Missing or
unsupported owner evidence is returned as explicitly unavailable. The play
console consumes each deterministic route without AI consent, suppresses a
recursive automatic-lesson call for the learning command's returned revision,
loads an authoritative teaching checkpoint directly from an advance response,
and keeps optional AI wording visibly secondary.

Three previously implicit curriculum concepts now have stable IDs under the
new immutable `education.en-US.2026.2` catalog:
`diversification`, `restricted_retirement_assets`, and
`job_investment_correlation`.

Known limitations remain explicit:

- Prompt 12 reuses the persisted `AiLearningMemoryV1` compatibility record and
  `record_learning_interaction_v2`; the more elaborate proposed mastery-signal
  schema was not introduced. Exposure proves presentation, not mastery.
- Essential and discretionary consumption remain `source_not_recorded` because
  the Financial Engine does not own those separate categories. Teaching does
  not relabel required cash or an allocation base as spending.
- The deterministic debrief API accepts zero to two counterfactual requests.
  The play console intentionally sends zero and relies on the server-owned safe
  default described above. It has no arbitrary intervention picker; if no
  verified supported recurring-strategy command exists, the debrief reports
  that a counterfactual is unavailable rather than inventing one.
- The rewrite service returns the deterministic fallback at its deadline, but
  the shared generic AI transport does not currently expose a cancellation
  signal. A timed-out provider call may finish in the background; its late
  output is ignored and cannot change the response or run state.
- The local suite integrates production Risk, learning reducer, outcome,
  causal renderer, services, HTTP contracts, and UI renderers. A live Postgres
  Teaching checkpoint/debrief case still depends on an external
  `TEST_DATABASE_URL` and is not part of the offline gate.

Current offline evidence covers immutable typed facts and source prefixes;
fresh Exposure DTI, selected-plan deductible, exact employer-match tiers,
Goal-owned FI progress, and compounding relevance; frozen
`checkpoint-v2.1` shape/checksum compatibility; exact owner-record checksum,
tax-trace, revision/month-chain, aggregate, Risk, Goal, and Exposure joins;
learning-command mutation/replay boundaries; Prompt 11 causal-role debriefs;
deterministic counterfactual-default selection and unavailable behavior;
strict rewrite tamper, unsupported-claim, timeout, and no-write behavior; HTTP
decoding; and server-rendered moment, checkpoint, rewrite, and debrief panels.

## Audit of the existing implementation

### Useful foundations already present

- `src/data/education-content.ts` provides immutable, versioned deterministic
  glossary copy and a total lookup that refuses unknown concepts.
- `src/core/ai-learning-memory-v2.ts` and
  `src/core/learning-interaction-v2.ts` provide bounded, versioned learning
  interaction state and a replayable reducer that does not touch finances,
  ledger, or RNG.
- `src/core/checkpoint-v2.ts` builds immutable, exact, zero-to-twelve-month
  `checkpoint-v2.1` evidence. It validates contiguous monthly records and
  carries command IDs, tax trace IDs, exact financial totals, start/end
  snapshots, and resolved event choices.
- checkpoint persistence reloads revision snapshots and checksummed monthly
  records before rebuilding the evidence. The checkpoint UI already renders a
  small subset of those reconciled totals.
- `RiskSnapshotV1` exposes typed, deterministic metrics, bands, weakness tags,
  and stable fact IDs. The rich terminal outcome persists the authoritative
  grade, end reason, FI result, net worth, solvency, and retirement result.
- the current AI client requires structured output, validates cited evidence
  IDs, prevents the teacher from changing the grade, has a transport timeout,
  and lets both education and debrief services fall back locally.
- the final-result panel renders the persisted deterministic outcome before it
  asks for AI consent. This authority order should remain.

### Partial or incorrect behavior

- teaching is manual. Nothing deterministically detects when a concept first
  becomes relevant or emits a one-time just-in-time lesson.
- the configured curriculum has close substitutes for diversification,
  restricted retirement assets, and job-investment correlation, but lacks
  stable concept IDs for those three required concepts.
- `AiLearningMemoryV1` counts requests, but its confidence never gains verified
  mastery evidence. It does not retain the fact or causal record that triggered
  relevance, distinguish automatic presentation from requested help, or
  support prediction, correction, repetition, and successful-application
  signals. Exposure count alone is not mastery.
- `AiEvidenceFact` is only `{ id, label, value: string }`. It has no typed unit,
  source kind, source record, field, revision, or month. A citation therefore
  cannot prove that a displayed number came from the engine field claimed by
  the copy.
- AI semantic validation checks that cited IDs were supplied, but it does not
  inspect amounts or percentages in free text. An explanation can cite
  `context.cash` and still invent a different dollar amount or percentage.
- `whyNow` is a free-form string constructed by the AI service. The model is
  allowed to author the personalized conclusion instead of receiving a
  deterministic relevance reason.
- the checkpoint omits contribution totals, employer match, current Risk v1
  facts, and a teaching-safe missing-data contract. The UI omits most of the
  available evidence.
- the current financial model does not separately record essential and
  discretionary consumption. `requiredCashCents` and
  `nonDebtObligationsPaidCents` must not be relabeled as essential spending,
  and `afterTaxDiscretionaryCents` is an allocation base rather than spending.
- the debrief service chooses recent events and milestones, not Prompt 11's
  verified turning points. It attaches the first generic context facts to each
  decision rather than the decision's actual causes and consequences.
- deterministic debrief fallback is a generic paragraph. It has no direct-
  cause/contributing-condition distinction, verified strong decisions,
  financial-discipline dimensions, mastery evidence, or bounded
  counterfactuals.
- the AI teacher can write causal prose as long as it cites existing facts. It
  can therefore imply that a vulnerability caused an unrelated event even
  though the citation itself is real.
- final debrief is treated as an AI feature. A complete deterministic debrief
  must be available without consent, provider configuration, network access,
  or audit storage.

### Compatibility boundaries, not duplicates to remove

- `src/core/checkpoints.ts` is explicitly frozen schema-v1 compatibility;
  `src/core/checkpoint-v2.ts` is the current evidence builder. Do not merge
  them or route historical replay through new teaching code.
- `record_learning_interaction_v2`, `AiLearningMemoryV1`, the current
  `explanation` and `teacher` AI roles, and their API contracts are already
  persisted or public behavior. Keep them decodable and replayable. Teaching
  v2 is additive.
- `src/server/ai/game-context.ts` remains the source for old AI roles. Teaching
  v2 must use a new typed fact projector rather than broadening that legacy
  string context.

## Chosen repair

Add a deterministic, additive Teaching v2 derivation layer with four
boundaries:

1. a typed fact packet projects values from GameState, the Goal Result,
   RiskSnapshotV1, `checkpoint-v2.1`, and Prompt 11 causal/counterfactual
   records without recalculating them;
2. a pure relevance policy selects at most one not-yet-presented concept and a
   local service records its first presentation through a replayable command;
3. checkpoint and final-debrief builders consume the same typed facts and
   explicitly report unavailable dimensions instead of estimating them; and
4. optional AI receives a fixed deterministic outline and may return only
   bounded text fragments plus supplied fact references. Deterministic
   validation either accepts the entire rewrite or discards it for the local
   copy.

Automatic teaching is deliberately outside the monthly reducer. After a player
command or time advance, the client may call a local Teaching Moment endpoint.
That endpoint derives the first currently relevant unpresented concept in the
fixed policy order, applies one teaching-memory command with an optimistic
revision check, and returns the deterministic lesson and resulting state. It
performs no AI, tax, market, event, or financial work.
Requested help uses the same builder but is allowed to repeat a previously
presented concept.

This avoids changing every production reducer and keeps the normal monthly
path independent of AI. A time advance may hide several months; the unchanged
checkpoint evidence and Teaching owner bundle preserve those exact monthly
records, while the moment selector evaluates the authoritative resulting state
and Risk snapshot. It does not claim an unrecorded earliest intra-advance
relevance month. The UI shows one lesson per player operation and does not
recursively call the endpoint for the revision created by the teaching-memory
command.

## Ownership and authority

| System | Owns | Teaching v2 may do |
| --- | --- | --- |
| Financial Engine | balances, cash flow, funding, contributions, employer match, transactions | cite exact output fields |
| Goal/Outcome System | target, progress, end reason, grade, solvency result | display persisted/projected result unchanged |
| Risk Analyzer | risk values, units, bands, aggregate severity | group and explain exact risk facts |
| Causal History | direct/contributing/correlation roles, turning points, consequence links | render the role with fixed deterministic wording |
| Counterfactual Engine | intervention, assumptions, horizon, result differences, support status | show at most two verified results unchanged |
| Teaching System | relevance policy, fact projection, missing dimensions, copy templates, presentation memory, bounded recommendations | select and format verified material |
| AI | optional tone and beginner-friendly wording | rewrite only allowed text slots |

The UI formats typed values; it does not calculate them. In particular it may
convert cents to localized currency and PPM to a displayed percentage using one
shared presentation formatter, but may not derive ratios, deltas, grades,
solvency, or causal roles.

## Typed and traceable fact packet

Create a core contract equivalent to:

```text
TeachingFactPacketV2
  version: "teaching-facts-v2"
  runId
  asOfRevision
  asOfMonth
  facts: TeachingFactV2[]
  missingDimensions: MissingTeachingDimensionV2[]

TeachingFactV2
  factId: stable unique identifier
  labelId: allow-listed presentation label
  value:
    money_cents | rate_ppm | months_ppm | integer | years | month | enum | boolean
  source:
    kind: game_state | goal_result | risk_snapshot | checkpoint |
          monthly_record | causal_record | counterfactual
    referenceId: exact versioned record or fact identifier
    field: exact source field name
    revision
    month

MissingTeachingDimensionV2
  dimensionId: allow-listed dimension
  reasonCode: source_not_recorded | source_not_applicable |
              source_unknown | insufficient_verified_evidence |
              counterfactual_unsupported
  sourceReferences: stable IDs inspected before declaring it unavailable
```

Facts use safe integers, branded cents/PPM where available, exact source units,
and deeply frozen arrays. Validation rejects duplicate fact IDs, unknown value
or source kinds, invalid units, non-safe integers, a source revision after the
packet revision, a source month after the packet month, duplicate missing
dimensions, or a fact whose claimed Risk/Checkpoint/Causal ID is absent from
the supplied owner output.

Stable IDs are derived from the owner evidence, not UI order. Representative
IDs are:

- `goal.current.progress_ppm` from the exact Goal Result;
- `risk.v1.emergency_fund_months` from
  `risk-v1.emergency_fund_months`;
- `checkpoint.<startRevision>.<endRevision>.gross_income` from
  `CheckpointEvidenceV2.totalGrossIncomeCents`;
- `checkpoint.<startRevision>.<endRevision>.employer_match` from the exact
  `MonthlyTurnV2Record.recurringAllocations.preTax.employer401kMatchCents`
  records named by the checkpoint; and
- `causal.<recordId>.<factId>` from a Prompt 11 record and its exact edge role.

The packet never stores formatted currency or percentages. Presentation
formatting occurs only after validation, so AI cannot choose how a number is
rounded or substitute a different number.

## Missing dimensions are first-class evidence

Unavailable is different from zero. Teaching v2 must emit a typed missing
dimension whenever the owner system cannot supply the requested value.

The current implementation has these known cases:

| Dimension | Required Prompt 12 behavior |
| --- | --- |
| Essential spending | Report `source_not_recorded`; do not relabel required cash or all living cost as essential consumption |
| Discretionary spending | Report `source_not_recorded`; do not treat an allocation base, unallocated cash, or lifestyle change as spending |
| Mastery | Report `insufficient_verified_evidence` unless at least one allowed causal/interaction signal exists; encounters alone are not mastery |
| Financial-discipline metric with a Risk v1 `unknown` input | Show the unknown owner fact and `source_unknown`; do not score it as average risk |
| Unsupported counterfactual | Preserve Prompt 11's structured unsupported reason and report `counterfactual_unsupported`; do not invent an alternative result |

If a later owner version adds essential/discretionary transaction categories,
Teaching v2 may consume them under a new fact-policy version. It must not add
those financial categories inside teaching code.

## Just-in-time explanations

### Required concepts and triggers

Extend the immutable curriculum with stable entries for
`diversification`, `restricted_retirement_assets`, and
`job_investment_correlation`. Preserve every existing concept ID. Increment
the content version because copy/catalog membership changes.

Create one frozen relevance policy. Each rule names an exact owner fact and a
reason code; rules never use prose or command-ID parsing.

| Concept | Deterministic first-relevance evidence |
| --- | --- |
| `emergency_fund` | emergency-fund Risk v1 fact first becomes known, or a verified funding/shortfall record uses liquid resources |
| `dti` | the authoritative exposure snapshot's `debtToIncomePpm` first becomes known, or a verified debt action changes that fact; Risk v1 debt-service/high-interest facts may add context but are not relabeled as DTI |
| `deductible` | selected health coverage has a deductible, or a verified health claim/event references deductible evidence |
| `employer_match` | a selected retirement plan exposes match tiers, or a monthly record first contains employer match |
| `diversification` | portfolio-concentration risk becomes applicable, or a verified portfolio action changes a diversification-tagged metric |
| `compounding` | the first verified investment contribution is recorded, or the first configured annual checkpoint with investments is reached |
| `financial_independence` | the player-owned/default Goal Result is first available at a checkpoint or on requested help |
| `restricted_retirement_assets` | retirement assets exist while a verified liquidity/funding record distinguishes automatic liquidity from total net worth |
| `job_investment_correlation` | the exact Risk v1 correlation metric becomes known, or a verified sector action changes it |

Existing catalog concepts may retain additional deterministic rules. Every
automatic rule must cite at least one typed fact. Requested help requires a
known concept but does not require adverse risk; its `why now` reason is
`player_requested_help` and it cites the current applicable facts, if any.

### Presentation memory

Do not change `AiLearningMemoryV1` or reinterpret its confidence field. Add an
optional `gameplay.teachingMemory` created only by an explicit new command:

```text
TeachingMemoryV2
  version: "teaching-memory-v2"
  audienceLevel: beginner | intermediate
  concepts[]:
    conceptId
    automaticPresentationCount: 0 | 1
    requestedPresentationCount
    firstPresentedMonth
    firstPresentedRevision
    lastPresentedMonth
    triggerFactIds[]
    masterySignals[]
  recentInteractionIds[]

TeachingMasterySignalV2
  kind: predicted_consequence | corrected_mistake |
        repeated_mistake | successful_application
  causalRecordId
  factIds[]
  month
```

Collections and fact references are bounded and uniquely ordered. Automatic
presentation count may never exceed one. A mastery signal must point to a real
Prompt 11 causal record with a matching lesson tag and supported role; the
teaching reducer does not infer a signal from current wealth, net worth, or a
bare exposure count.

`record_teaching_interaction_v2` is server-owned and persists the exact policy
version, trigger kind, concept ID, trigger fact IDs, source causal IDs, and
interaction ID. Its reducer changes only revision, accepted command IDs, and
`gameplay.teachingMemory`. Public callers request `automatic` or a known help
concept; they cannot supply fact IDs or mastery claims.

The old `record_learning_interaction_v2` command remains frozen. On first use,
TeachingMemoryV2 may copy only the old audience level. It must not convert old
counts or confidence into automatic-first-use or mastery evidence.

### Lesson output

A `TeachingMomentV2` contains one title, at most two short paragraphs, one
`whyNowReasonCode`, at most three action-tip IDs, at most eight fact IDs, and
the exact interaction command result. Deterministic templates provide all
copy. Output validation enforces paragraph and character limits before the UI
renders it.

## Periodic checkpoint wrapper

Keep `CheckpointEvidenceV2` and literal `checkpoint-v2.1` unchanged. Build an
additive `TeachingCheckpointV2` from the exact start state, end state, verified
monthly records, checkpoint evidence, start/end Risk v1 snapshots, and Goal
Results. The repository already loads all but the derived Risk/Goal values; its
read helper should return the verified bundle to both builders rather than
querying the same range twice.

The Time Controller remains responsible for configured interval, important
milestone, pending-event, and terminal stop timing. When it produces a
checkpoint input, the Teaching service builds this wrapper; Teaching v2 does
not maintain another calendar or decide when simulation time stops.

The wrapper contains source-linked sections for:

- gross and after-tax income;
- required non-debt spending and total required cash, using those exact labels;
- essential and discretionary spending missing dimensions until an owner
  record exists;
- debt payments, debt interest, and liabilities change;
- employee 401(k), employer match, HSA, IRA, taxable-investment, and extra-debt
  allocations summed from the included monthly allocation records;
- investable-asset change and market-value change as separate facts;
- net-worth change;
- opening and closing automatic liquidity when modern monthly records provide
  it, otherwise a typed missing dimension;
- emergency-fund months and liquid-resource coverage from Risk v1;
- FI target/progress from the Goal Result;
- age from the canonical outcome selector already used by the checkpoint;
- current Risk v1 facts and bands; and
- resolved event choices with causal-history references when available.

`TeachingCheckpointV2` retains the original checkpoint evidence by reference
or as an unchanged nested object. It aggregates hidden monthly ticks and never
emits a per-month narrative list. Its response states that policy adjustment is
available; the existing recurring-strategy and action reducers remain the only
way to change policy.

## Deterministic final debrief

The final debrief is built locally first and is available without AI consent.
Its input is the terminal GameState, persisted Goal/Outcome result, final Risk
snapshot, Prompt 11 causal history, selected Prompt 11 turning points, supported
counterfactual results, and TeachingMemoryV2 when present.

`TeachingDebriefV2` contains:

- the exact grade, end kind, primary reason, reason codes, reached month, FI
  result, net worth, solvency, and retirement facts from the persisted outcome;
- financial-discipline sections that group exact Risk v1 facts under liquidity,
  cash flow, debt, protection, diversification, and long-term readiness. The
  grouping has no composite score and cannot modify the grade;
- learning encounters and supported mastery signals. Concepts without a
  verified signal are labeled `not_assessed`, not `unknown` or `confident`;
- two or three Prompt 11 turning points when that many distinct verified
  records exist. A shorter valid history returns the verified subset and an
  `insufficient_verified_evidence` missing dimension rather than padding it;
- direct causes, contributing conditions, and correlations using the exact
  Prompt 11 edge roles;
- at most two supported bounded counterfactuals with intervention, horizon,
  assumptions, and engine-produced differences unchanged;
- at most two strong decisions supported by an improving consequence edge;
- at most two change opportunities supported by a worsening consequence edge;
  unrelated bad luck is never labeled a player mistake; and
- at most three deterministic recommendation IDs chosen from exact risk,
  causal, and lesson tags, each with source fact IDs.

Prompt 11 owns turning-point detection and counterfactual execution. Teaching
v2 asks for the leading two or three of its maximum-five retained turning
points. It requests one `CounterfactualResultV1` by default and may display a
second only when a different supported source command is independently
evaluated; each request still changes exactly one intervention. Teaching v2
must not run an alternate reducer itself, alter the 24-month/256-command bounds,
silently continue after a returned stop reason, or decide that a correlation is
causal.

Deterministic causal copy owns the verbs. Debrief construction imports
`buildCausalExplanationFactsV1` and `renderCausalExplanationV1`; it does not
duplicate their rule table. A `direct_cause` edge therefore uses Prompt 11's
direct template, while a `contributing_condition` edge explicitly says the
condition did not cause the incident. AI is not given a slot containing the
causal sentence, verb, or role, so it cannot reclassify the relationship.

Recommendation policy is a frozen map from verified reason/lesson tags to
educational actions such as reviewing liquid reserves, high-interest debt,
matched contributions, coverage, or concentration. It does not calculate an
amount, promise an outcome, or provide regulated professional advice.

## Optional AI rewrite boundary

Do not change the existing AI contract version or old `teacher`/`explanation`
schemas in place. Add Teaching v2 roles/contracts or a separate v2 client path.
The deterministic response is complete before the optional call starts.

The request contains:

- the fixed section, concept, turning-point, recommendation, and causal-record
  IDs chosen by deterministic code;
- allow-listed deterministic reason codes;
- an AI-safe projection of only the minimum typed facts needed for those
  sections: semantic fact ID, label ID, value kind, and exact value;
- required fact-reference positions; and
- audience level and copy limits.

The AI projection omits run ID, player ID, command/transaction IDs, source
record IDs, revision, and unused facts. The server retains the complete source
mapping and packet checksum for validation and traceability. The request
contains no full GameState, full ledger, command payloads, raw free text,
parameter authority, calculation request, or mutation callback.

The response uses fragments rather than prose-embedded numbers:

```text
TeachingTextFragmentV2 =
  { kind: "text", text: bounded non-numeric prose }
  | { kind: "fact_ref", factId: supplied fact ID }
```

The model returns the exact requested section IDs. It cannot return a grade,
amount, percentage, cause role, turning-point choice, recommendation choice,
new fact, new section, or state value. Free-text fragments reject digits,
currency symbols/codes, percent signs/units, and numeric-claim tokens. Every
displayed numeric token is inserted later by the deterministic renderer from a
`fact_ref`. Causal sentences and grade/end-reason sentences are not rewritable.

Semantic validation rejects the entire AI response for an unknown/duplicate/
missing section, fact reference outside the request, missing required fact,
numeric prose, causal language in a non-causal slot, changed ordering, output
limit violation, or invalid structure. It never merges a partially valid
response. Timeout, transport error, provider outage, invalid output, or audit
failure returns the already-built deterministic response.

Use a service-level bounded timeout that can abort the transport; a test must
use a never-resolving fake transport and prove fallback completes at the
configured deadline. Optional AI calls occur only in explicit Teaching API
requests and never in monthly simulation, checkpoint evidence construction,
causal-history derivation, debrief construction, or replay.

## Persistence and replay

- absence of `gameplay.teachingMemory` remains absence during v1-to-v2
  migration, native-state decode, generic finalization, and historical command
  replay;
- `checkpoint-v2.1` retains the same fields, validation, canonical checksum,
  repository rebuild, and public `evidence` object;
- old `AiLearningMemoryV1`, `record_learning_interaction_v2`, AI role-v1 audit
  records, and old AI endpoints remain decodable and testable;
- new teaching-memory commands carry an explicit policy/version and strictly
  reject unknown concepts, trigger kinds, source refs, or mastery signals
  before mutation;
- save/load and command replay preserve teaching memory, source references,
  interaction order, and checksum; and
- no AI response is needed to replay authoritative state. If optional copy is
  cached, it is non-authoritative presentation data keyed by its validated fact
  packet checksum, not a GameState mutation.

Add literal golden vectors for an old state with no teaching memory, an old
learning-interaction command, unchanged `checkpoint-v2.1` evidence, and a new
teaching-memory command followed by JSON continuation.

## Expected file map

Create:

- `src/core/teaching-policy-v2.ts` — concept triggers, deterministic copy IDs,
  recommendation mapping, discipline grouping, limits, and policy validation;
- `src/core/teaching-facts-v2.ts` — typed fact/missing-dimension contracts,
  projections, source validation, and immutable packet construction;
- `src/core/teaching-memory-v2.ts` — bounded v2 memory, validation, mastery
  signal validation, and pure update;
- `src/core/teaching-interaction-v2.ts` — replayable server-owned interaction
  command and reducer;
- `src/core/teaching-moment-v2.ts` — first-relevance selection and local lesson
  builder;
- `src/core/teaching-checkpoint-v2.ts` — aggregation wrapper over unchanged
  `checkpoint-v2.1` and exact monthly records;
- `src/core/teaching-debrief-v2.ts` — deterministic discipline, mastery,
  turning-point, `renderCausalExplanationV1`, `CounterfactualResultV1`,
  strengths, opportunities, and recommendation assembly;
- `src/core/__tests__/teaching-facts-v2.test.ts`,
  `teaching-moment-v2.test.ts`, `teaching-checkpoint-v2.test.ts`, and
  `teaching-debrief-v2.test.ts` — pure unit and mutation-boundary tests;
- `src/core/__tests__/teaching-causal-debrief-v2.integration.test.ts` — real
  Goal/Risk/Causal/Counterfactual-to-Debrief integration;
- `src/server/teaching/service-v2.ts` — local moment/checkpoint/debrief
  orchestration and server-owned interaction commands;
- `src/server/ai/teaching-contracts-v2.ts` and
  `src/server/ai/teaching-rewriter-v2.ts` — additive strict fragment contracts,
  semantic validation, abortable timeout, and deterministic fallback;
- `src/server/ai/__tests__/teaching-rewriter-v2.test.ts` — unsupported numeric,
  structural, citation, causality, timeout, and outage tests; and
- `src/app/api/v2/runs/[runId]/teaching/moment/route.ts` and
  `src/app/api/v2/runs/[runId]/teaching/debrief/route.ts` — local-first `POST`
  routes. The existing checkpoint `GET` gains only the additive wrapper field.
  Optional AI rewriting is an explicit consented request mode, never a monthly
  side effect.

Modify:

- `src/data/education-content.ts` and its tests — add the three missing stable
  concepts and increment the content version;
- `src/core/game-state-v2.ts` and state-validation modules — optional
  TeachingMemoryV2 with no default-on-decode;
- `src/server/db/persisted-command-v2.ts`, command contracts/support, and
  `run-state-replay-v2.ts` — strict new command decoding, dispatch, and replay;
- `src/server/db/run-repository-read.ts` and `run-repository.ts` — share the
  verified checkpoint range bundle and expose the teaching wrapper without
  changing the old evidence builder;
- `src/server/api/contracts-v2.ts`, `service-v2.ts`, `http.ts`, `runtime.ts`,
  `openapi.ts`, and their tests — new teaching contracts/endpoints and an
  additive optional teaching checkpoint object beside the unchanged evidence;
- `src/server/ai/contracts.ts` and `client.ts` only as additive role plumbing if
  the separate rewriter uses the shared transport/audit client; preserve every
  old literal and semantic validator;
- `src/features/play/decision-panels.tsx` — deterministic just-in-time card,
  requested-help flow, progressive glossary disclosure, and optional AI
  rephrasing after local content is visible;
- `src/features/play/run-controls.tsx` — complete teaching checkpoint sections,
  explicit unavailable dimensions, fact-source affordances, and continuing
  access to policy controls;
- `src/features/play/debrief-panel.tsx` — local debrief first, exact causal-role
  labels, turning points, supported counterfactuals, mastery status, strengths,
  opportunities, and optional AI wording; and
- `src/features/play/play-console.tsx` — call the local moment service once per
  player/simulation operation and suppress recursive checks caused by the
  teaching interaction's own revision.

Do not modify financial formulas, Risk v1 formulas, goal grades, Prompt 11
turning-point rules, counterfactual execution, `checkpoint-v2.1` fields, or the
legacy learning/AI reducers to implement this prompt.

## TDD and implementation sequence

### 1. Lock historical behavior

- [ ] Add a literal checksum/field-shape test for representative
  `checkpoint-v2.1` evidence before adding the wrapper.
- [ ] Add literal checksums for a schema-v2 state without teaching memory and
  replay of an existing `record_learning_interaction_v2` command.
- [ ] Run the focused replay, checkpoint, learning-memory, AI contract,
  education-service, and debrief-service tests and record the passing baseline.

### 2. Typed facts and unavailable dimensions

- [ ] Write failing tests for each value/source kind, unique IDs, exact source
  field/revision/month, deep immutability, and invalid source references.
- [ ] Write failing tests proving essential/discretionary spending are marked
  unavailable and are never populated from required cash, allocation base, or
  residual cash.
- [ ] Implement `TeachingFactPacketV2` and projections by selecting owner
  outputs only; reuse branded integer guards and canonical hashing.
- [ ] Assert that building any fact packet leaves GameState, ledger, owner
  evidence, and RNG checksum-identical.

### 3. Relevance policy and presentation memory

- [ ] Add curriculum tests for every required concept ID and the new content
  version.
- [ ] Write one failing trigger test for each required concept using actual
  Risk, Goal, coverage, monthly, and causal outputs rather than string fixtures.
- [ ] Prove stable selection by earliest trigger revision, policy priority, and
  concept ID; prove at most one automatic moment is returned.
- [ ] Prove an automatically presented concept is not returned twice, while
  requested help can return it again.
- [ ] Implement bounded TeachingMemoryV2 and reject a second automatic
  presentation, fake causal/mastery refs, duplicates, overflow, and wealth-only
  mastery claims.
- [ ] Implement the server-owned interaction reducer and prove its diff is
  limited to revision, accepted command IDs, and teaching memory.

### 4. Checkpoint teaching wrapper

- [ ] Build three real modern monthly records with the production Financial
  Engine and assert exact sums for employee contribution, employer match, HSA,
  IRA, taxable allocation, extra debt, market change, and liabilities change.
- [ ] Assert every displayed value cites the exact checkpoint/monthly/Risk/Goal
  source and the original `CheckpointEvidenceV2` checksum is unchanged.
- [ ] Assert essential/discretionary gaps are explicit, unknown Risk metrics
  stay unknown, hidden months are aggregated, event choices retain causal refs,
  and zero-month checkpoints remain valid.
- [ ] Refactor repository checkpoint loading to return one checksummed range
  bundle, then build both the old evidence and new wrapper from it.

### 5. Deterministic debrief

- [ ] Use a real terminal Goal/Outcome result and assert debrief grade, end
  reason, FI, net worth, solvency, and retirement facts are exact owner values.
- [ ] Use Prompt 11 fixtures/production derivation to assert two or three
  distinct turning points, a hard maximum of three, and an explicit missing
  dimension when fewer than two exist.
- [ ] Assert direct cause, contributing condition, and correlation render
  different fixed wording and preserve the exact source edge role.
- [ ] Assert at most two supported counterfactuals, unchanged intervention and
  result facts, and explicit unsupported reasons.
- [ ] Assert improving evidence can produce a bounded strong decision,
  worsening evidence can produce a change opportunity, and unrelated event
  occurrence is never called a mistake.
- [ ] Assert mastery is `not_assessed` for encounter-only and wealth-only runs,
  and is shown only for supported Prompt 11/interaction signals.
- [ ] Assert recommendation count is at most three, every recommendation cites
  supplied facts, and the builder mutates no state/history/counterfactual.

### 6. Strict optional AI rewriting

- [ ] Add additive request/response schemas using exact section IDs and text/
  fact-reference fragments.
- [ ] Test valid rephrasing, then reject an invented dollar amount, invented
  percentage, uncited supplied amount, unknown fact, duplicate/missing section,
  changed order, changed grade, changed recommendation, changed turning point,
  causal language in a non-rewritable slot, and overlong output.
- [ ] Prove any invalid fragment discards the complete AI response and returns
  the byte-identical deterministic teaching object.
- [ ] With fake timers and a never-resolving abort-aware transport, prove the
  configured timeout aborts and returns fallback. Repeat for provider outage,
  malformed output, and audit failure.
- [ ] Assert no optional-AI code path can invoke a repository mutation or any
  financial, goal, risk, event, causal, or counterfactual reducer.

### 7. Persistence, API, and UI

- [ ] Strictly decode, persist, reload, and replay the new interaction command;
  add JSON-continuation and checksum golden vectors.
- [ ] Reject unknown teaching policy versions, client-supplied fact/mastery
  refs, stale revision, duplicate interaction, terminal automatic lesson, and
  invalid concept without mutation.
- [ ] Add API tests for automatic local lesson, no-relevant-concept null,
  requested help, stale race, checkpoint wrapper, deterministic terminal
  debrief, optional AI success, and fallback.
- [ ] Render one/two-paragraph lesson bounds, progressive glossary, full
  checkpoint, unavailable dimensions, deterministic debrief, source details,
  and optional AI source labels.
- [ ] Prove the play console makes no recursive teaching request after applying
  the teaching command's returned revision and does not require consent for
  deterministic content.

### 8. True subsystem integration and final verification

- [ ] Financial Engine -> monthly record -> unchanged checkpoint-v2.1 ->
  TeachingCheckpointV2: assert contribution/match totals and source trace IDs.
- [ ] Risk Analyzer -> relevance selector -> teaching interaction reducer ->
  save/load/replay: assert first-use exactly once and no financial/RNG change.
- [ ] Goal/Outcome + Causal History + Counterfactual Engine -> deterministic
  debrief: assert grade identity, causal-role identity, turning-point limit, and
  supported alternative facts.
- [ ] Teaching service -> optional AI validator/fallback -> UI contract: assert
  unsupported numeric claims never reach the response while valid fact refs do.
- [ ] Repository -> checkpoint range -> TeachingCheckpointV2 database
  integration, guarded by `TEST_DATABASE_URL`, including corrupt-record
  rejection.
- [ ] Run focused tests with
  `corepack pnpm vitest run src/core/__tests__/teaching-facts-v2.test.ts src/core/__tests__/teaching-moment-v2.test.ts src/core/__tests__/teaching-checkpoint-v2.test.ts src/core/__tests__/teaching-debrief-v2.test.ts`.
- [ ] Run the causal and service integration tests, existing checkpoint/
  learning/AI/replay suites, `corepack pnpm lint`,
  `corepack pnpm typecheck`, and `corepack pnpm verify`.

## Required test matrix

Prompt 12 is incomplete unless the final suite explicitly proves:

- checkpoint aggregation over multiple hidden months;
- exact traceability for every displayed number and typed unavailable values;
- debrief grade identity with the persisted Goal/Outcome result;
- unsupported AI amount and percentage rejection, not merely missing citations;
- timeout/outage/audit/invalid-output deterministic fallback;
- distinct direct-cause and contributing-condition wording, with correlation
  never promoted to causation;
- two-to-three turning-point selection and hard maximum three;
- automatic glossary/lesson first use exactly once and requested-help repeat;
- no financial, ledger, RNG, causal-history, or real-run mutation by facts,
  checkpoint, debrief, counterfactual display, or AI;
- one-to-two paragraph lesson bounds and bounded debrief/recommendation counts;
- missing essential/discretionary/mastery/counterfactual dimensions stay
  explicit instead of becoming zero or guessed;
- legacy `checkpoint-v2.1`, old learning commands, absent state fields, and old
  AI contracts retain their golden replay behavior; and
- at least the four cross-owner integration paths listed above use production
  implementations on both sides of each boundary.

## Risks and decisions to carry into implementation

- Prompt 11 must land first. Reuse `CausalHistoryV1`, its stable node/edge/source
  IDs, `turning-points-v1`, the causal explanation functions, and
  `CounterfactualResultV1`; do not ship teaching-owned equivalents.
- Prompt 09/10 may add controller/director decision evidence to monthly records.
  Teaching may cite those IDs for lesson relevance, but director rank and
  controller rejection are not financial causes unless Prompt 11 records an
  appropriate causal edge.
- checkpoint range loading currently returns only the old evidence. Refactor
  its internal verified bundle once; do not perform a second loosely validated
  query for teaching totals.
- existing allocation field `afterTaxDiscretionaryCents` is easy to misread. It
  means available cash for allocation and must never appear as discretionary
  spending.
- a service call that records a teaching moment increments run revision. The UI
  must accept the returned state and suppress a follow-up caused only by that
  revision, or it can loop through the curriculum.
- automatic content must remain local. AI consent, provider latency, audit
  storage, or network state cannot decide whether a concept is relevant or
  whether the learner receives the deterministic lesson.
- rejecting digits in AI text is intentionally strict. Fact-reference slots are
  the only reliable way to prove exact numeric grounding across locale and
  formatting variants.
- financial-discipline sections group owner facts but do not calculate a new
  composite score. Adding such a score would create an unowned grading system.
- short or legacy runs may have fewer than two verified turning points or no
  supported counterfactual. Explicitly report that limitation; never pad a
  debrief with recent-but-irrelevant records.

## Completion evidence

Prompt 12 is complete only when deterministic teaching works offline, automatic
first relevance is persisted and replayable, every number has an exact typed
source, unavailable dimensions are visible, checkpoints aggregate real monthly
records without changing `checkpoint-v2.1`, final debriefs consume Prompt 11
causal/counterfactual results, optional AI cannot add numeric or causal claims,
and all legacy replay plus unit and cross-subsystem integration tests pass.
