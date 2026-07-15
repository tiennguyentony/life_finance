import { describe, expect, it } from "vitest";

import { randomState } from "./domain/rng";
import {
  marketSimulationState,
  REGIME_TRANSITION_PPM,
  simulateMarketMonth,
  validateTransitionMatrix,
  type MarketSimulationState,
} from "./market";

describe("market regime model", () => {
  it("uses valid integer transition probabilities", () => {
    expect(() => validateTransitionMatrix()).not.toThrow();
    for (const row of Object.values(REGIME_TRANSITION_PPM)) {
      expect(Object.values(row).reduce((sum, value) => sum + value, 0)).toBe(
        1_000_000,
      );
    }
  });

  it("has a fixed first-month compatibility vector", () => {
    const result = simulateMarketMonth(
      marketSimulationState("expansion", randomState("market-golden")),
    );

    expect(result).toEqual({
      month: {
        modelVersion: "regime-v1",
        regime: "expansion",
        nextRegime: "expansion",
        equityReturnPpm: 3_000,
        bondReturnPpm: 4_000,
        cashReturnPpm: 300,
        housingReturnPpm: -3_000,
        inflationPpm: 1_300,
        laborDemandChangePpm: 500,
        shocks: {
          macro: -1,
          equityIdiosyncratic: 1,
          bondIdiosyncratic: 0,
          housingIdiosyncratic: -1,
        },
      },
      nextState: {
        modelVersion: "regime-v1",
        regime: "expansion",
        monthsInRegime: 1,
        random: { algorithm: "mulberry32-v1", value: 64_386_242 },
      },
    });
  });

  it("replays a long path exactly from the same serialized state", () => {
    function path(): unknown[] {
      let state: MarketSimulationState = marketSimulationState(
        "expansion",
        randomState(42),
      );
      const months: unknown[] = [];
      for (let month = 0; month < 240; month += 1) {
        const result = simulateMarketMonth(state);
        months.push(result.month);
        state = result.nextState;
      }
      return [months, state];
    }

    expect(path()).toEqual(path());
  });

  it("keeps all rates bounded and serializable across regime changes", () => {
    let state = marketSimulationState("inflation", randomState("bounds"));
    const visited = new Set([state.regime]);

    for (let index = 0; index < 1_000; index += 1) {
      const result = simulateMarketMonth(state);
      for (const value of [
        result.month.equityReturnPpm,
        result.month.bondReturnPpm,
        result.month.cashReturnPpm,
        result.month.housingReturnPpm,
        result.month.inflationPpm,
        result.month.laborDemandChangePpm,
      ]) {
        expect(Number.isSafeInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(-500_000);
        expect(value).toBeLessThanOrEqual(500_000);
      }
      visited.add(result.nextState.regime);
      state = JSON.parse(JSON.stringify(result.nextState));
    }

    expect(visited.size).toBeGreaterThan(1);
  });

  it("rejects invalid model state", () => {
    expect(() =>
      marketSimulationState("expansion", randomState(1), -1),
    ).toThrow(/months in regime/);
  });
});
