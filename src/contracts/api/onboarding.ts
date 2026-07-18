import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { AI_PRIVACY_NOTICE_VERSION } from "@/server/ai/privacy-notice";

extendZodWithOpenApi(z);

const identifier = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);
const month = z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/);
const cents = z.number().int().safe().min(0);
const rate = z.number().int().min(0).max(1_000_000);
const periodizedMoney = z
  .object({ amountCents: cents, period: z.enum(["monthly", "annual"]) })
  .strict();
const termDebt = z
  .object({
    id: identifier,
    kind: z.enum(["mortgage", "student_loan", "auto_loan", "personal_loan"]),
    principalCents: cents,
    annualInterestRatePpm: rate,
    minimumPaymentCents: cents,
    remainingTermMonths: z.number().int().min(1).max(1_200),
  })
  .strict();
const sourceMode = z.enum(["typed", "persona", "ai_assisted"]);
const financialGoalValue = z
  .object({
    version: z.literal("financial-goal-v1"),
    desiredAnnualSpendingCents: cents.min(1),
    safeWithdrawalRatePpm: z.number().int().min(20_000).max(60_000),
    targetAgeYears: z.number().int().min(18).max(80),
    source: z.enum(["player_selected", "current_lifestyle_default"]),
  })
  .strict();
const financialGoal = financialGoalValue.refine(
  ({ source }) => source === "player_selected",
);

export const onboardingDraftV1Schema = z
  .object({
    version: z.literal("onboarding-v1"),
    sourceMode,
    personaId: identifier.optional(),
    startMonth: month.optional(),
    birthMonth: month.optional(),
    randomSeed: z.string().min(1).max(256).optional(),
    runtimeDifficulty: z.enum(["guided", "normal", "hard"]).optional(),
    catalogVersion: identifier.optional(),
    locationId: identifier.optional(),
    careerId: identifier.optional(),
    householdId: identifier.optional(),
    benefitsPackageId: identifier.optional(),
    healthPlanId: identifier.nullable().optional(),
    retirementPlanId: identifier.optional(),
    insuranceCoverageIds: z.array(identifier).max(16).optional(),
    scenarioId: identifier.optional(),
    grossIncome: periodizedMoney.extend({ basis: z.literal("gross") }).strict().optional(),
    takeHomeIncome: periodizedMoney
      .extend({ basis: z.literal("take_home") })
      .strict()
      .optional(),
    essentialExpenses: periodizedMoney.optional(),
    discretionaryExpenses: periodizedMoney.optional(),
    finances: z
      .object({
        cashCents: cents.optional(),
        taxableBroadIndexCents: cents.optional(),
        taxableSectorCents: cents.optional(),
        taxableSpeculativeCents: cents.optional(),
        taxableTotalCents: cents.optional(),
        retirement401kCents: cents.optional(),
        retirementIraCents: cents.optional(),
        retirementTotalCents: cents.optional(),
        hsaCents: cents.optional(),
        homeValueCents: cents.optional(),
        otherAssetsCents: cents.optional(),
        termDebts: z.array(termDebt).max(32).optional(),
        revolvingCreditLimitCents: cents.optional(),
        revolvingCreditUsedCents: cents.optional(),
      })
      .strict()
      .optional(),
    financialGoal: financialGoal.optional(),
    wellbeing: z
      .object({ burnoutPpm: rate, happinessPpm: rate })
      .strict()
      .optional(),
    marketRegime: z
      .enum(["expansion", "inflation", "recession", "recovery"])
      .optional(),
  })
  .strict();

export const onboardingReviewRequestV1Schema = z
  .object({ draft: onboardingDraftV1Schema })
  .strict();

export const onboardingConfirmRequestV1Schema = z
  .object({
    draft: onboardingDraftV1Schema,
    reviewChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const onboardingParseRequestV1Schema = z
  .object({
    privacyNoticeVersion: z.literal(AI_PRIVACY_NOTICE_VERSION),
    dataUseAccepted: z.literal(true),
    freeText: z.string().trim().min(1).max(4_000),
  })
  .strict();

const onboardingIssueCode = z.enum([
  "INVALID_DRAFT",
  "UNSUPPORTED_ONBOARDING_VERSION",
  "BIRTH_MONTH_REQUIRED",
  "INVALID_MONTH",
  "AGE_OUT_OF_RANGE",
  "RANDOM_SEED_REQUIRED",
  "INVALID_RANDOM_SEED",
  "GROSS_INCOME_REQUIRED",
  "INVALID_MONEY",
  "MONEY_OVERFLOW",
  "INVALID_INCOME_BASIS",
  "TAKE_HOME_EXCEEDS_GROSS",
  "UNKNOWN_CATALOG_ENTRY",
  "CATALOG_SELECTION_INVALID",
  "SALARY_OUT_OF_RANGE",
  "INVALID_ASSET_ALLOCATION",
  "ASSET_TOTAL_MISMATCH",
  "INVALID_DEBT",
  "DUPLICATE_DEBT_ID",
  "INVALID_RATE",
  "INVALID_CREDIT",
  "HSA_INELIGIBLE",
  "SCENARIO_CONSTRAINT",
  "INVALID_FINANCIAL_GOAL",
  "INVALID_RUNTIME_DIFFICULTY",
  "INVALID_WELLBEING",
  "INVALID_MARKET_REGIME",
  "STALE_REVIEW",
  "AI_UNAVAILABLE",
  "MALFORMED_AI_EXTRACTION",
]);
const onboardingAssumptionCode = z.enum([
  "DEFAULT_START_MONTH",
  "DEFAULT_CATALOG_VERSION",
  "DEFAULT_CATALOG_SELECTION",
  "UNKNOWN_LOCATION_PRODUCT_DEFAULT",
  "DEFAULT_STARTING_CASH",
  "DEFAULT_FINANCE_ZERO",
  "DEFAULT_CREDIT_LIMIT",
  "DEFAULT_WELLBEING",
  "DEFAULT_INSURANCE",
  "DEFAULT_RUNTIME_DIFFICULTY",
  "DEFAULT_FINANCIAL_GOAL",
  "DEFAULT_CATALOG_LIVING_COST",
  "DEFAULT_EXPENSE_ZERO",
  "TAKE_HOME_DISPLAY_ONLY",
  "DECLARED_EXPENSES_AUTHORITATIVE",
]);
const issue = z
  .object({
    path: z.string().min(1).max(160),
    code: onboardingIssueCode,
    severity: z.enum(["needs_input", "invalid"]),
  })
  .strict();
const assumption = z
  .object({
    code: onboardingAssumptionCode,
    path: z.string().min(1).max(160),
    sourceId: z.string().min(1).max(160),
    sourceVersion: z.string().min(1).max(80),
  })
  .strict();
const provenance = z
  .object({
    path: z.string().min(1).max(160),
    source: z.enum([
      "user_entered",
      "persona_fixture",
      "catalog_default",
      "product_default",
    ]),
    sourceId: z.string().min(1).max(160),
    sourceVersion: z.string().min(1).max(80),
  })
  .strict();
const selection = z
  .object({
    catalogVersion: identifier,
    locationId: identifier,
    careerId: identifier,
    householdId: identifier,
    benefitsPackageId: identifier,
    healthPlanId: identifier.nullable(),
    retirementPlanId: identifier,
    insuranceCoverageIds: z.array(identifier).max(16),
    scenarioId: identifier,
  })
  .strict();
const declaredExpenses = z
  .object({
    essentialAnnualCents: cents,
    discretionaryAnnualCents: cents,
    totalAnnualCents: cents,
  })
  .strict();
const normalized = z
  .object({
    version: z.literal("onboarding-v1"),
    schemaVersion: z.literal(2),
    sourceMode,
    persona: z
      .object({ id: identifier, version: z.literal("onboarding-persona-v1") })
      .strict()
      .nullable(),
    startMonth: month,
    birthMonth: month,
    randomSeed: z.string().min(1).max(256),
    runtimeDifficulty: z.enum(["guided", "normal", "hard"]),
    selection,
    annualGrossSalaryCents: cents,
    annualTakeHomeEvidenceCents: cents.nullable(),
    declaredExpenses: declaredExpenses.nullable(),
    finances: z
      .object({
        cashCents: cents,
        taxableBroadIndexCents: cents,
        taxableSectorCents: cents,
        taxableSpeculativeCents: cents,
        retirement401kCents: cents,
        retirementIraCents: cents,
        hsaCents: cents,
        homeValueCents: cents,
        otherAssetsCents: cents,
        termDebts: z.array(termDebt).max(32),
        revolvingCreditLimitCents: cents,
        revolvingCreditUsedCents: cents,
      })
      .strict(),
    financialGoal: financialGoal.optional(),
    wellbeing: z.object({ burnoutPpm: rate, happinessPpm: rate }).strict(),
    marketRegime: z
      .enum(["expansion", "inflation", "recession", "recovery"])
      .optional(),
  })
  .strict();
const preview = z
  .object({
    owners: z
      .object({
        stateAndObligations: z.literal("createNativeGameStateV2"),
        financialGoal: z.literal("projectFinancialGoal"),
        risk: z.literal("analyzeRiskV1"),
      })
      .strict(),
    ownerVersions: z
      .object({
        stateAndObligations: z.literal("4.1.0"),
        stateSchema: z.literal(2),
        financialGoal: z.literal("financial-goal-v1"),
        risk: z.literal("risk-v1"),
      })
      .strict(),
    catalogAnnualLivingCostCents: cents,
    declaredAnnualExpensesCents: cents.nullable(),
    employerMatchTiers: z
      .array(
        z
          .object({
            employeeContributionRateUpToPpm: rate,
            employerMatchRatePpm: rate,
          })
          .strict(),
      )
      .max(8),
    requiredMonthlyObligationsCents: cents,
    financialGoal: financialGoalValue,
    financialGoalTargetCents: cents,
    financialGoalProgressPpm: rate,
    aggregateRiskSeverityPpm: rate,
    riskWeaknessTags: z.array(identifier).max(32),
  })
  .strict();

export const onboardingReviewResponseV1Schema = z
  .object({
    version: z.literal("onboarding-v1"),
    defaultsVersion: z.literal("onboarding-defaults-v1"),
    locationDefaultsVersion: z.literal("onboarding-location-defaults-v1"),
    status: z.enum(["ready", "needs_input", "invalid"]),
    normalized: normalized.nullable(),
    issues: z.array(issue).max(64),
    assumptions: z.array(assumption).max(64),
    provenance: z.array(provenance).max(96),
    preview: preview.nullable(),
    reviewChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
  .openapi({
    description:
      "Deterministic onboarding review with normalized values, owner previews, closed issues/assumptions/provenance, and a confirmation checksum.",
  });

export const onboardingParseResponseV1Schema = z
  .object({
    status: z.enum(["unavailable", "rejected", "ready"]),
    patch: z
      .object({
        birthMonth: month.optional(),
        locationId: identifier.optional(),
        careerId: identifier.optional(),
        grossIncome: periodizedMoney
          .extend({ basis: z.literal("gross") })
          .strict()
          .optional(),
        takeHomeIncome: periodizedMoney
          .extend({ basis: z.literal("take_home") })
          .strict()
          .optional(),
      })
      .strict(),
    financialCandidates: z
      .array(
        z
          .object({
            field: z.enum([
              "gross_income",
              "take_home_income",
              "essential_expenses",
              "discretionary_expenses",
              "cash",
              "taxable_investments",
              "retirement",
              "home_value",
              "other_assets",
              "non_credit_liabilities",
              "credit_limit",
              "credit_used",
              "annual_living_cost",
            ]),
            valueAsStated: z.string().trim().min(1).max(80),
            sourceExcerpt: z.string().trim().min(1).max(200),
            period: z.enum(["monthly", "annual"]).nullable(),
            basis: z.enum(["gross", "take_home"]).nullable(),
            requiresConfirmation: z.literal(true),
          })
          .strict(),
      )
      .max(20),
    filingStatusCandidate: z
      .enum([
        "single",
        "married_filing_jointly",
        "married_filing_separately",
        "head_of_household",
        "qualifying_surviving_spouse",
      ])
      .nullable(),
    clarificationQuestion: z.string().trim().min(1).max(300).nullable(),
    acceptedFieldIds: z
      .array(z.enum(["birthMonth", "locationId", "careerId"]))
      .max(3),
    issues: z.array(issue).max(16),
  })
  .strict()
  .openapi({
    description:
      "Optional untrusted onboarding extraction result; contains only allow-listed typed candidates and never state.",
  });

export type OnboardingDraftApiV1 = z.infer<typeof onboardingDraftV1Schema>;
export type OnboardingConfirmRequest = z.infer<
  typeof onboardingConfirmRequestV1Schema
>;
export type OnboardingReviewRequest = z.infer<
  typeof onboardingReviewRequestV1Schema
>;
export type OnboardingReviewResponse = z.infer<
  typeof onboardingReviewResponseV1Schema
>;
export type OnboardingParseRequest = z.infer<
  typeof onboardingParseRequestV1Schema
>;
export type OnboardingParseResponse = z.infer<
  typeof onboardingParseResponseV1Schema
>;
