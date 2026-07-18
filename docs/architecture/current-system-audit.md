# Current system audit

This audit describes the account-save/performance branch based on `f808c44`. It is the quickest answer to “what exists now?”

## Status at a glance

| Capability | Core/server | Public API | Current UI |
| --- | --- | --- | --- |
| Persona onboarding | Implemented with checksum review | Yes | Yes, typed persona flow |
| Custom profile fields | Contract supports rich drafts | Review/create routes exist | Form collects four fields, but only age reaches authoritative state |
| Guest save identity | HttpOnly capability cookie | Yes | No account required |
| Optional account authentication | Supabase passwordless email | Yes | Claims a guest save for cross-device access |
| Persistent runs | PostgreSQL/Drizzle, one active save per account | Yes | Yes |
| Instant local demo | In-memory repository/tax adapter | Dev-only `/api/demo` | Dev-only button |
| Monthly finance/tax/market | Implemented deterministically | `process_month` | Yes |
| Detailed financial actions | Broad internal/public intent support | Yes | Small fixed board subset |
| Recurring strategy | Implemented | Yes | Only emergency-buffer target exposed by board plans |
| Declarative events | Four active templates | Resolve command | Yes, after monthly result |
| Risk + Scenario Director + fairness | Deterministic implementations | Part of month processing | Summary/event result only |
| Multi-month time control | Implemented internally | No active route | No |
| Checkpoint/history/counterfactual | Implemented internally | No active route | No |
| Teaching/debrief | Core and server services/panels exist | No active route | Not mounted |
| AI onboarding extraction | Provider service exists | `/api/onboarding/parse` | Not called by current form |
| AI world direction | Service and audit contracts exist | No active route | No |

## What the player can do today

- Start and auto-save a persistent persona run without creating an account.
- Optionally sign in by secure email link to claim the guest save and resume it across browsers.
- Start a development-only in-memory demo.
- See the canonical 3D board and authoritative financial summary.
- Choose one of five destinations and one frontend-authored plan.
- Apply lifestyle, revolving-credit, taxable-investment, upskill, or emergency-target changes from that menu.
- Advance one deterministic month and see before/after financial deltas.
- Encounter one of four active event templates and resolve its listed choices.
- Continue until a deterministic terminal outcome is reached.

The free-travel variant shares the same state. Its extra Goals/Events/Journal/Menu buttons are placeholders.

## What “AI-powered” means in this version

Provider adapters, structured prompting, audit encryption, onboarding extraction, education/debrief, and world-director modules are present and tested in isolation. They are not connected to the playable monthly loop. The only active AI-capable endpoint is onboarding parse, and the shipped form does not call it.

Events are selected without Groq, OpenAI, or Ollama. Deterministic code generates eligible candidates, ranks them, applies fairness, and persists exact effects. This is efficient and replayable, but it means current gameplay does not yet demonstrate deep runtime AI integration.

## Important correctness properties

- Authoritative balances are never held only in React or localStorage.
- Persistent run access derives from verified Supabase user claims and same-origin write checks.
- Capability cookies remain only for pre-login save claiming and development Instant Demo.
- Creating a new account save archives the previous active save atomically.
- Exact revisions and command IDs provide optimistic concurrency and idempotency.
- Money/rates avoid floating-point arithmetic.
- Tax, market, RNG, event, and ledger evidence are server-owned.
- A failed persistent transition does not partially advance the run.
- Pending events block another month until resolution.
- The board’s two-command turn has partial-success recovery.
- Historical schema/version code is separated from the public unversioned contract.

## Known gaps and misleading surfaces to avoid

1. Profile name, location, and free-text goal are collected but ignored during run creation; age is the only applied field.
2. “Big City Survivor” maps to the same backend software persona as Junior Developer.
3. Board plan previews are static client calculations, not the internal engine preview service.
4. Production events cover only medical bill, lifestyle upgrade, performance bonus, and utility rebate.
5. Tax is calculated in the engine but no player-facing tax statement or concept lesson is mounted.
6. 401(k), HSA, insurance, debt, and counterfactual teaching systems are not surfaced in the current board.
7. AI does not currently direct monthly events or teach in the playable UI.
8. Level/XP are UI derivations; journal/menu surfaces are incomplete.
9. `/api/health` does not establish dependency readiness.
10. The OpenAPI object is a route inventory, not a full request/response specification.

## Save and traffic implementation

- `game_runs.owner_user_id` references `auth.users`; a partial unique index enforces one active save per owner.
- First login claims a valid legacy cookie save. A run already owned by a different account is rejected.
- Browser commands send their known effective month, removing one redundant full-state read.
- Public command responses omit the unused monthly-record summary; measured local response size fell from about 5.25 KB to 1.63 KB.
- Native run creation and ordinary commands no longer write undeliverable outbox rows. Aggregate time advance and legacy workflows retain outbox semantics where replay depends on them.
- Demo memory is capped at 16 LRU runs with a two-hour idle TTL.
- Landing WebP assets reduce its eager image payload from about 5.8 MB to about 460 KB.

## Repository hygiene observations

- `.understand-anything/` contains large generated code-understanding artifacts; it is not runtime code.
- `.codex-remote-attachments/` contains tracked reference images.
- `docs/superpowers/` contains historical plans/specifications, not current requirements.
- Production tests correctly live in adjacent `__tests__` folders; the layout gate enforces this.

These tracked artifacts were not removed by this audit because they may be intentional collaboration evidence. They should not be treated as application authority.

## Recommended next product sequence

1. Make onboarding fields authoritative, including an explicit editable FI target and optional benefits/insurance/debt choices.
2. Add player-visible tax/payroll and financial-concept explanations from deterministic evidence.
3. Expand and test the declarative event catalog by life domain before adding AI narration.
4. Expose deterministic preview and teaching/counterfactual endpoints through the unversioned API.
5. Mount education/debrief UI into the canonical board.
6. Integrate AI only as a constrained ranker/narrator over allowed candidates and evidence, with deterministic fallback and audit—not as the calculator of record.

This sequence preserves replay, cost control, and correctness while making the hackathon’s education and AI value visible.
