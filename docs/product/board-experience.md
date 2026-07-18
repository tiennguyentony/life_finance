# Board experience

The 3D board at `/board` is the end-product gameplay interface. Its scene composition, islands, path, Sprout character, dice, HUD placement, camera, colors, motion, and assets are canonical and should be evolved in place rather than replaced with another dashboard.

## Player flow

1. `/start` selects a persona.
2. `/profile` collects the minimal profile.
3. `/generating` reviews the profile and creates a backend run.
4. The browser receives the run cookie and navigates to `/board`.
5. `Move` submits one `process_month` command.
6. The board updates its HUD from the returned `RunView` and animates Sprout along the path.
7. When an event is pending, the event decision overlay blocks movement until a choice is resolved.

Visiting `/board` without a valid session redirects to `/start`.

## UI data ownership

`board-model.ts` is the adapter from `RunView` to display values. The HUD currently derives cash, net worth, debt, month/year, goal progress, level/XP, event badge, and completed trophies from backend state.

Board components must not contain fallback financial fixtures. Loading, empty-session, and API-error states should remain explicit.

## Board modes

- `/board` uses the product loop path.
- `/board/free` uses the same scene and backend state but permits direct island travel for development and review.

## Accessibility and performance

- Preserve keyboard-accessible controls and semantic dialog behavior for decisions.
- Honor reduced-motion behavior when changing animation.
- Keep the HUD readable independently of the WebGL scene.
- Avoid remounting the full canvas for ordinary API state updates.
