import { describe, expect, it } from "vitest";

import { easeOutQuint } from "../use-animated-number";
import {
  cycleTab,
  formatMonthLabel,
  formatOutflow,
  signedMoney,
} from "../play-support";

describe("formatMonthLabel", () => {
  it("humanizes engine months", () => {
    expect(formatMonthLabel("2026-07")).toBe("Jul 2026");
    expect(formatMonthLabel("2031-01")).toBe("Jan 2031");
    expect(formatMonthLabel("2031-12")).toBe("Dec 2031");
  });

  it("falls back to the raw value when the month is malformed", () => {
    expect(formatMonthLabel("2026-13")).toBe("2026-13");
    expect(formatMonthLabel("later")).toBe("later");
  });
});

describe("signedMoney", () => {
  it("labels inflows, outflows, and zero with a tone", () => {
    expect(signedMoney(250_00)).toEqual({
      tone: "positive",
      label: "+$250",
    });
    expect(signedMoney(-1_234_00)).toEqual({
      tone: "negative",
      label: "-$1,234",
    });
    expect(signedMoney(0)).toEqual({ tone: "neutral", label: "$0" });
  });
});

describe("formatOutflow", () => {
  it("renders positive cents as an outflow and negatives as inflow", () => {
    expect(formatOutflow(50_00)).toBe("-$50");
    expect(formatOutflow(-50_00)).toBe("+$50");
    expect(formatOutflow(0)).toBe("$0");
  });
});

describe("cycleTab", () => {
  const tabs = ["overview", "strategy", "actions", "learn"] as const;

  it("moves right and left with wrap-around", () => {
    expect(cycleTab(tabs, "overview", "ArrowRight")).toBe("strategy");
    expect(cycleTab(tabs, "learn", "ArrowRight")).toBe("overview");
    expect(cycleTab(tabs, "overview", "ArrowLeft")).toBe("learn");
  });

  it("supports Home and End", () => {
    expect(cycleTab(tabs, "actions", "Home")).toBe("overview");
    expect(cycleTab(tabs, "strategy", "End")).toBe("learn");
  });

  it("ignores unrelated keys and unknown tabs", () => {
    expect(cycleTab(tabs, "actions", "Enter")).toBe("actions");
    expect(cycleTab(tabs, "missing" as never, "ArrowRight")).toBe("missing");
  });
});

describe("easeOutQuint", () => {
  it("starts at zero, ends at one, and never decreases", () => {
    expect(easeOutQuint(0)).toBe(0);
    expect(easeOutQuint(1)).toBe(1);
    let previous = 0;
    for (let step = 0; step <= 100; step += 1) {
      const eased = easeOutQuint(step / 100);
      expect(eased).toBeGreaterThanOrEqual(previous);
      previous = eased;
    }
  });
});
