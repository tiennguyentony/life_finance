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

  const inflate = (value: number) =>
    inflateFromFrozenPolicyDollars(value, request.cumulativePriceIndexPpm);
  const componentsCents = Object.fromEntries(
    Object.entries(result.componentsCents).map(([key, value]) => [
      key,
      inflate(value),
    ]),
  );
  const annualGrossIncomeCents = inflate(result.annualGrossIncomeCents);
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
      projectedFromFrozenPolicy: request.economicYear !== FROZEN_POLICY_YEAR,
    },
  });
}
