# Life Finance MVP Game Specification

## Document Control

- Status: Focused MVP specification
- Scenario: Big City Survivor
- Frontend scope: One complete playable scenario
- Scenario length: 24 simulated months
- Maximum attempts: 3
- Last updated: 2026-07-15

## Purpose and Authority

This document is the product source of truth for the first playable frontend scenario.

When older documents describe a full life simulation, Financial Independence as an immediate ending, age-65 grading, many personas, or unlimited play, those ideas are future expansion and are not requirements for this MVP.

The backend architecture documents remain authoritative for deterministic calculations, persistence, security, and state mutation.

These design-bible documents are authoritative for the MVP player journey, presentation, feedback, character use, and frontend-facing state.

## MVP Vision

Prove that one short financial-life scenario can be fun, understandable, and worth replaying before expanding the game.

The player should feel pressure, make a small number of meaningful strategic choices, understand why each consequence happened, and use failure as information on the next attempt.

The experience should feel like a game first and a finance product second.

## MVP Design Pillars

1. Meaningful strategy, not bill-paying chores.
2. Authored pressure with outcomes that react to player preparation.
3. Immediate feedback paired with visible long-term consequences.
4. Failure that teaches without shaming the player.
5. A short, replayable scenario with a hard three-attempt limit.

## Scenario: Big City Survivor

The player is a young professional living in San Francisco with a reasonable salary, high fixed costs, some savings, debt, and limited room for error.

The goal is to survive 24 simulated months without bankruptcy.

The scenario uses an authored event arc that tests emergency savings, high-interest debt, lifestyle commitments, speculative concentration, and preparation for income loss.

### Configurable Preset Starting State

These are product defaults, not frontend calculations.

The backend owns authoritative normalization and may return updated values without requiring a UI redesign.

| Field | MVP Default | Product Intent |
| --- | ---: | --- |
| Age | 24 | Early-career starting point |
| Location | San Francisco, California | High-cost city pressure |
| Career | Junior Software Engineer | Reasonable salary with employment exposure |
| Monthly take-home income | $7,200 | Strong income that still feels constrained |
| Liquid cash | $12,000 | Useful buffer below six months of expenses |
| Index-fund investments | $4,000 | Modest long-term investment base |
| Speculative investments | $0 | Player may add exposure during strategy setup |
| Credit-card debt | $3,500 | High-interest pressure |
| Student-loan debt | $18,000 | Persistent monthly obligation |
| Monthly rent | $2,800 | Primary fixed-cost pressure |
| Monthly non-rent lifestyle cost | $2,450 | Comfortable city lifestyle |
| Monthly minimum debt payments | $550 | Mandatory debt service |
| Monthly insurance premiums | $250 | Baseline protection cost |
| Estimated monthly surplus before strategy | $1,150 | Limited allocation capacity |
| Lifestyle tier | Comfortable | Adjustable before and during the scenario |

All amounts must live in scenario configuration or backend state rather than presentation components.

### Custom Profile Path

The player may create a character and financial profile instead of selecting the preset.

The custom profile still enters the Big City Survivor scenario, follows the same 24-month event arc, and uses the same three-attempt structure.

The backend normalizes custom inputs into the same frontend-facing starting-state shape.

## Complete MVP Player Journey

1. Land on Life Finance and start a new scenario.
2. Choose the Big City Survivor preset or create a character and profile.
3. Review the generated starting financial state and its main pressure points.
4. Choose an initial strategy for lifestyle, emergency savings, debt, investing, speculation, and relevant insurance.
5. Enter the main simulation at month 1 of 24.
6. Review the dashboard and adjust strategy when desired.
7. Advance time while routine income, obligations, and allocations happen automatically.
8. Receive a macro update or authored personal event.
9. Make a strategic response and see immediate and long-term consequences.
10. Continue through checkpoints until survival at month 24 or bankruptcy.
11. On bankruptcy, review the cause and prepare the next attempt when one remains.
12. End with a success report or the final failure report after attempt 3.

## Core Loop

```text
Dashboard
  -> review current financial state
  -> adjust strategy if desired
  -> advance time
  -> receive macro update or personal event
  -> choose a response
  -> apply consequences
  -> show updated state
  -> continue
```

The player never manually pays routine income taxes, rent, lifestyle expenses, minimum debt payments, insurance premiums, or recurring investment contributions.

The player makes strategic decisions that change future automatic behavior.

## Three-Attempt Structure

Attempt history persists across retries, but financial state resets to the scenario starting point.

The profile remains fixed so comparisons are meaningful, while the player may revise the initial strategy.

### Attempt 1: Learn the System

The player experiences the authored scenario normally.

If bankruptcy occurs, the game shows the immediate cause, the main financial weakness, one concise lesson, and a retry action.

### Attempt 2: Apply the Lesson

The player reviews attempt 1 and changes the starting strategy.

If bankruptcy occurs again, the game compares attempts, identifies what improved, identifies what still caused failure, and offers the final retry.

### Attempt 3: Final Attempt

No further retry is offered.

Survival produces a success report that highlights the decisions and buffers that protected the player.

Bankruptcy produces a final report card that identifies repeated mistakes, explains a stronger strategy, and marks the scenario as failed.

## Success Condition

The player succeeds by completing month 24 without triggering bankruptcy.

Negative cash flow, declining net worth, or an individual bad month do not independently fail the scenario.

## Bankruptcy and Failure Condition

Bankruptcy occurs only when mandatory obligations are due and available liquid resources cannot cover the shortfall.

The backend consumes eligible resources in this order:

1. Liquid cash.
2. Liquid investments after applicable costs.
3. Remaining available credit.

The frontend presents the funding sequence, the remaining shortfall, and the weakness that made the player vulnerable.

The backend remains authoritative for all amounts and terminal-state decisions.

## Scenario Completion Reports

### Success Report

The report includes attempt number, ending state, major events survived, decisions that provided protection, cash-runway trend, net-worth trend, and one next-step lesson.

### Final Failure Report

The report includes all three attempt outcomes, repeated weaknesses, strategy changes that helped, repeated mistakes, the final bankruptcy cause, and an example of a stronger strategy.

## MVP Scope

### Included

- One Big City Survivor scenario.
- Preset and custom-profile entry paths.
- One configurable starting state.
- One starting-strategy phase.
- One authored five-beat event arc.
- Automatic routine finances.
- Strategic decisions and consequence feedback.
- Checkpoint recaps.
- Bankruptcy and success endings.
- A maximum of three attempts.

### Excluded

- Additional scenarios or game modes.
- A full lifetime simulation.
- Age-65 completion.
- Financial Independence as an MVP terminal condition.
- Unlimited retries.
- Manual bill payment.
- A broad catalog of financial products.
- Fully random event generation.
- Multiplayer, leaderboards, achievements, or social systems.

## Future Expansion

After the scenario proves understandable and fun, future versions may add more personas, additional cities, longer life stages, retirement, Financial Independence, age-65 grading, more financial products, broader event catalogs, achievements, and social content.

Future systems must not complicate the first 24-month scenario until the MVP is validated.

## Open Product Decisions

- Final custom-profile fields and validation limits.
- Final configured amounts for lifestyle cost, insurance, credit limit, and investment liquidation costs.
- Whether fast-forward advances one month, three months, or directly to the next interruption.
- How much event timing and severity may vary between attempts while preserving fair comparisons.
- Exact lifestyle or happiness scale and how it is explained.
- Exact labels and thresholds for cash runway and vulnerability states.
- Whether the final recovery job offer is always present or conditional on earlier choices.
- Final art direction and canonical references for Penny, Froggy, Richie, Buddi, and GM Pengo.

## Related Documents

- [Gameplay](./GAMEPLAY.md)
- [Screens](./SCREENS.md)
- [Events](./EVENTS.md)
- [Characters](./CHARACTERS.md)
- [Character Rules](./CHARACTER_RULES.md)
- [Animations](./ANIMATIONS.md)
- [Dialogue](./DIALOGUE.md)
- [Design System](./DESIGN_SYSTEM.md)
- [Assets](./ASSETS.md)
