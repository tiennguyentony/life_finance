# Nemesis Mode v1 design

## Purpose

Nemesis Mode is an opt-in adversarial game mode.
A rival AI villain studies the run's authoritative risk snapshot each month, picks the next life event from the engine's already-safe candidate list, and taunts the player with the reasoning behind the attack.
The villain's objective is not to minimize net worth; it is to maximize teaching pressure on the player's weakest evidenced financial defense while staying inside every existing fairness gate.
The attack targeting is the lesson: when Debtzilla says it chose a transport breakdown because the emergency fund covers 1.4 months, the player learns exactly which defense to build.
The mode reuses the already-shipped `hostile_fed` AI contract, prompt, and semantic validation in `src/server/ai/contracts.ts` and `src/server/ai/client.ts`; nothing in this design grants AI any new financial authority.

## Product decisions

- The mode is named Nemesis Mode in player-facing copy and is off by default.
- The player enables it at run creation and picks one villain; the default villain is Debtzilla.
- Nemesis Mode requires `runtimeBalanceDifficulty` of `normal` or `hard`; it is not offered on the guided beginner path, so the beginner cadence acceptance bands are unaffected.
- v1 villains are the three wired banter cast members with existing art: `debtzilla`, `inflato`, and `impulso` from `CHARACTER_BANTER_IDS`.
- v1 is selection-only: the villain chooses which safe event fires and writes the taunt, while the engine keeps full authority over event parameters.
- The villain acts in at most 2 of any 3 consecutive months, mirroring the banter quiet-month rhythm, so the run keeps room to breathe.
- The maximum severity tier the villain may offer scales inversely with player fragility: resilient players face bigger swings, fragile players are protected.
- The villain can be defeated: sustained defense of its targeted metrics retires it with a celebration, which turns the mode into a winnable game rather than a difficulty slider.
- Any AI failure is silent: the month proceeds with the standard director and no taunt, never a repeated hardcoded villain line.

## The nemesis cast

Each villain has a targeting profile over the 14 `RiskMetricId` values in `src/core/risk-v1.ts` and a set of favored event categories from `PersonalEventCategoryV2`.
The profile is expressed as prompt weighting plus an `offered candidate` preference; it is never a hard filter, and semantic validation only enforces membership in the offered safe set.

### Debtzilla

- Identity: a kaiju that grows when balances revolve; gleeful about compounding.
- Targeted metrics: `debt_service_ratio`, `high_interest_debt_burden`, `interest_burden`, `liquid_resource_coverage`.
- Favored categories: `maintenance`, `housing`, `health`; bill-shaped negative events such as `personal.transport_repair`, `personal.medical_bill`, `personal.rent_renewal`.
- Voice: heavy footsteps, short sentences, delighted by minimum payments.
- Sample taunts: "A 31 percent debt service ratio? I could nap on that pile. Here comes something with a repair invoice." and "Your card is carrying 82 percent of its limit. I brought a hospital bill to keep it company."

### Inflato

- Identity: a balloon that inflates every recurring cost it touches.
- Targeted metrics: `fixed_cost_ratio`, `lifestyle_rigidity`, `insurance_protection_gap`, `emergency_fund_months`.
- Favored categories: `housing`, `caregiving`, `social`; recurring-cost and coverage-gap events such as `personal.rent_renewal`, `personal.family_care_request`, `personal.social_commitment`.
- Voice: airy, drawn-out vowels, obsessed with the word "monthly".
- Sample taunts: "Fixed costs eat 68 percent of your income and rent season is here. Breathe in!" and "No renters coverage since March? Inflating one soggy surprise."

### Impulso

- Identity: a fast-talking salesman who attacks with temptation instead of bills.
- Targeted metrics: `recent_financial_stress`, `monthly_free_cash_flow`, `portfolio_concentration`.
- Favored categories: `behavioral_trap`, `opportunity`; bait events such as `personal.lifestyle_upgrade`, `personal.countertop_gadget_sale`, `personal.subscription_archaeology`.
- Voice: exclamation-heavy, limited-time-only energy.
- Sample taunts: "Free cash flow of 410 a month and stress trending up? Have I got a deal for you." and "Your portfolio is 71 percent one sector. Here is a once-in-a-lifetime chance to make that worse."

### Shared copy rules

Taunt copy follows the banter audit rules: it must cite at least one supplied evidence id, may not invent amounts absent from evidence, may not use advice-like wording, and may not reference the event's hidden response options.
Tone is playful-menacing about the simulation, never shaming about real life; copy speaks about run numbers, not about the person.
Headlines are capped by the existing `shortText` limit and the repetition guard reuses `repeatsRecentBanter` against the villain's recent lines.

## Game loop rules

- Month 1 of a nemesis run is always a scouting month: no selection override and no AI call; the run-start screen shows a static persona introduction line instead.
- Attack cadence: a run-seeded phase allows attacks in at most 2 of any 3 consecutive months; quiet months make no `hostile_fed` call at all.
- Severity ceiling by resilience, read from `RiskSnapshotV1.aggregateSeverityPpm` at request-build time: at or above 600000 the offered list is capped at `micro`; from 350000 the cap is `medium`; from 150000 the cap is `large`; below 150000 `catastrophe` candidates may be offered.
- The ceiling thresholds are tunable constants validated by the balance-lab nemesis cohort before release.
- Focus-fire rule: after the same `targetedWeaknessId` lands 2 consecutive attacks, candidates targeting it are removed from the next offered list, forcing rotation; engine-side template cooldowns and `maximumOccurrences` still apply beneath this.
- Villain power meter: `powerPpm` is the severity-weighted mean of the villain's targeted metrics from the current risk snapshot, computed server-side and exposed on the run view; defending those metrics visibly drains it.
- Defeat condition: once at least 1 attack has landed, 3 consecutive month closes with every targeted metric at band `none` or `low` retire the villain; `defeatedAtMonth` is recorded, a celebration plays, and the mode stops attacking while the run continues normally.
- Nemesis progress is deterministic state, not AI state: `gameplay.nemesis` holds `{ schemaVersion: 1, enabled, nemesisId, attacksLanded, consecutiveCalmMonths, defeatedAtMonth }` and is updated inside the monthly turn purely from the risk snapshot.

## Architecture

Selection follows the two-phase advisory pattern already proven by `validated_ai_ranking` in `GameplayDirectorService` (`src/server/ai/gameplay-director-service.ts`) and `scenario-director-ai-adapter-v2.ts`: the server computes an AI decision before invoking the engine, and the deterministic core re-validates it before applying.

1. Request build (server, pre-engine): `analyzeRiskV1(state)` supplies `weaknesses` as `{ id, severityPpm, evidence }` triples from `RiskFactV1` facts; the safe prepared candidates (`impact !== null && rejectionCodes.length === 0` from `prepareRuntimeBalanceCandidatesV2`) are mapped to the `hostile_fed` candidate shape with `tier` from `severityTier` and `teachingPrinciple` from the primary lesson tag.
2. The offered list applies, in order: the cadence gate, the severity ceiling, the focus-fire filter, and persona category weighting, then caps at the contract maximum of 24.
3. Parameter authority stays with the engine by construction: each candidate's parameter bounds are sent degenerate, with `minimum` and `maximum` both set to the engine-chosen value, so the existing bounds validation in `validateRoleSemantics` makes any model-chosen variation invalid.
4. A candidate-set checksum is computed the same way `scenario_director` computes `candidateSetChecksum`.
5. The `hostile_fed` call goes through the existing `AiRoleClient` (`getAiRoleClient`), so provider selection, model routing to `gpt-5.6-sol`, transports, and audit wiring are unchanged.
6. The validated decision enters `processMonthlyTurnV2` through the same override channel used by `validated_ai_ranking`; the core regenerates candidates, verifies the checksum, re-checks that the chosen candidate is still in the safe set, and applies the override as a new `rankingSource` literal `"nemesis_ai_selection"` added to the union in `src/core/scenario-director-v2.ts`.
7. On success the core also updates `gameplay.nemesis` counters and persists `nemesisSelectionEvidence` on the monthly record as a sibling of `operationalEventRankerEvidence`, carrying `{ templateId, templateVersion, targetedWeaknessId, citedEvidenceIds, candidateSetChecksum, latencyMs, source, fallbackReason }`, with a matching Zod schema next to the existing evidence schema in `src/server/api/contracts-v2.ts`.
8. The taunt (`headline`, `narrative`, `rationale`, `targetedWeaknessId`, `citedEvidenceIds`, `nemesisId`) attaches to the pending event through the existing `aiNarrative` attachment point on `PendingEventV2`; if the current shape cannot carry the extra fields, it is extended rather than duplicated.

Run flag plumbing: `NativeGameStateV2Input` gains an optional `nemesis` config beside the existing optional `runtimeBalanceDifficulty`; `RunService.createRun` defaults it off next to the hardcoded difficulty default; `CreateRunV2Request` gains the optional field; `game-state-v2-validation.ts` validates it; the demo entry route accepts a nemesis parameter.
Because the flag rides inside the `currentState` jsonb, the in-memory demo repository needs zero changes and cross-device restore works unchanged.
Database change: one drizzle migration extends the `ai_audit_records` role CHECK to include `hostile_fed`.
No new public HTTP route exists; the run view wire gains a read-only nemesis block `{ enabled, nemesisId, powerPpm, defeated, lastHeadline }`.

## Trust boundary and fairness

The villain may only select among engine-certified safe candidates; it cannot invent an effect, amount, response, event parameter, or account mutation, per the effect-authority rule in `docs/product/event-reward-penalty-matrix.md` and the `hostile_fed` branch of `validateRoleSemantics`.
Checksum mismatch, an out-of-set pick, an out-of-bounds parameter, a failed evidence-subset check, a rejected taunt, or a timeout all fall back to the standard deterministic director with a recorded `fallbackReason` and no player-visible villain output.
The beginner cadence filter and every runtime-balance rejection gate run upstream of the villain and are never bypassed.
Selection-only authority plus degenerate parameter bounds mean a hostile model prompt-injected to maximize damage can still only reorder events the engine already certified as fair and recoverable.
The interactive free-text event flow, its fairness guard, and its turn limits are unchanged; the villain never participates in that conversation.

## Latency and fallback policy

- At most one structured `hostile_fed` request per attack month, made before the engine turn.
- Hosted attempts are capped at 2.5 seconds and local Ollama attempts at 5 seconds, with no transport retries and at most one structured-output repair attempt, matching banter policy.
- A timeout or failure never delays the month beyond the cap: the turn proceeds with standard ranking and the villain is silent.
- Scouting, quiet, and post-defeat months make no AI request.

## Privacy and audit

The request contains only bounded aggregates: risk facts, candidate identities, and persona metadata; no player free text and no raw identifiers, following the existing redaction rules.
Audit records use the `hostile_fed` role after the CHECK migration and store hashed plus aggregate data in production, matching the `event_interpreter` audit policy.

## UI surfaces

- Run-start toggle: a card on the persona step with the mode description, a villain picker showing `CHARACTER_PRESENTATION` art, and honest warning copy; off by default.
- Event dialog header: when the pending event carries a nemesis taunt, `HqEventDialog` shows the villain avatar and name, the headline as a speech line, a "Targeting: <metric label>" chip, and a collapsible "Why me?" section with the rationale; the interactive decision flow below is untouched.
- HQ chrome: a compact power meter with the villain avatar, driven by `powerPpm` from the run view; the defeated state swaps it for a victory sticker.
- Month-result debrief: when the resolved event was nemesis-selected, the month-result dialog appends one static Sprout line derived from the template's mitigations, for example "Debtzilla went after your emergency fund. Three months of expenses makes this attack class weaker."; no AI call.
- Styling lives in a dedicated nemesis block following the `hq-banter` CSS patterns, including reduced-motion behavior and `aside` plus ARIA parity.

## Interaction with runtime balance and beginner cadence

The villain re-orders only candidates that survived beginner cadence and runtime-balance rejection, so it cannot push the meaningful-month or crisis-prompt ratios past what those gates already allow.
The known failing beginner-band acceptance checks documented in the matrix doc are out of scope: guided difficulty cannot enable the mode, and nemesis runs are measured by their own lab cohort instead.
The balance lab gains a deterministic "worst fair pick" stub policy that always selects the highest-severity safe candidate against the weakest metric, simulating a maximal adversary without any AI, and the nemesis cohort asserts a bankruptcy-rate band and a median-recovery bound before tuning ships.

## Testing

- Contract tests: `nemesisSelectionEvidence` schema round-trip and rejection of unknown fields.
- Request-builder unit tests: cadence gate, severity ceiling per `aggregateSeverityPpm` band, focus-fire removal, degenerate bounds, checksum stability, and the 24-candidate cap.
- Service tests with a fake transport: mapped success, checksum mismatch, out-of-set pick, out-of-bounds parameter, evidence-subset failure, taunt repetition rejection, timeout fallback, and audit-record emission for each path.
- Core tests: override application with matching checksum, silent fallback on mismatch, deterministic `gameplay.nemesis` counter updates, defeat detection after 3 calm closes, and a fixed-seed determinism test proving identical inputs plus an identical override produce identical state.
- UI tests: toggle plumbing into run creation, taunt header rendering from a pending event fixture, power meter bands, defeated state, and reduced-motion rendering.
- Lab test: the worst-fair-pick cohort stays inside the configured bankruptcy and recovery bands.

## Acceptance criteria

- A run created with Nemesis Mode off behaves byte-for-byte identically to today, including ranking evidence.
- Enabling the mode in the instant demo requires no database and no code changes beyond the entry parameter.
- An attack month shows a villain taunt whose cited evidence ids all exist in the request evidence, and the fired event is always a member of the engine-safe candidate set.
- Killing the AI provider mid-run produces months that are indistinguishable from standard runs except for the recorded `fallbackReason`.
- The same seed and the same recorded override replay to an identical game state.
- Driving every targeted metric to band `low` or better for 3 consecutive closes retires the villain and stops all further nemesis AI calls.
- `pnpm verify` passes, including the new tests, with no regression in existing suites.
