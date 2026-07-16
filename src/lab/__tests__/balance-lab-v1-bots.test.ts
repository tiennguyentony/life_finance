import { describe, expect, it } from "vitest";

import { randomState } from "../../core/domain/rng";
import { initializeNamedWorldRandomV1 } from "../../core/world-random-v1";
import {
  BALANCE_LAB_BOTS_V1,
  chooseBalanceLabEventResponseV1,
  chooseRandomControlOptionV1,
  deriveBalanceLabBotRandomStateV1,
} from "../balance-lab-v1-bots";

describe("offline balance lab v1 bots", () => {
  it("keeps every explicit policy inside production allocation bounds", () => {
    for (const bot of BALANCE_LAB_BOTS_V1) {
      const allocations = Object.values(bot.afterTaxAllocationPpm);
      expect(allocations.every((value) => value >= 0 && value <= 1_000_000)).toBe(true);
      expect(allocations.reduce((total, value) => total + value, 0)).toBeLessThanOrEqual(1_000_000);
      expect(bot.retirementContributionPpm).toBeGreaterThanOrEqual(0);
      expect(bot.retirementContributionPpm).toBeLessThanOrEqual(1_000_000);
      expect(bot.emergencyFundMonths).toBeGreaterThanOrEqual(0);
      expect(bot.emergencyFundMonths).toBeLessThanOrEqual(12);
    }
  });

  it("uses a reproducible lab-only cursor for the random control", () => {
    const input = {
      experimentId: "bot-rng",
      personaId: "persona-a",
      matchedSeed: 77,
    } as const;
    const first = deriveBalanceLabBotRandomStateV1(input);
    const second = deriveBalanceLabBotRandomStateV1(input);
    const options = ["none", "save", "repay", "invest"] as const;

    expect(chooseRandomControlOptionV1(first, options)).toEqual(
      chooseRandomControlOptionV1(second, options),
    );
    expect(() => chooseRandomControlOptionV1(first, [])).toThrowError(/requires an option/);
  });

  it("never receives or advances a named production world stream", () => {
    const world = initializeNamedWorldRandomV1(randomState("production-world"));
    const before = JSON.stringify(world);
    const bot = deriveBalanceLabBotRandomStateV1({
      experimentId: "bot-rng",
      personaId: "persona-a",
      matchedSeed: 77,
    });

    chooseRandomControlOptionV1(bot, ["a", "b"]);

    expect(JSON.stringify(world)).toBe(before);
  });

  it("publishes explicit monthly intents and event response maps for review", () => {
    for (const bot of BALANCE_LAB_BOTS_V1) {
      expect(bot.monthlyIntent.id).toMatch(/^intent\./);
      expect(bot.monthlyIntent.command).toMatch(
        /^(pay_highest_rate_debt|none|invest_discretionary|increase_lifestyle_and_borrow|random_valid_intent)$/,
      );
      if (bot.id === "random-control-v1") {
        expect(bot.eventResponses).toEqual({ kind: "random_valid_choice" });
      } else {
        expect(bot.eventResponses).toMatchObject({ kind: "mapped" });
        if (bot.eventResponses.kind !== "mapped") {
          throw new Error("non-random bot must publish mapped event responses");
        }
        expect(Object.keys(bot.eventResponses.byTemplateId).toSorted()).toEqual([
          "personal.lifestyle_upgrade",
          "personal.medical_bill",
          "personal.performance_bonus",
          "personal.utility_rebate",
        ]);
      }
    }
  });

  it("resolves mapped and random event choices without touching world randomness", () => {
    const mapped = chooseBalanceLabEventResponseV1({
      policy: BALANCE_LAB_BOTS_V1[0]!,
      templateId: "personal.medical_bill",
      validChoiceIds: ["pay_uninsured", "use_insurance"],
      botRandom: undefined,
    });
    const random = deriveBalanceLabBotRandomStateV1({
      experimentId: "event-response",
      personaId: "healthy-v1",
      matchedSeed: 7,
    });
    const first = chooseBalanceLabEventResponseV1({
      policy: BALANCE_LAB_BOTS_V1[5]!,
      templateId: "personal.medical_bill",
      validChoiceIds: ["pay_uninsured", "use_insurance"],
      botRandom: random,
    });
    const second = chooseBalanceLabEventResponseV1({
      policy: BALANCE_LAB_BOTS_V1[5]!,
      templateId: "personal.medical_bill",
      validChoiceIds: ["pay_uninsured", "use_insurance"],
      botRandom: random,
    });

    expect(mapped.choiceId).toBe("use_insurance");
    expect(mapped.nextBotRandom).toBeUndefined();
    expect(first).toEqual(second);
    expect(first.nextBotRandom).not.toEqual(random);
  });
});
