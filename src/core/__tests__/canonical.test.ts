import { describe, expect, it } from "vitest";

import { canonicalJson, sha256Canonical } from "../canonical";
import { moneyCents, ratePpm } from "../domain/money";
import { createInitialGameState } from "../game-state";

function state(seed: string) {
  return createInitialGameState({
    runId: "run_checksum",
    startMonth: "2026-07",
    randomSeed: seed,
    player: {
      playerId: "player_checksum",
      birthMonth: "1990-01",
      locationId: "US-WA",
      careerTrackId: "teacher",
      filingStatus: "single",
    },
    finances: {
      cashCents: moneyCents(100_00),
      taxableInvestmentsCents: moneyCents(0),
      retirementCents: moneyCents(0),
      homeValueCents: moneyCents(0),
      otherInvestableAssetsCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      nonCreditLiabilitiesCents: moneyCents(0),
      creditLimitCents: moneyCents(1_000_00),
      creditUsedCents: moneyCents(0),
      annualLivingCostCents: moneyCents(50_000_00),
      requiredObligationsCents: moneyCents(2_000_00),
    },
    wellbeing: {
      burnoutPpm: ratePpm(100_000),
      happinessPpm: ratePpm(900_000),
    },
  });
}

describe("canonical serialization", () => {
  it("sorts object keys while preserving array order", () => {
    expect(canonicalJson({ b: 1, a: 2, nested: [{ z: true, a: null }] })).toBe(
      '{"a":2,"b":1,"nested":[{"a":null,"z":true}]}',
    );
    expect(canonicalJson([2, 1])).not.toBe(canonicalJson([1, 2]));
  });

  it("has a fixed SHA-256 compatibility vector", () => {
    expect(sha256Canonical({ b: 1, a: 2 })).toBe(
      "d3626ac30a87e6f7a6428233b3c68299976865fa5508e4267c5415c76af7a772",
    );
  });

  it("rejects ambiguous values, class instances, and cycles", () => {
    expect(() => canonicalJson({ value: Number.NaN })).toThrow(/finite/);
    expect(() => canonicalJson({ value: undefined })).toThrow(/unsupported/);
    expect(() => canonicalJson(new Date())).toThrow(/plain objects/);
    expect(() => canonicalJson(Array(1))).toThrow(/unsupported/);

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalJson(cyclic)).toThrow(/cycle/);
  });
});

describe("state fingerprints", () => {
  it("is stable for equivalent state and changes with replay-relevant state", () => {
    expect(sha256Canonical(state("same"))).toBe(sha256Canonical(state("same")));
    expect(sha256Canonical(state("same"))).not.toBe(
      sha256Canonical(state("different")),
    );
    expect(sha256Canonical(state("same"))).toMatch(/^[a-f0-9]{64}$/);
  });
});
