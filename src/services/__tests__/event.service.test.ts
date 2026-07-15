import { describe, expect, it } from "vitest";

import {
  getDecisionOptions,
  getNextEvent,
  submitDecision,
} from "../event.service";

describe("event service", () => {
  it("returns four strategic decisions", async () => {
    const decisions = await getDecisionOptions({ delayMs: 0 });

    expect(decisions.map((decision) => decision.id)).toEqual([
      "emergency-fund",
      "pay-card",
      "invest-cash",
      "upgrade-life",
    ]);
  });

  it("returns a predefined dashboard snapshot for a decision", async () => {
    const result = await submitDecision("pay-card", { delayMs: 0 });

    expect(result.decisionId).toBe("pay-card");
    expect(result.dashboard.cash.value).toBe("$2,640");
    expect(result.dashboard.debt.value).toBe("$27,400");
  });

  it("returns a mocked event consequence without calculating in the UI", async () => {
    const result = await getNextEvent("pay-card", { delayMs: 0 });

    expect(result.event.title).toBe("Car repair ambush");
    expect(result.changes).toContainEqual({
      label: "Cash",
      before: "$2,640",
      after: "$1,440",
      direction: "down",
    });
    expect(result.dashboard.cash.value).toBe("$1,440");
  });

  it("rejects an unknown decision instead of returning a false success", async () => {
    await expect(
      submitDecision("made-up-decision", { delayMs: 0 }),
    ).rejects.toThrow("Unknown decision");
  });
});
