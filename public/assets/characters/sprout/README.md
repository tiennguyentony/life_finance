# Sprout Asset Library

This directory is the source-of-truth home for the Life Finance mascot and its future derivatives.

## Folder Guide

- `reference/`: canonical source images and visual reference material. `hero.png` must never be overwritten.
- `expressions/`: facial expressions and emotional variants.
- `poses/`: body positions and action variants.
- `props/`: reusable objects Sprout holds or wears.
- `scenes/`: complete compositions with environments or backgrounds.
- `ui/`: assets prepared for product surfaces such as empty states, errors, and achievements.
- `stickers/`: standalone expressive assets for chat, community, and social use.
- `exports/`: approved delivery files generated from masters for product use.

## Naming Convention

Use lowercase kebab-case names that describe the asset's visual role:

```text
idle.webp
thinking.webp
crying.webp
money-gun.webp
holding-laptop.webp
reading-book.webp
```

Transparent backgrounds are required for standalone assets. WebP is preferred for exports; PNG is allowed for masters and archival source files.

Keep one visual idea per file, avoid version suffixes in the filename, and record meaningful variants in the development log or adjacent README instead of making ambiguous names.
