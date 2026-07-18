# Browser API

The browser API is same-origin and intentionally unversioned. Internal schema and replay versions do not appear in URLs or player commands.

## Active endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Static process-liveness response; it does **not** check PostgreSQL, tax, or AI readiness |
| `GET` | `/api/openapi.json` | Lightweight route summary, not a complete generated schema reference |
| `POST` | `/api/demo` | Create an in-memory demo run; returns 404 outside development |
| `GET` | `/api/session` | Restore the cookie-authenticated run, or report no active session |
| `DELETE` | `/api/session` | Clear the active run cookie |
| `POST` | `/api/onboarding/parse` | Optional AI extraction into onboarding candidate fields |
| `POST` | `/api/onboarding/review` | Deterministically normalize/validate a draft and return a checksum |
| `POST` | `/api/runs` | Confirm the checksum-bound draft, create a run, and set its session cookie |
| `GET` | `/api/runs/{runId}` | Read the authorized run as `RunView` |
| `POST` | `/api/runs/{runId}/commands` | Submit a versionless player intent |

Preview, multi-month time advancement, checkpoints, causal history, counterfactuals, teaching moments, and debriefs have internal contracts/services but no active unversioned route. Code or tests referring to historical `/api/v2/...` paths do not make those paths part of the current browser API.

## Session and request security

The `life_finance_run` cookie contains a base64url-encoded run ID and a random access secret. It is opaque to application JavaScript, not an encrypted user profile. The server stores only the versioned HMAC hash of the access secret.

- `HttpOnly`, `SameSite=Strict`, `Path=/api`, 30-day maximum age.
- `Secure` in production.
- State-changing requests require an `Origin` matching the request origin.
- Request bodies are capped at 64 KiB and browser responses at 2 MiB.
- Dynamic API responses use `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, and a request ID.
- Access secrets never appear in JSON or browser storage.

This is capability-based run access, not a multi-user account system. Anyone who obtains the cookie capability can access that run until the secret expires or is replaced.

## `RunView`

`RunView` is the only player-facing state projection. It includes:

- run ID, revision, current month, and status;
- player identity, location, career, and scenario labels;
- summarized cash, investments, retirement/HSA, debts, living cost, obligations, credit, and net worth;
- gross salary, wellbeing, financial-independence goal/progress, recurring strategy, and market;
- Risk v1 summary and pending upskill programs;
- at most one pending event with its available choices;
- terminal outcome and current action capabilities.

It excludes schema/engine envelopes, raw ledger, tax evidence, RNG state, checksums, persistence rows, and the access secret.

## Command intent

Every command supplies a globally unique idempotency ID and the exact revision the player observed:

```json
{
  "id": "board.month.6b359832-56fa-4d44-93fd-c29d063b4f43",
  "expectedRevision": 4,
  "type": "process_month",
  "payload": {}
}
```

Active public intent types are:

- `set_recurring_strategy`
- `take_detailed_action`
- `resolve_event_choice`
- `manage_life_milestone`
- `process_month`

The server adds command schema 2 and the authorized run’s effective month. Reusing a command ID is idempotent only for the same accepted command; a stale `expectedRevision` is rejected rather than silently rebased.

`take_detailed_action` supports more actions than the current board menu exposes, including taxable investing/liquidation, IRA/HSA contributions, several debt actions, retirement withdrawal, housing, lifestyle, and upskilling. Public contract support therefore does not imply a current UI control.

## Event resolution

While `RunView.pendingEvent` is present, the monthly loop is blocked until the player submits `resolve_event_choice` with the exact `eventId` and a listed `choiceId`. Event effects are deterministic and are applied on the next appropriate transition according to the event contract.

## Errors and recovery

All errors have one JSON shape:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "request body is invalid",
    "requestId": "..."
  }
}
```

The browser client schema-validates successes and normalizes transport, schema, and server failures into `ApiClientError`. The board refreshes the session after ambiguous or stale multi-command turns; if the plan landed but the month did not, it offers a month-only retry.
