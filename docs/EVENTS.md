# Big City Survivor Event Arc

## Document Control

- Status: Focused MVP specification
- Authored beats: 5
- Last updated: 2026-07-15

## Purpose

This document defines the complete event arc for the Big City Survivor MVP.

The arc is authored so the player can understand cause and effect, while bounded timing, amounts, and copy may vary between attempts.

The backend owns event eligibility, timing, amounts, decision effects, and terminal outcomes.

## Event Design Goals

- Test the strategy the player actually chose.
- Escalate from warning to disruption to temptation to major stress.
- Make preparation visible before punishment becomes terminal.
- Keep each decision understandable in one modal.
- Produce evidence that supports attempt comparison and final reports.
- Avoid random events that can bankrupt a prepared player without a meaningful response.

## Authored Arc

| Beat | Event | Window | Primary Weakness |
| --- | --- | --- | --- |
| 1 | The Small Stuff Multiplies | Months 2-3 | Lifestyle creep and low monthly surplus |
| 2 | Rent Renewal Shock | Months 5-7 | High fixed costs and weak cash runway |
| 3 | Rocket Token FOMO | Months 8-10 | Speculative concentration and impulsive risk |
| 4 | Surprise Calendar Invite | Months 13-15 | Emergency savings, debt, and income dependence |
| 5 | The Recovery Offer | Months 17-19 | Runway management and willingness to adapt |

The final months after The Recovery Offer form a recovery period with no additional required authored shock.

Macro updates may continue, but they must not introduce a new event category or bypass the five-beat arc.

## Event 1: The Small Stuff Multiplies

- Event type: Small warning and recurring-cost reveal.
- Weakness tested: Excessive lifestyle spending, forgotten subscriptions, and limited monthly surplus.
- When it may occur: Once during months 2-3 after at least one routine month has completed.
- Narrative purpose: Teach that small recurring costs reduce future flexibility before a major shock arrives.
- Available decisions: Cancel and trim recurring costs, pay from cash without changing lifestyle, or move the expense to credit and preserve cash.
- Visible consequences: Current cash, monthly cash flow, lifestyle or happiness, credit-card balance, and vulnerability.
- Long-term consequence: A trim lowers recurring lifestyle cost; using credit increases debt pressure; absorbing the cost without adjustment leaves the strategy unchanged.
- Required character or illustration: GM Pengo event pose plus one compact receipt, parking, or subscription-stack illustration.
- Retry variation: The exact expense may switch between parking, subscriptions, and city fees, and the amount may vary within a small configured range.
- Fixed learning target: Small recurring choices affect the runway available for later events.

## Event 2: Rent Renewal Shock

- Event type: Medium disruption and fixed-cost increase.
- Weakness tested: High rent, high lifestyle commitments, and insufficient emergency savings.
- When it may occur: Once during months 5-7 after Event 1 has resolved.
- Narrative purpose: Force the player to decide whether comfort, flexibility, or cash preservation matters most.
- Available decisions: Accept the increase and cut lifestyle spending, move to a cheaper option with a one-time moving cost, or accept the increase without adjustment.
- Visible consequences: Rent, current cash, monthly cash flow, lifestyle or happiness, and cash runway.
- Long-term consequence: Accepting the increase raises mandatory monthly cost; moving reduces future rent but consumes cash now; cutting lifestyle preserves runway at a happiness cost.
- Required character or illustration: GM Pengo event pose plus a rent-renewal notice or apartment-key illustration.
- Retry variation: Timing and increase amount may vary within configured bounds, but the fixed-cost tradeoff remains.
- Fixed learning target: A recurring obligation can be more dangerous than a larger one-time expense.

## Event 3: Rocket Token FOMO

- Event type: Psychological temptation and optional speculative exposure.
- Weakness tested: Speculative concentration, low cash reserves, and chasing short-term gains.
- When it may occur: Once during months 8-10 after the player has seen at least one checkpoint recap.
- Narrative purpose: Offer an emotionally attractive shortcut before the major stress test.
- Available decisions: Pass and keep the current strategy, make a small capped speculative allocation, or make an aggressive speculative allocation.
- Visible consequences: Cash, speculative holdings, index-fund holdings when reallocated, monthly allocation, and vulnerability.
- Long-term consequence: Speculative exposure remains subject to future backend-generated volatility and may reduce liquid protection during the layoff.
- Required character or illustration: Richie in the MVP pitch pose plus a small speculative chart or token prop.
- Retry variation: Opportunity name, recent performance copy, and short-term return path may vary, while decision categories and configured risk bounds remain stable.
- Fixed learning target: Upside and excitement are not the same as resilience.

## Event 4: Surprise Calendar Invite

- Event type: Major stress test and temporary income interruption.
- Weakness tested: Low emergency savings, high-interest debt, excessive fixed costs, speculative concentration, and dependence on one income.
- When it may occur: Once during months 13-15 after the temptation event has resolved.
- Narrative purpose: Test whether the systems built during the first half of the scenario can carry the player through a real disruption.
- Available decisions: Cut lifestyle immediately and use the emergency fund, liquidate eligible investments while preserving credit, or preserve investments and use available credit as a last resort.
- Visible consequences: Monthly income, cash runway, liquid investments, credit-card debt, monthly cash flow, lifestyle or happiness, and vulnerability.
- Long-term consequence: Income remains reduced or absent for a backend-defined recovery period; debt used during the gap raises future obligations; asset liquidation reduces future recovery potential.
- Required character or illustration: GM Pengo event pose plus Sprout's shocked reaction or a concise layoff-notice illustration.
- Retry variation: The exact start month and income-interruption duration may vary narrowly, but every attempt receives the layoff stress test.
- Fixed learning target: Emergency savings and manageable fixed costs buy decision time.

## Event 5: The Recovery Offer

- Event type: Recovery decision and final endurance phase.
- Weakness tested: Remaining runway, debt pressure, lifestyle rigidity, and willingness to accept a tradeoff.
- When it may occur: Once during months 17-19 after at least two layoff months or the configured recovery threshold.
- Narrative purpose: Give the player agency in recovery and establish the conditions for the final months.
- Available decisions: Accept a stable lower-paying role, take temporary contract work with uncertain continuation, or continue searching while making a deeper lifestyle cut.
- Visible consequences: Monthly take-home income, cash runway, lifestyle or happiness, debt trajectory, and months remaining.
- Long-term consequence: The selected recovery path sets income and cost pressure for the remaining months through month 24.
- Required character or illustration: Buddi in the encouragement pose, with GM Pengo retained only as the event narrator when needed.
- Retry variation: Offer terms and timing may vary based on prior choices, but every solvent attempt receives a viable recovery decision.
- Fixed learning target: Recovery often requires a deliberate compromise rather than a perfect outcome.

## Final Recovery Period

After Event 5, the simulation continues through month 24 using the player's selected recovery path and recurring strategy.

The frontend should emphasize runway, monthly cash flow, debt pressure, and months remaining.

No new required event is introduced during this period.

Routine macro updates may create bounded gains or losses but must not replace the authored completion test.

## Event Lifecycle

```text
eligible window
  -> backend schedules event
  -> time advancement pauses
  -> GM Pengo introduces event
  -> player reviews decisions
  -> frontend submits selected decision
  -> backend applies immediate and persistent effects
  -> frontend shows consequence
  -> checkpoint or dashboard
```

## Retry Consistency Rules

- Keep the five event beats and their order stable across attempts.
- Allow bounded timing, amount, copy, and cosmetic variation where listed.
- Keep the major layoff stress test present in every attempt.
- Preserve decision categories so attempt comparisons remain understandable.
- Let prior strategy alter outcomes, eligibility details, and severity without letting the frontend calculate those changes.
- Record event, choice, visible effect, persistent effect, and explanation for every attempt.
- Do not add a surprise sixth event during a retry.

## Visible Consequence Requirements

Every event result must provide:

- Event and decision identifiers.
- Scenario month and attempt number.
- Before-and-after values.
- Immediate effects.
- Persistent effects and duration when applicable.
- Updated cash runway and vulnerability.
- One concise explanation of protection or weakness.
- Updated scenario status.
- Checkpoint, bankruptcy, or success result when applicable.

## Content Safety and Tone

- Do not shame the player for debt, job loss, medical risk, or bankruptcy.
- Do not trivialize a terminal result with a joke.
- Keep jokes focused on the situation, never the player's intelligence or worth.
- Label all financial content as game feedback, not personalized financial advice.

## Future Expansion

Medical bills, car repair, market decline, insurance claims, household changes, and other event families remain future options.

They are not additional required beats in this MVP.

## Open Product Decisions

- Exact amount ranges for each event.
- Exact duration and income level during the layoff.
- Whether credit use is automatic before an event decision or only part of resolution.
- Exact return behavior for speculative exposure.
- Whether the recovery offer is conditional on a prior action or guaranteed for every solvent attempt.
- Exact checkpoint placement around event beats.
