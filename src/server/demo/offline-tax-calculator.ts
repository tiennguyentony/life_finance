import { divideRoundHalfAwayFromZero } from "@/core/domain/integer";
import type { TaxCalculator } from "@/server/tax/client";
import {
  POLICYENGINE_BUNDLE_VERSION,
  POLICYENGINE_US_VERSION,
  taxCalculationRequestSchema,
  taxCalculationResultSchema,
  type TaxCalculationRequest,
  type TaxCalculationResult,
} from "@/server/tax/contracts";

const NO_INCOME_TAX_STATES = new Set([
  "AK",
  "FL",
  "NH",
  "NV",
  "SD",
  "TN",
  "TX",
  "WA",
  "WY",
]);

function safeInteger(value: bigint, label: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`${label} exceeds safe integer cents`);
  }
  return result;
}

function sum(values: readonly number[], label: string): number {
  return safeInteger(
    values.reduce((total, value) => total + BigInt(value), BigInt(0)),
    label,
  );
}

function percentage(amountCents: number, ratePpm: number): number {
  return safeInteger(
    divideRoundHalfAwayFromZero(
      BigInt(amountCents) * BigInt(ratePpm),
      BigInt(1_000_000),
    ),
    "tax amount",
  );
}

function annualInputs(request: TaxCalculationRequest) {
  const jobs = request.people.flatMap(({ income }) => income.w2Jobs);
  const w2WagesCents = sum(
    jobs.map(({ wagesCents }) => wagesCents),
    "W-2 wages",
  );
  const pretaxContributionsCents = sum(
    jobs.flatMap((job) => [
      job.pretaxRetirementContributionsCents,
      job.pretaxHealthContributionsCents,
    ]),
    "pre-tax contributions",
  );
  const selfEmploymentIncomeCents = sum(
    request.people.flatMap(({ income }) => [
      income.selfEmploymentNetProfitCents,
      income.contractorNetProfitCents,
    ]),
    "self-employment income",
  );
  const otherTaxableIncomeCents = sum(
    request.people.flatMap(({ income }) => [
      income.taxableInterestCents,
      income.ordinaryDividendsCents,
      income.shortTermCapitalGainsCents,
      income.longTermCapitalGainsCents,
      income.rentalNetIncomeCents,
      income.pensionIncomeCents,
      income.iraDistributionsCents,
      income.socialSecurityBenefitsCents,
      income.unemploymentCompensationCents,
      income.otherTaxableIncomeCents,
    ]),
    "other taxable income",
  );
  const deductionsCents = sum(
    Object.values(request.deductions),
    "deductions",
  );
  const annualGrossIncomeCents = sum(
    [w2WagesCents, selfEmploymentIncomeCents, otherTaxableIncomeCents],
    "annual gross income",
  );
  const taxableIncomeCents = Math.max(
    0,
    annualGrossIncomeCents -
      pretaxContributionsCents -
      deductionsCents,
  );
  return {
    annualGrossIncomeCents,
    selfEmploymentIncomeCents,
    taxableIncomeCents,
    w2WagesCents,
  };
}

export class OfflineDemoTaxCalculator implements TaxCalculator {
  async calculate(
    request: TaxCalculationRequest,
  ): Promise<TaxCalculationResult> {
    const input = taxCalculationRequestSchema.parse(request);
    const {
      annualGrossIncomeCents,
      selfEmploymentIncomeCents,
      taxableIncomeCents,
      w2WagesCents,
    } = annualInputs(input);
    const federalIncomeTaxCents = sum(
      [
        percentage(Math.min(taxableIncomeCents, 1_200_000), 100_000),
        percentage(Math.max(0, taxableIncomeCents - 1_200_000), 120_000),
      ],
      "federal income tax",
    );
    const stateIncomeTaxCents = NO_INCOME_TAX_STATES.has(input.stateCode)
      ? 0
      : percentage(taxableIncomeCents, 40_000);
    const employeePayrollTaxCents = percentage(w2WagesCents, 76_500);
    const selfEmploymentTaxCents = percentage(
      Math.max(0, selfEmploymentIncomeCents),
      153_000,
    );
    const totalTaxCents = sum(
      [
        federalIncomeTaxCents,
        stateIncomeTaxCents,
        employeePayrollTaxCents,
        selfEmploymentTaxCents,
      ],
      "total tax",
    );
    const afterTaxIncomeCents = safeInteger(
      BigInt(annualGrossIncomeCents) - BigInt(totalTaxCents),
      "after-tax income",
    );
    const effectiveTaxRatePpm =
      annualGrossIncomeCents === 0
        ? 0
        : safeInteger(
            divideRoundHalfAwayFromZero(
              BigInt(totalTaxCents) * BigInt(1_000_000),
              BigInt(annualGrossIncomeCents),
            ),
            "effective tax rate",
          );

    return taxCalculationResultSchema.parse({
      schemaVersion: 1,
      traceId: input.traceId,
      economicYear: input.economicYear,
      policyYear: input.policyYear,
      stateCode: input.stateCode,
      filingStatus: input.filingStatus,
      annualGrossIncomeCents,
      federalIncomeTaxCents,
      stateIncomeTaxCents,
      employeePayrollTaxCents,
      selfEmploymentTaxCents,
      totalTaxCents,
      afterTaxIncomeCents,
      effectiveTaxRatePpm,
      componentsCents: {
        taxable_income: taxableIncomeCents,
        federal_income_tax: federalIncomeTaxCents,
        state_income_tax: stateIncomeTaxCents,
        employee_payroll_tax: employeePayrollTaxCents,
        self_employment_tax: selfEmploymentTaxCents,
      },
      model: {
        provider: "PolicyEngine US",
        bundleVersion: POLICYENGINE_BUNDLE_VERSION,
        rulesVersion: POLICYENGINE_US_VERSION,
        projectedFromFrozenPolicy: input.economicYear !== input.policyYear,
      },
      disclaimer:
        "Educational estimate only; not tax, legal, or financial advice.",
    });
  }
}
