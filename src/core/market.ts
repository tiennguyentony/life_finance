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
