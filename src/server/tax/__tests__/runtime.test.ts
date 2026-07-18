import { describe, expect, it } from "vitest";

import { TaxServiceError } from "../client";
import {
  createTaxCalculatorFromEnvironment,
  usesDeterministicTaxCalculator,
} from "../runtime";

describe("tax calculator runtime", () => {
  it("keeps PolicyEngine as the fail-closed default", () => {
    expect(() => createTaxCalculatorFromEnvironment({})).toThrow(
      TaxServiceError,
    );
    expect(
      usesDeterministicTaxCalculator({ TAX_CALCULATOR_MODE: "policyengine" }),
    ).toBe(false);
  });

  it("allows an explicit deterministic deployment without service credentials", () => {
    expect(
      usesDeterministicTaxCalculator({ TAX_CALCULATOR_MODE: "deterministic" }),
    ).toBe(true);
    expect(
      createTaxCalculatorFromEnvironment({
        TAX_CALCULATOR_MODE: "deterministic",
      }),
    ).toBeDefined();
  });

  it("rejects unknown modes instead of silently degrading tax behavior", () => {
    expect(() =>
      usesDeterministicTaxCalculator({ TAX_CALCULATOR_MODE: "approximate" }),
    ).toThrow(/policyengine or deterministic/);
  });
});
