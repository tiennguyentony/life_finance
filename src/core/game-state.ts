import { safeBigIntToNumber } from "./domain/integer";
import { moneyCents, type MoneyCents, type RatePpm } from "./domain/money";
import {
  compareMonths,
  monthsBetween,
  simulationMonth,
  type SimulationMonth,
} from "./domain/month";
import { randomState, type RandomState } from "./domain/rng";
import {
  appendTransaction,
  calculateAccountBalance,
  createLedger,
  validateLedger,
  type JournalPosting,
  type Ledger,
  type LedgerAccount,
} from "./ledger";

export const GAME_STATE_SCHEMA_VERSION = 1 as const;
export const ENGINE_VERSION = "4.0.0" as const;

const FINANCIAL_ACCOUNT_IDS = {
  cashCents: "asset.cash",
  taxableInvestmentsCents: "asset.taxable_investments",
  retirementCents: "asset.retirement",
  homeValueCents: "asset.home",
  otherInvestableAssetsCents: "asset.other_investable",
  otherAssetsCents: "asset.other",
  nonCreditLiabilitiesCents: "liability.non_credit",
  creditUsedCents: "liability.credit",
} as const satisfies Partial<Record<keyof FinancialSnapshot, string>>;

const INITIAL_LEDGER_ACCOUNTS: readonly LedgerAccount[] = [
  { id: "asset.cash", name: "Cash", category: "asset", normalBalance: "debit" },
  {
    id: "asset.taxable_investments",
    name: "Taxable investments",
    category: "asset",
    normalBalance: "debit",
  },
  {
    id: "asset.retirement",
    name: "Retirement assets",
    category: "asset",
    normalBalance: "debit",
  },
  { id: "asset.home", name: "Home", category: "asset", normalBalance: "debit" },
  {
    id: "asset.other_investable",
    name: "Other investable assets",
    category: "asset",
    normalBalance: "debit",
  },
  {
    id: "asset.other",
    name: "Other assets",
    category: "asset",
    normalBalance: "debit",
  },
  {
    id: "liability.non_credit",
    name: "Non-credit liabilities",
    category: "liability",
    normalBalance: "credit",
  },
  {
    id: "liability.credit",
    name: "Credit used",
    category: "liability",
    normalBalance: "credit",
  },
  {
    id: "equity.opening",
    name: "Opening equity",
    category: "equity",
    normalBalance: "credit",
  },
  {
    id: "equity.adjustment",
    name: "Equity adjustments",
    category: "equity",
    normalBalance: "credit",
  },
  {
    id: "income.employment",
    name: "Employment income",
    category: "income",
    normalBalance: "credit",
  },
  {
    id: "income.other",
    name: "Other income",
    category: "income",
    normalBalance: "credit",
  },
  {
    id: "expense.living",
    name: "Living expenses",
    category: "expense",
    normalBalance: "debit",
  },
  {
    id: "expense.tax",
    name: "Tax expense",
    category: "expense",
    normalBalance: "debit",
  },
  {
    id: "expense.interest",
    name: "Interest expense",
    category: "expense",
    normalBalance: "debit",
  },
];

export type MarketRegime =
  | "expansion"
  | "inflation"
  | "recession"
  | "recovery";

export type PlayerProfile = Readonly<{
  playerId: string;
  birthMonth: SimulationMonth;
  locationId: string;
  careerTrackId: string;
  filingStatus:
    | "single"
    | "married_filing_jointly"
    | "married_filing_separately"
    | "head_of_household"
    | "qualifying_surviving_spouse";
}>;

export type FinancialSnapshot = Readonly<{
  cashCents: MoneyCents;
  taxableInvestmentsCents: MoneyCents;
  retirementCents: MoneyCents;
  homeValueCents: MoneyCents;
  otherInvestableAssetsCents: MoneyCents;
  otherAssetsCents: MoneyCents;
  nonCreditLiabilitiesCents: MoneyCents;
  creditLimitCents: MoneyCents;
  creditUsedCents: MoneyCents;
  annualLivingCostCents: MoneyCents;
  requiredObligationsCents: MoneyCents;
}>;

export type WellbeingSnapshot = Readonly<{
  burnoutPpm: RatePpm;
  happinessPpm: RatePpm;
}>;

export type FinalGrade = "S" | "A" | "B" | "C" | "D" | "E" | "F";

export type LegacyGameOutcome = Readonly<{
  kind: "financial_independence" | "retirement_age" | "bankruptcy";
  grade: FinalGrade;
  reachedMonth: SimulationMonth;
  reasonCode: string;
}>;

export type OutcomeReasonCodeV1 =
  | "actual_required_obligation_shortfall"
  | "automatic_liquidity_exhausted"
  | "financial_independence_target_reached"
  | "configured_retirement_age_reached"
  | "financial_independence_target_not_reached";

export type DeterministicGameOutcomeV1 = Readonly<{
  outcomePolicyVersion: "1.0.0";
  kind: LegacyGameOutcome["kind"];
  grade: FinalGrade;
  reachedMonth: SimulationMonth;
  reasonCode: OutcomeReasonCodeV1;
  reasonCodes: readonly OutcomeReasonCodeV1[];
  financialIndependence: Readonly<{
    goalSource: "player_selected" | "current_lifestyle_default";
    investableAssetsCents: MoneyCents;
    targetCents: MoneyCents;
    progressPpm: RatePpm;
  }>;
  displayedNetWorthCents: MoneyCents;
  automaticLiquidSolvency: Readonly<{
    requiredCashCents: MoneyCents;
    automaticLiquidityCents: MoneyCents;
    residualShortfallCents: MoneyCents;
    isSolvent: boolean;
  }>;
  retirementReadiness: Readonly<{
    retirementAgeYears: number;
    currentAgeYears: number;
    reachedRetirementAge: boolean;
    gradeIfRetiredNow: Exclude<FinalGrade, "S" | "F">;
  }>;
}>;

export type GameOutcome = LegacyGameOutcome | DeterministicGameOutcomeV1;

export type GameState = Readonly<{
  schemaVersion: typeof GAME_STATE_SCHEMA_VERSION;
  engineVersion: typeof ENGINE_VERSION;
  runId: string;
  revision: number;
  startMonth: SimulationMonth;
  currentMonth: SimulationMonth;
  player: PlayerProfile;
  finances: FinancialSnapshot;
  wellbeing: WellbeingSnapshot;
  marketRegime: MarketRegime;
  random: RandomState;
  ledger: Ledger;
  acceptedCommandIds: readonly string[];
  outcome: GameOutcome | null;
}>;

export type InitialGameStateInput = Readonly<{
  runId: string;
  startMonth: string;
  player: Omit<PlayerProfile, "birthMonth"> & { readonly birthMonth: string };
  finances: FinancialSnapshot;
  wellbeing: WellbeingSnapshot;
  marketRegime?: MarketRegime;
  randomSeed: number | string;
}>;

export type StateInvariantViolation = Readonly<{
  path: string;
  code: string;
  message: string;
}>;

export class InvalidGameStateError extends Error {
  readonly violations: readonly StateInvariantViolation[];

  constructor(violations: readonly StateInvariantViolation[]) {
    super(
      `game state violates ${violations.length} invariant${violations.length === 1 ? "" : "s"}`,
    );
    this.name = "InvalidGameStateError";
    this.violations = violations;
  }
}

function isValidDeterministicOutcomeV1(
  outcome: DeterministicGameOutcomeV1,
): boolean {
  const fi = outcome.financialIndependence;
  const solvency = outcome.automaticLiquidSolvency;
  const retirement = outcome.retirementReadiness;
  const expectedReasonCodes =
    outcome.kind === "bankruptcy"
      ? [
          "actual_required_obligation_shortfall",
          "automatic_liquidity_exhausted",
        ]
      : outcome.kind === "financial_independence"
        ? ["financial_independence_target_reached"]
        : [
            "configured_retirement_age_reached",
            "financial_independence_target_not_reached",
          ];
  const validReasons =
    outcome.reasonCode === expectedReasonCodes[0] &&
    outcome.reasonCodes.length === expectedReasonCodes.length &&
    outcome.reasonCodes.every(
      (reasonCode, index) => reasonCode === expectedReasonCodes[index],
    );
  const validFinancialIndependence =
    (fi.goalSource === "player_selected" ||
      fi.goalSource === "current_lifestyle_default") &&
    Number.isSafeInteger(fi.investableAssetsCents) &&
    fi.investableAssetsCents >= 0 &&
    Number.isSafeInteger(fi.targetCents) &&
    fi.targetCents > 0 &&
    Number.isSafeInteger(fi.progressPpm) &&
    fi.progressPpm >= 0 &&
    fi.progressPpm <= 1_000_000;
  const validSolvency =
    [
      solvency.requiredCashCents,
      solvency.automaticLiquidityCents,
      solvency.residualShortfallCents,
    ].every((value) => Number.isSafeInteger(value) && value >= 0) &&
    solvency.isSolvent === (solvency.residualShortfallCents === 0);
  const validBankruptcyLiquidityArithmetic =
    outcome.kind !== "bankruptcy" ||
    (solvency.residualShortfallCents > 0 &&
      solvency.residualShortfallCents <= solvency.requiredCashCents &&
      solvency.requiredCashCents - solvency.residualShortfallCents ===
        solvency.automaticLiquidityCents);
  const validRetirement =
    Number.isSafeInteger(retirement.retirementAgeYears) &&
    retirement.retirementAgeYears >= 18 &&
    retirement.retirementAgeYears <= 120 &&
    Number.isSafeInteger(retirement.currentAgeYears) &&
    retirement.currentAgeYears >= 0 &&
    retirement.reachedRetirementAge ===
      (retirement.currentAgeYears >= retirement.retirementAgeYears) &&
    ["A", "B", "C", "D", "E"].includes(
      retirement.gradeIfRetiredNow,
    );
  const validTerminalKind =
    (outcome.kind === "bankruptcy" &&
      outcome.grade === "F" &&
      !solvency.isSolvent) ||
    (outcome.kind === "financial_independence" &&
      outcome.grade === "S" &&
      solvency.isSolvent &&
      fi.progressPpm === 1_000_000) ||
    (outcome.kind === "retirement_age" &&
      outcome.grade === retirement.gradeIfRetiredNow &&
      solvency.isSolvent &&
      retirement.reachedRetirementAge &&
      fi.progressPpm < 1_000_000);
  return (
    outcome.outcomePolicyVersion === "1.0.0" &&
    validReasons &&
    validFinancialIndependence &&
    Number.isSafeInteger(outcome.displayedNetWorthCents) &&
    validSolvency &&
    validBankruptcyLiquidityArithmetic &&
    validRetirement &&
    validTerminalKind
  );
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }

  return value;
}

export function finalizeGameState(state: GameState): GameState {
  assertValidGameState(state);
  return deepFreeze(state) as GameState;
}

function violation(
  path: string,
  code: string,
  message: string,
): StateInvariantViolation {
  return { path, code, message };
}

function validateIdentifier(
  value: string,
  path: string,
): StateInvariantViolation[] {
  if (value.length < 1 || value.length > 128) {
    return [
      violation(path, "invalid_identifier", "must contain 1 through 128 characters"),
    ];
  }

  return [];
}

export function validateGameState(
  state: GameState,
): readonly StateInvariantViolation[] {
  const violations: StateInvariantViolation[] = [];

  if (state.schemaVersion !== GAME_STATE_SCHEMA_VERSION) {
    violations.push(
      violation("schemaVersion", "unsupported_schema", "must be schema version 1"),
    );
  }
  if (state.engineVersion !== ENGINE_VERSION) {
    violations.push(
      violation("engineVersion", "unsupported_engine", "must be engine version 4.0.0"),
    );
  }
  violations.push(...validateIdentifier(state.runId, "runId"));
  violations.push(...validateIdentifier(state.player.playerId, "player.playerId"));

  if (!Number.isSafeInteger(state.revision) || state.revision < 0) {
    violations.push(
      violation("revision", "invalid_revision", "must be a non-negative safe integer"),
    );
  }
  if (state.acceptedCommandIds.length !== state.revision) {
    violations.push(
      violation(
        "acceptedCommandIds",
        "revision_mismatch",
        "must contain exactly one identifier per accepted revision",
      ),
    );
  }
  if (new Set(state.acceptedCommandIds).size !== state.acceptedCommandIds.length) {
    violations.push(
      violation(
        "acceptedCommandIds",
        "duplicate_command",
        "must not contain duplicate command identifiers",
      ),
    );
  }
  for (const [index, commandId] of state.acceptedCommandIds.entries()) {
    violations.push(
      ...validateIdentifier(commandId, `acceptedCommandIds.${index}`),
    );
  }

  try {
    simulationMonth(state.startMonth);
    simulationMonth(state.currentMonth);
    simulationMonth(state.player.birthMonth);
  } catch {
    violations.push(
      violation("month", "invalid_month", "all months must use canonical YYYY-MM"),
    );
  }

  if (compareMonths(state.startMonth, state.currentMonth) > 0) {
    violations.push(
      violation("currentMonth", "before_start", "must not be before the run start"),
    );
  }
  if (compareMonths(state.player.birthMonth, state.currentMonth) > 0) {
    violations.push(
      violation("player.birthMonth", "future_birth", "must not be in the future"),
    );
  }

  for (const [name, amount] of Object.entries(state.finances)) {
    if (!Number.isSafeInteger(amount) || amount < 0) {
      violations.push(
        violation(
          `finances.${name}`,
          "invalid_money",
          "must be a non-negative safe integer number of cents",
        ),
      );
    }
  }
  if (state.finances.creditUsedCents > state.finances.creditLimitCents) {
    violations.push(
      violation(
        "finances.creditUsedCents",
        "credit_limit_exceeded",
        "must not exceed the credit limit",
      ),
    );
  }

  for (const [name, rate] of Object.entries(state.wellbeing)) {
    if (!Number.isSafeInteger(rate) || rate < 0 || rate > 1_000_000) {
      violations.push(
        violation(
          `wellbeing.${name}`,
          "invalid_wellbeing",
          "must be between 0 and 1,000,000 PPM",
        ),
      );
    }
  }

  for (const ledgerViolation of validateLedger(state.ledger)) {
    violations.push(
      violation(
        `ledger.${ledgerViolation.path}`,
        ledgerViolation.code,
        ledgerViolation.message,
      ),
    );
  }
  for (const [financeKey, accountId] of Object.entries(FINANCIAL_ACCOUNT_IDS) as [
    keyof typeof FINANCIAL_ACCOUNT_IDS,
    string,
  ][]) {
    try {
      if (
        calculateAccountBalance(state.ledger, accountId) !==
        state.finances[financeKey]
      ) {
        violations.push(
          violation(
            `finances.${financeKey}`,
            "ledger_mismatch",
            `must reconcile with ledger account ${accountId}`,
          ),
        );
      }
    } catch {
      violations.push(
        violation(
          `ledger.accounts.${accountId}`,
          "missing_financial_account",
          `must exist to support finances.${financeKey}`,
        ),
      );
    }
  }

  if (state.outcome) {
    if (compareMonths(state.outcome.reachedMonth, state.currentMonth) > 0) {
      violations.push(
        violation(
          "outcome.reachedMonth",
          "future_outcome",
          "must not be after the current month",
        ),
      );
    }
    if (state.outcome.kind === "financial_independence" && state.outcome.grade !== "S") {
      violations.push(
        violation("outcome.grade", "invalid_fi_grade", "financial independence must grade S"),
      );
    }
    if (state.outcome.kind === "bankruptcy" && state.outcome.grade !== "F") {
      violations.push(
        violation("outcome.grade", "invalid_bankruptcy_grade", "bankruptcy must grade F"),
      );
    }
    if (
      "outcomePolicyVersion" in state.outcome &&
      !isValidDeterministicOutcomeV1(state.outcome)
    ) {
      violations.push(
        violation(
          "outcome",
          "invalid_outcome_evidence",
          "versioned outcome evidence must be bounded and internally consistent",
        ),
      );
    }
  }

  return violations;
}

export function assertValidGameState(state: GameState): void {
  const violations = validateGameState(state);
  if (violations.length > 0) {
    throw new InvalidGameStateError(violations);
  }
}

export function createInitialGameState(input: InitialGameStateInput): GameState {
  const startMonth = simulationMonth(input.startMonth);
  const ledger = createOpeningLedger(input.finances, startMonth);
  const state: GameState = {
    schemaVersion: GAME_STATE_SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    runId: input.runId,
    revision: 0,
    startMonth,
    currentMonth: startMonth,
    player: {
      ...input.player,
      birthMonth: simulationMonth(input.player.birthMonth),
    },
    finances: { ...input.finances },
    wellbeing: { ...input.wellbeing },
    marketRegime: input.marketRegime ?? "expansion",
    random: randomState(input.randomSeed),
    ledger,
    acceptedCommandIds: [],
    outcome: null,
  };

  return finalizeGameState(state);
}

function createOpeningLedger(
  finances: FinancialSnapshot,
  startMonth: SimulationMonth,
): Ledger {
  const emptyLedger = createLedger(INITIAL_LEDGER_ACCOUNTS);
  const postings: JournalPosting[] = Object.entries(FINANCIAL_ACCOUNT_IDS)
    .filter(([, accountId]) => !accountId.startsWith("liability."))
    .map(([financeKey, accountId]) => ({
      accountId,
      debitCents: finances[financeKey as keyof typeof FINANCIAL_ACCOUNT_IDS],
      creditCents: moneyCents(0),
    }))
    .concat(
      Object.entries(FINANCIAL_ACCOUNT_IDS)
        .filter(([, accountId]) => accountId.startsWith("liability."))
        .map(([financeKey, accountId]) => ({
          accountId,
          debitCents: moneyCents(0),
          creditCents: finances[financeKey as keyof typeof FINANCIAL_ACCOUNT_IDS],
        })),
    )
    .filter(
      ({ debitCents, creditCents }) => debitCents > 0 || creditCents > 0,
    );

  if (postings.length === 0) {
    return emptyLedger;
  }

  const debitTotal = postings.reduce(
    (total, posting) => total + BigInt(posting.debitCents),
    BigInt(0),
  );
  const creditTotal = postings.reduce(
    (total, posting) => total + BigInt(posting.creditCents),
    BigInt(0),
  );
  const openingEquity = debitTotal - creditTotal;
  if (openingEquity !== BigInt(0)) {
    postings.push({
      accountId: "equity.opening",
      debitCents: moneyCents(
        safeBigIntToNumber(
          openingEquity < 0 ? -openingEquity : BigInt(0),
          "opening debit",
        ),
      ),
      creditCents: moneyCents(
        safeBigIntToNumber(
          openingEquity > 0 ? openingEquity : BigInt(0),
          "opening credit",
        ),
      ),
    });
  }

  return appendTransaction(emptyLedger, {
    id: "txn.opening",
    commandId: "system.initialize",
    effectiveMonth: startMonth,
    reasonCode: "opening_balances",
    description: "Record the player's opening financial balances",
    sourceSystem: "state_initialization",
    category: "equity.opening",
    causalReference: {
      kind: "system",
      id: "run.opening",
    },
    postings,
  });
}

export function calculateTotalLiabilities(
  finances: FinancialSnapshot,
): MoneyCents {
  return moneyCents(
    safeBigIntToNumber(
      BigInt(finances.nonCreditLiabilitiesCents) +
        BigInt(finances.creditUsedCents),
      "total liabilities",
    ),
  );
}

export function calculateNetWorth(finances: FinancialSnapshot): MoneyCents {
  const assets =
    BigInt(finances.cashCents) +
    BigInt(finances.taxableInvestmentsCents) +
    BigInt(finances.retirementCents) +
    BigInt(finances.homeValueCents) +
    BigInt(finances.otherInvestableAssetsCents) +
    BigInt(finances.otherAssetsCents);
  // Keep both sides in bigint until the final net value is known. Assets and
  // liabilities may each exceed Number.MAX_SAFE_INTEGER while their exact
  // difference remains a valid MoneyCents value.
  const liabilities =
    BigInt(finances.nonCreditLiabilitiesCents) +
    BigInt(finances.creditUsedCents);

  return moneyCents(safeBigIntToNumber(assets - liabilities, "net worth"));
}

export function calculateAgeYearsAtMonth(
  birthMonth: SimulationMonth,
  currentMonth: SimulationMonth,
): number {
  return Math.floor(monthsBetween(birthMonth, currentMonth) / 12);
}

export function calculateRemainingCredit(
  finances: FinancialSnapshot,
): MoneyCents {
  return moneyCents(finances.creditLimitCents - finances.creditUsedCents);
}

/**
 * Legacy gross-liquidity selector retained for display and historical callers.
 * New v2 obligation funding must use planV2ObligationFunding so taxable sale
 * cost, exact credit use, and residual shortfall share one calculation.
 */
export function calculateAutomaticLiquidity(
  finances: FinancialSnapshot,
): MoneyCents {
  const liquidity =
    BigInt(finances.cashCents) +
    BigInt(finances.taxableInvestmentsCents) +
    BigInt(calculateRemainingCredit(finances));

  return moneyCents(
    safeBigIntToNumber(liquidity, "automatic bankruptcy liquidity"),
  );
}

export function calculateInvestableAssets(
  finances: FinancialSnapshot,
): MoneyCents {
  const investable =
    BigInt(finances.cashCents) +
    BigInt(finances.taxableInvestmentsCents) +
    BigInt(finances.retirementCents) +
    BigInt(finances.otherInvestableAssetsCents);

  return moneyCents(safeBigIntToNumber(investable, "investable assets"));
}

/** Historical schema-v1 25x outcome compatibility; not a v2 goal authority. */
export function hasReachedFinancialIndependence(
  finances: FinancialSnapshot,
): boolean {
  return (
    BigInt(calculateInvestableAssets(finances)) >=
    BigInt(finances.annualLivingCostCents) * BigInt(25)
  );
}

export function reconcileFinancesWithLedger(
  finances: FinancialSnapshot,
  ledger: Ledger,
): FinancialSnapshot {
  const reconciled = { ...finances };
  for (const [financeKey, accountId] of Object.entries(FINANCIAL_ACCOUNT_IDS) as [
    keyof typeof FINANCIAL_ACCOUNT_IDS,
    string,
  ][]) {
    reconciled[financeKey] = calculateAccountBalance(ledger, accountId);
  }
  return reconciled;
}
