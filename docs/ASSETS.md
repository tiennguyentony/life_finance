# Big City Survivor MVP Asset Checklist

## Document Control

- Status: Focused MVP specification
- Last updated: 2026-07-15

## Purpose

This document records the assets that exist, the assets missing for the Big City Survivor MVP, where each asset is used, and what may use a temporary fallback.

## Status Definitions

- Approved: Existing asset may be used as a product reference or final runtime asset.
- Existing: File exists but may still need final placement, optimization, or review.
- Missing P0: Required character identity or terminal-state asset for final MVP quality.
- Missing P1: Important supporting asset that may use a temporary static or UI fallback during implementation.
- Deferred: Not required for the focused MVP.

## Existing Assets

| Asset | Screen Use | Priority | Production Status | Filename | Current Path |
| --- | --- | --- | --- | --- | --- |
| Landing background | Landing | P0 | Approved existing asset | `landing-background.png` | `/public/assets/game/landing-background.png` |
| Sprout canonical main reference | Character source of truth and static fallback | P0 | Approved canonical reference | `sprout-main.png` | `/public/assets/characters/sprout/reference/sprout-main.png` |
| Sprout money-gun variant | Landing or confident reaction where appropriate | P1 | Approved variant | `sprout-money.png` | `/public/assets/characters/sprout/reference/sprout-money.png` |
| Sprout landing frame 1 | Landing idle sequence | P0 | Existing landing frame | `sprout-landing-1.png` | `/public/assets/characters/sprout/reference/sprout-landing-1.png` |
| Sprout landing frame 2 | Landing idle sequence | P0 | Existing landing frame | `sprout-landing-2.png` | `/public/assets/characters/sprout/reference/sprout-landing-2.png` |
| Sprout landing frame 3 | Landing idle sequence | P0 | Existing landing frame | `sprout-landing-3.png` | `/public/assets/characters/sprout/reference/sprout-landing-3.png` |
| Sprout landing frame 4 | Landing idle sequence | P0 | Existing landing frame | `sprout-landing-4.png` | `/public/assets/characters/sprout/reference/sprout-landing-4.png` |
| Sprout color reference | Future Sprout asset review | P0 | Existing generated reference | `palette.png` | `/public/assets/characters/sprout/reference/palette.png` |

## Missing Character Assets

| Asset | Screen Use | Priority | Production Status | Filename | Recommended Path |
| --- | --- | --- | --- | --- | --- |
| Sprout neutral UI export | Main simulation and generic consequence fallback | P0 | Missing export; canonical PNG may be used temporarily | `idle.webp` | `/public/assets/characters/sprout/ui/idle.webp` |
| Sprout shocked reaction | Layoff and harmful consequence | P1 | Missing; reuse canonical image temporarily | `shocked.webp` | `/public/assets/characters/sprout/expressions/shocked.webp` |
| Sprout bankruptcy reaction | Bankruptcy Screen | P0 | Missing | `bankruptcy.webp` | `/public/assets/characters/sprout/ui/bankruptcy.webp` |
| Sprout success celebration | Scenario Success Report | P0 | Missing | `celebrating.webp` | `/public/assets/characters/sprout/ui/celebrating.webp` |
| Penny canonical reference | Cast approval and all Penny derivatives | P0 | Missing | `penny-main.png` | `/public/assets/characters/penny/reference/penny-main.png` |
| Penny planning pose | Start Method, profile, preset, strategy | P0 | Missing | `planning.webp` | `/public/assets/characters/penny/poses/planning.webp` |
| Froggy canonical reference | Cast approval and all Froggy derivatives | P0 | Missing | `froggy-main.png` | `/public/assets/characters/froggy/reference/froggy-main.png` |
| Froggy emergency-fund pose | Starting State Review and safety allocation | P0 | Missing | `emergency-fund.webp` | `/public/assets/characters/froggy/poses/emergency-fund.webp` |
| Richie canonical reference | Cast approval and all Richie derivatives | P0 | Missing | `richie-main.png` | `/public/assets/characters/richie/reference/richie-main.png` |
| Richie speculative pitch pose | Strategy and Rocket Token FOMO | P0 | Missing | `speculative-pitch.webp` | `/public/assets/characters/richie/poses/speculative-pitch.webp` |
| Buddi canonical reference | Cast approval and all Buddi derivatives | P0 | Missing | `buddi-main.png` | `/public/assets/characters/buddi/reference/buddi-main.png` |
| Buddi encouragement pose | Checkpoint, bankruptcy lesson, retry, final report | P0 | Missing | `encouragement.webp` | `/public/assets/characters/buddi/poses/encouragement.webp` |
| GM Pengo canonical reference | Cast approval and all GM Pengo derivatives | P0 | Missing | `gm-pengo-main.png` | `/public/assets/characters/gm-pengo/reference/gm-pengo-main.png` |
| GM Pengo event-host pose | Event Interruption and Decision Selection | P0 | Missing | `event-host.webp` | `/public/assets/characters/gm-pengo/poses/event-host.webp` |

## Missing Scenario and Event Assets

| Asset | Screen Use | Priority | Production Status | Filename | Recommended Path |
| --- | --- | --- | --- | --- | --- |
| Big City Survivor preset art | Start Method and Preset Preview | P1 | Missing; use data-led card with Sprout fallback | `big-city-survivor.webp` | `/public/assets/game/scenarios/big-city-survivor.webp` |
| Small-cost warning icon | The Small Stuff Multiplies | P1 | Missing; use UI icon fallback | `small-cost-warning.webp` | `/public/assets/game/events/small-cost-warning.webp` |
| Rent notice icon | Rent Renewal Shock | P1 | Missing; use UI icon fallback | `rent-renewal.webp` | `/public/assets/game/events/rent-renewal.webp` |
| Speculative token prop | Rocket Token FOMO | P1 | Missing; Richie's prop may cover this need | `rocket-token.webp` | `/public/assets/game/events/rocket-token.webp` |
| Layoff notice icon | Surprise Calendar Invite | P1 | Missing; use event-card typography fallback | `layoff-notice.webp` | `/public/assets/game/events/layoff-notice.webp` |
| Recovery offer icon | The Recovery Offer | P1 | Missing; use UI icon fallback | `recovery-offer.webp` | `/public/assets/game/events/recovery-offer.webp` |
| Bankruptcy result backdrop | Bankruptcy Screen | P1 | Missing; use design-system danger surface | `bankruptcy-backdrop.webp` | `/public/assets/game/outcomes/bankruptcy-backdrop.webp` |
| Success result backdrop | Scenario Success Report | P1 | Missing; reuse landing environment or CSS treatment | `scenario-success-backdrop.webp` | `/public/assets/game/outcomes/scenario-success-backdrop.webp` |

## Interface Asset Needs

The following items should be implemented as reusable interface components or an approved icon set rather than baked image assets:

- Net-worth chart.
- Cash-runway meter.
- Monthly cash-flow indicator.
- Assets and liabilities icons.
- Lifestyle or happiness meter.
- Vulnerability indicator.
- Macro news marker.
- Fast-forward control.
- Strategy control.
- Attempt counter.
- Before-and-after stat treatment.
- Character card frame.
- Event card frame.
- Danger, warning, protected, and success labels.

No standalone filename is required for these items unless the design system later selects custom icons.

## Minimum Asset Set for Implementation Start

Frontend implementation may begin with:

- Existing landing background.
- Existing Sprout canonical and landing assets.
- Static labeled placeholders for Penny, Froggy, Richie, Buddi, and GM Pengo.
- Reusable UI icons for event illustrations.
- CSS-based character cards, event cards, charts, meters, and outcome surfaces.

Missing character art must not block state flow, accessibility, loading states, error states, or backend integration.

## Minimum Asset Set for MVP Presentation Approval

Before the MVP is considered visually complete, it should have:

- One approved canonical reference for each cast member.
- One required MVP pose for Penny, Froggy, Richie, Buddi, and GM Pengo.
- Sprout bankruptcy and success assets.
- A reviewed landing export sequence.
- A coherent Big City Survivor preset card.
- A consistent event icon or illustration for each of the five authored beats.

## Directory Structure

```text
public/assets/
  characters/
    sprout/
      reference/
      expressions/
      poses/
      props/
      scenes/
      ui/
      stickers/
      exports/
    penny/
      reference/
      poses/
      ui/
    froggy/
      reference/
      poses/
      ui/
    richie/
      reference/
      poses/
      props/
      ui/
    buddi/
      reference/
      poses/
      ui/
    gm-pengo/
      reference/
      poses/
      ui/
  game/
    scenarios/
    events/
    outcomes/
```

Create character folders only when the first approved asset for that character is added.

Do not add empty folder trees preemptively.

## Naming Convention

- Use lowercase kebab-case filenames.
- Name the visual role, not an implementation version.
- Use one visual idea per file.
- Use PNG for canonical masters and WebP for approved runtime exports.
- Use transparent backgrounds for standalone characters, props, and event illustrations.
- Keep scene backgrounds separate from characters when animation or responsive composition requires layers.

## Source and Canonical Rules

- `sprout-main.png` is the canonical Sprout reference and must never be overwritten.
- `sprout-money.png` is an approved variant, not a replacement canonical reference.
- New cast members require one approved canonical reference before derivative poses become canonical.
- Generated or placeholder images are not canonical until reviewed and recorded.
- Runtime optimization must produce a derivative file rather than modify a canonical master.

## Export and Review Workflow

1. Review the canonical reference against `CHARACTER_RULES.md`.
2. Store the approved master in the character's `reference/` folder.
3. Produce the minimum pose or expression needed by a documented screen.
4. Export a transparent WebP runtime derivative when appropriate.
5. Verify framing, lighting, scale, alpha, and filename.
6. Record production status in this checklist.
7. Replace placeholders without changing component contracts or layout ownership.

## Asset Review Checklist

- The asset maps to a documented MVP screen or event.
- The filename and folder follow the convention.
- The character matches its canonical reference.
- Standalone art has a transparent background.
- The asset works at the intended UI size.
- Important information does not depend on the illustration.
- The runtime file does not overwrite the canonical master.
- Production status is updated.

## Future Expansion

Stickers, social media art, achievement art, additional financial states, long-form scenes, retirement assets, and age-65 report art are future expansion.

## Open Product Decisions

- Final canonical art for all non-Sprout characters.
- Whether the preset card needs unique scene art or only a compact character composition.
- Whether event art uses full 3D illustrations or smaller toy-like props.
- Runtime size and compression budgets by viewport.
- Final source-file storage outside the runtime repository.
