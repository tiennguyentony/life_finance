import {
  allocateMoney,
  moneyCents,
  type MoneyCents,
} from "../../core/domain/money";
import {
  divideRoundHalfAwayFromZero,
  safeBigIntToNumber,
} from "../../core/domain/integer";

import {
  FROZEN_POLICY_YEAR,
  TAX_CONTRACT_VERSION,
  taxCalculationRequestSchema,
  taxCalculationResultSchema,
  type AnnualDeductions,
  type AnnualIncome,
  type TaxCalculationRequest,
  type TaxCalculationResult,
} from "./contracts";

const PPM = 1_000_000;

export function deflateToFrozenPolicyDollars(
  nominalCents: number,
  cumulativePriceIndexPpm: number,
): MoneyCents {
  return allocateMoney(
    moneyCents(nominalCents),
    PPM,
    cumulativePriceIndexPpm,
  );
}

export function inflateFromFrozenPolicyDollars(
  frozenPolicyCents: number,
  cumulativePriceIndexPpm: number,
): MoneyCents {
  return allocateMoney(
    moneyCents(frozenPolicyCents),
    cumulativePriceIndexPpm,
    PPM,
  );
}

function mapIncome(
  income: AnnualIncome,
  mapMoney: (value: number) => number,
): AnnualIncome {
  return {
    ...income,
    w2Jobs: income.w2Jobs.map((job) => ({
      ...job,
      wagesCents: mapMoney(job.wagesCents),
      pretaxRetirementContributionsCents: mapMoney(
        job.pretaxRetirementContributionsCents,
      ),
      pretaxHealthContributionsCents: mapMoney(job.pretaxHealthContributionsCents),
    })),
    selfEmploymentNetProfitCents: mapMoney(income.selfEmploymentNetProfitCents),
    contractorNetProfitCents: mapMoney(income.contractorNetProfitCents),
    taxableInterestCents: mapMoney(income.taxableInterestCents),
    taxExemptInterestCents: mapMoney(income.taxExemptInterestCents),
    ordinaryDividendsCents: mapMoney(income.ordinaryDividendsCents),
    qualifiedDividendsCents: mapMoney(income.qualifiedDividendsCents),
    shortTermCapitalGainsCents: mapMoney(income.shortTermCapitalGainsCents),
    longTermCapitalGainsCents: mapMoney(income.longTermCapitalGainsCents),
    rentalNetIncomeCents: mapMoney(income.rentalNetIncomeCents),
    pensionIncomeCents: mapMoney(income.pensionIncomeCents),
    iraDistributionsCents: mapMoney(income.iraDistributionsCents),
    socialSecurityBenefitsCents: mapMoney(income.socialSecurityBenefitsCents),
    unemploymentCompensationCents: mapMoney(income.unemploymentCompensationCents),
    otherTaxableIncomeCents: mapMoney(income.otherTaxableIncomeCents),
  };
}

function mapDeductions(
  deductions: AnnualDeductions,
  mapMoney: (value: number) => number,
): AnnualDeductions {
  return Object.fromEntries(
    Object.entries(deductions).map(([key, value]) => [key, mapMoney(value)]),
  ) as AnnualDeductions;
}

function grossIncomeFromRequest(request: TaxCalculationRequest): number {
  let total = BigInt(0);
  for (const person of request.people) {
    const income = person.income;
    for (const job of income.w2Jobs) total += BigInt(job.wagesCents);
    total += BigInt(income.selfEmploymentNetProfitCents);
    total += BigInt(income.contractorNetProfitCents);
    total += BigInt(income.taxableInterestCents);
    total += BigInt(income.taxExemptInterestCents);
    total += BigInt(income.ordinaryDividendsCents);
    total += BigInt(income.shortTermCapitalGainsCents);
    total += BigInt(income.longTermCapitalGainsCents);
    total += BigInt(income.rentalNetIncomeCents);
    total += BigInt(income.pensionIncomeCents);
    total += BigInt(income.iraDistributionsCents);
    total += BigInt(income.socialSecurityBenefitsCents);
    total += BigInt(income.unemploymentCompensationCents);
    total += BigInt(income.otherTaxableIncomeCents);
  }
  return safeBigIntToNumber(total, "annual gross income");
}

export function deflateRequestToFrozenPolicy(
  input: TaxCalculationRequest,
): TaxCalculationRequest {
  const request = taxCalculationRequestSchema.parse(input);
  const deflate = (value: number) =>
    deflateToFrozenPolicyDollars(value, request.cumulativePriceIndexPpm);

  return taxCalculationRequestSchema.parse({
    ...request,
    economicYear: FROZEN_POLICY_YEAR,
    cumulativePriceIndexPpm: PPM,
    people: request.people.map((person) => ({
      ...person,
      income: mapIncome(person.income, deflate),
    })),
    deductions: mapDeductions(request.deductions, deflate),
  });
}

export function inflateResultToEconomicYear(
  frozenResult: TaxCalculationResult,
  originalRequest: TaxCalculationRequest,
): TaxCalculationResult {
  const result = taxCalculationResultSchema.parse(frozenResult);
  const request = taxCalculationRequestSchema.parse(originalRequest);
  if (result.traceId !== request.traceId) {
    throw new Error("tax result traceId does not match the originating request");
  }
  const frozenRequest = deflateRequestToFrozenPolicy(request);
  if (result.annualGrossIncomeCents !== grossIncomeFromRequest(frozenRequest)) {
    throw new Error("tax result gross income does not match the projected request");
  }

  const inflate = (value: number) =>
    inflateFromFrozenPolicyDollars(value, request.cumulativePriceIndexPpm);
  const componentsCents = Object.fromEntries(
    Object.entries(result.componentsCents).map(([key, value]) => [
      key,
      inflate(value),
    ]),
  );
  // Deflation followed by inflation is not guaranteed to round-trip to the
  // original cent. Gross income is authoritative request context, while the
  // calculated tax components are projected PolicyEngine output.
  const annualGrossIncomeCents = grossIncomeFromRequest(request);
  const federalIncomeTaxCents = inflate(result.federalIncomeTaxCents);
  const stateIncomeTaxCents = inflate(result.stateIncomeTaxCents);
  const employeePayrollTaxCents = inflate(result.employeePayrollTaxCents);
  const selfEmploymentTaxCents = inflate(result.selfEmploymentTaxCents);
  const totalTaxBigInt =
    BigInt(federalIncomeTaxCents) +
    BigInt(stateIncomeTaxCents) +
    BigInt(employeePayrollTaxCents) +
    BigInt(selfEmploymentTaxCents);
  const totalTaxCents = safeBigIntToNumber(totalTaxBigInt, "projected total tax");
  const afterTaxIncomeCents = safeBigIntToNumber(
    BigInt(annualGrossIncomeCents) - totalTaxBigInt,
    "projected after-tax income",
  );
  const effectiveTaxRatePpm =
    annualGrossIncomeCents === 0
      ? 0
      : safeBigIntToNumber(
          divideRoundHalfAwayFromZero(
            totalTaxBigInt * BigInt(PPM),
            BigInt(annualGrossIncomeCents),
          ),
          "projected effective tax rate",
        );

  return taxCalculationResultSchema.parse({
    ...result,
    schemaVersion: TAX_CONTRACT_VERSION,
    economicYear: request.economicYear,
    annualGrossIncomeCents,
    federalIncomeTaxCents,
    stateIncomeTaxCents,
    employeePayrollTaxCents,
    selfEmploymentTaxCents,
    totalTaxCents,
    afterTaxIncomeCents,
    effectiveTaxRatePpm,
    componentsCents,
    model: {
      ...result.model,
      projectedFromFrozenPolicy:
        request.economicYear !== FROZEN_POLICY_YEAR ||
        request.cumulativePriceIndexPpm !== PPM,
    },
  });
}
