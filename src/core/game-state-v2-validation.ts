import { sha256Canonical } from "./canonical";
import { compareMonths, simulationMonth } from "./domain/month";
import {
  assertValidGameState,
  type GameState as GameStateV1,
  type StateInvariantViolation,
} from "./game-state";
import {
  ENGINE_V2_VERSION,
  GAME_STATE_V2_SCHEMA_VERSION,
  V1_TO_V2_MIGRATION_VERSION,
} from "./game-state-v2-constants";
import type { GameStateV2 } from "./game-state-v2";
import { validateCatalogAndBenefitsStateV2 } from "./game-state-v2-catalog-validation";
import { validateEventAndCareerStateV2 } from "./game-state-v2-event-validation";
import { validateFinancialGoal } from "./financial-goals-v2";

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

  if (state.gameplay.financialGoal !== undefined) {
    try {
      validateFinancialGoal(state.gameplay.financialGoal);
    } catch {
      violations.push(
        violation(
          "gameplay.financialGoal",
          "invalid_financial_goal",
          "FI goal must use goals-v1 with bounded spending, withdrawal rate, and age",
        ),
      );
    }
  }

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
    state.migration !== null &&
    (state.migration.sourceSchemaVersion !== 1 ||
      state.migration.sourceEngineVersion !== "4.0.0" ||
      state.migration.targetSchemaVersion !== GAME_STATE_V2_SCHEMA_VERSION ||
      state.migration.targetEngineVersion !== ENGINE_V2_VERSION ||
      state.migration.migrationVersion !== V1_TO_V2_MIGRATION_VERSION)
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
    if (
      (debt.principalCents === 0 &&
        (debt.minimumPaymentCents !== 0 || debt.remainingTermMonths !== 0)) ||
      (debt.principalCents > 0 &&
        (debt.minimumPaymentCents <= 0 || debt.remainingTermMonths <= 0))
    ) {
      violations.push(
        violation(
          `gameplay.debts.termDebts.${index}`,
          "invalid_debt_lifecycle",
          "active debt requires positive payment and term; paid debt requires both zero",
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
  if (
    state.gameplay.market.modelVersion !== "regime-v1" ||
    !Number.isSafeInteger(state.gameplay.market.monthsInRegime) ||
    state.gameplay.market.monthsInRegime < 0
  ) {
    violations.push(
      violation(
        "gameplay.market",
        "invalid_market_lifecycle",
        "market model and months in regime must be persisted",
      ),
    );
  }
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

  violations.push(...validateCatalogAndBenefitsStateV2(state));

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
  const exposure = state.gameplay.exposure;
  const exposureMonths = exposure.history.map(({ month }) => month);
  if (new Set(exposureMonths).size !== exposureMonths.length) {
    violations.push(
      violation(
        "gameplay.exposure.history",
        "duplicate_exposure_month",
        "each simulation month may have one exposure snapshot",
      ),
    );
  }
  for (const [index, snapshot] of exposure.history.entries()) {
    try {
      simulationMonth(snapshot.month);
    } catch {
      violations.push(
        violation(
          `gameplay.exposure.history.${index}.month`,
          "invalid_exposure_month",
          "exposure month must use canonical simulation time",
        ),
      );
    }
    const bounded = [
      snapshot.revolvingDebtPpm,
      snapshot.portfolioConcentrationPpm,
      snapshot.insuranceGapPpm,
      snapshot.jobInvestmentCorrelationPpm,
    ];
    if (
      !Number.isSafeInteger(snapshot.scorePpm) ||
      snapshot.scorePpm < 1_000_000 ||
      snapshot.scorePpm > 3_000_000 ||
      !Number.isSafeInteger(snapshot.emergencyFundMonthsPpm) ||
      snapshot.emergencyFundMonthsPpm < 0 ||
      snapshot.emergencyFundMonthsPpm > 12_000_000 ||
      (snapshot.debtToIncomePpm !== null &&
        (!Number.isSafeInteger(snapshot.debtToIncomePpm) ||
          snapshot.debtToIncomePpm < 0)) ||
      bounded.some(
        (value) =>
          value !== null &&
          (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000),
      )
    ) {
      violations.push(
        violation(
          `gameplay.exposure.history.${index}`,
          "invalid_exposure_metric",
          "exposure metrics must remain inside their versioned bounds",
        ),
      );
    }
  }
  if (
    (exposure.current === null) !== (exposure.history.length === 0) ||
    (exposure.current !== null &&
      (exposure.history.at(-1)?.month !== exposure.current.month ||
        sha256Canonical(exposure.history.at(-1)) !==
          sha256Canonical(exposure.current)))
  ) {
    violations.push(
      violation(
        "gameplay.exposure.current",
        "exposure_current_mismatch",
        "current exposure must equal the final historical month",
      ),
    );
  }
  violations.push(...validateEventAndCareerStateV2(state));

  return violations;
}

export function assertValidGameStateV2(state: GameStateV2): void {
  const violations = validateGameStateV2(state);
  if (violations.length > 0) throw new InvalidGameStateV2Error(violations);
}
