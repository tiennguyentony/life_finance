import type { MoneyCents, RatePpm } from "./domain/money";
import type { SimulationMonth } from "./domain/month";
import type { AiContentSource } from "./ai-source";
import {
  assertValidGameState,
  type GameState as GameStateV1,
  type MarketRegime,
} from "./game-state";
import type { ResolvedScenarioSnapshot } from "./scenario-catalog";
import type { FinancialGoalV1 } from "./financial-goals-v2";
import type { LifeMilestoneStateV1 } from "./life-milestones-v2";
import type { AiLearningMemoryV1 } from "./ai-learning-memory-v2";
import type {
  MacroMarketDifficultyV2,
  MarketMonthV2,
} from "./market";
import type {
  EventTier,
  EventTargetV2,
  MarketAssetClass,
} from "./events";

import {
  ENGINE_V2_VERSION,
  GAME_STATE_V2_SCHEMA_VERSION,
  V1_TO_V2_MIGRATION_VERSION,
} from "./game-state-v2-constants";
import { assertValidGameStateV2 } from "./game-state-v2-validation";
import {
  createInitialRuntimeBalanceStateV1,
  type RuntimeBalanceStateV1,
} from "./runtime-balance-state-v1";
import type { RuntimeBalanceStateV2 } from "./runtime-balance-state-v2";

export {
  ENGINE_V2_VERSION,
  GAME_STATE_V2_SCHEMA_VERSION,
  V1_TO_V2_MIGRATION_VERSION,
} from "./game-state-v2-constants";
export {
  assertValidGameStateV2,
  InvalidGameStateV2Error,
  validateGameStateV2,
} from "./game-state-v2-validation";
const LEGACY_CATALOG_VERSION = "legacy-v1" as const;

export type VersionedCatalogSelection = Readonly<{
  location: Readonly<{ id: string; version: string }>;
  career: Readonly<{ id: string; version: string }>;
  household: Readonly<{ id: string; version: string }>;
  benefits: Readonly<{ id: string; version: string }>;
  scenario: Readonly<{ id: string; version: string }>;
}>;

export type PortfolioBreakdown = Readonly<{
  taxableBroadIndexCents: MoneyCents;
  taxableSectorCents: MoneyCents;
  taxableSpeculativeCents: MoneyCents;
  taxableLegacyUnclassifiedCents: MoneyCents;
  retirement401kCents: MoneyCents;
  retirementIraCents: MoneyCents;
  retirementLegacyUnclassifiedCents: MoneyCents;
  hsaCents: MoneyCents;
  otherInvestableLegacyUnclassifiedCents: MoneyCents;
}>;

export type DebtBreakdown = Readonly<{
  termDebts: readonly Readonly<{
    id: string;
    kind: "mortgage" | "student_loan" | "auto_loan" | "personal_loan";
    principalCents: MoneyCents;
    annualInterestRatePpm: RatePpm;
    minimumPaymentCents: MoneyCents;
    remainingTermMonths: number;
  }>[];
  legacyUnclassifiedPrincipalCents: MoneyCents;
  revolvingCreditLimitCents: MoneyCents;
  revolvingCreditUsedCents: MoneyCents;
}>;

export type BenefitsSelection = Readonly<{
  status: "legacy_unknown" | "selected";
  healthPlanId: string | null;
  hsaEligible: boolean | null;
  employerRetirementPlanId: string | null;
  insuranceCoverageIds: readonly string[];
}>;

export type RecurringStrategy = Readonly<{
  effectiveMonth: SimulationMonth;
  /** Optional for historical replay; new commands persist an explicit target. */
  emergencyFundTargetMonthsPpm?: RatePpm;
  /** Optional for historical replay; absence uses the onboarding selection. */
  insuranceCoverageIds?: readonly string[];
  preTax401kSalaryRatePpm: RatePpm;
  preTaxHsaSalaryRatePpm: RatePpm;
  afterTaxBroadIndexRatePpm: RatePpm;
  afterTaxSectorRatePpm: RatePpm;
  afterTaxSpeculativeRatePpm: RatePpm;
  afterTaxIraRatePpm: RatePpm;
  afterTaxExtraDebtRatePpm: RatePpm;
}>;

export type ExposureSnapshot = Readonly<{
  month: SimulationMonth;
  /** Fixed-point score: 1_000_000 is disciplined and 3_000_000 is reckless. */
  scorePpm: RatePpm;
  /** Fixed-point month count, so 3_500_000 represents 3.5 months. */
  emergencyFundMonthsPpm: RatePpm;
  /** May exceed 1_000_000 when debt is greater than annual income. */
  debtToIncomePpm: RatePpm | null;
  revolvingDebtPpm: RatePpm;
  insuranceGapPpm: RatePpm | null;
  portfolioConcentrationPpm: RatePpm;
  jobInvestmentCorrelationPpm: RatePpm | null;
}>;

export type PendingEventV2 = Readonly<{
  eventId: string;
  templateId: string;
  templateVersion: number;
  tier: Exclude<EventTier, "ambient">;
  targetedWeakness: EventTargetV2;
  parameters: Readonly<Record<string, number>>;
  choiceIds: readonly string[];
  scheduledMonth: SimulationMonth;
  expiresMonth: SimulationMonth;
  /** Present only for declarative personal-event schema v2. Absence preserves v1 replay. */
  eventSchemaVersion?: 2;
  category?: string;
  classification?: "positive" | "neutral" | "negative";
  lessonTags?: Readonly<{ primary: string; secondary: readonly string[] }>;
  pressureCost?: number;
  recoveryDurationMonths?: number;
  fallbackNarrative?: Readonly<{ headline: string; body: string }>;
  aiNarrative?: Readonly<{
    source: AiContentSource;
    headline: string;
    narrative: string;
    rationale: string;
    citedEvidenceIds: readonly string[];
  }>;
}>;

export type ScheduledPersonalEventCashFlowV2 = Readonly<{
  id: string;
  sourceEffectId: string;
  kind: "temporary_expense" | "recurring_expense" | "temporary_income";
  amountCents: MoneyCents;
  startMonth: SimulationMonth;
  durationMonths: number;
}>;

export type ResolvedEventEvidenceV2 = Readonly<{
  commandId: string;
  resultingRevision: number;
  eventId: string;
  templateId: string;
  templateVersion: number;
  tier: Exclude<EventTier, "ambient">;
  targetedWeakness: EventTargetV2;
  parameters: Readonly<Record<string, number>>;
  choiceId: string;
  availableChoiceIds: readonly string[];
  scheduledMonth: SimulationMonth;
  resolvedMonth: SimulationMonth;
  playerCostCents: MoneyCents;
  insurerCostCents: MoneyCents;
  /** Present only for declarative personal-event schema v2. Absence preserves v1 replay. */
  eventSchemaVersion?: 2;
  category?: string;
  classification?: "positive" | "neutral" | "negative";
  lessonTags?: Readonly<{ primary: string; secondary: readonly string[] }>;
  pressureCost?: number;
  recoveryDurationMonths?: number;
  fallbackNarrative?: Readonly<{ headline: string; body: string }>;
  /** Immutable canonical evidence for cash flows scheduled by this resolved response. */
  scheduledCashFlows?: readonly ScheduledPersonalEventCashFlowV2[];
}>;

export type ActivePersonalEventCashFlowV2 = Readonly<{
  id: string;
  sourceEventId: string;
  sourceEffectId: string;
  kind: "temporary_expense" | "recurring_expense" | "temporary_income";
  amountCents: MoneyCents;
  startMonth: SimulationMonth;
  remainingMonths: number;
}>;

export type GameplayStateV2 = Readonly<{
  /** Optional only for backward compatibility with earlier schema-v2 runs. */
  runtimeBalance?: RuntimeBalanceStateV1 | RuntimeBalanceStateV2;
  /** Optional only for backward compatibility with schema-v2 runs created before goals-v1. */
  financialGoal?: FinancialGoalV1;
  /** Optional only for backward compatibility with earlier schema-v2 runs. */
  lifeMilestones?: LifeMilestoneStateV1;
  /** Bounded structured memory; prompts never replay the unbounded run history. */
  aiLearningMemory?: AiLearningMemoryV1;
  catalogs: VersionedCatalogSelection;
  catalogSnapshot: ResolvedScenarioSnapshot | null;
  catalogSnapshotChecksum: string | null;
  employment:
    | Readonly<{
        status: "legacy_unknown";
        annualGrossSalaryCents: null;
        careerId: null;
        sectorId: null;
      }>
    | Readonly<{
        status: "employed";
        annualGrossSalaryCents: MoneyCents;
        careerId: string;
        sectorId: string;
      }>;
  portfolio: PortfolioBreakdown;
  debts: DebtBreakdown;
  benefits: BenefitsSelection;
  contributions: Readonly<{
    policyYear: number | null;
    employee401kCents: MoneyCents;
    employer401kCents: MoneyCents;
    iraCents: MoneyCents;
    hsaCents: MoneyCents;
  }>;
  insurance: Readonly<{
    policyYear: number | null;
    healthDeductiblePaidCents: MoneyCents;
    healthOutOfPocketPaidCents: MoneyCents;
    coverageUsage: readonly Readonly<{
      coverageId: string;
      usedCents: MoneyCents;
    }>[];
  }>;
  market: Readonly<{
    modelVersion: "regime-v1" | "regime-v2";
    monthsInRegime: number;
    /** Optional only for backward compatibility with earlier schema-v2 runs. */
    cumulativePriceIndexPpm?: number;
    /** Required structured macro evidence once a run opts into regime-v2. */
    calibrationVersion?: MarketMonthV2["calibrationVersion"];
    macroDifficulty?: MacroMarketDifficultyV2;
    observedRegime?: MarketRegime;
    observedMonth?: SimulationMonth;
    borrowingRatePpm?: RatePpm;
    laborDemandChangePpm?: RatePpm;
    volatilityPpm?: RatePpm;
    lastInflationPpm?: RatePpm;
    broadMarketReturnPpm?: RatePpm;
    sectorMarketReturnPpm?: RatePpm;
    speculativeMarketReturnPpm?: RatePpm;
    housingReturnPpm?: RatePpm;
    cashYieldPpm?: RatePpm;
  }>;
  recurringStrategy: RecurringStrategy;
  exposure: Readonly<{
    current: ExposureSnapshot | null;
    history: readonly ExposureSnapshot[];
  }>;
  eventLifecycle: Readonly<{
    pending: PendingEventV2 | null;
    history: readonly ResolvedEventEvidenceV2[];
    activeStoryIds: readonly string[];
    macroStories: readonly Readonly<{
      storyId: string;
      templateId: string;
      templateVersion: number;
      parameters: Readonly<Record<string, number>>;
      startedMonth: SimulationMonth;
      expiresMonth: SimulationMonth;
      returnModifiersPpm: Readonly<Record<MarketAssetClass, RatePpm>>;
    }>[];
    cooldowns: readonly Readonly<{
      templateId: string;
      eligibleAgainMonth: SimulationMonth;
    }>[];
    /** Present only after a declarative v2 event schedules a follow-up. */
    scheduledFollowUps?: readonly Readonly<{
      sourceEventId: string;
      templateId: string;
      templateVersion: number;
      eligibleMonth: SimulationMonth;
    }>[];
    /** Optional only for replay compatibility with schema-v2 runs created before declarative events. */
    activeCashFlows?: readonly ActivePersonalEventCashFlowV2[];
  }>;
  careerDevelopment: Readonly<{
    pending: readonly Readonly<{
      commandId: string;
      programId: string;
      catalogVersion: string;
      startedMonth: SimulationMonth;
      completesMonth: SimulationMonth;
      annualSalaryIncreaseCents: MoneyCents;
    }>[];
    history: readonly Readonly<{
      commandId: string;
      programId: string;
      catalogVersion: string;
      startedMonth: SimulationMonth;
      completedMonth: SimulationMonth;
      annualSalaryIncreaseCents: MoneyCents;
    }>[];
  }>;
}>;

export type StateMigrationRecord = Readonly<{
  sourceSchemaVersion: 1;
  sourceEngineVersion: GameStateV1["engineVersion"];
  targetSchemaVersion: typeof GAME_STATE_V2_SCHEMA_VERSION;
  targetEngineVersion: typeof ENGINE_V2_VERSION;
  migrationVersion: typeof V1_TO_V2_MIGRATION_VERSION;
}>;

export type GameStateV2 = Readonly<
  Omit<GameStateV1, "schemaVersion" | "engineVersion"> & {
    schemaVersion: typeof GAME_STATE_V2_SCHEMA_VERSION;
    engineVersion: typeof ENGINE_V2_VERSION;
    gameplay: GameplayStateV2;
    migration: StateMigrationRecord | null;
  }
>;

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

export function finalizeGameStateV2(state: GameStateV2): GameStateV2 {
  assertValidGameStateV2(state);
  return deepFreeze(state) as GameStateV2;
}

export function migrateGameStateV1ToV2(state: GameStateV1): GameStateV2 {
  assertValidGameState(state);

  const migrated: GameStateV2 = {
    ...state,
    schemaVersion: GAME_STATE_V2_SCHEMA_VERSION,
    engineVersion: ENGINE_V2_VERSION,
    gameplay: {
      runtimeBalance: createInitialRuntimeBalanceStateV1(),
      catalogs: {
        location: { id: state.player.locationId, version: LEGACY_CATALOG_VERSION },
        career: { id: state.player.careerTrackId, version: LEGACY_CATALOG_VERSION },
        household: { id: "legacy-household", version: LEGACY_CATALOG_VERSION },
        benefits: { id: "legacy-benefits", version: LEGACY_CATALOG_VERSION },
        scenario: { id: "legacy-scenario", version: LEGACY_CATALOG_VERSION },
      },
      catalogSnapshot: null,
      catalogSnapshotChecksum: null,
      employment: {
        status: "legacy_unknown",
        annualGrossSalaryCents: null,
        careerId: null,
        sectorId: null,
      },
      portfolio: {
        taxableBroadIndexCents: 0 as MoneyCents,
        taxableSectorCents: 0 as MoneyCents,
        taxableSpeculativeCents: 0 as MoneyCents,
        taxableLegacyUnclassifiedCents: state.finances.taxableInvestmentsCents,
        retirement401kCents: 0 as MoneyCents,
        retirementIraCents: 0 as MoneyCents,
        retirementLegacyUnclassifiedCents: state.finances.retirementCents,
        hsaCents: 0 as MoneyCents,
        otherInvestableLegacyUnclassifiedCents:
          state.finances.otherInvestableAssetsCents,
      },
      debts: {
        termDebts: [],
        legacyUnclassifiedPrincipalCents: state.finances.nonCreditLiabilitiesCents,
        revolvingCreditLimitCents: state.finances.creditLimitCents,
        revolvingCreditUsedCents: state.finances.creditUsedCents,
      },
      benefits: {
        status: "legacy_unknown",
        healthPlanId: null,
        hsaEligible: null,
        employerRetirementPlanId: null,
        insuranceCoverageIds: [],
      },
      contributions: {
        policyYear: null,
        employee401kCents: 0 as MoneyCents,
        employer401kCents: 0 as MoneyCents,
        iraCents: 0 as MoneyCents,
        hsaCents: 0 as MoneyCents,
      },
      insurance: {
        policyYear: null,
        healthDeductiblePaidCents: 0 as MoneyCents,
        healthOutOfPocketPaidCents: 0 as MoneyCents,
        coverageUsage: [],
      },
      market: { modelVersion: "regime-v1", monthsInRegime: 0 },
      recurringStrategy: {
        effectiveMonth: state.currentMonth,
        preTax401kSalaryRatePpm: 0 as RatePpm,
        preTaxHsaSalaryRatePpm: 0 as RatePpm,
        afterTaxBroadIndexRatePpm: 0 as RatePpm,
        afterTaxSectorRatePpm: 0 as RatePpm,
        afterTaxSpeculativeRatePpm: 0 as RatePpm,
        afterTaxIraRatePpm: 0 as RatePpm,
        afterTaxExtraDebtRatePpm: 0 as RatePpm,
      },
      exposure: { current: null, history: [] },
      eventLifecycle: {
        pending: null,
        history: [],
        activeStoryIds: [],
        macroStories: [],
        cooldowns: [],
      },
      careerDevelopment: { pending: [], history: [] },
    },
    migration: {
      sourceSchemaVersion: 1,
      sourceEngineVersion: state.engineVersion,
      targetSchemaVersion: GAME_STATE_V2_SCHEMA_VERSION,
      targetEngineVersion: ENGINE_V2_VERSION,
      migrationVersion: V1_TO_V2_MIGRATION_VERSION,
    },
  };

  return finalizeGameStateV2(migrated);
}
