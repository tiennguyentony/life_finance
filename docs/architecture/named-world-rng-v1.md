# Named world RNG v1

This document specifies the Prompt 14 version boundary for matched-strategy
experiments. The stream contract is wired into optional validated
`GameStateV2.worldRandom`, strict persisted commands, the server-owned monthly
command mapper, production monthly processing, and accepted-command replay.
Historical commands with neither named state nor the discriminator retain the
frozen shared-root path and checksum behavior.

## Implementation checkpoint

The implementation provides strict exact-shape decoding,
absence-preserving optional decoding, deterministic four-stream derivation,
keyed opportunity and parameter draws, one-step event epoch advancement, and
explicit macro-cursor replacement. Unit tests lock a literal first-upgrade
four-stream vector. A true integration test passes the named macro stream to the
production regime-v2 market sampler. Production monthly integration now routes
market and macro-story draws through `macro`, evaluates keyed raw opportunities
for the exact catalog, supplies keyed gross parameters to Runtime Balance,
persists evidence fingerprints, advances both event epochs exactly once per
completed nonterminal scheduling month, and restores the legacy root cursor.
The accepted-command replay checksum is locked in the monthly integration suite.

## Problem statement

The current monthly path serializes one `mulberry32-v1` `RandomState` as
`GameState.random`. A regime-v2 market month consumes seven draws in a fixed
order. Declarative event scheduling then consumes one hazard draw for every
eligible template, followed conditionally by a candidate-selection draw and the
selected template's parameter draws. The event scheduler's returned cursor is
stored back into `GameState.random`, so it becomes the next month's market
cursor.

That order is deterministic for one run, but it is unsuitable for matched-
strategy experiments. A player action can change event eligibility, cooldowns,
or the approved candidate. That changes event draw count and therefore changes
future macro shocks. The strategies are no longer being compared against the
same world.

Named world RNG v1 separates four simulation concerns while keeping bot choice
randomness outside authoritative production state:

| Stream | Owner | Purpose |
| --- | --- | --- |
| `macro` | Macro/Market System | Existing regime, shared shock, asset shock, and transition draws |
| `eventOpportunity` | Event System | Intrinsic per-template opportunity rolls before runtime approval |
| `eventParameters` | Runtime Balance | Bounded gross event-parameter samples |
| `balanceDirector` | Scenario Director / Runtime Balance | Versioned deterministic tie or rotation draws, if a policy needs them |
| lab-only bot RNG | Offline Balance Lab | Random-control bot decisions; never part of `GameState` or a production command |

Separating streams does not make outcomes identical. Different strategies may
still create different eligibility, coverage, impact, responses, and terminal
outcomes. It makes the underlying macro and event opportunity evidence
comparable.

## Versioned state and command contract

The new literal is:

```text
named-world-rng-v1
```

`GameStateV2` gains one optional root property equivalent to:

```text
worldRandom?:
  version: "named-world-rng-v1"
  macro: RandomState
  eventOpportunity: RandomState
  eventParameters: RandomState
  balanceDirector: RandomState
```

The property is optional only for historical compatibility. A
`process_month_v2` payload gains the server-owned optional discriminator:

```text
worldRandomVersion?: "named-world-rng-v1"
```

The public `process_month` request does not expose this selector. The server
stamps it for the Prompt 14 production-equivalent Balance Lab path and for any
later new-run production rollout.

The supported Prompt 14 combination is exact:

- `financialKernelVersion: "2.0.0"`;
- `marketModelVersion: "regime-v2"` with a supported difficulty;
- `eventSchedulerVersion: "declarative-events-v2"`;
- `runtimeBalanceControllerVersion: "runtime-balance-v1"`; and
- `worldRandomVersion: "named-world-rng-v1"`.

Unknown literals and partial combinations are rejected before any draw or state
mutation. Once `worldRandom` exists, a later monthly command without the named
version is rejected. This prevents an ambiguous downgrade to a stale legacy
cursor. Non-monthly player commands preserve all stream states exactly.

## Initialization and legacy compatibility

Named streams are not synthesized during:

- v1-to-v2 migration;
- native v2 state construction;
- save decoding or JSON rehydration;
- generic command finalization; or
- replay of a command whose discriminator is absent.

Therefore an old state with no `worldRandom` property decodes, freezes, and
checksums exactly as it did before this feature.

The first accepted opted-in monthly command initializes all four streams from
the opening `GameState.random` cursor. Derivation uses the existing versioned
seed hashing behind `randomState` with a canonical namespace containing:

```text
named-world-rng-v1 | opening algorithm | opening value | stream name
```

Initialization consumes no legacy draw. It must return four validated frozen
`RandomState` values and must not mutate the opening state. Retrying the same
command against the same opening state produces the same streams.

Under named mode, `GameState.random` remains the frozen legacy cursor. It is not
used or advanced. This makes the version boundary explicit and prevents the
Financial Engine's market cursor from becoming an accidental compatibility
bridge.

## Event epochs and keyed draws

Simply creating multiple sequential streams is insufficient. If the event
opportunity stream advances once only for eligible templates, different player
states still shift future event opportunities. Named world RNG v1 therefore
uses monthly event epochs.

At the beginning of an eligible scheduling month:

1. Treat the current `eventOpportunity` state as the opportunity epoch.
2. Treat the current `eventParameters` state as the parameter epoch.
3. Derive each logical draw from the epoch and a canonical scope label.
4. Advance each persisted epoch exactly once for the completed scheduling
   month, regardless of candidate count, rejections, or approval.

The exact scope labels are:

```text
event-opportunity | simulation month | template id | template version
event-parameter   | simulation month | template id | template version | parameter id
```

The keyed-state derivation namespace also contains the stream version and epoch
algorithm/value. A uniform opportunity roll is then drawn from `1..1_000_000`.
A parameter draw uses the exact immutable template's inclusive minimum and
maximum. Rejection sampling inside `nextInt` is local to the derived keyed state
and does not change the persisted epoch.

The Event System calculates raw opportunity rolls for every valid exact
`id@version` in the immutable scheduler catalog before applying player-specific
eligibility and history. Eligibility, causal hazard bounds, maximum occurrence,
cooldowns, and follow-up rules determine whether the pre-drawn opportunity may
become a candidate; they do not determine its random value.

The Runtime Balance Controller samples a candidate's gross parameters from the
parameter epoch. Prepared and unprepared players therefore receive the same
gross parameter for the same event identity and month. Insurance, liquidity,
impact, available responses, approval, and resulting consequences may still
differ. Rejected candidates are not resampled for affordability.

A due follow-up uses its exact target `id@version` and the same keyed parameter
rule. It does not skip either epoch's monthly advancement. A month with no
passing candidate also advances both epochs once. A terminal run does not
schedule another month and need not advance unused event epochs.

Keyed derivation has two important stability properties:

- changing eligibility or ranked candidate order does not change another
  template's opportunity or parameter draw; and
- reordering or adding catalog entries does not shift existing exact template
  identities.

Catalog definitions and policies are still replay-critical configuration. A
template's bounds, hazard, or meaning must not be changed in place under an
existing scheduler/template version merely because keyed draws are stable.

## Macro and balance/director consumption

The `macro` stream is passed to the existing market sampler unchanged. The
regime-v2 draw order remains shared macro shock, broad shock, sector shock,
speculative shock, bond shock, housing shock, and transition. The market
sampler's returned cursor becomes the next `worldRandom.macro` value.

The Financial Engine currently copies the supplied market step's next RNG into
the root `random` property. In named mode the monthly orchestration wrapper must
restore the opening legacy root cursor before accepting the authoritative
state, then persist the returned market cursor only in `worldRandom.macro`.
Market draw ownership must not be duplicated inside the Financial Engine.

The `balanceDirector` stream is isolated from opportunity and parameter draws.
A controller/director policy that needs a random tie-break treats it as a
versioned epoch and keys the draw by month and exact candidate identity. A
fully deterministic sorted policy may leave this stream unchanged. Adding new
consumption under an existing controller/director literal is forbidden; it
requires a new policy version and replay vector.

AI must never own, receive unrestricted access to, or advance a world stream.
AI output is persisted as a typed ranking command before deterministic runtime
approval. Network availability therefore cannot change macro, opportunity, or
parameter cursors.

## Authoritative invariants

State validation rejects named world state unless all of these hold:

1. `version` is exactly `named-world-rng-v1`.
2. The object contains exactly the four required named streams.
3. Every stream uses `algorithm: "mulberry32-v1"`.
4. Every stream value is an integer from zero through `2^32 - 1`.
5. No stream value is `null`, inferred, or replaced with a default.
6. An absent `worldRandom` value remains absent after decode/finalize.

Transition and orchestration invariants are:

1. An opted-in accepted month materializes or preserves the named state and
   advances only streams owned by work actually defined for that version.
2. Macro draws cannot depend on player finances, actions, eligibility, event
   approval, event resolution, diagnostics, or bot behavior.
3. Raw event opportunities cannot depend on cash, savings, insurance, wealth,
   impact estimates, director ranking, or runtime approval.
4. Gross event parameters cannot scale with wealth or preparation.
5. The event opportunity and parameter epochs advance once per non-terminal
   scheduling month, including no-event and all-rejected results.
6. Diagnostics mode and AI availability consume no world draws.
7. Source-file, array, and object-key order do not determine keyed values.
8. The legacy root cursor does not advance in named mode.
9. A command fails atomically if any version, stream, template, bound, or state
   invariant is invalid.

## Persistence, replay, and checksums

No database schema migration is required. Current state and command payloads
are stored as canonical JSON, and accepted-command replay already verifies the
resulting state checksum after every revision.

The new command discriminator is part of the accepted command payload and its
command checksum. The four current stream states are part of authoritative
GameState and its checksum. The first opted-in result therefore intentionally
has a new checksum. This is a command-selected upgrade, not a silent migration.

Historical guarantees remain:

- absent command discriminator dispatches to the exact old shared-stream path;
- absent state property is not defaulted or serialized;
- old unversioned, causal-hazard-v1, and declarative-events-v2 golden fixtures
  retain their existing state, record, RNG, and checksum values; and
- old snapshots need no rewrite.

New replay requires the same opening state/checksum, exact command IDs and
payloads, immutable catalog/config versions, external evidence, and code that
supports `named-world-rng-v1`. JSON serialize/parse between any two commands
must produce the same continuation and final checksum as an uninterrupted run.

## Offline Balance Lab ownership

Matched experiments give every strategy in a cohort the same opening persona
and same named world stream state. A strategy may choose different actions, but
the lab does not rewrite the production GameState or precompute an alternate
event engine.

The random-choice control bot receives a separate lab-owned seed, for example a
versioned namespace over experiment ID, matched seed, and bot ID. Its current
bot cursor belongs to the lab run record, not `GameState.worldRandom`. No bot
draw may occur inside a production reducer, affect a production checksum, or
advance any world stream. Deterministic bots need no bot RNG.

Balance Lab reports include the world RNG version, initial named stream states,
production configuration hash, bot policy version, and separate bot seed when
applicable. This makes a matched comparison independently reproducible.

## Expected implementation surface

The smallest coherent implementation is expected to touch:

- new `src/core/world-random-v1.ts` for state, validation, initialization,
  epoch advancement, and keyed draws;
- `src/core/game-state-v2.ts` and `game-state-v2-validation.ts` for the optional
  authoritative property without default-on-decode;
- `src/core/personal-event-v2.ts` for a new named-stream candidate-generation
  path while preserving the old scheduler function;
- the Runtime Balance controller for keyed parameter sampling;
- `src/core/monthly-turn-v2.ts` for version selection, stream routing, and
  restoration of the legacy root cursor;
- `src/server/db/persisted-command-v2.ts` for strict literal and cross-version
  decoding;
- `src/server/api/service-v2.ts` for server stamping in direct and time-advance
  monthly payloads; and
- replay, service, state, event, monthly, and Balance Lab tests.

`time-controller-v2.ts` already forwards the monthly payload type and should not
gain a second random implementation. The public API schema should not expose a
client-selected RNG version. Repository tables and financial formulas do not
change.

## Required unit and integration tests

### State and draw unit tests

- the same legacy cursor derives the same frozen named state;
- every namespace resolves deterministically and each stream validates;
- malformed version, missing/extra stream, algorithm, and value are rejected;
- absent named state survives decode/finalize with the exact old checksum;
- JSON round-trip preserves every stream byte-for-byte;
- keyed opportunity draws are unchanged by catalog order or by omitting an
  eligible template from one strategy;
- keyed parameter draws for the same month, `id@version`, parameter ID, and
  bounds are identical across wealth and preparation states;
- opportunity and parameter epochs each advance exactly once for approval,
  all-rejected, no-event, and due-follow-up cases; and
- invalid bounds or scope identities fail without advancing authoritative
  state.

### Monthly and subsystem integration tests

- run two production monthly transitions from the same named world state after
  applying different valid player actions; assert identical macro shock
  evidence and next macro cursor;
- create different intrinsic eligibility/history states; assert identical raw
  opportunity evidence for shared `id@version` entries and identical next
  opportunity epoch;
- hold event identity and gross parameter evidence constant for prepared and
  unprepared states; assert different impact/consequence evidence is allowed
  while the next parameter epoch remains identical;
- flow candidate generation through director fallback, Runtime Balance, and the
  event lifecycle, proving that null/approval does not change future macro or
  opportunity draws;
- serialize one matched run between months and compare its continuation and
  checksum with an uninterrupted run;
- prove a random-choice bot can make different actions using only its lab seed
  while both runs retain identical world draw evidence; and
- verify no network, AI, database, filesystem, clock, or `Math.random` call is
  made by the production monthly transition.

### Replay and golden vectors

- retain every existing absent-field/shared-RNG golden checksum unchanged;
- strictly decode and replay a command containing `named-world-rng-v1`;
- reject the named literal without its required kernel, market, scheduler, and
  controller versions;
- reject a shared/absent monthly command after named state exists;
- record an exact first-upgrade command checksum, resulting state checksum,
  four stream values, macro shock vector, opportunity evidence fingerprint, and
  approved/null decision;
- record a two-month JSON-continuation golden vector; and
- record a matched-strategy golden pair where player actions and financial
  outcomes differ but macro shocks, shared opportunity rolls, and relevant gross
  parameters match.

Golden fixtures must contain literal values, not values recalculated by the
implementation under test. Any intentional algorithm or consumption change
requires a new RNG/controller/scheduler literal instead of updating an old
fixture in place.

## Non-goals

Named world RNG v1 does not:

- make all strategies experience the same eligible or approved event;
- bypass causal eligibility, cooldowns, Runtime Balance, or hard bounds;
- make financial consequences equal across preparation levels;
- provide cryptographic randomness;
- allow AI or clients to choose seeds or monetary values;
- move bot policy into production state; or
- change historical Prompt 09 shared-RNG replay.
