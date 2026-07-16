# Causal History and Counterfactual v1

**Goal:** Derive traceable causal history and sparse turning points from existing verified run evidence, and compare one bounded alternative through the production reducer without mutating the real run.

**Architecture:** A single-pass replay reader produces compact verified transitions from existing anchors, commands, monthly records, event/milestone evidence, and the authoritative ledger. Pure core modules build an allow-listed causal graph and turning points; a read-only service validates tax/seed compatibility and runs exactly one typed counterfactual intervention through `reduceGameCommandV2`.

**Tech Stack:** TypeScript 5.9, Vitest 4, Zod 4, Drizzle ORM/PostgreSQL, immutable `GameStateV2`, integer cents/PPM, and canonical SHA-256 checksums.

## Global Constraints

- Do not create a second history store, financial calculator, event engine, tax calculator, or RNG model.
- Preserve every historical command meaning, absent optional field, RNG order, state shape, and replay checksum.
- Use only stable structured source evidence; AI and free-form prose cannot create causality.
- Counterfactual v1 changes exactly one allow-listed policy leaf or one event response, runs for at most 24 processed months/256 commands, and performs no write.
- Unit tests and true integrations crossing at least two subsystem owners are required; PostgreSQL execution is reported honestly when `TEST_DATABASE_URL` is absent.

---

Date: 2026-07-16

This document records the implemented architecture and verification contract for
Prompt 11. The system derives a
verified causal view from the authoritative run state, sparse replay anchors,
accepted commands, monthly records, event lifecycle evidence, milestone history,
and the embedded ledger. It does not add a second gameplay history or a second
financial calculator.

## Current audit

The repository already has most of the necessary source evidence:

- `accepted_commands` stores the exact command envelope, payload, contiguous
  revisions, and resulting state checksum;
- `run_state_snapshots` and `run_state_migrations` provide sparse, checksummed
  anchors, while `loadRunStateAtRevisionV2` replays accepted commands through
  `reduceGameCommandV2`;
- `monthly_turn_records` stores the Financial Engine result and references exact
  tax evidence;
- `GameStateV2.ledger` is the financial authority and every new journal
  transaction carries command identity plus a command, event, milestone, or
  system causal reference;
- `eventLifecycle.pending` and `eventLifecycle.history` retain event identity,
  parameters, response, cost, lesson, and scheduled-flow evidence;
- `lifeMilestones` retains scheduled and resolved milestone evidence;
- Risk v1 and the financial-goal projector deterministically derive risk facts,
  net worth context, liquidity context, and FI progress from a verified state;
  and
- Prompt 09 and Prompt 10 are expected to persist Runtime Balance approval/null
  evidence and Scenario Director rank evidence in the monthly record.

The Prompt 11 repair adds one verified transition reader, a causal rule engine,
turning-point selection, a bounded counterfactual runner, and an explanation
boundary. Those views are derived from the evidence above. A new append-only
`causal_history` table, a full-state snapshot per month, or an AI-authored cause
record would compete with the existing authorities and is forbidden.

## Authority and ownership

| Owner | Provides | Does not provide |
| --- | --- | --- |
| Accepted-command/replay layer | Exact player/system command, revision order, verified pre/post state, and checksum | A financial or causal interpretation |
| Financial Engine and ledger | Exact financial transition, funding/liquidation/debt results, and journal provenance | Event occurrence or teaching prose |
| Event System | Intrinsic eligibility, causal opportunity, immutable template identity, and declared response effects | Runtime approval or financial arithmetic |
| Scenario Director | Rank and rank-reason evidence for an already eligible candidate set | Occurrence, parameters, approval, or consequences |
| Runtime Balance | Approval/null, sampled parameter, impact, warning, pressure, and recovery evidence | Incident probability or applied financial effects |
| Risk v1 | Derived metric/fact values and weakness tags at an exact month | Event occurrence or a causal edge by itself |
| Causal History v1 | A deterministic graph and turning points derived from the verified sources | New gameplay facts or persistent financial truth |
| Counterfactual v1 | One isolated alternative replay through the production reducer | A prediction, an alternate save, or replacement tax math |
| AI | Optional plain-language phrasing of supplied edge/fact IDs | Creating edges, changing their role, calculating values, or changing the result |

The normalized SQL ledger rows remain an audit/query projection. Graph derivation
uses the replayed embedded ledger because `GameStateV2.ledger` is gameplay
authority. Repository integration tests cross-check the normalized rows, but the
graph must never prefer them over a different embedded ledger value.

## Versions and public result shape

Use additive literals and never synthesize them into old states or commands:

```text
causal-history-v1
turning-points-v1
counterfactual-v1
causal-explanation-v1
```

The graph is an on-demand immutable result, not a `GameStateV2` property:

```text
CausalHistoryV1
  version: "causal-history-v1"
  runId
  fromRevision
  toRevision
  sourceStateChecksum
  historyChecksum
  nodes[]
  edges[]
  turningPoints[]
  coverage
    beginsAtRevision
    endsAtRevision
    preMigrationHistoryAvailable
    summarizedCommandRanges[]
    missingEvidence[]
```

`historyChecksum` is the canonical SHA-256 of the version, range, source checksum,
nodes, edges, turning points, and coverage. It makes a derived response comparable
after save/load; it is not stored as a new authority.

### Stable source references

Every node and edge carries one or more machine-readable `sourceEvidenceIds`.
Use source IDs that already exist and stable derived IDs with these namespaces:

```text
command:<commandId>
state:<revision>:<stateChecksum>
monthly:<commandId>
tax:<traceId>
ledger:<transactionId>
event:<eventId>
event-response:<eventId>:<responseCommandId>
runtime-balance:<monthlyCommandId>
scenario-director:<monthlyCommandId>
milestone:<milestoneId>:<commandId>
risk:<month>:<metricId>:<factId>
outcome:<resultingRevision>:<reasonCode>
```

Do not generate identity from array position, UI text, AI text, current wall time,
or an unversioned object serialization. When a source lacks the required stable
identity, omit the derived claim and report it in `coverage.missingEvidence`
instead of inventing an ID.

### Nodes and affected values

`CausalNodeV1` contains:

```text
id
kind:
  decision | policy_change | event_opportunity | director_ranking |
  event_approval | event | response | financial_effect | risk_change |
  milestone | checkpoint_change | recovery | end_condition
month
resultingRevision
sourceEvidenceIds[]
lessonTags[]
affectedValues[]:
  metricId, unit, before, after, delta, factIds[]
```

Money remains integer cents. Ratios and FI progress remain integer PPM. Values
are copied from verified records or owning selectors. The graph cannot convert
units, round dollars, infer an amount from prose, or recalculate a ledger balance
with a different formula.

### Edges and roles

`CausalEdgeV1` contains:

```text
id
parentNodeId
childNodeId
role: direct_cause | contributing_condition | correlation
ruleCode
sourceEvidenceIds[]
```

The edge ID is `edge:<ruleCode>:<parentNodeId>:<childNodeId>`. The complete graph
sorts nodes by revision, month, kind, and ID, then edges by child ID, role, rule,
and parent ID. Duplicate IDs, missing endpoints, a forward reference to a later
cause, unknown roles/rules, empty source evidence, unsafe values, or a cycle are
validation errors.

## Verified transition reader

Add one repository reader that reconstructs a range once and emits compact
verified transitions. It must not call `loadRunStateAtRevisionV2` once per
command, which would make a long history quadratic.

```text
VerifiedRunTransitionV1
  command: exact decoded GameCommandV2
  expectedRevision
  resultingRevision
  effectiveMonth
  resultingStateChecksum
  before: CausalStateDigestV1
  after: CausalStateDigestV1
  appendedLedgerTransactions[]
  monthlyRecord: verified MonthlyTurnV2Record | null
  newlyResolvedEvents[]
  newlyResolvedMilestones[]
```

The reader must:

1. authenticate the run before disclosing history;
2. select the earliest compatible v2 run-start or migration anchor for the
   requested range;
3. validate the anchor identity and checksum;
4. strictly decode contiguous accepted commands;
5. run every command through the existing `reduceGameCommandV2` production
   dispatch;
6. compare every resulting revision and checksum with its accepted row;
7. verify monthly-record identity/checksum and exact command relationship;
8. derive the ledger suffix from the immutable before/after ledger prefix;
9. derive Risk v1 and financial-goal values from each verified state; and
10. retain only the compact digest and evidence suffix after visiting a
    transition.

`CausalStateDigestV1` includes the state checksum, month, cash, liabilities,
net worth, Risk v1 liquid-resource coverage, FI progress, risk facts, pending
event identity, Runtime Balance recovery summary, milestone IDs, and terminal
outcome. Any automatic-liquidity amount comes only from a verified monthly or
outcome record whose owner supplied the liquidation-cost policy; Causal History
does not choose a rate or reimplement that calculation. The digest is a derived
in-memory value and is never written back into `GameStateV2`.

A migrated v1 run starts causal coverage at its verified migration boundary.
The response must set `preMigrationHistoryAvailable: false`; it must not pretend
that missing v1 command provenance was reconstructed.

## Causal integrity rules

Causal History v1 uses a closed, versioned rule table. There is no generic
"similar timestamp means cause" rule.

| Parent evidence | Child evidence | Role | Rule |
| --- | --- | --- | --- |
| Accepted detailed-action command | Its ledger transactions by `commandId` | direct cause | `decision_applied_financial_transaction` |
| Accepted recurring-strategy command | Resulting strategy state change | direct cause | `policy_command_changed_strategy` |
| Active strategy state | Later recurring-allocation transaction | contributing condition | `policy_shaped_monthly_allocation` |
| Accepted milestone resolution | Matching milestone history and ledger transaction | direct cause | `milestone_resolution_applied` |
| Event opportunity/candidate evidence | Runtime Balance approval | direct cause | `causal_opportunity_reached_controller` |
| Scenario Director rank evidence | Runtime Balance approval | contributing condition | `ranking_order_shaped_controller_review` |
| Risk fact used for director relevance | Director ranking | contributing condition | `risk_relevance_shaped_ranking` |
| Shared employment-sector and investment-sector exposure | Job/investment risk fact | correlation | `shared_sector_exposure_correlation` |
| Runtime Balance approval | Matching queued event ID and parameters | direct cause | `controller_approved_queued_event` |
| Verified queued event | Response context offered for that exact event | contributing condition | `event_presented_response_context` |
| Resolved event and selected response | Declared response effect and scheduled flow | direct cause | `event_response_declared_effect` |
| Scheduled event cash-flow ID | Matching later Financial Engine transaction | direct cause | `scheduled_flow_applied_by_financial_engine` |
| Monthly market evidence | Market-revaluation transaction | direct cause | `market_step_applied_revaluation` |
| Financial transaction/state change | Deterministically changed risk fact | direct cause | `financial_change_updated_risk_measurement` |
| Financial transaction/state change | Meaningful FI goal checkpoint change | direct cause | `financial_change_updated_checkpoint` |
| Low liquidity/emergency-fund fact before a consequence | Credit use, forced sale, residual shortfall, or longer verified recovery caused by funding | contributing condition | `liquidity_limited_recovery` |
| Insurance-gap fact before a covered event consequence | Verified uncovered player share | contributing condition | `coverage_gap_increased_uncovered_impact` |
| Residual required-obligation shortfall | Bankruptcy end condition | direct cause | `shortfall_caused_bankruptcy` |
| Automatic liquidity exhausted | Bankruptcy end condition | contributing condition | `liquidity_exhaustion_contributed_bankruptcy` |
| FI projection reaching target | FI end condition | direct cause | `fi_target_reached` |
| Configured age boundary | Retirement-age end condition | direct cause | `retirement_age_reached` |

The following rules are mandatory:

- low cash, debt, insurance gaps, risk score, recent decisions, or director rank
  never cause an unrelated illness, layoff, accident, theft, or other incident;
- `unrelated_hazard` may link opportunity evidence to an event, but no player
  weakness may be its direct causal parent;
- vulnerability edges target the verified consequence, such as uncovered cost,
  credit use, forced sale, shortfall, or recovery time, not event occurrence;
- a Scenario Director ranking is never a direct cause of occurrence and Runtime
  Balance approval is never a cause of the underlying real-world hazard;
- a Runtime Balance decision with `status: none` emits an opportunity and its
  rejection evidence, but never an `event_approval` node;
- a risk fact may contribute to the Director's deterministic ordering, but that
  mechanism does not create candidate membership or the causal opportunity. A
  `risk_relevance_shaped_ranking` edge is omitted unless stored Director
  evidence identifies the exact risk metric contribution; aggregate weakness
  relevance is not enough;
- checkpoints and risk metrics are measurements. They may describe or correlate
  with a transition, but they do not independently create cash, debt, or events;
- a ledger `causalReference` is necessary evidence, but a rule must still match
  its source kind, ID, command, and resulting transaction; and
- when evidence supports no allow-listed rule, omit the edge. Absence is safer
  than an invented causal story.

Tests must include a layoff-like unrelated event in which the event/opportunity
is the direct incident source, while low cash is only a contributing condition
to later credit use. They must also assert there is no `low cash -> layoff`
direct edge.

## Prompt 09 and Prompt 10 evidence boundary

Causal History consumes the optional monthly evidence produced by the final
Prompt 09/10 implementations. The expected fields are
`MonthlyTurnV2Record.runtimeBalanceDecision` and
`MonthlyTurnV2Record.scenarioDirectorDecision`; if implementation settles on a
different final name, map it once in the verified-transition adapter. Do not add
a duplicate controller/director history collection to state.

Runtime Balance evidence must expose, at minimum:

- controller, policy, and estimator versions;
- stable decision/approval ID derived from the monthly command ID;
- candidate-set identity or checksum;
- selected `eventId` and exact template `id@version`, or explicit null;
- sampled parameters for an approval;
- pressure and recovery before/after;
- impact result, warning codes, and approval/null/rejection reason codes; and
- the resulting pending event ID when approved.

Scenario Director evidence must expose its version, policy version, ranking
source, candidate-set checksum, exact ranking, score components, intended lesson,
and reason codes. It must not contain parameters, approval, effects, or financial
authority. A director score can explain ordering; it cannot be promoted to an
incident cause.

Historical monthly commands with absent controller/director versions keep those
fields absent. The graph reports the narrower evidence coverage and derives only
claims supported by the older event lifecycle and ledger. It must not backfill a
modern decision record or change an old replay checksum.

## Turning-point detection v1

Turning points are selected from graph nodes and verified transition digests.
The policy is pure, immutable, integer-only, and startup-validated. It selects at
most five moments for history views; the debrief requests the leading two or
three.

Candidate components are:

- a material reversal in three-month net-worth trend;
- crossing a Risk v1 emergency-fund or liquid-resource band;
- a material increase or decrease in `high_interest_debt_burden`;
- a forced taxable sale or new revolving-credit use from the Financial Engine;
- a material FI-progress change or target crossing;
- start of a large/catastrophic Runtime Balance recovery window;
- verified recovery: exit from a recovery window plus liquidity/debt improvement;
- a life milestone with a financial effect; and
- a terminal outcome.

Put all thresholds, score weights, trend window, maximum count, and suppression
distance in `TURNING_POINT_POLICY_V1`. Recommended initial deterministic bounds
are a three-month trend window, a three-month same-signature suppression window,
and maximum five results. Terminal outcomes and first forced sales have priority,
but stable final ties use resulting revision then node ID.

Near-duplicate suppression groups candidates by primary signature, such as
`liquidity_drop`, `high_interest_debt`, `forced_sale`, `fi_progress`, or
`recovery`. Within the configured window keep only the highest score. Suppression
must never remove the sole source node needed by a retained causal edge; the
turning point references the source graph rather than copying its facts.

No AI, randomness, wall clock, unverified prose, or current UI selection may
change candidate score or selection.

## Counterfactual v1 request

Counterfactual v1 is retrospective and bounded. It starts from the verified
state immediately before one accepted command, changes one typed field or one
event response, and replays unchanged recorded future commands through the
production reducer. It does not manufacture future player actions or external
evidence.

```text
CounterfactualRequestV1
  version: "counterfactual-v1"
  sourceCommandId
  intervention:
    recurring_strategy_field
      commandId: same sourceCommandId
      field: one allow-listed strategy field
      value: one validated replacement value
    | event_response
      commandId: same sourceCommandId
      eventId
      choiceId: one alternate available response
  horizonMonths: integer 1..24
```

V1 supports one leaf change to an accepted `set_recurring_strategy` command or
one `choiceId` change to an accepted `resolve_event_choice` command. It does not
support changing an envelope ID, expected revision, effective month, event ID,
template, parameter, amount in an event, market input, seed, tax evidence, more
than one policy field, or an arbitrary JSON path.

For strategy interventions, the allow list initially contains:

```text
emergencyFundTargetMonthsPpm
insuranceCoverageIds
afterTaxBroadIndexRatePpm
afterTaxSectorRatePpm
afterTaxSpeculativeRatePpm
afterTaxIraRatePpm
afterTaxExtraDebtRatePpm
```

`preTax401kSalaryRatePpm` and `preTaxHsaSalaryRatePpm` are not accepted for a
multi-month v1 counterfactual unless the trusted server has deterministic
alternate tax evidence for every affected tax context. Income/employment changes
are unsupported under the same rule.

The command envelope and all other payload leaves remain byte-for-byte equal.
Before running, compute a canonical structural diff and require exactly one path:
the allow-listed strategy leaf or `payload.choiceId`. An array-valued insurance
selection counts as one policy field only when the replacement is unique,
catalog-valid, canonically sorted, and the rest of the command is unchanged.

## Counterfactual execution

1. Authenticate and load the accepted source command.
2. Reconstruct its exact pre-command state at `expectedRevision` with the sparse
   replay machinery and verify the checksum.
3. Verify that the pre-state contains the referenced event/response or accepts
   the proposed policy field.
4. Create an isolated alternate command with the same ID, revision, month, and
   all unchanged payload fields.
5. Prove the canonical command diff contains exactly the allowed path.
6. Apply the original command to the verified pre-state to establish the actual
   comparison branch; verify it matches the accepted resulting checksum.
7. Apply the alternate command to the same pre-state using
   `reduceGameCommandV2`; do not call a special financial reducer.
8. Replay subsequent accepted commands unchanged on both branches until the
   requested processed-month horizon, actual history end, terminal state,
   incompatible tax context, seed-control failure, or first future command that
   is no longer valid on the alternate branch.
9. Accumulate compact branch metrics from production results and ledger suffixes.
10. Recheck the canonical checksum of the source pre-state and current real run
    after completion. Perform no repository write.

Future commands are never silently skipped, rewritten, or replaced to keep the
alternative alive. A future purchase that becomes unaffordable, a different
pending event, an earlier terminal result, or a stale event response ends the
comparison with a structured stop reason at the last comparable revision.

The runner keeps only the verified opening state, current actual/alternate
states, compact metric accumulators, and current command. It does not deep-clone
the full run each month, persist an alternate state, or create counterfactual
ledger rows.

## Tax-evidence validity

Persisted `MonthlyTaxEvidence` belongs to the actual tax context. It may be
reused on the alternate branch only when that context is unchanged.

Before every alternate `process_month_v2` command:

1. build the production tax request from the alternate opening state with
   `buildTaxRequest`;
2. calculate `fingerprintAnnualTaxContext`;
3. require the persisted evidence to contain the same context fingerprint;
4. require the same economic/policy year, location/filing context, monthly gross
   income, 401k contribution, and HSA contribution expected by the production
   payroll path; and
5. only then pass the exact stored evidence to `reduceGameCommandV2`.

After-tax allocation, emergency-target, protection-policy, and event-response
changes may reuse tax evidence only if this check succeeds for every month.
Missing legacy fingerprints, pre-tax policy changes, employment/income changes,
or any mismatch return `tax_evidence_not_valid_for_alternative` before applying
that month.

If a future trusted tax adapter can calculate deterministic alternate evidence,
the service may accept only server-produced, schema-validated evidence and must
return its model versions and checksums in the counterfactual assumptions. The
public client must never supply authoritative alternate tax totals. Until that
adapter exists, the structured unsupported result is required; duplicating tax
rules locally or treating actual taxes as unchanged is forbidden.

## Seed control

The counterfactual starts from the same verified RNG state. It never overwrites
an alternate cursor to force a result, because doing so would be a second hidden
intervention.

For historical shared-RNG runs, compare the actual and alternate opening
`GameState.random` before each monthly command:

- equal cursors mean that month's macro draw begins from the same seed;
- if the month consumes a different number of event/controller draws, the
  resulting cursors may diverge; and
- once the next monthly opening cursors differ, stop with
  `seed_control_unavailable_after_rng_divergence` rather than claim a matched
  future world.

For future `named-world-rng-v1` runs, require equal `macro` and
`eventOpportunity` epochs and report their exact evidence. Balance/parameter
outcomes may legitimately diverge while keyed macro/opportunity evidence stays
matched. Prompt 11 must consume the named-world contract when Prompt 14 lands;
it must not implement a competing stream split.

Every result reports one of:

```text
matched_named_world
matched_shared_cursor_through_horizon
partial_shared_cursor_then_diverged
not_applicable_no_future_month
```

It also reports the exact last comparable revision/month. A result with partial
seed control remains useful only for its verified prefix and is clearly labeled.

## Counterfactual result

```text
CounterfactualResultV1
  version: "counterfactual-v1"
  sourceCommandId
  sourceRevision
  interventionPath
  originalValue
  alternateValue
  requestedHorizonMonths
  comparedMonths
  lastComparableRevision
  stopReason
  seedControl
  assumptions[]
  actual
  alternative
  difference
  evidenceIds[]
```

Each branch includes cash, total debt, net worth, cumulative forced-sale gross
cents/count, cumulative new revolving-credit use, residual shortfall, recovery
months, FI progress PPM, and outcome kind/reason. `difference` uses checked
integer arithmetic and names its direction. Recovery time is observed from the
versioned Runtime Balance recovery evidence; if no comparable recovery starts
and ends in the horizon it is `null`, not estimated.

The result always includes these assumptions:

- this is a deterministic comparison inside the simulation, not a prediction
  of real life;
- all future accepted player commands except the stated intervention were held
  unchanged until the stop reason;
- exact tax evidence was reused only while the verified tax context matched;
  and
- future seed control is described by the returned seed-control mode.

## Structured errors and stop reasons

Request/source errors throw a typed `CounterfactualV1Error` before branch
execution:

```text
INVALID_REQUEST
SOURCE_COMMAND_NOT_FOUND
SOURCE_EVIDENCE_CORRUPT
UNSUPPORTED_INTERVENTION
MULTIPLE_CHANGES
INVALID_ALTERNATE_VALUE
ALTERNATE_COMMAND_REJECTED
```

Normal bounded divergence is returned as a result stop reason:

```text
requested_horizon_reached
actual_history_exhausted
actual_terminal
alternate_terminal
future_command_no_longer_valid
tax_evidence_not_valid_for_alternative
seed_control_unavailable_after_rng_divergence
command_limit_reached
```

The fixed policy caps the run at 24 processed months and 256 accepted commands.
Command count, not wall-clock time, is the semantic runtime bound. Performance
tests additionally enforce a wall-clock budget outside the pure result.

## Turning-point counterfactual triggers

The engine is read-only and on demand. It is called only by:

- an authenticated explicit counterfactual request;
- a Prompt 12 major teaching moment that supplies one supported source command;
  or
- a Prompt 12 final debrief that chooses one of the retained turning points.

Ordinary `process_month_v2` never runs a counterfactual. Causal history and
turning-point calculation may run at a checkpoint, but alternate replay is not a
monthly side effect.

## Deterministic explanation and AI boundary

`buildCausalExplanationFactsV1` projects only validated graph nodes/edges into
an allow-listed packet. `renderCausalExplanationV1` supplies the production
fallback with role-explicit templates:

```text
direct_cause:
  "[verified subject] directly led to [verified consequence]."
contributing_condition:
  "[verified condition] made [verified consequence] harder; it did not cause the incident."
correlation:
  "[verified facts] appeared in the same context, but the history does not establish causation."
```

Labels come from versioned codes and affected values, never from command IDs or
raw AI prose. Every sentence cites the edge ID and all source evidence IDs.

An optional additive `causal_explanation` AI role may shorten or simplify only
supplied explanation items. Its strict response contains `edgeId`, the unchanged
role, a short phrase, and cited evidence IDs. Validation rejects unknown/missing
edges, role substitution, unknown evidence, extra claims, numeric values not
present in the packet, and causal language inconsistent with the role. The UI
always displays the deterministic role label and keeps the deterministic
sentence as fallback. AI output is never stored as a causal node or edge.

The existing teacher, explanation, and Hostile Fed contract semantics remain
unchanged. AI outage, timeout, malformed JSON, schema failure, or semantic
failure returns the deterministic template without affecting simulation state.

## Performance, pagination, and storage

- Do not add a causal-history table or a monthly full-state snapshot policy.
- Replay one range linearly and discard full intermediate states after deriving
  each compact digest.
- Default history pages cover at most 120 accepted commands. A continuation uses
  the last verified revision, never an array offset.
- Emit detailed nodes only for player decisions/policies, event decisions and
  responses, ledger effects, meaningful risk-band changes, milestones,
  recovery, checkpoints, and outcomes.
- Collapse routine monthly activity without a material threshold crossing into
  a deterministic range summary containing first/last revision, command IDs,
  aggregate metrics, and a canonical checksum of the source IDs.
- Keep at most five turning points and bounded explanation packets, but retain
  references to the immutable accepted rows and ledger evidence.
- Do not prune accepted commands, tax evidence, ledger transactions, event
  response evidence, milestone evidence, sparse anchors, or terminal evidence
  in Prompt 11.

This approach allows low-value derived detail to be summarized without losing
auditability. The canonical sources remain replayable. Persisted-history pruning
would require a separate retention migration and is outside this version.

## API and persistence boundary

Add authenticated read-only endpoints:

```text
GET  /api/v2/runs/{runId}/history?fromRevision=&toRevision=
POST /api/v2/runs/{runId}/counterfactual
```

The history endpoint returns `CausalHistoryV1`. The counterfactual endpoint
strictly parses `CounterfactualRequestV1` and returns `CounterfactualResultV1`.
Both use the existing run bearer secret and map repository corruption to the
existing indistinguishable authorization/corruption policy.

The POST endpoint is computationally a read. It performs no `INSERT`, `UPDATE`,
outbox write, snapshot write, AI audit write, or current-state mutation. A
repeated request against the same source revision returns the same canonical
result while the source history is unchanged.

No database migration is expected. If implementation finds evidence that cannot
be represented in the existing monthly record, add an optional version-selected
field to `MonthlyTurnV2Record` in Prompt 09/10 before Prompt 11; do not create a
new history table to compensate.

## Implemented file map

The pure core is implemented in `causal-history-v1.ts`,
`turning-points-v1.ts`, `counterfactual-v1.ts`, and
`causal-explanation-v1.ts`. Their focused tests cover closed causal rules,
role-safe explanations, sparse deterministic turning points, one-path
interventions, bounds, tax/seed stop conditions, checksum verification, and
input immutability.

The persistence boundary is implemented in
`causal-history-repository-v1.ts`, `counterfactual-repository-v1.ts`, and the
single-pass visitor in `run-state-replay-v2.ts`. `RunRepository` delegates the
two authenticated read-only operations to those modules. The repository reads
existing anchors, commands, monthly records, event/milestone evidence, and the
embedded ledger; Prompt 11 adds no table or write path.

Every replay transition verifies that the after-state ledger retains the exact
canonical prefix from its before-state. This runs before detail pruning, so rows
represented only by a summarized command range receive the same integrity
check. Recurring-policy edges require the latest verified policy command plus
the exact later `monthly_after_tax_strategy_v2` ledger transaction. Scheduled
event-flow edges require the response's immutable `scheduledCashFlows` ID to
match the later Financial Engine transaction's `causalReference.id`.

The public boundary is implemented through strict additive schemas and handlers
in `contracts-v2.ts`, `service-v2.ts`, `http.ts`, and `repository-port.ts`, with
thin route files at:

- `GET /api/v2/runs/{runId}/history?fromRevision=&toRevision=`; and
- `POST /api/v2/runs/{runId}/counterfactual`.

The integration suites are
`causal-history-replay.integration.test.ts`,
`causal-history-postgres.integration.test.ts`, and
`causal-counterfactual-http.integration.test.ts`. They cross replay, production
command reduction, recurring policy, monthly finance, tax-context fingerprints,
ledger/risk/history derivation, HTTP contracts, authentication, and—when a test
database is configured—real PostgreSQL persistence and no-write row counts.

Optional AI phrasing was deliberately not connected in Prompt 11. The verified
fact packet and deterministic role-explicit renderer are the production-safe
boundary. This avoids changing existing AI roles and leaves simulation and
history fully available without an external provider.

The repair does not modify financial formulas, event parameter bounds, Risk v1
formulas, historical command semantics, snapshot frequency,
`queueAiWorldEventV2`, or the Prompt 09/10 authority boundaries.

## Implementation and verification checklist

- [x] Lock legacy replay vectors and prove the new transition visitor returns the
  same final state/checksum as `replayAcceptedCommandsV2`.
- [x] Test stable source/node/edge IDs, ordering, checksum,
  graph acyclicity, missing evidence, and unknown rules; implement graph types
  and validation.
- [x] Test command-to-ledger, policy-to-allocation,
  event-opportunity-to-approval, approval-to-queue, response-to-effect,
  scheduled-flow-to-ledger, milestone, risk changes, and end conditions.
- [x] Test the layoff/low-cash distinction before accepting
  vulnerability edges. Assert event occurrence has no low-cash direct parent and
  later credit use has low cash only as a contributing condition.
- [x] Cover earliest-anchor, contiguous-command, monthly-record checksum, and
  immutable-ledger-prefix failures to the repository reader; then implement its
  one-pass transition stream.
- [x] Cover turning-point components, fixed integer thresholds,
  maximum five, same-signature suppression, terminal priority, and stable ties;
  then implement the pure selector.
- [x] Prove exactly one allow-listed field or
  response changes and every other envelope/payload leaf remains identical.
- [x] Prove both branches call
  `reduceGameCommandV2` and no counterfactual financial formula exists.
- [x] Cover unchanged after-tax/protection tax context, missing
  fingerprint, changed pre-tax policy, changed income, annual context boundary,
  and trusted alternate-evidence absence.
- [x] Cover a fully matched shared-cursor prefix, divergence after
  different event draw consumption, and future named-world macro/opportunity
  equality. Never reset a cursor in the test implementation.
- [x] Cover future-command divergence, actual/alternate terminal, history-exhausted,
  24-month, and 256-command stop-reason tests.
- [x] Canonicalize the real opening/current state,
  accepted command rows, and ledger before and after a counterfactual.
- [x] Cover deterministic explanations for all three roles, source citations,
  unavailable evidence, and fallback text. If AI is enabled, add malformed,
  unknown-edge, changed-role, invented-number, timeout, and outage fallback tests.
- [x] Cover strict API schema and authentication; counterfactual is not added
  to `GameCommandV2` and never reaches repository mutation methods.
- [x] Add a `TEST_DATABASE_URL`-gated PostgreSQL integration proving save/load produces the same history
  checksum and a counterfactual leaves row counts/current state unchanged.
- [x] Run focused unit/integration tests, lint, typecheck, the full functional
  suite, long-run tests, and production build before the Prompt 11 commit.

Focused command:

```text
corepack pnpm exec vitest run \
  src/core/__tests__/causal-history-v1.test.ts \
  src/core/__tests__/turning-points-v1.test.ts \
  src/core/__tests__/counterfactual-v1.test.ts \
  src/core/__tests__/counterfactual-execution-v1.test.ts \
  src/core/__tests__/causal-explanation-v1.test.ts \
  src/server/db/__tests__/causal-history-replay.integration.test.ts \
  src/server/api/__tests__/causal-counterfactual-http.integration.test.ts
```

Full gate:

```text
corepack pnpm verify
```

Database integration gate when `TEST_DATABASE_URL` is configured:

```text
corepack pnpm exec vitest run \
  src/server/db/__tests__/causal-history-postgres.integration.test.ts \
  --no-file-parallelism
```

## True integration-test matrix

| Test | Systems crossed | Required proof |
| --- | --- | --- |
| Decision to financial consequence | Detailed Action or Recurring Policy + Financial Engine + Ledger + Causal History | Exact command and transaction IDs become direct/contributing edges with verified values |
| Event vulnerability distinction | Event System + Scenario Director/Runtime Balance + Risk v1 + Event Lifecycle + Financial Engine | Opportunity causes incident path; low liquidity contributes only to funding consequence |
| Scheduled event flow | Event response + Active Cash Flow + next monthly Financial Engine + Ledger | Same flow ID links the response to the later ledger transaction exactly once |
| Counterfactual response | Sparse replay + Event Lifecycle + production reducer + Financial Engine | One response changes; same verified future prefix; real state/ledger unchanged |
| Counterfactual policy and tax | Recurring Policy + tax orchestrator + Financial Engine | After-tax change runs with matching fingerprint; pre-tax mismatch stops before month mutation |
| Save/load history | PostgreSQL repository + replay + graph builder | Fresh load returns identical canonical history checksum and source IDs |
| Read-only API | Route + service + repository + core runner | Authentication enforced and no mutation/outbox/snapshot rows created |

Calling several helpers in `causal-history-v1.ts` is a unit test, not an
integration test. At least the event, counterfactual, and PostgreSQL rows above
must use the real owning subsystem implementations.

## Compatibility and implementation risks

- Prompt 09/10 may settle different decision-field names. Reuse their final
  monthly evidence through one adapter; never create parallel approval/ranking
  state.
- A modern graph cannot be synthesized for historical commands whose evidence
  fields were absent. Preserve old checksums and report partial coverage.
- Replaying separately from a recent anchor for every node is quadratic. Use one
  earliest compatible anchor and a streaming reducer pass.
- Current shared RNG cannot guarantee a matched future after draw-count
  divergence. Stop and label the verified prefix; never rewrite the cursor.
- Recorded tax evidence is invalid after a taxable-context change. Without
  trusted alternate evidence, pre-tax and income interventions are structured
  unsupported cases, not approximate comparisons.
- Future commands may become invalid on the alternate branch. Stop at the first
  divergence rather than silently altering the player's later decisions.
- Runtime Balance impact estimates are approval preflight, not applied financial
  effects. Use actual event resolution, monthly record, funding, and ledger
  evidence for consequences.
- Scenario Director relevance is not incident causality. Its edge role is
  contributing/correlation only.
- `eventLifecycle.history` and milestone history are authoritative semantic
  evidence but their financial values must reconcile with ledger/monthly records
  before an edge is emitted.
- An AI citation check alone does not make prose causal truth. Keep role labels
  and deterministic fallback authoritative and reject role substitution.
- A POST counterfactual route can look like a command route. Keep it outside
  `GameCommandV2` and assert it performs no database writes.
- PostgreSQL integration is environment-gated. If `TEST_DATABASE_URL` is absent,
  report that gate as unexecuted; do not claim save/load integration passed based
  only on mocks.

## Completion evidence

The completed focused gate covers the pure graph, explanations, turning points,
counterfactual planning/execution, authenticated HTTP contracts, real production
replay, recurring policy, monthly Financial Engine, Event Lifecycle delayed cash
flows, ledger provenance, Risk v1, Financial Goal checkpoints, legacy replay,
and a real-database integration gate. The final pre-commit run records the exact
test count in the Prompt 11 commit message.

Known environment and version boundaries are explicit:

- the PostgreSQL save/load/no-write integration is implemented but skips when
  `TEST_DATABASE_URL` is absent;
- accepted tax evidence and its exact context fingerprint are replayed locally,
  so no external tax-provider call is needed for a supported counterfactual;
- existing runs use verified shared-cursor seed control; production named-world
  control is consumed only after Prompt 14 adds that state to authoritative runs;
- optional AI phrasing is not enabled, so the checksum-verified deterministic
  role-explicit renderer is always available and cannot invent causality; and
- causal history is derived on demand from existing authorities and adds no
  causal-history table, command type, snapshot write, or alternate save.
