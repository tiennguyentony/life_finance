# Big City Survivor Dialogue Guide

## Document Control

- Status: Focused MVP specification
- Last updated: 2026-07-15

## Purpose

This document defines concise, playful, and nonjudgmental writing for the Big City Survivor scenario.

Dialogue supports decisions and emotional clarity but never replaces backend-provided financial evidence.

## Voice Principles

- Write for a player who understands everyday money but may not know finance terminology.
- Put the consequence before the explanation.
- Use one idea per sentence.
- Keep jokes short and aimed at the situation, not the player.
- Stay warm during setbacks and restrained during serious outcomes.
- Never imply that luck, one asset, or one strategy guarantees success.
- Never shame debt, job loss, lifestyle choices, or bankruptcy.
- Distinguish game feedback from personalized financial advice.

## Writing Rules

- Prefer concrete nouns and active verbs.
- Use dollar amounts, months, and before-and-after values when available.
- Explain a financial term once, at the point of use.
- Avoid unexplained acronyms.
- Avoid corporate finance language, long disclaimers, and motivational filler.
- Avoid saying the player was protected unless the returned state provides evidence.
- Avoid saying the player was doomed when another valid response existed.
- Use sentence case for titles and buttons.
- Use exclamation marks rarely and never on bankruptcy copy.

## Recommended Copy Limits

| Surface | Recommended Maximum |
| --- | ---: |
| Modal title | 6 words |
| Modal description | 24 words |
| Event setup | 36 words |
| Decision label | 6 words |
| Decision tradeoff | 20 words |
| Consequence explanation | 30 words |
| Character reaction | 14 words |
| Dashboard card note | 12 words |
| Checkpoint lesson | 28 words |
| Bankruptcy lesson | 32 words |
| Report summary block | 45 words |
| Primary button label | 5 words |

If content exceeds these limits, move detail into an optional explanation rather than enlarging the primary card.

## GM Pengo Event Voice

GM Pengo announces events, pressure, and decision stakes.

The voice is dry, theatrical, concise, and fair.

GM Pengo may enjoy dramatic timing but must not enjoy the player's harm.

### GM Pengo Pattern

1. Name the interruption.
2. State what changed.
3. Present the stakes.
4. Invite a decision without recommending one.

### Example

- Title: "Your rent renewed itself"
- Setup: "The new lease costs $240 more each month. Comfort is staying. Your surplus is not."
- Prompt: "Which tradeoff do you want?"

## Buddi Retry Voice

Buddi turns evidence from a failed attempt into a specific next step.

The voice is supportive, grounded, direct, and never falsely cheerful.

Buddi should name one improvement before naming the remaining weakness on attempt 2.

### Buddi Pattern

1. Acknowledge the result.
2. Name the evidence.
3. Identify one change worth trying.
4. State the attempts remaining.

### Example

"You lasted four months longer because your rent was lower. Credit-card debt still consumed the recovery window. One attempt remains."

## Sprout Reaction Behavior

Sprout reacts after the state is known.

Sprout does not predict outcomes, explain formulas, recommend products, or contradict the factual consequence copy.

Sprout lines should be emotionally legible even when the character image temporarily reuses the canonical pose.

### Reaction Modes

| State | Behavior | Avoid |
| --- | --- | --- |
| Neutral | Curious confidence | Generic tutorial paragraphs |
| Protected | Relieved surprise | Claiming the strategy always works |
| Tempted | Excited uncertainty | Endorsing speculative products |
| Harmed | Brief shock | Mocking the player |
| Bankrupt | Quiet disappointment | Jokes, blame, or melodrama |
| Successful | Proud celebration | Claiming mastery of all finance |

### Example Reactions

- Protected: "The emergency fund did the emergency part. Incredible."
- Tempted: "Number go up? Number could also do the other thing."
- Harmed: "That hurt the plan. The plan is still breathing."
- Bankrupt: "We ran out of room. Let's see exactly where."
- Successful: "Twenty-four months. Still standing. Mildly legendary."

## Supporting Character Voices

### Penny

Clear, practical planning language with one tradeoff at a time.

### Froggy

Reassuring language focused on runway, flexibility, and time bought.

### Richie

Energetic temptation and upside framing, always paired with neutral interface risk language.

Richie never promises returns or dismisses downside.

## Bankruptcy Copy

### Attempt 1

- Title: "The runway ran out"
- Summary: "Your mandatory bills exceeded every liquid resource available this month."
- Cause label: "Main cause: income loss plus high fixed costs"
- Lesson: "A larger emergency fund or lower monthly commitments would have bought more recovery time."
- Primary action: "Prepare attempt 2"

### Attempt 2

- Title: "Better plan, same shortfall"
- Summary: "You survived longer and used less credit, but the remaining debt payments exhausted your recovery window."
- Improvement label: "Improved: cash runway"
- Remaining weakness label: "Still exposed: high-interest debt"
- Primary action: "Prepare final attempt"

### Attempt 3

- Title: "Scenario failed"
- Summary: "All three attempts ended before month 24. The repeated pressure came from high fixed costs and too little liquid protection."
- Stronger strategy: "A stronger opening would lower recurring costs, build cash first, and cap speculative exposure."
- Primary action: "View final report"

## Retry Copy

### Retry Preparation

- Title: "Use what you learned"
- Body: "Your profile stays the same. Your starting strategy can change."
- Attempts label: "Attempt 2 of 3"
- Primary action: "Start next attempt"

### Final Retry

- Title: "One attempt remains"
- Body: "Keep the improvement. Fix the weakness that still ended the run."
- Attempts label: "Attempt 3 of 3"
- Primary action: "Start final attempt"

## Success Copy

- Title: "Big City Survivor"
- Summary: "You reached month 24 without missing a mandatory obligation."
- Protection label: "What protected you"
- Example protection: "Your emergency fund covered the layoff while lower fixed costs preserved recovery time."
- Sprout reaction: "Still solvent. Still cute. Huge month."
- Primary action: "View success report"

## Error and Loading Copy

- Loading progression: "Processing the next month..."
- Loading event: "GM Pengo is arranging a problem..."
- Loading consequence: "Applying your decision..."
- Recoverable error: "That result did not arrive. Your last confirmed month is safe."
- Retry action: "Try again"
- Stale state: "The scenario changed elsewhere. Reload the current month to continue."

## Content Boundaries

- Do not present game outcomes as personalized financial advice.
- Do not promise returns, employment outcomes, credit approval, or insurance coverage.
- Do not use shame, panic, or moral judgment to create urgency.
- Do not make jokes about medical harm, unemployment, or bankruptcy itself.
- Do not let character dialogue contain authoritative numeric effects that are absent from state.
- Do not hide a required warning inside character flavor copy.

## Accessibility and Clarity

- Pair character voice with plain factual copy.
- Keep action labels distinct and descriptive.
- Avoid directional language that depends on screen position.
- Expand abbreviations in accessible labels.
- Keep critical cause and consequence text available without animation, sound, or image interpretation.

## Editorial Review Checklist

- The copy fits its recommended length.
- The factual statement is supported by returned state.
- The character voice matches the assigned role.
- The player is not shamed or blamed.
- A serious result is not trivialized.
- The next action is clear.
- The copy does not introduce a new gameplay rule.

## Future Expansion

Long-form tutorials, localization variants, social copy, achievement lines, and dialogue for additional scenarios are future work.

## Open Product Decisions

- Final reading-level target.
- Whether every character line is voiced or text-only.
- Whether GM Pengo's dry humor should become quieter on severe events.
- Whether financial-advice labeling appears globally or on specific educational surfaces.
