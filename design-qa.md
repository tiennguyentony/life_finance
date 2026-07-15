# Cohesive Sprout Landing Design QA

## Comparison Target

- Source visual truth: `/var/folders/bb/qf25my3d1bs5ntj5m4w4h3bw0000gn/T/clipboard-2026-07-14-230447-811AABBC.png`
- Primary implementation screenshot: `/private/tmp/life-finance-landing.png`
- Stable action screenshots: `/private/tmp/life-finance-landing-frame-2.png`, `/private/tmp/life-finance-landing-frame-3.png`, and `/private/tmp/life-finance-landing-frame-4.png`
- Handoff screenshot: `/private/tmp/life-finance-landing-transition.png`
- Large desktop screenshot: `/private/tmp/life-finance-landing-2048.png`
- Viewport: 1536 x 1024 CSS pixels
- State: landing screen before Play is selected

## Full-view Comparison Evidence

The source and implementation were opened together at the same 1536 x 1024 viewport. The implementation retains the warm rounded scene, top-left identity, top-right actions, left navigation, central Sprout, and lower Play action.

The latest user direction intentionally removes the lower character strip and challenge card from the source composition. Their removal gives Sprout and Play one clear focal hierarchy and eliminates the carousel metaphor.

The 2048 x 1280 capture matching the user's reported desktop size keeps the full Play button inside the viewport and preserves the same character-to-background scale.

## Focused Region Comparison Evidence

All four stable action captures and the midpoint handoff capture were reviewed. The source PNGs have different canvas sizes, alpha bounds, visual centers, and foot positions. Per-pose translation and scale corrections now keep Sprout's face near one anchor and feet on one table plane across the loop.

At the measured handoff point, adjacent actions each render at 0.5 opacity and total character opacity remains 1. The face, torso, feet, and money gun overlap closely enough that the 72 ms handoff reads as one animated performance rather than a long dissolve between separate slides.

## Required Fidelity Surfaces

- Fonts and typography: passed. Existing rounded display typography, compact navigation labels, and Play hierarchy remain consistent.
- Spacing and layout rhythm: passed. Sprout no longer overfills the viewport, the feet align with the foreground plane, and Play has a clear gap below the character.
- Colors and visual tokens: passed. A restrained warm color grade and softer silhouette shadow bring the character closer to the background lighting without changing the approved assets.
- Image quality and asset fidelity: passed. The four approved transparent PNGs remain untouched and render without recompression.
- Copy and content: passed. The requested challenge and carousel copy are removed; the remaining controls are concise and functional.

## Interaction Verification

- The loop advanced through money burst, victory bounce, confident reset, and lucky finale in order.
- Each act uses anticipation, subtle squash, rebound, and a short handoff at the motion apex.
- Hovering Sprout applies a subtle independent response.
- Reduced motion stops the loop and preserves the first action.
- Selecting Play still completes the persona, profile, decision, event, and persisted dashboard flow.
- Browser console errors and warnings: none.

## Comparison History

### Iteration 1

- [P1] Sprout was baked into a single title-screen image and could not move independently.

Fix: split the background and character into independent source assets.

### Iteration 2

- [P1] The four stills read as a carousel because they used equal boxes, long fades, and visible thumbnail chrome.
- [P1] Sprout was oversized and floated over the set because the poses had unmatched internal geometry and no shared ground plane.
- [P2] The lower challenge card competed with Play and was no longer wanted.

Fixes:

- Removed the character strip and challenge card.
- Measured every alpha bound and assigned per-pose scale and translation corrections.
- Anchored all faces and feet to stable screen positions.
- Replaced the equal slideshow cycle with four named acts using anticipation, squash, rebound, and 72 ms handoffs.
- Added restrained warmth, saturation control, and silhouette shadow to match the scene lighting.

### Iteration 3

The revised full-view, all four stable actions, and midpoint handoff were recaptured. No actionable P0, P1, or P2 visual differences remain under the latest user direction.

## Follow-up Polish

- [P3] True limb-by-limb interpolation would require a purpose-built frame sequence or rigged animation source. The current loop uses the four approved raster actions and makes their handoffs visually continuous without changing the canonical artwork.

final result: passed
