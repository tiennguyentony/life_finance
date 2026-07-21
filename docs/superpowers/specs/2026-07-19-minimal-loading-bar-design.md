# Minimal Loading Bar Transition Design

## Goal

Replace the existing Sprout loading demo with a minimal, record-ready loading-bar transition. The screen contains one animated bar on a white background and nothing else.

## Scope

- Keep the existing demo route at `/demo/loading-screen`.
- Keep the exact two-second loop and 16:9 recording target.
- Remove Sprout, financial numbers, the grid, and the blue background wash.
- Keep one word of text: `LOADING`, centred above the bar. Added after the
  first pass, which removed all text; everything else stays sparse.
- Do not change the functional onboarding generator or board flow.
- Do not add controls, navigation, sound, data fetching, timers, or dependencies.

## Visual Design

- Full-screen background: existing board `--white` token.
- Bar position: centered horizontally and vertically.
- Track: existing `--paper-deep` fill, 3-pixel `--ink` outline, fully rounded ends, and the board's hard offset shadow.
- Progress fill: existing `--lime` token.
- Primary width: 520 pixels at 1920 by 1080, capped responsively so it remains visible on smaller screens.
- Label: the word `LOADING` in uppercase `--ink`, letterspaced, sitting directly above the bar.
- No character artwork, icons, patterns, or other decorative elements.

The result is intentionally sparse while retaining the same color, outline, radius, and shadow language as the main board.

## Motion

The lime fill grows from 0 percent to 100 percent over exactly 2000 milliseconds. It resets at the loop boundary and repeats infinitely. Only the fill's horizontal transform is animated; the white canvas and track remain still.

## Accessibility

- The bar is exposed as a progress indicator, named by the visible `LOADING` text via `aria-labelledby` rather than a duplicate `aria-label`.
- Decorative inner elements remain hidden from assistive technology.
- Reduced-motion mode disables the loop and displays a stable partially filled bar.
- The route fills `100dvh` and clips overflow so recording never captures scrollbars.

## Implementation Shape

- Simplify the existing transition component to one progress-bar structure.
- Replace the current demo stylesheet with the minimal centered composition and one keyframe animation.
- Keep the route and existing stylesheet import path unchanged.
- Update the focused component and stylesheet tests to assert the reduced markup and board-token styling.

## Verification

- Confirm the route displays only the loading bar on the white background.
- Confirm the computed loop duration is exactly two seconds.
- Confirm no Sprout image, text, grid, number tag, or blue wash remains.
- Confirm the bar is centered at 1920 by 1080 and remains usable at a smaller landscape viewport.
- Confirm reduced-motion mode displays a static bar.
- Run focused tests, lint, type checking, and a production build.
