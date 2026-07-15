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

Create a separate Vercel project whose root directory is `services/tax`. Enable
Fluid Compute because PolicyEngine's scientific Python dependencies exceed a
standard small function bundle. The checked-in `vercel.json`, Python 3.12 pin,
fully locked `requirements.txt`, and `api/index.py` provide the deployment entry
point. Configure `TAX_SERVICE_TOKEN` in both the tax-service and Next.js server
projects. Do not deploy the development dependency group.

The endpoint is computationally expensive on a cold start. Keep the service warm
during judging and check `/healthz` before a demo. Do not log request bodies;
household data can be sensitive.

## Accuracy boundary

PolicyEngine covers federal and state tax/benefit rules, but this integration is
an educational simulation rather than tax preparation software. Comprehensive
city and county tax support is outside scope. Every result includes the required
educational-estimate disclaimer and exact model versions.
