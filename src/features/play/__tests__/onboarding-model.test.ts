import { describe, expect, it } from "vitest";

import {
  cashRangeDollars,
  playerPresetFromPersonaV1,
  salaryRangeDollars,
  selectionForCareer,
  selectionForPreset,
  selectionForScenario,
} from "../onboarding-model";

describe("onboarding catalog projection", () => {
  it("projects the UI helper from the authoritative core persona fixture", () => {
    expect(playerPresetFromPersonaV1("software")).toMatchObject({
      selection: {
        birthMonth: "1995-01",
        locationId: "location.seattle",
        careerId: "career.software",
      },
      salaryDollars: 120_000,
      defaultCashDollars: 25_000,
    });
  });

  it("derives the exact localized salary and scenario cash bounds", () => {
    expect(salaryRangeDollars("career.software", "location.seattle")).toEqual({
      minimum: 106_250,
      maximum: 181_250,
      recommended: 144_000,
    });
    expect(cashRangeDollars("scenario.established_household")).toEqual({
      minimum: 5_000,
      maximum: 100_000,
    });
  });

  it("moves benefit dependencies together when career changes", () => {
    const changed = selectionForCareer(
      selectionForPreset("software"),
      "career.teacher",
    );

    expect(changed).toMatchObject({
      careerId: "career.teacher",
      benefitsPackageId: "benefits.public_service",
      retirementPlanId: "retirement.403b_public",
      healthPlanId: "health.hdhp_hsa",
    });
  });

  it("preserves an explicit health waiver and repairs incompatible households", () => {
    const waived = {
      ...selectionForPreset("software"),
      healthPlanId: null,
    };
    expect(selectionForCareer(waived, "career.nurse").healthPlanId).toBeNull();
    expect(
      selectionForScenario(waived, "scenario.established_household").householdId,
    ).toBe("household.married");
  });
});
