import { describe, expect, it } from "vitest";

import { safeAuthRedirectPath } from "../auth-redirect";

describe("safeAuthRedirectPath", () => {
  it("accepts only the closed post-auth destination set", () => {
    expect(safeAuthRedirectPath("/auth/complete")).toBe("/auth/complete");
    expect(safeAuthRedirectPath("/start")).toBe("/start");
  });

  it("rejects external, protocol-relative, and missing redirects", () => {
    expect(safeAuthRedirectPath(null)).toBe("/auth/complete");
    expect(safeAuthRedirectPath("https://attacker.test")).toBe(
      "/auth/complete",
    );
    expect(safeAuthRedirectPath("//attacker.test/path")).toBe(
      "/auth/complete",
    );
    expect(safeAuthRedirectPath("/\\attacker.test/path")).toBe(
      "/auth/complete",
    );
  });
});
