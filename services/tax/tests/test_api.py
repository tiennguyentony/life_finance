import os
from typing import get_args

import pytest
from fastapi.testclient import TestClient

from tax_service.app import app
from tax_service.models import STATE_CODES

os.environ["TAX_SERVICE_TOKEN"] = "test-service-token"
client = TestClient(app)
AUTHORIZATION = {"Authorization": "Bearer test-service-token"}


def household(
    *,
    state_code: str = "CA",
    filing_status: str = "single",
    include_spouse: bool = False,
    include_dependent: bool = False,
) -> dict:
    people = [
        {
            "id": "person.primary",
            "role": "primary",
            "ageYears": 35,
            "income": {
                "w2Jobs": [{"id": "job.main", "wagesCents": 6_000_000}],
                "contractorNetProfitCents": 1_000_000,
            },
        }
    ]
    if include_spouse:
        people.append(
            {
                "id": "person.spouse",
                "role": "spouse",
                "ageYears": 34,
                "income": {"w2Jobs": [{"id": "job.spouse", "wagesCents": 3_000_000}]},
            }
        )
    if include_dependent:
        people.append(
            {
                "id": "person.dependent",
                "role": "dependent",
                "ageYears": 10,
                "income": {},
            }
        )

    return {
        "schemaVersion": 1,
        "traceId": "tax.integration.1",
        "economicYear": 2026,
        "policyYear": 2026,
        "cumulativePriceIndexPpm": 1_000_000,
        "stateCode": state_code,
        "filingStatus": filing_status,
        "people": people,
        "deductions": {},
    }


def test_health_reports_pinned_model_versions() -> None:
    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "policyYear": 2026,
        "bundleVersion": "4.21.0",
        "rulesVersion": "1.764.6",
    }


def test_rejects_nominal_future_dollars() -> None:
    payload = household()
    payload["economicYear"] = 2030
    payload["cumulativePriceIndexPpm"] = 1_100_000

    response = client.post("/v1/calculate", json=payload, headers=AUTHORIZATION)

    assert response.status_code == 422
    assert "deflated" in response.json()["detail"]


def test_calculates_a_pinned_real_policyengine_household() -> None:
    response = client.post("/v1/calculate", json=household(), headers=AUTHORIZATION)

    assert response.status_code == 200, response.text
    result = response.json()
    assert result["traceId"] == "tax.integration.1"
    assert result["annualGrossIncomeCents"] == 7_000_000
    assert result["totalTaxCents"] == (
        result["federalIncomeTaxCents"]
        + result["stateIncomeTaxCents"]
        + result["employeePayrollTaxCents"]
        + result["selfEmploymentTaxCents"]
    )
    assert result["afterTaxIncomeCents"] == 7_000_000 - result["totalTaxCents"]
    assert result["model"] == {
        "provider": "PolicyEngine US",
        "bundleVersion": "4.21.0",
        "rulesVersion": "1.764.6",
        "projectedFromFrozenPolicy": False,
    }
    assert result["disclaimer"].startswith("Educational estimate")


def test_calculation_requires_constant_time_bearer_authentication() -> None:
    missing = client.post("/v1/calculate", json=household())
    incorrect = client.post(
        "/v1/calculate",
        json=household(),
        headers={"Authorization": "Bearer incorrect"},
    )

    assert missing.status_code == 401
    assert incorrect.status_code == 401


@pytest.mark.parametrize("state_code", get_args(STATE_CODES))
def test_real_policyengine_supports_every_state_and_dc(state_code: str) -> None:
    response = client.post(
        "/v1/calculate",
        json=household(state_code=state_code),
        headers=AUTHORIZATION,
    )

    assert response.status_code == 200, f"{state_code}: {response.text}"
    result = response.json()
    assert result["stateCode"] == state_code
    assert isinstance(result["stateIncomeTaxCents"], int)


@pytest.mark.parametrize(
    ("filing_status", "include_spouse", "include_dependent"),
    [
        ("single", False, False),
        ("married_filing_jointly", True, False),
        ("married_filing_separately", False, False),
        ("head_of_household", False, True),
        ("qualifying_surviving_spouse", False, True),
    ],
)
def test_real_policyengine_supports_every_filing_status(
    filing_status: str,
    include_spouse: bool,
    include_dependent: bool,
) -> None:
    response = client.post(
        "/v1/calculate",
        json=household(
            filing_status=filing_status,
            include_spouse=include_spouse,
            include_dependent=include_dependent,
        ),
        headers=AUTHORIZATION,
    )

    assert response.status_code == 200, f"{filing_status}: {response.text}"
    assert response.json()["filingStatus"] == filing_status
