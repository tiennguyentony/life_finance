# Strategy-led Board Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the canonical board's automatic hop loop with an engine-backed monthly planning loop that previews one location action, advances one month, and explains the authoritative result.

**Architecture:** Keep `RunView` as the only browser data source and keep all mutations on the existing unversioned command endpoint. Add pure board-plan and turn-result modules, a small async coordinator for the two-command commit, focused planning/result components, and a strategy mode in the existing 3D board shell. Preserve the direct-travel `/board/free` development route while changing `/board` to strategy mode.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.9, Zod 4, React Three Fiber, Vitest 4, server-rendered component tests.

## Global Constraints

- The demo must use the existing session cookie, `/api/runs/{runId}/commands`, deterministic engine, and authoritative `RunView`.
- Do not introduce frontend financial fixtures, a second gameplay route, a dice mechanic, or new financial rules.
- `/board` must not run an automatic tile-to-tile hop sequence.
- Preview copy must distinguish exact immediate effects from directional future guidance.
- Preserve keyboard operation, semantic dialogs, reduced-motion behavior, and a usable narrow viewport.
- Preserve all pre-existing staged and unstaged work; use `git commit --only` with explicit paths for every task.
- Do not remove `track.ts`, `hop.ts`, their tests, or the `/board/free` direct-travel route in this milestone.

---

## File Structure

### New files

- `src/features/board/plan-catalog.ts` — pure location plans, availability, previews, and public command intents.
- `src/features/board/turn-commit.ts` — action-then-month orchestration and partial-success result types.
- `src/features/board/planning-panel.tsx` — semantic location/action selection UI.
- `src/features/board/month-result-dialog.tsx` — authoritative before/after result dialog.
- `src/features/board/use-modal-dialog.ts` — native modal-dialog lifecycle and focus return.
- `src/features/board/__tests__/plan-catalog.test.ts` — plan payload and availability coverage.
- `src/features/board/__tests__/turn-commit.test.ts` — command order and partial-success coverage.
- `src/features/board/__tests__/planning-surfaces.test.tsx` — static semantic markup coverage.

### Modified files

- `src/application/game/run-view.ts` — project pending-event labels/parameters and pending upskill program IDs.
- `src/application/game/__tests__/run-view.test.ts` — verify the safe projection.
- `src/contracts/api/contracts.ts` — validate new `RunView` fields and the 24-month reserve target.
- `src/contracts/api/__tests__/contracts.test.ts` — verify the public schema accepts projected strategy/event data.
- `src/features/board/board-model.ts` — map event details and compute authoritative month deltas.
- `src/features/board/__tests__/board-model.test.ts` — result and event formatting coverage.
- `src/features/board/board-shell.tsx` — strategy selection, commit, result, event ordering, and recovery.
- `src/features/board/hud.tsx` — remove canonical placeholders and host planning/result surfaces.
- `src/features/board/board-scene.tsx` — add strategy mode and remove track/die cues from that mode.
- `src/features/board/sprout-3d.tsx` — replace strategy travel with a short in-place commit reaction.
- `src/features/board/islands.ts` — change strategy-facing taglines to decision categories.
- `src/app/board/page.tsx` — select strategy mode.
- `src/app/styles/board.css` — planning/result styling and responsive board layout.
- `docs/product/board-experience.md` — document the new canonical player loop.
- `README.md` — describe `/board` as the strategy loop and `/board/free` as direct travel.

---

### Task 1: Project player-readable event and career data

**Files:**
- Modify: `src/application/game/run-view.ts`
- Modify: `src/application/game/__tests__/run-view.test.ts`
- Modify: `src/contracts/api/contracts.ts`
- Modify: `src/contracts/api/__tests__/contracts.test.ts`

**Interfaces:**
- Produces: `RunView.pendingInteraction.choices: readonly { id: string; label: string; description: string }[]` for events.
- Produces: `RunView.pendingInteraction.parameters: Readonly<Record<string, number>>` for events.
- Produces: `RunView.career.pendingProgramIds: readonly string[]`.
- Changes: `emergencyFundTargetMonthsPpm` accepts integer values from `0` through `24_000_000`.

- [ ] **Step 1: Write failing projection tests**

Add a declarative medical event using the real lifecycle helper and assert the projected label, description, resolved bill, and empty/pending career state:

```ts
import { queueScheduledDeclarativePersonalEventV2 } from "@/core/event-lifecycle-v2";
import { UNRELATED_HAZARD_TARGET } from "@/core/events";
import { getPersonalEventTemplateV2 } from "@/data/personal-event-templates-v2";

it("projects human event choices and resolved parameters", () => {
  const template = getPersonalEventTemplateV2("personal.medical_bill");
  const state = queueScheduledDeclarativePersonalEventV2(currentRunState(), {
    proposal: {
      eventId: "event.medical.1",
      templateId: template.id,
      templateVersion: template.version,
      parameters: { gross_bill_cents: 425_000 },
    },
    template,
    targetedWeakness: UNRELATED_HAZARD_TARGET,
  });

  expect(projectRunView(state).pendingInteraction).toMatchObject({
    kind: "event",
    parameters: { gross_bill_cents: 425_000 },
    choices: [
      { id: "pay_uninsured", label: "Pay without coverage" },
      { id: "use_insurance", label: "Use health coverage" },
    ],
  });
});

it("projects pending career programs without exposing engine state", () => {
  expect(projectRunView(currentRunState()).career).toEqual({ pendingProgramIds: [] });
});
```

- [ ] **Step 2: Run the projection tests and verify failure**

Run: `pnpm vitest run src/application/game/__tests__/run-view.test.ts`

Expected: FAIL because `choices`, `parameters`, and `career` are absent.

- [ ] **Step 3: Extend the application projection**

Add these public types to `RunView`:

```ts
career: Readonly<{ pendingProgramIds: readonly string[] }>;

pendingInteraction:
  | Readonly<{ kind: "none" }>
  | Readonly<{
      kind: "event";
      eventId: string;
      templateId: string;
      choiceIds: readonly string[];
      choices: readonly Readonly<{
        id: string;
        label: string;
        description: string;
      }>[];
      parameters: Readonly<Record<string, number>>;
      headline: string | null;
      body: string | null;
    }>;
```

Resolve catalog copy in a helper. Declarative v2 events use response labels and deterministic effect summaries; legacy events use title-cased IDs plus each choice's `principle`. Catalog lookup failures must fall back to title-cased IDs and an empty description instead of failing `projectRunView`.

```ts
function titleCaseIdentifier(id: string): string {
  return id.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function projectEventChoices(pending: NonNullable<GameStateV2["gameplay"]["eventLifecycle"]["pending"]>) {
  try {
    if (pending.eventSchemaVersion === 2) {
      const template = getPersonalEventTemplateV2(pending.templateId, pending.templateVersion);
      return pending.choiceIds.map((id) => {
        const response = template.responses.find((candidate) => candidate.id === id);
        return Object.freeze({
          id,
          label: response?.label ?? titleCaseIdentifier(id),
          description: response === undefined
            ? ""
            : describePersonalEventResponse(response, pending.parameters),
        });
      });
    }
    const template = getEventTemplate(pending.templateId, pending.templateVersion);
    return pending.choiceIds.map((id) => {
      const choice = template.choices.find((candidate) => candidate.id === id);
      return Object.freeze({
        id,
        label: titleCaseIdentifier(id),
        description: choice?.principle ?? "",
      });
    });
  } catch {
    return pending.choiceIds.map((id) => Object.freeze({
      id,
      label: titleCaseIdentifier(id),
      description: "",
    }));
  }
}
```

`describePersonalEventResponse` must cover the current declarative effect vocabulary without predicting random future state: `temporary_expense` and `cash_delta` use their resolved parameter as formatted money, `annual_living_cost_delta` says that annual spending changes by the resolved amount, `insurance_claim` says coverage limits the bill according to the active policy, and `wellbeing_delta` names the affected wellbeing field direction. Join multiple known summaries with a space; unknown effects contribute no copy.

Project `career.pendingProgramIds` from `state.gameplay.careerDevelopment.pending` and copy pending event parameters with `Object.freeze({ ...pending.parameters })`.

- [ ] **Step 4: Update the public Zod schema and contract tests**

Add `eventChoiceSchema`, `parameters`, `choices`, and `career`. Replace the reserve target's use of `rateSchema`:

```ts
const emergencyFundMonthsSchema = z.number().int().min(0).max(24_000_000);

const eventChoiceSchema = z.object({
  id: identifierSchema,
  label: z.string().trim().min(1).max(120),
  description: z.string().max(500),
}).strict();
```

Assert `runViewSchema.parse(projectRunView(eventState))` succeeds and `commandIntentSchema` accepts a strategy containing `emergencyFundTargetMonthsPpm: 6_000_000`.

- [ ] **Step 5: Run focused tests**

Run: `pnpm vitest run src/application/game/__tests__/run-view.test.ts src/contracts/api/__tests__/contracts.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit only Task 1 files**

```bash
git add src/application/game/run-view.ts src/application/game/__tests__/run-view.test.ts src/contracts/api/contracts.ts src/contracts/api/__tests__/contracts.test.ts
git commit --only -m "feat: project board planning data" -- src/application/game/run-view.ts src/application/game/__tests__/run-view.test.ts src/contracts/api/contracts.ts src/contracts/api/__tests__/contracts.test.ts
```

---

### Task 2: Define the engine-backed island plan catalog

**Files:**
- Create: `src/features/board/plan-catalog.ts`
- Create: `src/features/board/__tests__/plan-catalog.test.ts`

**Interfaces:**
- Consumes: `RunViewWire`, `CommandIntent`, and `career.pendingProgramIds` from Task 1.
- Produces: `BoardDestinationId`, `BoardPlan`, `plansForDestination(run, destinationId)`, and `commandIntentForPlan(run, plan, commandId)`.

- [ ] **Step 1: Write failing catalog tests**

Cover one representative from every location plus disabled-state caps:

```ts
it("maps every destination to real public intents", () => {
  const run = projectRunView(currentRunState());
  expect(plansForDestination(run, "home").map(({ id }) => id)).toContain("home.reduce-lifestyle");
  expect(plansForDestination(run, "bank").map(({ id }) => id)).toContain("bank.pay-credit");
  expect(plansForDestination(run, "financial").map(({ id }) => id)).toContain("financial.broad-index");
  expect(plansForDestination(run, "startup").map(({ id }) => id)).toContain("startup.certificate");
  expect(plansForDestination(run, "hospital").map(({ id }) => id)).toContain("hospital.reserve-3");
});

it("preserves the recurring strategy when changing the reserve target", () => {
  const run = projectRunView(currentRunState());
  const plan = plansForDestination(run, "hospital").find(({ id }) => id === "hospital.reserve-6")!;
  const { effectiveMonth: _effectiveMonth, ...strategy } = run.strategy;
  expect(commandIntentForPlan(run, plan, "board.plan.1")).toEqual({
    id: "board.plan.1",
    expectedRevision: run.revision,
    type: "set_recurring_strategy",
    payload: { strategy: { ...strategy, emergencyFundTargetMonthsPpm: 6_000_000 } },
  });
});
```

- [ ] **Step 2: Run the catalog test and verify failure**

Run: `pnpm vitest run src/features/board/__tests__/plan-catalog.test.ts`

Expected: FAIL because `plan-catalog.ts` does not exist.

- [ ] **Step 3: Implement focused plan types**

```ts
export type BoardDestinationId = "home" | "bank" | "financial" | "startup" | "hospital";

export type BoardPlanEffect = Readonly<{
  label: string;
  value: string;
  tone: "positive" | "negative" | "neutral";
  certainty: "exact" | "directional";
}>;

export type BoardPlan = Readonly<{
  id: string;
  destinationId: BoardDestinationId;
  label: string;
  description: string;
  effects: readonly BoardPlanEffect[];
  disabledReason: string | null;
  command:
    | Readonly<{ type: "none" }>
    | Readonly<{ type: "take_detailed_action"; action: Record<string, unknown> }>
    | Readonly<{ type: "set_recurring_strategy"; emergencyFundTargetMonthsPpm: number }>;
}>;
```

Define the fixed constants `DEMO_ACTION_CENTS = 50_000` and `ANNUAL_LIFESTYLE_DELTA_CENTS = 120_000`. Use the exact actions from the approved spec. Import `UPSKILL_PROGRAMS` for cost, duration, and salary-potential copy.

- [ ] **Step 4: Implement availability and command mapping**

Rules:

```ts
// Home reduction
disabledReason = run.finances.annualLivingCostCents < 120_000 ||
  run.finances.requiredObligationsCents < 10_000
  ? "Living costs cannot be reduced by another $100 per month."
  : null;

// Bank payment
amountCents = Math.min(50_000, run.finances.cashCents, run.finances.creditUsedCents);

// Bank draw
amountCents = Math.min(50_000, run.finances.creditLimitCents - run.finances.creditUsedCents);

// Investments
disabledReason = run.finances.cashCents < 50_000 ? "You need $500 in cash." : null;

// Upskill
disabledReason = run.income.annualGrossSalaryCents === null
  ? "Upskilling requires active employment."
  : run.career.pendingProgramIds.includes(program.id)
    ? "This program is already in progress."
    : run.finances.cashCents < program.costCents
      ? `You need ${formatPlanMoney(program.costCents)} in cash.`
      : null;
```

`commandIntentForPlan` returns `null` for `none`, otherwise returns a `CommandIntent` with the current revision. For a reserve plan, remove `effectiveMonth` from `run.strategy`, preserve all other fields, and overwrite `emergencyFundTargetMonthsPpm`.

- [ ] **Step 5: Run the catalog tests**

Run: `pnpm vitest run src/features/board/__tests__/plan-catalog.test.ts`

Expected: PASS with all five destinations and caps covered.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/features/board/plan-catalog.ts src/features/board/__tests__/plan-catalog.test.ts
git commit --only -m "feat: define monthly board plans" -- src/features/board/plan-catalog.ts src/features/board/__tests__/plan-catalog.test.ts
```

---

### Task 3: Add authoritative turn results and partial-success orchestration

**Files:**
- Create: `src/features/board/turn-commit.ts`
- Create: `src/features/board/__tests__/turn-commit.test.ts`
- Modify: `src/features/board/board-model.ts`
- Modify: `src/features/board/__tests__/board-model.test.ts`

**Interfaces:**
- Consumes: `BoardPlan`, `commandIntentForPlan`, `RunViewWire`, and a `submitCommand` client port.
- Produces: `commitBoardTurn(input): Promise<BoardTurnCommitResult>`.
- Produces: `boardMonthResult(opening, ending, planLabel): BoardMonthResult`.
- Changes: `BoardEvent` carries `choices` and `parameters` from the safe projection instead of asking the HUD to format choice IDs.

- [ ] **Step 1: Write failing result-model tests**

```ts
it("calculates authoritative before-and-after turn deltas", () => {
  const opening = projectRunView(currentRunState());
  const ending = {
    ...opening,
    currentMonth: "2026-08",
    finances: {
      ...opening.finances,
      cashCents: opening.finances.cashCents + 125_000,
      netWorthCents: opening.finances.netWorthCents + 150_000,
      creditUsedCents: opening.finances.creditUsedCents - 25_000,
    },
    goal: { ...opening.goal, progressPpm: opening.goal.progressPpm + 4_000 },
  };
  expect(boardMonthResult(opening, ending, "Pay down credit")).toMatchObject({
    fromMonth: "2026-07",
    toMonth: "2026-08",
    planLabel: "Pay down credit",
    cashChangeCents: 125_000,
    netWorthChangeCents: 150_000,
    debtChangeCents: -25_000,
    goalProgressChangePpm: 4_000,
  });
});
```

- [ ] **Step 2: Write failing coordinator tests**

Use a fake client that records commands. Assert action first, month second with the returned revision, no-action month-only behavior, plan failure, and month failure after a successful plan.

```ts
expect(calls.map(({ type }) => type)).toEqual(["take_detailed_action", "process_month"]);
expect(calls[1]!.expectedRevision).toBe(planAppliedRun.revision);
expect(result).toMatchObject({ kind: "month_failed", run: planAppliedRun, planApplied: true });
```

- [ ] **Step 3: Run tests and verify failure**

Run: `pnpm vitest run src/features/board/__tests__/board-model.test.ts src/features/board/__tests__/turn-commit.test.ts`

Expected: FAIL because the result and coordinator exports are absent.

- [ ] **Step 4: Implement the pure result model**

First update the event view model and `boardViewFromRun` mapping:

```ts
export type BoardEvent = Readonly<{
  eventId: string;
  headline: string;
  body: string;
  parameters: Readonly<Record<string, number>>;
  choices: readonly Readonly<{
    id: string;
    label: string;
    description: string;
  }>[];
}>;
```

Copy `run.pendingInteraction.parameters` and `run.pendingInteraction.choices` into this shape. Remove `formatBoardChoice`; the HUD must never recreate catalog copy from identifiers.

```ts
export type BoardMonthResult = Readonly<{
  fromMonth: string;
  toMonth: string;
  planLabel: string;
  cashChangeCents: number;
  netWorthChangeCents: number;
  debtChangeCents: number;
  goalProgressChangePpm: number;
  hasPendingEvent: boolean;
}>;

export function boardMonthResult(opening: BoardRunSource, ending: BoardRunSource, planLabel: string): BoardMonthResult {
  const openingDebt = opening.finances.nonCreditLiabilitiesCents + opening.finances.creditUsedCents;
  const endingDebt = ending.finances.nonCreditLiabilitiesCents + ending.finances.creditUsedCents;
  return Object.freeze({
    fromMonth: opening.currentMonth,
    toMonth: ending.currentMonth,
    planLabel,
    cashChangeCents: ending.finances.cashCents - opening.finances.cashCents,
    netWorthChangeCents: ending.finances.netWorthCents - opening.finances.netWorthCents,
    debtChangeCents: endingDebt - openingDebt,
    goalProgressChangePpm: ending.goal.progressPpm - opening.goal.progressPpm,
    hasPendingEvent: ending.pendingInteraction.kind === "event",
  });
}
```

- [ ] **Step 5: Implement the coordinator**

Define a narrow port and discriminated results:

```ts
type TurnClient = Readonly<{
  submitCommand(runId: string, command: CommandIntent): Promise<CommandResponseWire>;
}>;

export type BoardTurnCommitResult =
  | Readonly<{ kind: "completed"; opening: RunViewWire; run: RunViewWire; planApplied: boolean }>
  | Readonly<{ kind: "plan_failed"; run: RunViewWire; error: unknown }>
  | Readonly<{ kind: "month_failed"; run: RunViewWire; planApplied: boolean; error: unknown }>;
```

`commitBoardTurn` accepts `client`, `opening`, `plan`, and `createId: (phase: "plan" | "month") => string`. It skips the first request for `none`, uses the returned run revision for the month, and never retries inside the coordinator.

- [ ] **Step 6: Run focused tests**

Run: `pnpm vitest run src/features/board/__tests__/board-model.test.ts src/features/board/__tests__/turn-commit.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/features/board/turn-commit.ts src/features/board/__tests__/turn-commit.test.ts src/features/board/board-model.ts src/features/board/__tests__/board-model.test.ts
git commit --only -m "feat: coordinate monthly board turns" -- src/features/board/turn-commit.ts src/features/board/__tests__/turn-commit.test.ts src/features/board/board-model.ts src/features/board/__tests__/board-model.test.ts
```

---

### Task 4: Build semantic planning and result surfaces

**Files:**
- Create: `src/features/board/planning-panel.tsx`
- Create: `src/features/board/month-result-dialog.tsx`
- Create: `src/features/board/use-modal-dialog.ts`
- Create: `src/features/board/__tests__/planning-surfaces.test.tsx`

**Interfaces:**
- Consumes: `BoardPlan`, `BoardDestinationId`, `BoardMonthResult`.
- Produces: `PlanningPanel`, `MonthResultDialog`, and `useModalDialog(open)`.

- [ ] **Step 1: Write failing server-rendered component tests**

```tsx
it("renders exact and directional preview semantics", () => {
  const markup = renderToStaticMarkup(
    <PlanningPanel
      busy={false}
      destinationId="financial"
      errorMessage={null}
      onClose={() => undefined}
      onCommit={() => undefined}
      onSelectPlan={() => undefined}
      plans={plansForDestination(run, "financial")}
      selectedPlanId="financial.broad-index"
    />,
  );
  expect(markup).toContain("Choose your plan");
  expect(markup).toContain("Exact");
  expect(markup).toContain("Directional");
  expect(markup).toContain("Live this month");
});

it("announces a pending event from the result dialog", () => {
  const markup = renderToStaticMarkup(<MonthResultDialog busy={false} onContinue={() => undefined} result={resultWithEvent} />);
  expect(markup).toContain('role="dialog"');
  expect(markup).toContain("Review life decision");
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `pnpm vitest run src/features/board/__tests__/planning-surfaces.test.tsx`

Expected: FAIL because both components are absent.

- [ ] **Step 3: Implement `PlanningPanel`**

Render a labelled `<section>` with radio-style plan buttons using `aria-pressed`, visible disabled reasons, effect rows that include certainty text, an error `role="alert"`, an `aria-live="polite"` status for commit progress, and a primary button disabled while busy or when no enabled plan is selected.

```tsx
<button
  aria-pressed={selected}
  className="board-plan-card"
  disabled={plan.disabledReason !== null || busy}
  onClick={() => onSelectPlan(plan.id)}
  type="button"
>
  <strong>{plan.label}</strong>
  <span>{plan.description}</span>
  {plan.effects.map((effect) => (
    <span data-tone={effect.tone} key={`${effect.label}.${effect.value}`}>
      <b>{effect.label}</b> {effect.value}
      <small>{effect.certainty === "exact" ? "Exact" : "Directional"}</small>
    </span>
  ))}
</button>
```

- [ ] **Step 4: Implement `MonthResultDialog`**

Implement `useModalDialog(open)` with a `HTMLDialogElement` ref. When `open` changes to true, record `document.activeElement` and call `showModal()`; on close or cleanup, call `close()` and restore focus to the recorded element. Use the hook in `MonthResultDialog` so the native modal traps focus. Render a heading containing the destination month, four delta rows, the plan label, and a primary button. Format cents with `formatBoardMoney`; format progress PPM as percentage points with one decimal place.

```ts
export function useModalDialog(open: boolean) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    const returnFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      returnFocus?.focus();
    };
  }, [open]);
  return dialogRef;
}
```

- [ ] **Step 5: Run component tests**

Run: `pnpm vitest run src/features/board/__tests__/planning-surfaces.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/features/board/planning-panel.tsx src/features/board/month-result-dialog.tsx src/features/board/use-modal-dialog.ts src/features/board/__tests__/planning-surfaces.test.tsx
git commit --only -m "feat: add board planning surfaces" -- src/features/board/planning-panel.tsx src/features/board/month-result-dialog.tsx src/features/board/use-modal-dialog.ts src/features/board/__tests__/planning-surfaces.test.tsx
```

---

### Task 5: Integrate strategy mode into the canonical board

**Files:**
- Modify: `src/features/board/board-shell.tsx`
- Modify: `src/features/board/hud.tsx`
- Modify: `src/features/board/board-scene.tsx`
- Modify: `src/features/board/sprout-3d.tsx`
- Modify: `src/features/board/islands.ts`
- Modify: `src/app/board/page.tsx`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: `BoardShell` modes `"strategy" | "free"`, with `"strategy"` as the default.

- [ ] **Step 1: Change `/board` to select strategy mode**

```tsx
export default function BoardPage() {
  return <BoardShell mode="strategy" />;
}
```

Update `BoardMode` to `"strategy" | "free"`. Strategy and free modes both use the Home-centered island layout; free mode retains the existing direct hop behavior.

- [ ] **Step 2: Add strategy state to `BoardShell`**

Use these explicit state values:

```ts
const [selectedDestinationId, setSelectedDestinationId] = useState<BoardDestinationId | null>(null);
const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
const [monthResult, setMonthResult] = useState<BoardMonthResult | null>(null);
const [planningError, setPlanningError] = useState<string | null>(null);
const [finishMonthOnly, setFinishMonthOnly] = useState(false);
```

In strategy mode, `handleSelect` first checks `run.capabilities.canAct` and the absence of a pending event, then sets the destination and selects the first enabled plan. It never creates a hop request. Free mode keeps `startFreeHop`.

- [ ] **Step 3: Implement the commit and recovery handlers**

Call `commitBoardTurn`. On `completed`, set the new run, calculate `boardMonthResult(opening, result.run, plan.label)`, clear the selection, and leave any event hidden behind the result. On `plan_failed`, keep the selection and show the API message. On `month_failed`, update to the returned plan-applied run, set `finishMonthOnly`, and show exactly:

```text
Your plan was saved, but the month did not advance.
```

The recovery button submits only `process_month` using the latest revision. It must not call `commitBoardTurn` with the original plan again.

- [ ] **Step 4: Rework `BoardHud` composition**

Add props for `mode`, `planningPanel`, `monthResultDialog`, and `eventVisible`. In strategy mode:

- replace the bottom Move control with `Choose your focus for this month` when no destination is selected;
- render `PlanningPanel` when selected;
- render `MonthResultDialog` above all planning UI;
- render the event dialog only when `eventVisible` is true;
- hide Goals, Journal, Menu, and other placeholder controls.

Use `view.pendingEvent.choices` for button labels/descriptions and format the first parameter whose key ends in `_cents` as the event amount. Keep the event in a mounted `<dialog>` controlled by `useModalDialog(eventVisible)` so focus is trapped while open and returned after resolution.

- [ ] **Step 5: Remove chance cues from strategy scene**

Keep track models available only to source-level legacy/free code if needed, but strategy mode must render `PathDots`, never `TrackTiles`, `CenterDie`, destination flags, or coin pickups. Change `BoardScene` to accept `selectedIslandId: string | null`; a strategy island receives `Selected focus` only when its ID matches, while no island is labelled selected before the player chooses. Sprout remains at Home.

Add `reactionToken: number` to `BoardScene` and `Sprout3d`. Increment it once after a completed month. `Sprout3d` records the token change and applies one 480 ms in-place arc no higher than `0.22` world units; it does not change `x` or `z`, and reduced motion completes immediately.

```ts
const reactionProgress = Math.min(1, (elapsed - reactionStartRef.current) / 0.48);
const reactionY = reducedMotion ? 0 : Math.sin(Math.PI * reactionProgress) * 0.22;
group.position.set(standingAt.x, PLATFORM_TOP_Y + 0.04 + reactionY, standingAt.z);
```

- [ ] **Step 6: Update island decision copy**

Use these taglines:

```ts
home: "Budget & lifestyle"
financial: "Invest & grow"
bank: "Debt & credit"
hospital: "Safety buffer"
startup: "Career & skills"
```

- [ ] **Step 7: Run board tests, type checking, and lint**

Run: `pnpm vitest run src/features/board/__tests__`

Expected: PASS.

Run: `pnpm typecheck`

Expected: exit 0.

Run: `pnpm lint`

Expected: exit 0.

- [ ] **Step 8: Commit Task 5**

```bash
git add src/features/board/board-shell.tsx src/features/board/hud.tsx src/features/board/board-scene.tsx src/features/board/sprout-3d.tsx src/features/board/islands.ts src/app/board/page.tsx
git commit --only -m "feat: make board turns strategy led" -- src/features/board/board-shell.tsx src/features/board/hud.tsx src/features/board/board-scene.tsx src/features/board/sprout-3d.tsx src/features/board/islands.ts src/app/board/page.tsx
```

---

### Task 6: Add responsive planning and result styling

**Files:**
- Modify: `src/app/styles/board.css`

**Interfaces:**
- Consumes: class names from Tasks 4–5.
- Produces: desktop right sheet, narrow bottom sheet, compact HUD, result dialog, event-choice details, and reduced-motion behavior.

- [ ] **Step 1: Add desktop planning and result styles**

Use a fixed right sheet that does not cover the selected left/center islands:

```css
.board-planning-panel {
  position: absolute;
  top: 7.25rem;
  right: 1.25rem;
  bottom: 1.25rem;
  z-index: 12;
  display: flex;
  width: min(25rem, calc(100vw - 2.5rem));
  flex-direction: column;
  gap: 0.9rem;
  overflow: auto;
  padding: 1.1rem;
  border: 3px solid var(--ink);
  border-radius: 24px;
  background: rgb(255 253 246 / 97%);
  box-shadow: 8px 10px 0 var(--ink);
  pointer-events: auto;
}

.board-plan-card[aria-pressed="true"] {
  background: var(--paper-deep);
  box-shadow: 2px 3px 0 var(--ink);
  transform: translateY(2px);
}
```

Add visible certainty tags, disabled reasons, inline errors, and a centered result dialog with four delta rows. Positive/negative state must use text or symbols as well as color.

- [ ] **Step 2: Add narrow-viewport behavior**

At `max-width: 760px`, collapse player identity to avatar/name, convert stats to a compact top row, hide decorative trophy/side controls, and turn the planning sheet into a bottom sheet:

```css
@media (max-width: 760px) {
  .board-planning-panel {
    top: auto;
    right: 0.65rem;
    bottom: 0.65rem;
    left: 0.65rem;
    width: auto;
    max-height: min(62dvh, 34rem);
  }

  .board-stat {
    min-width: 0;
    padding: 0.4rem 0.55rem;
  }

  .board-goal {
    display: none;
  }

  .board-planning-commit {
    position: sticky;
    bottom: 0;
  }
}
```

- [ ] **Step 3: Extend reduced-motion rules**

Disable planning-card translation, result entrance motion, and Sprout commit reaction under `prefers-reduced-motion: reduce`.

- [ ] **Step 4: Run lint and production build**

Run: `pnpm lint`

Expected: exit 0.

Run: `pnpm build`

Expected: production build succeeds.

- [ ] **Step 5: Commit Task 6**

```bash
git add src/app/styles/board.css
git commit --only -m "style: make board planning responsive" -- src/app/styles/board.css
```

---

### Task 7: Verify the complete demo and update live documentation

**Files:**
- Modify: `docs/product/board-experience.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: completed strategy loop.
- Produces: verified desktop, narrow, reduced-motion, event, and recovery behavior plus current documentation.

- [ ] **Step 1: Update the board experience document**

Replace the old Move/hop player flow with:

```markdown
1. Choose one of the five financial focus locations.
2. Review two or three engine-backed plans and their immediate trade-offs.
3. Select one plan and choose **Live this month**.
4. The board submits the plan, then advances exactly one month.
5. Review authoritative cash, net-worth, debt, and goal-progress changes.
6. Resolve any life event before planning the next month.
```

Document that `/board/free` remains direct travel for development and that canonical `/board` has no tile traversal or die mechanic.

- [ ] **Step 2: Run the full automated verification**

Run: `pnpm verify`

Expected: lint, type checking, all unit/integration/long-run tests, and production build pass.

- [ ] **Step 3: Perform desktop browser verification**

Start the existing dev server with `pnpm dev`. In the in-app browser:

1. Open `/` and choose **Instant demo**.
2. Verify `/board` says **Choose your focus for this month** and has no Move button or die/track.
3. Select Financial District, choose broad index, and confirm exact `Cash -$500` plus directional risk copy.
4. Choose **Live this month** and verify one plan request followed by one month request.
5. Verify the result dialog values match the updated HUD.
6. Continue and confirm the next month is ready for planning.

- [ ] **Step 4: Verify event ordering and content**

Continue monthly turns until an event appears. Verify the result dialog appears before the event, then confirm the event shows a human label and the relevant resolved dollar amount. Resolve it and verify planning becomes available again.

- [ ] **Step 5: Verify narrow and reduced-motion behavior**

At a viewport no wider than 430 CSS pixels, confirm the bottom sheet, compact stats, sticky commit control, and semantic action buttons are usable without horizontal scrolling. Enable reduced motion and confirm selection/commit does not wait for travel or translated hover feedback.

- [ ] **Step 6: Commit documentation only**

```bash
git add docs/product/board-experience.md README.md
git commit --only -m "docs: explain strategy-led board loop" -- docs/product/board-experience.md README.md
```

- [ ] **Step 7: Record final verification evidence**

Run: `git status --short`

Expected: only the user's pre-existing unrelated staged/unstaged changes remain; all files from this plan are committed.

Run: `git log -7 --oneline`

Expected: the seven task commits appear in reverse chronological order without unrelated files included in their stats.
