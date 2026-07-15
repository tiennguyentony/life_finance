import { describe, expect, it } from "vitest";

import { reduceGameCommand, type TakeActionCommand } from "./commands";
import { moneyCents, ratePpm } from "./domain/money";
import { simulationMonth } from "./domain/month";
import {
  calculateNetWorth,
  createInitialGameState,
  type GameState,
} from "./game-state";

function state(): GameState {
  return createInitialGameState({
    runId: "run_actions",
    startMonth: "2026-07",
    randomSeed: "actions",
    player: {
      playerId: "player_actions",
      birthMonth: "1990-01",
      locationId: "US-CA",
      careerTrackId: "engineer",
      filingStatus: "single",
    },
    finances: {
      cashCents: moneyCents(100_000_00),
      taxableInvestmentsCents: moneyCents(50_000_00),
      retirementCents: moneyCents(200_000_00),
      homeValueCents: moneyCents(500_000_00),
      otherInvestableAssetsCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      nonCreditLiabilitiesCents: moneyCents(300_000_00),
      creditLimitCents: moneyCents(20_000_00),
      creditUsedCents: moneyCents(5_000_00),
      annualLivingCostCents: moneyCents(60_000_00),
      requiredObligationsCents: moneyCents(5_000_00),
    },
    wellbeing: {
      burnoutPpm: ratePpm(200_000),
      happinessPpm: ratePpm(800_000),
    },
  });
}

function command(
  action: TakeActionCommand["payload"]["action"],
  revision = 0,
): TakeActionCommand {
  return {
    schemaVersion: 1,
    id: `cmd.action.${revision + 1}`,
    expectedRevision: revision,
    effectiveMonth: simulationMonth("2026-07"),
    type: "take_action",
    payload: { action },
  };
}

describe("financial actions", () => {
  it("moves cash into investments without changing net worth", () => {
    const before = state();
    const after = reduceGameCommand(
      before,
      command({ type: "invest_cash", amountCents: moneyCents(10_000_00) }),
    );

    expect(after.finances.cashCents).toBe(90_000_00);
    expect(after.finances.taxableInvestmentsCents).toBe(60_000_00);
    expect(calculateNetWorth(after.finances)).toBe(
      calculateNetWorth(before.finances),
    );
    expect(after.ledger.transactions.at(-1)?.reasonCode).toBe("invest_cash");
  });

  it("charges explicit taxable liquidation costs", () => {
    const before = state();
    const after = reduceGameCommand(
      before,
      command({
        type: "liquidate_taxable_investments",
        amountCents: moneyCents(10_000_00),
        liquidationCostRatePpm: ratePpm(10_000),
      }),
    );

    expect(after.finances.taxableInvestmentsCents).toBe(40_000_00);
    expect(after.finances.cashCents).toBe(109_900_00);
    expect(calculateNetWorth(after.finances)).toBe(
      calculateNetWorth(before.finances) - 100_00,
    );
  });

  it("draws and repays credit with balanced asset/liability changes", () => {
    const drawn = reduceGameCommand(
      state(),
      command({ type: "draw_credit", amountCents: moneyCents(2_000_00) }),
    );
    const repaid = reduceGameCommand(
      drawn,
      command(
        { type: "pay_credit", amountCents: moneyCents(1_000_00) },
        1,
      ),
    );

    expect(drawn.finances.cashCents).toBe(102_000_00);
    expect(drawn.finances.creditUsedCents).toBe(7_000_00);
    expect(repaid.finances.cashCents).toBe(101_000_00);
    expect(repaid.finances.creditUsedCents).toBe(6_000_00);
    expect(calculateNetWorth(repaid.finances)).toBe(
      calculateNetWorth(state().finances),
    );
  });

  it("makes retirement withdrawal costs reduce net worth", () => {
    const before = state();
    const after = reduceGameCommand(
      before,
      command({
        type: "withdraw_retirement",
        grossAmountCents: moneyCents(10_000_00),
        withholdingRatePpm: ratePpm(200_000),
        penaltyRatePpm: ratePpm(100_000),
      }),
    );

    expect(after.finances.retirementCents).toBe(190_000_00);
    expect(after.finances.cashCents).toBe(107_000_00);
    expect(calculateNetWorth(after.finances)).toBe(
      calculateNetWorth(before.finances) - 3_000_00,
    );
  });

  it("sells a home, settles debt, and records gain or loss balancing equity", () => {
    const after = reduceGameCommand(
      state(),
      command({
        type: "sell_home",
        salePriceCents: moneyCents(550_000_00),
        nonCreditLiabilityPayoffCents: moneyCents(300_000_00),
        transactionCostRatePpm: ratePpm(50_000),
      }),
    );

    expect(after.finances.homeValueCents).toBe(0);
    expect(after.finances.nonCreditLiabilitiesCents).toBe(0);
    expect(after.finances.cashCents).toBe(322_500_00);
    expect(after.ledger.transactions.at(-1)?.postings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountId: "equity.adjustment" }),
      ]),
    );
  });

  it("reduces the living-cost plan without inventing a ledger movement", () => {
    const before = state();
    const after = reduceGameCommand(
      before,
      command({
        type: "set_annual_living_cost",
        annualLivingCostCents: moneyCents(50_000_00),
      }),
    );

    expect(after.finances.annualLivingCostCents).toBe(50_000_00);
    expect(after.ledger).toBe(before.ledger);
    expect(after.revision).toBe(1);
  });

  it("rejects infeasible actions without changing the original state", () => {
    const before = state();
    try {
      reduceGameCommand(
        before,
        command({ type: "invest_cash", amountCents: moneyCents(100_000_01) }),
      );
      throw new Error("expected action to fail");
    } catch (error) {
      expect(error).toMatchObject({ code: "TRANSITION_INVARIANT" });
    }
    expect(before.revision).toBe(0);
    expect(before.ledger.transactions).toHaveLength(1);
  });
});
