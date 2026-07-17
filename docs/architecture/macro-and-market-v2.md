# Macro and Market System v2

## Ownership and replay boundary

The Macro and Market System owns deterministic world conditions. It supplies
structured facts to financial and event systems; it does not directly create
personal events, approve event pacing, or invent financial effects.

`regime-v2` with calibration `us-balanced-2026-v1` is selected only by an
accepted monthly command that persists both `marketModelVersion` and
`macroDifficulty`. New API-created commands stamp `regime-v2` and `normal`.
An absent market version, or explicit `regime-v1`, remains the frozen historical
path. Persisted decoding rejects a v2 command without an explicit supported
difficulty and rejects v2 with a legacy financial kernel.

The accepted command is the replay authority. The current process configuration
is never consulted to reinterpret an old command.

## Authoritative structured state

After the first accepted v2 month, `gameplay.market` persists:

- model and calibration versions;
- difficulty and months in the current regime;
- the observation's source month and regime (the next regime begins on the next
  monthly tick);
- cumulative price index;
- borrowing-rate environment;
- labor-demand change;
- volatility;
- current inflation;
- broad, sector, speculative, housing, and cash-yield conditions.

The regime for the next monthly tick remains `state.marketRegime`. The latest
facts are explicitly labeled by `observedRegime` and `observedMonth`, so a
transition cannot make prior-month rates look like facts sampled from the new
regime. Active temporary macro
narratives and their bounded asset modifiers remain in
`gameplay.eventLifecycle.macroStories`. Validation requires a complete macro
snapshot for every persisted `regime-v2` state.

All rates and changes use integer parts per million (PPM): `10_000` means 1%.
Money remains integer cents. No floating-point money or network input enters the
monthly path.

## Configuration and seeded transitions

The immutable calibration contains, for every regime:

- a transition-probability row totaling exactly 1,000,000 PPM;
- minimum and maximum duration in months;
- mean and shared-macro sensitivity for each economic channel;
- independent shock sensitivity for broad, sector, speculative, bond, and
  housing assets;
- borrowing, labor, inflation, and volatility parameters.

It also contains difficulty shock/volatility scales and explicit bounds for
asset returns, inflation, borrowing rates, labor demand, and volatility.
Configuration validation rejects invalid probability rows, duration windows,
difficulty scales, or bounds.

Minimum duration prevents premature regime changes. Maximum duration forces a
configured non-current transition. A run therefore cannot remain in one regime
forever because of an unlucky transition draw.

## Replay-critical draw order and correlation

Each month consumes only the repository's seeded RNG in this fixed order:

1. shared macro shock;
2. broad-index idiosyncratic shock;
3. sector idiosyncratic shock;
4. speculative idiosyncratic shock;
5. bond idiosyncratic shock;
6. housing idiosyncratic shock;
7. regime-transition draw.

Broad, sector, speculative, bond, housing, inflation, borrowing, and labor
results share the macro shock with deliberately different sensitivities.
Asset-specific shocks add variation without making the channels unrelated.
Difficulty scales shock magnitude but never changes draw order; the same seed
therefore produces the same underlying shocks at every difficulty.

## Defined economic channels

The financial kernel consumes the supplied month as follows:

- broad-index and legacy equity buckets use the broad return;
- sector and speculative buckets use their distinct returns;
- HSA and other bond-like investable balances use the bond return;
- cash uses only the configured cash yield;
- home value uses only the configured housing return;
- inflation advances the cumulative price index and the existing living-cost
  rule;
- the borrowing-rate environment is stored for new or explicitly variable debt.

The current product has fixed-rate term debts, so a macro rate change does not
rewrite an existing loan. Under action policy `1.0.0`, a new or refinanced fixed
mortgage is quoted from the accepted macro borrowing rate plus a configured
20,000 PPM mortgage spread, capped by the mortgage engine's 500,000 PPM bound.
Historical/unversioned actions retain their persisted requested rate.

A ticker or headline has no mutation authority. Cash changes only through its
configured yield or another explicit ledger-backed financial/event rule. Every
market balance change is posted through the balanced ledger transaction for the
accepted monthly command.

## Narrative separation

`marketHeadlineV2` is a deterministic fallback projection of structured facts.
It cites stable fact IDs for regime, inflation, borrowing rate, labor demand,
and volatility. Presentation or later AI text may describe those facts, but it
cannot replace the accepted regime, return, or rate evidence.

## Performance and external dependencies

The update is constant-size arithmetic over four regimes and a fixed number of
RNG draws. It performs no network, database, filesystem, or AI call. The unit
benchmark exercises 10,000 sequential months under a generous two-second
headless budget.

## Verification coverage

Unit tests cover configuration validation, seeded replay, minimum/maximum
duration, difficulty draw stability, regime tendencies, positive broad-sector
correlation, bounds across different seeds, deterministic narrative facts, and
long-run performance.

Integration tests cover persisted-command decoding, service stamping, monthly
orchestration, distinct portfolio channels, inflation propagation, macro state
persistence, exact cash-yield postings, fixed-debt protection, balanced ledger
evidence, and macro-derived mortgage quotes. Existing replay checksum fixtures
prove absent market-version evidence continues through `regime-v1` unchanged.

## Intentional current limits

- The model has one aggregate sector channel, not a large per-industry mapping.
- The product API currently stamps `normal`; Prompt 09 will own persisted run
  difficulty and route Guided/Hard consistently through macro and fairness
  policies. Direct core/replay support is already versioned and tested.
- It uses four calibrated regimes; additional regimes require a new calibration
  version rather than editing the accepted one.
- No current debt product is variable-rate. The macro rate is persisted and the
  new/refinance mortgage channel is implemented; a future variable-rate product
  must declare its reset rule explicitly.
- Headlines are deterministic templates. They do not call an AI service in the
  authoritative monthly path.
