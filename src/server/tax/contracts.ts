import { z } from "zod";

import { divideRoundHalfAwayFromZero } from "../../core/domain/integer";

export const TAX_CONTRACT_VERSION = 1 as const;
export const FROZEN_POLICY_YEAR = 2026 as const;
export const POLICYENGINE_BUNDLE_VERSION = "4.21.0" as const;
export const POLICYENGINE_US_VERSION = "1.764.6" as const;

export const US_STATE_CODES = [
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
] as const;

const safeInteger = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
export const nonNegativeCentsSchema = safeInteger.nonnegative();
export const signedCentsSchema = safeInteger;
export const ppmSchema = safeInteger.min(1).max(100_000_000);
const identifierSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/);

export const filingStatusSchema = z.enum([
  "single",
  "married_filing_jointly",
  "married_filing_separately",
  "head_of_household",
  "qualifying_surviving_spouse",
]);

export const taxUnitRoleSchema = z.enum(["primary", "spouse", "dependent"]);

export const w2JobSchema = z
  .object({
    id: identifierSchema,
    wagesCents: nonNegativeCentsSchema,
    pretaxRetirementContributionsCents: nonNegativeCentsSchema.default(0),
    pretaxHealthContributionsCents: nonNegativeCentsSchema.default(0),
  })
  .strict();

export const annualIncomeSchema = z
  .object({
    w2Jobs: z.array(w2JobSchema).max(20).default([]),
    selfEmploymentNetProfitCents: signedCentsSchema.default(0),
    contractorNetProfitCents: signedCentsSchema.default(0),
    taxableInterestCents: nonNegativeCentsSchema.default(0),
    taxExemptInterestCents: nonNegativeCentsSchema.default(0),
    ordinaryDividendsCents: nonNegativeCentsSchema.default(0),
    qualifiedDividendsCents: nonNegativeCentsSchema.default(0),
    shortTermCapitalGainsCents: signedCentsSchema.default(0),
    longTermCapitalGainsCents: signedCentsSchema.default(0),
    rentalNetIncomeCents: signedCentsSchema.default(0),
    pensionIncomeCents: nonNegativeCentsSchema.default(0),
    iraDistributionsCents: nonNegativeCentsSchema.default(0),
    socialSecurityBenefitsCents: nonNegativeCentsSchema.default(0),
    unemploymentCompensationCents: nonNegativeCentsSchema.default(0),
    otherTaxableIncomeCents: signedCentsSchema.default(0),
  })
  .strict();

export const taxPersonSchema = z
  .object({
    id: identifierSchema,
    role: taxUnitRoleSchema,
    ageYears: z.number().int().min(0).max(120),
    isBlind: z.boolean().default(false),
    isFullTimeStudent: z.boolean().default(false),
    income: annualIncomeSchema,
  })
  .strict();

export const annualDeductionsSchema = z
  .object({
    mortgageInterestCents: nonNegativeCentsSchema.default(0),
    stateAndLocalTaxesPaidCents: nonNegativeCentsSchema.default(0),
    charitableCashCents: nonNegativeCentsSchema.default(0),
    charitableNonCashCents: nonNegativeCentsSchema.default(0),
    medicalExpensesCents: nonNegativeCentsSchema.default(0),
    studentLoanInterestCents: nonNegativeCentsSchema.default(0),
    educatorExpensesCents: nonNegativeCentsSchema.default(0),
    hsaContributionsCents: nonNegativeCentsSchema.default(0),
    deductibleIraContributionsCents: nonNegativeCentsSchema.default(0),
    selfEmployedHealthInsuranceCents: nonNegativeCentsSchema.default(0),
    otherItemizedDeductionsCents: nonNegativeCentsSchema.default(0),
  })
  .strict();

export const taxCalculationRequestSchema = z
  .object({
    schemaVersion: z.literal(TAX_CONTRACT_VERSION),
    traceId: identifierSchema,
    economicYear: z.number().int().min(FROZEN_POLICY_YEAR).max(2200),
    policyYear: z.literal(FROZEN_POLICY_YEAR),
    cumulativePriceIndexPpm: ppmSchema,
    stateCode: z.enum(US_STATE_CODES),
    filingStatus: filingStatusSchema,
    people: z.array(taxPersonSchema).min(1).max(20),
    deductions: annualDeductionsSchema,
  })
  .strict()
  .superRefine((request, context) => {
    const primaryCount = request.people.filter(({ role }) => role === "primary").length;
    const spouseCount = request.people.filter(({ role }) => role === "spouse").length;
    const ids = request.people.map(({ id }) => id);

    if (primaryCount !== 1) {
      context.addIssue({
        code: "custom",
        path: ["people"],
        message: "exactly one person must have the primary role",
      });
    }
    if (spouseCount > 1) {
      context.addIssue({
        code: "custom",
        path: ["people"],
        message: "at most one person may have the spouse role",
      });
    }
    if (
      request.filingStatus === "married_filing_jointly" &&
      spouseCount !== 1
    ) {
      context.addIssue({
        code: "custom",
        path: ["people"],
        message: "married filing jointly requires one spouse",
      });
    }
    if (
      ["single", "head_of_household", "qualifying_surviving_spouse"].includes(
        request.filingStatus,
      ) &&
      spouseCount !== 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["people"],
        message: `${request.filingStatus} must not include a spouse in the tax unit`,
      });
    }
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["people"],
        message: "person identifiers must be unique",
      });
    }
    for (const [personIndex, person] of request.people.entries()) {
      const jobIds = person.income.w2Jobs.map(({ id }) => id);
      if (new Set(jobIds).size !== jobIds.length) {
        context.addIssue({
          code: "custom",
          path: ["people", personIndex, "income", "w2Jobs"],
          message: "W-2 job identifiers must be unique for each person",
        });
      }
      for (const [jobIndex, job] of person.income.w2Jobs.entries()) {
        if (
          job.pretaxRetirementContributionsCents +
            job.pretaxHealthContributionsCents >
          job.wagesCents
        ) {
          context.addIssue({
            code: "custom",
            path: ["people", personIndex, "income", "w2Jobs", jobIndex],
            message: "pretax contributions must not exceed W-2 wages",
          });
        }
      }
      if (
        person.income.qualifiedDividendsCents >
        person.income.ordinaryDividendsCents
      ) {
        context.addIssue({
          code: "custom",
          path: ["people", personIndex, "income", "qualifiedDividendsCents"],
          message: "qualified dividends must not exceed ordinary dividends",
        });
      }
    }
  });

export const taxCalculationResultSchema = z
  .object({
    schemaVersion: z.literal(TAX_CONTRACT_VERSION),
    traceId: identifierSchema,
    economicYear: z.number().int().min(FROZEN_POLICY_YEAR).max(2200),
    policyYear: z.literal(FROZEN_POLICY_YEAR),
    stateCode: z.enum(US_STATE_CODES),
    filingStatus: filingStatusSchema,
    annualGrossIncomeCents: signedCentsSchema,
    federalIncomeTaxCents: signedCentsSchema,
    stateIncomeTaxCents: signedCentsSchema,
    employeePayrollTaxCents: signedCentsSchema,
    selfEmploymentTaxCents: signedCentsSchema,
    totalTaxCents: signedCentsSchema,
    afterTaxIncomeCents: signedCentsSchema,
    effectiveTaxRatePpm: safeInteger.min(-1_000_000).max(100_000_000),
    componentsCents: z.record(identifierSchema, signedCentsSchema),
    model: z
      .object({
        provider: z.literal("PolicyEngine US"),
        bundleVersion: z.literal(POLICYENGINE_BUNDLE_VERSION),
        rulesVersion: z.literal(POLICYENGINE_US_VERSION),
        projectedFromFrozenPolicy: z.boolean(),
      })
      .strict(),
    disclaimer: z.literal(
      "Educational estimate only; not tax, legal, or financial advice.",
    ),
  })
  .strict()
  .superRefine((result, context) => {
    const expectedTotal =
      BigInt(result.federalIncomeTaxCents) +
      BigInt(result.stateIncomeTaxCents) +
      BigInt(result.employeePayrollTaxCents) +
      BigInt(result.selfEmploymentTaxCents);
    if (expectedTotal !== BigInt(result.totalTaxCents)) {
      context.addIssue({
        code: "custom",
        path: ["totalTaxCents"],
        message: "must equal federal, state, payroll, and self-employment taxes",
      });
    }
    if (
      BigInt(result.annualGrossIncomeCents) - BigInt(result.totalTaxCents) !==
      BigInt(result.afterTaxIncomeCents)
    ) {
      context.addIssue({
        code: "custom",
        path: ["afterTaxIncomeCents"],
        message: "must equal gross income minus total tax",
      });
    }
    const expectedRate =
      result.annualGrossIncomeCents === 0
        ? BigInt(0)
        : divideRoundHalfAwayFromZero(
            BigInt(result.totalTaxCents) * BigInt(1_000_000),
            BigInt(result.annualGrossIncomeCents),
          );
    if (expectedRate !== BigInt(result.effectiveTaxRatePpm)) {
      context.addIssue({
        code: "custom",
        path: ["effectiveTaxRatePpm"],
        message: "must equal total tax divided by gross income",
      });
    }
  });

export type TaxCalculationRequest = z.infer<typeof taxCalculationRequestSchema>;
export type TaxCalculationResult = z.infer<typeof taxCalculationResultSchema>;
export type AnnualIncome = z.infer<typeof annualIncomeSchema>;
export type AnnualDeductions = z.infer<typeof annualDeductionsSchema>;
