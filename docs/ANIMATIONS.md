# Big City Survivor MVP Animations

## Document Control

- Status: Focused MVP specification
- Required animation patterns: 9
- Last updated: 2026-07-15

## Purpose

This document lists only the motion needed to make the Big City Survivor scenario readable, responsive, and game-like.

Motion must clarify state changes and character emotion without delaying decisions or hiding financial information.

## Motion Principles

- Use anticipation, squash, bounce, and soft settling for character motion.
- Keep interface motion restrained and faster than character performance.
- Let the most important changed value move first.
- Never animate every card at once.
- Never rely on motion or color alone to communicate an outcome.
- Preserve confirmed values while new state is loading.
- Respect reduced-motion preferences on every animation.

## Required Animation Inventory

| Animation | Surface | Trigger | Target Duration | Loop | Asset Status |
| --- | --- | --- | ---: | --- | --- |
| Landing idle | Landing | Page ready | 8-12 seconds per performance cycle | Yes | Existing Sprout sequence |
| Character selection | Start and profile | Character or preset focus and selection | 180-320 ms | No | Static pose acceptable |
| Simulation fast-forward | Main simulation | Time advance begins | Based on months processed | No | UI motion only |
| Event interruption | Event interruption | Event pauses progression | 350-550 ms | No | GM Pengo pose missing |
| Stat increase | Consequence and dashboard | Confirmed value rises | 300-600 ms | No | UI motion only |
| Stat decrease | Consequence and dashboard | Confirmed value falls | 300-600 ms | No | UI motion only |
| Bankruptcy reaction | Bankruptcy | Terminal bankruptcy result | 700-1200 ms | No | Sprout reaction missing |
| Retry encouragement | Retry preparation | Retry screen becomes ready | 500-900 ms | Optional subtle idle | Buddi pose missing |
| Scenario-success celebration | Success report | Month 24 success confirmed | 900-1600 ms | No | Sprout celebration missing |

## 1. Landing Idle

- Purpose: Make Sprout feel alive before interaction.
- Behavior: Use the existing four landing frames as one choreographed performance with anticipation, action, settle, and breathing holds.
- Loop rule: Leave a calm pause between performance beats so the landing page does not feel like a slideshow.
- Interaction rule: A hover may slightly increase lift or scale, but must not restart the full sequence.
- Reduced motion: Show the canonical first frame with no loop and no parallax.
- Performance rule: Preload only the assets used by the sequence and avoid layout movement.

## 2. Character Selection

- Purpose: Confirm focus and selection without turning the setup flow into a carousel.
- Behavior: Raise the focused card slightly, settle the character with a small squash, and lock the selected state with a clear border and label.
- Input rule: Keyboard focus and pointer hover use the same visual hierarchy.
- Reduced motion: Replace lift and squash with an immediate selected border and label.
- Asset fallback: A static approved pose is sufficient.

## 3. Simulation Fast-Forward

- Purpose: Show time passing while preserving the sense that months are processed in sequence.
- Behavior: Advance the month counter, move a short progress track, and pulse the currently processing month.
- Stop rule: Decelerate and stop immediately when an event, checkpoint, error, bankruptcy, or success state is returned.
- Data rule: Do not animate balances to unconfirmed intermediate values.
- Reduced motion: Replace continuous movement with a loading label and the final confirmed month.

## 4. Event Interruption

- Purpose: Shift attention from the dashboard to an authored event.
- Behavior: Briefly dampen the dashboard, introduce the event card with a firm scale-and-settle motion, and bring in GM Pengo as the narrator.
- Timing rule: The title becomes readable before decisions appear.
- Danger rule: Severe events may use one short impact shake, never repeated shaking.
- Reduced motion: Use an immediate dimmed backdrop and static event card.
- Asset fallback: Use a static GM Pengo placeholder and event icon until approved art exists.

## 5. Stat Increase

- Purpose: Make a beneficial confirmed change easy to locate.
- Behavior: Count or crossfade from before to after, add a short upward position shift, and settle into the new value.
- Feedback rule: Pair motion with a plus label, before-and-after value, or descriptive text.
- Reduced motion: Replace counting with an immediate value swap and persistent change label.

## 6. Stat Decrease

- Purpose: Make a harmful confirmed change easy to locate without overstating normal volatility.
- Behavior: Count or crossfade from before to after, add one short downward position shift, and settle into the new value.
- Severity rule: Reserve impact shake for a major event or terminal shortfall, not every decrease.
- Feedback rule: Pair motion with a minus label, before-and-after value, or descriptive text.
- Reduced motion: Replace counting with an immediate value swap and persistent change label.

## 7. Bankruptcy Reaction

- Purpose: Mark the terminal result emotionally before the lesson appears.
- Behavior: Sprout performs one anticipation, drop, and still hold while the bankruptcy title and shortfall remain stable.
- Tone rule: Do not use confetti, comic explosions, looping tears, or celebratory bounce.
- Sequence rule: Show the factual cause first, then Buddi's lesson after the reaction settles.
- Reduced motion: Use a static bankruptcy reaction pose and immediate report content.
- Asset fallback: The crying state may temporarily reuse the canonical Sprout image with no animation until approved art exists.

## 8. Retry Encouragement

- Purpose: Reframe the previous attempt as information and direct attention to the strategy change.
- Behavior: Buddi enters with one small forward bounce, then points or settles toward the attempt comparison.
- Loop rule: Any idle after entry must be subtle and must stop while the player edits controls.
- Reduced motion: Show Buddi and the attempt comparison immediately.
- Asset fallback: A static Buddi encouragement pose is sufficient.

## 9. Scenario-Success Celebration

- Purpose: Reward reaching month 24 and highlight the decisions that protected the player.
- Behavior: Sprout performs one squash, upward celebration, and soft landing while success values appear in sequence.
- Duration rule: Keep the celebration short enough that the report is usable immediately.
- Replay rule: The player may replay the celebration, but it must not loop automatically.
- Reduced motion: Show the final celebration pose with the complete report.
- Asset fallback: Reuse an approved confident Sprout image until the celebration pose exists.

## Timing and Easing

- Interface feedback should usually complete within 180-600 ms.
- Character reactions may use 500-1600 ms when they mark a major state.
- Use ease-out for entrances, ease-in for exits, and a soft overshoot only for playful character settling.
- Avoid long linear movement and continuous background animation during decisions.

## Reduced-Motion Requirements

- Detect the platform reduced-motion preference.
- Remove loops, parallax, shakes, counting, and large translation.
- Preserve state hierarchy with static poses, labels, and immediate value changes.
- Never delay access to actions because an animation was removed.

## Performance Requirements

- Animate transform and opacity when possible.
- Prevent layout shift by reserving character and card space.
- Pause offscreen character animation.
- Do not preload missing or future assets.
- Keep the dashboard interactive after confirmed state is rendered.

## Review Checklist

- The animation is one of the nine MVP patterns.
- It communicates a state, action, or emotional beat.
- It has a reduced-motion equivalent.
- It does not obscure numbers or controls.
- It does not require an unapproved asset to begin implementation.
- It does not loop during a serious or terminal result.

## Future Expansion

Achievement animation, sticker motion, social reactions, long cinematic transitions, and character-specific tutorial performances are future work.

## Open Product Decisions

- Final duration and frame timing for the existing landing sequence.
- Whether fast-forward shows each month or only milestone months.
- Final Sprout bankruptcy and celebration performances after assets exist.
- Whether event severity changes the interruption motion or only visual styling.
