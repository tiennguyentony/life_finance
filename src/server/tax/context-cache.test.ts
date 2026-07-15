import { describe, expect, it } from "vitest";

import { taxCalculationRequestSchema } from "./contracts";
import { fingerprintAnnualTaxContext } from "./context-cache";

function request() {
  return taxCalculationRequestSchema.parse({
    schemaVersion: 1,
    traceId: "tax.command.one",
    economicYear: 2026,
    policyYear: 2026,
    cumulativePriceIndexPpm: 1_000_000,
    stateCode: "WA",
    filingStatus: "single",
    people: [
      {
        id: "tax.primary",
        role: "primary",
        ageYears: 31,
        income: {
          w2Jobs: [
            {
              id: "job.primary",
              wagesCents: 12_000_000,
              pretaxRetirementContributionsCents: 300_000,
              pretaxHealthContributionsCents: 120_000,
            },
          ],
        },
      },
    ],
    deductions: {},
  });
}

describe("annual tax context fingerprint", () => {
  it("ignores command trace and within-year price-index drift", () => {
    const first = request();
    const laterMonth = {
      ...first,
      traceId: "tax.command.two",
      cumulativePriceIndexPpm: 1_004_321,
    };

    expect(fingerprintAnnualTaxContext(laterMonth)).toBe(
      fingerprintAnnualTaxContext(first),
    );
  });

  it("changes for tax-relevant salary, contribution, jurisdiction, and year inputs", () => {
    const base = request();
    const variants = [
      {
        ...base,
        economicYear: 2027,
      },
      {
        ...base,
        stateCode: "CA" as const,
      },
      {
        ...base,
        people: base.people.map((person) => ({
          ...person,
          income: {
            ...person.income,
            w2Jobs: person.income.w2Jobs.map((job) => ({
              ...job,
              wagesCents: job.wagesCents + 1,
            })),
          },
        })),
      },
      {
        ...base,
        people: base.people.map((person) => ({
          ...person,
          income: {
            ...person.income,
            w2Jobs: person.income.w2Jobs.map((job) => ({
              ...job,
              pretaxRetirementContributionsCents:
                job.pretaxRetirementContributionsCents + 1,
            })),
          },
        })),
      },
    ];

    for (const variant of variants) {
      expect(fingerprintAnnualTaxContext(variant)).not.toBe(
        fingerprintAnnualTaxContext(base),
      );
    }
  });
});
