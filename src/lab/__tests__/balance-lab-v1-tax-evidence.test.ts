import { describe, expect, it } from "vitest";

import {
  createPreResolvedPolicyEngineTaxEvidenceSourceV1,
} from "../balance-lab-v1-tax-evidence";

describe("offline balance lab external tax evidence", () => {
  it("accepts an explicit pre-resolved PolicyEngine tape and preflights year coverage", () => {
    const source = createPreResolvedPolicyEngineTaxEvidenceSourceV1({
      version: "policyengine-evidence-tape-v1",
      provider: "PolicyEngine US",
      bundleVersion: "4.21.0",
      rulesVersion: "1.764.6",
      rows: [{
        economicYear: 2026,
        annualGrossIncomeCents: 12_000_000,
        annualEmployee401kCents: 0,
        annualEmployeeHsaCents: 0,
        annualTotalTaxCents: 2_400_000,
      }],
    });

    expect(source.version).toBe("policyengine-live-v1");
    expect(source.evidenceFingerprint()).toMatch(/^[a-f0-9]{64}$/);
    expect(() => source.preflight?.({
      version: "offline-balance-lab-v1",
      experimentId: "external-evidence",
      personaIds: ["healthy-v1"],
      matchedSeeds: [1],
      botIds: ["cash-hoarder-v1"],
      horizonMonths: 1,
      difficulty: "normal",
    })).not.toThrow();
    expect(() => source.preflight?.({
      version: "offline-balance-lab-v1",
      experimentId: "external-evidence",
      personaIds: ["healthy-v1"],
      matchedSeeds: [1],
      botIds: ["cash-hoarder-v1"],
      horizonMonths: 13,
      difficulty: "normal",
    })).toThrowError(/2027/);
  });
});
