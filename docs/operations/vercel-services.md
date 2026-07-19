# Vercel services deployment

The Next.js application and the pinned PolicyEngine tax service deploy as two
services inside one Vercel project, configured by the `services` key in
[`vercel.json`](../../vercel.json).

## Layout

| Service | Root | Public? |
| --- | --- | --- |
| `web` | `./` | Yes — the top-level rewrite sends all traffic here |
| `tax` | `services/tax/` | No — reachable only over the service binding |

`tax` has no top-level rewrite of its own, so Vercel never routes public traffic
to it. That is a deliberate tightening: previously the tax service was a
separate public deployment protected only by a bearer token.

## How the application reaches the tax service

`web` declares a binding to `tax` that injects the target URL as
`TAX_SERVICE_URL`:

```json
"bindings": [
  { "type": "service", "service": "tax", "format": "url", "env": "TAX_SERVICE_URL" }
]
```

The value is deployment-aware, so a preview deployment's `web` reaches that same
preview's `tax` without referencing a fixed hostname. No application code
changed: `PolicyEngineTaxClient` already resolves `v1/calculate` against
`TAX_SERVICE_URL` as a base.

A binding grants internal reachability but does not authenticate the call, so
`TAX_SERVICE_TOKEN` is still required and still checked by the tax service.

## Required project settings

Two settings must be applied in the Vercel dashboard. They cannot be committed.

1. **Framework** — Project → Settings → Build and Deployment → Framework →
   **Services**. A project only builds as services when this is selected *and*
   `services` is present in `vercel.json`.
2. **Remove `TAX_SERVICE_URL`** from the project's environment variables. Vercel
   generates and injects it from the binding; leaving a manually set value
   configured is at best redundant and at worst points production at the old
   standalone deployment.

Keep `TAX_SERVICE_TOKEN`, `DATABASE_URL`, `RUN_SECRET_PEPPER_BASE64URL`, and the
Supabase variables as normal project environment variables.

## Constraints this introduces

- **Build and runtime keys cannot sit at the top level** of `vercel.json` once
  `services` is present. `buildCommand` now lives inside the `web` service; the
  production migration guard in `scripts/vercel-build.mjs` runs unchanged.
- **Bindings resolve at runtime in functions only.** They do not resolve during
  builds, and middleware cannot call another service over a binding. Nothing in
  this project needs the tax service at build time, and `src/proxy.ts` only
  touches Supabase auth.
- **The tax service no longer deploys independently.** Its
  `policyengine[us]` 4.21.0 pin now ships on the application's release cadence
  rather than its own.

## Reverting to two projects

`services/tax/vercel.json` is retained and still describes a standalone
deployment. To go back: remove the `services` and top-level `rewrites` keys from
the root `vercel.json`, restore `buildCommand` to the top level, set the project
framework back to **Next.js**, redeploy `services/tax/` as its own project, and
set `TAX_SERVICE_URL` manually again.

## Local development

`vercel dev` runs both services together and injects the binding variable. To
run entirely offline, use `vercel dev -L`.

Local `pnpm dev` is unaffected and still reads `TAX_SERVICE_URL` from `.env`, or
falls back to the deterministic calculator via `TAX_CALCULATOR_MODE`.
