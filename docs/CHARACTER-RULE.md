# Sprout Character Rules

This document defines the immutable design rules for Sprout, the mascot of Life Finance.

## Character Identity

- Name: Sprout (temporary)
- Role: Mascot of Life Finance
- Purpose: Guide players through their financial journey while making finance feel playful instead of stressful.

### Personality

Sprout is cute, dumb, overconfident, wholesome, slightly chaotic, memeable, never evil, and surprisingly lucky.

## Core Design Rules

These rules cannot change between assets. Reject any future asset that changes them:

- Body proportions
- Body silhouette
- Leaf shape
- Beak
- Eyes
- Feet
- Material
- Lighting direction
- Camera angle
- Rendering style

The canonical reference in `public/assets/characters/sprout/reference/hero.png` is the source of truth for these decisions.

## Rendering Style

Sprout should always look like a Pixar or Nintendo-inspired modern 3D illustration: glossy, softly lit, toy-like, and suitable for a collectible figure.

Never use an anime, flat illustration, realistic animal, low-poly, pixel-art, or vector treatment.

## Animation Rules

When animation is eventually introduced, movement should use squash, bounce, anticipation, tiny idle breathing, and expressive timing. It should never feel robotic.

## Asset Rules

Every new image must be immediately recognizable as Sprout and preserve the same proportions, lighting, material, camera angle, and transparent background treatment. PNG masters may retain the approved source presentation; production exports should use transparency whenever the asset is intended to sit on UI or a scene.

Do not overwrite the canonical hero. New assets derive from it and belong in the appropriate asset-library folder.
