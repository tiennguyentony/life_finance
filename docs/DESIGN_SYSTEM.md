# Big City Survivor MVP Design System

## Document Control

- Status: Focused MVP visual direction
- Platform priority: Desktop web first
- Last updated: 2026-07-15

## Purpose

This document defines the visual and interaction direction for the first complete Big City Survivor scenario.

It does not define a complete multi-scenario design system.

## Visual Direction

Life Finance pairs serious financial information with warm, playful character direction.

The interface should feel like a simulation game with clear stakes, not a bank account, budgeting dashboard, or spreadsheet.

Numbers remain crisp and trustworthy while characters provide emotion, guidance, and narrative pressure.

## MVP Design Principles

1. Put the current decision and its consequence above secondary detail.
2. Make financial state scannable without flattening it into generic banking cards.
3. Use characters intentionally and leave breathing room around critical data.
4. Communicate danger with words, shape, and hierarchy in addition to color.
5. Keep charts simple enough to explain the last event or strategy change.
6. Use rounded, toy-like surfaces without making serious outcomes feel childish.
7. Preserve one dominant action per screen or modal.

## Information Hierarchy

### Level 1: Scenario State

Current month, attempt number, months remaining, cash runway, and terminal status.

### Level 2: Strategic Health

Monthly cash flow, net-worth trend, vulnerability, lifestyle, and active strategy.

### Level 3: Financial Detail

Assets, liabilities, debt categories, recurring allocations, event history, and explanatory definitions.

Level 3 detail should be available on demand and should not crowd the primary game state.

## Serious Financial Information

- Use tabular numerals for money and percentages.
- Show units and time periods directly beside values.
- Use before-and-after values for consequences.
- Label projected values as projected.
- Label backend-provided estimates and explanations clearly.
- Do not use mascot dialogue as the only source of a financial fact.
- Keep raw financial data visually stable while character or event motion plays nearby.

## Warm and Playful Characters

- Use characters as guides, narrators, reactions, and rewards.
- Keep character art visually warmer and softer than data surfaces.
- Give each screen one leading character role.
- Use a second character only for a deliberate narrator-and-reaction or failure-and-coach pairing.
- Never place character art behind numbers or controls.
- Let serious terminal information settle before playful character motion resumes.

## Desktop-First Layout

The primary simulation should use a wide desktop canvas with three clear zones:

1. A compact scenario header for month, attempt, and progress.
2. A dominant center zone for net-worth history, cash runway, and current event or macro context.
3. A supporting side zone for assets, liabilities, lifestyle, vulnerability, Sprout, and strategy actions.

The layout should preserve a clear reading path from state to risk to action.

The desktop design should not require horizontal scrolling.

### Responsive Adaptation

- Collapse supporting zones below the primary state on narrower screens.
- Keep the active decision and primary action visible before secondary detail.
- Replace side panels with full-screen sheets when width is limited.
- Preserve chart labels and danger text rather than shrinking them below readability.
- Treat mobile as an adaptation of the approved desktop hierarchy, not a separate MVP flow.

## Crisp Data Visualization

### Net-Worth History

- Use one clear line with month markers.
- Annotate authored event months and strategy changes.
- Allow negative values without clipping or visually treating zero as the bottom.
- Keep the 24-month horizon visible or clearly scrollable.
- Use accessible labels for current value, change, and event markers.

### Cash Runway

- Show runway in months, not only as a score.
- Pair the value with a short state label such as stable, watch, danger, or terminal.
- Show the mandatory monthly cost used by the backend when available.
- Do not show six months as a universal guarantee of safety.

### Monthly Cash Flow

- Separate recurring inflow, mandatory costs, strategy allocations, and resulting surplus or shortfall.
- Use a compact composition rather than a transaction table.

### Assets and Liabilities

- Group assets and liabilities separately.
- Distinguish liquid assets from assets that do not automatically cover obligations.
- Keep credit-card debt visually distinct from student-loan debt.

### Vulnerability

- Show a clear label, concise explanation, and top contributing factors.
- Do not expose a mysterious number without a reason.
- Do not imply that vulnerability itself is bankruptcy.

## Danger States

| State | Meaning | Required Treatment |
| --- | --- | --- |
| Stable | Current state has room to absorb normal pressure | Calm semantic color, plain label, no alarm motion |
| Watch | One weakness could create a meaningful setback | Warm warning color, concise reason, optional action |
| Danger | Mandatory obligations or runway are under material pressure | High-contrast danger color, explicit reason, prominent next action |
| Terminal | Backend has confirmed bankruptcy | Dedicated screen, shortfall evidence, no looping alarm |

Danger must use text labels and structural emphasis in addition to color.

Avoid flashing, pulsing red backgrounds, repeated shaking, and countdown pressure unless a real decision deadline exists.

## Character Card Pattern

### Purpose

Present one character as a guide, reaction, or choice without crowding the state.

### Anatomy

- Character image.
- Character name.
- Role or context label.
- One short line of dialogue.
- Optional primary action.
- Optional state badge.

### Rules

- Keep dialogue within the limits in `DIALOGUE.md`.
- Use one dominant pose.
- Preserve the same crop and visual scale for a character across equivalent cards.
- Keep financial evidence outside the speech bubble.
- Provide alt text when the image communicates state.
- Use empty alt text when the character is purely decorative and the state is already written.

## Event Card Pattern

### Purpose

Pause progression, establish stakes, and lead into a decision.

### Anatomy

- Event type or scenario month.
- Short title.
- Concise setup.
- GM Pengo or event illustration.
- Affected area or weakness.
- Severity label.
- Primary action.

### Rules

- Use the same event-card frame for all five authored beats.
- Vary character, illustration, semantic tone, and copy rather than inventing a new layout for each event.
- Reveal decisions after the setup is readable.
- Keep danger information visible when the decision modal opens.
- Do not display numeric effects that the backend has not confirmed.

## Consequence Card Pattern

### Anatomy

- Decision selected.
- Immediate result.
- Before-and-after values.
- Persistent effect.
- Protection or vulnerability explanation.
- Sprout reaction.
- Continue action.

### Rules

- Use direction labels in addition to color.
- Distinguish temporary and recurring effects.
- Animate only confirmed changes.
- Make the explanation readable without the character image.

## Attempt and Report Pattern

- Show attempt number as `Attempt 1 of 3` rather than a vague life count.
- Compare the same metrics in the same order across attempts.
- Use one column per attempt only when desktop width supports readable comparisons.
- On smaller widths, stack attempts and preserve labels.
- Highlight what improved before what still failed on attempt 2.
- On attempt 3 failure, remove retry language entirely.

## Core Component Patterns

| Pattern | MVP Use |
| --- | --- |
| Scenario header | Month, attempt, and progress |
| Money stat | Cash, flow, investments, debt, and net worth |
| Runway meter | Months of liquid protection |
| Trend chart | Net-worth history across 24 months |
| Vulnerability card | Exposure level and top causes |
| Lifestyle card | Tier, happiness, and recurring cost tradeoff |
| Character card | Guidance or reaction |
| Event card | Authored interruption setup |
| Decision card | One response and its visible tradeoff |
| Consequence card | Immediate and persistent change |
| Checkpoint recap | Progress and lesson |
| Attempt comparison | Retry and final reports |

## Color Direction

Exact token values remain to be approved.

The MVP needs semantic roles for:

- Canvas and elevated surfaces.
- Primary game action.
- Character accent.
- Positive change.
- Warning.
- Danger.
- Terminal bankruptcy.
- Informational macro update.
- Focus and selection.

Positive financial information should not default to the same green used by Sprout if that reduces contrast or makes the mascot look like a status indicator.

## Typography Direction

- Use a playful display face sparingly for game titles, event titles, and major outcome labels.
- Use a highly legible interface face for all financial data, controls, and explanations.
- Use tabular numerals for changing financial values.
- Keep body copy compact and avoid dense paragraphs in the active simulation.
- Maintain a clear distinction between character dialogue and factual system copy.

## Shape and Surface Direction

- Use generous rounded corners and soft elevation for neutral game surfaces.
- Use firmer borders and less playful shape distortion for data-heavy cards.
- Let event cards use a stronger frame than dashboard cards.
- Use consistent radii within each component family.
- Avoid making every card a floating pill.

## Motion Direction

Use only the nine MVP motion patterns defined in `ANIMATIONS.md`.

Motion supports state change and emotional focus, not decoration.

## Accessibility Standards

- Meet WCAG 2.2 AA contrast and interaction expectations.
- Provide visible keyboard focus.
- Use semantic headings, buttons, forms, dialogs, and status regions.
- Trap and restore focus correctly for blocking modals.
- Announce confirmed stat changes without reading every dashboard value again.
- Provide reduced-motion behavior.
- Do not use color, animation, or character pose as the only status signal.
- Keep text zoom and browser zoom usable at desktop widths.

## Future Expansion

Additional themes, scenario skins, achievements, social components, long-form tutorials, retirement visualizations, and collection systems are future work.

## Open Product Decisions

- Final color tokens and contrast-tested danger palette.
- Final typography families and licensing.
- Exact desktop grid and maximum content width.
- Whether lifestyle is labeled happiness, quality of life, or lifestyle satisfaction.
- Exact vulnerability visualization and labels.
- Whether charts use custom rendering or an existing accessible chart library.
- Final event-card art scale and character crop.
