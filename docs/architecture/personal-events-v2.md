# Personal events and traps v2

Personal-event schema v2 is the deterministic content boundary for personal
setbacks, opportunities, and behavioral traps. Templates describe when an
event makes sense, how its incident probability changes for a real causal
reason, which bounded values may be sampled, and which exact responses are
available. Templates do not decide whether an event is fair at this moment and
do not calculate money through AI.

The authoritative path is:

1. validate the immutable catalog;
2. evaluate intrinsic eligibility and causal hazard rules;
3. sample a versioned proposal from the run RNG;
4. let the director rank candidates and the Runtime Balance Controller approve
   at most one proposal;
5. persist the exact proposal and declared response IDs as a pending event;
6. resolve one player response through engine-owned operation handlers; and
7. persist the financial result, lifecycle evidence, cooldown, and follow-ups.

Steps 1, 2, 3, 5, 6, and 7 are owned by the event subsystem. Director ranking
and runtime fairness are separate consumers. Until those later stages are
enabled, deterministic candidate selection is the narrow scheduling adapter;
it is not permission to move fairness or financial logic into a template.

## Ownership boundaries

| Boundary | Owns | Must not own |
| --- | --- | --- |
| Eligibility | Intrinsic facts that make the event coherent: home ownership, employment status, and required or blocked macro regimes | Financial vulnerability, pacing, severity multiplication, or candidate ranking |
| Hazard | Base incident/opportunity probability and explicit causal modifiers such as an affected employment sector or macro regime | Emergency-fund adequacy, insurance gaps, aggregate exposure, or ability to absorb the result |
| Scenario Director | Ranking already-eligible candidates for relevance and lesson variety | Making an ineligible event eligible, changing parameter bounds, or applying effects |
| Runtime Balance Controller | Pressure, recovery, repetition, impact preflight, and approve/reject decisions | Inventing eligibility, incident causes, response choices, or exact financial resolution |
| Event Resolver | Proposal verification, mitigation verification, exact effect routing, insurance adjudication, bounded active cash-flow scheduling, and lifecycle evidence | Direct cash/ledger mutation, new random draws, director ranking, arbitrary generosity, or AI-authored amounts |
| Financial Engine | Applying due event cash flows with ordinary monthly income/expense funding and authoritative balanced ledger postings | Reinterpreting event choices, durations, or template metadata |

This separation is important even when a single monthly-turn function invokes
several stages. The persisted command version and pending-event evidence keep
the boundaries observable and replayable.

## Version and replay boundary

`process_month_v2.payload.eventSchedulerVersion` selects a frozen scheduling
strategy. It is command evidence, not a server default that may drift.

| Persisted value | Replay behavior |
| --- | --- |
| absent | `legacy-exposure-v1`: preserve the historical exposure-driven scheduler and its historical RNG consumption exactly |
| `causal-hazard-v1` | Frozen Prompt 06 adapter over schema-v1 templates: fixed base occurrence chance, intrinsic applicability, cooldown/family recency, and neutral `unrelated_hazard` targeting; it does not read exposure to make an incident occur |
| `declarative-events-v2` | Schema-v2 catalog, intrinsic eligibility, per-template causal hazard, bounded parameters, positive/neutral/negative events, and declarative lifecycle metadata |

New runs use the newest explicitly supported version. Missing version fields are
never silently upgraded. An unknown literal is rejected before state mutation.
The persisted command decoder accepts only supported literals and enforces any
cross-field requirements.

Schema-v2 pending and resolved evidence carries `eventSchemaVersion: 2`.
Absence of that discriminant means legacy evidence and selects the legacy
resolver. A queued proposal persists its event ID, template ID and version,
sampled parameters, available choices, schedule/expiry months, tier, category,
classification, lesson tags, pressure cost, recovery duration, and deterministic
fallback narrative. Resolution reloads the exact `templateId@version` and
validates the proposal again. Published template versions are immutable; a
content change requires a new version.

## Declarative schema

All configuration is JSON-compatible data. Functions, symbols, `bigint`,
non-finite numbers, `undefined`, and cyclic objects are invalid.

| Field | Meaning and unit |
| --- | --- |
| `schemaVersion` | Literal `2` |
| `id`, `version` | Stable event identity; v2 templates require version 2 or later |
| `category` | `maintenance`, `health`, `housing`, `career`, `caregiving`, `social`, `behavioral_trap`, or `opportunity` |
| `classification` | `positive`, `neutral`, or `negative`; classification describes content, not approval |
| `lessonTags` | One stable primary lesson and unique secondary lesson IDs |
| `eligibility` | AND-combined intrinsic rules; macro rules expose explicit required and blocked regimes |
| `hazard` | Base, minimum, and maximum chance in PPM plus signed causal modifiers in PPM; `1_000_000` is 100% |
| `severityTier` | `micro`, `medium`, `large`, or `catastrophe`; declarative personal events are never ambient |
| `pressureCost` | Non-negative integer input for the Runtime Balance Controller, not a money amount |
| `parameters` | Stable IDs, `money_cents` or `rate_ppm` kind, uniform integer distribution, inclusive hard minimum/maximum |
| `mitigations` | Stable references to health insurance or a selected coverage ID |
| `responses` | Stable choice ID, player-facing label, required mitigation IDs, and at least one machine-readable effect |
| `followUps` | Target template ID and exact version, delay of `1..120` months, and the response IDs that activate it |
| `cooldowns` | Event, category, and lesson spacing in whole months |
| `maximumOccurrences` | Positive lifetime cap for this template in a run |
| `recovery.durationMonths` | Whole-month recovery hint for runtime balance |
| `fallbackNarrative` | Required deterministic headline and body |

Magnitude expressions are either a safe fixed integer or a declared parameter
multiplied by signed PPM. Integer division uses the engine's deterministic
rounding rules. Money remains integer cents; rates remain integer PPM. No
floating-point currency is introduced at the template boundary.

## Deterministic eligibility and hazard

The declarative scheduler first rejects terminal runs and runs with an existing
pending event. It then:

- discards invalid templates;
- applies all eligibility rules;
- applies maximum-occurrence, event, category, and lesson-history limits;
- sorts remaining templates by stable ID and then version;
- consumes one `1..1_000_000` RNG draw per eligible template;
- clamps base plus applicable causal modifiers to the declared minimum and
  maximum chance;
- selects one passing candidate with the serialized RNG; and
- samples parameters in their declared order and inclusive bounds.

The result includes the next RNG state and the eligible/candidate template IDs
for diagnostics. With the same state, catalog, and seed the proposal and next
RNG state are identical. Sorting prevents source-file order from changing draw
assignment. Different financial resilience does not change a template's hazard
unless the template declares a genuine causal condition.

Every schema-v2 personal event currently carries the neutral event relationship
`unrelated_hazard`. A future relationship may be introduced only when the
template models a real causal link, not merely a costly consequence.

### Causality rules

- Low or missing emergency savings can worsen recovery and funding after an
  incident. It cannot increase illness, repair, or layoff probability.
- Missing insurance changes response availability and the uncovered settlement.
  It cannot increase illness, theft, fire, or accident probability.
- Vehicle age or condition may modify a vehicle-repair hazard when that verified
  state exists.
- Industry contraction may modify layoff hazard only for employment in the
  affected industry.
- Portfolio concentration changes the financial impact of a market movement;
  it does not make the market movement occur.
- Aggregate exposure and risk scores are analytics and balance evidence, never
  universal probability or severity multipliers.

## Validation and catalog startup

`validatePersonalEventTemplateV2` and
`validatePersonalEventCatalogV2` return stable path/code/message violations.
The production catalog validates before export, so an invalid built-in template
fails startup rather than entering a run.

Validation rejects:

- duplicate `id@version` identities, duplicate parameter/mitigation/response
  IDs, duplicate exact follow-up declarations, and duplicate or conflicting lesson tags;
- missing primary lessons, fallback text, responses, or machine effects;
- unordered, unsafe, negative-money, or out-of-domain PPM bounds;
- a base hazard outside its declared minimum/maximum or invalid signed hazard
  modifiers;
- a macro regime that is both required and blocked;
- unknown parameters, mitigation types/IDs, response IDs, and follow-up targets;
- effect/parameter unit mismatches, negative cash-flow or insurance magnitudes,
  and more than one insurance claim in a response;
- insurance claims whose mitigation is not required by the response or whose
  health/selected-coverage type and coverage ID do not match exactly;
- unsupported effect operations and unsupported account or coverage references;
- non-JSON/non-deterministic executable values;
- negative or excessive cooldown/recovery durations, an event cooldown shorter
  than recovery, and non-positive maximum occurrences.

Queue-time validation is repeated at the trust boundary. A caller cannot forge
category, narrative, choices, parameters, or other metadata while reusing a
known template identity. Resolution also requires an exact parameter-key match,
in-range integer values, the server-owned pending event ID, and a response that
was persisted with that event.

## Effects and operation routing

Effect descriptions are requests to an engine-owned operation registry. A
template is accepted only when both the validator and resolver support the same
operation. Adding a string to validation without an authoritative handler is
invalid; adding an ad hoc handler without a schema and bounds is also invalid.

The initial migrated catalog uses these stable handlers:

| Operation | Authoritative route |
| --- | --- |
| `required_obligation_delta` | Adds a bounded amount to required obligations; cannot produce a negative authoritative value |
| `annual_living_cost_delta` | Changes the annual living-cost plan in cents; cannot produce a negative authoritative value |
| `wellbeing_delta` | Changes burnout or happiness in PPM and clamps the result to `0..1_000_000` |
| `cash_delta` | Schedules a one-month `temporary_income` or `temporary_expense`; the Financial Engine applies it on the next processed month |
| `temporary_expense`, `recurring_expense`, `temporary_income` | Persists a bounded active flow for `1..120` months; each processed month applies it once and decrements the remaining duration |
| `insurance_claim` | Delegates to health or selected-coverage adjudication, records insurer responsibility, and schedules the player responsibility as a one-month temporary expense |

The reusable operation vocabulary is designed to grow behind the same registry
for explicit income reduction, debt creation/modification, eligible
taxable-asset liquidation, policy changes,
bounded penalties, and market modifiers. Those
operations must not be used by catalog content until their typed schema,
validation, state owner, ledger behavior, duration semantics, and tests all
exist. Retirement or otherwise unsupported account references are rejected.
Custom executable template code is not allowed in the schema-v2 catalog. If a
future case cannot be represented safely, its engine-owned adapter must expose a
small validated declarative contract and keep execution outside catalog data.

Every event cash mutation is deferred to the production Financial Engine. The
resolver persists immutable scheduled-flow evidence on resolved-event history:
a stable digest ID (within the kernel's 64-character limit), exact source
effect ID, kind, amount, start month, and original duration. The active record
also carries the source event ID and remaining months. Validation recomputes
the history evidence from the exact template version, response, effect index,
parameters, deterministic ID, and player/insurer costs. An active record must
match that evidence exactly, its start must equal the source resolution month,
and its remaining duration must equal original duration minus elapsed canonical
months. Missing, shortened, extended, or otherwise forged active flows are
rejected.
The monthly command merges due event flows with caller-supplied resolved flows;
the kernel rejects duplicate IDs, funds expenses through its ordinary path,
and creates balanced causal ledger evidence. Duration decrements only after a
successful kernel application, including a processed terminal shortfall, and a
one-month flow is absent from the following month. `playerCostCents` records the
total scheduled direct expense across its duration, while insurer cost remains
separate. Medical player responsibility, performance bonuses, and utility
rebates therefore affect cash on the next processed month, never directly in
the event resolver.

## Insurance and prerequisites

A response may require one or more declared mitigations. Health coverage is
available only when the resolved scenario selected a health plan and an active
policy year exists. Selected property/benefit coverage must be present in the
active recurring strategy; onboarding benefits are compatibility evidence for
states created before recurring policy selection.

The resolver never trusts a template-authored reimbursement. It delegates gross
amounts to the authoritative insurance engine, which applies policy-year
deductibles, out-of-pocket limits, coverage limits, and usage. The next insurance
state is persisted with the event resolution. If the required mitigation is not
active, that response is rejected; an explicitly declared uninsured response
remains available. Insurance status never feeds the incident hazard.

## Lifecycle, follow-ups, and recovery

Only one personal event may be pending. A pending event begins in the current
month, expires in a later canonical `YYYY-MM` month, and blocks advancing time
until the player resolves an allowed choice. The command envelope enforces a
stable ID, expected revision, current effective month, duplicate-command
protection, and terminal-run protection.

On resolution, the lifecycle atomically:

- clears the pending event;
- appends immutable evidence containing the exact proposal, choice set, chosen
  response, schedule/resolution months, player/insurer cost, canonical scheduled
  cash flows, and v2 metadata;
- replaces the template's event cooldown with its configured eligible-again
  month; and
- appends durable follow-up intents whose response condition matched, recording
  source event ID, target template ID, and eligible month.

Event cooldown is persisted because it is directly queried by both old and new
adapters. Category and lesson cooldowns are derived deterministically from
resolved history plus immutable template versions. Maximum occurrence counts
are also derived from history. This avoids multiple mutable counters disagreeing
with audit evidence.

Recovery duration is content metadata, not a cash benefit and not an automatic
probability change. It is a contract input for the Prompt 09 Runtime Balance
Controller to space severe events and protect recovery; Prompt 08 does not yet
apply that approval. Validation requires an event cooldown at least as long as
the recovery duration. A scheduled follow-up is an eligibility intent,
not an automatic financial effect: when its month arrives it must still resolve
to the exact versioned target and pass intrinsic eligibility plus
history-derived occurrence/cooldown rules before ordinary lifecycle queueing.
Prompt 09 runtime-fairness approval and Prompt 10 director ranking are not
active on this direct due follow-up path yet.

## Narrative and AI authority

Every template has deterministic fallback text, so scheduling, display, choice,
and financial resolution work with no network or model. Optional AI output may
decorate an already queued pending event with a source, headline,
narrative, rationale, and cited evidence IDs. It cannot:

- create a template identity or response;
- change eligibility, hazard, pressure, recovery, bounds, or sampled values;
- select the player's response;
- calculate a bill, reimbursement, return, or penalty; or
- bypass queue-time and resolution-time verification.

If AI is unavailable or rejected, the persisted fallback headline and body are
authoritative display content. AI text is never replay input to the financial
engine.

## Performance and operational characteristics

Scheduling is local, deterministic, and lightweight: no network, AI call,
database query, Monte Carlo simulation, or full financial projection is
required. For `T` templates and `H` retained history records, the straightforward
implementation is approximately `O(T log T + T * H)` with small bounded rule
and parameter lists. It allocates only proposal-sized diagnostic arrays. If the
catalog or history becomes large, derived history indexes may optimize lookups
but must reproduce identical eligibility and RNG order.

Catalog validation runs at startup/test time, not as remote content execution.
Queueing and resolution repeat cheap validation at trust boundaries. All loops
are bounded by catalog, response, effect, mitigation, and retained-history
sizes, and all arithmetic stays within safe integer domain bounds.

The repository test command runs the two 480-month benchmark files
sequentially after the parallel functional suite. Their existing budgets remain
unchanged; isolating them prevents unrelated Vitest workers from turning CPU
scheduling contention into false performance regressions.

## Verification contract

Unit coverage must include:

- representative home, employment, and macro eligibility;
- causal sector/macro hazard changes and financial-vulnerability independence;
- identical seeded scheduling, stable RNG advancement, and bounded parameter
  sampling;
- maximum occurrences plus event/category/lesson cooldowns;
- setbacks, behavioral traps, and at least two opportunities in the catalog;
- deterministic fallback text with no AI dependency;
- every validator rejection category, including executable/non-JSON content,
  unknown operations, unsupported accounts, and cooldown/recovery conflicts;
- exact proposal/response forgery rejection;
- cash, obligation, living-cost, wellbeing, and insurance effect handlers;
- mitigation unavailable behavior, deductible/coverage state transitions, and
  separate player/insurer cost evidence;
- follow-up intent creation and lifecycle history evidence; and
- scheduler-version parsing and historical replay for absent,
  `causal-hazard-v1`, and `declarative-events-v2` commands.

Integration coverage crosses real subsystem boundaries: monthly command to
declarative scheduler to lifecycle persistence; event choice to active-flow
persistence to the production Financial Engine and its causal ledger; and
insurance choice to claim adjudication, persisted policy usage, and the next
monthly expense. Tests also prove a one-month expense is not repeated in month
two. Merely calling two functions in the same module is not an integration
test.

## Intentional limits and migration

- The schema starts with bounded uniform integer parameters. New distributions
  require their own deterministic sampling/versioning contract.
- The first catalog is deliberately small. It proves negative, neutral/trap,
  and positive paths without pretending to migrate every legacy event at once.
- Legacy schema-v1 events and the frozen causal adapter remain for historical
  replay. New content belongs in schema v2; existing content migrates one
  `id@version` at a time through adapters.
- Category/lesson cooldowns and maximum occurrences are history-derived. This is
  intentionally simple while run history remains bounded.
- Follow-up records do not guarantee occurrence and never apply effects by
  themselves. Due follow-ups currently apply intrinsic/history checks; Prompt
  09 fairness approval remains a separate integration.
- Recovery metadata is reserved for Prompt 09 runtime balance; the event
  subsystem does not implement fairness by secretly changing probabilities or
  granting money.
- Director ranking and balance approval are separate prompt-owned systems. The
  deterministic scheduler's current candidate selection is a replaceable
  adapter, not a long-term ownership merge.
- Optional AI narration remains decoration. All authoritative gameplay remains
  available offline and deterministically replayable.
