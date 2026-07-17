import type {
  OnboardingAssumptionCodeV1,
  OnboardingIssueCodeV1,
  OnboardingReviewV1,
} from "../core/onboarding-v1-contracts";

export const ONBOARDING_LOCALIZATION_V1 = Object.freeze({
  version: "onboarding-en-US-v1" as const,
  locale: "en-US" as const,
  issues: Object.freeze({
    INVALID_DRAFT: "Review the onboarding fields and try again.",
    UNSUPPORTED_ONBOARDING_VERSION: "This onboarding version is not supported.",
    BIRTH_MONTH_REQUIRED: "Enter your birth month.",
    INVALID_MONTH: "Use a valid year and month.",
    AGE_OUT_OF_RANGE: "Starting age must be between 18 and 80 years.",
    RANDOM_SEED_REQUIRED: "Choose a simulation seed.",
    INVALID_RANDOM_SEED: "Use a seed between 1 and 256 characters.",
    GROSS_INCOME_REQUIRED: "Enter gross income; take-home pay cannot be reversed safely.",
    INVALID_MONEY: "Enter a non-negative whole-cent amount.",
    MONEY_OVERFLOW: "The amount is too large for this simulation.",
    INVALID_INCOME_BASIS: "Identify income as gross or take-home.",
    TAKE_HOME_EXCEEDS_GROSS:
      "Annualized take-home income cannot be greater than annualized gross income.",
    UNKNOWN_CATALOG_ENTRY: "Choose an available catalog option.",
    CATALOG_SELECTION_INVALID: "The selected location, career, benefits, and scenario are incompatible.",
    SALARY_OUT_OF_RANGE: "Salary must fit the selected career and location range.",
    INVALID_ASSET_ALLOCATION: "Provide each asset bucket instead of an unallocated total.",
    ASSET_TOTAL_MISMATCH: "The asset buckets do not equal the stated total.",
    INVALID_DEBT: "Review debt balance, payment, type, and term.",
    DUPLICATE_DEBT_ID: "Each debt needs a unique identifier.",
    INVALID_RATE: "Enter an annual rate between zero and 100 percent.",
    INVALID_CREDIT: "Used credit cannot exceed the credit limit.",
    HSA_INELIGIBLE: "An HSA balance requires an HSA-eligible health plan.",
    SCENARIO_CONSTRAINT: "The starting position conflicts with the selected scenario.",
    INVALID_FINANCIAL_GOAL: "Review the financial-independence goal.",
    INVALID_RUNTIME_DIFFICULTY: "Choose guided, normal, or hard difficulty.",
    INVALID_WELLBEING: "Wellbeing values must stay between zero and one million PPM.",
    INVALID_MARKET_REGIME: "Choose a supported starting market regime.",
    STALE_REVIEW: "The input changed; review it again before starting.",
    AI_UNAVAILABLE: "AI extraction is unavailable; continue with typed input or a persona.",
    MALFORMED_AI_EXTRACTION: "The AI extraction was rejected; review the source fields manually.",
  } satisfies Readonly<Record<OnboardingIssueCodeV1, string>>),
  assumptions: Object.freeze({
    DEFAULT_START_MONTH: "The product start month was used.",
    DEFAULT_CATALOG_VERSION: "The current offline catalog version was used.",
    DEFAULT_CATALOG_SELECTION: "A catalog default selection was used.",
    UNKNOWN_LOCATION_PRODUCT_DEFAULT: "The location was not found, so the visible product fallback was used.",
    DEFAULT_STARTING_CASH: "The scenario minimum starting cash was used.",
    DEFAULT_FINANCE_ZERO: "The omitted opening balance was set to zero.",
    DEFAULT_CREDIT_LIMIT: "The product credit-limit default was used.",
    DEFAULT_WELLBEING: "The product wellbeing defaults were used.",
    DEFAULT_INSURANCE: "The catalog insurance default was used.",
    DEFAULT_RUNTIME_DIFFICULTY: "Normal difficulty was used.",
    DEFAULT_FINANCIAL_GOAL: "The current-lifestyle financial goal was used.",
    DEFAULT_CATALOG_LIVING_COST: "The catalog living cost was used.",
    DEFAULT_EXPENSE_ZERO: "The omitted expense component was set to zero.",
    TAKE_HOME_DISPLAY_ONLY: "Take-home pay is review evidence and does not replace gross income.",
    DECLARED_EXPENSES_AUTHORITATIVE: "Confirmed essential and discretionary expenses set living cost.",
  } satisfies Readonly<Record<OnboardingAssumptionCodeV1, string>>),
});

export type OnboardingReviewPresentationV1 = Readonly<{
  locale: "en-US";
  localizationVersion: typeof ONBOARDING_LOCALIZATION_V1.version;
  issues: readonly Readonly<{ path: string; code: OnboardingIssueCodeV1; message: string }>[];
  assumptions: readonly Readonly<{
    path: string;
    code: OnboardingAssumptionCodeV1;
    message: string;
  }>[];
}>;

export function presentOnboardingReviewV1(
  review: OnboardingReviewV1,
  requestedLocale: string = "en-US",
): OnboardingReviewPresentationV1 {
  const locale =
    requestedLocale === ONBOARDING_LOCALIZATION_V1.locale
      ? requestedLocale
      : ONBOARDING_LOCALIZATION_V1.locale;
  return Object.freeze({
    locale,
    localizationVersion: ONBOARDING_LOCALIZATION_V1.version,
    issues: Object.freeze(
      review.issues.map(({ path, code }) =>
        Object.freeze({ path, code, message: ONBOARDING_LOCALIZATION_V1.issues[code] }),
      ),
    ),
    assumptions: Object.freeze(
      review.assumptions.map(({ path, code }) =>
        Object.freeze({
          path,
          code,
          message: ONBOARDING_LOCALIZATION_V1.assumptions[code],
        }),
      ),
    ),
  });
}
