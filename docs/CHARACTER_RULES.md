# Life Finance Character Rules

## Document Control

- Status: Sprout rules approved; full-cast rules defined; non-Sprout references pending
- Approval authority: Product and character art leads
- Last updated: 2026-07-15

## Purpose

This document preserves Sprout's immutable canonical rules and defines consistency requirements for Penny, Froggy, Richie, Buddi, and GM Pengo.

No generated pose, expression, costume, or export becomes canonical without review against this document.

## Canonical References

| Character | Master Reference | Status |
| --- | --- | --- |
| Sprout | `/public/assets/characters/sprout/reference/sprout-main.png` | Approved canonical reference; never overwrite |
| Penny | `/public/assets/characters/penny/reference/penny-main.png` | Missing; not yet visually canonical |
| Froggy | `/public/assets/characters/froggy/reference/froggy-main.png` | Missing; not yet visually canonical |
| Richie | `/public/assets/characters/richie/reference/richie-main.png` | Missing; not yet visually canonical |
| Buddi | `/public/assets/characters/buddi/reference/buddi-main.png` | Missing; not yet visually canonical |
| GM Pengo | `/public/assets/characters/gm-pengo/reference/gm-pengo-main.png` | Missing; not yet visually canonical |

## Sprout Character Identity

- Name: Sprout, temporary name pending final approval.
- Role: Mascot of Life Finance.
- Purpose: Guide players through their financial journey while making finance feel playful instead of stressful.

### Sprout Personality

Sprout is cute, dumb, overconfident, wholesome, slightly chaotic, memeable, never evil, and surprisingly lucky.

## Immutable Sprout Design Rules

The following traits cannot change between Sprout assets:

- Body proportions.
- Body silhouette.
- Leaf shape.
- Beak.
- Eyes.
- Feet.
- Material.
- Lighting direction.
- Camera angle.
- Rendering style.

Reject any future Sprout asset that changes one of these traits without an approved canonical revision.

The canonical `sprout-main.png` reference is the source of truth when written measurements are not yet documented.

## Sprout Rendering Style

Sprout should always look like a Pixar or Nintendo-inspired modern 3D illustration: glossy, softly lit, toy-like, and suitable for a collectible figure.

Never use an anime, flat illustration, realistic animal, low-poly, pixel-art, or vector treatment for canonical Sprout art.

## Sprout Animation Rules

Sprout movement should use squash, bounce, anticipation, tiny idle breathing, and expressive timing.

Sprout must never move mechanically or robotically.

Serious states such as bankruptcy should settle into stillness rather than loop a joke or exaggerated reaction.

## Sprout Asset Rules

Every new Sprout image must remain immediately recognizable and preserve the same proportions, lighting, material, camera angle, and rendering treatment.

Standalone Sprout assets require transparent backgrounds.

PNG is allowed for canonical masters and archival source images.

WebP is preferred for approved runtime exports.

Do not overwrite `sprout-main.png`.

New assets derive from the canonical image and belong in the appropriate asset-library folder.

`sprout-money.png` is an approved money-gun variant and does not replace the canonical reference.

## Shared Full-Cast Rendering Rules

### Rendering Family

All cast members must belong to the same modern 3D, glossy, softly lit, toy-like visual world as Sprout.

Species, clothing, props, and silhouette may differ, but rendering technology and finish must feel shared.

Do not mix flat icons, realistic animals, pixel art, low-poly models, or unrelated illustration styles into canonical character art.

### Material and Surface

- Use a consistent soft collectible-figure material response.
- Preserve tactile detail without making skin, feathers, fabric, or accessories photorealistic.
- Match Sprout's general gloss and softness unless a specific material requires a reviewed variation.
- Avoid noisy texture that disappears or flickers at UI size.

### Lighting

- Match the direction, softness, contrast, and warmth of the approved Sprout reference.
- Keep facial features readable at small card sizes.
- Avoid dramatic under-lighting, hard horror shadows, or unrelated colored stage lighting.
- Use one coherent light environment when multiple characters share a composition.

### Camera and Perspective

- Match the approved camera family and perspective of the canonical cast references.
- Use consistent eye-level and three-quarter presentation for equivalent UI poses.
- Do not change lens character to make one character look photorealistic or distorted.
- Record any approved full-body, close-up, or profile camera variant before producing a set.

### Scale and Framing

- Define a relative cast scale chart after all canonical references exist.
- Preserve each character's approved proportions across poses.
- Use consistent visual size and baseline alignment in equivalent character cards.
- Do not enlarge a character's head, eyes, limbs, or props to force a new expression.
- Keep important silhouettes inside safe crop boundaries.

### Eyes, Mouths, and Expression Language

- Keep facial features simple, readable, and compatible with the shared toy-like world.
- Lock each character's eye, mouth, beak, or muzzle construction in its canonical reference.
- Create emotion through brows, eyelids, mouth, pose, and squash without replacing identifying features.
- Avoid human-realistic teeth, uncanny eyes, or expression changes that alter species identity.

### Props and Costumes

- Props support a documented gameplay role or event.
- Props must not cover the character's face, primary silhouette, or identifying features.
- Financial props should feel playful but must not introduce unsupported product claims or branding.
- Costumes and props are variants, not replacements for the canonical base design.
- Record recurring props in the character asset README before producing multiple poses.

### Background and Shadow

- Standalone assets use transparent backgrounds.
- Contact shadows may be included only when they work on the documented surface and do not create a visible rectangle.
- Scene lighting and character lighting must agree.
- Do not bake a full background into a character pose that must be animated or reused responsively.

## Character-Specific Identity Locks

Sprout's locks are already defined above.

Before Penny, Froggy, Richie, Buddi, or GM Pengo receives derivative assets, each canonical reference must lock:

- Body proportions.
- Silhouette.
- Species-defining features.
- Face and eyes.
- Hands, feet, wings, or flippers.
- Primary colors.
- Material treatment.
- Default clothing or accessories.
- Camera angle.
- Lighting direction.
- Relative scale.

Until those locks are approved, placeholders may communicate role but must not be treated as final character design.

## MVP Pose Consistency

Each non-Sprout character needs only one approved MVP pose before implementation replaces its placeholder:

- Penny: planning.
- Froggy: emergency fund.
- Richie: speculative pitch.
- Buddi: encouragement.
- GM Pengo: event host.

The first approved pose should derive from a canonical reference rather than becoming the only source of identity by accident.

Sprout may reuse the canonical image for unavailable reaction states until the bankruptcy and celebration assets are approved.

## Cross-Character Composition Rules

- Use one leading character per card, modal, or screen section.
- Add a second character only for a documented narrative handoff.
- Match lighting, ground plane, camera, and visual scale when characters share a scene.
- Do not combine characters from different render passes without color and shadow review.
- Keep dialogue ownership clear when two characters appear together.
- Do not place the entire cast on a screen as decoration.

## Character Motion Rules

- Use squash, anticipation, follow-through, breathing, and expressive holds.
- Preserve mass and approved proportions throughout movement.
- Let species traits influence secondary motion without becoming a different animation style.
- Avoid robotic timing, constant bobbing, and independent looping parts that distract from decisions.
- Provide static reduced-motion poses for every animated state.

## Technical Asset Rules

- Use lowercase kebab-case filenames.
- Use transparent WebP for runtime standalone art when quality is acceptable.
- Keep PNG canonical masters in `reference/`.
- Keep reference, pose, expression, prop, UI, scene, and export files in distinct folders.
- Reserve layout space to prevent character-loading shifts.
- Verify alpha edges against both light and dark surfaces.
- Record canonical status and approval before replacing an existing reference.

## Character Review Checklist

- The asset has a documented MVP use.
- The character is immediately recognizable against its canonical reference.
- Immutable proportions and silhouette are preserved.
- Species-defining face, eyes, hands, and feet are preserved.
- Material, lighting, camera, and rendering style match the cast.
- Props and costume do not hide identity.
- The crop works at the intended screen size.
- Standalone art has a transparent background.
- Motion has a reduced-motion equivalent when applicable.
- The asset filename and folder are correct.
- Approval status is recorded.

## Change Control

Canonical references are immutable runtime history and must never be overwritten in place.

An approved identity change requires a new master, a documented rationale, an explicit supersession note, and review of every dependent runtime asset.

Do not silently regenerate a character set after changing a prompt, model, renderer, camera, or light setup.

## Future Expansion

Additional poses, costumes, expressions, stickers, achievements, social art, and scenario-specific variants may be added after the MVP pose set is approved.

Future variation must preserve each character's locked identity.

## Open Product Decisions

- Final canonical designs for Penny, Froggy, Richie, Buddi, and GM Pengo.
- Relative cast scale chart.
- Exact numeric camera, lighting, and safe-crop specifications.
- Whether shared character shadows are baked into exports or rendered by the interface.
- Whether Sprout's temporary name becomes permanent.
