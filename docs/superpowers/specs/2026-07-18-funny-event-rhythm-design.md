# Funny Beginner Event Rhythm Design

## Purpose

Make the 12-month beginner chapter feel lively, surprising, and replayable
without teaching that personal finance is random punishment. The current
3,600-run cohort averages 3.44 total events and 2.56 meaningful decisions,
leaving 45.7% of runs with fewer than three meaningful choices. This design
expands both event variety and the choices inside events, then gives the
beginner chapter an explicit, safety-bounded rhythm.

This design supersedes the proposed AI and monthly-allocation interaction for
this delivery. AI-authored events, natural-language actions, and a new
allocation interface are out of scope.

## Product decisions

- A 12-month beginner run targets 8-10 event prompts and 6-8 meaningful
  decisions.
- The ordinary mix is 4-6 humorous micro-events and 2-4 serious financial
  events.
- One month can present at most one event.
- Ordinary pacing permits at most one consecutive quiet eligible month.
- After two consecutive event months, the scheduler prefers a quiet recovery
  month unless a declared follow-up is due.
- At least one positive or recovery beat appears in an ordinary completed run.
- Roughly three-quarters of humorous events are relatable and one-quarter are
  absurd. Absurd events are never adjacent and ordinarily appear one or two
  times per chapter.
- Humor is excluded from medical hardship, bankruptcy, caregiving, job loss,
  and other vulnerable situations.
- Humorous events remain low-stakes and cannot independently create an
  unavoidable bankruptcy for a prepared beginner.
- Event occurrence, parameters, and cadence remain seeded and independent of
  player wealth. Preparation may reduce consequences but never causes the game
  to retaliate with more or costlier events.
- `runtime-balance-v1` remains authoritative until the complete beginner
  outcome and engagement gate set passes at 200 matched seeds.

## Architecture

The design keeps the deterministic event engine authoritative and adds three
bounded units:

1. **Versioned content catalog.** New templates and replay-safe new versions of
   under-specified existing templates define identities, parameter ranges,
   choices, effects, cooldowns, and declared follow-ups.
2. **Presentation and cadence metadata.** A separate immutable mapping assigns
   each template version a presentation tone (`serious`,
   `relatable_comedy`, or `absurd_comedy`) and cadence role (`challenge`,
   `engagement`, or `follow_up`). Persisted event-schema V2 is not changed for
   presentation-only metadata.
3. **Beginner cadence evaluator.** A pure evaluator derives recent event and
   quiet streaks from authoritative lifecycle history and recommends
   `positive_due`, `engagement_due`, `open`, or `recovery_preferred`. It may
   reorder or narrow candidates but cannot bypass eligibility, cooldown,
   impact, pacing, or unavoidable-failure guards.

The existing runtime-balance controller still samples fixed parameters,
estimates impact, rejects unsafe candidates, and owns approval. If no candidate
passes, the month remains quiet and records a safety override rather than
forcing an event.

## Replay-safe template activation

Historical template versions remain byte-for-byte meaningful. The full catalog
contains every supported version, while a new active-catalog projection selects
the highest supported version of each root identity for new scheduling.
Historical replay and pending-event resolution always look up the exact stored
`templateId` and `templateVersion`.

Existing V2 templates are not edited to add responses. Expanded variants use
version 3. Existing callers that explicitly request version 2 continue to
receive version 2; new scheduling uses the active projection.

## Cadence rules

The cadence evaluator examines resolved event months, due follow-ups, pending
events, terminal state, and the current chapter month.

- A due declared follow-up owns the month's event slot.
- A pending event or terminal run suppresses new scheduling.
- From chapter month 9 onward, if the run has not received a positive event or
  recorded nonfatal recovery beat, `positive_due` elevates eligible positive
  micro-events. This priority is below a due follow-up and all safety guards.
- After one quiet eligible month, `engagement_due` elevates eligible humorous
  micro-events.
- After two consecutive event months, `recovery_preferred` deprioritizes new
  root events for one month. A due follow-up remains eligible because it is a
  disclosed consequence of a prior choice.
- In every other month, `open` preserves the ordinary deterministic ranking.
- An engagement event uses pressure cost 0 or 1 and does not weaken existing
  medium-, large-, or catastrophe-tier spacing.
- No cadence recommendation may approve an `extreme` or `above_limit` guided
  challenge.

The 8-10 prompt target is an acceptance distribution, not an instruction to
force unsafe content. Safety overrides and ineligible months are counted and
reported separately.

## New humorous root events

All amounts below are fixed catalog ranges sampled from the run's seeded world
random stream. Each root event has three or four available responses and a
cooldown long enough to prevent repetition within an ordinary beginner chapter.

### Subscription Archaeology

- Tone: relatable comedy.
- Parameter: discovered annual subscription cost, $120-$600.
- Choices:
  - cancel every forgotten subscription and reduce annual living costs by the
    full amount, with a small happiness trade-off;
  - keep one favorite and reduce annual living costs by half;
  - keep the digital fossils, preserving convenience but receiving no savings.
- Lesson: small recurring costs and opportunity cost.

### Group-Chat Gift Emergency

- Tone: relatable comedy.
- Parameter: requested contribution, $20-$150.
- Choices:
  - contribute the full amount for the largest relationship benefit;
  - make a lower-cost gift using time, paying 35% of the amount and accepting a
    bounded burnout cost;
  - politely decline and accept a bounded happiness cost.
- Lesson: social spending, boundaries, and non-money costs.

### Countertop Gadget Flash Sale

- Tone: relatable comedy.
- Parameter: advertised gadget price, $30-$250.
- Choices:
  - skip the gadget with a small happiness trade-off;
  - buy the basic model for 60% of the sampled price;
  - buy the deluxe model now for the full price and a larger happiness gain;
  - use a four-month plan costing 30% per month, or 120% total.
- Lesson: needs versus wants and financing friction.

### Double Grocery Delivery

- Tone: relatable comedy.
- Parameter: duplicate-order charge, $20-$180.
- Choices:
  - return the duplicate for no money loss and a bounded time/burnout cost;
  - keep it for the full charge and a small happiness benefit;
  - share it for the full charge and a larger happiness benefit;
  - resell the surplus, recovering 80% of the charge with a larger time cost.
- Lesson: recovery choices, sunk costs, and valuing time.

### Mascot Side Hustle

- Tone: relatable comedy.
- Parameters: one-shift pay, $50-$300; costume cost, $20-$80.
- Choices:
  - decline with no financial effect;
  - work one shift for the sampled pay and a bounded burnout increase;
  - buy the costume and work the weekend for 220% of one-shift pay, with the
    costume expense and a larger burnout increase.
- Lesson: extra income, startup costs, and capacity.

### Laundry Machine's Final Spin

- Tone: relatable comedy.
- Parameter: repair estimate, $40-$250.
- Choices:
  - use a laundromat for two months at 30% of the estimate per month;
  - hire a repairer and pay the full estimate now;
  - attempt a do-it-yourself repair for 50% of the estimate and accept a
    bounded burnout cost.
- Lesson: cash timing, convenience, and execution risk.

### Raccoon Sanitation Department

- Tone: absurd comedy.
- Parameter: initial cleanup cost, $15-$120.
- Choices:
  - hire cleanup for the full amount;
  - build do-it-yourself trash armor for 40% of the amount and accept a time
    cost;
  - ignore the tiny inspector, accepting a wellbeing cost and scheduling the
    disclosed `Raccoon Returns With Management` follow-up two months later.
- The follow-up samples a $50-$300 cleanup and offers pay-now, payment-plan,
  and do-it-yourself responses.
- Lesson: prevention and the cost of delay.

### Definitely-Rare Yard-Sale Lamp

- Tone: absurd comedy.
- Parameters: purchase price, $10-$100; restoration cost, $10-$100; later
  resale proceeds, $0-$250.
- Choices:
  - walk away with a small happiness trade-off;
  - buy the lamp for the sampled purchase price and keep the questionable
    treasure;
  - buy and restore it, paying both known costs and scheduling the disclosed
    `Lamp Finds Its Market` follow-up.
- The follow-up applies the already-seeded resale proceeds and clearly shows
  whether the speculation produced a gain or loss.
- Lesson: speculation, uncertain returns, and total cost basis.

## Expanded existing events

Replay-safe version 3 variants add agency where the current active event has
only one or two responses:

- **Medical bill:** use insurance, negotiate to 70% of the bill with a bounded
  burnout cost, use a four-month plan costing 120% total, or pay immediately.
- **Lifestyle upgrade:** refuse, try the upgrade for three months at its sampled
  monthly equivalent, or accept the permanent annual increase.
- **Performance bonus:** retain 100% as cash, celebrate and retain 70%, or spend
  most and retain 25%, with proportionate happiness effects.
- **Utility rebate:** claim 100% as cash, use it for a bounded household
  efficiency improvement, or donate it for a wellbeing benefit.
- **Deferred transport repair:** pay immediately, use a four-month plan costing
  120% total, or use temporary transportation for six months at 150% total with
  an additional wellbeing cost.

Existing three-response rent, care, device, work-hours, and social events keep
their current versioned meanings.

## Choice economy and fairness

- Funny direct costs are generally $10-$300. Annual subscription totals,
  earnings, and seeded resale proceeds may exceed that direct-cost range but
  remain micro-tier inputs.
- Every counted decision has at least three materially distinct available
  responses.
- At least one response protects current cash, one exposes a different future
  cash-flow or total-cost trade-off, and one changes wellbeing or time cost.
- Payment plans disclose both monthly and total cost before confirmation and
  cost 20-60% more than the corresponding immediate payment.
- Deferred choices disclose their follow-up identity, delay, and parameter
  range. No undeclared follow-up is allowed.
- No response is universally best across cash, total cost, future cash flow,
  and wellbeing.
- Funny root events must assess as `light` or `meaningful` under guided policy.
  `crisis`, `extreme`, and `above_limit` funny roots are rejected.
- Player-caused follow-ups are measured separately from exogenous root events;
  they remain subject to the existing unavoidable-failure guard.

## Response preview

Before confirmation, the event dialog projects the selected response through a
pure preview boundary using the same effect primitives as authoritative
resolution. It shows:

- immediate cash change;
- monthly recurring amount, duration, and total;
- annual living-cost change;
- wellbeing direction;
- any declared follow-up and its possible cost range.

The preview never mutates state. Unavailable mitigation-dependent responses are
disabled with a reason. If preview evidence cannot be produced, confirmation is
blocked rather than displaying guessed numbers.

## Bot and laboratory coverage

Prepared, average, reckless, and random bot policies gain an explicit response
for every active root template. Prepared bots favor lower total cost and
bounded wellbeing trade-offs. Average bots use plausible middle choices rather
than copying the prepared mapping. Reckless bots prefer financing, deferral, or
speculative choices. The random bot samples only currently available response
IDs from its separate lab RNG.

Balance Lab records total prompts, meaningful decisions, funny events, absurd
events, quiet-streak violations, event-streak violations, safety overrides,
response diversity, and player-caused follow-ups. New beginner gates require:

| Metric | Target |
|---|---:|
| Median total event prompts | 8-10 |
| Median meaningful decisions | 6-8 |
| Runs with at least 6 meaningful decisions | at least 750,000 ppm |
| Median unique decision templates | at least 5 |
| Median humorous root events | 4-6 |
| Median absurd root events | 1-2 |
| Runs with a positive or recovery beat | at least 900,000 ppm |
| Adjacent absurd-event violations | 0 |
| Root event-streak violations | 0 |
| Funny root challenges above `meaningful` | 0 |
| Prepared unavoidable failures attributable to funny events | 0 |

The existing completion, bankruptcy differentiation, recovery, objective
dominance, challenge-mix, and runtime gates remain blocking. Engagement gates
cannot activate a controller whose financial outcomes are still unbalanced.

## Error handling and fallbacks

- A due follow-up, pending event, or terminal result always takes priority over
  cadence preferences.
- If every engagement candidate is ineligible or rejected, the month remains
  quiet and records a safety override.
- Missing active-version metadata fails catalog startup validation.
- Missing historical template versions fail replay explicitly; the engine never
  substitutes a newer version.
- An unavailable response remains visible but disabled when that helps explain
  a mitigation lesson.
- Failed response previews block submission and retain the event for retry.

## Testing

- Validate and deeply freeze every new template and metadata record.
- Prove every active counted event has at least three materially distinct
  available effects.
- Prove all payment-plan totals and follow-up ranges match displayed previews.
- Prove old V2 event commands replay with unchanged effects while new scheduling
  chooses V3 variants.
- Prove identical seeds produce identical cadence, parameters, choices, and
  follow-ups.
- Unit-test quiet, open, recovery-preferred, due-follow-up, pending, terminal,
  and all-candidates-rejected cadence paths.
- Prove humorous events cannot bypass impact or unavoidable-failure rejection.
- Prove bot mappings cover every active root event and use only valid responses.
- Reconcile raw run evidence with all new Balance Lab counts and acceptance
  decisions.
- Run the focused catalog, effects, scheduler, controller, replay, UI, bot, and
  Balance Lab suites before the full project verification.
- Run the authoritative beginner cohort at 200 matched seeds before any
  production-selection change.

## Acceptance criteria

- A typical beginner chapter presents 8-10 prompts and 6-8 meaningful choices
  without exceeding one event per month.
- Runs contain both serious financial learning and mixed-tone humorous relief.
- Funny events offer genuine trade-offs rather than cosmetic buttons.
- Immediate, recurring, total, and follow-up costs are transparent before a
  choice is committed.
- Historical event versions remain replayable and unchanged.
- Cadence never bypasses eligibility, challenge, pacing, or unavoidable-failure
  protection.
- Humorous content does not trivialize vulnerable situations.
- The 200-seed cohort passes both the new engagement gates and all existing
  beginner balance gates before activation.
