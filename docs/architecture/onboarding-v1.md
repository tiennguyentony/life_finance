# Onboarding and State Initialization v1

Date: 2026-07-16

Status: Prompt 13 core, browser UI, service, HTTP, AI-adapter, and persistence
implementation.

## Audit outcome

The repository already had one authoritative `GameStateV2`, a versioned
scenario catalog, a native state/ledger constructor, deterministic risk and goal
owners, strict save decoding, four UI presets, and an untrusted onboarding AI
contract. It did not have a typed review/confirmation boundary, documented
defaults/provenance, custom-expense construction, persisted initialization
evidence, an offline no-AI fallback service, or a review-first API.

Prompt 13 now supplies those missing boundaries without creating another player
state. `OnboardingReviewV1` is a transient DTO. Only the confirmed result stored
inside `GameStateV2.gameplay.initialization` and the existing authoritative state
are persisted.

## Deterministic pipeline

1. `prepareOnboardingReviewV1` accepts exact cents/PPM and explicit
   annual/monthly plus gross/take-home units.
2. It resolves the pinned offline scenario catalog, validates debts, rates,
   credit, HSA eligibility, asset allocations, salary/scenario bounds,
   wellbeing, difficulty, and months.
3. It applies only closed, versioned defaults and returns canonically sorted
   issues, assumptions, and provenance with a SHA-256 review checksum. The
   checksum also binds the full owner-produced preview, including the native
   state, schema, goal, and risk owner versions displayed for confirmation.
4. The API review operation performs no repository write.
5. Confirmation sends the original draft and checksum. The server recomputes
   the review and rejects changed or non-ready input before repository access.
6. `constructOnboardedGameStateV1` resolves the catalog again and calls
   `createNativeGameStateV2`. Confirmed essential/discretionary expenses become
   the native annual living cost; the native debt/health/insurance obligation
   path remains the sole formula owner.
7. The financial-goal projection, initial risk preview, and exposure snapshot
   are produced by their existing deterministic owners.
8. The initial source seed, versions, review/input checksums, declared expenses,
   assumptions, provenance, and owner IDs are stored as bounded initialization
   evidence in the authoritative state.
9. `RunRepository.createRunV2` persists the state, state checksum, scenario
   snapshot, and opening ledger. Strict decode validates the evidence on load.

The same normalized input, seed, run ID, and player ID produces the same state
checksum. Native inputs that omit the new optional living-cost/evidence fields
retain the existing output and Runtime Balance version boundary.

## Income and expense rules

- Gross income is authoritative for state construction. Take-home-only input is
  `needs_input`; onboarding never reverse-calculates gross pay or duplicates tax
  logic.
- Annual values remain annual. Monthly values are multiplied by exactly twelve
  with safe-integer overflow checks.
- Take-home values supplied beside gross are display evidence only and generate
  the visible `TAKE_HOME_DISPLAY_ONLY` assumption.
- Annualized take-home evidence greater than annualized gross income is rejected
  at `takeHomeIncome` with `TAKE_HOME_EXCEEDS_GROSS`; mixed annual/monthly input
  cannot hide the impossible relationship.
- Taxable and retirement totals never cause invented allocations. If a total is
  supplied, every bucket must be supplied and reconcile exactly.
- Confirmed custom essential and discretionary expenses reconcile exactly to
  `finances.annualLivingCostCents`. When omitted, the pinned catalog living cost
  is used and recorded as a catalog default.
- Essential and discretionary expense provenance is recorded separately. A
  typed value, a user-confirmed AI extraction, and an omitted component that is
  explicitly defaulted to zero therefore remain distinguishable in persisted
  evidence; onboarding does not attach a misleading source to their aggregate.

## HTTP and optional AI boundaries

- `POST /api/v2/onboarding/review` — strict, stateless review.
- `POST /api/v2/runs/from-onboarding` — checksum-bound confirmation and run
  creation.
- `POST /api/v2/onboarding/parse` — optional untrusted extraction; requires the
  current privacy-consent fields.

The AI adapter accepts only canonical birth month and allow-listed catalog
location/career candidates. Monetary candidates remain exact source strings
with explicit stated period and gross/take-home basis; the AI contract never
turns those strings into authoritative cents. It cannot create state or supply
financial effects.
Unavailable providers return `AI_UNAVAILABLE` and never block typed/persona
review. Raw free text is transient. For the onboarding role, persisted AI audit
records retain its hash/length and attempt metadata but remove prompt text and
provider output/excerpts. No raw text is placed in review, state, or API result.

## Stable personas

`software`, `nurse`, `teacher`, and `established` are recursively frozen,
versioned fixtures. `onboardingDraftForPersonaV1` deep-clones and recursively
freezes an isolated draft before adding its seed, then sends that draft through
the same typed path used by custom onboarding; persona selection does not have
a separate state constructor.

Issue and assumption copy lives in the versioned
`onboarding-en-US-v1` localization catalog. Unsupported locales fall back to
English presentation only; localized strings never enter review or state
checksums.

An AI-assisted draft may retain a valid base persona identity. Unchanged fields
then keep persona-fixture provenance while extracted fields the player applies
become ordinary `user_entered` typed values. The public API rejects naked
`confirmedAiFieldIds`: without a server-verifiable extraction binding, client
claims cannot elevate persisted provenance. The non-authoritative
`ai_assisted` source mode still records how collection began, and hybrid
persona/typed provenance survives strict save/load.

## Validation and replay evidence

Initialization validation checks closed versions/source enums, hash format,
bounded and canonical assumption/provenance arrays, persona/source consistency,
the opening RNG seed at revision zero, exact expense reconciliation, and the
fixed derived-owner IDs. Historical and low-level schema-v2 states may omit the
field; decoding never backfills it. The original seed remains evidence after
later RNG advancement rather than being incorrectly compared with the current
cursor.

## Test evidence

Focused coverage includes:

- all four personas, complete and partial typed input, annual/monthly and
  gross/take-home behavior;
- deep immutability and isolation of defaults/persona drafts, field-accurate
  persona/edit/AI/expense provenance, owner-version previews, and checksum
  rejection after preview tampering;
- unknown-location fallback, scenario incompatibility, asset allocations,
  debt/rate/credit/HSA validation, and order-independent checksums;
- confirmation to native state, custom-expense obligations, initial exposure,
  deterministic checksums, strict JSON save/load, and stale-review rejection;
- no-write review, rejection before repository access, strict HTTP
  review-to-confirm flow, scenario/native/ledger integration, and fake strict
  persistence;
- AI success, strict source-string monetary contract fixtures, malformed
  output, no-provider fallback, no state creation, and raw-text-free audit
  records; and
- a `TEST_DATABASE_URL`-gated PostgreSQL test that creates, loads, checksums,
  and verifies opening ledger rows for a confirmed onboarding run.

The widened Prompt 13 verification checkpoint passed 12 test files and 100 tests.
The repository integration file contributed 30 skipped cases because this
environment has no `TEST_DATABASE_URL`; that gate remains explicit rather than
being represented as a passing live-database result.

## Browser review and confirmation flow

The play console no longer uses the legacy direct-create endpoint. It composes
the stable personas and exhaustive manual fields into one `OnboardingDraftV1`,
then:

1. optionally sends transient free text to `/api/v2/onboarding/parse` only
   after explicit consent, immediately clears the text from component state,
   displays typed candidates (including visible currency/period/basis), and
   applies only fields the player explicitly accepts;
2. posts `{ draft }` to `/api/v2/onboarding/review` and renders every material
   normalized starting fact, issues, assumptions, provenance/default sources,
   goal/FI/Risk owner previews, employer-match tiers, seed, versions, and
   checksum;
3. invalidates the accepted review whenever any source field changes; and
4. posts only the original reviewed draft and its checksum to
   `/api/v2/runs/from-onboarding`, accepts the returned authoritative state,
   and stores only `{ runId, accessSecret }` in browser session storage.

A monotonic onboarding request coordinator rejects late review, parse, or
confirm responses after a newer request or reset. A synchronous in-flight guard
prevents duplicate confirmation before React can re-render, and the complete
field set is disabled while a request is active. The legacy `/api/v2/runs`
endpoint remains server-supported for compatibility and low-level fixtures,
but the product onboarding UI has no bypass to it.

## Environment limitations

- PostgreSQL coverage is skipped when `TEST_DATABASE_URL` is absent and must be
  reported as unavailable, not passing.
- External OpenAI/Groq/Ollama smoke tests remain optional. Deterministic fake
  provider coverage is mandatory and offline.
- Take-home-only income cannot become gross salary until the financial owner
  exposes a deterministic inverse-tax capability.
- Unknown locations use a visible Seattle product fallback; this is not a claim
  of equivalent tax or cost of living.
