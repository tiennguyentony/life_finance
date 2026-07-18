# Life Finance tax service

This independently deployable FastAPI service calculates educational US tax
estimates with the certified `policyengine[us]` 4.21.0 bundle, which pins
PolicyEngine US rules 1.764.6. It deliberately evaluates only frozen 2026 policy.
The Next.js application is responsible for deflating future nominal household
inputs to 2026 dollars and re-inflating the returned amounts.

## Local verification

Install [uv](https://docs.astral.sh/uv/), then run:

```sh
uv sync --frozen
uv run ruff format --check .
uv run ruff check .
uv run mypy tax_service
uv run pytest
```

Start the service with:

```sh
uv run uvicorn tax_service.app:app --reload
```

Set `TAX_SERVICE_TOKEN` to a high-entropy secret before calling the calculation
endpoint. Send it only from the Next.js server as `Authorization: Bearer ...`;
never expose it to browser code. Readiness remains public and contains no
sensitive data.

The API is available at `POST /v1/calculate`, readiness at `GET /healthz`, and
OpenAPI at `/openapi.json`. Requests and responses use signed or non-negative
integer cents; floating-point currency never crosses the HTTP boundary.

## Vercel deployment

The repository root `vercel.json` currently declares `frontend` and `tax` as a
multi-service deployment and rewrites `/api/tax/*` to the tax service. The tax
service root is `services/tax` and its entrypoint is `api/index.py`. Enable Fluid
Compute because PolicyEngine's scientific Python dependencies exceed a standard
small function bundle. The Python 3.12 pin and locked production requirements
provide the deployment environment; do not deploy the development dependency
group.

Configure the same high-entropy `TAX_SERVICE_TOKEN` for both services. Configure
the frontend `TAX_SERVICE_URL` for the deployed topology; never expose either
value to browser code. If the platform account does not support this
multi-service configuration, deploying `services/tax` as a separate Vercel
project is a supported operational alternative, but its URL must then be set on
the frontend explicitly.

If a serverless host cannot start the scientific Python bundle, the frontend
also supports the explicit `TAX_CALCULATOR_MODE=deterministic` deployment mode.
That mode uses the same simplified educational calculator as the local demo; it
does not claim PolicyEngine accuracy and should be replaced by this service on a
container host before production tax accuracy is evaluated. There is no silent
fallback: an unset mode continues to require the pinned service and fails
closed when its configuration is missing.

The endpoint is computationally expensive on a cold start. Keep the service warm
during judging and check `/healthz` before a demo. Do not log request bodies;
household data can be sensitive.

## Accuracy boundary

PolicyEngine covers federal and state tax/benefit rules, but this integration is
an educational simulation rather than tax preparation software. Comprehensive
city and county tax support is outside scope. Every result includes the required
educational-estimate disclaimer and exact model versions.
