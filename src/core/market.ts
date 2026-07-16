import { ratePpm, type RatePpm } from "./domain/money";
import { nextInt, type RandomState } from "./domain/rng";
import type { MarketRegime } from "./game-state";

export const MARKET_MODEL_VERSION = "regime-v1" as const;

const REGIMES: readonly MarketRegime[] = [
  "expansion",
  "inflation",
  "recession",
  "recovery",
];

type RegimeParameters = Readonly<{
  equityMeanPpm: number;
  bondMeanPpm: number;
  cashMeanPpm: number;
  housingMeanPpm: number;
  inflationMeanPpm: number;
  laborDemandMeanPpm: number;
  equityMacroSensitivityPpm: number;
  bondMacroSensitivityPpm: number;
  housingMacroSensitivityPpm: number;
  inflationMacroSensitivityPpm: number;
  laborMacroSensitivityPpm: number;
  equityIdiosyncraticPpm: number;
  bondIdiosyncraticPpm: number;
  housingIdiosyncraticPpm: number;
}>;

const PARAMETERS: Readonly<Record<MarketRegime, RegimeParameters>> = {
  expansion: {
    equityMeanPpm: 7_000,
    bondMeanPpm: 2_500,
    cashMeanPpm: 300,
    housingMeanPpm: 3_500,
    inflationMeanPpm: 2_200,
    laborDemandMeanPpm: 3_000,
    equityMacroSensitivityPpm: 9_000,
    bondMacroSensitivityPpm: -1_500,
    housingMacroSensitivityPpm: 4_000,
    inflationMacroSensitivityPpm: 900,
    laborMacroSensitivityPpm: 2_500,
    equityIdiosyncraticPpm: 5_000,
    bondIdiosyncraticPpm: 1_500,
    housingIdiosyncraticPpm: 2_500,
  },
  inflation: {
    equityMeanPpm: -2_000,
    bondMeanPpm: -3_000,
    cashMeanPpm: 4_000,
    housingMeanPpm: 3_000,
    inflationMeanPpm: 6_000,
    laborDemandMeanPpm: -1_000,
    equityMacroSensitivityPpm: 10_000,
    bondMacroSensitivityPpm: -3_000,
    housingMacroSensitivityPpm: 3_500,
    inflationMacroSensitivityPpm: 1_500,
    laborMacroSensitivityPpm: 2_000,
    equityIdiosyncraticPpm: 6_000,
    bondIdiosyncraticPpm: 2_000,
    housingIdiosyncraticPpm: 3_000,
  },
  recession: {
    equityMeanPpm: -15_000,
    bondMeanPpm: 4_000,
    cashMeanPpm: 1_000,
    housingMeanPpm: -7_000,
    inflationMeanPpm: 500,
    laborDemandMeanPpm: -12_000,
    equityMacroSensitivityPpm: 12_000,
    bondMacroSensitivityPpm: -2_500,
    housingMacroSensitivityPpm: 6_000,
    inflationMacroSensitivityPpm: 700,
    laborMacroSensitivityPpm: 5_000,
    equityIdiosyncraticPpm: 8_000,
    bondIdiosyncraticPpm: 2_500,
    housingIdiosyncraticPpm: 4_000,
  },
  recovery: {
    equityMeanPpm: 12_000,
    bondMeanPpm: 2_000,
    cashMeanPpm: 800,
    housingMeanPpm: 6_000,
    inflationMeanPpm: 2_000,
    laborDemandMeanPpm: 8_000,
    equityMacroSensitivityPpm: 11_000,
    bondMacroSensitivityPpm: -1_500,
    housingMacroSensitivityPpm: 5_000,
    inflationMacroSensitivityPpm: 800,
    laborMacroSensitivityPpm: 4_000,
    equityIdiosyncraticPpm: 7_000,
    bondIdiosyncraticPpm: 2_000,
    housingIdiosyncraticPpm: 3_500,
  },
};

export const REGIME_TRANSITION_PPM: Readonly<
  Record<MarketRegime, Readonly<Record<MarketRegime, number>>>
> = {
  expansion: {
    expansion: 920_000,
    inflation: 35_000,
    recession: 35_000,
    recovery: 10_000,
  },
  inflation: {
    expansion: 20_000,
    inflation: 900_000,
    recession: 65_000,
    recovery: 15_000,
  },
  recession: {
    expansion: 5_000,
    inflation: 5_000,
    recession: 900_000,
    recovery: 90_000,
  },
  recovery: {
    expansion: 100_000,
    inflation: 10_000,
    recession: 10_000,
    recovery: 880_000,
  },
};
for (const row of Object.values(REGIME_TRANSITION_PPM)) Object.freeze(row);
Object.freeze(REGIME_TRANSITION_PPM);

export type MarketSimulationState = Readonly<{
  modelVersion: typeof MARKET_MODEL_VERSION;
  regime: MarketRegime;
  monthsInRegime: number;
  random: RandomState;
}>;

export type MarketMonth = Readonly<{
  modelVersion: typeof MARKET_MODEL_VERSION;
  regime: MarketRegime;
  nextRegime: MarketRegime;
  equityReturnPpm: RatePpm;
  bondReturnPpm: RatePpm;
  cashReturnPpm: RatePpm;
  housingReturnPpm: RatePpm;
  inflationPpm: RatePpm;
  laborDemandChangePpm: RatePpm;
  appliedReturnModifiersPpm: MarketReturnModifiers;
  shocks: Readonly<{
    macro: -2 | -1 | 0 | 1 | 2;
    equityIdiosyncratic: -2 | -1 | 0 | 1 | 2;
    bondIdiosyncratic: -2 | -1 | 0 | 1 | 2;
    housingIdiosyncratic: -2 | -1 | 0 | 1 | 2;
  }>;
}>;

export type MarketReturnModifiers = Readonly<{
  equity: RatePpm;
  bonds: RatePpm;
  cash: RatePpm;
  housing: RatePpm;
}>;

const ZERO_MODIFIERS: MarketReturnModifiers = Object.freeze({
  equity: ratePpm(0),
  bonds: ratePpm(0),
  cash: ratePpm(0),
  housing: ratePpm(0),
});

export type MarketSimulationResult = Readonly<{
  month: MarketMonth;
  nextState: MarketSimulationState;
}>;

export class MarketDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketDomainError";
  }
}

export function assertValidMarketReturnModifiers(
  modifiers: MarketReturnModifiers,
): void {
  const expectedKeys = ["bonds", "cash", "equity", "housing"] as const;
  const keys =
    modifiers !== null && typeof modifiers === "object"
      ? Object.keys(modifiers).toSorted()
      : [];
  if (
    modifiers === null ||
    typeof modifiers !== "object" ||
    keys.length !== expectedKeys.length ||
    expectedKeys.some((key, index) => keys[index] !== key) ||
    expectedKeys.map((key) => modifiers[key]).some(
      (modifier) =>
        !Number.isSafeInteger(modifier) ||
        modifier < -500_000 ||
        modifier > 500_000,
    )
  ) {
    throw new MarketDomainError(
      "market return modifiers must remain within bounds",
    );
  }
}

export function marketSimulationState(
  regime: MarketRegime,
  random: RandomState,
  monthsInRegime = 0,
): MarketSimulationState {
  if (!REGIMES.includes(regime)) {
    throw new MarketDomainError(`unsupported market regime ${String(regime)}`);
  }
  if (!Number.isSafeInteger(monthsInRegime) || monthsInRegime < 0) {
    throw new MarketDomainError("months in regime must be a non-negative integer");
  }
  if (
    random.algorithm !== "mulberry32-v1" ||
    !Number.isInteger(random.value) ||
    random.value < 0 ||
    random.value >= 0x1_0000_0000
  ) {
    throw new MarketDomainError("market random state is invalid");
  }
  return Object.freeze({
    modelVersion: MARKET_MODEL_VERSION,
    regime,
    monthsInRegime,
    random: Object.freeze({ ...random }),
  });
}

function drawBinomialShock(state: RandomState): {
  shock: -2 | -1 | 0 | 1 | 2;
  nextState: RandomState;
} {
  const draw = nextInt(state, 0, 15);
  let value = draw.value;
  let successes = 0;
  for (let bit = 0; bit < 4; bit += 1) {
    successes += value & 1;
    value >>>= 1;
  }
  return {
    shock: (successes - 2) as -2 | -1 | 0 | 1 | 2,
    nextState: draw.nextState,
  };
}

function clampRate(value: number): RatePpm {
  return ratePpm(Math.max(-500_000, Math.min(500_000, value)));
}

function transitionRegime(
  regime: MarketRegime,
  draw: number,
): MarketRegime {
  let cumulative = 0;
  for (const candidate of REGIMES) {
    cumulative += REGIME_TRANSITION_PPM[regime][candidate];
    if (draw <= cumulative) return candidate;
  }
  throw new MarketDomainError(
    `transition row for ${regime} does not sum to 1,000,000 PPM`,
  );
}

export function simulateMarketMonth(
  state: MarketSimulationState,
  modifiers: MarketReturnModifiers = ZERO_MODIFIERS,
): MarketSimulationResult {
  if (state.modelVersion !== MARKET_MODEL_VERSION) {
    throw new MarketDomainError(`unsupported market model ${state.modelVersion}`);
  }
  marketSimulationState(state.regime, state.random, state.monthsInRegime);
  assertValidMarketReturnModifiers(modifiers);

  // Draw order is replay-critical: macro, equity, bond, housing, transition.
  const macro = drawBinomialShock(state.random);
  const equity = drawBinomialShock(macro.nextState);
  const bond = drawBinomialShock(equity.nextState);
  const housing = drawBinomialShock(bond.nextState);
  const transition = nextInt(housing.nextState, 1, 1_000_000);
  const nextRegime = transitionRegime(state.regime, transition.value);
  const parameters = PARAMETERS[state.regime];

  const month: MarketMonth = Object.freeze({
    modelVersion: MARKET_MODEL_VERSION,
    regime: state.regime,
    nextRegime,
    equityReturnPpm: clampRate(
      parameters.equityMeanPpm +
        macro.shock * parameters.equityMacroSensitivityPpm +
        equity.shock * parameters.equityIdiosyncraticPpm +
        modifiers.equity,
    ),
    bondReturnPpm: clampRate(
      parameters.bondMeanPpm +
        macro.shock * parameters.bondMacroSensitivityPpm +
        bond.shock * parameters.bondIdiosyncraticPpm + modifiers.bonds,
    ),
    cashReturnPpm: clampRate(parameters.cashMeanPpm + modifiers.cash),
    housingReturnPpm: clampRate(
      parameters.housingMeanPpm +
        macro.shock * parameters.housingMacroSensitivityPpm +
        housing.shock * parameters.housingIdiosyncraticPpm +
        modifiers.housing,
    ),
    inflationPpm: clampRate(
      parameters.inflationMeanPpm +
        macro.shock * parameters.inflationMacroSensitivityPpm,
    ),
    laborDemandChangePpm: clampRate(
      parameters.laborDemandMeanPpm +
        macro.shock * parameters.laborMacroSensitivityPpm,
    ),
    appliedReturnModifiersPpm: Object.freeze({ ...modifiers }),
    shocks: Object.freeze({
      macro: macro.shock,
      equityIdiosyncratic: equity.shock,
      bondIdiosyncratic: bond.shock,
      housingIdiosyncratic: housing.shock,
    }),
  });
  const nextState = marketSimulationState(
    nextRegime,
    transition.nextState,
    nextRegime === state.regime ? state.monthsInRegime + 1 : 0,
  );

  return Object.freeze({ month, nextState });
}

export function validateTransitionMatrix(): void {
  for (const regime of REGIMES) {
    const row = Object.values(REGIME_TRANSITION_PPM[regime]);
    if (
      row.some((probability) => !Number.isSafeInteger(probability) || probability < 0) ||
      row.reduce((total, probability) => total + probability, 0) !== 1_000_000
    ) {
      throw new MarketDomainError(
        `transition probabilities for ${regime} must total 1,000,000 PPM`,
      );
    }
  }
}

export const MACRO_MARKET_MODEL_V2_VERSION = "regime-v2" as const;
export const MACRO_MARKET_CALIBRATION_V2_VERSION =
  "us-balanced-2026-v1" as const;

export type MacroMarketDifficultyV2 = "guided" | "normal" | "hard";

type MacroMarketDifficultyCalibrationV2 = Readonly<{
  shockScalePpm: number;
  volatilityScalePpm: number;
}>;

type MacroRegimeCalibrationV2 = RegimeParameters &
  Readonly<{
    transitionPpm: Readonly<Record<MarketRegime, number>>;
    minimumDurationMonths: number;
    maximumDurationMonths: number;
    sectorMeanOffsetPpm: number;
    speculativeMeanOffsetPpm: number;
    sectorMacroSensitivityPpm: number;
    speculativeMacroSensitivityPpm: number;
    sectorIdiosyncraticPpm: number;
    speculativeIdiosyncraticPpm: number;
    borrowingRateMeanPpm: number;
    borrowingMacroSensitivityPpm: number;
    volatilityMeanPpm: number;
    volatilityShockPpm: number;
  }>;

export type MacroMarketCalibrationV2 = Readonly<{
  version: typeof MACRO_MARKET_CALIBRATION_V2_VERSION;
  regimes: Readonly<Record<MarketRegime, MacroRegimeCalibrationV2>>;
  difficulties: Readonly<
    Record<MacroMarketDifficultyV2, MacroMarketDifficultyCalibrationV2>
  >;
  boundsPpm: Readonly<{
    assetReturn: readonly [minimum: number, maximum: number];
    inflation: readonly [minimum: number, maximum: number];
    borrowingRate: readonly [minimum: number, maximum: number];
    laborDemandChange: readonly [minimum: number, maximum: number];
    volatility: readonly [minimum: number, maximum: number];
  }>;
}>;

function regimeCalibrationV2(
  regime: MarketRegime,
  values: Omit<
    MacroRegimeCalibrationV2,
    keyof RegimeParameters | "transitionPpm"
  >,
): MacroRegimeCalibrationV2 {
  return Object.freeze({
    ...PARAMETERS[regime],
    transitionPpm: REGIME_TRANSITION_PPM[regime],
    ...values,
  });
}

export const DEFAULT_MACRO_MARKET_CALIBRATION_V2: MacroMarketCalibrationV2 =
  Object.freeze({
    version: MACRO_MARKET_CALIBRATION_V2_VERSION,
    regimes: Object.freeze({
      expansion: regimeCalibrationV2("expansion", {
        minimumDurationMonths: 4,
        maximumDurationMonths: 60,
        sectorMeanOffsetPpm: 1_000,
        speculativeMeanOffsetPpm: 4_000,
        sectorMacroSensitivityPpm: 12_000,
        speculativeMacroSensitivityPpm: 20_000,
        sectorIdiosyncraticPpm: 8_000,
        speculativeIdiosyncraticPpm: 18_000,
        borrowingRateMeanPpm: 55_000,
        borrowingMacroSensitivityPpm: -2_000,
        volatilityMeanPpm: 240_000,
        volatilityShockPpm: 45_000,
      }),
      inflation: regimeCalibrationV2("inflation", {
        minimumDurationMonths: 3,
        maximumDurationMonths: 36,
        sectorMeanOffsetPpm: -2_000,
        speculativeMeanOffsetPpm: -5_000,
        sectorMacroSensitivityPpm: 14_000,
        speculativeMacroSensitivityPpm: 24_000,
        sectorIdiosyncraticPpm: 10_000,
        speculativeIdiosyncraticPpm: 22_000,
        borrowingRateMeanPpm: 90_000,
        borrowingMacroSensitivityPpm: 4_000,
        volatilityMeanPpm: 390_000,
        volatilityShockPpm: 55_000,
      }),
      recession: regimeCalibrationV2("recession", {
        minimumDurationMonths: 3,
        maximumDurationMonths: 24,
        sectorMeanOffsetPpm: -4_000,
        speculativeMeanOffsetPpm: -10_000,
        sectorMacroSensitivityPpm: 18_000,
        speculativeMacroSensitivityPpm: 30_000,
        sectorIdiosyncraticPpm: 13_000,
        speculativeIdiosyncraticPpm: 28_000,
        borrowingRateMeanPpm: 70_000,
        borrowingMacroSensitivityPpm: 1_000,
        volatilityMeanPpm: 620_000,
        volatilityShockPpm: 70_000,
      }),
      recovery: regimeCalibrationV2("recovery", {
        minimumDurationMonths: 3,
        maximumDurationMonths: 30,
        sectorMeanOffsetPpm: 2_000,
        speculativeMeanOffsetPpm: 7_000,
        sectorMacroSensitivityPpm: 15_000,
        speculativeMacroSensitivityPpm: 25_000,
        sectorIdiosyncraticPpm: 10_000,
        speculativeIdiosyncraticPpm: 22_000,
        borrowingRateMeanPpm: 60_000,
        borrowingMacroSensitivityPpm: -2_000,
        volatilityMeanPpm: 340_000,
        volatilityShockPpm: 50_000,
      }),
    }),
    difficulties: Object.freeze({
      guided: Object.freeze({
        shockScalePpm: 750_000,
        volatilityScalePpm: 800_000,
      }),
      normal: Object.freeze({
        shockScalePpm: 1_000_000,
        volatilityScalePpm: 1_000_000,
      }),
      hard: Object.freeze({
        shockScalePpm: 1_250_000,
        volatilityScalePpm: 1_200_000,
      }),
    }),
    boundsPpm: Object.freeze({
      assetReturn: Object.freeze([-500_000, 500_000] as const),
      inflation: Object.freeze([-100_000, 250_000] as const),
      borrowingRate: Object.freeze([0, 500_000] as const),
      laborDemandChange: Object.freeze([-500_000, 500_000] as const),
      volatility: Object.freeze([0, 1_000_000] as const),
    }),
  });

export type MarketSimulationStateV2 = Readonly<{
  modelVersion: typeof MACRO_MARKET_MODEL_V2_VERSION;
  calibrationVersion: typeof MACRO_MARKET_CALIBRATION_V2_VERSION;
  difficulty: MacroMarketDifficultyV2;
  regime: MarketRegime;
  monthsInRegime: number;
  random: RandomState;
}>;

export type MarketMonthV2 = Readonly<{
  modelVersion: typeof MACRO_MARKET_MODEL_V2_VERSION;
  calibrationVersion: typeof MACRO_MARKET_CALIBRATION_V2_VERSION;
  difficulty: MacroMarketDifficultyV2;
  regime: MarketRegime;
  nextRegime: MarketRegime;
  /** Compatibility alias. Broad index is the general equity channel. */
  equityReturnPpm: RatePpm;
  broadIndexReturnPpm: RatePpm;
  sectorReturnPpm: RatePpm;
  speculativeReturnPpm: RatePpm;
  bondReturnPpm: RatePpm;
  cashReturnPpm: RatePpm;
  housingReturnPpm: RatePpm;
  /** Monthly change in the consumer price level, in parts per million. */
  inflationPpm: RatePpm;
  /** Annual borrowing-rate environment for new or explicitly variable debt. */
  borrowingRatePpm: RatePpm;
  laborDemandChangePpm: RatePpm;
  /** Bounded 0..1,000,000 market-volatility condition score. */
  volatilityPpm: RatePpm;
  appliedReturnModifiersPpm: MarketReturnModifiers;
  shocks: Readonly<{
    macro: -2 | -1 | 0 | 1 | 2;
    broadIdiosyncratic: -2 | -1 | 0 | 1 | 2;
    sectorIdiosyncratic: -2 | -1 | 0 | 1 | 2;
    speculativeIdiosyncratic: -2 | -1 | 0 | 1 | 2;
    bondIdiosyncratic: -2 | -1 | 0 | 1 | 2;
    housingIdiosyncratic: -2 | -1 | 0 | 1 | 2;
  }>;
}>;

export type MarketSimulationResultV2 = Readonly<{
  month: MarketMonthV2;
  nextState: MarketSimulationStateV2;
}>;

export type SupportedMarketMonth = MarketMonth | MarketMonthV2;
export type SupportedMarketSimulationResult = Readonly<{
  month: SupportedMarketMonth;
  nextState: MarketSimulationState | MarketSimulationStateV2;
}>;

function scaled(value: number, scalePpm: number): number {
  return Math.round((value * scalePpm) / 1_000_000);
}

function clampBetween(value: number, minimum: number, maximum: number): RatePpm {
  return ratePpm(Math.max(minimum, Math.min(maximum, value)));
}

export function validateMacroMarketCalibrationV2(
  calibration: MacroMarketCalibrationV2,
): void {
  if (calibration.version !== MACRO_MARKET_CALIBRATION_V2_VERSION) {
    throw new MarketDomainError("unsupported macro market calibration");
  }
  for (const regime of REGIMES) {
    const configured = calibration.regimes[regime];
    if (configured === undefined) {
      throw new MarketDomainError(`missing macro market regime ${regime}`);
    }
    const { transitionPpm, ...numericParameters } = configured;
    const probabilities = Object.values(transitionPpm);
    const transitionKeys = Object.keys(transitionPpm);
    if (
      Object.values(numericParameters).some(
        (value) =>
          !Number.isSafeInteger(value) ||
          value < -2_000_000 ||
          value > 2_000_000,
      ) ||
      !Number.isSafeInteger(configured.minimumDurationMonths) ||
      !Number.isSafeInteger(configured.maximumDurationMonths) ||
      configured.minimumDurationMonths < 1 ||
      configured.maximumDurationMonths < configured.minimumDurationMonths ||
      configured.maximumDurationMonths > 120 ||
      transitionKeys.length !== REGIMES.length ||
      !REGIMES.every((candidate) => transitionKeys.includes(candidate)) ||
      probabilities.some(
        (probability) =>
          !Number.isSafeInteger(probability) || probability < 0,
      ) ||
      probabilities.reduce((total, probability) => total + probability, 0) !==
        1_000_000
    ) {
      throw new MarketDomainError(
        `invalid macro market parameter, transition, or duration for ${regime}`,
      );
    }
  }
  for (const difficultyName of ["guided", "normal", "hard"] as const) {
    const difficulty = calibration.difficulties[difficultyName];
    if (
      difficulty === undefined ||
      !Number.isSafeInteger(difficulty.shockScalePpm) ||
      difficulty.shockScalePpm < 0 ||
      difficulty.shockScalePpm > 2_000_000 ||
      !Number.isSafeInteger(difficulty.volatilityScalePpm) ||
      difficulty.volatilityScalePpm < 0 ||
      difficulty.volatilityScalePpm > 2_000_000
    ) {
      throw new MarketDomainError("invalid macro market difficulty profile");
    }
  }
  for (const boundsName of [
    "assetReturn",
    "inflation",
    "borrowingRate",
    "laborDemandChange",
    "volatility",
  ] as const) {
    const bounds = calibration.boundsPpm[boundsName];
    if (
      bounds === undefined ||
      bounds.length !== 2 ||
      !Number.isSafeInteger(bounds[0]) ||
      !Number.isSafeInteger(bounds[1]) ||
      bounds[0] < -1_000_000 ||
      bounds[1] > 1_000_000 ||
      bounds[0] > bounds[1]
    ) {
      throw new MarketDomainError("invalid macro market PPM bounds");
    }
  }
}

function assertWithinConfiguredBoundsV2(
  value: number,
  bounds: readonly [number, number],
  label: string,
): void {
  if (
    !Number.isSafeInteger(value) ||
    value < bounds[0] ||
    value > bounds[1]
  ) {
    throw new MarketDomainError(
      `${label} must be an integer within ${bounds[0]}..${bounds[1]} PPM`,
    );
  }
}

export function validateMacroMarketMonthV2(
  month: MarketMonthV2,
  calibration: MacroMarketCalibrationV2 =
    DEFAULT_MACRO_MARKET_CALIBRATION_V2,
): void {
  validateMacroMarketCalibrationV2(calibration);
  if (
    month.modelVersion !== MACRO_MARKET_MODEL_V2_VERSION ||
    month.calibrationVersion !== calibration.version ||
    !REGIMES.includes(month.regime) ||
    !REGIMES.includes(month.nextRegime) ||
    calibration.difficulties[month.difficulty] === undefined ||
    month.equityReturnPpm !== month.broadIndexReturnPpm
  ) {
    throw new MarketDomainError(
      "macro market month has invalid version, regime, difficulty, or broad-return alias",
    );
  }
  assertValidMarketReturnModifiers(month.appliedReturnModifiersPpm);
  const shocks = Object.values(month.shocks);
  if (
    shocks.length !== 6 ||
    shocks.some(
      (shock) =>
        !Number.isSafeInteger(shock) || shock < -2 || shock > 2,
    )
  ) {
    throw new MarketDomainError("macro market month has invalid shocks");
  }
  for (const [label, value] of [
    ["broad return", month.broadIndexReturnPpm],
    ["sector return", month.sectorReturnPpm],
    ["speculative return", month.speculativeReturnPpm],
    ["bond return", month.bondReturnPpm],
    ["cash return", month.cashReturnPpm],
    ["housing return", month.housingReturnPpm],
  ] as const) {
    assertWithinConfiguredBoundsV2(
      value,
      calibration.boundsPpm.assetReturn,
      label,
    );
  }
  assertWithinConfiguredBoundsV2(
    month.inflationPpm,
    calibration.boundsPpm.inflation,
    "inflation",
  );
  assertWithinConfiguredBoundsV2(
    month.borrowingRatePpm,
    calibration.boundsPpm.borrowingRate,
    "borrowing rate",
  );
  assertWithinConfiguredBoundsV2(
    month.laborDemandChangePpm,
    calibration.boundsPpm.laborDemandChange,
    "labor demand",
  );
  assertWithinConfiguredBoundsV2(
    month.volatilityPpm,
    calibration.boundsPpm.volatility,
    "volatility",
  );
}

export type MacroMarketSnapshotV2 = Readonly<{
  modelVersion: typeof MACRO_MARKET_MODEL_V2_VERSION;
  calibrationVersion: typeof MACRO_MARKET_CALIBRATION_V2_VERSION;
  macroDifficulty: MacroMarketDifficultyV2;
  observedRegime: MarketRegime;
  observedMonth: string;
  borrowingRatePpm: RatePpm;
  laborDemandChangePpm: RatePpm;
  volatilityPpm: RatePpm;
  lastInflationPpm: RatePpm;
  broadMarketReturnPpm: RatePpm;
  sectorMarketReturnPpm: RatePpm;
  speculativeMarketReturnPpm: RatePpm;
  housingReturnPpm: RatePpm;
  cashYieldPpm: RatePpm;
}>;

export function validateMacroMarketSnapshotV2(
  snapshot: MacroMarketSnapshotV2,
  calibration: MacroMarketCalibrationV2 =
    DEFAULT_MACRO_MARKET_CALIBRATION_V2,
): void {
  validateMacroMarketCalibrationV2(calibration);
  if (
    snapshot.modelVersion !== MACRO_MARKET_MODEL_V2_VERSION ||
    snapshot.calibrationVersion !== calibration.version ||
    calibration.difficulties[snapshot.macroDifficulty] === undefined ||
    !REGIMES.includes(snapshot.observedRegime) ||
    !/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(snapshot.observedMonth)
  ) {
    throw new MarketDomainError(
      "macro snapshot has invalid version, difficulty, regime, or month",
    );
  }
  for (const [label, value] of [
    ["broad return", snapshot.broadMarketReturnPpm],
    ["sector return", snapshot.sectorMarketReturnPpm],
    ["speculative return", snapshot.speculativeMarketReturnPpm],
    ["housing return", snapshot.housingReturnPpm],
    ["cash yield", snapshot.cashYieldPpm],
  ] as const) {
    assertWithinConfiguredBoundsV2(
      value,
      calibration.boundsPpm.assetReturn,
      label,
    );
  }
  assertWithinConfiguredBoundsV2(
    snapshot.lastInflationPpm,
    calibration.boundsPpm.inflation,
    "inflation",
  );
  assertWithinConfiguredBoundsV2(
    snapshot.borrowingRatePpm,
    calibration.boundsPpm.borrowingRate,
    "borrowing rate",
  );
  assertWithinConfiguredBoundsV2(
    snapshot.laborDemandChangePpm,
    calibration.boundsPpm.laborDemandChange,
    "labor demand",
  );
  assertWithinConfiguredBoundsV2(
    snapshot.volatilityPpm,
    calibration.boundsPpm.volatility,
    "volatility",
  );
}

export function marketSimulationStateV2(
  regime: MarketRegime,
  random: RandomState,
  difficulty: MacroMarketDifficultyV2,
  monthsInRegime = 0,
): MarketSimulationStateV2 {
  marketSimulationState(regime, random, monthsInRegime);
  if (!(["guided", "normal", "hard"] as const).includes(difficulty)) {
    throw new MarketDomainError("unsupported macro market difficulty");
  }
  return Object.freeze({
    modelVersion: MACRO_MARKET_MODEL_V2_VERSION,
    calibrationVersion: MACRO_MARKET_CALIBRATION_V2_VERSION,
    difficulty,
    regime,
    monthsInRegime,
    random: Object.freeze({ ...random }),
  });
}

export function scaleUniformDrawToRangeV2(
  draw: number,
  targetTotal: number,
): number {
  if (
    !Number.isSafeInteger(draw) ||
    draw < 1 ||
    draw > 1_000_000 ||
    !Number.isSafeInteger(targetTotal) ||
    targetTotal < 1 ||
    targetTotal > 1_000_000
  ) {
    throw new MarketDomainError(
      "uniform transition draw and target must be positive bounded integers",
    );
  }
  return Math.floor(((draw - 1) * targetTotal) / 1_000_000) + 1;
}

function transitionRegimeV2(
  state: MarketSimulationStateV2,
  draw: number,
  calibration: MacroMarketCalibrationV2,
): MarketRegime {
  const configured = calibration.regimes[state.regime];
  const elapsedAfterMonth = state.monthsInRegime + 1;
  if (elapsedAfterMonth < configured.minimumDurationMonths) return state.regime;
  if (elapsedAfterMonth < configured.maximumDurationMonths) {
    let cumulative = 0;
    for (const candidate of REGIMES) {
      cumulative += configured.transitionPpm[candidate];
      if (draw <= cumulative) return candidate;
    }
  }
  const nonCurrentTotal = REGIMES.filter(
    (candidate) => candidate !== state.regime,
  ).reduce(
    (total, candidate) => total + configured.transitionPpm[candidate],
    0,
  );
  if (nonCurrentTotal <= 0) {
    throw new MarketDomainError(
      `maximum duration for ${state.regime} requires an exit transition`,
    );
  }
  const exitDraw = scaleUniformDrawToRangeV2(draw, nonCurrentTotal);
  let cumulative = 0;
  for (const candidate of REGIMES) {
    if (candidate === state.regime) continue;
    cumulative += configured.transitionPpm[candidate];
    if (exitDraw <= cumulative) return candidate;
  }
  throw new MarketDomainError(`unable to transition from ${state.regime}`);
}

export function simulateMarketMonthV2(
  state: MarketSimulationStateV2,
  modifiers: MarketReturnModifiers = ZERO_MODIFIERS,
  calibration: MacroMarketCalibrationV2 =
    DEFAULT_MACRO_MARKET_CALIBRATION_V2,
): MarketSimulationResultV2 {
  validateMacroMarketCalibrationV2(calibration);
  marketSimulationStateV2(
    state.regime,
    state.random,
    state.difficulty,
    state.monthsInRegime,
  );
  if (
    state.modelVersion !== MACRO_MARKET_MODEL_V2_VERSION ||
    state.calibrationVersion !== calibration.version
  ) {
    throw new MarketDomainError("market state does not match calibration");
  }
  assertValidMarketReturnModifiers(modifiers);

  // Draw order is replay-critical: shared macro, asset-specific shocks, transition.
  const macro = drawBinomialShock(state.random);
  const broad = drawBinomialShock(macro.nextState);
  const sector = drawBinomialShock(broad.nextState);
  const speculative = drawBinomialShock(sector.nextState);
  const bond = drawBinomialShock(speculative.nextState);
  const housing = drawBinomialShock(bond.nextState);
  const transition = nextInt(housing.nextState, 1, 1_000_000);
  const configured = calibration.regimes[state.regime];
  const difficulty = calibration.difficulties[state.difficulty];
  const bounds = calibration.boundsPpm;
  const shock = (sensitivity: number, value: number) =>
    scaled(sensitivity * value, difficulty.shockScalePpm);
  const nextRegime = transitionRegimeV2(state, transition.value, calibration);
  const broadIndexReturnPpm = clampBetween(
    configured.equityMeanPpm +
      shock(configured.equityMacroSensitivityPpm, macro.shock) +
      shock(configured.equityIdiosyncraticPpm, broad.shock) +
      modifiers.equity,
    ...bounds.assetReturn,
  );
  const month: MarketMonthV2 = Object.freeze({
    modelVersion: MACRO_MARKET_MODEL_V2_VERSION,
    calibrationVersion: calibration.version,
    difficulty: state.difficulty,
    regime: state.regime,
    nextRegime,
    equityReturnPpm: broadIndexReturnPpm,
    broadIndexReturnPpm,
    sectorReturnPpm: clampBetween(
      configured.equityMeanPpm +
        configured.sectorMeanOffsetPpm +
        shock(configured.sectorMacroSensitivityPpm, macro.shock) +
        shock(configured.sectorIdiosyncraticPpm, sector.shock) +
        modifiers.equity,
      ...bounds.assetReturn,
    ),
    speculativeReturnPpm: clampBetween(
      configured.equityMeanPpm +
        configured.speculativeMeanOffsetPpm +
        shock(configured.speculativeMacroSensitivityPpm, macro.shock) +
        shock(
          configured.speculativeIdiosyncraticPpm,
          speculative.shock,
        ) +
        modifiers.equity,
      ...bounds.assetReturn,
    ),
    bondReturnPpm: clampBetween(
      configured.bondMeanPpm +
        shock(configured.bondMacroSensitivityPpm, macro.shock) +
        shock(configured.bondIdiosyncraticPpm, bond.shock) +
        modifiers.bonds,
      ...bounds.assetReturn,
    ),
    cashReturnPpm: clampBetween(
      configured.cashMeanPpm + modifiers.cash,
      ...bounds.assetReturn,
    ),
    housingReturnPpm: clampBetween(
      configured.housingMeanPpm +
        shock(configured.housingMacroSensitivityPpm, macro.shock) +
        shock(configured.housingIdiosyncraticPpm, housing.shock) +
        modifiers.housing,
      ...bounds.assetReturn,
    ),
    inflationPpm: clampBetween(
      configured.inflationMeanPpm +
        shock(configured.inflationMacroSensitivityPpm, macro.shock),
      ...bounds.inflation,
    ),
    borrowingRatePpm: clampBetween(
      configured.borrowingRateMeanPpm +
        shock(configured.borrowingMacroSensitivityPpm, macro.shock),
      ...bounds.borrowingRate,
    ),
    laborDemandChangePpm: clampBetween(
      configured.laborDemandMeanPpm +
        shock(configured.laborMacroSensitivityPpm, macro.shock),
      ...bounds.laborDemandChange,
    ),
    volatilityPpm: clampBetween(
      scaled(
        configured.volatilityMeanPpm +
          Math.abs(macro.shock) * configured.volatilityShockPpm,
        difficulty.volatilityScalePpm,
      ),
      ...bounds.volatility,
    ),
    appliedReturnModifiersPpm: Object.freeze({ ...modifiers }),
    shocks: Object.freeze({
      macro: macro.shock,
      broadIdiosyncratic: broad.shock,
      sectorIdiosyncratic: sector.shock,
      speculativeIdiosyncratic: speculative.shock,
      bondIdiosyncratic: bond.shock,
      housingIdiosyncratic: housing.shock,
    }),
  });
  validateMacroMarketMonthV2(month, calibration);
  return Object.freeze({
    month,
    nextState: marketSimulationStateV2(
      nextRegime,
      transition.nextState,
      state.difficulty,
      nextRegime === state.regime ? state.monthsInRegime + 1 : 0,
    ),
  });
}

export type MacroHeadlineV2 = Readonly<{
  modelVersion: typeof MACRO_MARKET_MODEL_V2_VERSION;
  regime: MarketRegime;
  headline: string;
  factIds: readonly [
    "macro.regime",
    "macro.inflation",
    "macro.borrowing_rate",
    "macro.labor_demand",
    "macro.volatility",
  ];
}>;

const HEADLINES_V2: Readonly<Record<MarketRegime, string>> = Object.freeze({
  expansion: "Growth remains broad as labor demand holds firm",
  inflation: "Prices and borrowing costs stay elevated",
  recession: "Demand contracts while markets remain volatile",
  recovery: "Activity improves as markets rebuild momentum",
});

export function marketHeadlineV2(month: MarketMonthV2): MacroHeadlineV2 {
  return Object.freeze({
    modelVersion: MACRO_MARKET_MODEL_V2_VERSION,
    regime: month.regime,
    headline: HEADLINES_V2[month.regime],
    factIds: Object.freeze([
      "macro.regime",
      "macro.inflation",
      "macro.borrowing_rate",
      "macro.labor_demand",
      "macro.volatility",
    ]) as MacroHeadlineV2["factIds"],
  });
}
