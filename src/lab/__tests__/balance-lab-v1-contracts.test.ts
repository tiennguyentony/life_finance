import { describe, expect, it } from "vitest";

import {
  decodeBalanceLabRunSpecV1,
  OfflineBalanceLabV1Error,
} from "../balance-lab-v1-contracts";
import { BALANCE_LAB_BOTS_V1 } from "../balance-lab-v1-bots";

const validSpec = {
  version: "offline-balance-lab-v1",
  experimentId: "prompt-14-ci",
  personaIds: ["healthy-seattle"],
  matchedSeeds: [101, 202, 303],
  botIds: ["disciplined-v1", "debt-heavy-lifestyle-v1"],
  horizonMonths: 24,
  difficulty: "normal",
} as const;

describe("offline balance lab v1 contracts", () => {
  it("accepts a bounded exact run spec and freezes every collection", () => {
    const decoded = decodeBalanceLabRunSpecV1(validSpec);

    expect(decoded).toEqual(validSpec);
    expect(Object.isFrozen(decoded)).toBe(true);
    expect(Object.isFrozen(decoded.personaIds)).toBe(true);
    expect(Object.isFrozen(decoded.matchedSeeds)).toBe(true);
    expect(Object.isFrozen(decoded.botIds)).toBe(true);
  });

  it("rejects unknown fields, duplicate identities, and unbounded work", () => {
    expect(() =>
      decodeBalanceLabRunSpecV1({ ...validSpec, unknown: true }),
    ).toThrow(OfflineBalanceLabV1Error);
    expect(() =>
      decodeBalanceLabRunSpecV1({
        ...validSpec,
        botIds: ["disciplined-v1", "disciplined-v1"],
      }),
    ).toThrowError(/unique/);
    expect(() =>
      decodeBalanceLabRunSpecV1({ ...validSpec, horizonMonths: 481 }),
    ).toThrowError(/horizonMonths/);
  });

  it("publishes six explicit reviewable bot policies", () => {
    expect(BALANCE_LAB_BOTS_V1.map((bot) => bot.id)).toEqual([
      "disciplined-v1",
      "average-beginner-v1",
      "aggressive-investor-v1",
      "debt-heavy-lifestyle-v1",
      "cash-hoarder-v1",
      "random-control-v1",
    ]);
    expect(BALANCE_LAB_BOTS_V1.every(Object.isFrozen)).toBe(true);
    expect(BALANCE_LAB_BOTS_V1.every((bot) => bot.policySummary.length > 0)).toBe(true);
  });
});
