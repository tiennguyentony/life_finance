# Interactive Events v1

Interactive Events let the player answer a financial situation in their own English words. The feature preserves the existing deterministic finance engine: AI interprets language, while engine-owned event responses remain the only actions that can change a saved game.

## Player flow

1. The deterministic scheduler selects and parameterizes an eligible event.
2. The UI shows the event headline and asks, “What do you do?”
3. The UI lists the currently enabled engine-owned directions by label so the player knows what the event is asking. Selecting a direction only fills the answer box; it does not apply the action. The player may edit it, write a different English response, or explicitly ask Sprout for advice.
4. A deterministic fast parser handles clear responses and prohibited actions.
5. Unresolved language is sent to the configured LLM with a strict output schema. For advice, a deterministic policy first extracts the player's latest stated priority and ranks only enabled choices from their authoritative cash-flow and wellbeing previews. The model receives that immutable directive plus bounded financial evidence such as cash runway, required monthly cash, revolving credit, preparedness, FI progress, and active coverage.
6. If the intent is ambiguous, Sprout asks one short, neutral follow-up without revealing the hidden choices or their outcomes.
7. When advice is requested, Sprout explains the one choice selected by the deterministic policy and states the engine-derived trade-off. The model cannot replace the selected choice, reason, trade-off, or evidence citations. The recommendation does not mutate the run.
8. The player can confirm the recommendation or keep deciding. A direct, unambiguous engine-choice answer uses the deterministic fast path. If the LLM is needed to infer intent from an indirect or multi-turn answer, Sprout first displays the exact action it understood and asks the player to confirm or correct it. No inferred LLM action is auto-committed.
9. A player correction remains in the transcript. The latest player statement overrides contradictory earlier ideas, while references such as “yes, do that” are resolved against the most recent Sprout message.
10. The player and Sprout may exchange up to three player turns. The full bounded transcript is considered on each request.
11. The UI reveals the outcome and lesson only after the decision is saved. A still-unsupported answer is rejected after the third player turn.

Three turns are a ceiling, not a quota. A clear answer ends on turn one; an initially vague answer can end on turn two as soon as the follow-up makes the intent clear. The UI visually marks the latest Sprout question and changes the submit label to “Answer Sprout.”

The former hardcoded “Need a hint?” commit menu is not part of the live interaction. Enabled direction labels are always visible as writing aids, but selecting one only copies its label into the answer field. “Ask Sprout what fits my finances” calls the model and displays one personalized recommendation. Accepting either a recommendation or an inferred intent is a separate deterministic command, so model output can never silently become a player decision.

Common full-payment language such as “pay everything,” “cover all costs,” and “pay the full amount” maps to the event's single full-payment response without requiring an exact choice label. A genuinely incomplete answer such as “I can pay” still prompts for what will be paid and the intended outcome instead of guessing.

The LLM semantic path does not require a hardcoded phrase. A local model occasionally emits a valid mapped choice plus an irrelevant follow-up field because strict JSON requires every property. The client deterministically clears that unused field before semantic validation; it never repairs or invents the choice ID, confidence, or reason code.

Because an LLM mapping is now only a proposal, the local model may surface a mapping at 60% reported confidence and a hosted model at 55%. The player must confirm the displayed engine-owned label before it can run. Lower-confidence output still asks another question. This replaces the former 90% auto-commit threshold with a safer human confirmation boundary.

## Character banter

The Money HQ cast sends an English speech-bubble message after selected completed months. It appears in two out of every three months, with a stable run-specific quiet-month phase, while leaving occasional quiet turns.

Copy is no longer selected from hardcoded message arrays. A dedicated low-cost `banter_writer` receives a bounded set of non-zero authoritative month deltas, the saved plan label, a creativity seed, and up to eight recent generated lines. It reasons over the evidence, chooses Debtzilla, Inflato, Impulso, Bengo, Buddi, Lucky Cat, or Sprout, selects a tone, writes one short punchline, and cites the exact evidence ID that grounded it. Recent lines, speakers, and topics are retained per run in browser storage across reloads. The server rejects unknown evidence citations, multiline output, advice-like wording, and copy that is identical or substantially similar to recent lines.

Generation begins only after the month-result dialog closes and runs in the background, so it never delays month processing or prevents the player from planning. The bubble appears when copy is ready, auto-dismisses after 6.5 seconds, supports manual dismissal and reduced motion, and remains suppressed while a life-event dialog is pending. If the model, schema, audit, timeout, or repetition check fails, no notification is shown; the system does not fall back to a repeated hardcoded line.

## Trust boundary

The interpreter may ask a question or propose one enabled choice ID for confirmation. In advice mode, the engine supplies an immutable recommendation directive containing the selected choice, criterion, rationale, trade-off, and required evidence IDs; the LLM only writes Sprout's conversational lead-in. The client rejects a different choice, an ungrounded number, or unsupported claims such as a late fee, penalty, interest charge, debt, coverage, income, or wellbeing effect. AI cannot create financial effects, amounts, rewards, event parameters, or state changes; the existing event resolver owns every authoritative consequence. Unknown, unavailable, unsafe, malformed, timed-out, or out-of-catalog outputs never mutate state. Once a decision is confirmed and committed, the live UI does not reveal its result and then allow another selection. The API validates that transcripts begin with the player, alternate roles, end with the player, and contain at most three player turns.

Model-generated follow-ups pass through a server-side guard. Questions must be open-ended, start with “What,” “How,” or “Which,” and must not expose an amount. They may name or compare enabled direction labels because those labels are already visible to the player. Invalid questions are replaced by a neutral deterministic question.

## Financial settlement and event debt

The event resolver records consequences immediately, while the monthly Financial Engine remains the only owner that settles event income and expenses against cash. A one-month event cash flow therefore appears as “due this month” after the response is saved, stays visible in the Budget screen, and is consumed exactly once by the next monthly turn.

An explicitly financed response is different from an ordinary bounded recurring expense. It creates a real `personal_loan` term-debt record and a balanced ledger transaction when the choice is resolved. The financed principal equals the declared installment multiplied by its term; any financing markup is already encoded by the event template, so the debt uses 0% additional APR and is not charged twice. Its minimum payment is added to required obligations, serviced by the normal monthly debt engine, reduced with each payment, and displayed immediately in Debt Dungeon. Historical event versions retain their original effects for exact save replay; corrected active versions and every dependent follow-up are versioned together.

## Latency policy

- Clear language uses the in-process fast path and avoids an API request.
- Creative or indirect language uses one structured LLM request.
- Explicit advice performs a millisecond deterministic ranking, then uses one structured LLM request only to phrase the grounded explanation.
- The interactive client performs no transport or schema retries.
- Hosted provider requests are capped at 1.5 seconds. Local Ollama gets 2.5 seconds to account for local inference; a cold load still falls back safely.
- The optional advice path has a separate ceiling of 3 seconds hosted and 8 seconds locally because its grounded explanation is larger. It is never called by the monthly simulation loop.
- A timeout returns a deterministic follow-up question before the final turn instead of blocking the player.
- Development does not require audit-database access. Production writes a redacted audit record after the database migration is applied.
- Character banter is a separate asynchronous request with no transport retries and at most one structured-output repair attempt. Hosted attempts are capped at 2 seconds and local Ollama attempts at 8 seconds so a cold 7B model can load; final failure is silent and never blocks gameplay.

When `AI_PROVIDER=ollama`, both the interactive classifier and asynchronous character writer default to `qwen2.5:7b-instruct`. The 20B writer exceeded even a 10-second measured local request and therefore made the intentionally silent cosmetic path look absent; the 7B writer completed the same grounded structured request in about 5.7 seconds cold and 1.1 seconds warm. Run `ollama pull qwen2.5:7b-instruct` once. Override either role with `AI_INTERACTIVE_OLLAMA_MODEL` or `AI_BANTER_OLLAMA_MODEL` after evaluating another locally installed model.

## Privacy and audit

Sensitive identifiers are redacted before model input. Production event-interpreter audit records store a hash of the transcript plus aggregate length and turn counts, not the raw conversation or raw model output. The bounded financial evidence used for a recommendation is retained with the audit request so cited facts remain traceable. Banter prompts contain only simulation month, engine plan label, bounded aggregate deltas, prior model-generated lines, and a random variation seed. `ai_audit_records` accepts both `event_interpreter` and `banter_writer` after migration `0009_gifted_meteorite.sql`.

## Live-game fairness

Interactive Events do not expose a rewind or “try another selection after seeing the outcome” action. Ignoring advice is allowed because no choice, consequence, or hidden outcome has been applied or revealed. Follow-up questions occur before any outcome is revealed. A valid interpreted answer is committed before its consequence and lesson are revealed. Invalid or unsafe text does not represent a game action, so the player may start the interaction again. Scripted counterfactual rewind belongs in a separate tutorial branch and is intentionally not enabled for live saves.

## Local verification

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```

Create or open a game, advance until a life event pauses the month, and test:

- A label-like response such as “Use my insurance.”
- A natural response such as “I will make my monthly burn rate leaner.”
- An ambiguous response such as “I want to protect myself,” then answer Sprout’s follow-up.
- Select “Ask Sprout what fits my finances” and confirm the response recommends one enabled action, names current financial evidence, and explains one trade-off.
- In a social commitment event, answer `my cash` before asking for advice. Confirm the recommendation preserves cash according to the visible previews and never invents late fees, penalties, or interest.
- Confirm every enabled direction label is visible before typing, while disabled directions and exact hidden outcomes remain absent.
- Confirm the run revision does not change while advice is displayed.
- Confirm “Choose …” applies exactly the recommended action, while “Make my own choice” returns to the conversation without applying anything.
- Enter an indirect answer and confirm Sprout displays `I understood your answer as …` without changing revision. Test both confirmation and `That is not what I meant` followed by a correction.
- State one action on turn one and explicitly replace it on turn two; confirm only the latest action is proposed.
- Reply `Yes, do that` after Sprout names a direction and confirm the referenced direction is proposed.
- An illegal response such as “Rob the bank.”
- Confirm that a mapped answer saves immediately and only offers Continue after the outcome appears.
- Choose a one-month cost and confirm Budget Burrow shows it as an event cost due this month before the next turn consumes it exactly once.
- Choose an option labelled as a payment plan and confirm Debt Dungeon immediately shows its principal, monthly minimum, term, and APR; after one month the principal and remaining term must both fall by exactly one scheduled payment/month.
- Confirm that ordinary follow-up questions do not leak an option menu or exact consequences and that the conversation stops after at most three player answers.
- Confirm that rejected text can be replaced without changing the run revision.
- Close several month reports and confirm banter appears in two out of each three months without blocking the next plan.
- Confirm successive generated lines vary, remain grounded in a displayed month metric, and do not repeat one of the eight latest lines.
