from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from threading import Lock
from types import ModuleType
from typing import Any

from tax_service.models import (
    AnnualDeductions,
    AnnualIncome,
    TaxCalculationRequest,
    TaxCalculationResult,
    TaxModelMetadata,
    TaxPerson,
)

FILING_STATUS = {
    "single": "SINGLE",
    "married_filing_jointly": "JOINT",
    "married_filing_separately": "SEPARATE",
    "head_of_household": "HEAD_OF_HOUSEHOLD",
    "qualifying_surviving_spouse": "SURVIVING_SPOUSE",
}
EXTRA_VARIABLES = [
    "adjusted_gross_income",
    "employee_payroll_tax",
    "income_tax",
    "self_employment_tax",
    "state_income_tax",
    "taxable_income",
]
_CALCULATION_LOCK = Lock()
_POLICYENGINE_MODULE: ModuleType | None = None


def policyengine_module() -> ModuleType:
    """Load the large rules engine only for an authenticated calculation.

    Importing PolicyEngine initializes its full rules bundle. Keeping that work
    out of module import allows the unauthenticated health endpoint to answer
    during a serverless cold start without loading hundreds of megabytes of tax
    dependencies. Python's import cache and this module reference make the load
    a one-time operation per warm function instance.
    """

    global _POLICYENGINE_MODULE
    if _POLICYENGINE_MODULE is None:
        import policyengine

        _POLICYENGINE_MODULE = policyengine
    return _POLICYENGINE_MODULE


def cents_to_dollars(value: int) -> float:
    return float(Decimal(value) / Decimal(100))


def dollars_to_cents(value: Any) -> int:
    amount = Decimal(str(float(value))) * Decimal(100)
    return int(amount.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def divide_half_away_from_zero(numerator: int, denominator: int) -> int:
    if denominator == 0:
        raise ValueError("denominator must not be zero")
    sign = -1 if (numerator < 0) != (denominator < 0) else 1
    absolute_numerator = abs(numerator)
    absolute_denominator = abs(denominator)
    quotient, remainder = divmod(absolute_numerator, absolute_denominator)
    if remainder * 2 >= absolute_denominator:
        quotient += 1
    return quotient * sign


def income_to_policyengine(income: AnnualIncome) -> dict[str, float]:
    wages = sum(job.wages_cents for job in income.w2_jobs)
    retirement = sum(
        job.pretax_retirement_contributions_cents for job in income.w2_jobs
    )
    health = sum(job.pretax_health_contributions_cents for job in income.w2_jobs)
    return {
        "employment_income": cents_to_dollars(wages),
        "pre_tax_contributions": cents_to_dollars(retirement + health),
        "fica_pre_tax_contributions": cents_to_dollars(health),
        "self_employment_income": cents_to_dollars(
            income.self_employment_net_profit_cents + income.contractor_net_profit_cents
        ),
        "taxable_interest_income": cents_to_dollars(income.taxable_interest_cents),
        "tax_exempt_interest_income": cents_to_dollars(
            income.tax_exempt_interest_cents
        ),
        "ordinary_dividend_income": cents_to_dollars(income.ordinary_dividends_cents),
        "qualified_dividend_income": cents_to_dollars(income.qualified_dividends_cents),
        "short_term_capital_gains": cents_to_dollars(
            income.short_term_capital_gains_cents
        ),
        "long_term_capital_gains": cents_to_dollars(
            income.long_term_capital_gains_cents
        ),
        "rental_income": cents_to_dollars(income.rental_net_income_cents),
        "taxable_pension_income": cents_to_dollars(income.pension_income_cents),
        "taxable_ira_distributions": cents_to_dollars(income.ira_distributions_cents),
        "social_security": cents_to_dollars(income.social_security_benefits_cents),
        "unemployment_compensation": cents_to_dollars(
            income.unemployment_compensation_cents
        ),
        "miscellaneous_income": cents_to_dollars(income.other_taxable_income_cents),
    }


def deductions_to_policyengine(deductions: AnnualDeductions) -> dict[str, float]:
    return {
        "mortgage_interest": cents_to_dollars(deductions.mortgage_interest_cents),
        "charitable_cash_donations": cents_to_dollars(deductions.charitable_cash_cents),
        "charitable_non_cash_donations": cents_to_dollars(
            deductions.charitable_non_cash_cents
        ),
        "other_medical_expenses": cents_to_dollars(deductions.medical_expenses_cents),
        "student_loan_interest": cents_to_dollars(
            deductions.student_loan_interest_cents
        ),
        "educator_expense": cents_to_dollars(deductions.educator_expenses_cents),
        "health_savings_account_payroll_contributions": cents_to_dollars(
            deductions.hsa_contributions_cents
        ),
        "traditional_ira_contributions_desired": cents_to_dollars(
            deductions.deductible_ira_contributions_cents
        ),
        "self_employed_health_insurance_premiums": cents_to_dollars(
            deductions.self_employed_health_insurance_cents
        ),
    }


def person_to_policyengine(
    person: TaxPerson,
    deductions: AnnualDeductions | None,
) -> dict[str, float | bool]:
    values: dict[str, float | bool] = {
        "age": person.age_years,
        "is_blind": person.is_blind,
        "is_full_time_student": person.is_full_time_student,
        "is_tax_unit_head": person.role == "primary",
        "is_tax_unit_spouse": person.role == "spouse",
        "is_tax_unit_dependent": person.role == "dependent",
        **income_to_policyengine(person.income),
    }
    if deductions is not None:
        values.update(deductions_to_policyengine(deductions))
    return values


def gross_income_cents(request: TaxCalculationRequest) -> int:
    total = 0
    for person in request.people:
        income = person.income
        total += sum(job.wages_cents for job in income.w2_jobs)
        total += income.self_employment_net_profit_cents
        total += income.contractor_net_profit_cents
        total += income.taxable_interest_cents
        total += income.tax_exempt_interest_cents
        total += income.ordinary_dividends_cents
        total += income.short_term_capital_gains_cents
        total += income.long_term_capital_gains_cents
        total += income.rental_net_income_cents
        total += income.pension_income_cents
        total += income.ira_distributions_cents
        total += income.social_security_benefits_cents
        total += income.unemployment_compensation_cents
        total += income.other_taxable_income_cents
    return total


def calculate_tax(request: TaxCalculationRequest) -> TaxCalculationResult:
    policyengine = policyengine_module()
    primary = next(person for person in request.people if person.role == "primary")
    people = [
        person_to_policyengine(
            person,
            request.deductions if person.id == primary.id else None,
        )
        for person in request.people
    ]
    tax_unit = {
        "filing_status": FILING_STATUS[request.filing_status],
        "state_and_local_sales_or_income_tax": cents_to_dollars(
            request.deductions.state_and_local_taxes_paid_cents
        ),
    }

    with _CALCULATION_LOCK:
        result = policyengine.us.calculate_household(
            people=people,
            tax_unit=tax_unit,
            household={"state_code": request.state_code},
            year=2026,
            extra_variables=EXTRA_VARIABLES,
        )

    federal_income_tax = dollars_to_cents(result.tax_unit.income_tax)
    state_income_tax = dollars_to_cents(result.tax_unit.state_income_tax)
    employee_payroll_tax = dollars_to_cents(result.tax_unit.employee_payroll_tax)
    self_employment_tax = sum(
        dollars_to_cents(person.self_employment_tax) for person in result.person
    )
    total_tax = (
        federal_income_tax
        + state_income_tax
        + employee_payroll_tax
        + self_employment_tax
    )
    gross_income = gross_income_cents(request)
    after_tax_income = gross_income - total_tax
    effective_rate = (
        0
        if gross_income == 0
        else divide_half_away_from_zero(total_tax * 1_000_000, gross_income)
    )

    return TaxCalculationResult(
        trace_id=request.trace_id,
        state_code=request.state_code,
        filing_status=request.filing_status,
        annual_gross_income_cents=gross_income,
        federal_income_tax_cents=federal_income_tax,
        state_income_tax_cents=state_income_tax,
        employee_payroll_tax_cents=employee_payroll_tax,
        self_employment_tax_cents=self_employment_tax,
        total_tax_cents=total_tax,
        after_tax_income_cents=after_tax_income,
        effective_tax_rate_ppm=effective_rate,
        components_cents={
            "adjusted_gross_income": dollars_to_cents(
                result.tax_unit.adjusted_gross_income
            ),
            "taxable_income": dollars_to_cents(result.tax_unit.taxable_income),
        },
        model=TaxModelMetadata(),
    )
