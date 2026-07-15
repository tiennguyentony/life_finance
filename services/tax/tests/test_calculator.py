from tax_service.calculator import (
    cents_to_dollars,
    divide_half_away_from_zero,
    dollars_to_cents,
    income_to_policyengine,
)
from tax_service.models import AnnualIncome, W2Job


def test_exact_currency_boundary_rounding() -> None:
    assert cents_to_dollars(12_345) == 123.45
    assert dollars_to_cents(123.455) == 12_346
    assert dollars_to_cents(-0.005) == -1
    assert divide_half_away_from_zero(1, 2) == 1
    assert divide_half_away_from_zero(-1, 2) == -1


def test_income_mapping_preserves_distinct_tax_treatments() -> None:
    income = AnnualIncome(
        w2_jobs=[
            W2Job(
                id="job.main",
                wages_cents=10_000_00,
                pretax_retirement_contributions_cents=1_000_00,
                pretax_health_contributions_cents=500_00,
            ),
            W2Job(id="job.second", wages_cents=2_000_00),
        ],
        self_employment_net_profit_cents=3_000_00,
        contractor_net_profit_cents=4_000_00,
        ordinary_dividends_cents=100_00,
        qualified_dividends_cents=75_00,
    )

    mapped = income_to_policyengine(income)

    assert mapped["employment_income"] == 12_000
    assert mapped["pre_tax_contributions"] == 1_500
    assert mapped["fica_pre_tax_contributions"] == 500
    assert mapped["self_employment_income"] == 7_000
    assert mapped["ordinary_dividend_income"] == 100
    assert mapped["qualified_dividend_income"] == 75
