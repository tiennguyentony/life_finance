# Big City Survivor Gameplay Specification

## Document Control

- Status: Focused MVP specification
- Scenario duration: 24 simulated months
- Maximum attempts: 3
- Last updated: 2026-07-15

## Purpose

This document defines the frontend-visible gameplay states and loops for the Big City Survivor MVP.

The backend owns financial calculations, event eligibility, state mutation, bankruptcy evaluation, replay, and persistence.

The frontend renders backend-generated state and submits player intent through transport-independent service contracts.

## First Implementation Boundary

The first frontend implementation proves one complete event loop only: Month 1 Main Game, mocked fast-forward processing, The Small Stuff Multiplies newspaper interruption, one player response, consequence feedback, and the updated Month 2 Main Game.

The Main Game is the primary playable surface, not a navigation hub.

Portfolio, cash flow, banking, and investments are contextual drill-downs from that surface.

The newspaper is the event-delivery system and is never a passive destination.

Login is excluded from this MVP, and the local mocked scenario remains recoverable after refresh.

This implementation boundary does not replace the documented 24-month scenario, retries, bankruptcy, or final reports; those remain later MVP increments.

## Scenario Lifecycle

```text
setup
  -> starting state review
  -> initial strategy
  -> active simulation
      -> time advance
      -> macro update or event
      -> decision
      -> consequence
      -> checkpoint
      -> active simulation
  -> success at month 24
  OR
  -> bankruptcy
      -> retry preparation when attempt < 3
      -> final failure when attempt = 3
```

Progression pauses whenever the player must review an event, make a decision, view a terminal outcome, or resolve a recoverable loading error.

## Starting Strategy Phase

The starting strategy translates the player's priorities into recurring instructions for the simulation.

The interface should show the monthly amount available for allocation and update a projected summary as choices change.

The backend validates all values and returns field-level errors or a normalized strategy preview.

### MVP Controls

| Control | Player Choice | Required Feedback |
| --- | --- | --- |
| Lifestyle tier | Lean, Comfortable, or Premium | Monthly cost, happiness effect, and fixed-cost risk |
| Emergency-fund allocation | Monthly amount or percent of available surplus | Projected cash-runway growth |
| Debt-paydown allocation | Monthly amount or percent of available surplus | Target debt and projected interest pressure |
| Index-fund allocation | Monthly amount or percent of available surplus | Long-term growth exposure and short-term volatility note |
| Speculative allocation | Off, Cautious, or Aggressive | Concentration and downside warning |
| Insurance | Scenario-relevant coverage choices only | Premium, deductible, and protection summary |

Allocations must never appear to spend more than the backend-reported amount available after mandatory obligations.

The UI may offer recommended presets, but it must not label one strategy as guaranteed or objectively correct.

## Routine Monthly Automation

Each month, the backend processes routine finances without asking the player to pay bills manually.

The resulting month summary should account for:

- Take-home income.
- Rent and mandatory living costs.
- Lifestyle spending.
- Minimum debt payments.
- Insurance premiums.
- Recurring emergency-fund allocation.
- Extra debt payment.
- Index-fund contribution.
- Speculative contribution when enabled.
- Market and macro changes.

The frontend displays the result as a concise story of what changed rather than a transaction-entry workflow.

## Simulation Loop

1. Render the authoritative dashboard for the current month.
2. Let the player inspect current state and open the strategy panel.
3. Submit an optional strategy adjustment and render the normalized result.
4. Advance time using a single-month or fast-forward control.
5. Stop on a personal event, decision, checkpoint, error, bankruptcy, or month 24.
6. Render the backend-provided month summary and changed values.
7. Return to the dashboard when no decision or terminal result is pending.

Fast-forward is a presentation shortcut, not a different simulation rule.

It must never skip a required decision, event, checkpoint, bankruptcy, or success state.

## Event Loop

1. Suspend time advancement.
2. Introduce the event with GM Pengo and a concise description.
3. Show the weakness being tested only when the backend marks it as player-visible.
4. Present two or three backend-provided decisions with immediate tradeoff summaries.
5. Submit one decision.
6. Show a loading state while the backend evaluates the outcome.
7. Render the consequence and updated state.
8. Continue to the dashboard or a terminal screen.

The frontend never invents event effects or applies arithmetic locally.

## Consequence Loop

Every resolved decision should produce three layers of feedback:

1. Immediate effect: the values that changed now.
2. Persistent effect: the strategy, obligation, protection, or exposure that changed for future months.
3. Explanation: one concise sentence connecting preparation or vulnerability to the result.

The consequence surface should show before and after values, direction, cause, and whether the change is temporary or persistent.

After acknowledgement, the updated dashboard becomes the new visual baseline.

## Strategy Adjustment During Simulation

The player may reopen the Actions / Allocation Panel from the main simulation screen when no required event decision is pending.

Changes affect a backend-specified effective month and remain active until replaced.

The UI should emphasize the consequence of the change to future cash flow, runway, debt pressure, investment exposure, and lifestyle.

The MVP does not expose individual securities, retirement account optimization, tax-loss harvesting, mortgages, refinancing, or other advanced products.

## Checkpoint Loop

Checkpoints provide breathing room after meaningful event beats or several uneventful months.

Each checkpoint should summarize:

- Months completed and months remaining.
- Net-worth change over the checkpoint.
- Cash-runway change.
- Debt change.
- Important strategy change.
- Event outcome.
- Current attempt status.
- One concise lesson or warning.

The checkpoint continues to the dashboard unless the scenario is terminal.

## Bankruptcy Behavior

Negative monthly cash flow is not bankruptcy.

The backend declares bankruptcy only when mandatory obligations are due and the shortfall cannot be covered by all eligible automatic liquidity.

Eligible resources are consumed in this order:

1. Liquid cash.
2. Liquid investments after applicable costs.
3. Remaining available credit.

The frontend bankruptcy state must show:

- Mandatory amount due.
- Cash used.
- Investments liquidated.
- Credit used.
- Remaining uncovered shortfall.
- Immediate bankruptcy cause.
- Main financial weakness.
- Attempt-specific lesson.

The frontend must not infer bankruptcy from negative cash flow, negative net worth, low cash, or an exposure score.

## Retry Loop

The maximum attempt count is three and must always be visible during retry preparation.

### Attempt 1 Failure

1. Show bankruptcy cause, main weakness, and one concise lesson.
2. Save attempt 1 summary.
3. Reset financial state to the same scenario starting point.
4. Preserve profile and attempt history.
5. Let the player revise the initial strategy.
6. Start attempt 2.

### Attempt 2 Failure

1. Show bankruptcy cause.
2. Compare attempt 2 against attempt 1.
3. Show what improved and what still caused failure.
4. Save attempt 2 summary.
5. Reset financial state while preserving profile and history.
6. Let the player revise strategy for the final attempt.
7. Start attempt 3.

### Attempt 3 Failure

1. Do not offer another retry.
2. Show the final report card.
3. Summarize repeated mistakes across all attempts.
4. Explain what a stronger strategy would have looked like.
5. Mark the scenario as failed.
6. Offer return to landing or start a completely new scenario.

### Survival on Any Attempt

1. Stop at the end of month 24.
2. Mark the scenario as completed.
3. Show the successful scenario report.
4. Highlight decisions and protections that mattered.
5. Offer return to landing or start a new scenario.

## Scenario Completion Behavior

Month 24 is the only non-bankruptcy terminal checkpoint in the MVP.

If the backend confirms that all required month-24 obligations are covered, the frontend stops progression and renders the Scenario Success Report.

If bankruptcy occurs during month 24, the bankruptcy result takes precedence over survival.

Financial Independence, retirement age, grade thresholds, and later-life outcomes do not end this scenario.

The completion report may mention strong long-term progress, but it must not imply that the player completed a full financial life.

## Frontend-Facing Contracts

These are view-model requirements, not backend endpoint designs.

Transport, persistence, identifiers, exact money representation, and mutations remain backend responsibilities.

### Scenario State

The frontend needs:

- Scenario identifier and title.
- Attempt number and maximum attempts.
- Current month and total months.
- Player profile summary.
- Current financial state.
- Current strategy.
- Net-worth history.
- Cash-runway history.
- Exposure or vulnerability summary.
- Macro update summary.
- Pending interruption, if any.
- Allowed player actions.
- Scenario status.

### Financial State

The frontend needs formatted display values and stable raw values for:

- Cash.
- Liquid investments.
- Speculative investments.
- Credit-card debt.
- Student-loan debt.
- Available credit.
- Monthly cash flow.
- Mandatory obligations.
- Net worth.
- Cash runway.
- Lifestyle or happiness.
- Exposure or vulnerability.

### Turn Result

The frontend needs:

- Months processed.
- Updated scenario state.
- Changed values with before, after, and direction.
- Routine monthly summary.
- Macro update.
- Pending event or checkpoint.
- Bankruptcy or success result when terminal.
- Concise backend-provided explanation.

### Attempt Summary

The frontend needs:

- Attempt number.
- Outcome and ending month.
- Bankruptcy cause when applicable.
- Main weakness.
- Strategy snapshot.
- Key decisions.
- Improvements relative to the previous attempt.
- Repeated mistakes.
- One concise lesson.

### Mock Starting-State Example

```json
{
  "scenarioId": "big-city-survivor",
  "attemptNumber": 1,
  "maximumAttempts": 3,
  "currentMonth": 0,
  "totalMonths": 24,
  "status": "strategy_setup",
  "player": {
    "age": 24,
    "location": "San Francisco, California",
    "career": "Junior Software Engineer"
  },
  "financialState": {
    "monthlyTakeHome": 7200,
    "cash": 12000,
    "indexInvestments": 4000,
    "speculativeInvestments": 0,
    "creditCardDebt": 3500,
    "studentLoanDebt": 18000,
    "rent": 2800,
    "lifestyleTier": "comfortable",
    "cashRunwayMonths": 2.0
  },
  "allowedActions": [
    "review_starting_state",
    "configure_strategy"
  ]
}
```

Numeric values above are illustrative mock values and must not be treated as authoritative frontend calculations.

## Loading and Error Behavior

Every state-changing action needs a visible pending state, duplicate-submission prevention, and a retry path that does not fabricate a result.

If loading fails before an authoritative response, preserve the previous confirmed state and offer retry.

If the backend reports a stale state, reload the current scenario state before enabling another decision.

If a terminal result has already been recorded, the frontend must render that result instead of resubmitting progression.

## Future Expansion

Future versions may add Financial Independence, age-65 outcomes, longer runs, more products, more scenarios, additional event catalogs, and deeper tax or retirement choices.

Those systems are outside the Big City Survivor MVP loop.

## Open Product Decisions

- Exact allocation input style: fixed amount, percentage, or both.
- Whether strategy changes take effect immediately or at the next month boundary.
- Exact checkpoint months and whether they are fixed or event-relative.
- Exact fast-forward choices and speed.
- Which insurance choice is understandable enough for this scenario.
- Whether custom profiles may alter the authored event severity bounds.
- Exact comparison metrics shown between attempts.
