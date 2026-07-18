# Static data boundary

This directory contains immutable catalogs consumed by gameplay and education. Mutable player/run state never belongs here.

## Active files

- `scenario-catalog.ts`: versioned US locations, careers, costs, benefits, instruments, and scenario snapshots used by onboarding/runtime.
- `personal-event-templates-v2.ts`: the four active schema-2 declarative event templates.
- `event-experience.ts`: player-facing presentation metadata for active events.
- `upskill-programs.ts`: certificate, bootcamp, and degree definitions used by the board and core.
- `education-content.ts`: lesson content implemented for teaching modules but not mounted in the current board.
- `onboarding-localization-v1.ts`: onboarding review messages.
- `balance-lab-personas-v1.ts`: simulation-lab fixtures, not selectable product personas.
- `event-templates.ts`: legacy event catalog retained for compatibility/tests; it is not the active schema-2 catalog.

## Rules

- Keep provenance/effective dates beside real-world values.
- Version every catalog that affects deterministic outcomes.
- Validate imported data at module load or a trusted boundary.
- Snapshot resolved scenario data and its checksum into each run; replay must not re-resolve against a newer catalog.
- Distinguish educational assumptions from statutory values.
- Do not add placeholders merely to make a product surface appear complete.
