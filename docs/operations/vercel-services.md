# Vercel services deployment

The Next.js application and the pinned PolicyEngine tax service deploy as two
services inside one Vercel project. [`vercel.json`](../../vercel.json) uses
Vercel's current `services` model.

## Layout

| Service | Root | Entrypoint | Public traffic |
| --- | --- | --- | --- |
| `web` | `./` | Next.js auto-detection | `/(.*)` |
| `tax_service` | `services/tax` | `api/index.py` | None; private binding only |

The catch-all rewrite sends browser traffic to `web`. The tax service has no
public rewrite. The web service declares a private binding that injects the
deployment-aware backend URL as `TAX_SERVICE_URL` at runtime:

```json
"bindings": [
  {
    "type": "service",
    "service": "tax_service",
    "format": "url",
    "env": "TAX_SERVICE_URL"
  }
]
```

`PolicyEngineTaxClient` resolves `v1/calculate` against this URL. A preview web
service therefore reaches the tax service from the same preview without a fixed
hostname or public network route.

The binding grants reachability, not application authorization. Keep
`TAX_SERVICE_TOKEN` configured and checked by the tax service. Read the binding
only from server runtime code; it is unavailable during builds and middleware.

## Required project settings

1. In Project → Settings → Build and Deployment, set **Framework** to
   **Services**. Vercel builds the project as services only when that setting and
   the `services` key are both present.
2. Remove any manually configured `TAX_SERVICE_URL`. Vercel injects it through
   the private binding.
3. Keep `TAX_SERVICE_TOKEN`, `DATABASE_URL`, `RUN_SECRET_PEPPER_BASE64URL`, and
   the Supabase variables as normal project environment variables.

The web service owns `buildCommand`, so `scripts/vercel-build.mjs` continues to
run the production migration guard. The tax service owns its FastAPI entrypoint
and 300-second function duration.

## Reverting to two projects

`services/tax/vercel.json` remains available for a standalone tax deployment.
To split the services again, remove the root `services` and `rewrites` blocks,
restore the web build command at the top level, set the main project framework
to **Next.js**, deploy `services/tax/` separately, and configure its absolute URL
as `TAX_SERVICE_URL` on the main project.

## Local development

`vercel dev` runs both services and injects the binding. Use `vercel dev -L` to
run without cloud authentication. Regular `pnpm dev` still reads
`TAX_SERVICE_URL` from `.env`, or uses the deterministic calculator when
`TAX_CALCULATOR_MODE=deterministic` is explicitly configured.
