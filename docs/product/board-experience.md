# Current board and onboarding experience

The 3D board at `/board` is the canonical gameplay surface. It is strategy-first: no die, tile traversal, or automatic hopping controls the simulation.

## Onboarding reality

The UI offers three cards, but backend creation maps them to two authoritative persona drafts:

| UI persona | Backend persona | Starting scenario |
| --- | --- | --- |
| Burnt-out Junior Developer | `software` | Seattle software career, $120,000 salary, $25,000 cash, HSA health plan, renters insurance |
| Debt-free Educator | `teacher` | Chicago teacher, $70,000 salary, $15,000 cash, no starting debt |
| Big City Survivor | `software` | The same current software draft as Junior Developer |

The profile form collects name, age, location, and a free-text goal. In the current adapter, only valid age changes authoritative state by deriving the birth month. Name, entered location, and free-text goal are not yet mapped into run creation; the persona draft still supplies identity/location and the core supplies its default financial-independence goal. Invalid or under-18 age silently falls back to the persona age.

These are known product gaps, not intended game rules. The “Big City Survivor” runway label is UI copy rather than a backend-calculated guarantee.

The current UI uses deterministic typed drafts. `/api/onboarding/parse` supports optional AI-assisted extraction, but no current onboarding screen calls it.

## Turn flow

1. Pick one of five board destinations.
2. Review the plans defined in `src/features/board/plan-catalog.ts`.
3. Select one plan and choose **Live this month**.
4. Submit the plan command when it is not “stay the course.”
5. Submit `process_month` at the next authoritative revision.
6. Compare before/after cash, net worth, debt, and goal progress.
7. If an event is pending, resolve it before another planning turn.

The result dialog is shown before event choice. If the first command succeeds but month processing fails, recovery refreshes the run and retries only the month instead of repeating the plan.

## Exact current plan menu

| Destination | Player choices |
| --- | --- |
| Home | Reduce annual living cost by $1,200; increase it by $1,200; stay the course |
| Bank | Pay up to $500 revolving credit; draw up to $500 available revolving credit; stay the course |
| Financial | Invest exactly $500 into taxable broad-index, sector, or speculative assets |
| Startup | Start certificate ($2,000, 3 months, up to +$3,000 annual salary), bootcamp ($8,000, 6 months, up to +$12,000), or degree ($30,000, 24 months, up to +$24,000) |
| Hospital | Set the recurring-strategy emergency target to 3 or 6 months; stay the course |

Availability checks use the current `RunView` (cash, credit, debt, employment, and programs in progress). The displayed immediate effects are authored in the frontend plan catalog. They are not responses from the implemented internal action-preview engine, which has no active public route. The final monthly result is always calculated by the backend.

## Display ownership

`board-model.ts` maps `RunView` into HUD values. The HUD shows cash, net worth, debt, calendar, financial-independence progress, event status, and outcome-derived trophies. Current level is a presentation derivation from revision, and XP mirrors FI progress; neither is a persisted progression system. The player label is currently presented as “Sprout,” not the profile-form name.

The strategy route intentionally hides several prototype side panels. `/board/free` still contains Goals, Events, Journal, and Menu controls that are placeholders for later milestones.

## Board modes

- `/board`: canonical strategy-first loop with destination selection and plan confirmation.
- `/board/free`: same scene and backend run, with direct island travel for development/review.
- A loop mode exists in component code but has no public page route.

## Accessibility and performance

- Preserve keyboard controls and semantic dialogs.
- Preserve result-to-event focus handoff and reduced-motion behavior.
- Keep critical HUD information readable without relying on the WebGL scene.
- Do not remount the canvas for ordinary `RunView` updates.

## Currently missing from the playable experience

- Editable authoritative name, location, family situation, debts, insurance, health plan, and custom FI target during onboarding.
- A broad life-event library and unscheduled narrative event variety.
- Player-visible tax breakdown and education explaining 401(k), HSA, insurance, debt, and tax decisions.
- Mounted teaching, counterfactual, causal-history, checkpoint, or debrief UI.
- LLM-authored monthly scenarios; the playable pipeline uses deterministic event generation/safety plus a bundled operational-ML ordering artifact.

Core/server modules cover portions of these areas, but they are not player-visible until connected through current contracts and UI.
