import { describe, expect, it } from "vitest";

import {
  PRIVACY_REDACTIONS,
  assertNoKnownSensitiveData,
  redactSensitiveText,
} from "./privacy";

describe("AI prompt privacy", () => {
  it("redacts email, government ID, labeled accounts, long card numbers, and provided names", () => {
    const report = redactSensitiveText(
      "Hung Truong uses hung@example.com, SSN 123-45-6789, checking account 1234 5678 9012, and card 4111 1111 1111 1111.",
      ["Hung Truong"],
    );

    expect(report.text).not.toContain("Hung Truong");
    expect(report.text).not.toContain("hung@example.com");
    expect(report.text).not.toContain("123-45-6789");
    expect(report.text).not.toContain("4111");
    expect(report.text).toContain(PRIVACY_REDACTIONS.name);
    expect(report.counts).toEqual({ email: 1, accountNumber: 2, governmentId: 1, name: 1 });
  });

  it("preserves ordinary financial amounts and years", () => {
    const report = redactSensitiveText(
      "I earn $120,000, have $25,000 in cash, and plan to retire in 2055.",
    );
    expect(report.text).toBe(
      "I earn $120,000, have $25,000 in cash, and plan to retire in 2055.",
    );
    expect(report.counts).toEqual({ email: 0, accountNumber: 0, governmentId: 0, name: 0 });
  });

  it("redacts names case-insensitively without replacing substrings", () => {
    const report = redactSensitiveText("Ann said ANN saves annually.", ["Ann"]);
    expect(report.text).toBe("[REDACTED_NAME] said [REDACTED_NAME] saves annually.");
    expect(report.counts.name).toBe(2);
  });

  it("blocks structured payloads containing known sensitive identifiers", () => {
    expect(() => assertNoKnownSensitiveData({ note: "email me at me@example.com" })).toThrow(
      "unredacted sensitive data",
    );
    expect(() => assertNoKnownSensitiveData({ amount: "$12,000" })).not.toThrow();
  });
});
