import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm, type RatePpm } from "../domain/money";
import type { GameStateV2 } from "../game-state-v2";
import {
  advanceCumulativePriceIndexV2,
  calculateMonthlyLivingCostInflationV2,
  currentCumulativePriceIndexPpmV2,
} from "../inflation-v2";

function stateWithIndex(cumulativePriceIndexPpm?: number): GameStateV2 {
  const market = {
    modelVersion: "regime-v1" as const,
    monthsInRegime: 0,
    ...(cumulativePriceIndexPpm === undefined
      ? {}
      : { cumulativePriceIndexPpm }),
  };
  return { gameplay: { market } } as unknown as GameStateV2;
}

describe("v2 living-cost inflation", () => {
  it.each([
    [10_000, 12_000, 1_000],
    [0, 0, 0],
    [-10_000, -12_000, -1_000],
  ])(
    "calculates annual and monthly obligation changes at %i PPM",
    (inflationPpm, annualIncreaseCents, monthlyIncreaseCents) => {
      expect(
        calculateMonthlyLivingCostInflationV2(
          moneyCents(1_200_000),
          ratePpm(inflationPpm),
        ),
      ).toEqual({
        annualIncreaseCents,
        monthlyObligationIncreaseCents: monthlyIncreaseCents,
      });
    },
  );
});

describe("v2 cumulative price index", () => {
  it("compounds positive and negative inflation with half-away rounding", () => {
    expect(
      advanceCumulativePriceIndexV2(1_000_001, ratePpm(500_000)),
    ).toBe(1_500_002);
    expect(
      advanceCumulativePriceIndexV2(1_000_001, ratePpm(-500_000)),
    ).toBe(500_001);
  });

  it("selects one PPM for old v2 state without adding or mutating state", () => {
    const oldState = stateWithIndex();
    const before = JSON.stringify(oldState);

    expect(currentCumulativePriceIndexPpmV2(oldState)).toBe(1_000_000);
    expect(JSON.stringify(oldState)).toBe(before);
    expect("cumulativePriceIndexPpm" in oldState.gameplay.market).toBe(false);
    expect(currentCumulativePriceIndexPpmV2(stateWithIndex(1_234_567))).toBe(
      1_234_567,
    );
  });

  it("rejects non-positive or unsafe index inputs and multipliers", () => {
    expect(() =>
      advanceCumulativePriceIndexV2(0, ratePpm(1)),
    ).toThrow();
    expect(() =>
      advanceCumulativePriceIndexV2(-1, ratePpm(1)),
    ).toThrow();
    expect(() =>
      advanceCumulativePriceIndexV2(
        Number.MAX_SAFE_INTEGER + 1,
        ratePpm(1),
      ),
    ).toThrow();
    expect(() =>
      advanceCumulativePriceIndexV2(1_000_000, ratePpm(-1_000_000)),
    ).toThrow();
    expect(() =>
      advanceCumulativePriceIndexV2(
        1_000_000,
        Number.MAX_SAFE_INTEGER as RatePpm,
      ),
    ).toThrow();
    expect(() =>
      advanceCumulativePriceIndexV2(
        Number.MAX_SAFE_INTEGER,
        ratePpm(1_000_000),
      ),
    ).toThrow();
  });
});
