import type { MoneyCents, RatePpm } from "./domain/money";
import { compareMonths, simulationMonth, type SimulationMonth } from "./domain/month";
import {
  assertValidGameState,
  type GameState as GameStateV1,
  type StateInvariantViolation,
} from "./game-state";

export const GAME_STATE_V2_SCHEMA_VERSION = 2 as const;
export const ENGINE_V2_VERSION = "4.1.0" as const;
export const V1_TO_V2_MIGRATION_VERSION = "game-state-v1-to-v2.1" as const;
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

export type GameplayStateV2 = Readonly<{
  catalogs: VersionedCatalogSelection;
  portfolio: PortfolioBreakdown;
  debts: DebtBreakdown;
  benefits: BenefitsSelection;
  recurringStrategy: RecurringStrategy;
  exposure: Readonly<{
    current: ExposureSnapshot | null;
    history: readonly ExposureSnapshot[];
  }>;
  eventLifecycle: Readonly<{
    pendingEventId: string | null;
    activeStoryIds: readonly string[];
    cooldowns: readonly Readonly<{
      templateId: string;
      eligibleAgainMonth: SimulationMonth;
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
    migration: StateMigrationRecord;
  }
>;

export class InvalidGameStateV2Error extends Error {
  readonly violations: readonly StateInvariantViolation[];

  constructor(violations: readonly StateInvariantViolation[]) {
    super(
      `game state v2 violates ${violations.length} invariant${violations.length === 1 ? "" : "s"}`,
    );
    this.name = "InvalidGameStateV2Error";
    this.violations = violations;
  }
}

function violation(
  path: string,
  code: string,
  message: string,
): StateInvariantViolation {
  return { path, code, message };
}

function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function sum(values: readonly number[]): bigint {
  return values.reduce((total, value) => total + BigInt(value), BigInt(0));
}

function validateRate(
  value: number,
  path: string,
  violations: StateInvariantViolation[],
): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) {
    violations.push(
      violation(path, "invalid_rate", "must be between 0 and 1,000,000 PPM"),
    );
  }
}

function validateMoneyRecord(
  values: Readonly<Record<string, number>>,
  prefix: string,
  violations: StateInvariantViolation[],
): void {
  for (const [key, value] of Object.entries(values)) {
    if (!isNonNegativeSafeInteger(value)) {
      violations.push(
        violation(
          `${prefix}.${key}`,
          "invalid_money",
          "must be a non-negative safe integer number of cents",
        ),
      );
    }
  }
}

export function validateGameStateV2(
  state: GameStateV2,
): readonly StateInvariantViolation[] {
  const violations: StateInvariantViolation[] = [];

  if (state.schemaVersion !== GAME_STATE_V2_SCHEMA_VERSION) {
    violations.push(
      violation("schemaVersion", "unsupported_schema", "must be schema version 2"),
    );
  }
  if (state.engineVersion !== ENGINE_V2_VERSION) {
    violations.push(
      violation("engineVersion", "unsupported_engine", "must be engine version 4.1.0"),
    );
  }
  if (
    state.migration.sourceSchemaVersion !== 1 ||
    state.migration.sourceEngineVersion !== "4.0.0" ||
    state.migration.targetSchemaVersion !== GAME_STATE_V2_SCHEMA_VERSION ||
    state.migration.targetEngineVersion !== ENGINE_V2_VERSION ||
    state.migration.migrationVersion !== V1_TO_V2_MIGRATION_VERSION
  ) {
    violations.push(
      violation("migration", "invalid_migration_record", "must identify the exact v1-to-v2 migration"),
    );
  }

  const baseState: GameStateV1 = {
    ...state,
    schemaVersion: 1,
    engineVersion: "4.0.0",
  };
  try {
    assertValidGameState(baseState);
  } catch (error) {
    if (error instanceof Error && "violations" in error) {
      violations.push(
        ...((error as { violations: readonly StateInvariantViolation[] }).violations),
      );
    } else {
      violations.push(
        violation("baseState", "invalid_v1_projection", "must preserve valid v1 state invariants"),
      );
    }
  }

  validateMoneyRecord(
    state.gameplay.portfolio as unknown as Readonly<Record<string, number>>,
    "gameplay.portfolio",
    violations,
  );
  validateMoneyRecord(
    {
      legacyUnclassifiedPrincipalCents:
        state.gameplay.debts.legacyUnclassifiedPrincipalCents,
      revolvingCreditLimitCents: state.gameplay.debts.revolvingCreditLimitCents,
      revolvingCreditUsedCents: state.gameplay.debts.revolvingCreditUsedCents,
    },
    "gameplay.debts",
    violations,
  );

  const portfolio = state.gameplay.portfolio;
  const taxableTotal = sum([
    portfolio.taxableBroadIndexCents,
    portfolio.taxableSectorCents,
    portfolio.taxableSpeculativeCents,
    portfolio.taxableLegacyUnclassifiedCents,
  ]);
  const retirementTotal = sum([
    portfolio.retirement401kCents,
    portfolio.retirementIraCents,
    portfolio.retirementLegacyUnclassifiedCents,
  ]);
  const otherInvestableTotal = sum([
    portfolio.hsaCents,
    portfolio.otherInvestableLegacyUnclassifiedCents,
  ]);
  if (taxableTotal !== BigInt(state.finances.taxableInvestmentsCents)) {
    violations.push(
      violation(
        "gameplay.portfolio",
        "taxable_total_mismatch",
        "taxable portfolio buckets must equal the aggregate taxable balance",
      ),
    );
  }
  if (retirementTotal !== BigInt(state.finances.retirementCents)) {
    violations.push(
      violation(
        "gameplay.portfolio",
        "retirement_total_mismatch",
        "retirement portfolio buckets must equal the aggregate retirement balance",
      ),
    );
  }
  if (otherInvestableTotal !== BigInt(state.finances.otherInvestableAssetsCents)) {
    violations.push(
      violation(
        "gameplay.portfolio",
        "other_investable_total_mismatch",
        "HSA and legacy buckets must equal aggregate other investable assets",
      ),
    );
  }

  const debts = state.gameplay.debts;
  for (const [index, debt] of debts.termDebts.entries()) {
    validateMoneyRecord(
      {
        principalCents: debt.principalCents,
        minimumPaymentCents: debt.minimumPaymentCents,
      },
      `gameplay.debts.termDebts.${index}`,
      violations,
    );
    validateRate(
      debt.annualInterestRatePpm,
      `gameplay.debts.termDebts.${index}.annualInterestRatePpm`,
      violations,
    );
    if (!Number.isSafeInteger(debt.remainingTermMonths) || debt.remainingTermMonths < 0) {
      violations.push(
        violation(
          `gameplay.debts.termDebts.${index}.remainingTermMonths`,
          "invalid_term",
          "must be a non-negative safe integer",
        ),
      );
    }
  }
  if (
    sum([
      debts.legacyUnclassifiedPrincipalCents,
      ...debts.termDebts.map((debt) => debt.principalCents),
    ]) !== BigInt(state.finances.nonCreditLiabilitiesCents)
  ) {
    violations.push(
      violation(
        "gameplay.debts",
        "non_credit_total_mismatch",
        "term and legacy debt principal must equal aggregate non-credit liabilities",
      ),
    );
  }
  if (
    debts.revolvingCreditLimitCents !== state.finances.creditLimitCents ||
    debts.revolvingCreditUsedCents !== state.finances.creditUsedCents
  ) {
    violations.push(
      violation(
        "gameplay.debts",
        "credit_total_mismatch",
        "revolving credit must equal aggregate credit balances",
      ),
    );
  }

  const strategy = state.gameplay.recurringStrategy;
  try {
    simulationMonth(strategy.effectiveMonth);
    if (compareMonths(strategy.effectiveMonth, state.currentMonth) > 0) {
      violations.push(
        violation(
          "gameplay.recurringStrategy.effectiveMonth",
          "future_strategy",
          "active recurring strategy must not begin after the current month",
        ),
      );
    }
  } catch {
    violations.push(
      violation(
        "gameplay.recurringStrategy.effectiveMonth",
        "invalid_month",
        "must use canonical YYYY-MM",
      ),
    );
  }
  validateRate(strategy.preTax401kSalaryRatePpm, "gameplay.recurringStrategy.preTax401kSalaryRatePpm", violations);
  validateRate(strategy.preTaxHsaSalaryRatePpm, "gameplay.recurringStrategy.preTaxHsaSalaryRatePpm", violations);
  validateRate(strategy.afterTaxBroadIndexRatePpm, "gameplay.recurringStrategy.afterTaxBroadIndexRatePpm", violations);
  validateRate(strategy.afterTaxSectorRatePpm, "gameplay.recurringStrategy.afterTaxSectorRatePpm", violations);
  validateRate(strategy.afterTaxSpeculativeRatePpm, "gameplay.recurringStrategy.afterTaxSpeculativeRatePpm", violations);
  validateRate(strategy.afterTaxIraRatePpm, "gameplay.recurringStrategy.afterTaxIraRatePpm", violations);
  validateRate(strategy.afterTaxExtraDebtRatePpm, "gameplay.recurringStrategy.afterTaxExtraDebtRatePpm", violations);
  if (
    sum([strategy.preTax401kSalaryRatePpm, strategy.preTaxHsaSalaryRatePpm]) >
    BigInt(1_000_000)
  ) {
    violations.push(
      violation(
        "gameplay.recurringStrategy",
        "pretax_overallocated",
        "pre-tax salary allocations must not exceed 100%",
      ),
    );
  }
  if (
    sum([
      strategy.afterTaxBroadIndexRatePpm,
      strategy.afterTaxSectorRatePpm,
      strategy.afterTaxSpeculativeRatePpm,
      strategy.afterTaxIraRatePpm,
      strategy.afterTaxExtraDebtRatePpm,
    ]) > BigInt(1_000_000)
  ) {
    violations.push(
      violation(
        "gameplay.recurringStrategy",
        "aftertax_overallocated",
        "after-tax allocations must not exceed 100%",
      ),
    );
  }

  const catalogRefs = Object.values(state.gameplay.catalogs);
  if (catalogRefs.some(({ id, version }) => id.length === 0 || version.length === 0)) {
    violations.push(
      violation("gameplay.catalogs", "invalid_catalog_ref", "catalog ids and versions must not be empty"),
    );
  }
  const benefits = state.gameplay.benefits;
  if (
    benefits.status === "legacy_unknown" &&
    (benefits.healthPlanId !== null ||
      benefits.hsaEligible !== null ||
      benefits.employerRetirementPlanId !== null ||
      benefits.insuranceCoverageIds.length > 0)
  ) {
    violations.push(
      violation(
        "gameplay.benefits",
        "ambiguous_legacy_benefits",
        "legacy-unknown benefits cannot claim a selected plan or coverage",
      ),
    );
  }
  if (
    benefits.status === "selected" &&
    (benefits.healthPlanId === null || benefits.hsaEligible === null)
  ) {
    violations.push(
      violation(
        "gameplay.benefits",
        "incomplete_benefits_selection",
        "selected benefits require a health plan and explicit HSA eligibility",
      ),
    );
  }
  const termDebtIds = debts.termDebts.map(({ id }) => id);
  if (new Set(termDebtIds).size !== termDebtIds.length) {
    violations.push(
      violation(
        "gameplay.debts.termDebts",
        "duplicate_debt",
        "term debt ids must be unique",
      ),
    );
  }
  if (new Set(state.gameplay.eventLifecycle.activeStoryIds).size !== state.gameplay.eventLifecycle.activeStoryIds.length) {
    violations.push(
      violation("gameplay.eventLifecycle.activeStoryIds", "duplicate_story", "active story ids must be unique"),
    );
  }
  const cooldownTemplateIds = state.gameplay.eventLifecycle.cooldowns.map(
    ({ templateId }) => templateId,
  );
  if (new Set(cooldownTemplateIds).size !== cooldownTemplateIds.length) {
    violations.push(
      violation("gameplay.eventLifecycle.cooldowns", "duplicate_cooldown", "each template may have one cooldown"),
    );
  }

  return violations;
}

export function assertValidGameStateV2(state: GameStateV2): void {
  const violations = validateGameStateV2(state);
  if (violations.length > 0) throw new InvalidGameStateV2Error(violations);
}

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
      catalogs: {
        location: { id: state.player.locationId, version: LEGACY_CATALOG_VERSION },
        career: { id: state.player.careerTrackId, version: LEGACY_CATALOG_VERSION },
        household: { id: "legacy-household", version: LEGACY_CATALOG_VERSION },
        benefits: { id: "legacy-benefits", version: LEGACY_CATALOG_VERSION },
        scenario: { id: "legacy-scenario", version: LEGACY_CATALOG_VERSION },
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
        pendingEventId: null,
        activeStoryIds: [],
        cooldowns: [],
      },
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
