from __future__ import annotations

import logging
import os
import secrets

from fastapi import FastAPI, Header, HTTPException

from tax_service.calculator import calculate_tax
from tax_service.models import (
    HealthResponse,
    TaxCalculationRequest,
    TaxCalculationResult,
)

logger = logging.getLogger("life_finance.tax")

app = FastAPI(
    title="Life Finance Tax Service",
    version="1.0.0",
    description="Educational US tax estimates using pinned PolicyEngine rules.",
)


@app.get("/healthz", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse()


@app.post("/v1/calculate", response_model=TaxCalculationResult)
def calculate(
    request: TaxCalculationRequest,
    authorization: str | None = Header(default=None),
) -> TaxCalculationResult:
    configured_token = os.environ.get("TAX_SERVICE_TOKEN")
    if not configured_token:
        raise HTTPException(status_code=503, detail="tax service is not configured")
    expected_authorization = f"Bearer {configured_token}"
    if authorization is None or not secrets.compare_digest(
        authorization, expected_authorization
    ):
        raise HTTPException(status_code=401, detail="invalid service authorization")
    if request.economic_year != 2026 or request.cumulative_price_index_ppm != 1_000_000:
        raise HTTPException(
            status_code=422,
            detail="request must be deflated to frozen 2026 policy dollars",
        )
    try:
        return calculate_tax(request)
    except HTTPException:
        raise
    except Exception as error:
        logger.exception(
            "PolicyEngine calculation failed for trace_id=%s",
            request.trace_id,
        )
        raise HTTPException(
            status_code=422,
            detail="PolicyEngine rejected the household calculation",
        ) from error
