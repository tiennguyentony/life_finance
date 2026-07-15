# Landing Title Screen Design QA

## Comparison Target

- Source visual truth: `/var/folders/bb/qf25my3d1bs5ntj5m4w4h3bw0000gn/T/clipboard-2026-07-14-174223-C11D6628.png`
- Implementation screenshot: `/private/tmp/life-finance-landing.png`
- Viewport: 1536 x 1024 CSS pixels
- State: initial landing title screen before Play is selected

## Full-view Comparison Evidence

The source and implementation were opened together at the same 1536 x 1024 viewport. The implementation preserves the source image as one full-bleed asset, so composition, typography, colors, illustration, signs, logo, mascot, and copy align with the source without reconstructed UI drift.

## Required Fidelity Surfaces

- Fonts and typography: passed. All title-screen typography remains part of the supplied source artwork, preserving family, weight, spacing, hierarchy, and wrapping.
- Spacing and layout rhythm: passed. The artwork fills the full viewport at the source 3:2 ratio with no header, frame, margin, cropping, or added interface regions.
- Colors and visual tokens: passed. The implementation renders the supplied RGB PNG directly with no CSS tint, overlay, or gradient.
- Image quality and asset fidelity: passed. The supplied PNG is used directly with Next.js image recompression disabled.
- Copy and content: passed. Logo, tagline, Play label, signpost labels, and three feature captions are unchanged.

## Focused Region Comparison Evidence

The painted Play button occupies approximately x=37.6% to 61.0% and y=81.6% to 90.1% of the source. The accessible link hit target now matches those bounds and remains visually transparent until hover or keyboard focus. No other focused crop was needed because every visible title-screen element is part of the exact source raster and was legible in the full-resolution comparison.

## Comparison History

### Iteration 1

- [P2] The first interactive Play hit target extended beyond the painted button.
- [P2] The title-screen asset still passed through the default Next.js image optimization path.

Fixes made:

- Tightened the hit target to the measured painted-button bounds.
- Disabled image recompression for the supplied title-screen PNG.

### Iteration 2

The revised 1536 x 1024 capture matches the source visual, the Play interaction opens `/start`, the complete frontend flow still reaches the persisted post-event dashboard, and the browser console contains no errors or warnings.

## Findings

No actionable P0, P1, or P2 differences remain.

## Follow-up Polish

- [P3] Add alternate art-directed crops if the title screen later needs dedicated narrow-mobile artwork.

final result: passed
