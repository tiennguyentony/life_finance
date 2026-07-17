import { describe, expect, it } from "vitest";

import { randomState } from "../domain/rng";
import {
  DEFAULT_MACRO_MARKET_CALIBRATION_V2,
  MACRO_MARKET_CALIBRATION_V2_VERSION,
  marketHeadlineV2,
  marketSimulationStateV2,
  scaleUniformDrawToRangeV2,
  simulateMarketMonthV2,
  validateMacroMarketCalibrationV2,
  type MacroMarketDifficultyV2,
} from "../market";

describe("macro and market regime-v2", () => {
  it("validates configured transition rows, regime durations, and difficulty profiles", () => {
    expect(() =>
      validateMacroMarketCalibrationV2(DEFAULT_MACRO_MARKET_CALIBRATION_V2),
    ).not.toThrow();

    for (const regime of Object.values(
      DEFAULT_MACRO_MARKET_CALIBRATION_V2.regimes,
    )) {
      expect(
        Object.values(regime.transitionPpm).reduce(
          (total, probability) => total + probability,
          0,
        ),
      ).toBe(1_000_000);
      expect(regime.minimumDurationMonths).toBeGreaterThan(0);
      expect(regime.maximumDurationMonths).toBeGreaterThanOrEqual(
        regime.minimumDurationMonths,
      );
    }
    expect(Object.keys(DEFAULT_MACRO_MARKET_CALIBRATION_V2.difficulties)).toEqual(
      ["guided", "normal", "hard"],
    );
    expect(DEFAULT_MACRO_MARKET_CALIBRATION_V2.boundsPpm).toEqual({
      assetReturn: [-500_000, 500_000],
      inflation: [-100_000, 250_000],
      borrowingRate: [0, 500_000],
      laborDemandChange: [-500_000, 500_000],
      volatility: [0, 1_000_000],
    });

    expect(() =>
      validateMacroMarketCalibrationV2({
        ...DEFAULT_MACRO_MARKET_CALIBRATION_V2,
        boundsPpm: {
          ...DEFAULT_MACRO_MARKET_CALIBRATION_V2.boundsPpm,
          assetReturn: [500_000, -500_000],
        },
      }),
    ).toThrow(/bounds/i);
    expect(() =>
      validateMacroMarketCalibrationV2({
        ...DEFAULT_MACRO_MARKET_CALIBRATION_V2,
        regimes: {
          ...DEFAULT_MACRO_MARKET_CALIBRATION_V2.regimes,
          expansion: {
            ...DEFAULT_MACRO_MARKET_CALIBRATION_V2.regimes.expansion,
            equityMeanPpm: Number.NaN,
          },
        },
      }),
    ).toThrow(/parameter/i);
    const { recovery: recoveryProbability, ...missingRecovery } =
      DEFAULT_MACRO_MARKET_CALIBRATION_V2.regimes.expansion.transitionPpm;
    expect(() =>
      validateMacroMarketCalibrationV2({
        ...DEFAULT_MACRO_MARKET_CALIBRATION_V2,
        regimes: {
          ...DEFAULT_MACRO_MARKET_CALIBRATION_V2.regimes,
          expansion: {
            ...DEFAULT_MACRO_MARKET_CALIBRATION_V2.regimes.expansion,
            transitionPpm: {
              ...missingRecovery,
              speculativeBoom: recoveryProbability,
            } as never,
          },
        },
      }),
    ).toThrow(/transition/i);
  });

  it("produces configured regime tendencies and positive broad-sector correlation", () => {
    const sample = (regime: "expansion" | "inflation" | "recession") =>
      Array.from({ length: 1_000 }, (_, index) =>
        simulateMarketMonthV2(
          marketSimulationStateV2(
            regime,
            randomState(`macro-v2-tendency-${index}`),
            "normal",
          ),
        ).month,
      );
    const expansion = sample("expansion");
    const inflation = sample("inflation");
    const recession = sample("recession");
    const average = (values: readonly number[]) =>
      values.reduce((total, value) => total + value, 0) / values.length;

    expect(
      average(expansion.map(({ broadIndexReturnPpm }) => broadIndexReturnPpm)),
    ).toBeGreaterThan(
      average(recession.map(({ broadIndexReturnPpm }) => broadIndexReturnPpm)),
    );
    expect(
      average(expansion.map(({ laborDemandChangePpm }) => laborDemandChangePpm)),
    ).toBeGreaterThan(
      average(recession.map(({ laborDemandChangePpm }) => laborDemandChangePpm)),
    );
    expect(
      average(inflation.map(({ inflationPpm }) => inflationPpm)),
    ).toBeGreaterThan(average(expansion.map(({ inflationPpm }) => inflationPpm)));
    expect(
      average(inflation.map(({ borrowingRatePpm }) => borrowingRatePpm)),
    ).toBeGreaterThan(
      average(expansion.map(({ borrowingRatePpm }) => borrowingRatePpm)),
    );

    const broadAverage = average(
      expansion.map(({ broadIndexReturnPpm }) => broadIndexReturnPpm),
    );
    const sectorAverage = average(
      expansion.map(({ sectorReturnPpm }) => sectorReturnPpm),
    );
    const covariance = average(
      expansion.map(
        ({ broadIndexReturnPpm, sectorReturnPpm }) =>
          (broadIndexReturnPpm - broadAverage) *
          (sectorReturnPpm - sectorAverage),
      ),
    );
    expect(covariance).toBeGreaterThan(0);
  });

  it("replays the same correlated asset-class sequence from the same state", () => {
    function path() {
      let state = marketSimulationStateV2(
        "expansion",
        randomState("macro-v2-replay"),
        "normal",
      );
      const months = [];
      for (let index = 0; index < 120; index += 1) {
        const result = simulateMarketMonthV2(state);
        months.push(result.month);
        state = result.nextState;
      }
      return { months, state };
    }

    const first = path();
    const second = path();
    expect(first).toEqual(second);
    expect(
      first.months.some(
        (month) => month.sectorReturnPpm !== month.broadIndexReturnPpm,
      ),
    ).toBe(true);
    expect(
      first.months.some(
        (month) => month.speculativeReturnPpm !== month.broadIndexReturnPpm,
      ),
    ).toBe(true);
  });

  it("matches the frozen regime-v2 compatibility vector and JSON continuation", () => {
    const first = simulateMarketMonthV2(
      marketSimulationStateV2(
        "inflation",
        randomState("macro-v2-golden-1"),
        "normal",
        7,
      ),
    );
    const vector = {
      month: {
        regime: first.month.regime,
        nextRegime: first.month.nextRegime,
        broadIndexReturnPpm: first.month.broadIndexReturnPpm,
        sectorReturnPpm: first.month.sectorReturnPpm,
        speculativeReturnPpm: first.month.speculativeReturnPpm,
        bondReturnPpm: first.month.bondReturnPpm,
        cashReturnPpm: first.month.cashReturnPpm,
        housingReturnPpm: first.month.housingReturnPpm,
        inflationPpm: first.month.inflationPpm,
        borrowingRatePpm: first.month.borrowingRatePpm,
        laborDemandChangePpm: first.month.laborDemandChangePpm,
        volatilityPpm: first.month.volatilityPpm,
        shocks: first.month.shocks,
      },
      nextState: first.nextState,
    };
    expect(vector).toEqual({
      month: {
        regime: "inflation",
        nextRegime: "inflation",
        broadIndexReturnPpm: 4_000,
        sectorReturnPpm: 6_000,
        speculativeReturnPpm: 15_000,
        bondReturnPpm: -1_000,
        cashReturnPpm: 4_000,
        housingReturnPpm: 6_000,
        inflationPpm: 6_000,
        borrowingRatePpm: 90_000,
        laborDemandChangePpm: -1_000,
        volatilityPpm: 390_000,
        shocks: {
          macro: 0,
          broadIdiosyncratic: 1,
          sectorIdiosyncratic: 1,
          speculativeIdiosyncratic: 1,
          bondIdiosyncratic: 1,
          housingIdiosyncratic: 1,
        },
      },
      nextState: {
        modelVersion: "regime-v2",
        calibrationVersion: "us-balanced-2026-v1",
        difficulty: "normal",
        regime: "inflation",
        monthsInRegime: 8,
        random: { algorithm: "mulberry32-v1", value: 1_263_719_289 },
      },
    });

    const restored = JSON.parse(JSON.stringify(first.nextState)) as typeof first.nextState;
    expect(simulateMarketMonthV2(restored)).toEqual(
      simulateMarketMonthV2(first.nextState),
    );
  });

  it("keeps a regime through its configured minimum and exits at its maximum", () => {
    const config = DEFAULT_MACRO_MARKET_CALIBRATION_V2.regimes.recession;
    let state = marketSimulationStateV2(
      "recession",
      randomState("macro-v2-duration"),
      "normal",
      0,
    );

    for (let month = 1; month < config.minimumDurationMonths; month += 1) {
      const result = simulateMarketMonthV2(state);
      expect(result.nextState.regime).toBe("recession");
      state = result.nextState;
    }

    const forced = simulateMarketMonthV2(
      marketSimulationStateV2(
        "recession",
        randomState("macro-v2-forced-exit"),
        "normal",
        config.maximumDurationMonths - 1,
      ),
    );
    expect(forced.nextState.regime).not.toBe("recession");
    expect(forced.nextState.monthsInRegime).toBe(0);

    expect(scaleUniformDrawToRangeV2(1, 80_000)).toBe(1);
    expect(scaleUniformDrawToRangeV2(437_500, 80_000)).toBe(35_000);
    expect(scaleUniformDrawToRangeV2(437_501, 80_000)).toBe(35_001);
    expect(scaleUniformDrawToRangeV2(1_000_000, 80_000)).toBe(80_000);
  });

  it("uses explicit difficulty calibration without changing draw order", () => {
    const results = Object.fromEntries(
      (["guided", "normal", "hard"] as const).map((difficulty) => [
        difficulty,
        simulateMarketMonthV2(
          marketSimulationStateV2(
            "recession",
            randomState("macro-v2-difficulty"),
            difficulty,
          ),
        ),
      ]),
    ) as Record<MacroMarketDifficultyV2, ReturnType<typeof simulateMarketMonthV2>>;

    expect(results.guided.month.shocks).toEqual(results.normal.month.shocks);
    expect(results.normal.month.shocks).toEqual(results.hard.month.shocks);
    expect(results.guided.nextState.random).toEqual(results.hard.nextState.random);
    expect(results.guided.month.volatilityPpm).toBeLessThan(
      results.normal.month.volatilityPpm,
    );
    expect(results.normal.month.volatilityPpm).toBeLessThan(
      results.hard.month.volatilityPpm,
    );
  });

  it("emits finite bounded macro facts for different seeds", () => {
    for (const seed of [1, 2, 3, "bounded-a", "bounded-b"]) {
      let state = marketSimulationStateV2(
        "inflation",
        randomState(seed),
        "normal",
      );
      for (let index = 0; index < 240; index += 1) {
        const result = simulateMarketMonthV2(state);
        const rates = [
          result.month.broadIndexReturnPpm,
          result.month.sectorReturnPpm,
          result.month.speculativeReturnPpm,
          result.month.bondReturnPpm,
          result.month.cashReturnPpm,
          result.month.housingReturnPpm,
          result.month.inflationPpm,
          result.month.borrowingRatePpm,
          result.month.laborDemandChangePpm,
          result.month.volatilityPpm,
        ];
        expect(rates.every(Number.isSafeInteger)).toBe(true);
        expect(result.month.borrowingRatePpm).toBeGreaterThanOrEqual(0);
        expect(result.month.volatilityPpm).toBeGreaterThanOrEqual(0);
        expect(result.month.volatilityPpm).toBeLessThanOrEqual(1_000_000);
        state = result.nextState;
      }
    }
  });

  it("derives fallback narrative only from structured macro facts", () => {
    const result = simulateMarketMonthV2(
      marketSimulationStateV2(
        "recovery",
        randomState("macro-v2-headline"),
        "normal",
      ),
    );
    const narrative = marketHeadlineV2(result.month);

    expect(result.month.modelVersion).toBe("regime-v2");
    expect(result.month.calibrationVersion).toBe(
      MACRO_MARKET_CALIBRATION_V2_VERSION,
    );
    expect(narrative.regime).toBe(result.month.regime);
    expect(narrative.factIds).toEqual([
      "macro.regime",
      "macro.inflation",
      "macro.borrowing_rate",
      "macro.labor_demand",
      "macro.volatility",
    ]);
    expect(narrative.headline.length).toBeGreaterThan(0);
    expect(narrative.headline).not.toMatch(/\$|wallet|cash balance/i);
  });

  it("updates 10,000 months within a generous headless budget", () => {
    let state = marketSimulationStateV2(
      "expansion",
      randomState("macro-v2-performance"),
      "normal",
    );
    const started = performance.now();
    for (let index = 0; index < 10_000; index += 1) {
      state = simulateMarketMonthV2(state).nextState;
    }
    expect(performance.now() - started).toBeLessThan(2_000);
    expect(state.modelVersion).toBe("regime-v2");
  });
});
