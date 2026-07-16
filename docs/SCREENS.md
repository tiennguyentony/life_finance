# Big City Survivor MVP Screens

## Document Control

- Status: Focused MVP specification
- Required screens: 16
- Last updated: 2026-07-15

## Purpose

This document defines only the screens and overlays required to complete the Big City Survivor scenario.

Several steps may share a route or shell, but every screen state must be refresh-safe once backend persistence is connected.

The first implementation combines the Main Simulation, Event Interruption, Decision Selection, and Consequence states into one refresh-safe playable loop across `/game` and `/game/event`.

It intentionally excludes login and keeps financial systems in contextual overlays instead of separate navigation destinations.

## Required Flow

```text
Landing
  -> Start Method
  -> Character and Profile Creation OR Big City Survivor Preset Preview
  -> Starting State Review
  -> Initial Strategy Setup
  -> Main Simulation
      -> Actions / Allocation Panel
      -> Event Interruption
      -> Decision Selection
      -> Consequence / State Change
      -> Checkpoint Recap
      -> Main Simulation
  -> Bankruptcy
      -> Retry Preparation when attempt 1 or 2 fails
      -> Main Simulation on the next attempt
  -> Final Failure Report after attempt 3
  OR
  -> Scenario Success Report
```

## Screen Inventory

| ID | Screen | Surface | Required Character |
| --- | --- | --- | --- |
| S01 | Landing | Full page | Sprout |
| S02 | Start Method | Full page | Penny |
| S03 | Character and Profile Creation | Full page or wizard step | Penny |
| S04 | Big City Survivor Preset Preview | Full page or wizard step | Penny |
| S05 | Starting State Review | Full page or wizard step | Froggy |
| S06 | Initial Strategy Setup | Full page or wizard step | Penny with contextual specialists |
| S07 | Main Simulation Screen | Full page | Sprout |
| S08 | Actions / Allocation Panel | Side panel or modal | Contextual Penny, Froggy, or Richie |
| S09 | Event Interruption | Blocking overlay or full page | GM Pengo |
| S10 | Decision Selection | Blocking modal or full page | GM Pengo |
| S11 | Consequence / State Change | Blocking modal or full page | Sprout |
| S12 | Checkpoint Recap | Modal or full page | Buddi |
| S13 | Bankruptcy Screen | Full page | Sprout and Buddi |
| S14 | Retry Preparation Screen | Full page | Buddi |
| S15 | Final Failure Report | Full page | Buddi |
| S16 | Scenario Success Report | Full page | Sprout |

## S01: Landing

- Purpose: Establish the game-first tone and start the Big City Survivor experience.
- Player mindset: Curious and ready to play, without needing financial knowledge.
- Required information: Life Finance identity, one-line promise, scenario entry action, and visual focus on Sprout.
- Primary action: Start a new scenario.
- Secondary actions: Continue a locally saved scenario when one exists; login is excluded from the MVP.
- Character used: Sprout in the approved landing idle or confident presentation.
- Loading state: Keep the primary action disabled only while checking for an existing run, with a short inline loading label.
- Empty state: Not applicable.
- Error state: Allow a new local or mocked scenario start if saved-run lookup fails, while clearly marking that resume is unavailable.
- Transition: Move to Start Method.

## S02: Start Method

- Purpose: Let the player choose the preset or custom-profile path.
- Player mindset: Choosing how much setup they want before playing.
- Required information: Big City Survivor preset card, custom character and profile option, approximate setup time, and attempt structure summary.
- Primary action: Select Big City Survivor or create a custom profile.
- Secondary actions: Return to Landing or resume a saved scenario when available.
- Character used: Penny as the planning guide.
- Loading state: Skeleton the choice cards while preset metadata loads.
- Empty state: Show the custom-profile option if preset data is temporarily unavailable.
- Error state: Offer retry and preserve the player's previous selection.
- Transition: Preset selection moves to Big City Survivor Preset Preview, while custom selection moves to Character and Profile Creation.

## S03: Character and Profile Creation

- Purpose: Collect the minimum information needed to normalize a custom player into the Big City Survivor scenario.
- Player mindset: Personalizing the scenario without filling out a financial application.
- Required information: Character choice or identity, name, age, location, career, take-home income, cash, debts, rent, lifestyle tier, and optional goal.
- Primary action: Generate starting state.
- Secondary actions: Back to Start Method, choose preset instead, or reset the form.
- Character used: Penny for concise field guidance.
- Loading state: Keep entered values visible while generating and prevent duplicate submission.
- Empty state: Prepopulate safe examples and clearly mark optional fields.
- Error state: Show field-level validation without clearing valid input, and show a form-level retry for generation failure.
- Transition: Move to Starting State Review after successful normalization.

## S04: Big City Survivor Preset Preview

- Purpose: Explain the scenario pressure and starting profile before committing to it.
- Player mindset: Evaluating whether the challenge sounds understandable and interesting.
- Required information: Age, city, career, take-home income, cash, investments, debts, rent, lifestyle tier, 24-month duration, and three-attempt limit.
- Primary action: Play this preset.
- Secondary actions: Customize the profile or return to Start Method.
- Character used: Penny as the scenario planner.
- Loading state: Skeleton the starting-profile summary and keep navigation available.
- Empty state: Not applicable because the preset is required content.
- Error state: Offer retry and a custom-profile fallback if preset configuration cannot load.
- Transition: Move to Starting State Review.

## S05: Starting State Review

- Purpose: Make the starting financial state understandable before strategy decisions begin.
- Player mindset: Asking where the pressure is and what they can influence.
- Required information: Monthly take-home income, cash, investments, debts, rent, mandatory obligations, estimated surplus, cash runway, lifestyle tier, and top two vulnerabilities.
- Primary action: Build my strategy.
- Secondary actions: Edit custom profile, return to preset preview, or inspect short definitions.
- Character used: Froggy for emergency-fund and runway guidance.
- Loading state: Show labeled metric skeletons rather than blank cards.
- Empty state: Explain which profile values are missing and return the player to the appropriate setup step.
- Error state: Preserve the last generated profile and offer state regeneration.
- Transition: Move to Initial Strategy Setup.

## S06: Initial Strategy Setup

- Purpose: Set recurring priorities before month 1.
- Player mindset: Building a plan with limited surplus and visible tradeoffs.
- Required information: Available monthly allocation, lifestyle tiers, emergency-fund allocation, debt-paydown allocation, index-fund allocation, speculative allocation, insurance choices, and projected effect summary.
- Primary action: Lock strategy and begin month 1.
- Secondary actions: Apply a recommended setup, reset allocations, or return to Starting State Review.
- Character used: Penny leads; Froggy appears only beside safety choices and Richie appears only beside speculative choices.
- Loading state: Disable confirmation while the strategy is validated and retain all entered allocations.
- Empty state: Start with unallocated surplus and a clear prompt rather than silently applying a strategy.
- Error state: Display backend field errors beside the affected choice and keep unaffected values.
- Transition: Move to Main Simulation Screen with the normalized strategy.

## S07: Main Simulation Screen

- Purpose: Provide the primary game state and control time progression.
- Player mindset: Monitoring pressure, looking for risk, and deciding whether to adjust strategy before advancing.
- Required information: Current scenario month, attempt number, available cash, monthly surplus or deficit, cash runway, net-worth trend, vulnerability, recent state change, fast-forward control, and restrained Sprout reaction. Detailed assets, liabilities, cash flow, banking, and investments remain contextual.
- Primary action: Advance time or fast-forward to the next interruption.
- Secondary actions: Open contextual financial-position or monthly-plan details, then open Actions / Allocation Panel when that increment is implemented.
- Character used: Sprout as a restrained emotional reaction near the current-state summary.
- Loading state: Preserve the confirmed dashboard, animate the time control, and block duplicate progression.
- Empty state: If no active run exists, explain that the scenario has not started and return to Start Method.
- Error state: Preserve the last confirmed month and offer retry without advancing locally.
- Transition: Return to itself after a routine month, or move to Event Interruption, Checkpoint Recap, Bankruptcy Screen, or Scenario Success Report.

## S08: Actions / Allocation Panel

- Purpose: Let the player adjust strategy without turning the game into a spreadsheet.
- Player mindset: Responding to new information or correcting a weak plan.
- Required information: Current allocations, available surplus, effective month, projected cash-flow change, runway change, debt impact, investment exposure, and lifestyle effect.
- Primary action: Save strategy changes.
- Secondary actions: Cancel, restore current strategy, or apply a recommended adjustment.
- Character used: Penny for general planning, Froggy for safety changes, or Richie for investment and speculation changes, but only one guide should lead the active section.
- Loading state: Keep controls visible and disable resubmission while saving.
- Empty state: Show the current strategy even when no surplus is available, with an explanation of why allocation is constrained.
- Error state: Show field-level validation and preserve the draft.
- Transition: Close to Main Simulation Screen after the updated strategy is confirmed.

## S09: Event Interruption

- Purpose: Stop time and make an authored event feel consequential.
- Player mindset: Alert, surprised, and ready to understand what changed.
- Required information: Event title, event type, concise setup, scenario month, affected area, severity, and whether a decision is required.
- Primary action: See my options.
- Secondary actions: Inspect the relevant current metric or enable reduced motion.
- Character used: GM Pengo as event narrator and pressure source.
- Loading state: Hold the interruption frame until complete event content is available.
- Empty state: If an event identifier has no content, do not advance and request a safe reload.
- Error state: Keep the previous dashboard authoritative and offer event reload.
- Transition: Move to Decision Selection, or directly to Consequence / State Change for an informational macro update.

## S10: Decision Selection

- Purpose: Present a small set of strategic responses with understandable tradeoffs.
- Player mindset: Weighing protection now against future cost or opportunity.
- Required information: Two or three decisions, immediate tradeoff, possible persistent effect, relevant current resources, and any backend-provided eligibility reason.
- Primary action: Confirm one decision.
- Secondary actions: Compare options, inspect a financial term, or return to the event setup before submission.
- Character used: GM Pengo introduces the stakes without recommending a hidden best answer.
- Loading state: Lock all decisions after submission and show one concise resolving state.
- Empty state: Do not allow continuation if no valid decisions exist; request refreshed event state.
- Error state: Re-enable choices only when the backend confirms no decision was accepted.
- Transition: Move to Consequence / State Change.

## S11: Consequence / State Change

- Purpose: Explain what changed now and what will matter later.
- Player mindset: Checking whether the decision helped, hurt, or traded one risk for another.
- Required information: Decision selected, before-and-after values, immediate effect, persistent effect, updated runway or vulnerability, and one explanation sentence.
- Primary action: Continue.
- Secondary actions: Inspect a changed metric or view the underlying tradeoff summary.
- Character used: Sprout with an emotion matched to the outcome, without replacing the explanation.
- Loading state: Use labeled result placeholders while the authoritative state is resolved.
- Empty state: If no changed values are returned, show the narrative outcome and mark the data issue for retry rather than inventing numbers.
- Error state: Preserve the event as pending and offer resolution reload.
- Transition: Move to Main Simulation Screen, Checkpoint Recap, Bankruptcy Screen, or Scenario Success Report according to the returned state.

## S12: Checkpoint Recap

- Purpose: Summarize progress and restore clarity between event beats.
- Player mindset: Reflecting on whether the strategy is becoming stronger or more fragile.
- Required information: Months completed, months remaining, net-worth change, runway change, debt change, key decision, event outcome, current attempt, and one lesson or warning.
- Primary action: Continue the scenario.
- Secondary actions: Open strategy setup, inspect attempt history, or review a previous event.
- Character used: Buddi for encouragement and progress framing.
- Loading state: Skeleton each recap section while preserving the checkpoint month.
- Empty state: Show a minimal month-progress recap if no notable event occurred.
- Error state: Allow return to the confirmed dashboard and retry recap loading later.
- Transition: Move to Main Simulation Screen.

## S13: Bankruptcy Screen

- Purpose: Explain the terminal shortfall clearly and prepare the player to learn from it.
- Player mindset: Disappointed, but looking for a fair explanation rather than blame.
- Required information: Ending month, mandatory amount due, cash used, investments liquidated, credit used, uncovered shortfall, immediate cause, main weakness, attempt number, and concise lesson.
- Primary action: Prepare attempt 2 or 3 when one remains.
- Secondary actions: Inspect the final state, review the triggering event, or return to Landing.
- Character used: Sprout provides the emotional reaction; Buddi provides the lesson and next-step framing.
- Loading state: Keep terminal status visible while the attempt summary loads.
- Empty state: Never show a generic failure if the backend has marked bankruptcy; request the missing explanation details.
- Error state: Preserve the terminal status and offer summary reload without replaying the turn.
- Transition: Move to Retry Preparation for attempts 1 and 2, or Final Failure Report after attempt 3.

## S14: Retry Preparation Screen

- Purpose: Turn the previous failure into a specific strategy revision.
- Player mindset: Motivated to try a better plan with limited retries remaining.
- Required information: Attempts used, attempts remaining, previous cause, main weakness, one lesson, prior starting strategy, and editable starting strategy.
- Primary action: Start the next attempt.
- Secondary actions: Compare attempt summaries, reset to the original strategy, or return to Landing.
- Character used: Buddi as a supportive retry coach.
- Loading state: Keep the attempt comparison visible while validating the revised strategy.
- Empty state: If attempt history is unavailable, preserve the retry count and explain that comparison details could not load.
- Error state: Keep the revised strategy draft and offer validation retry.
- Transition: Move to Main Simulation Screen at month 1 of the next attempt.

## S15: Final Failure Report After Attempt 3

- Purpose: Close the failed scenario with a fair comparison and actionable understanding.
- Player mindset: Seeking closure and a clear explanation of what would have worked better.
- Required information: Failed status, all three outcomes, repeated mistakes, improvements, final cause, stronger-strategy example, and final report card.
- Primary action: Return to Landing.
- Secondary actions: Review attempt details or start a completely new scenario.
- Character used: Buddi delivers the report without shame or false optimism.
- Loading state: Show the failed status and attempt count while report sections load.
- Empty state: Render available attempt evidence and label unavailable comparisons rather than generating unsupported claims.
- Error state: Preserve the final failed status and offer report reload.
- Transition: Move to Landing or a new Start Method flow.

## S16: Scenario Success Report

- Purpose: Celebrate survival and show which decisions provided protection.
- Player mindset: Proud, curious about what worked, and ready to replay or continue later.
- Required information: Successful status, attempt number, ending state, events survived, protective decisions, runway trend, net-worth trend, strongest improvement, and one next-step lesson.
- Primary action: Finish and return to Landing.
- Secondary actions: Review attempt timeline or start a new scenario.
- Character used: Sprout in the approved celebration presentation.
- Loading state: Show the completed month count while the report loads.
- Empty state: Render the success state and available evidence even if optional narrative is missing.
- Error state: Preserve successful completion and offer report reload.
- Transition: Move to Landing or a new Start Method flow.

## Global Screen Rules

- Keep attempt number and scenario progress visible whenever the player is in an active or retry state.
- Never hide a terminal result behind a generic error.
- Never advance time locally before the authoritative result is returned.
- Use character art to reinforce emotion or guidance, not to cover critical numbers.
- Keep primary actions visually dominant and provide one clear next step per screen.
- Do not rely on color alone for gains, losses, danger, or success.
- Support keyboard navigation, visible focus, semantic headings, and reduced motion.
- Preserve the last confirmed state during loading and recoverable errors.

## Future Expansion

Additional scenario selection, character collection, achievements, retirement, Financial Independence, and age-65 screens are outside this MVP.

## Open Product Decisions

- Whether wizard steps use dedicated routes or persistent step state under existing routes.
- Whether the Actions / Allocation Panel is a side panel or modal at desktop widths.
- Whether checkpoint recap months are fixed, event-driven, or both.
- Whether the custom profile includes visual character customization in the MVP or only identity fields.
- Whether attempt history is accessible during active simulation or only during retries and reports.
