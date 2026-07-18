import { describe, expect, it } from "vitest";

import {
  taxCalculationRequestSchema,
  type TaxCalculationRequest,
} from "@/server/tax/contracts";

import { OfflineDemoTaxCalculator } from "../offline-tax-calculator";

function taxRequest(stateCode: "WA" | "CA"): TaxCalculationRequest {
  return taxCalculationRequestSchema.parse({
    schemaVersion: 1,
    traceId: "demo.tax.2026",
    economicYear: 2026,
    policyYear: 2026,
    cumulativePriceIndexPpm: 1_000_000,
    stateCode,
    filingStatus: "single",
    people: [
      {
        id: "person.demo",
        role: "primary",
        ageYears: 31,
        income: {
          w2Jobs: [
            {
              id: "job.demo",
              wagesCents: 12_000_000,
              pretaxRetirementContributionsCents: 500_000,
              pretaxHealthContributionsCents: 100_000,
            },
          ],
        },
      },
    ],
    deductions: {},
  });
}

describe("OfflineDemoTaxCalculator", () => {
  it("returns the same valid Washington estimate for the same input", async () => {
    const calculator = new OfflineDemoTaxCalculator();

    const first = await calculator.calculate(taxRequest("WA"));
    const second = await calculator.calculate(taxRequest("WA"));

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      annualGrossIncomeCents: 12_000_000,
      federalIncomeTaxCents: 1_344_000,
      stateIncomeTaxCents: 0,
      employeePayrollTaxCents: 918_000,
      selfEmploymentTaxCents: 0,
      totalTaxCents: 2_262_000,
      afterTaxIncomeCents: 9_738_000,
      effectiveTaxRatePpm: 188_500,
    });
  });

  it("adds a simplified state tax while preserving integer-cent invariants", async () => {
    const result = await new OfflineDemoTaxCalculator().calculate(
      taxRequest("CA"),
    );

    expect(result.stateIncomeTaxCents).toBe(456_000);
    expect(result.totalTaxCents).toBe(
      result.federalIncomeTaxCents +
        result.stateIncomeTaxCents +
        result.employeePayrollTaxCents +
        result.selfEmploymentTaxCents,
    );
    expect(result.afterTaxIncomeCents).toBe(
      result.annualGrossIncomeCents - result.totalTaxCents,
    );
    expect(Number.isSafeInteger(result.effectiveTaxRatePpm)).toBe(true);
  });
});
