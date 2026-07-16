import type { MoneyCents, RatePpm } from "./domain/money";
import type { SimulationMonth } from "./domain/month";
import type { FinancialGoalV1 } from "./financial-goals-v2";
import type { MarketRegime } from "./game-state";
import type {
  DebtBreakdown,
  ENGINE_V2_VERSION,
  GAME_STATE_V2_SCHEMA_VERSION,
  GameStateV2,
} from "./game-state-v2";
import type { FINANCIAL_GOAL_VERSION } from "./financial-goals-v2";
import type { RISK_ANALYZER_V1_VERSION } from "./risk-v1";
import type { RuntimeBalanceDifficultyV2 } from "./runtime-balance-policy-v2";
import type { ScenarioCatalogSelection } from "./scenario-catalog";

export const ONBOARDING_V1_VERSION = "onboarding-v1" as const;
export const ONBOARDING_DEFAULTS_V1_VERSION =
  "onboarding-defaults-v1" as const;
export const ONBOARDING_LOCATION_DEFAULTS_V1_VERSION =
  "onboarding-location-defaults-v1" as const;
export type OnboardingSourceModeV1 = "typed" | "persona" | "ai_assisted";
export type OnboardingFieldSourceV1 =
  | "user_entered"
  | "persona_fixture"
  | "catalog_default"
  | "product_default";

export type PeriodizedMoneyV1 = Readonly<{
  amountCents: number;
  period: "monthly" | "annual";
}>;

export type GrossIncomeInputV1 = PeriodizedMoneyV1 &
  Readonly<{ basis: "gross" }>;
export type TakeHomeIncomeInputV1 = PeriodizedMoneyV1 &
  Readonly<{ basis: "take_home" }>;

export type OnboardingTermDebtDraftV1 = Readonly<{
  id: string;
  kind: "mortgage" | "student_loan" | "auto_loan" | "personal_loan";
  principalCents: number;
  annualInterestRatePpm: number;
  minimumPaymentCents: number;
  remainingTermMonths: number;
}>;

export type OnboardingFinancesDraftV1 = Readonly<{
  cashCents?: number;
  taxableBroadIndexCents?: number;
  taxableSectorCents?: number;
  taxableSpeculativeCents?: number;
  taxableTotalCents?: number;
  retirement401kCents?: number;
  retirementIraCents?: number;
  retirementTotalCents?: number;
  hsaCents?: number;
  homeValueCents?: number;
  otherAssetsCents?: number;
  termDebts?: readonly OnboardingTermDebtDraftV1[];
  revolvingCreditLimitCents?: number;
  revolvingCreditUsedCents?: number;
}>;

export type OnboardingDraftV1 = Readonly<{
  version: typeof ONBOARDING_V1_VERSION;
  sourceMode: OnboardingSourceModeV1;
  personaId?: string;
  startMonth?: string;
  birthMonth?: string;
  randomSeed?: string;
  runtimeDifficulty?: RuntimeBalanceDifficultyV2;
  catalogVersion?: string;
  locationId?: string;
  careerId?: string;
  householdId?: string;
  benefitsPackageId?: string;
  healthPlanId?: string | null;
  retirementPlanId?: string;
  insuranceCoverageIds?: readonly string[];
  scenarioId?: string;
  grossIncome?: GrossIncomeInputV1;
  takeHomeIncome?: TakeHomeIncomeInputV1;
  essentialExpenses?: PeriodizedMoneyV1;
  discretionaryExpenses?: PeriodizedMoneyV1;
  finances?: OnboardingFinancesDraftV1;
  financialGoal?: FinancialGoalV1;
  wellbeing?: Readonly<{
    burnoutPpm: RatePpm;
    happinessPpm: RatePpm;
  }>;
  marketRegime?: MarketRegime;
}>;

export type OnboardingIssueCodeV1 =
  | "INVALID_DRAFT"
  | "UNSUPPORTED_ONBOARDING_VERSION"
  | "BIRTH_MONTH_REQUIRED"
  | "INVALID_MONTH"
  | "AGE_OUT_OF_RANGE"
  | "RANDOM_SEED_REQUIRED"
  | "INVALID_RANDOM_SEED"
  | "GROSS_INCOME_REQUIRED"
  | "INVALID_MONEY"
  | "MONEY_OVERFLOW"
  | "INVALID_INCOME_BASIS"
  | "TAKE_HOME_EXCEEDS_GROSS"
  | "UNKNOWN_CATALOG_ENTRY"
  | "CATALOG_SELECTION_INVALID"
  | "SALARY_OUT_OF_RANGE"
  | "INVALID_ASSET_ALLOCATION"
  | "ASSET_TOTAL_MISMATCH"
  | "INVALID_DEBT"
  | "DUPLICATE_DEBT_ID"
  | "INVALID_RATE"
  | "INVALID_CREDIT"
  | "HSA_INELIGIBLE"
  | "SCENARIO_CONSTRAINT"
  | "INVALID_FINANCIAL_GOAL"
  | "INVALID_RUNTIME_DIFFICULTY"
  | "INVALID_WELLBEING"
  | "INVALID_MARKET_REGIME"
  | "STALE_REVIEW"
  | "AI_UNAVAILABLE"
  | "MALFORMED_AI_EXTRACTION";

export type OnboardingIssueV1 = Readonly<{
  path: string;
  code: OnboardingIssueCodeV1;
  severity: "needs_input" | "invalid";
}>;

export type OnboardingAssumptionCodeV1 =
  | "DEFAULT_START_MONTH"
  | "DEFAULT_CATALOG_VERSION"
  | "DEFAULT_CATALOG_SELECTION"
  | "UNKNOWN_LOCATION_PRODUCT_DEFAULT"
  | "DEFAULT_STARTING_CASH"
  | "DEFAULT_FINANCE_ZERO"
  | "DEFAULT_CREDIT_LIMIT"
  | "DEFAULT_WELLBEING"
  | "DEFAULT_INSURANCE"
  | "DEFAULT_RUNTIME_DIFFICULTY"
  | "DEFAULT_FINANCIAL_GOAL"
  | "DEFAULT_CATALOG_LIVING_COST"
  | "DEFAULT_EXPENSE_ZERO"
  | "TAKE_HOME_DISPLAY_ONLY"
  | "DECLARED_EXPENSES_AUTHORITATIVE";

export type OnboardingAssumptionV1 = Readonly<{
  code: OnboardingAssumptionCodeV1;
  path: string;
  sourceId: string;
  sourceVersion: string;
}>;

export type OnboardingFieldProvenanceV1 = Readonly<{
  path: string;
  source: OnboardingFieldSourceV1;
  sourceId: string;
  sourceVersion: string;
}>;

export type NormalizedOnboardingV1 = Readonly<{
  version: typeof ONBOARDING_V1_VERSION;
  schemaVersion: 2;
  sourceMode: OnboardingSourceModeV1;
  persona: Readonly<{ id: string; version: string }> | null;
  startMonth: SimulationMonth;
  birthMonth: SimulationMonth;
  randomSeed: string;
  runtimeDifficulty: RuntimeBalanceDifficultyV2;
  selection: ScenarioCatalogSelection;
  annualGrossSalaryCents: MoneyCents;
  annualTakeHomeEvidenceCents: MoneyCents | null;
  declaredExpenses: Readonly<{
    essentialAnnualCents: MoneyCents;
    discretionaryAnnualCents: MoneyCents;
    totalAnnualCents: MoneyCents;
  }> | null;
  finances: Readonly<{
    cashCents: MoneyCents;
    taxableBroadIndexCents: MoneyCents;
    taxableSectorCents: MoneyCents;
    taxableSpeculativeCents: MoneyCents;
    retirement401kCents: MoneyCents;
    retirementIraCents: MoneyCents;
    hsaCents: MoneyCents;
    homeValueCents: MoneyCents;
    otherAssetsCents: MoneyCents;
    termDebts: DebtBreakdown["termDebts"];
    revolvingCreditLimitCents: MoneyCents;
    revolvingCreditUsedCents: MoneyCents;
  }>;
  financialGoal?: FinancialGoalV1;
  wellbeing: Readonly<{ burnoutPpm: RatePpm; happinessPpm: RatePpm }>;
  marketRegime?: MarketRegime;
}>;

export type OnboardingPreviewV1 = Readonly<{
  owners: Readonly<{
    stateAndObligations: "createNativeGameStateV2";
    financialGoal: "projectFinancialGoal";
    risk: "analyzeRiskV1";
  }>;
  ownerVersions: Readonly<{
    stateAndObligations: typeof ENGINE_V2_VERSION;
    stateSchema: typeof GAME_STATE_V2_SCHEMA_VERSION;
    financialGoal: typeof FINANCIAL_GOAL_VERSION;
    risk: typeof RISK_ANALYZER_V1_VERSION;
  }>;
  catalogAnnualLivingCostCents: MoneyCents;
  declaredAnnualExpensesCents: MoneyCents | null;
  employerMatchTiers: readonly Readonly<{
    employeeContributionRateUpToPpm: RatePpm;
    employerMatchRatePpm: RatePpm;
  }>[];
  requiredMonthlyObligationsCents: MoneyCents;
  financialGoal: FinancialGoalV1;
  financialGoalTargetCents: MoneyCents;
  financialGoalProgressPpm: RatePpm;
  aggregateRiskSeverityPpm: RatePpm;
  riskWeaknessTags: readonly string[];
}>;

export type OnboardingReviewV1 = Readonly<{
  version: typeof ONBOARDING_V1_VERSION;
  defaultsVersion: typeof ONBOARDING_DEFAULTS_V1_VERSION;
  locationDefaultsVersion: typeof ONBOARDING_LOCATION_DEFAULTS_V1_VERSION;
  status: "ready" | "needs_input" | "invalid";
  normalized: NormalizedOnboardingV1 | null;
  issues: readonly OnboardingIssueV1[];
  assumptions: readonly OnboardingAssumptionV1[];
  provenance: readonly OnboardingFieldProvenanceV1[];
  preview: OnboardingPreviewV1 | null;
  reviewChecksum: string;
}>;

export type ConfirmedOnboardingReviewV1 = Readonly<{
  confirmed: true;
  review: OnboardingReviewV1;
  reviewChecksum: string;
}>;

export type OnboardingInitializationEvidenceV1 = Readonly<{
  version: typeof ONBOARDING_V1_VERSION;
  schemaVersion: 2;
  sourceMode: OnboardingSourceModeV1;
  persona: Readonly<{ id: string; version: string }> | null;
  defaultsVersion: typeof ONBOARDING_DEFAULTS_V1_VERSION;
  locationDefaultsVersion: typeof ONBOARDING_LOCATION_DEFAULTS_V1_VERSION;
  reviewChecksum: string;
  normalizedInputChecksum: string;
  initialRandomSeed: string;
  confirmed: true;
  declaredExpenses: NormalizedOnboardingV1["declaredExpenses"];
  assumptions: readonly OnboardingAssumptionV1[];
  provenance: readonly OnboardingFieldProvenanceV1[];
  derivedOwners: Readonly<{
    stateAndObligations: "createNativeGameStateV2";
    financialGoal: "projectFinancialGoal";
    exposure: "recordExposureSnapshotV2";
  }>;
}>;

export type OnboardedGameStateResultV1 = Readonly<{
  state: GameStateV2;
  stateChecksum: string;
  evidence: OnboardingInitializationEvidenceV1;
}>;

export type OnboardingAiFinancialCandidateV1 = Readonly<{
  field:
    | "gross_income"
    | "take_home_income"
    | "essential_expenses"
    | "discretionary_expenses"
    | "cash"
    | "taxable_investments"
    | "retirement"
    | "home_value"
    | "other_assets"
    | "non_credit_liabilities"
    | "credit_limit"
    | "credit_used"
    | "annual_living_cost";
  valueAsStated: string;
  sourceExcerpt: string;
  period: "monthly" | "annual" | null;
  basis: "gross" | "take_home" | null;
  requiresConfirmation: true;
}>;

export type OnboardingAiExtractionResultV1 = Readonly<{
  status: "unavailable" | "rejected" | "ready";
  patch: Readonly<{
    birthMonth?: string;
    locationId?: string;
    careerId?: string;
    grossIncome?: GrossIncomeInputV1;
    takeHomeIncome?: TakeHomeIncomeInputV1;
  }>;
  financialCandidates: readonly OnboardingAiFinancialCandidateV1[];
  filingStatusCandidate:
    | "single"
    | "married_filing_jointly"
    | "married_filing_separately"
    | "head_of_household"
    | "qualifying_surviving_spouse"
    | null;
  clarificationQuestion: string | null;
  acceptedFieldIds: readonly string[];
  issues: readonly OnboardingIssueV1[];
}>;
