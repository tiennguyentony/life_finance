from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

MAX_SAFE_INTEGER = 9_007_199_254_740_991
STATE_CODES = Literal[
    "AL",
    "AK",
    "AZ",
    "AR",
    "CA",
    "CO",
    "CT",
    "DE",
    "DC",
    "FL",
    "GA",
    "HI",
    "ID",
    "IL",
    "IN",
    "IA",
    "KS",
    "KY",
    "LA",
    "ME",
    "MD",
    "MA",
    "MI",
    "MN",
    "MS",
    "MO",
    "MT",
    "NE",
    "NV",
    "NH",
    "NJ",
    "NM",
    "NY",
    "NC",
    "ND",
    "OH",
    "OK",
    "OR",
    "PA",
    "RI",
    "SC",
    "SD",
    "TN",
    "TX",
    "UT",
    "VT",
    "VA",
    "WA",
    "WV",
    "WI",
    "WY",
]
FilingStatus = Literal[
    "single",
    "married_filing_jointly",
    "married_filing_separately",
    "head_of_household",
    "qualifying_surviving_spouse",
]
TaxUnitRole = Literal["primary", "spouse", "dependent"]
NonNegativeCents = Annotated[int, Field(ge=0, le=MAX_SAFE_INTEGER)]
SignedCents = Annotated[int, Field(ge=-MAX_SAFE_INTEGER, le=MAX_SAFE_INTEGER)]


def to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part.capitalize() for part in rest)


class ContractModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
    )


class W2Job(ContractModel):
    id: str = Field(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$")
    wages_cents: NonNegativeCents
    pretax_retirement_contributions_cents: NonNegativeCents = 0
    pretax_health_contributions_cents: NonNegativeCents = 0

    @model_validator(mode="after")
    def contributions_do_not_exceed_wages(self) -> W2Job:
        contributions = (
            self.pretax_retirement_contributions_cents
            + self.pretax_health_contributions_cents
        )
        if contributions > self.wages_cents:
            raise ValueError("pretax contributions must not exceed W-2 wages")
        return self


class AnnualIncome(ContractModel):
    w2_jobs: list[W2Job] = Field(default_factory=list, max_length=20)
    self_employment_net_profit_cents: SignedCents = 0
    contractor_net_profit_cents: SignedCents = 0
    taxable_interest_cents: NonNegativeCents = 0
    tax_exempt_interest_cents: NonNegativeCents = 0
    ordinary_dividends_cents: NonNegativeCents = 0
    qualified_dividends_cents: NonNegativeCents = 0
    short_term_capital_gains_cents: SignedCents = 0
    long_term_capital_gains_cents: SignedCents = 0
    rental_net_income_cents: SignedCents = 0
    pension_income_cents: NonNegativeCents = 0
    ira_distributions_cents: NonNegativeCents = 0
    social_security_benefits_cents: NonNegativeCents = 0
    unemployment_compensation_cents: NonNegativeCents = 0
    other_taxable_income_cents: SignedCents = 0

    @model_validator(mode="after")
    def validate_income_details(self) -> AnnualIncome:
        job_ids = [job.id for job in self.w2_jobs]
        if len(job_ids) != len(set(job_ids)):
            raise ValueError("W-2 job identifiers must be unique for each person")
        if self.qualified_dividends_cents > self.ordinary_dividends_cents:
            raise ValueError("qualified dividends must not exceed ordinary dividends")
        return self


class TaxPerson(ContractModel):
    id: str = Field(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$")
    role: TaxUnitRole
    age_years: int = Field(ge=0, le=120)
    is_blind: bool = False
    is_full_time_student: bool = False
    income: AnnualIncome


class AnnualDeductions(ContractModel):
    mortgage_interest_cents: NonNegativeCents = 0
    state_and_local_taxes_paid_cents: NonNegativeCents = 0
    charitable_cash_cents: NonNegativeCents = 0
    charitable_non_cash_cents: NonNegativeCents = 0
    medical_expenses_cents: NonNegativeCents = 0
    student_loan_interest_cents: NonNegativeCents = 0
    educator_expenses_cents: NonNegativeCents = 0
    hsa_contributions_cents: NonNegativeCents = 0
    deductible_ira_contributions_cents: NonNegativeCents = 0
    self_employed_health_insurance_cents: NonNegativeCents = 0


class TaxCalculationRequest(ContractModel):
    schema_version: Literal[1]
    trace_id: str = Field(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$")
    economic_year: int = Field(ge=2026, le=2200)
    policy_year: Literal[2026]
    cumulative_price_index_ppm: int = Field(ge=1, le=100_000_000)
    state_code: STATE_CODES
    filing_status: FilingStatus
    people: list[TaxPerson] = Field(min_length=1, max_length=20)
    deductions: AnnualDeductions

    @model_validator(mode="after")
    def validate_tax_unit(self) -> TaxCalculationRequest:
        primary_count = sum(person.role == "primary" for person in self.people)
        spouse_count = sum(person.role == "spouse" for person in self.people)
        if primary_count != 1:
            raise ValueError("exactly one person must have the primary role")
        if spouse_count > 1:
            raise ValueError("at most one person may have the spouse role")
        if self.filing_status == "married_filing_jointly" and spouse_count != 1:
            raise ValueError("married filing jointly requires one spouse")
        if (
            self.filing_status
            in {"single", "head_of_household", "qualifying_surviving_spouse"}
            and spouse_count != 0
        ):
            raise ValueError(f"{self.filing_status} must not include a spouse")
        person_ids = [person.id for person in self.people]
        if len(person_ids) != len(set(person_ids)):
            raise ValueError("person identifiers must be unique")
        return self


class TaxModelMetadata(ContractModel):
    provider: Literal["PolicyEngine US"] = "PolicyEngine US"
    bundle_version: Literal["4.21.0"] = "4.21.0"
    rules_version: Literal["1.764.6"] = "1.764.6"
    projected_from_frozen_policy: bool = False


class TaxCalculationResult(ContractModel):
    schema_version: Literal[1] = 1
    trace_id: str
    economic_year: Literal[2026] = 2026
    policy_year: Literal[2026] = 2026
    state_code: STATE_CODES
    filing_status: FilingStatus
    annual_gross_income_cents: SignedCents
    federal_income_tax_cents: SignedCents
    state_income_tax_cents: SignedCents
    employee_payroll_tax_cents: SignedCents
    self_employment_tax_cents: SignedCents
    total_tax_cents: SignedCents
    after_tax_income_cents: SignedCents
    effective_tax_rate_ppm: Annotated[int, Field(ge=-1_000_000, le=100_000_000)]
    components_cents: dict[str, SignedCents]
    model: TaxModelMetadata = Field(default_factory=TaxModelMetadata)
    disclaimer: Literal[
        "Educational estimate only; not tax, legal, or financial advice."
    ] = "Educational estimate only; not tax, legal, or financial advice."


class HealthResponse(ContractModel):
    status: Literal["ok"] = "ok"
    policy_year: Literal[2026] = 2026
    bundle_version: Literal["4.21.0"] = "4.21.0"
    rules_version: Literal["1.764.6"] = "1.764.6"
