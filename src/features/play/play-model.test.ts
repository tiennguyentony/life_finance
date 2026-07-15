import { describe, expect, it } from "vitest";

import { buildCreateRequest, dollarsToCents, percentToPpm } from "./play-model";

describe("developer play UI model", () => {
  it("builds a catalog-compatible starter request", () => {
    const request = buildCreateRequest("nurse", 85_000, 20_000, "test-seed");

    expect(request).toMatchObject({
      schemaVersion: 2,
      startMonth: "2026-07",
      locationId: "location.austin",
      careerId: "career.nurse",
      benefitsPackageId: "benefits.essential_worker",
      annualGrossSalaryCents: 8_500_000,
      finances: { cashCents: 2_000_000 },
    });
  });

  it("converts player-facing dollars and percentages to exact wire units", () => {
    expect(dollarsToCents(123.45)).toBe(12_345);
    expect(percentToPpm(7.5)).toBe(75_000);
    expect(dollarsToCents(Number.NaN)).toBe(0);
    expect(percentToPpm(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

