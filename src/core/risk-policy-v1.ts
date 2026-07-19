import type { RatePpm } from "./domain/money";

export const RISK_ANALYZER_V1_VERSION = "risk-v1" as const;

export type RiskMetricId =
  | "emergency_fund_months"
  | "monthly_free_cash_flow"
  | "debt_service_ratio"
  | "fixed_cost_ratio"
  | "high_interest_debt_burden"
  | "liquid_resource_coverage"
  | "insurance_protection_gap"
  | "portfolio_concentration"
  | "job_investment_sector_correlation"
  | "income_stability"
  | "lifestyle_rigidity"
  | "interest_burden"
  | "retirement_readiness"
  | "recent_financial_stress";

export type RiskMetricUnit =
  | "months_ppm"
  | "money_cents_per_month"
  | "money_cents"
  | "ratio_ppm";

export type RiskDirection = "higher_is_riskier" | "lower_is_riskier";

export type RiskMetricPolicy = Readonly<{
  rawUnit: RiskMetricUnit;
  normalizationUnit: "ratio_ppm" | "months_ppm";
  direction: RiskDirection;
  /** Inclusive raw normalized-input boundaries for low, moderate, and high. */
  thresholds: Readonly<{
    low: number;
    moderate: number;
    high: number;
  }>;
  normalization: Readonly<{
    best: number;
    worst: number;
  }>;
  weaknessTag: string;
  factCode: string;
}>;

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

const policies = {
  emergency_fund_months: {
    rawUnit: "months_ppm",
    normalizationUnit: "months_ppm",
    direction: "lower_is_riskier",
    thresholds: { low: 6_000_000, moderate: 3_000_000, high: 1_000_000 },
    normalization: { best: 12_000_000, worst: 0 },
    weaknessTag: "risk.low_emergency_fund",
    factCode: "unborrowed_cash_covers_required_obligations_for_months",
  },
  monthly_free_cash_flow: {
    rawUnit: "money_cents_per_month",
    normalizationUnit: "ratio_ppm",
    direction: "lower_is_riskier",
    thresholds: { low: 200_000, moderate: 0, high: -200_000 },
    normalization: { best: 500_000, worst: -500_000 },
    weaknessTag: "risk.negative_free_cash_flow",
    factCode: "gross_monthly_income_less_required_obligations",
  },
  debt_service_ratio: {
    rawUnit: "ratio_ppm",
    normalizationUnit: "ratio_ppm",
    direction: "higher_is_riskier",
    thresholds: { low: 150_000, moderate: 300_000, high: 450_000 },
    normalization: { best: 0, worst: 750_000 },
    weaknessTag: "risk.high_debt_service",
    factCode: "minimum_debt_service_share_of_gross_income",
  },
  fixed_cost_ratio: {
    rawUnit: "ratio_ppm",
    normalizationUnit: "ratio_ppm",
    direction: "higher_is_riskier",
    thresholds: { low: 500_000, moderate: 700_000, high: 900_000 },
    normalization: { best: 300_000, worst: 1_000_000 },
    weaknessTag: "risk.high_fixed_costs",
    factCode: "required_obligations_share_of_gross_income",
  },
  high_interest_debt_burden: {
    rawUnit: "ratio_ppm",
    normalizationUnit: "ratio_ppm",
    direction: "higher_is_riskier",
    thresholds: { low: 0, moderate: 250_000, high: 500_000 },
    normalization: { best: 0, worst: 1_000_000 },
    weaknessTag: "risk.high_interest_debt",
    factCode: "high_interest_principal_share_of_annual_income",
  },
  liquid_resource_coverage: {
    rawUnit: "months_ppm",
    normalizationUnit: "months_ppm",
    direction: "lower_is_riskier",
    thresholds: { low: 12_000_000, moderate: 6_000_000, high: 3_000_000 },
    normalization: { best: 24_000_000, worst: 0 },
    weaknessTag: "risk.low_liquid_resources",
    factCode: "net_liquid_resources_cover_required_obligations_for_months",
  },
  insurance_protection_gap: {
    rawUnit: "ratio_ppm",
    normalizationUnit: "ratio_ppm",
    direction: "higher_is_riskier",
    thresholds: { low: 100_000, moderate: 300_000, high: 600_000 },
    normalization: { best: 0, worst: 1_000_000 },
    weaknessTag: "risk.insurance_gap",
    factCode: "uncovered_property_income_and_life_need_share",
  },
  portfolio_concentration: {
    rawUnit: "ratio_ppm",
    normalizationUnit: "ratio_ppm",
    direction: "higher_is_riskier",
    thresholds: { low: 200_000, moderate: 400_000, high: 700_000 },
    normalization: { best: 0, worst: 1_000_000 },
    weaknessTag: "risk.portfolio_concentration",
    factCode: "sector_and_speculative_assets_share_of_investable_assets",
  },
  job_investment_sector_correlation: {
    rawUnit: "ratio_ppm",
    normalizationUnit: "ratio_ppm",
    direction: "higher_is_riskier",
    thresholds: { low: 100_000, moderate: 300_000, high: 600_000 },
    normalization: { best: 0, worst: 1_000_000 },
    weaknessTag: "risk.job_investment_correlation",
    factCode: "employment_sector_assets_share_of_investable_assets",
  },
  income_stability: {
    rawUnit: "ratio_ppm",
    normalizationUnit: "ratio_ppm",
    direction: "lower_is_riskier",
    thresholds: { low: 900_000, moderate: 600_000, high: 300_000 },
    normalization: { best: 1_000_000, worst: 0 },
    weaknessTag: "risk.unstable_income",
    factCode: "verified_recurring_employment_income_presence",
  },
  lifestyle_rigidity: {
    rawUnit: "ratio_ppm",
    normalizationUnit: "ratio_ppm",
    direction: "higher_is_riskier",
    thresholds: { low: 400_000, moderate: 600_000, high: 800_000 },
    normalization: { best: 0, worst: 1_000_000 },
    weaknessTag: "risk.rigid_lifestyle",
    factCode: "monthly_living_cost_share_of_gross_income",
  },
  interest_burden: {
    rawUnit: "ratio_ppm",
    normalizationUnit: "ratio_ppm",
    direction: "higher_is_riskier",
    thresholds: { low: 50_000, moderate: 100_000, high: 200_000 },
    normalization: { best: 0, worst: 400_000 },
    weaknessTag: "risk.high_interest_burden",
    factCode: "estimated_monthly_interest_share_of_gross_income",
  },
  retirement_readiness: {
    rawUnit: "ratio_ppm",
    normalizationUnit: "ratio_ppm",
    direction: "lower_is_riskier",
    thresholds: { low: 800_000, moderate: 500_000, high: 250_000 },
    normalization: { best: 1_000_000, worst: 0 },
    weaknessTag: "risk.low_retirement_readiness",
    factCode: "retirement_assets_share_of_configured_retirement_target",
  },
  recent_financial_stress: {
    rawUnit: "money_cents",
    normalizationUnit: "ratio_ppm",
    direction: "higher_is_riskier",
    thresholds: { low: 0, moderate: 250_000, high: 750_000 },
    normalization: { best: 0, worst: 1_500_000 },
    weaknessTag: "risk.recent_financial_stress",
    factCode: "player_event_costs_in_trailing_three_months",
  },
} as const satisfies Readonly<Record<RiskMetricId, RiskMetricPolicy>>;

export const RISK_METRIC_POLICIES_V1: Readonly<
  Record<RiskMetricId, RiskMetricPolicy>
> = deepFreeze(policies);

/** Aggregate weights are analytics-only and intentionally separate from formulas. */
export const RISK_METRIC_WEIGHTS_V1: Readonly<Record<RiskMetricId, RatePpm>> =
  Object.freeze({
    emergency_fund_months: 120_000 as RatePpm,
    monthly_free_cash_flow: 100_000 as RatePpm,
    debt_service_ratio: 70_000 as RatePpm,
    fixed_cost_ratio: 90_000 as RatePpm,
    high_interest_debt_burden: 80_000 as RatePpm,
    liquid_resource_coverage: 80_000 as RatePpm,
    insurance_protection_gap: 70_000 as RatePpm,
    portfolio_concentration: 60_000 as RatePpm,
    job_investment_sector_correlation: 50_000 as RatePpm,
    income_stability: 80_000 as RatePpm,
    lifestyle_rigidity: 60_000 as RatePpm,
    interest_burden: 50_000 as RatePpm,
    retirement_readiness: 60_000 as RatePpm,
    recent_financial_stress: 30_000 as RatePpm,
  });

export const RISK_CALCULATION_CONSTANTS_V1 = Object.freeze({
  partsPerMillion: 1_000_000,
  highInterestAnnualRateThresholdPpm: 100_000,
  assumedRevolvingAnnualInterestRatePpm: 240_000,
  assumedRevolvingMinimumPaymentRatePpm: 30_000,
  defaultSafeWithdrawalRatePpm: 40_000,
  dependentLifeInsuranceIncomeYears: 5,
  recentStressWindowMonths: 3,
  maximumCoverageMonthsPpm: 24_000_000,
});
