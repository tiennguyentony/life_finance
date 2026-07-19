# Vercel experimental services deployment

The Next.js application and the pinned PolicyEngine tax service deploy as two
services inside one Vercel project. This project is enrolled in Vercel's earlier
Services model, so [`vercel.json`](../../vercel.json) uses the
`experimentalServices` key rather than the newer `services` model.

## Layout

| Service | Entrypoint | Route |
| --- | --- | --- |
| `web` | `./` | `/` |
| `tax_service` | `services/tax/api/index.py` | `/svc/tax` |

The experimental model routes by prefix and does not support private service
bindings. The tax route is therefore publicly addressable, but every calculation
request still requires the server-only `TAX_SERVICE_TOKEN`. Readiness remains
public and contains no sensitive data.

## How the application reaches the tax service

Vercel derives server-side environment variables from service names. Naming the
backend `tax_service` injects its deployment-aware URL as `TAX_SERVICE_URL`:

```json
"tax_service": {
  "entrypoint": "services/tax/api/index.py",
  "routePrefix": "/svc/tax"
}
```

The value is deployment-aware, so a preview deployment's `web` reaches that same
preview's tax service without referencing a fixed hostname. No application code
changed: `PolicyEngineTaxClient` already resolves `v1/calculate` against
`TAX_SERVICE_URL` as a base.

`TAX_SERVICE_TOKEN` is required and checked by the tax service because the
experimental route is public.

## Required project settings

Two settings must be applied in the Vercel dashboard. They cannot be committed.

1. **Framework** — Project → Settings → Build and Deployment → Framework →
   **Services**. A project only builds as services when this is selected *and*
   `experimentalServices` is present in `vercel.json`.
2. **Remove `TAX_SERVICE_URL`** from the project's environment variables. Vercel
   generates and injects it from the `tax_service` name; leaving a manually set value
   configured is at best redundant and at worst points production at the old
   standalone deployment.

Keep `TAX_SERVICE_TOKEN`, `DATABASE_URL`, `RUN_SECRET_PEPPER_BASE64URL`, and the
Supabase variables as normal project environment variables.

## Constraints this introduces

- **Each service owns its build and runtime settings.** `buildCommand` lives
  inside the `web` service; the
  production migration guard in `scripts/vercel-build.mjs` runs unchanged.
- **The tax service is mounted at `/svc/tax`.** Vercel generates
  `TAX_SERVICE_URL` at runtime. Do not call the tax service from middleware or
  expose the generated URL or bearer token to browser code.
- **The tax service no longer deploys independently.** Its
  `policyengine[us]` 4.21.0 pin now ships on the application's release cadence
  rather than its own.

## Reverting to two projects

`services/tax/vercel.json` is retained and still describes a standalone
deployment. To go back: remove `experimentalServices` from the root
`vercel.json`, restore `buildCommand` at the top level, set the project framework
back to **Next.js**, redeploy `services/tax/` as its own project, and set
`TAX_SERVICE_URL` manually again.

## Local development

`vercel dev` runs both services together and injects the generated service URL.
To run entirely offline, use `vercel dev -L`.

Local `pnpm dev` is unaffected and still reads `TAX_SERVICE_URL` from `.env`, or
falls back to the deterministic calculator via `TAX_CALCULATOR_MODE`.
