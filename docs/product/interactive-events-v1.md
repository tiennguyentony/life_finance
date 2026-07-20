# Interactive Events v1

Interactive Events let the player answer a financial situation in their own English words. The feature preserves the existing deterministic finance engine: AI interprets language, while engine-owned event responses remain the only actions that can change a saved game.

## Player flow

1. The deterministic scheduler selects and parameterizes an eligible event.
2. The UI shows the event headline and asks, “What do you do?”
3. The player types an English response without seeing a list of engine choices.
4. A deterministic fast parser handles clear responses and prohibited actions.
5. Only unresolved language is sent to the configured LLM with a strict output schema and a 1.5-second timeout.
6. If the intent is ambiguous, Sprout asks one short, neutral follow-up without revealing the hidden choices or their outcomes.
7. The player and Sprout may exchange up to three player turns. The full bounded transcript is considered on each request.
8. A mapped choice is immediately submitted through the existing `resolve_event_choice` command, including revision checks, idempotency, ledger effects, and normal persistence.
9. The UI reveals the outcome and lesson only after the decision is saved. A still-unsupported answer is rejected after the third player turn.

Three turns are a ceiling, not a quota. A clear answer ends on turn one; an initially vague answer can end on turn two as soon as the follow-up makes the intent clear. The UI visually marks the latest Sprout question and changes the submit label to “Answer Sprout.”

The optional “Need a hint?” control reveals the enabled, engine-owned response directions as selectable cards. The player can use them as examples or select one to commit it immediately. A hint selection sends the exact projected choice ID to the server, which validates it against the current pending event before the normal event command runs. It never calls AI or asks a model to reinterpret the label. Opening and closing the hint does not consume a turn or mutate state; selecting a card is the decision and therefore resolves the event.

Common full-payment language such as “pay everything,” “cover all costs,” and “pay the full amount” maps to the event's single full-payment response without requiring an exact choice label. A genuinely incomplete answer such as “I can pay” still prompts for what will be paid and the intended outcome instead of guessing.

The LLM semantic path does not require a hardcoded phrase. A local model occasionally emits a valid mapped choice plus an irrelevant follow-up field because strict JSON requires every property. The client deterministically clears that unused field before semantic validation; it never repairs or invents the choice ID, confidence, or reason code.

Because the lightweight local 7B model is less reliable than a hosted model, its mapped result must reach 90% reported confidence before the engine commits it; hosted mappings retain the 65% floor. A lower-confidence semantic result asks a follow-up instead of guessing and applying the wrong financial consequence.

## Character banter

The Money HQ cast sends an English speech-bubble message after selected completed months. It appears in two out of every three months, with a stable run-specific quiet-month phase, while leaving occasional quiet turns.

Copy is no longer selected from hardcoded message arrays. A dedicated low-cost `banter_writer` receives a bounded set of non-zero authoritative month deltas, the saved plan label, a creativity seed, and up to eight recent generated lines. It reasons over the evidence, chooses Debtzilla, Inflato, Impulso, Bengo, Buddi, Lucky Cat, or Sprout, selects a tone, writes one short punchline, and cites the exact evidence ID that grounded it. Recent lines, speakers, and topics are retained per run in browser storage across reloads. The server rejects unknown evidence citations, multiline output, advice-like wording, and copy that is identical or substantially similar to recent lines.

Generation begins only after the month-result dialog closes and runs in the background, so it never delays month processing or prevents the player from planning. The bubble appears when copy is ready, auto-dismisses after 6.5 seconds, supports manual dismissal and reduced motion, and remains suppressed while a life-event dialog is pending. If the model, schema, audit, timeout, or repetition check fails, no notification is shown; the system does not fall back to a repeated hardcoded line.

## Trust boundary

The interpreter may ask a question or select one enabled choice ID. The hint menu may submit one projected choice ID explicitly. Neither path can create financial effects, amounts, rewards, event parameters, or state changes. The server rejects hint IDs that are not enabled on the current pending event, and the existing event resolver owns all authoritative consequences. Unknown, unavailable, unsafe, malformed, timed-out, or out-of-catalog outputs never mutate state. Once a valid response is mapped, the live UI does not reveal its result and then allow another selection. The API validates that transcripts begin with the player, alternate roles, end with the player, and contain at most three player turns.

Model-generated follow-ups pass through a server-side fairness guard. Questions must be open-ended, start with “What” or “How,” and must not mention a hidden choice direction. Questions that expose an amount, present alternatives with “or”/“versus,” or resemble a list are replaced by a neutral deterministic question before reaching the player.

## Latency policy

- Clear language uses the in-process fast path and avoids an API request.
- Creative or indirect language uses one structured LLM request.
- The interactive client performs no transport or schema retries.
- Hosted provider requests are capped at 1.5 seconds. Local Ollama gets 2.5 seconds to account for local inference; a cold load still falls back safely.
- A timeout returns a deterministic follow-up question before the final turn instead of blocking the player.
- Development does not require audit-database access. Production writes a redacted audit record after the database migration is applied.
- Character banter is a separate asynchronous request with no transport retries and at most one structured-output repair attempt. Hosted attempts are capped at 2 seconds and local Ollama attempts at 5 seconds; final failure is silent and never blocks gameplay.

When `AI_PROVIDER=ollama`, the interactive classifier defaults to `qwen2.5:7b-instruct` instead of loading the much larger gameplay model. The asynchronous character writer defaults separately to `gpt-oss:20b`, which produced more grounded copy in local checks and does not delay the game loop. Run `ollama pull qwen2.5:7b-instruct` and `ollama pull gpt-oss:20b` once. A cold character-writer request may be skipped at the timeout; warm requests appear when ready. Override either role with `AI_INTERACTIVE_OLLAMA_MODEL` or `AI_BANTER_OLLAMA_MODEL` after evaluating another locally installed model.

## Privacy and audit

Sensitive identifiers are redacted before model input. Production event-interpreter audit records store a hash of the transcript plus aggregate length and turn counts, not the raw conversation or raw model output. Banter prompts contain only simulation month, engine plan label, bounded aggregate deltas, prior model-generated lines, and a random variation seed. `ai_audit_records` accepts both `event_interpreter` and `banter_writer` after migration `0009_gifted_meteorite.sql`.

## Live-game fairness

Interactive Events do not expose a generic rewind or “try another selection” action. Follow-up questions occur before any outcome is revealed. A valid interpreted answer is committed before its consequence and lesson are revealed. Invalid or unsafe text does not represent a game action, so the player may start the interaction again. Scripted counterfactual rewind belongs in a separate tutorial branch and is intentionally not enabled for live saves.

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
- Open “Need a hint?”, confirm that only currently enabled actions appear, and select one without typing.
- An illegal response such as “Rob the bank.”
- Confirm that a mapped answer saves immediately and only offers Continue after the outcome appears.
- Confirm that ordinary follow-up questions do not leak the hint menu or exact consequences and that the conversation stops after at most three player answers.
- Confirm that opening or closing the hint changes neither revision nor turn count, while selecting a suggestion immediately saves that one decision and does not call the configured LLM.
- Confirm that rejected text can be replaced without changing the run revision.
- Close several month reports and confirm banter appears in two out of each three months without blocking the next plan.
- Confirm successive generated lines vary, remain grounded in a displayed month metric, and do not repeat one of the eight latest lines.
