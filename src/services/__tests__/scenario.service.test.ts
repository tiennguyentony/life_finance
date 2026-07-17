import { describe, expect, it } from "vitest";

import {
  getBigCityScenario,
  resolveBigCityEvent,
  runBigCityFastForward,
} from "../scenario.service";

describe("Big City Survivor scenario service", () => {
  it("returns the documented Month 1 starting state", async () => {
    const state = await getBigCityScenario({ delayMs: 0 });

    expect(state).toMatchObject({
      scenarioId: "big-city-survivor",
      currentMonth: 1,
      totalMonths: 24,
      calendarLabel: "July 2026",
      attemptNumber: 1,
      maximumAttempts: 3,
    });
    expect(state.player).toMatchObject({
      age: 24,
      location: "San Francisco, California",
      career: "Junior Software Engineer",
    });
    expect(state.financial).toMatchObject({
      cash: 12000,
      monthlySurplus: 250,
      cashRunwayMonths: 2,
      netWorth: -5500,
    });
  });

  it("returns a mocked monthly result and the first authored newspaper event", async () => {
    const starting = await getBigCityScenario({ delayMs: 0 });
    const result = await runBigCityFastForward(starting, { delayMs: 0 });

    expect(result.state.currentMonth).toBe(2);
    expect(result.state.financial.cash).toBe(12850);
    expect(result.changes.map((change) => change.id)).toEqual([
      "salary",
      "expenses",
      "debt-payment",
      "emergency-savings",
      "index-investment",
    ]);
    expect(result.event).toMatchObject({
      id: "small-stuff-multiplies",
      host: "GM Pengo",
      weaknessTested: "Lifestyle creep and limited monthly surplus",
    });
    expect(result.event.decisions).toHaveLength(3);
  });

  it("returns deterministic but meaningfully different event outcomes", async () => {
    const starting = await getBigCityScenario({ delayMs: 0 });
    const turn = await runBigCityFastForward(starting, { delayMs: 0 });

    const trimmed = await resolveBigCityEvent(
      turn.state,
      turn.event,
      "trim-costs",
      { delayMs: 0 },
    );
    const credited = await resolveBigCityEvent(
      turn.state,
      turn.event,
      "use-credit",
      { delayMs: 0 },
    );

    expect(trimmed.state.financial.monthlySurplus).toBe(370);
    expect(trimmed.state.financial.vulnerability.score).toBe(56);
    expect(credited.state.financial.creditCardDebt).toBe(3130);
    expect(credited.state.financial.availableCredit).toBe(6870);
    expect(credited.state.financial.vulnerability.score).toBe(72);
  });

  it("rejects an unknown response without mutating the confirmed state", async () => {
    const starting = await getBigCityScenario({ delayMs: 0 });
    const turn = await runBigCityFastForward(starting, { delayMs: 0 });
    const before = JSON.stringify(turn.state);

    await expect(
      resolveBigCityEvent(
        turn.state,
        turn.event,
        "not-a-response",
        { delayMs: 0 },
      ),
    ).rejects.toThrow("Unknown event decision");
    expect(JSON.stringify(turn.state)).toBe(before);
  });
});
