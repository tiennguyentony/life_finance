import { describe, expect, it } from "vitest";

import {
  POLICYENGINE_BUNDLE_VERSION,
  POLICYENGINE_US_VERSION,
  US_STATE_CODES,
  taxCalculationRequestSchema,
  taxCalculationResultSchema,
  type TaxCalculationRequest,
  type TaxCalculationResult,
} from "./contracts";
import {
  deflateRequestToFrozenPolicy,
  deflateToFrozenPolicyDollars,
  inflateFromFrozenPolicyDollars,
  inflateResultToEconomicYear,
} from "./projection";

function request(
  overrides: Partial<TaxCalculationRequest> = {},
): TaxCalculationRequest {
  return taxCalculationRequestSchema.parse({
    schemaVersion: 1,
    traceId: "tax.test.1",
    economicYear: 2036,
    policyYear: 2026,
    cumulativePriceIndexPpm: 1_250_000,
    stateCode: "CA",
    filingStatus: "single",
    people: [
      {
        id: "person.primary",
        role: "primary",
        ageYears: 40,
        income: {
          w2Jobs: [
            {
              id: "job.main",
              wagesCents: 12_500_000,
              pretaxRetirementContributionsCents: 1_250_000,
            },
            { id: "job.second", wagesCents: 2_500_000 },
          ],
          contractorNetProfitCents: 1_250_000,
          longTermCapitalGainsCents: 625_000,
        },
      },
    ],
    deductions: {
      mortgageInterestCents: 1_250_000,
    },
    ...overrides,
  });
}

function result(): TaxCalculationResult {
  return taxCalculationResultSchema.parse({
    schemaVersion: 1,
    traceId: "tax.test.1",
    economicYear: 2026,
    policyYear: 2026,
    stateCode: "CA",
    filingStatus: "single",
    annualGrossIncomeCents: 13_500_000,
    federalIncomeTaxCents: 2_000_000,
    stateIncomeTaxCents: 800_000,
    employeePayrollTaxCents: 900_000,
    selfEmploymentTaxCents: 100_000,
    totalTaxCents: 3_800_000,
    afterTaxIncomeCents: 9_700_000,
    effectiveTaxRatePpm: 281_481,
    componentsCents: { federal_income_tax: 2_000_000 },
    model: {
      provider: "PolicyEngine US",
      bundleVersion: POLICYENGINE_BUNDLE_VERSION,
      rulesVersion: POLICYENGINE_US_VERSION,
      projectedFromFrozenPolicy: false,
    },
    disclaimer: "Educational estimate only; not tax, legal, or financial advice.",
  });
}

describe("tax contracts", () => {
  it("covers all 50 states and DC without duplicates", () => {
    expect(US_STATE_CODES).toHaveLength(51);
    expect(new Set(US_STATE_CODES).size).toBe(51);
    for (const stateCode of US_STATE_CODES) {
      expect(
        taxCalculationRequestSchema.safeParse(
          request({ stateCode }),
        ).success,
      ).toBe(true);
    }
  });

  it("supports multiple jobs, contractor income, and defaulted income fields", () => {
    const parsed = request();

    expect(parsed.people[0].income.w2Jobs).toHaveLength(2);
    expect(parsed.people[0].income.selfEmploymentNetProfitCents).toBe(0);
    expect(parsed.people[0].income.contractorNetProfitCents).toBe(1_250_000);
  });

  it("enforces tax-unit composition and unique identifiers", () => {
    expect(() =>
      request({
        filingStatus: "married_filing_jointly",
      }),
    ).toThrow(/requires one spouse/);

    const base = request();
    expect(() =>
      request({ people: [base.people[0], base.people[0]] }),
    ).toThrow(/exactly one person|unique/);
  });

  it("rejects fractional cents and unknown fields", () => {
    const base = request();
    expect(
      taxCalculationRequestSchema.safeParse({
        ...base,
        deductions: { ...base.deductions, mortgageInterestCents: 1.5 },
      }).success,
    ).toBe(false);
    expect(
      taxCalculationRequestSchema.safeParse({ ...base, hiddenValue: 1 }).success,
    ).toBe(false);
  });

  it("rejects impossible W-2 contributions and dividend subsets", () => {
    const base = request();
    const person = base.people[0];
    expect(
      taxCalculationRequestSchema.safeParse({
        ...base,
        people: [
          {
            ...person,
            income: {
              ...person.income,
              ordinaryDividendsCents: 100,
              qualifiedDividendsCents: 101,
              w2Jobs: [
                {
                  id: "job.impossible",
                  wagesCents: 100,
                  pretaxRetirementContributionsCents: 101,
                  pretaxHealthContributionsCents: 0,
                },
              ],
            },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects internally inconsistent tax totals", () => {
    expect(
      taxCalculationResultSchema.safeParse({
        ...result(),
        totalTaxCents: 1,
      }).success,
    ).toBe(false);
  });
});

describe("frozen 2026 tax projection", () => {
  it("deflates and inflates with exact half-away-from-zero rounding", () => {
    expect(deflateToFrozenPolicyDollars(125, 1_250_000)).toBe(100);
    expect(inflateFromFrozenPolicyDollars(100, 1_250_000)).toBe(125);
    expect(deflateToFrozenPolicyDollars(-1, 2_000_000)).toBe(-1);
  });

  it("deflates every monetary request field while preserving demographics", () => {
    const projected = deflateRequestToFrozenPolicy(request());

    expect(projected.economicYear).toBe(2026);
    expect(projected.cumulativePriceIndexPpm).toBe(1_000_000);
    expect(projected.people[0].ageYears).toBe(40);
    expect(projected.people[0].income.w2Jobs[0].wagesCents).toBe(10_000_000);
    expect(
      projected.people[0].income.w2Jobs[0].pretaxRetirementContributionsCents,
    ).toBe(1_000_000);
    expect(projected.people[0].income.contractorNetProfitCents).toBe(1_000_000);
    expect(projected.deductions.mortgageInterestCents).toBe(1_000_000);
  });

  it("re-inflates results and marks future estimates as projected", () => {
    const projected = inflateResultToEconomicYear(result(), request());

    expect(projected.economicYear).toBe(2036);
    expect(projected.totalTaxCents).toBe(4_750_000);
    expect(projected.componentsCents.federal_income_tax).toBe(2_500_000);
    expect(projected.effectiveTaxRatePpm).toBe(281_481);
    expect(projected.model.projectedFromFrozenPolicy).toBe(true);
  });

  it("rejects a response from a different trace", () => {
    const mismatched = { ...result(), traceId: "tax.other" };
    expect(() => inflateResultToEconomicYear(mismatched, request())).toThrow(
      /traceId/,
    );
  });
});
