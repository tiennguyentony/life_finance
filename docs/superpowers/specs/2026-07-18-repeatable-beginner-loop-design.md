# Repeatable Beginner Loop and Hybrid Balance Design

## Purpose

Make the beginner game faster to operate, more interesting to decide, and
meaningfully harder to play recklessly without making outcomes feel arbitrary.

This design joins two changes that must be calibrated together:

1. a one-month **Keep going** continuation that repeats eligible transactions;
2. a beginner balance pass with a hybrid 12-month outcome, broader event
   choices, and explicit Balance Lab gates.

The continuation cannot ship as an isolated convenience change because
repeating a currently dominant action would make the already-easy game even
easier. Content and outcome evidence must be recalibrated with the new loop.

## Product decisions

- Keep going advances exactly one month per click. It never batches months.
- Taxable investment and revolving-credit payment plans repeat monthly.
- Courses, strategy changes, lifestyle changes, and credit draws apply once;
  their next continuation advances time without resubmitting the command.
- Every repeat uses the latest authoritative run, rebuilds the plan, and
  rechecks its amount and availability.
- The game stops offering continuation for an event, course completion,
  chapter checkpoint, terminal outcome, newly crossed warning, or unavailable
  repeated action.
- Beginner failure is hybrid: bankruptcy remains possible, while fragile
  non-bankrupt finishes are the more common unsuccessful outcome.
- Event occurrence and parameters stay seeded and independent of player
  wealth. Preparation reduces consequences; it does not cause the engine to
  retaliate with more expensive events.
- `runtime-balance-v1` remains authoritative until the new cohort passes its
  calibration gates.

## Scope

This delivery includes:

- explicit continuation metadata on board plans;
- a pure continuation evaluator and one-month continuation executor;
- contextual result-dialog actions and interruption explanations;
- a pure 12-month beginner checkpoint assessment;
- user-visible checkpoint evidence without ending the long-running simulation;
- additional deterministic personal-event templates with real trade-offs;
- updated Balance Lab chapter, interaction, and distribution evidence;
- calibration and a fresh production-controller go/no-go record.

This delivery does not include:

- multi-month autoplay;
- AI-authored financial effects or AI-controlled difficulty;
- changing historical event-template meanings;
- a catastrophe-tail exception;
- enabling `runtime-balance-v2` before calibration passes.

## One-month continuation

### Plan contract

`BoardPlan` gains immutable continuation metadata:

```ts
type BoardPlanContinuationV1 =
  | Readonly<{
      kind: "repeat_transaction";
      actionLabel: string;
    }>
  | Readonly<{
      kind: "advance_only";
    }>;
```

The initial repeatable plans are:

- broad-index, sector, and speculative taxable investments;
- revolving-credit payments.

Every other existing board plan is `advance_only`. The policy is explicit on
the plan rather than inferred from arbitrary command payloads, so future plans
must deliberately opt into repetition.

### Continuation evaluation

A pure `evaluateBoardContinuationV1` function accepts the opening run, ending
run, and previously selected plan. It returns one of:

```ts
type BoardContinuationDecisionV1 =
  | Readonly<{
      kind: "repeat_transaction";
      plan: BoardPlan;
      primaryLabel: string;
    }>
  | Readonly<{
      kind: "advance_only";
      primaryLabel: "Continue one month";
    }>
  | Readonly<{
      kind: "stop";
      reason:
        | "pending_event"
        | "course_completed"
        | "chapter_checkpoint"
        | "run_complete"
        | "warning_crossed"
        | "plan_unavailable";
      message: string;
    }>;
```

Evaluation order is fixed as listed in the stop-reason union. This makes a
month with multiple interruptions deterministic and gives the player the most
important explanation.

For a repeat transaction, the evaluator calls `plansForDestination` with the
ending run and finds the same stable plan ID. The newly derived plan owns the
next amount and disabled reason. The old command payload is never reused.

### Warnings

Continuation stops when the completed month newly crosses either beginner
warning boundary:

- preparedness enters `critical` from any safer band;
- revolving-credit utilization reaches at least 800,000 ppm from below that
  threshold.

Remaining inside an already acknowledged warning band does not permanently
disable continuation. The player stops at the crossing, sees the warning, and
may deliberately choose the same plan again.

Preparedness score and band are added to the run projection from the existing
`preparedness-assessment-v1` calculator. This is diagnostic evidence only and
does not change plan prices, event hazards, or effects.

### Execution and recovery

The contextual primary button performs exactly one next turn:

- `repeat_transaction`: submit the newly derived detailed action, then process
  one month;
- `advance_only`: process one month without resubmitting the prior action.

The secondary button is always **Choose a different plan** when no event or
terminal outcome owns the next interaction.

Every command receives a fresh idempotency ID and the latest expected revision.
The existing two-phase recovery rules remain authoritative. If action
acceptance is ambiguous, continuation never blindly resubmits it; session
refresh determines whether only the month remains to be processed.

If the repeated plan becomes unavailable, no command is sent. The result dialog
explains the current disabled reason and routes the player back to planning.

## Result-dialog experience

The result dialog continues to show cash, net-worth, debt, and goal deltas. It
adds a concise interruption or continuation summary:

- **Invest another $500** for a currently available repeated investment;
- **Pay another $320** when only $320 of revolving debt remains;
- **Continue one month** after a course purchase or strategy change;
- **Review life decision** when an event is pending;
- **Review course completion** when a program completes;
- **Review your safety warning** when a boundary is crossed;
- **Choose another plan** when repetition is unavailable.

The dialog never auto-submits on open. Busy state disables both actions and its
live status describes whether the board is applying a transaction or advancing
the month.

## Hybrid 12-month checkpoint

### Meaning

The beginner chapter is a checkpoint, not the end of the life simulation. At
exactly 12 processed months, the player receives one immutable assessment and
must review it before choosing the next plan.

The checkpoint uses the existing preparedness assessment as its transparent
score. It does not invent a second hidden difficulty score:

| Outcome | Rule |
|---|---|
| `bankrupt` | The authoritative engine reached bankruptcy during the chapter |
| `fragile` | Non-bankrupt and preparedness is `critical`, or score is below 350,000 ppm |
| `developing` | Non-bankrupt and score is 350,000-499,999 ppm |
| `strong` | Non-bankrupt and score is at least 500,000 ppm |

`developing` and `strong` count as chapter completion for calibration. A
fragile player may continue the simulation with recovery guidance. Bankruptcy
retains the existing terminal F outcome.

The assessment includes component scores, the weakest component, and one
deterministic lesson key. It does not use AI prose to calculate or grade the
result.

### Projection

The run view exposes `startMonth`, preparedness evidence, and an optional
beginner checkpoint when the current month is exactly 12 months after the start
month. The board result detects that checkpoint and suppresses Keep going for
that turn. Reloading at the checkpoint still projects the same evidence; moving
into month 13 naturally clears the checkpoint without mutating historical
state or changing replay checksums.

## Beginner event-content pass

### Content goals

The active catalog must contain enough distinct choices that a 12-month run
does not teach one repeated answer. The first pass adds at least six unique,
beginner-relevant templates while preserving all existing template identities.
Existing IDs and versions are not edited in ways that change replay meaning.

New events use current deterministic effect primitives and include:

- an urgent transport repair: pay now, use a higher-total payment plan, or
  defer into a more expensive follow-up;
- a rent renewal: accept the increase, pay a moving cost for lower future
  spending, or share housing with a wellbeing trade-off;
- a family-care request: pay the full cost, split the burden with burnout, or
  decline with a happiness cost;
- a required work-device replacement: basic, payment-plan, and premium
  responses with distinct cash-flow and wellbeing effects;
- reduced work hours represented as a bounded temporary cash-flow gap, with
  cut-spending, credit-like payment-plan, and wellbeing-preserving responses;
- a social commitment: pay now, spread a higher total cost, or decline with a
  wellbeing consequence.

Positive bonus and rebate events remain breathing-room acknowledgements. They
are not counted as decision events while they retain one response. Every event
counted and presented as a decision must have at least two materially different
valid responses.

### Fairness and pacing

- Gross parameter ranges are version-owned and fixed before the player state is
  evaluated.
- Mitigations such as insurance alter player responsibility through the
  existing engine-owned calculation.
- No response is universally best across liquidity, recurring cash flow,
  wellbeing, and recovery time.
- Guided runs target three to five decision events in 12 months, with at least
  one recovery or positive beat in the ordinary matched cohort.
- Ordinary guided approvals target 40-60% light, 30-50% meaningful, 5-15%
  crisis, and 0% extreme. Above-limit candidates remain rejected.
- Repetition cooldowns keep the same lesson from appearing in adjacent months.

## Balance Lab changes

The beginner cohort adds:

- checkpoint outcome distribution and completion rate;
- repeatable-action availability and stop-reason counts;
- decision-event count per run;
- unique meaningful-choice templates per run;
- challenge distribution using only approved events;
- bankruptcy and checkpoint outcomes grouped by opening preparedness and bot;
- six-month nonfatal recovery evidence;
- prepared-versus-reckless matched deltas.

Initial activation targets are:

| Metric | Beginner target |
|---|---:|
| Chapter completion (`developing` or `strong`) | 650,000-750,000 ppm |
| Overall bankruptcy | 50,000-150,000 ppm |
| Average-beginner bankruptcy | 100,000-200,000 ppm |
| Reckless bankruptcy | 300,000-450,000 ppm |
| Reckless minus prepared bankruptcy | at least 200,000 ppm |
| Stable/resilient bankruptcy | at most 80,000 ppm |
| Unavoidable failure | at most 10,000 ppm |
| Nonfatal recovery within six months | at least 750,000 ppm |
| Approved events that are meaningful or crisis | 400,000-600,000 ppm |
| Any strategy objective dominance | at most 650,000 ppm |
| Decision events per 12-month run | median 3-5 |

These targets replace the earlier beginner bankruptcy goals, which were too
punitive for a hybrid beginner outcome. Ordinary gates require at least 200
matched seeds. Rare unavoidable-failure gates require at least 1,000 relevant
observations.

The 200-seed runner must be made operational before activation, either through
profiling improvements or deterministic shards that merge into the same
canonical summary. A smaller exploratory run may guide tuning but cannot approve
production selection.

## Production activation rule

The repeat-turn UI and new versioned event content may ship after their focused
compatibility tests pass because they do not change historical replay meanings.
The challenge-fit `runtime-balance-v2` controller remains disabled until the
200-seed beginner cohort satisfies every ordinary gate and the result document
records a go decision.

If content calibration fails, tune version-owned event parameters, hazards,
cooldowns, and response effects. Do not tune difficulty from individual player
wealth, and do not modify the preparedness equation merely to manufacture a
passing distribution.

## Testing

### Continuation tests

- investment and revolving-credit payment plans opt into repetition;
- all other current plans are advance-only;
- repeat evaluation rebuilds the plan from the ending run;
- a final partial debt payment uses the recalculated amount;
- insufficient cash or cleared debt stops before sending a command;
- events, course completion, checkpoint, terminal outcome, and newly crossed
  warnings stop continuation in deterministic priority order;
- one click issues at most one detailed action and one month command;
- ambiguous action acceptance never causes a duplicate transaction;
- advance-only continuation never resubmits a course or strategy command.

### UI tests

- contextual primary and secondary labels render correctly;
- unavailable repetition explains why it stopped;
- busy and error states are accessible;
- event and checkpoint dialogs retain focus ownership;
- every result remains visible until an explicit player action.

### Chapter tests

- the exact 12-month boundary produces one deterministic checkpoint;
- months 0-11 and 13 onward do not project it;
- bankruptcy overrides every score;
- fragile, developing, and strong boundaries are exact;
- weakest-component and lesson selection are deterministic;
- old states without new projected fields still parse through supported replay
  paths.

### Event and balance tests

- every new template validates and is deeply frozen;
- each decision template has materially distinct response effects;
- deferred choices schedule only declared follow-ups;
- fixed seeds preserve event parameters and occurrence across strategies;
- preparedness never changes gross cost or hazard draws;
- reports reconcile raw checkpoint, choice, recovery, and challenge counts;
- the full V1 API, persistence, replay, monthly-turn, and RNG suites pass.

## Delivery sequence

1. Implement continuation policy, evaluation, one-month execution, and UI.
2. Add the pure beginner checkpoint and run-view projection.
3. Add versioned event content and bot response mappings.
4. Extend Balance Lab evidence and acceptance rules.
5. Make the 200-seed cohort operational, calibrate, and record results.
6. Enable no production challenge-fit behavior unless the gate passes.

## Acceptance criteria

- Keep going performs exactly one transparent month per click.
- Repeat transactions use current authoritative amounts and never duplicate an
  ambiguously accepted action.
- One-time commands are never repeated.
- Every interruption has a deterministic reason and player-facing explanation.
- The 12-month checkpoint distinguishes strong, developing, fragile, and
  bankrupt outcomes without ending recoverable runs.
- New event decisions contain genuine trade-offs and remain deterministic.
- Beginner calibration uses matched seeds and confidence evidence.
- Existing replayed V1 behavior remains compatible.
- Production challenge-fit remains gated by sufficient passing evidence.
