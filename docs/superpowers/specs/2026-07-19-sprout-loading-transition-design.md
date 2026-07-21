# Sprout Loading Transition Design

## Goal

Create a self-contained, record-ready loading transition for the Life Finance website. The transition runs as an exact two-second loop at a 16:9 landscape aspect ratio and visually belongs to the existing main board experience.

## Scope

- Add a dedicated demo route at `/demo/loading-screen`.
- Do not change the functional onboarding generator or board flow.
- Do not add controls, navigation, a laptop frame, HUD elements, or interactive behavior.
- Reuse the existing Sprout artwork and shared frontend color tokens.
- Keep the transition responsive while composing it primarily for 1920 by 1080 recording.

## Visual Direction

The loading screen is a full-frame transition, not a product interface. It uses the board's warm, playful style:

- `--paper: #f6f1da` for the starting surface and light accents.
- `--ink: #17231c` for outlines, grid marks, and text.
- `--blue: #78cbd1` for the full-screen light wash.
- `--lime: #b8ed4b` for the loading sweep.
- `--coral: #ff7754` and `--gold: #f3c74f` for brief financial-number accents.
- Existing rounded display typography, thick ink outlines, and hard offset shadows.
- Existing Sprout `thinking` treatment using the current character asset.

No new colors or unrelated visual effects are introduced. The grid and numbers remain faint enough that Sprout and the loading message stay dominant.

## Two-Second Sequence

The animation repeats every 2000 milliseconds:

1. **0 to 350 ms:** A board-blue light wash expands from a soft glow across the cream frame.
2. **250 to 800 ms:** A faint ink grid resolves over the blue field.
3. **400 to 1200 ms:** A small set of financial values flickers briefly around Sprout. Values use the existing cream, lime, coral, and gold accents.
4. **700 to 1700 ms:** `SIMULATING FINANCIAL LIFE...` flashes beneath Sprout while a lime loading line sweeps across once.
5. **1700 to 2000 ms:** The grid, values, and message disappear as the blue wash recedes to the opening glow.

The first and final frames share the same cream-and-blue glow so repeated playback does not expose a hard cut.

## Composition

Sprout is centered both horizontally and vertically, with the message placed directly below. Financial values stay near the outer thirds of the frame and never overlap Sprout or the message. The grid fills the viewport and remains decorative. All content is clipped to the viewport so recording never captures scrollbars.

## Implementation Shape

- A server route renders one isolated client animation component.
- CSS keyframes control the deterministic two-second loop.
- The component uses the existing Sprout component and shared CSS variables.
- Demo-specific styles remain scoped to the loading-screen demo classes.
- No data fetching, timers, dependencies, or runtime state are required.

## Accessibility and Recording Behavior

- The status text remains real text with sufficient ink-on-cream contrast.
- Decorative financial values and grid marks are hidden from assistive technology.
- `prefers-reduced-motion` displays a stable blue frame with Sprout and the loading message instead of looping movement.
- The route fills `100dvh`, has no scrollbars, and preserves a 16:9-safe central composition at other viewport sizes.

## Verification

- Confirm the route renders independently without onboarding state.
- Confirm the computed animation duration is exactly two seconds and repeats infinitely.
- Confirm all visible colors reference existing shared tokens.
- Confirm the center composition remains intact at 1920 by 1080 and at a smaller landscape viewport.
- Confirm reduced-motion mode removes the loop while keeping the message readable.
- Run lint, type checking, and a production build after implementation.
