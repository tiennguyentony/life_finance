# Nemesis Mode v1 implementation plan

Design reference: `docs/superpowers/specs/2026-07-19-nemesis-mode-design.md`.
Work in an isolated worktree branch (for example `feat/nemesis-mode`) with a green `pnpm verify` baseline before phase 1.

## Build Week evidence protocol

Run each phase below as its own Codex session so the collaboration is inspectable.
At the end of each session run the `/feedback` command and record the returned Codex Session ID.
Add a "Built with Codex" section to the README listing the sessions, what each one implemented, and the session ids; the submission requires this plus one id evidencing core functionality, so phase 3's id is the one to feature.
Keep the hosted provider configured as `AI_PROVIDER=openai` for all manual verification so demo behavior runs on GPT-5.6 role models.

## Phase 1: run flag and state plumbing

Write failing tests first, then implement until green.

- Tests: `game-state-v2-validation` accepts a valid `gameplay.nemesis` block and rejects unknown `nemesisId` values; `CreateRunV2Request` round-trips the optional nemesis config; `RunService.createRun` defaults the mode off; the demo entry route creates a nemesis-enabled run from the new parameter.
- Implement: `NemesisId` union (`debtzilla`, `inflato`, `impulso`) and the `gameplay.nemesis` shape with `schemaVersion: 1` in `src/core/game-state-v2.ts`; optional input on `NativeGameStateV2Input` beside `runtimeBalanceDifficulty`; defaulting in `RunService.createRun`; validation; demo route parameter.
- Constraint: reject the config when `runtimeBalanceDifficulty` is `guided`.
- Verify: `pnpm test:parallel` for the touched suites, then commit.

## Phase 2: request builder and nemesis service

- Tests: builder unit tests for the cadence gate, severity ceiling bands, focus-fire filter, degenerate parameter bounds, checksum stability, and the 24-candidate cap; service tests with a fake transport covering mapped success, checksum mismatch, out-of-set pick, out-of-bounds parameter, evidence-subset failure, taunt repetition rejection, timeout fallback, and audit emission per path.
- Implement: `src/server/ai/nemesis-service.ts` plus a pure request builder module, following the `GameplayDirectorService` and `CharacterBanterService` patterns; reuse `analyzeRiskV1`, the safe prepared-candidate filter, `repeatsRecentBanter`, and the existing `AiRoleClient` for the `hostile_fed` role.
- Timeouts: 2.5 seconds hosted, 5 seconds Ollama, no transport retries, one repair attempt.
- Verify: suite green, then commit.

## Phase 3: core integration and persistence

This is the core-functionality session whose Codex Session ID the submission should cite.

- Tests: override application with a matching checksum; silent deterministic fallback on mismatch or unsafe pick; `gameplay.nemesis` counters and defeat detection across fixture months; a fixed-seed determinism test proving identical inputs plus an identical recorded override replay to identical state; `nemesisSelectionEvidence` contract round-trip.
- Implement: add the `"nemesis_ai_selection"` literal to the `rankingSource` union in `src/core/scenario-director-v2.ts`; apply the override in the `monthly-turn-v2.ts` block that applies `operational_ml_ranking`, using `applyScenarioDirectorRankingOverrideV2`; persist `nemesisSelectionEvidence` beside `operationalEventRankerEvidence` with its Zod schema in `src/server/api/contracts-v2.ts`; attach the taunt through the `PendingEventV2` `aiNarrative` attachment point, extending its shape if needed; update nemesis counters deterministically from the risk snapshot.
- Database: one drizzle migration adding `hostile_fed` to the `ai_audit_records` role CHECK in `src/server/db/schema.ts`.
- Verify: full `pnpm test` including long-run suites, then commit.

## Phase 4: UI surfaces

- Tests: run-start toggle plumbs the config into run creation; the event dialog renders the villain header from a pending-event fixture with taunt data; the power meter renders bands and the defeated state; reduced-motion snapshot passes.
- Implement: persona picker card on the start step using `CHARACTER_PRESENTATION` art; villain header inside `HqEventDialog` with the targeting chip and collapsible rationale; power meter in the HQ chrome fed by the new run-view nemesis block; static mitigation-derived debrief line in the month-result dialog; CSS block following `hq-banter` patterns.
- Verify: suite green plus a manual instant-demo pass, then commit.

## Phase 5: lab cohort, docs, and demo prep

- Implement the deterministic worst-fair-pick stub policy and a nemesis cohort in the balance lab; assert the bankruptcy-rate band and median-recovery bound and tune the ceiling thresholds if the cohort fails.
- Write `docs/product/nemesis-mode-v1.md` in the style of `interactive-events-v1.md` covering player flow, trust boundary, latency, and local verification.
- Update the README route table and the Built with Codex section with all session ids.
- Verify: `pnpm verify`, then commit and open the PR.

## Cutlines for the submission deadline

- Must ship: phases 1 through 4, with the power meter allowed to be a simple bar.
- Should ship: the phase 5 lab cohort and product doc.
- Explicitly deferred past the hackathon: model-shaped parameters within real bounds re-validated through `prepareRuntimeBalanceCandidatesV2`, persona auto-pick from the onboarding draft, a `teacher`-role outro on villain defeat, and a full vulnerability dossier panel.
- If time runs out mid-phase-4, ship the toggle plus the event-dialog taunt and cut the power meter; the taunt is the demo moment.

## Demo choreography (target 90 seconds of the 3-minute video)

1. Landing: one sentence on the problem; real life gives you one financial run with no do-overs.
2. Start a run, flip on Nemesis Mode, pick Debtzilla; the intro line lands the premise in one beat.
3. Play a month normally to show the baseline loop and the month-result deltas.
4. Attack month: Debtzilla's taunt names the real weakness with its evidence chip; open "Why me?" for one beat to show grounded reasoning.
5. Answer the event in free text, including one vague answer that triggers a Sprout follow-up, to show the interpreter.
6. Show the outcome dialog, the mitigation debrief line, and the power meter draining after a defensive plan.
7. Close on the trust-boundary line: the villain is a real LLM adversary, and it provably cannot touch money; only the deterministic engine can.

## Manual verification script

- Instant demo with `AI_PROVIDER=openai`: create a nemesis run, confirm month 1 is a scouting month, confirm an attack by month 3 with a taunt citing visible evidence.
- Kill the provider key mid-run: confirm the next attack-eligible month proceeds silently with standard ranking and a recorded `fallbackReason`.
- Confirm a non-nemesis run shows zero new UI and byte-identical ranking evidence.
- Confirm defeat: play defensive plans until the targeted metrics stay calm 3 closes, then confirm the victory state and that AI calls stop.
- Run the interactive-event checklist from `docs/product/interactive-events-v1.md` once inside a nemesis run to confirm no regressions in the free-text flow.
