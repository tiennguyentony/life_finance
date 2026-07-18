# Strategy-led board demo design

## Goal

Turn the canonical 3D board from an automatic movement loop into a strategy-led monthly life game. The player should choose one meaningful financial focus, understand its immediate trade-off, commit the plan, experience an uncertain month, and receive an understandable consequence summary.

The guiding design question is:

> What meaningful trade-off does the player own this month, and how quickly can the game make its consequence clear and emotionally meaningful?

The demo remains a real run through the current browser API and deterministic engine. It must not introduce frontend financial fixtures or an alternate mock game path.

## Player fantasy

The player is steering a life under uncertainty, not moving a token around a track. Fun comes from forming a plan, anticipating consequences, surviving surprises, and gradually learning which strategies produce resilience and progress.

The experience is approximately 70 percent financial strategy and 30 percent life story. Random events test preparation; they do not replace player agency.

## Scope

This milestone changes the playable `/board` demo and its supporting board projection. It includes:

- a destination-led monthly planning loop;
- real engine-backed actions for the five existing locations;
- an immediate action preview before commitment;
- one deliberate commit flow that applies the action and advances the month;
- an authoritative monthly result summary;
- clearer event choices with concrete amounts when the engine has them;
- a responsive planning and result interface;
- removal of automatic tile-to-tile hopping from the canonical game loop.

The existing deterministic engine, session cookie, command API, persistence boundary, and 3D scene remain authoritative.

## Non-goals

This milestone does not add a new currency, inventory, dice mechanic, multiplayer, a second board implementation, or new financial rules. It does not expose every detailed engine action. It does not redesign onboarding, the landing page, balance policies, or the full teaching system.

The loop-mode track may remain in source temporarily for development compatibility, but `/board` will no longer use it as the product interaction model.

## Core monthly loop

### 1. Orient

The board opens with the current month, the three primary financial stats, goal progress, and a single prompt: **Choose your focus for this month**.

The five locations remain visible simultaneously. Their chips describe the decision category rather than travel flavor.

### 2. Choose a destination

Selecting a location highlights it and opens the monthly planning panel. Selection alone does not mutate the run or advance time.

### 3. Choose one plan

The planning panel offers a maximum of three actions for the selected location. Each card includes:

- a short verb-led label;
- an immediate, deterministic financial effect;
- a plain-language risk or wellbeing implication;
- an unavailable reason when the current run cannot take the action.

Only one plan can be staged per month. The player can change the selected destination or action freely before committing.

### 4. Commit the month

The primary action is **Live this month**. On confirmation, the client:

1. submits the selected real command when the plan has one;
2. uses the returned revision to submit `process_month`;
3. keeps the interface busy until both operations finish or an actionable error appears.

A no-action plan is allowed as **Stay the course** and submits only `process_month`.

### 5. Review consequences

After the authoritative response, a result card compares the opening and ending `RunView` values. It shows:

- cash change;
- net-worth change;
- debt change;
- financial-independence progress change;
- the selected plan;
- the most important plain-language explanation available from the monthly result.

The result card is the emotional payoff of the turn. Sprout may react with a short non-blocking animation or expression, but movement never delays access to the result.

### 6. Resolve interruptions

If the month creates a pending event, the result card appears first and announces that a life decision is waiting. Continuing opens the event decision dialog. Resolving the event returns the player to the next monthly planning state.

## Location actions

The first playable set deliberately reuses commands already accepted by the public API.

| Location | Player purpose | Initial plans |
| --- | --- | --- |
| Home | Control lifestyle and monthly obligations | Reduce annual living costs by $1,200; increase annual living costs by $1,200; stay the course |
| Bank | Manage revolving debt and liquidity | Pay up to $500 of revolving credit; draw $500 of available credit; stay the course |
| Financial District | Choose investment risk | Invest $500 in broad index; invest $500 in sector assets; invest $500 in speculative assets |
| Startup Hub | Trade cash/time for earning potential | Start certificate; start bootcamp; start degree |
| Hospital | Build financial resilience | Set a three-month emergency-fund target; set a six-month target; stay the course |

Action availability is derived from `RunView` whenever possible. Examples include available cash, revolving balance, remaining credit, current strategy, and active run capabilities. The server remains the final validator.

Fixed amounts are intentionally small and legible for the demo. They can be made configurable after the loop proves fun.

## Preview semantics

The preview describes the immediate command, not a prediction of market returns or random events. It must distinguish exact effects from directional guidance.

Examples:

- **Invest $500 in broad index**: exact `Cash -$500`, exact `Investments +$500`, directional `Lower concentration risk`.
- **Pay credit**: exact amount is capped by the outstanding balance, exact `Cash down`, exact `Debt down`, `Net worth unchanged immediately`.
- **Start bootcamp**: show the catalog cost and duration, then label future income impact as potential rather than guaranteed.
- **Six-month safety buffer**: `No immediate transfer`; future monthly allocation protects the reserve target.

The browser must not invent an exact future balance. If the authoritative data needed for an exact preview is unavailable, the UI shows qualitative copy or disables the plan with a clear explanation.

## Movement and board behavior

`/board` uses the Home-centered island layout instead of the perimeter track. Clicking an island selects a planning category.

Automatic multi-hop traversal is removed from the canonical turn. The initial demo has no travel animation: selecting a destination changes its visual highlight, and committing a turn gives Sprout a short in-place reaction that never delays the result card. Reduced-motion mode removes that reaction.

The decorative die and tile pickups are removed from the canonical board because they imply a chance-driven movement system that the game does not use.

## UI structure

### Persistent HUD

The top HUD keeps the player identity and Cash, Net Worth, and Debt. Goal progress and the current month remain visible but should not compete with the planning panel.

Goals and Journal remain available only if they open real content. Placeholder controls should be hidden from the canonical demo rather than promising unavailable features.

### Planning panel

On desktop, the panel is a right-side sheet that leaves the selected island visible. On narrow screens, it becomes a bottom sheet with a scrollable action-card region and a sticky commit button.

The panel contains:

- destination name and purpose;
- two or three action cards;
- selected-plan preview;
- **Live this month**;
- a close/change-focus control.

### Result card

The result card is centered and visually stronger than the current toast. Positive and negative changes use symbols and text in addition to color. The next action is **Continue to [next month]** or **Review life decision** when an event is pending.

### Event dialog

The dialog uses server-projected choice labels instead of formatting identifiers in the browser. When the pending event contains resolved money parameters, the dialog states the relevant amount. Each choice explains the immediate known consequence and avoids presenting uncertain future outcomes as guaranteed.

## Data flow and boundaries

`BoardShell` continues to own orchestration but delegates presentation and plan definitions to focused modules:

- `board-model.ts` maps `RunView` into financial display and result deltas;
- a plan catalog maps destination/action IDs to public command intents and preview copy;
- a planning panel renders selection without mutating the run;
- a result card renders opening-versus-ending authoritative values;
- `BoardScene` renders destination selection and the short in-place Sprout reaction only.

The browser submits only current public intents:

- `take_detailed_action`;
- `set_recurring_strategy`;
- `process_month`;
- `resolve_event_choice`.

`RunView` remains the only board data source. The application projection will expose event choice labels and resolved parameters needed for understandable decisions. The board must not import persisted engine-state types.

## Partial success and errors

The selected plan command and month command are separate API operations. If the plan succeeds but month processing fails, the UI must not pretend the whole operation rolled back. It updates to the returned plan state and presents:

> Your plan was saved, but the month did not advance.

The primary recovery action becomes **Finish this month** and retries only `process_month` with a new command ID and the latest revision.

If the plan command fails, the run remains at the opening state, the selected plan stays visible, and the server message appears in the planning panel. Stale revisions trigger a session refresh before the player chooses again. Pending events always block new planning until resolved.

## Accessibility and responsive behavior

- All island chips and action cards are keyboard reachable.
- Selection, busy state, errors, results, and event consequences are announced to assistive technology.
- Dialog focus is trapped and returned to the initiating control when closed.
- Reduced-motion mode removes travel and decorative animation.
- Mobile HUD stats collapse into a compact row; side navigation does not cover the board.
- The WebGL scene is decorative context: every gameplay action remains possible through semantic HTML controls.

## Testing

### Unit tests

- destination plans map to the intended public command payloads;
- availability rules cap or disable actions correctly;
- result deltas are calculated from opening and ending `RunView` values;
- event labels and resolved amounts project safely;
- no-action plans submit no pre-month command.

### Component tests

- choosing a destination opens the correct plans;
- changing selection does not submit a command;
- committing submits action then month with the returned revision;
- partial success offers **Finish this month** and does not repeat the plan;
- result review precedes a newly pending event;
- pending events block planning;
- reduced-motion mode does not wait for travel.

### Browser verification

- start an instant demo from the landing page;
- choose a destination and preview a plan;
- commit it and verify the month advances through the real API;
- verify the result card matches the changed HUD values;
- continue until an event appears and confirm its amount and choices are understandable;
- repeat at a narrow viewport and with reduced motion.

## Acceptance criteria

- The first interaction on `/board` is choosing a monthly focus, not pressing Move.
- At least one real engine-backed plan is available at every location for the instant-demo run.
- A committed plan changes authoritative state and advances exactly one month.
- No automatic tile-to-tile hop sequence plays.
- The result card explains the turn using authoritative before/after values.
- Event choices show human labels and relevant resolved money amounts.
- Failed or partially successful commits have an honest recovery path.
- The complete loop is keyboard operable and usable on a narrow viewport.
- The demo uses the existing API/session/engine path and contains no fallback financial fixtures.
