# Funny Beginner Event Rhythm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise the 12-month beginner chapter to 8–10 event prompts and 6–8 meaningful decisions with mixed-tone humor, transparent trade-offs, deterministic replay, and no regression in the existing financial-safety gates.

**Architecture:** Keep the deterministic personal-event engine and `runtime-balance-v1` as the safety authority. Split the event data into a complete replay catalog and a highest-version active scheduling catalog, add immutable tone/cadence metadata, then apply a pure beginner cadence filter before the existing Scenario Director and Runtime Balance controller. Project each response through the authoritative effect resolver for UI previews, and expose cadence/content evidence to Balance Lab for gated activation.

**Tech Stack:** TypeScript 5.9, Vitest 4, Zod 4, React 19, Next.js 16, pnpm 11, deterministic named world-random streams.

## Global Constraints

- Preserve every existing V2 template object and response effect. Historical lookup must always use the exact stored `templateId` and `templateVersion`; it must never fall forward to V3.
- Keep AI-authored events, natural-language actions, and a monthly-allocation interface out of this delivery.
- Never use player wealth, player strategy, or previous prudent choices to increase event occurrence or parameter magnitude.
- Never schedule more than one event in a month. A due declared follow-up owns the slot.
- Cadence may filter or stably partition already generated candidates. It may not bypass eligibility, cooldown, challenge-band, pacing, or unavoidable-failure checks.
- Keep funny root events at `micro` severity with pressure cost 0 or 1. The Runtime Balance controller must reject a funny root assessed above `meaningful`.
- Use named world streams for occurrence and parameters. Do not consume a strategy-dependent root RNG cursor in the opted-in named path.
- Add optional state/evidence fields only where replay compatibility requires them. Old serialized states must remain valid.
- Do not activate the new cadence/catalog defaults unless the 200-matched-seed beginner cohort passes every old and new blocking gate.
- Treat the untracked `.agents/` directory and `skills-lock.json` as user-owned and leave them unchanged.

---

## File Structure

### New files

- `src/data/personal-event-template-helpers.ts` — shared `parameter` and recursive `deepFreeze` helpers.
- `src/data/personal-event-funny-templates-v2.ts` — eight humorous roots and two declared follow-ups.
- `src/data/personal-event-expanded-templates-v3.ts` — replay-safe V3 variants for five expanded event experiences plus the transport-root bridge to its V3 follow-up.
- `src/data/personal-event-presentation-v1.ts` — exact-version tone and cadence-role metadata with catalog coverage validation.
- `src/core/beginner-event-cadence-v1.ts` — pure cadence assessment, candidate filtering, and monthly evidence finalization.
- `src/core/__tests__/beginner-event-cadence-v1.test.ts` — cadence state-machine and safety-boundary tests.
- `src/application/game/personal-event-response-preview-v1.ts` — pure response preview built from authoritative resolution evidence.
- `src/application/game/__tests__/personal-event-response-preview-v1.test.ts` — immediate, recurring, insurance, and follow-up preview tests.
- `docs/superpowers/results/2026-07-18-funny-event-rhythm.md` — authoritative calibration result and activation decision.

### Modified files

- `src/data/personal-event-templates-v2.ts` — assemble complete and active catalogs without changing historical V2 data.
- `src/core/personal-event-v2.ts` — validate optional follow-up provenance and expose exact catalog identities where required.
- `src/core/personal-event-effects-v2.ts` — export the authoritative mitigation-availability query used by previews.
- `src/core/game-state-v2.ts` — add optional `followUpSourceEventId` to pending/resolved V2 evidence.
- `src/core/game-state-v2-event-validation.ts` — validate optional follow-up provenance and exact historical templates.
- `src/core/event-lifecycle-v2.ts` — carry follow-up source identity into pending and resolved evidence.
- `src/core/event-scheduler-v2.ts` — use the explicit production scheduling projection while tests/lab may inject the candidate active catalog.
- `src/core/monthly-turn-v2.ts` — separate replay and scheduling catalogs; apply and record cadence before Scenario Director/Runtime Balance.
- `src/core/runtime-balance-controller-v2.ts` — enforce the humorous-root maximum challenge band without weakening existing guards.
- `src/core/scenario-director-context-v2.ts` — use complete exact lookup for history and active candidates for new decisions.
- `src/server/ai/world-director-service.ts` — expose active versions only for newly proposed/ranked events.
- `src/server/db/causal-history-repository-v1.ts` — retain exact-version replay lookup and optional follow-up provenance.
- `src/application/game/run-view.ts` — replace local prose-only effect descriptions with structured response previews.
- `src/contracts/api/contracts.ts` — validate structured choice previews and enabled/disabled state.
- `src/features/board/board-model.ts` — carry structured previews to the board.
- `src/features/board/hud.tsx` — render due-now, monthly, total, wellbeing, and follow-up consequences before confirmation.
- `src/lab/balance-lab-v1-bots.ts` — add distinct prepared, average, and reckless mappings for every active root.
- `src/lab/balance-lab-v1-runner.ts` — add per-run cadence/content evidence.
- `src/lab/balance-lab-v1-production.ts` — collect cadence, tone, follow-up, response-diversity, and attribution evidence.
- `src/lab/balance-lab-v1-metrics.ts` — summarize the approved engagement metrics.
- `src/lab/balance-lab-v1-config.ts` — register blocking metric identifiers.
- `src/lab/balance-lab-v1-contracts.ts` — carry the expanded result schema.
- `src/lab/balance-lab-v1-reports.ts` — strictly validate and render the new JSON/CSV/Markdown evidence.
- `balance-lab.config.json` — set the approved beginner engagement thresholds.
- Existing test files named in the tasks below — add focused regression and integration coverage.

---

## Task 1: Split complete replay data from active scheduling data

**Files:**

- Create: `src/data/personal-event-template-helpers.ts`
- Modify: `src/data/personal-event-templates-v2.ts`
- Modify: `src/core/__tests__/personal-event-v2.test.ts`
- Modify: `src/core/__tests__/event-lifecycle-v2.test.ts`

- [ ] **Step 1: Add failing catalog-boundary tests**

Add assertions that capture the historical contract before new content is assembled:

```ts
expect(getPersonalEventTemplateV2("personal.medical_bill", 2).responses)
  .toEqual(existingMedicalV2Responses);
expect(getPersonalEventTemplateV2("personal.transport_repair", 2).followUps)
  .toEqual([{
    templateId: "personal.transport_repair_followup",
    templateVersion: 2,
    delayMonths: 2,
    whenResponseIds: ["defer_repair"],
  }]);
expect(ACTIVE_PERSONAL_EVENT_TEMPLATES_V2.every((template) =>
  getActivePersonalEventTemplateV2(template.id) === template,
)).toBe(true);
expect(new Set(ACTIVE_PERSONAL_EVENT_TEMPLATES_V2.map(({ id }) => id)).size)
  .toBe(ACTIVE_PERSONAL_EVENT_TEMPLATES_V2.length);
expect(PRODUCTION_PERSONAL_EVENT_TEMPLATES_V2)
  .toEqual(HISTORICAL_PERSONAL_EVENT_TEMPLATES_V2);
```

Also add a lifecycle test that resolves a stored `personal.medical_bill@2` while a newer version exists in the complete catalog.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```bash
pnpm vitest run src/core/__tests__/personal-event-v2.test.ts src/core/__tests__/event-lifecycle-v2.test.ts
```

Expected: failure because the active-catalog exports do not exist.

- [ ] **Step 3: Extract shared immutable-data helpers**

Move the existing implementations without semantic change:

```ts
export function parameter(
  parameterId: string,
  multiplierPpm = 1_000_000,
): PersonalEventMagnitudeV2;

export function deepFreeze<T>(value: T): Readonly<T>;
```

Import them into `personal-event-templates-v2.ts` and leave the current V2 template literals unchanged.

- [ ] **Step 4: Assemble explicit complete and active projections**

Keep `PERSONAL_EVENT_TEMPLATES_V2` as the complete exact-version catalog for compatibility. Preserve the original eleven-template array as `HISTORICAL_PERSONAL_EVENT_TEMPLATES_V2`. Add:

```ts
export const ACTIVE_PERSONAL_EVENT_TEMPLATES_V2:
  readonly PersonalEventTemplateV2[];

export function getActivePersonalEventTemplateV2(
  templateId: string,
): PersonalEventTemplateV2;

export const PERSONAL_EVENT_SCHEDULING_SELECTION_V2:
  | "historical-v2"
  | "highest-supported" = "historical-v2";

export const PRODUCTION_PERSONAL_EVENT_TEMPLATES_V2:
  readonly PersonalEventTemplateV2[];
```

Build the active projection by selecting the highest version for each ID and sorting by `id`, then `version`. Build the production projection from the explicit selection constant; it remains the original eleven-template V2 set until Task 9. Validate all three catalogs at module initialization. `getPersonalEventTemplateV2(id, version = 2)` remains exact and keeps its current default.

- [ ] **Step 5: Re-run the focused tests and confirm GREEN**

Run the Step 2 command.

Expected: both files pass, including exact V2 replay.

- [ ] **Step 6: Commit the catalog boundary**

```bash
git add src/data/personal-event-template-helpers.ts src/data/personal-event-templates-v2.ts src/core/__tests__/personal-event-v2.test.ts src/core/__tests__/event-lifecycle-v2.test.ts
git commit -m "Separate active and replay event catalogs"
```

---

## Task 2: Add exact presentation metadata and humorous templates

**Files:**

- Create: `src/data/personal-event-funny-templates-v2.ts`
- Create: `src/data/personal-event-presentation-v1.ts`
- Modify: `src/data/personal-event-templates-v2.ts`
- Modify: `src/core/__tests__/personal-event-v2.test.ts`
- Modify: `src/core/__tests__/personal-event-effects-v2.test.ts`

- [ ] **Step 1: Add failing content, economy, and metadata tests**

Test that all ten new identities exist and are deeply frozen, all eight roots have 3–4 responses, every root is `micro`, every root pressure cost is 0 or 1, and exact metadata covers every identity in the complete catalog, including historical versions.

Define the metadata interface exactly:

```ts
export type PersonalEventPresentationToneV1 =
  | "serious"
  | "relatable_comedy"
  | "absurd_comedy";

export type PersonalEventCadenceRoleV1 =
  | "challenge"
  | "engagement"
  | "follow_up";

export type PersonalEventPresentationV1 = Readonly<{
  templateId: string;
  templateVersion: number;
  tone: PersonalEventPresentationToneV1;
  cadenceRole: PersonalEventCadenceRoleV1;
}>;
```

Add economic assertions for 120% payment plans, 80% grocery recovery, 220% weekend income, and the exact follow-up delays/ranges. Canonically fingerprint each root response's effects and prove at least three distinct fingerprints per counted decision.

- [ ] **Step 2: Run the focused tests and confirm RED**

```bash
pnpm vitest run src/core/__tests__/personal-event-v2.test.ts src/core/__tests__/personal-event-effects-v2.test.ts
```

Expected: failure because humorous templates and metadata are absent.

- [ ] **Step 3: Implement the six relatable-comedy roots**

Use these exact IDs, ranges, response IDs, and effect magnitudes:

| Template | Parameter range | Responses and authoritative effects |
|---|---:|---|
| `personal.subscription_archaeology@2` | `annual_subscription_cents` 12,000–60,000 | `cancel_all`: annual living cost `-100%`, happiness `-20,000`; `keep_favorite`: annual living cost `-50%`; `keep_digital_fossils`: no money effect, happiness `+10,000` |
| `personal.group_chat_gift@2` | `gift_contribution_cents` 2,000–15,000 | `contribute_full`: one-month expense `100%`, happiness `+30,000`; `make_gift`: one-month expense `35%`, burnout `+25,000`, happiness `+15,000`; `decline_gift`: happiness `-30,000` |
| `personal.countertop_gadget_sale@2` | `gadget_price_cents` 3,000–25,000 | `skip_gadget`: happiness `-10,000`; `buy_basic`: one-month expense `60%`; `buy_deluxe`: one-month expense `100%`, happiness `+25,000`; `four_month_plan`: recurring expense `30%` for 4 months, happiness `+25,000` |
| `personal.double_grocery_delivery@2` | `duplicate_charge_cents` 2,000–18,000 | `return_duplicate`: burnout `+20,000`; `keep_duplicate`: one-month expense `100%`, happiness `+10,000`; `share_duplicate`: one-month expense `100%`, happiness `+25,000`; `resell_surplus`: one-month expense `100%`, one-month income `80%`, burnout `+30,000` |
| `personal.mascot_side_hustle@2` | `shift_pay_cents` 5,000–30,000; `costume_cost_cents` 2,000–8,000 | `decline_shift`: no effect; `work_one_shift`: one-month income `100%`, burnout `+20,000`; `work_weekend`: one-month income `220%`, one-month expense `100%` of costume, burnout `+45,000`, happiness `+15,000` |
| `personal.laundry_final_spin@2` | `repair_estimate_cents` 4,000–25,000 | `use_laundromat`: recurring expense `30%` for 2 months, burnout `+10,000`; `hire_repairer`: one-month expense `100%`; `diy_repair`: one-month expense `50%`, burnout `+35,000` |

Assign classification `neutral` to the subscription and mascot events and `negative` to the other four. Use 12-month event cooldowns, category cooldown 1, lesson cooldown 1, maximum occurrences 1, recovery 0–2 months, and deterministic fallback copy that keeps the joke in the situation rather than in financial harm.

Use fixed occurrence chances independent of state: each relatable root has base/minimum/maximum `180_000` ppm with no modifiers. Use these categories, pressure costs, primary lesson tags, and exact recovery durations:

| Template | Category | Pressure | Primary lesson tag | Recovery months |
|---|---|---:|---|---:|
| subscription archaeology | `behavioral_trap` | 0 | `recurring_costs` | 0 |
| group-chat gift | `social` | 1 | `social_spending_boundaries` | 1 |
| countertop gadget | `behavioral_trap` | 1 | `needs_vs_wants` | 1 |
| double grocery delivery | `maintenance` | 1 | `sunk_cost_recovery` | 1 |
| mascot side hustle | `career` | 0 | `side_hustle_capacity` | 1 |
| laundry final spin | `maintenance` | 1 | `cash_timing` | 2 |

- [ ] **Step 4: Implement the two absurd roots and their disclosed follow-ups**

Use these exact identities and effects:

| Template | Parameter range | Responses and authoritative effects |
|---|---:|---|
| `personal.raccoon_sanitation@2` | `cleanup_cost_cents` 1,500–12,000 | `hire_cleanup`: expense `100%`; `build_trash_armor`: expense `40%`, burnout `+15,000`; `ignore_inspector`: happiness `-15,000`, burnout `+20,000`, then schedule `personal.raccoon_management_followup@2` after 2 months |
| `personal.raccoon_management_followup@2` | `escalated_cleanup_cents` 5,000–30,000 | `pay_cleanup_now`: expense `100%`; `cleanup_payment_plan`: recurring expense `30%` for 4 months; `diy_management_cleanup`: expense `60%`, burnout `+35,000` |
| `personal.rare_yard_sale_lamp@2` | `purchase_price_cents` 1,000–10,000; `restoration_cost_cents` 1,000–10,000 | `walk_away`: happiness `-10,000`; `buy_and_keep`: expense `100%` of purchase, happiness `+15,000`; `buy_restore_and_list`: expense `100%` of purchase plus `100%` of restoration, happiness `+20,000`, then schedule `personal.lamp_market_followup@2` after 2 months |
| `personal.lamp_market_followup@2` | `resale_proceeds_cents` 0–25,000 | `sell_lamp`: one-month income `100%` |

Set follow-up hazard chances to zero so they can only occur through declared scheduling. Mark roots `absurd_comedy/engagement` and follow-ups `absurd_comedy/follow_up`. Give roots 12-month cooldowns and maximum occurrences 1.

Use fixed root occurrence chances of `90_000` ppm with no modifiers. Raccoon uses category `maintenance`, pressure 1, primary lesson `prevention_cost`, classification `negative`, and recovery 2. Lamp uses category `opportunity`, pressure 1, primary lesson `speculation_cost_basis`, classification `neutral`, and recovery 2. Raccoon follow-up is `negative`, pressure 1, recovery 4; lamp follow-up is `positive`, pressure 0, recovery 0. All four use event/category/lesson cooldowns `12/1/1` and maximum occurrences 1.

Use the event names as fallback headlines and these exact bodies:

- Subscription: “A forgotten annual charge has been renewing so faithfully it may qualify as a dependent.”
- Gift: “The group chat needs money today, but time and boundaries are also valid currencies.”
- Gadget: “A countertop gadget promises to transform dinner and occupy one highly visible outlet.”
- Grocery: “Two identical grocery orders arrive, creating a small lesson in recovery rather than sunk-cost panic.”
- Mascot: “A paid mascot shift offers extra income in exchange for heat, dignity, and a weekend.”
- Laundry: “The washing machine performs one final dramatic spin and leaves three ways to handle the cost.”
- Raccoon root: “A tiny sanitation official has inspected the bins and issued consequences with surprising confidence.”
- Raccoon follow-up: “The raccoon has returned with management, a larger cleanup, and no interest in excuses.”
- Lamp root: “A yard-sale lamp may be rare, may be haunted, and definitely has a known cost basis.”
- Lamp follow-up: “The lamp has found a buyer; compare the proceeds with everything already spent.”

- [ ] **Step 5: Add metadata validation**

Export:

```ts
export function getPersonalEventPresentationV1(
  templateId: string,
  templateVersion: number,
): PersonalEventPresentationV1;

export function validatePersonalEventPresentationCatalogV1(
  templates: readonly PersonalEventTemplateV2[],
  presentations: readonly PersonalEventPresentationV1[],
): readonly PersonalEventPresentationViolationV1[];
```

Validation must reject duplicate identities, missing complete-catalog identities, unknown identities, humorous non-micro roots, humorous roots with pressure cost above 1, and `follow_up` records whose template can occur exogenously. Classify every version of vulnerable existing events as `serious/challenge`; classify every positive bonus/rebate version as `serious/engagement` so `positive_due` can elevate them without adding jokes.

- [ ] **Step 6: Re-run the focused tests and confirm GREEN**

Run the Step 2 command.

Expected: catalog/effect tests pass and every new template is deterministic and frozen.

- [ ] **Step 7: Commit humorous content**

```bash
git add src/data/personal-event-funny-templates-v2.ts src/data/personal-event-presentation-v1.ts src/data/personal-event-templates-v2.ts src/core/__tests__/personal-event-v2.test.ts src/core/__tests__/personal-event-effects-v2.test.ts
git commit -m "Add mixed-tone beginner event catalog"
```

---

## Task 3: Add replay-safe V3 choices for under-specified events

**Files:**

- Create: `src/data/personal-event-expanded-templates-v3.ts`
- Modify: `src/data/personal-event-templates-v2.ts`
- Modify: `src/data/personal-event-presentation-v1.ts`
- Modify: `src/core/__tests__/personal-event-v2.test.ts`
- Modify: `src/core/__tests__/personal-event-effects-v2.test.ts`
- Modify: `src/core/__tests__/event-scheduler-v2.test.ts`
- Modify: `src/server/db/__tests__/run-state-replay-v2.test.ts`

- [ ] **Step 1: Add failing V2/V3 coexistence tests**

Prove all of the following:

```ts
expect(getPersonalEventTemplateV2("personal.medical_bill", 2).responses)
  .toEqual(existingMedicalV2Responses);
expect(getPersonalEventTemplateV2("personal.medical_bill", 3).responses)
  .toHaveLength(4);
expect(getActivePersonalEventTemplateV2("personal.medical_bill").version).toBe(3);
expect(getActivePersonalEventTemplateV2("personal.transport_repair").followUps[0])
  .toMatchObject({ templateVersion: 3 });
```

Add replay coverage that loads and resolves exact V2 medical and transport-follow-up events after V3 activation.

- [ ] **Step 2: Run the focused tests and confirm RED**

```bash
pnpm vitest run src/core/__tests__/personal-event-v2.test.ts src/core/__tests__/personal-event-effects-v2.test.ts src/core/__tests__/event-scheduler-v2.test.ts src/server/db/__tests__/run-state-replay-v2.test.ts
```

Expected: failure because V3 identities are absent.

- [ ] **Step 3: Implement exact V3 response economies**

Create these immutable variants while copying unchanged V2 eligibility, hazard, cooldown, classification, and fallback meaning:

| Active V3 identity | Responses and authoritative effects |
|---|---|
| `personal.medical_bill@3` | `use_insurance`: existing exact claim; `negotiate_bill`: expense `70%`, burnout `+30,000`; `medical_payment_plan`: recurring expense `30%` for 4 months; `pay_uninsured`: expense `100%` |
| `personal.lifestyle_upgrade@3` | `keep_current_lifestyle`: happiness `-20,000`; `trial_upgrade`: recurring expense `83,333 ppm` of annual increase for 3 months; `accept_upgrade`: permanent annual living-cost increase `100%` |
| `personal.performance_bonus@3` | `save_bonus`: cash add `100%`; `celebrate_some`: cash add `70%`, happiness `+25,000`; `spend_most_bonus`: cash add `25%`, happiness `+60,000` |
| `personal.utility_rebate@3` | `claim_rebate`: cash add `100%`; `improve_efficiency`: annual living-cost delta `-60%`, happiness `+10,000`; `donate_rebate`: happiness `+40,000` |
| `personal.transport_repair_followup@3` | `complete_repair`: expense `100%`; `repair_payment_plan`: recurring expense `30%` for 4 months; `temporary_transport`: recurring expense `25%` for 6 months, happiness `-50,000`, burnout `+30,000` |

Add `personal.transport_repair@3` as a bridge copy of V2 with unchanged responses/effects and only its declared follow-up target changed to `personal.transport_repair_followup@3`. This is necessary because exact historical V2 roots must continue scheduling exact V2 follow-ups.

- [ ] **Step 4: Update active metadata without premature production activation**

Add presentation records for all V3 identities. Make `event-scheduler-v2.ts` consume `PRODUCTION_PERSONAL_EVENT_TEMPLATES_V2` by default and accept an injected catalog for candidate tests. The production projection remains historical; Balance Lab will inject `ACTIVE_PERSONAL_EVENT_TEMPLATES_V2`. Retain the complete catalog for exact validation and replay.

- [ ] **Step 5: Re-run the focused tests and confirm GREEN**

Run the Step 2 command.

Expected: all V2 replay and V3 scheduling tests pass.

- [ ] **Step 6: Commit expanded V3 agency**

```bash
git add src/data/personal-event-expanded-templates-v3.ts src/data/personal-event-templates-v2.ts src/data/personal-event-presentation-v1.ts src/core/__tests__/personal-event-v2.test.ts src/core/__tests__/personal-event-effects-v2.test.ts src/core/__tests__/event-scheduler-v2.test.ts src/server/db/__tests__/run-state-replay-v2.test.ts
git commit -m "Add replay-safe expanded event choices"
```

---

## Task 4: Preserve follow-up provenance and show authoritative response previews

**Files:**

- Modify: `src/core/game-state-v2.ts`
- Modify: `src/core/game-state-v2-event-validation.ts`
- Modify: `src/core/personal-event-effects-v2.ts`
- Modify: `src/core/event-lifecycle-v2.ts`
- Create: `src/application/game/personal-event-response-preview-v1.ts`
- Create: `src/application/game/__tests__/personal-event-response-preview-v1.test.ts`
- Modify: `src/application/game/run-view.ts`
- Modify: `src/application/game/__tests__/run-view.test.ts`
- Modify: `src/contracts/api/contracts.ts`
- Modify: `src/contracts/api/__tests__/contracts.test.ts`
- Modify: `src/features/board/board-model.ts`
- Modify: `src/features/board/hud.tsx`
- Modify: `src/features/board/__tests__/planning-surfaces.test.tsx`
- Modify: `src/core/__tests__/event-lifecycle-v2.test.ts`

- [ ] **Step 1: Add failing provenance and preview tests**

Cover:

- A follow-up queued from `ignore_inspector` retains the root `eventId` through pending and resolved evidence.
- Historical pending/resolved records without provenance still validate.
- A 30%-for-four-month response previews the sampled monthly amount and 120% total.
- The lamp root preview discloses the 2-month follow-up and resale range 0–25,000 cents.
- The lamp follow-up uses root cost basis and sampled proceeds to label a gain, loss, or break-even.
- An unavailable insurance response stays visible with `enabled: false` and cannot be submitted.
- Preview failure does not remove the pending event and disables confirmation.

Use this wire shape:

```ts
export type PersonalEventResponsePreviewV1 = Readonly<{
  version: "personal-event-response-preview-v1";
  status: "available" | "unavailable" | "error";
  immediateCashChangeCents: number;
  recurringCashFlows: readonly Readonly<{
    direction: "expense" | "income";
    monthlyCents: number;
    durationMonths: number;
    totalCents: number;
  }>[];
  annualLivingCostChangeCents: number;
  wellbeingChangesPpm: Readonly<{
    happiness: number;
    burnout: number;
  }>;
  followUps: readonly Readonly<{
    templateId: string;
    templateVersion: number;
    delayMonths: number;
    parameterRanges: Readonly<Record<string, Readonly<{
      minimum: number;
      maximum: number;
    }>>>;
  }>[];
  netOutcomeCents: number | null;
  unavailableReason: string | null;
  summary: string;
}>;
```

- [ ] **Step 2: Run the focused tests and confirm RED**

```bash
pnpm vitest run src/application/game/__tests__/personal-event-response-preview-v1.test.ts src/application/game/__tests__/run-view.test.ts src/contracts/api/__tests__/contracts.test.ts src/features/board/__tests__/planning-surfaces.test.tsx src/core/__tests__/event-lifecycle-v2.test.ts
```

Expected: failure because provenance, preview fields, and disabled choices are absent.

- [ ] **Step 3: Carry optional follow-up provenance through state**

Add `followUpSourceEventId?: string` to `PendingEventV2` and `ResolvedEventEvidenceV2`. When `queueScheduledDeclarativePersonalEventV2` receives `scheduled.followUpSourceEventId`, copy it to pending evidence; copy it again on resolution. Validate that a present source ID is non-empty and references an earlier resolved event. Absence remains valid for historical state.

- [ ] **Step 4: Reuse authoritative effect resolution for previews**

Export the existing mitigation query as:

```ts
export function isPersonalEventMitigationAvailableV2(
  state: GameStateV2,
  template: PersonalEventTemplateV2,
  mitigationId: string,
): boolean;
```

Implement:

```ts
export function projectPersonalEventResponsePreviewV1(
  state: GameStateV2,
  pending: NonNullable<GameStateV2["gameplay"]["eventLifecycle"]["pending"]>,
  template: PersonalEventTemplateV2,
  responseId: string,
  completeCatalog?: readonly PersonalEventTemplateV2[],
): PersonalEventResponsePreviewV1;
```

Call `resolvePersonalEventResponseV2` with a stable preview-only command ID and the pending proposal. Treat duration-one scheduled income/expense as `immediateCashChangeCents`; expose only duration-greater-than-one flows in `recurringCashFlows`, with `totalCents = monthlyCents * durationMonths`. Derive annual delta and wellbeing from before/after state, and declared follow-up ranges from the exact target template. Do not persist the returned resolution. For lamp follow-up `netOutcomeCents`, subtract root `purchase_price_cents + restoration_cost_cents` from sampled `resale_proceeds_cents` by following `followUpSourceEventId` into history.

- [ ] **Step 5: Replace prose-only choices with structured choices**

Extend each run-view/API/board choice to:

```ts
Readonly<{
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  preview: PersonalEventResponsePreviewV1;
}>
```

Remove the duplicate `resolveMagnitude`, `describePersonalEventEffect`, and `describePersonalEventResponse` logic from `run-view.ts`. The description becomes the preview summary. The HUD displays immediate change, each recurring monthly/total amount, annual-cost change, wellbeing direction, and disclosed follow-ups. Disable the response button unless `preview.status === "available"`.

- [ ] **Step 6: Re-run the focused tests and confirm GREEN**

Run the Step 2 command.

Expected: all preview, contract, board, and lifecycle tests pass.

- [ ] **Step 7: Commit transparent response previews**

```bash
git add src/core/game-state-v2.ts src/core/game-state-v2-event-validation.ts src/core/personal-event-effects-v2.ts src/core/event-lifecycle-v2.ts src/application/game/personal-event-response-preview-v1.ts src/application/game/__tests__/personal-event-response-preview-v1.test.ts src/application/game/run-view.ts src/application/game/__tests__/run-view.test.ts src/contracts/api/contracts.ts src/contracts/api/__tests__/contracts.test.ts src/features/board/board-model.ts src/features/board/hud.tsx src/features/board/__tests__/planning-surfaces.test.tsx src/core/__tests__/event-lifecycle-v2.test.ts
git commit -m "Show authoritative event choice previews"
```

---

## Task 5: Implement the safety-bounded beginner cadence evaluator

**Files:**

- Create: `src/core/beginner-event-cadence-v1.ts`
- Create: `src/core/__tests__/beginner-event-cadence-v1.test.ts`
- Modify: `src/core/monthly-turn-v2.ts`
- Modify: `src/core/__tests__/monthly-turn-v2.test.ts`
- Modify: `src/core/runtime-balance-controller-v2.ts`
- Modify: `src/core/__tests__/runtime-balance-controller-v2.test.ts`
- Modify: `src/core/scenario-director-context-v2.ts`
- Modify: `src/server/ai/world-director-service.ts`
- Modify: `src/server/ai/__tests__/world-director-service.test.ts`

- [ ] **Step 1: Add failing pure cadence tests**

Define and test these interfaces:

```ts
export const BEGINNER_EVENT_CADENCE_V1_VERSION =
  "beginner-event-cadence-v1" as const;

export type BeginnerEventCadenceModeV1 =
  | "inactive"
  | "pending_or_terminal"
  | "follow_up_due"
  | "positive_due"
  | "engagement_due"
  | "open"
  | "recovery_preferred";

export type BeginnerEventCadenceAssessmentV1 = Readonly<{
  version: typeof BEGINNER_EVENT_CADENCE_V1_VERSION;
  mode: BeginnerEventCadenceModeV1;
  chapterMonth: number;
  quietEligibleStreak: number;
  eventMonthStreak: number;
  rootEventStreak: number;
  positiveObserved: boolean;
  previousRootTone: PersonalEventPresentationToneV1 | null;
  reasonCodes: readonly string[];
}>;

export type BeginnerEventCadenceEvidenceV1 = Readonly<{
  assessment: BeginnerEventCadenceAssessmentV1;
  inputCandidateIds: readonly string[];
  outputCandidateIds: readonly string[];
  preferredCandidateIds: readonly string[];
  scheduledTemplateId: string | null;
  safetyOverride: boolean;
}>;
```

Test chapter months 1 and 12 as active and month 13 as inactive; pending and terminal suppression; due follow-up priority; `positive_due` from month 9; `engagement_due` after one eligible quiet month; `recovery_preferred` after two consecutive root-event months; and no adjacent absurd roots.

- [ ] **Step 2: Run cadence/controller tests and confirm RED**

```bash
pnpm vitest run src/core/__tests__/beginner-event-cadence-v1.test.ts src/core/__tests__/monthly-turn-v2.test.ts src/core/__tests__/runtime-balance-controller-v2.test.ts src/server/ai/__tests__/world-director-service.test.ts
```

Expected: failure because the cadence module and evidence do not exist.

- [ ] **Step 3: Implement pure assessment from authoritative history**

Implement:

```ts
export function assessBeginnerEventCadenceV1(
  state: GameStateV2,
  presentations?: readonly PersonalEventPresentationV1[],
): BeginnerEventCadenceAssessmentV1;
```

Use `monthsBetween(state.startMonth, state.currentMonth) + 1` for the chapter month. Compute `eventMonthStreak` from distinct scheduled months containing either roots or follow-ups and `rootEventStreak` from months whose metadata role is not `follow_up`. Compute quiet streak from calendar months since the last resolved/scheduled event while the run was active. Positive observation means an exact history entry with classification `positive`; the laboratory later combines this with measured nonfatal recovery. Apply precedence: inactive → pending/terminal → due follow-up → recovery preferred → positive due → engagement due → open. Recovery preference begins after two consecutive event months, including a root followed by its disclosed follow-up.

- [ ] **Step 4: Implement deterministic candidate filtering**

Implement:

```ts
export function applyBeginnerEventCadenceV1(
  assessment: BeginnerEventCadenceAssessmentV1,
  candidates: readonly DeclarativePersonalEventCandidateV2[],
  presentations?: readonly PersonalEventPresentationV1[],
): Readonly<{
  candidates: readonly DeclarativePersonalEventCandidateV2[];
  preferredCandidateIds: readonly string[];
}>;
```

Rules:

- `follow_up_due`: keep only exact follow-up candidates.
- `positive_due`: if positive candidates exist, keep only those; otherwise retain the original set so a safe serious event can still occur.
- `recovery_preferred`: remove all new root candidates, producing a quiet month when no due follow-up exists.
- Before mode-specific filtering, remove absurd roots whenever the previous root was absurd; this applies to `positive_due`, `engagement_due`, and `open`.
- `engagement_due`: if remaining humorous engagement roots exist, keep only those; otherwise retain the remaining original set.
- `open`: retain all remaining candidates.
- Every mode uses a stable original-order filter; it never adds a candidate.

- [ ] **Step 5: Separate complete and active catalogs in the monthly kernel**

Change dependencies to:

```ts
type MonthlyTurnV2Dependencies = Readonly<{
  eventSchedulingPolicy?: EventSchedulingPolicyV2;
  macroStoryPolicy?: MacroStoryPolicyV2;
  personalEventCatalog?: readonly PersonalEventTemplateV2[];
  activePersonalEventCatalog?: readonly PersonalEventTemplateV2[];
  beginnerEventCadenceVersion?:
    | typeof BEGINNER_EVENT_CADENCE_V1_VERSION
    | null;
}>;
```

Use the complete catalog for state validation, exact queueing, and historical context. Use the injected active catalog for root candidate generation, named opportunity/parameter evidence, Scenario Director candidates, and world-director exposure; default this dependency to `PRODUCTION_PERSONAL_EVENT_TEMPLATES_V2`. Balance Lab explicitly injects `ACTIVE_PERSONAL_EVENT_TEMPLATES_V2`. Apply cadence filtering immediately after candidate generation and before constructing Scenario Director input. Add optional `beginnerEventCadence` evidence to `MonthlyTurnV2Record`; set `safetyOverride` only when a due cadence mode had preferred candidates but Runtime Balance approved none.

- [ ] **Step 6: Add the explicit funny challenge ceiling**

After the existing impact estimate and before approval, reject a humorous root whose guided assessment band is `crisis`, `extreme`, or `above_limit`. Add a distinct `FUNNY_ROOT_ABOVE_MEANINGFUL` rejection code. Do not change any existing threshold or unavoidable-failure rejection.

- [ ] **Step 7: Keep production activation gated**

Export:

```ts
export const ACTIVE_BEGINNER_EVENT_CADENCE_VERSION:
  typeof BEGINNER_EVENT_CADENCE_V1_VERSION | null = null;
```

Use this as the monthly dependency default. Balance Lab and focused tests explicitly inject `BEGINNER_EVENT_CADENCE_V1_VERSION` until Task 9 proves activation is safe.

- [ ] **Step 8: Re-run cadence/controller tests and confirm GREEN**

Run the Step 2 command.

Expected: cadence, catalog separation, director, and controller tests pass; identical seeds yield identical candidate/evidence fingerprints.

- [ ] **Step 9: Commit the gated cadence engine**

```bash
git add src/core/beginner-event-cadence-v1.ts src/core/__tests__/beginner-event-cadence-v1.test.ts src/core/monthly-turn-v2.ts src/core/__tests__/monthly-turn-v2.test.ts src/core/runtime-balance-controller-v2.ts src/core/__tests__/runtime-balance-controller-v2.test.ts src/core/scenario-director-context-v2.ts src/server/ai/world-director-service.ts src/server/ai/__tests__/world-director-service.test.ts
git commit -m "Add safety-bounded beginner event cadence"
```

---

## Task 6: Give each Balance Lab bot a distinct valid response policy

**Files:**

- Modify: `src/lab/balance-lab-v1-bots.ts`
- Modify: `src/lab/__tests__/balance-lab-v1-bots.test.ts`
- Modify: `src/lab/__tests__/balance-lab-v1.production-owners.integration.test.ts`

- [ ] **Step 1: Add failing policy-coverage and differentiation tests**

For every active root template, assert that prepared, average, and reckless maps contain a response ID present in that exact active template. Assert that average is not the same object or full mapping as prepared. Keep random control on `random_valid_choice` and prove it samples only currently available IDs from the lab RNG.

- [ ] **Step 2: Run the focused bot tests and confirm RED**

```bash
pnpm vitest run src/lab/__tests__/balance-lab-v1-bots.test.ts src/lab/__tests__/balance-lab-v1.production-owners.integration.test.ts
```

Expected: failure for missing roots and the current average/prepared alias.

- [ ] **Step 3: Implement explicit mappings**

Use these choices for the new/expanded events:

| Template ID | Prepared | Average | Reckless |
|---|---|---|---|
| `personal.medical_bill` | `use_insurance` when available, otherwise `negotiate_bill` | `medical_payment_plan` | `pay_uninsured` |
| `personal.lifestyle_upgrade` | `keep_current_lifestyle` | `trial_upgrade` | `accept_upgrade` |
| `personal.performance_bonus` | `save_bonus` | `celebrate_some` | `spend_most_bonus` |
| `personal.utility_rebate` | `improve_efficiency` | `claim_rebate` | `donate_rebate` |
| `personal.transport_repair_followup` | `complete_repair` | `repair_payment_plan` | `temporary_transport` |
| `personal.subscription_archaeology` | `cancel_all` | `keep_favorite` | `keep_digital_fossils` |
| `personal.group_chat_gift` | `make_gift` | `contribute_full` | `contribute_full` |
| `personal.countertop_gadget_sale` | `skip_gadget` | `buy_basic` | `four_month_plan` |
| `personal.double_grocery_delivery` | `return_duplicate` | `share_duplicate` | `keep_duplicate` |
| `personal.mascot_side_hustle` | `work_one_shift` | `work_one_shift` | `work_weekend` |
| `personal.laundry_final_spin` | `diy_repair` | `use_laundromat` | `hire_repairer` |
| `personal.raccoon_sanitation` | `build_trash_armor` | `hire_cleanup` | `ignore_inspector` |
| `personal.rare_yard_sale_lamp` | `walk_away` | `buy_and_keep` | `buy_restore_and_list` |

Map follow-up-only templates too so simulations never fall back: prepared chooses pay/DIY lower total cost, average chooses payment plan where present, reckless chooses deferral/financing; the lamp follow-up always uses `sell_lamp` because it has one valid resolution.

For insurance-dependent prepared behavior, select the mapped choice only when available; otherwise use the declared fallback `negotiate_bill`. Generalize the bot response resolver to support an ordered list of preferred IDs rather than inventing a response.

- [ ] **Step 4: Re-run bot tests and confirm GREEN**

Run the Step 2 command.

Expected: every active template is covered, all selected choices are valid/available, and bot intent differs meaningfully.

- [ ] **Step 5: Commit bot policies**

```bash
git add src/lab/balance-lab-v1-bots.ts src/lab/__tests__/balance-lab-v1-bots.test.ts src/lab/__tests__/balance-lab-v1.production-owners.integration.test.ts
git commit -m "Differentiate beginner event response bots"
```

---

## Task 7: Add engagement and safety evidence to Balance Lab

**Files:**

- Modify: `src/lab/balance-lab-v1-runner.ts`
- Modify: `src/lab/balance-lab-v1-production.ts`
- Modify: `src/lab/balance-lab-v1-metrics.ts`
- Modify: `src/lab/balance-lab-v1-config.ts`
- Modify: `src/lab/balance-lab-v1-contracts.ts`
- Modify: `src/lab/balance-lab-v1-reports.ts`
- Modify: `balance-lab.config.json`
- Modify: `src/lab/__tests__/balance-lab-v1-runner.test.ts`
- Modify: `src/lab/__tests__/balance-lab-v1-metrics.test.ts`
- Modify: `src/lab/__tests__/balance-lab-v1-config-acceptance-reports.test.ts`
- Modify: `src/lab/__tests__/balance-lab-v1.production-owners.integration.test.ts`

- [ ] **Step 1: Add failing evidence reconciliation tests**

Extend `eventDecisionEvidence` with exact version, scheduled month, tone, cadence role, classification, challenge band, follow-up source, and response availability. Extend run metrics with cadence evidence copied from monthly records.

Assert a hand-built cohort produces these exact summary fields:

```ts
type BalanceLabBeginnerEngagementSummaryV1 = Readonly<{
  medianTotalPromptCount: number | null;
  medianMeaningfulDecisionCount: number | null;
  atLeastSixMeaningfulDecisionRate: BalanceLabRateV1;
  medianUniqueDecisionTemplateCount: number | null;
  medianHumorousRootCount: number | null;
  medianAbsurdRootCount: number | null;
  positiveOrRecoveryBeatRate: BalanceLabRateV1;
  adjacentAbsurdViolationCount: number;
  rootEventStreakViolationCount: number;
  funnyRootAboveMeaningfulCount: number;
  preparedFunnyUnavoidableFailureCount: number;
  safetyOverrideCount: number;
  playerCausedFollowUpCount: number;
  distinctResponseCount: number;
}>;
```

Count a meaningful decision only when at least three responses are materially available. Count every resolved event as a prompt, including one-response follow-ups. Count roots and player-caused follow-ups separately.

- [ ] **Step 2: Run Balance Lab tests and confirm RED**

```bash
pnpm vitest run src/lab/__tests__/balance-lab-v1-runner.test.ts src/lab/__tests__/balance-lab-v1-metrics.test.ts src/lab/__tests__/balance-lab-v1-config-acceptance-reports.test.ts src/lab/__tests__/balance-lab-v1.production-owners.integration.test.ts
```

Expected: failure because engagement evidence and metric IDs are absent.

- [ ] **Step 3: Collect production-owned evidence**

Have `balance-lab-v1-production.ts` run the candidate cadence version explicitly and copy monthly cadence evidence without recomputing it. Join each history event to exact presentation metadata and the corresponding approved challenge evidence. Attribute an unavoidable failure to a funny event only when the failure follows a funny root and the existing causal impact sample identifies that event; never infer attribution from mere temporal proximity.

- [ ] **Step 4: Implement summaries and acceptance metric IDs**

Register and evaluate:

- `beginner_median_total_prompt_count`
- `beginner_median_meaningful_decision_count`
- `beginner_at_least_six_meaningful_decision_rate_ppm`
- `beginner_median_unique_decision_template_count`
- `beginner_median_humorous_root_count`
- `beginner_median_absurd_root_count`
- `beginner_positive_or_recovery_beat_rate_ppm`
- `beginner_adjacent_absurd_violation_count`
- `beginner_root_event_streak_violation_count`
- `beginner_funny_root_above_meaningful_count`
- `beginner_prepared_funny_unavoidable_failure_count`

Keep all existing beginner outcome and runtime metrics blocking.

- [ ] **Step 5: Add the approved thresholds**

Replace the old 3–5 median-decision pair with 6–8 and add these beginner-only rules:

| Metric | Comparator | Threshold | Minimum samples |
|---|---|---:|---:|
| median total prompts | at least / at most | 8 / 10 | 200 |
| median meaningful decisions | at least / at most | 6 / 8 | 200 |
| at least six meaningful decisions | at least | 750,000 ppm | 200 |
| median unique decision templates | at least | 5 | 200 |
| median humorous roots | at least / at most | 4 / 6 | 200 |
| median absurd roots | at least / at most | 1 / 2 | 200 |
| positive or recovery beat | at least | 900,000 ppm | 200 |
| adjacent absurd violations | equals | 0 | 200 |
| root event-streak violations | equals | 0 | 200 |
| funny roots above meaningful | equals | 0 | 200 |
| prepared funny unavoidable failures | equals | 0 | 200 |

- [ ] **Step 6: Update strict report validation and renderers**

Reject reports missing any new required field. Add per-run CSV columns for total prompts, meaningful decisions, unique templates, humorous roots, absurd roots, follow-ups, cadence violations, and safety overrides. Add a Markdown “Beginner engagement” table showing every new observed value next to its threshold.

- [ ] **Step 7: Re-run Balance Lab tests and confirm GREEN**

Run the Step 2 command.

Expected: raw evidence reconciles exactly with summaries, reports round-trip, and all acceptance decisions use production-owned counts.

- [ ] **Step 8: Commit laboratory gates**

```bash
git add src/lab/balance-lab-v1-runner.ts src/lab/balance-lab-v1-production.ts src/lab/balance-lab-v1-metrics.ts src/lab/balance-lab-v1-config.ts src/lab/balance-lab-v1-contracts.ts src/lab/balance-lab-v1-reports.ts balance-lab.config.json src/lab/__tests__/balance-lab-v1-runner.test.ts src/lab/__tests__/balance-lab-v1-metrics.test.ts src/lab/__tests__/balance-lab-v1-config-acceptance-reports.test.ts src/lab/__tests__/balance-lab-v1.production-owners.integration.test.ts
git commit -m "Gate beginner event engagement metrics"
```

---

## Task 8: Run focused integration, determinism, and full verification

**Files:**

- Modify when a failing assertion exposes an implementation defect: only the source/test files already named in Tasks 1–7.

- [ ] **Step 1: Run the full focused event stack**

```bash
pnpm vitest run src/core/__tests__/personal-event-v2.test.ts src/core/__tests__/personal-event-effects-v2.test.ts src/core/__tests__/event-lifecycle-v2.test.ts src/core/__tests__/event-scheduler-v2.test.ts src/core/__tests__/beginner-event-cadence-v1.test.ts src/core/__tests__/runtime-balance-controller-v2.test.ts src/core/__tests__/monthly-turn-v2.test.ts src/server/db/__tests__/run-state-replay-v2.test.ts src/server/ai/__tests__/world-director-service.test.ts src/application/game/__tests__/personal-event-response-preview-v1.test.ts src/application/game/__tests__/run-view.test.ts src/contracts/api/__tests__/contracts.test.ts src/features/board/__tests__/planning-surfaces.test.tsx src/lab/__tests__/balance-lab-v1-bots.test.ts src/lab/__tests__/balance-lab-v1-runner.test.ts src/lab/__tests__/balance-lab-v1-metrics.test.ts src/lab/__tests__/balance-lab-v1-config-acceptance-reports.test.ts src/lab/__tests__/balance-lab-v1.production-owners.integration.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 2: Run static validation**

```bash
pnpm lint
pnpm typecheck
pnpm check:test-layout
```

Expected: zero lint errors, zero TypeScript errors, and valid test layout.

- [ ] **Step 3: Run regular and long-run tests separately**

```bash
pnpm test:parallel
pnpm test:long-run
```

Expected: both suites pass. If Windows reports `spawn EPERM`, record it as an environment failure and rerun the exact command after closing competing local Node processes; do not weaken test thresholds or skip files.

- [ ] **Step 4: Build the production bundle**

```bash
pnpm build
```

Expected: Next.js production build succeeds.

- [ ] **Step 5: Inspect only the intended diff**

```bash
git status --short
git diff --check
```

Expected: no whitespace errors; `.agents/` and `skills-lock.json` remain untracked and unchanged.

- [ ] **Step 6: Commit verification fixes if any were required**

Only when Steps 1–4 required a source correction:

```bash
git add src docs balance-lab.config.json
git commit -m "Harden funny event integration"
```

Do not run this commit step when the worktree has no implementation corrections.

---

## Task 9: Calibrate 200 matched seeds and activate only on a complete pass

**Files:**

- Create: `docs/superpowers/results/2026-07-18-funny-event-rhythm.md`
- Modify on complete pass only: `src/core/beginner-event-cadence-v1.ts`
- Modify on complete pass only: `src/data/personal-event-templates-v2.ts`

- [ ] **Step 1: Run the authoritative beginner cohort**

```bash
pnpm balance:beginner
```

Expected: 200 matched seeds per configured persona/bot cohort, deterministic fingerprints, and a generated JSON/CSV/Markdown report.

- [ ] **Step 2: Re-run and prove determinism**

```bash
pnpm balance:beginner
```

Expected: the deterministic production-result fingerprint matches Step 1 exactly. Wall-clock/report fingerprints may differ only in documented observational fields.

- [ ] **Step 3: Record outcome and engagement evidence**

Write `docs/superpowers/results/2026-07-18-funny-event-rhythm.md` with:

- commit and source hash;
- both deterministic fingerprints;
- run count and persona/bot matrix;
- every existing beginner outcome gate;
- every new engagement/safety gate;
- completion, fragile, and bankruptcy distributions;
- prepared/average/reckless differentiation;
- safety override and player-caused follow-up counts;
- a final `activate` or `do not activate` decision.

- [ ] **Step 4: Apply the activation rule**

If and only if every blocking rule passes, change:

```ts
export const ACTIVE_BEGINNER_EVENT_CADENCE_VERSION =
  BEGINNER_EVENT_CADENCE_V1_VERSION;
```

and change `PERSONAL_EVENT_SCHEDULING_SELECTION_V2` from `"historical-v2"` to `"highest-supported"`, which makes the active scheduling catalog the production default. If any rule fails, leave the cadence constant `null`, retain `"historical-v2"`, and document the failed observed values without tuning around a single seed.

- [ ] **Step 5: Verify the selected production path**

On activation, rerun:

```bash
pnpm vitest run src/core/__tests__/monthly-turn-v2.test.ts src/lab/__tests__/balance-lab-v1.production-owners.integration.test.ts
pnpm typecheck
pnpm build
```

Expected: production defaults use the candidate cadence and active catalog; tests, types, and build pass.

On non-activation, run:

```bash
pnpm typecheck
```

Expected: the gated candidate remains available to the lab while production behavior remains unchanged.

- [ ] **Step 6: Commit the evidence and justified selection**

For a complete pass:

```bash
git add docs/superpowers/results/2026-07-18-funny-event-rhythm.md src/core/beginner-event-cadence-v1.ts src/data/personal-event-templates-v2.ts src/core/monthly-turn-v2.ts src/core/event-scheduler-v2.ts
git commit -m "Activate calibrated beginner event rhythm"
```

For any blocking failure:

```bash
git add docs/superpowers/results/2026-07-18-funny-event-rhythm.md
git commit -m "Record beginner event rhythm calibration"
```

---

## Completion Checklist

- [ ] Historical V2 lookup, resolution, serialized replay, and declared V2 follow-ups remain exact.
- [ ] New scheduling sees one highest version per template ID and never schedules a follow-up exogenously.
- [ ] Eight humorous roots, two humorous follow-ups, and all expanded V3 choices validate and are deeply frozen.
- [ ] Every counted decision has at least three materially distinct available choices.
- [ ] The UI discloses immediate, recurring, total, annual, wellbeing, and follow-up consequences before submission.
- [ ] Cadence never adds an ineligible candidate and never bypasses Runtime Balance rejection.
- [ ] Due follow-ups win the slot, absurd roots are not adjacent, and no third consecutive root-event month is allowed.
- [ ] Prepared, average, reckless, and random bot behavior is valid and observably distinct.
- [ ] Balance Lab evidence reconciles with all engagement and financial outcome metrics.
- [ ] Focused tests, lint, typecheck, regular tests, long-run tests, and build pass or any environment-only failure is documented without weakening coverage.
- [ ] Production activation is supported by two identical 200-seed deterministic cohort fingerprints and a complete blocking-gate pass.
