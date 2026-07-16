import { describe, expect, it } from "vitest";

import { addMonths } from "../domain/month";
import { moneyCents, ratePpm } from "../domain/money";
import {
  acceptFinancialMonthCommandV2,
  FinancialTransitionV2Error,
} from "../financial-transition-v2";
import { createInitialGameState } from "../game-state";
import {
  finalizeGameStateV2,
  migrateGameStateV1ToV2,
  type GameStateV2,
} from "../game-state-v2";

function previousState(): GameStateV2 {
  const migrated = migrateGameStateV1ToV2(
    createInitialGameState({
      runId: "run.financial-transition-v2",
      startMonth: "2026-07",
      randomSeed: "financial-transition-v2",
      player: {
        playerId: "player.financial-transition-v2",
        birthMonth: "1990-01",
        locationId: "location.seattle",
        careerTrackId: "career.software",
        filingStatus: "single",
      },
      finances: {
        cashCents: moneyCents(100_000),
        taxableInvestmentsCents: moneyCents(0),
        retirementCents: moneyCents(0),
        homeValueCents: moneyCents(0),
        otherInvestableAssetsCents: moneyCents(0),
        otherAssetsCents: moneyCents(0),
        nonCreditLiabilitiesCents: moneyCents(0),
        creditLimitCents: moneyCents(0),
        creditUsedCents: moneyCents(0),
        annualLivingCostCents: moneyCents(1_200_000),
        requiredObligationsCents: moneyCents(100_000),
      },
      wellbeing: {
        burnoutPpm: ratePpm(100_000),
        happinessPpm: ratePpm(900_000),
      },
    }),
  );
  return finalizeGameStateV2({
    ...migrated,
    revision: 1,
    acceptedCommandIds: ["cmd.previous"],
  });
}

function financialState(previous: GameStateV2): GameStateV2 {
  return finalizeGameStateV2({
    ...previous,
    currentMonth: addMonths(previous.currentMonth, 1),
  });
}

describe("financial month command transition", () => {
  it("accepts exactly one financial month without letting the kernel own command metadata", () => {
    const previous = previousState();
    const financial = financialState(previous);

    const accepted = acceptFinancialMonthCommandV2(
      previous,
      financial,
      "cmd.month.2026-07",
    );

    expect(accepted).toMatchObject({
      currentMonth: "2026-08",
      revision: 2,
      acceptedCommandIds: ["cmd.previous", "cmd.month.2026-07"],
    });
    expect(Object.isFrozen(accepted)).toBe(true);
    expect(financial).toMatchObject({
      revision: 1,
      acceptedCommandIds: ["cmd.previous"],
    });
  });

  it.each([
    ["wrong month", { currentMonth: "2026-09" }, "MONTH_NOT_ADVANCED_ONCE"],
    ["revision mutation", { revision: 2 }, "REVISION_MUTATED"],
    [
      "accepted-id mutation",
      { acceptedCommandIds: ["cmd.previous", "cmd.kernel"] },
      "ACCEPTED_COMMAND_IDS_MUTATED",
    ],
    ["run mismatch", { runId: "run.changed" }, "RUN_MISMATCH"],
    ["schema mismatch", { schemaVersion: 1 }, "SCHEMA_MISMATCH"],
    ["engine mismatch", { engineVersion: "changed" }, "ENGINE_MISMATCH"],
    [
      "outcome mutation",
      {
        outcome: {
          kind: "bankruptcy",
          grade: "F",
          reachedMonth: "2026-08",
          reasonCode: "kernel_owned_outcome",
        },
      },
      "OUTCOME_MUTATED",
    ],
  ] as const)("rejects %s", (_label, mutation, code) => {
    const previous = previousState();
    const financial = {
      ...financialState(previous),
      ...mutation,
    } as GameStateV2;

    expect(() =>
      acceptFinancialMonthCommandV2(
        previous,
        financial,
        "cmd.month.2026-07",
      ),
    ).toThrow(expect.objectContaining({ code }));
  });

  it.each([
    ["cmd.previous", "DUPLICATE_COMMAND"],
    ["unsafe command id!", "INVALID_COMMAND_ID"],
  ] as const)("rejects command id %s", (commandId, code) => {
    const previous = previousState();

    expect(() =>
      acceptFinancialMonthCommandV2(
        previous,
        financialState(previous),
        commandId,
      ),
    ).toThrow(FinancialTransitionV2Error);
    expect(() =>
      acceptFinancialMonthCommandV2(
        previous,
        financialState(previous),
        commandId,
      ),
    ).toThrow(expect.objectContaining({ code }));
  });

  it("does not freeze caller-owned mutable financial descendants", () => {
    const previous = previousState();
    const financial = structuredClone(financialState(previous));

    const accepted = acceptFinancialMonthCommandV2(
      previous,
      financial,
      "cmd.month.mutable",
    );

    expect(Object.isFrozen(financial)).toBe(false);
    expect(Object.isFrozen(financial.gameplay)).toBe(false);
    expect(Object.isFrozen(financial.gameplay.portfolio)).toBe(false);
    expect(accepted.gameplay).not.toBe(financial.gameplay);
  });

  it("does not freeze caller-owned descendants behind a shallow-frozen root", () => {
    const previous = previousState();
    const mutable = structuredClone(financialState(previous));
    const financial = Object.freeze({ ...mutable }) as GameStateV2;

    const accepted = acceptFinancialMonthCommandV2(
      previous,
      financial,
      "cmd.month.shallow",
    );

    expect(Object.isFrozen(financial)).toBe(true);
    expect(Object.isFrozen(financial.gameplay)).toBe(false);
    expect(Object.isFrozen(financial.gameplay.portfolio)).toBe(false);
    expect(accepted.gameplay).not.toBe(financial.gameplay);
  });

  it("reuses descendants from an already deeply frozen financial state", () => {
    const previous = previousState();
    const financial = financialState(previous);

    const accepted = acceptFinancialMonthCommandV2(
      previous,
      financial,
      "cmd.month.frozen",
    );

    expect(accepted.gameplay).toBe(financial.gameplay);
    expect(accepted.finances).toBe(financial.finances);
  });
});
