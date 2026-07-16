# Design

How Life Finance looks, moves, and speaks.
Read PRODUCT.md first; this file describes the system that serves it.

## Direction

A Nintendo-quality toy world over an auditable engine.
Brand surfaces (landing, persona choice, mascot moments) carry warmth through the character art and the display face.
Product surfaces (the play console) stay clarity-first, with tactile feedback instead of decoration.
The engine's receipts are part of the visual language: chips, traces, and reconciled totals are shown proudly, in plain words.

## Color

Tokens live in `src/app/styles/foundation.css`, defined in OKLCH for both themes.
Never hard-code a hex value in a component; every state color has a token.

- Surfaces: `--background`, `--surface`, `--surface-strong`, `--surface-sunken`
- Ink: `--text`, `--muted` (>= 4.5:1 on surfaces), `--faint` (secondary meta)
- Lines: `--line`, `--line-strong`
- Brand: `--accent` (interactive, text-capable), `--accent-soft` (tints), `--accent-bright` (Sprout leaf, decorative fills only), `--gold` / `--gold-deep` (milestones, grades)
- States: `--danger(-soft)`, `--warning(-soft)`, `--info(-soft)`, plus `--positive` / `--negative` for money tones
- Money tones always pair color with an explicit `+` / `-` sign; color never carries meaning alone

Strategy is Restrained on product surfaces with one Committed moment per page at most (the engine capability card, the event panel wash).

## Typography

- Display: Baloo 2 (`--font-display` via next/font), weights 500-700.
  Used for headings, the brand mark, and hero numerals only. Never labels, buttons, body, or data.
- Body and data: `--font-body` system stack.
- Fixed rem scale on product surfaces: `--text-xs` through `--text-3xl`. Fluid `clamp()` sizes are reserved for landing-register display headings.
- Money and metrics use `font-variant-numeric: tabular-nums` (`.tnum` or per-rule) so digits do not jitter.
- Display letter-spacing floor is -0.02em; body stays at 0.

## Shape and elevation

- Radius scale: `--radius-xs` 6, `--radius-sm` 10 (controls), `--radius` 16, `--radius-lg` 24 (panels, cards), `--radius-full`.
- Shadows: `--shadow-1/2/3`, layered and hue-tinted in light, deeper and neutral in dark. Panels sit at shadow-2; the event moment earns shadow-3.
- Z-layers: `--z-header`, `--z-sticky`, `--z-overlay`, `--z-toast`. No arbitrary z-index values.

## Motion

Motion conveys state; it is part of the build, not an afterthought.

- Easing: `--ease-out` (strong exponential; entrances, hovers), `--ease-in-out` (on-screen movement), `--ease-spring` (CSS `linear()` under-damped spring; reserved for playful beats like the event card and HUD pop).
- Durations: `--t-tap` 120ms (presses), `--t-quick` 180ms (hovers, tab panels), `--t-move` 260ms (the tab pill), `--t-reveal` 420ms (entrances), `--t-fade` 200ms (opacity-only).
- Entrances use `@starting-style` with distance `--rise` and scale `--pop-scale`; content is visible by default and settles into place.
- Live balances count toward new values (`useAnimatedNumber`); printed records (receipts, checkpoints) never animate.
- Reduced motion is token-driven: durations and distances collapse to zero, `--ease-spring` flattens, infinite loops (working dots, log flash) are disabled explicitly. Comprehension-aiding fades may remain.

## Components

- Buttons: `.btn` with `-primary`, `-quiet`, `-danger`, and `-lg` variants (plus the compact `.nav-cta`). Press = `translateY(1px) scale(0.98)` at `--t-tap`; hover lifts 1px behind a `(hover: hover)` guard; every control has a `:focus-visible` ring from the global rule.
- Chips (`.chip`, `-accent`, `-gold`, `-danger`): small labeled facts such as age, month, step, deltas, tiers. Chips carry data, never decoration.
- Panels: `.play-panel`, display-font `h2`, optional `.panel-sub`. No eyebrow kickers anywhere.
- Tabs: `PlayTabs` implements the ARIA tabs pattern (roving tabindex, arrow keys, Home/End) with a measured sliding pill; falls back to a tinted selected tab before measurement or without JS.
- Options: persona cards and benefit rows are native inputs on tactile rows, selected state via `:has(input:checked)`, focus via `:has(input:focus-visible)`.
- Progress: `.progress-track` with `role="progressbar"`, milestone ticks at 25/50/75, gradient fill, 700ms width ease.
- Empty states teach and carry the mascot (`.empty-state`); errors use `role="alert"`, busy uses `role="status"` with working dots.

## Character art

`src/features/play/persona-art.ts` is the single map from presets to portraits; tests assert every file exists.

- Bengo (wizard penguin) = software developer, Buddi (hoodie helper) = nurse, Froggy (notebook planner) = teacher, Richie (sunglasses chick) = established household.
- Sprout is the mascot: brand moments, onboarding, empty states. Penny (map penguin) guides wayfinding (404).
- Portraits are 1536x1024 masters rendered through next/image with square crops; never ship a raw master at full size.
- The money-room scene (`public/assets/scenes/money-room.png`) is the landing hero art.

## Voice

Plain, warm, candid. Players see "Turn receipt", "Life happens", "Step 21", never "revision", "ppm", or "cents".
Months render as "Mar 2027" via `formatMonthLabel`. Engine authority is expressed in evidence ("trace", "checkpoint", "reconciles"), stated simply.

## Accessibility

WCAG 2.2 AA. Keyboard-complete (tabs pattern, roving focus, visible rings), color-plus-sign money semantics, `prefers-reduced-motion`, `prefers-contrast: more` (stronger lines), and `prefers-reduced-transparency` (solid header) are all honored in the token layer.

## Verifying visually

`/design/preview` (development only, 404 in production) renders onboarding, the pending-event moment, tabs, and the overview in both fixture states, built from real engine factories with no server.
