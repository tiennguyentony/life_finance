# Player actions and persistent policies v2

Date: 2026-07-16

## Authority

The active browser game has one mutation path for player financial decisions:

1. The browser converts a draft into a strict public v2 command. A draft contains player intent only; it does not contain transaction-cost, withholding, penalty, closing-cost, or sale-cost rates.
2. `RunApiServiceV2` authenticates the request and maps it to the persisted command shape. New detailed-action commands are stamped with action policy `1.0.0`; engine-owned rates are copied from that immutable registry.
3. The repository locks the run, verifies revision/checksum/idempotency, and dispatches the command through the same authoritative reducer used by replay.
4. The reducer validates affordability and eligibility, applies the balance-sheet or persistent-policy change, appends balanced journal evidence where money moved, and finalizes the next immutable state.
5. The repository persists accepted command, state, normalized ledger rows, and outbox evidence atomically.

`detailed-actions-v2.ts` owns one-time financial actions. `recurring-strategy-v2.ts` owns the persistent monthly allocation and protection policy: emergency-fund target, active insurance subset, retirement/HSA/taxable allocations, and extra debt payment. While cash is below the configured obligation-month target, the allocation planner retains after-tax discretionary cash before investing or making extra debt payments. Insurance choices are validated against the immutable coverage universe selected when the run was created. Changing the active subset immediately changes required premium obligations and claim eligibility; historical states without these fields retain no automatic target and continue to use their onboarding insurance selection. The public API taxonomy is the union of these two command families; UI labels and drafts are adapters, not financial authorities.

## Immutable action policy

Action policy `1.0.0` owns the rates and age boundary used by detailed actions:

- taxable liquidation transaction cost;
- retirement withholding and early-withdrawal penalty;
- early-retirement age boundary;
- home purchase, sale, and refinance costs.

The registry is code-owned and immutable. A new economic rule requires a new registered policy version and replay fixtures; callers cannot override a registered value.

Historical persisted commands without `actionPolicyVersion` use the frozen compatibility branch. A historical taxable liquidation may retain its already-persisted rate so its checksum and replay result remain exact. The public contract accepts the deprecated rate only to recognize an exact retry of such a previously accepted command. The service rejects it for every new or mismatched command; newly mapped browser commands always receive server-owned policy `1.0.0`.

## Preview and approval protocol

`POST /api/v2/runs/{runId}/commands/preview` accepts only detailed-action and recurring-strategy public commands. It authenticates and maps the command exactly as the apply path does, then asks the repository to run the normal reducer without writing.

The preview response contains:

- opening and resulting revision/checksum evidence;
- the checksum of the mapped authoritative command;
- immediate cash and automatic-liquidity changes;
- term-debt principal and revolving-credit-use changes;
- annual living-cost and required-obligation changes;
- persistent lifestyle or recurring-strategy replacements;
- the exact balanced journal transactions that would be appended.

Preview does not create an accepted command, state snapshot, ledger row, monthly record, or outbox row. The browser stores the exact public command submitted for preview. Explicit approval submits that same command object to the normal command endpoint. Any draft edit, authoritative revision change, or month change invalidates the stored preview; a stale preview cannot be approved.

This is a consistency protocol, not a reservation. Another accepted command can make a preview stale between preview and approval. The normal optimistic-revision check remains authoritative and rejects that application, after which the player must preview again.

## UI boundary

The play UI may convert dollars to cents, percentages to PPM, and a selected debt label to a debt identifier. It does not calculate affordability, fees, liquidity, debt effects, living-cost effects, or ledger postings. Those values displayed in the approval panel come only from the preview response.

Both recurring-strategy replacement and detailed actions follow the same two-step interaction:

~~~text
edit draft -> Preview -> inspect engine effects -> Approve exact preview -> Apply
~~~

Event choices and life-milestone commands are separate bounded decision families and do not use this player financial-action preview contract.

## Verification

Unit and local integration coverage verifies:

- every detailed action family and persistent strategy transition;
- exact policy registry rates and rejection of overrides;
- historical absent-version replay compatibility;
- preview parity with the production reducer;
- no-write preview behavior;
- preview contract/client/service/route mapping;
- exact-command approval, stale revision/month rejection, in-flight draft-generation invalidation, and required UI evidence;
- emergency-target cash retention, restored-draft hydration, insurance premium/claim effects, and invalid coverage rejection;
- public liquidation intent contains no client-owned transaction-cost rate.

The PostgreSQL integration suite exercises HTTP/service, repository transaction, reducer, state, ledger, and retry/rollback behavior when `TEST_DATABASE_URL` is configured. In the current environment that variable is absent, so those real-database tests are defined but skipped; local core/service/UI tests do not substitute for that database proof.
