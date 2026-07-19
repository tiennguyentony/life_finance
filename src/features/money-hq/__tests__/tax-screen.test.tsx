import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { TaxSummaryResponse } from "@/contracts/api/contracts";

import { TaxScreen } from "../screens/tax-screen";

const SUMMARY: TaxSummaryResponse = {
  status: "available",
  asOfMonth: "2026-07",
  jurisdiction: {
    stateCode: "CA",
    filingStatus: "single",
    economicYear: 2026,
    policyYear: 2026,
  },
  paycheckEstimate: {
    grossIncomeCents: 1_000_000,
    employee401kContributionCents: 50_000,
    employeeHsaContributionCents: 0,
    federalIncomeTaxCents: 125_000,
    stateIncomeTaxCents: 20_000,
    employeePayrollTaxCents: 75_000,
    selfEmploymentTaxCents: 0,
    totalTaxCents: 220_000,
    afterTaxCashIncomeCents: 730_000,
    effectiveTaxRatePpm: 220_000,
  },
  annualEstimate: {
    version: "monthly-tax-breakdown-v1",
    monthlyFederalIncomeTaxCents: 125_000,
    monthlyStateIncomeTaxCents: 20_000,
    monthlyEmployeePayrollTaxCents: 75_000,
    monthlySelfEmploymentTaxCents: 0,
    annualGrossIncomeCents: 12_000_000,
    annualTaxableIncomeCents: 11_400_000,
    annualFederalIncomeTaxCents: 1_500_000,
    annualStateIncomeTaxCents: 240_000,
    annualEmployeePayrollTaxCents: 900_000,
    annualSelfEmploymentTaxCents: 0,
    annualTotalTaxCents: 2_640_000,
    annualAfterTaxIncomeCents: 9_360_000,
    effectiveTaxRatePpm: 220_000,
    disclaimer: "Educational estimate only; not tax, legal, or financial advice.",
  },
  yearToDate: {
    paychecksProcessed: 3,
    grossIncomeCents: 3_000_000,
    totalTaxCents: 660_000,
    afterTaxCashIncomeCents: 2_190_000,
    employee401kContributionCents: 150_000,
    employeeHsaContributionCents: 0,
  },
  settlement: {
    method: "exact_modeled_liability_withholding",
    projectedRefundCents: 0,
    projectedAmountDueCents: 0,
    explanation: "The model withholds its calculated liability exactly.",
  },
  stateContext: {
    hasModeledStateIncomeTax: true,
    annualStateIncomeTaxCents: 240_000,
    differenceFromNoIncomeTaxStateCents: 240_000,
    explanation: "CA adds modeled state income tax.",
  },
  model: {
    provider: "PolicyEngine US",
    bundleVersion: "2026.7",
    rulesVersion: "2026",
    projectedFromFrozenPolicy: false,
  },
};

describe("TaxScreen", () => {
  it("renders paycheck, annual, YTD, state, and settlement evidence", () => {
    const markup = renderToStaticMarkup(
      <TaxScreen
        loadState={{ status: "ready", summary: SUMMARY }}
        onRetry={() => undefined}
        onSelectTab={() => undefined}
      />,
    );

    expect(markup).toContain("Your next modeled paycheck");
    expect(markup).toContain("Social Security + Medicare");
    expect(markup).toContain("Year to date · ledger-backed");
    expect(markup).toContain("Difference from a no-income-tax state");
    expect(markup).toContain("Projected refund or amount due");
    expect(markup).toContain("Adjust 401(k) or HSA");
  });

  it("keeps the retry path safe when the estimate fails", () => {
    const markup = renderToStaticMarkup(
      <TaxScreen
        loadState={{ status: "error", message: "Tax service unavailable" }}
        onRetry={() => undefined}
        onSelectTab={() => undefined}
      />,
    );

    expect(markup).toContain("Your saved game is safe");
    expect(markup).toContain("Try the estimate again");
  });
});
