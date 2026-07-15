# Layered Landing Screen Design QA

## Comparison Target

- Source visual truth: `/var/folders/bb/qf25my3d1bs5ntj5m4w4h3bw0000gn/T/clipboard-2026-07-14-230447-811AABBC.png`
- Primary implementation screenshot: `/private/tmp/life-finance-landing.png`
- Animation screenshots: `/private/tmp/life-finance-landing-frame-2.png`, `/private/tmp/life-finance-landing-frame-3.png`, and `/private/tmp/life-finance-landing-frame-4.png`
- Viewport: 1536 x 1024 CSS pixels
- State: initial landing screen before Play is selected

## Full-view Comparison Evidence

The source and implementation were opened together at the same 1536 x 1024 viewport. The implementation follows the source composition with a warm rounded stage, top-left Life Finance identity, top-right account actions, left navigation rail, oversized central Sprout, lower Play action, character selector, and lower-right challenge card.

The supplied clean background and four transparent Sprout images are rendered as independent layers. This intentionally replaces the prior single-image title screen so the character can animate and respond to hover.

## Required Fidelity Surfaces

- Fonts and typography: passed. The implementation uses the existing rounded display stack, heavy dark title text, compact uppercase utility labels, and large Play lettering aligned with the reference hierarchy.
- Spacing and layout rhythm: passed. The outer frame, top actions, central character, Play action, lower widgets, and side rail preserve the reference proportions at the desktop target viewport.
- Colors and visual tokens: passed. The supplied warm background defines the palette, while cream controls, dark navy actions, yellow Play, and purple challenge accents align with the reference.
- Image quality and asset fidelity: passed. The supplied 1535 x 1024 background and all four transparent Sprout PNGs are used directly without recompression or synthetic substitutes.
- Copy and content: passed. Life Finance, Log in, Start, Play, challenge copy, month target, and navigation labels are concise and consistent with the reference.

## Focused Region Comparison Evidence

The central character region was checked across all four animation captures. Every supplied Sprout pose remains fully visible, grounded above the Play button, and clear of the top controls. The Play button retains a large accessible target and visible hover, focus, and pressed states.

The supplied Sprout animation frames do not include the reference sunglasses or a held money bag. The clean background supplies the money bag, while the animation intentionally uses the approved transparent poses as provided.

## Interaction Verification

- The landing animation advanced through frames 1, 2, 3, and 4 in order.
- Hovering Sprout applied the independent character drop shadow and scale response.
- Selecting Play opened `/start` and preserved the complete persona-to-event flow.
- Reloading the post-event dashboard preserved `$1,440` cash and `AUG 2026`.
- Browser console errors and warnings: none.
- Reduced motion: the cycle and float stop, and frame 1 remains visible.

## Comparison History

### Iteration 1

- [P1] The prior implementation was a single baked title-screen image, so Sprout could not animate independently.
- [P2] The first layered capture rendered Sprout smaller than the reference hero scale.

Fixes made:

- Replaced the baked title-screen image with the supplied clean background.
- Added all four transparent Sprout images as independently animated layers.
- Increased the character stage and raised the Play button to match the source hierarchy.
- Added real top actions, navigation, character selection, challenge progress, and Play controls.

### Iteration 2

The revised capture preserves the reference game-title composition while supporting real character animation, hover response, keyboard focus, responsive behavior, and reduced motion.

## Findings

No actionable P0, P1, or P2 differences remain within the supplied asset set.

## Follow-up Polish

- [P3] Add a transparent sunglasses pose if that exact accessory needs to persist during the animation.
- [P3] Add dedicated graphic assets for the side-rail symbols if they become interactive destinations.

final result: passed
