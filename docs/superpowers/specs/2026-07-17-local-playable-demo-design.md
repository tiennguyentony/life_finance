# Local playable demo design

## Goal

Provide an instant local way to play the canonical 3D board and exercise the backend without PostgreSQL, the external tax service, AI credentials, or seeded infrastructure. The demo must use the same browser API, HttpOnly session cookie, application use cases, and deterministic game engine as a normal run.

## Product behavior

- The landing page exposes an **Instant demo** action in local development.
- Starting a demo creates a ready-to-play run, sets the existing run-session cookie, and opens `/board`.
- The board UI and player interactions remain unchanged.
- Moving around the board and resolving events submit the existing command intents through the existing API client.
- Demo state lasts for the lifetime of the local Next.js server and resets when that server restarts.
- Demo mode is unavailable in production and cannot silently replace a failed production dependency.

## Architecture

The normal runtime remains PostgreSQL plus the configured tax service. A development-only demo runtime supplies two adapters behind the existing service interfaces:

1. An in-memory run repository stores demo state, accepted commands, and replay information.
2. A deterministic offline tax calculator returns simplified educational tax results for demo month processing.

The demo composes the existing onboarding service and run service with those adapters. Runtime routing recognizes demo run identifiers already present in the in-memory store and delegates all other runs to the normal lazy-loaded production service. This keeps public API contracts and board code independent of the storage mode.

## Request flow

1. The player selects **Instant demo**.
2. A same-origin `POST /api/demo` request creates a fixed starter persona through the demo onboarding service.
3. The response sets the existing HttpOnly run-session cookie; the access secret is never returned to browser JavaScript.
4. The browser navigates to `/board` and loads `GET /api/session` as usual.
5. Board commands continue through `POST /api/runs/{runId}/commands`.
6. The runtime dispatches the demo run to the in-memory service, which uses the real deterministic engine and offline tax adapter.

## Safety and failure handling

- `POST /api/demo` returns not found outside development, so production cannot create ephemeral runs.
- Demo and production runs use the same cookie validation and same-origin write protection.
- Demo dispatch is based on server-owned in-memory membership, not a browser-supplied mode flag.
- A missing demo run after a server restart is reported through the existing unauthorized/not-found response; the player can start a new demo.
- Normal onboarding never falls back to demo data when PostgreSQL or tax configuration fails.

## Offline tax behavior

The offline adapter implements the existing tax-calculator contract with integer-only, deterministic calculations. It estimates taxable income after supported pre-tax deductions, applies a small progressive bracket schedule, and returns the evidence fields required by the engine. It is clearly labeled as a demo estimate and is not intended for real tax advice.

## Testing

- Unit tests cover demo enablement, deterministic tax output, repository authorization, command persistence, and idempotent replay.
- HTTP tests cover same-origin enforcement, production disablement, cookie issuance without secret leakage, session loading, and command submission.
- UI tests cover the local demo entry action and successful redirect to the board.
- Existing core, API, board, type-check, lint, and production-build suites remain green.
- A browser smoke test starts a demo, loads the 3D board, processes a month, and verifies that the HUD changes from backend state.

## Acceptance criteria

- With no database or external tax service running, a developer can run `pnpm dev`, select **Instant demo**, and play at least one complete month on `/board`.
- Network traffic shows the same session and command API used by normal gameplay.
- Refreshing the board preserves the demo until the local server restarts.
- Production builds do not expose a working demo creation endpoint.
- No alternate gameplay screen or frontend mock state is introduced.
