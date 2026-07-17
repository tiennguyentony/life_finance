import { describe, expect, it } from "vitest";

import { ratePpm } from "../domain/money";
import {
  DEFAULT_OUTCOME_POLICY_V1,
  gradeRetirementProgressV1,
  outcomePolicyForVersionV2,
} from "../outcome-policy-v2";

describe("outcome policy v1", () => {
  it.each([
    [800_000, "A"],
    [799_999, "B"],
    [600_000, "B"],
    [599_999, "C"],
    [400_000, "C"],
    [399_999, "D"],
    [200_000, "D"],
    [199_999, "E"],
    [0, "E"],
  ] as const)("grades %i PPM as %s", (progressPpm, grade) => {
    expect(
      gradeRetirementProgressV1(ratePpm(progressPpm), "1.0.0"),
    ).toBe(grade);
  });

  it("resolves the persisted version through the authoritative registry", () => {
    expect(outcomePolicyForVersionV2("1.0.0")).toBe(
      DEFAULT_OUTCOME_POLICY_V1,
    );
    expect(outcomePolicyForVersionV2("1.0.0")).toMatchObject({
      version: "1.0.0",
      retirementAgeYears: 65,
    });
    expect(() =>
      outcomePolicyForVersionV2("invented" as "1.0.0"),
    ).toThrow(/unsupported/);
  });
});
