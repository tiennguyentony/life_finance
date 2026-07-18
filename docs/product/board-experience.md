# Board experience

The 3D board at `/board` is the end-product gameplay interface. Its scene composition, islands, Sprout character, HUD placement, camera, colors, motion, and assets are canonical and should be evolved in place rather than replaced with another dashboard. The canonical board is strategy-first: it has no tile traversal or die mechanic.

## Player flow

After `/start`, `/profile`, and `/generating` create an authoritative run, the browser receives the run cookie and navigates to `/board`. Each board turn follows this loop:

1. Choose one of the five financial focus locations.
2. Review two or three engine-backed plans and their immediate trade-offs.
3. Select one plan and choose **Live this month**.
4. The board submits the plan, then advances exactly one month.
5. Review authoritative cash, net-worth, debt, and goal-progress changes.
6. Resolve any life event before planning the next month.

Each turn contains one plan followed by exactly one month. The authoritative before-and-after result is shown before an event decision, and an event must be resolved before the next planning turn is available.

Visiting `/board` without a valid session redirects to `/start`.

## UI data ownership

`board-model.ts` is the adapter from `RunView` to display values. The HUD currently derives cash, net worth, debt, month/year, goal progress, level/XP, event badge, and completed trophies from backend state.

Board components must not contain fallback financial fixtures. Loading, empty-session, and API-error states should remain explicit.

## Board modes

- `/board` is the canonical strategy-first product loop. It does not use tile traversal, automatic hopping, or a die mechanic.
- `/board/free` uses the same scene and backend state but permits direct island travel for development and review.

## Accessibility and performance

- Preserve keyboard-accessible controls and semantic dialog behavior for decisions.
- Honor reduced-motion behavior when changing animation.
- Keep the HUD readable independently of the WebGL scene.
- Avoid remounting the full canvas for ordinary API state updates.
