import { safeBigIntToNumber } from "./domain/integer";
import { moneyCents, type MoneyCents, type RatePpm } from "./domain/money";
import {
  compareMonths,
  simulationMonth,
  type SimulationMonth,
} from "./domain/month";
import { randomState, type RandomState } from "./domain/rng";

export const GAME_STATE_SCHEMA_VERSION = 1 as const;
export const ENGINE_VERSION = "4.0.0" as const;

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

export type GameOutcome = Readonly<{
  kind: "financial_independence" | "retirement_age" | "bankruptcy";
  grade: FinalGrade;
  reachedMonth: SimulationMonth;
  reasonCode: string;
}>;

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

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }

  return value;
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
    acceptedCommandIds: [],
    outcome: null,
  };

  assertValidGameState(state);
  return deepFreeze(state) as GameState;
}

export function calculateNetWorth(finances: FinancialSnapshot): MoneyCents {
  const assets =
    BigInt(finances.cashCents) +
    BigInt(finances.taxableInvestmentsCents) +
    BigInt(finances.retirementCents) +
    BigInt(finances.homeValueCents) +
    BigInt(finances.otherInvestableAssetsCents) +
    BigInt(finances.otherAssetsCents);
  const liabilities =
    BigInt(finances.nonCreditLiabilitiesCents) + BigInt(finances.creditUsedCents);

  return moneyCents(safeBigIntToNumber(assets - liabilities, "net worth"));
}

export function calculateRemainingCredit(
  finances: FinancialSnapshot,
): MoneyCents {
  return moneyCents(finances.creditLimitCents - finances.creditUsedCents);
}

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
    BigInt(finances.taxableInvestmentsCents) +
    BigInt(finances.retirementCents) +
    BigInt(finances.otherInvestableAssetsCents);

  return moneyCents(safeBigIntToNumber(investable, "investable assets"));
}

export function hasReachedFinancialIndependence(
  finances: FinancialSnapshot,
): boolean {
  return (
    BigInt(calculateInvestableAssets(finances)) >=
    BigInt(finances.annualLivingCostCents) * BigInt(25)
  );
}
