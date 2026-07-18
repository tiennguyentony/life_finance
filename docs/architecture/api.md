# Browser API

The browser API is same-origin and intentionally unversioned. Internal persistence versions must not appear in URLs or frontend commands.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Service health |
| `GET` | `/api/openapi.json` | Current route description |
| `GET` | `/api/session` | Restore the cookie-authenticated run |
| `DELETE` | `/api/session` | Clear the active run cookie |
| `POST` | `/api/onboarding/parse` | Optional AI field extraction |
| `POST` | `/api/onboarding/review` | Normalize and review a profile |
| `POST` | `/api/runs` | Create a reviewed run and session |
| `GET` | `/api/runs/{runId}` | Read the active run as `RunView` |
| `POST` | `/api/runs/{runId}/commands` | Submit a versionless player intent |

## Session and security

- Run credentials live only in the `life_finance_run` HttpOnly cookie.
- The cookie uses `SameSite=Strict`, `Path=/api`, and `Secure` in production.
- State-changing requests must include a matching `Origin` header.
- Request bodies are limited to 64 KiB.
- Responses use `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, and a request ID.
- Access secrets are never returned in JSON or stored in browser storage.

## `RunView`

`RunView` contains only information needed by product UI: current month and revision, player identity, summarized finances, income, wellbeing, goal progress, risk, strategy, market, pending interaction, outcome, and capabilities.

It deliberately excludes schema version, engine version, tax evidence, ledger transactions, random state, persistence metadata, and the run access secret.

## Commands

The browser sends:

```json
{
  "id": "board.move.<unique id>",
  "expectedRevision": 4,
  "type": "process_month",
  "payload": {}
}
```

The server derives the effective month and current schema envelope. Event choices use `resolve_event_choice` with `eventId` and `choiceId` in the payload.

## Errors

All API errors have one shape:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "request body is invalid",
    "requestId": "..."
  }
}
```

The browser client validates successful responses and normalizes invalid or failed responses into `ApiClientError`.
