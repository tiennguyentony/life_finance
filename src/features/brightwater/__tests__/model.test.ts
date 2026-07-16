import { describe, expect, it } from "vitest";

import {
  cashflowLines,
  DECISIONS,
  enumerateScenarios,
  INITIAL_ALLOCATION,
  simulateRun,
  TOTAL_MONTHS,
  type ChoiceId,
} from "../model";

const FRUGAL: readonly ChoiceId[] = ["b", "c", "c", "a", "b"];
const RECKLESS: readonly ChoiceId[] = ["c", "a", "a", "b", "c"];

describe("decision catalog", () => {
  it("has five decisions with three options each", () => {
    expect(DECISIONS).toHaveLength(5);
    for (const decision of DECISIONS) {
      expect(decision.options).toHaveLength(3);
      expect(decision.options.map(({ id }) => id)).toEqual(["a", "b", "c"]);
      expect(decision.locationId.length).toBeGreaterThan(0);
      for (const option of decision.options) {
        expect(option.label.length).toBeGreaterThan(0);
        expect(option.effectChips.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("simulateRun", () => {
  it("survives the frugal path with money left", () => {
    const run = simulateRun(FRUGAL);
    expect(run.outcome).toBe("survived");
    expect(run.finalCash).toBeGreaterThan(0);
    expect(run.months).toHaveLength(TOTAL_MONTHS);
    for (const month of run.months) {
      expect(month.cash).toBeGreaterThanOrEqual(0);
    }
  });

  it("bankrupts the reckless path before the end", () => {
    const run = simulateRun(RECKLESS);
    expect(run.outcome).toBe("bankrupt");
    expect(run.endedAtMonth).toBeLessThan(TOTAL_MONTHS);
    expect(run.months.at(-1)!.cash).toBeLessThan(0);
  });

  it("stops the timeline at the bankruptcy month", () => {
    const run = simulateRun(RECKLESS);
    expect(run.months).toHaveLength(run.endedAtMonth);
  });

  it("is deterministic for the same choices", () => {
    expect(simulateRun(FRUGAL)).toEqual(simulateRun(FRUGAL));
  });

  it("simulates partial choice lists up to the next decision point", () => {
    const run = simulateRun(["b"]);
    expect(run.outcome).toBe("playing");
    expect(run.months.length).toBe(3);
  });

  it("grows invested money when the bonus is invested", () => {
    const invested = simulateRun(["b", "c", "c", "a", "a"]);
    expect(invested.invested).toBeGreaterThan(0);
    expect(invested.netWorth).toBe(invested.finalCash + invested.invested);
  });
});

describe("enumerateScenarios", () => {
  const scenarios = enumerateScenarios();

  it("mocks all 243 scenarios", () => {
    expect(scenarios).toHaveLength(243);
    const keys = new Set(scenarios.map(({ choices }) => choices.join("")));
    expect(keys.size).toBe(243);
  });

  it("resolves every scenario as bankrupt or survived", () => {
    for (const scenario of scenarios) {
      expect(["bankrupt", "survived"]).toContain(scenario.outcome);
      if (scenario.outcome === "survived") {
        expect(scenario.finalCash).toBeGreaterThanOrEqual(0);
        expect(scenario.endedAtMonth).toBe(TOTAL_MONTHS);
      } else {
        expect(scenario.finalCash).toBeLessThan(0);
        expect(scenario.endedAtMonth).toBeLessThanOrEqual(TOTAL_MONTHS);
      }
    }
  });

  it("keeps the danger real: both endings are well represented", () => {
    const bankrupt = scenarios.filter(({ outcome }) => outcome === "bankrupt");
    expect(bankrupt.length).toBe(63);
    expect(scenarios.length - bankrupt.length).toBe(180);
    for (const scenario of bankrupt) {
      expect(scenario.endedAtMonth).toBeGreaterThanOrEqual(9);
    }
  });

  it("ends every full scenario sharing an early-bankrupt prefix identically", () => {
    const reckless = simulateRun(RECKLESS.slice(0, 3));
    expect(reckless.outcome).toBe("bankrupt");
    const prefix = RECKLESS.slice(0, 3).join("");
    const matching = scenarios.filter((scenario) =>
      scenario.choices.join("").startsWith(prefix),
    );
    expect(matching).toHaveLength(9);
    for (const scenario of matching) {
      expect(scenario.outcome).toBe("bankrupt");
      expect(scenario.endedAtMonth).toBe(reckless.endedAtMonth);
      expect(scenario.finalCash).toBe(reckless.finalCash);
    }
  });

  it("makes housing the biggest lever without deciding everything", () => {
    const sharedSurvivals = scenarios.filter(
      ({ choices, outcome }) => choices[0] === "b" && outcome === "survived",
    );
    const luxeSurvivals = scenarios.filter(
      ({ choices, outcome }) => choices[0] === "c" && outcome === "survived",
    );
    expect(sharedSurvivals.length).toBeGreaterThan(luxeSurvivals.length);
    expect(luxeSurvivals.length).toBeGreaterThan(0);
  });
});

describe("allocation", () => {
  it("starts fully liquid and sums to one", () => {
    const total =
      INITIAL_ALLOCATION.cash +
      INITIAL_ALLOCATION.index +
      INITIAL_ALLOCATION.growth +
      INITIAL_ALLOCATION.reit;
    expect(total).toBeCloseTo(1);
    expect(INITIAL_ALLOCATION.cash).toBe(1);
  });

  it("applies allocation changes only from their start month", () => {
    const invested = ["b", "c", "c", "a", "a"] as const;
    const base = simulateRun(invested);
    const lateSwitch = simulateRun(invested, {
      allocationTimeline: [
        { month: 0, allocation: INITIAL_ALLOCATION },
        { month: 13, allocation: { cash: 0, index: 1, growth: 0, reit: 0 } },
      ],
    });
    expect(lateSwitch.months.slice(0, 12)).toEqual(base.months.slice(0, 12));
    expect(lateSwitch.invested).toBeGreaterThan(base.invested);
  });

  it("moves cash into investments at the requested month", () => {
    const run = simulateRun(["b", "c", "c", "a", "b"], {
      moves: [{ month: 3, toInvested: 2_000 }],
    });
    expect(run.months[2]!.invested).toBeGreaterThanOrEqual(2_000);
    expect(run.outcome).toBe("survived");
    expect(run.netWorth).toBeGreaterThan(0);
  });
});

describe("cashflowLines", () => {
  it("sums to the run's monthly net for the same choices", () => {
    const choices = ["b", "c", "c", "b", "b"] as const;
    const run = simulateRun(choices);
    const lines = cashflowLines(choices);
    const total = lines.reduce((sum, line) => sum + line.amount, 0);
    expect(total).toBe(run.monthlyNet);
    expect(lines.some(({ label }) => label.includes("Salary"))).toBe(true);
  });

  it("only lists categories that have been decided", () => {
    const lines = cashflowLines(["b"]);
    expect(lines.some(({ label }) => label.toLowerCase().includes("room"))).toBe(true);
    expect(lines.some(({ label }) => label.toLowerCase().includes("transit"))).toBe(false);
  });
});
