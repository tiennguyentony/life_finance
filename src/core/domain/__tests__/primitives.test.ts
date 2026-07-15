import { describe, expect, it } from "vitest";

import {
  addMoney,
  allocateMoney,
  moneyCents,
  multiplyMoneyByRate,
  ratePpm,
} from "../money";
import {
  addMonths,
  compareMonths,
  monthsBetween,
  simulationMonth,
} from "../month";
import { nextInt, nextUint32, randomState } from "../rng";

describe("exact money and rates", () => {
  it("uses exact cents and detects unsafe arithmetic", () => {
    expect(addMoney(moneyCents(105), moneyCents(95))).toBe(200);
    expect(() =>
      addMoney(moneyCents(Number.MAX_SAFE_INTEGER), moneyCents(1)),
    ).toThrow(/safe integer range/);
    expect(() => moneyCents(0.5)).toThrow(/safe integer/);
  });

  it("rounds rate multiplication halfway away from zero", () => {
    const half = ratePpm(500_000);

    expect(multiplyMoneyByRate(moneyCents(1), half)).toBe(1);
    expect(multiplyMoneyByRate(moneyCents(-1), half)).toBe(-1);
    expect(multiplyMoneyByRate(moneyCents(3), half)).toBe(2);
    expect(multiplyMoneyByRate(moneyCents(-3), half)).toBe(-2);
    expect(allocateMoney(moneyCents(5), 1, 2)).toBe(3);
  });

  it("does not lose precision in intermediate multiplication", () => {
    expect(
      multiplyMoneyByRate(
        moneyCents(Number.MAX_SAFE_INTEGER),
        ratePpm(1),
      ),
    ).toBe(9_007_199_255);
  });
});

describe("simulation months", () => {
  it("validates canonical months and performs timezone-free arithmetic", () => {
    const december = simulationMonth("2026-12");

    expect(addMonths(december, 1)).toBe("2027-01");
    expect(addMonths(december, -12)).toBe("2025-12");
    expect(monthsBetween(simulationMonth("2026-01"), december)).toBe(11);
    expect(compareMonths(simulationMonth("2026-01"), december)).toBe(-1);
  });

  it("rejects ambiguous or out-of-range calendar values", () => {
    expect(() => simulationMonth("2026-1")).toThrow(/YYYY-MM/);
    expect(() => simulationMonth("2026-13")).toThrow(/YYYY-MM/);
    expect(() => addMonths(simulationMonth("9999-12"), 1)).toThrow(
      /outside year/,
    );
  });
});

describe("seeded random generation", () => {
  it("produces a stable sequence and serializable continuation state", () => {
    const first = nextUint32(randomState(1));
    const second = nextUint32(first.nextState);
    const resumedSecond = nextUint32(JSON.parse(JSON.stringify(first.nextState)));

    expect([first.value, second.value]).toEqual([2_693_262_067, 11_749_833]);
    expect(resumedSecond).toEqual(second);
  });

  it("maps draws into inclusive integer bounds deterministically", () => {
    const first = nextInt(randomState("life-finance"), 5, 10);
    const repeated = nextInt(randomState("life-finance"), 5, 10);

    expect(first).toEqual(repeated);
    expect(first.value).toBeGreaterThanOrEqual(5);
    expect(first.value).toBeLessThanOrEqual(10);
  });

  it("rejects invalid state and bounds", () => {
    expect(() => nextInt(randomState(1), 2, 1)).toThrow(/bounds/);
    expect(() => randomState(Number.POSITIVE_INFINITY)).toThrow(/safe integer/);
  });
});
