import { describe, expect, it } from "vitest";

import {
  reduceDetailedFinanceCommand,
  type DetailedFinanceCommand,
  type DetailedFinancialAction,
} from "./detailed-actions-v2";
import { moneyCents, ratePpm } from "./domain/money";
import { simulationMonth } from "./domain/month";
import { validateGameStateV2, type GameStateV2 } from "./game-state-v2";
import { createNativeGameStateV2 } from "./native-game-state-v2";
import { resolveScenarioCatalogSelection } from "./scenario-catalog";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../data/scenario-catalog";

function state(): GameStateV2 {
  const resolvedScenario = resolveScenarioCatalogSelection(
    US_2026_SCENARIO_CATALOG,
    {
      catalogVersion: US_2026_SCENARIO_CATALOG_VERSION,
      locationId: "location.seattle",
      careerId: "career.software",
      householdId: "household.single",
      benefitsPackageId: "benefits.corporate_flex",
      healthPlanId: "health.hdhp_hsa",
      retirementPlanId: "retirement.401k_standard",
      insuranceCoverageIds: [],
      scenarioId: "scenario.fresh_start",
    },
  );
  return createNativeGameStateV2({
    runId: "run.detailed-actions",
    playerId: "player.detailed-actions",
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "detailed-actions",
    resolvedScenario,
    annualGrossSalaryCents: moneyCents(12_000_000),
    finances: {
      cashCents: moneyCents(2_500_000),
      taxableBroadIndexCents: moneyCents(1_000_000),
      taxableSectorCents: moneyCents(500_000),
      taxableSpeculativeCents: moneyCents(250_000),
      retirement401kCents: moneyCents(0),
      retirementIraCents: moneyCents(0),
      hsaCents: moneyCents(0),
      homeValueCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      termDebts: [
        {
          id: "debt.student.1",
          kind: "student_loan",
          principalCents: moneyCents(2_000_000),
          annualInterestRatePpm: ratePpm(50_000),
          minimumPaymentCents: moneyCents(25_000),
          remainingTermMonths: 120,
        },
      ],
      revolvingCreditLimitCents: moneyCents(1_000_000),
      revolvingCreditUsedCents: moneyCents(200_000),
    },
    wellbeing: {
      burnoutPpm: ratePpm(200_000),
      happinessPpm: ratePpm(800_000),
    },
  });
}

function command(
  current: GameStateV2,
  id: string,
  action: DetailedFinancialAction,
): DetailedFinanceCommand {
  return {
    schemaVersion: 2,
    id,
    type: "take_detailed_action",
    expectedRevision: current.revision,
    effectiveMonth: current.currentMonth,
    payload: { action },
  };
}

describe("detailed v2 financial commands", () => {
  it("invests and liquidates exact taxable buckets with balanced aggregate journals", () => {
    const initial = state();
    const invested = reduceDetailedFinanceCommand(
      initial,
      command(initial, "cmd.invest", {
        type: "invest_taxable",
        bucket: "taxableBroadIndexCents",
        amountCents: moneyCents(100_000),
      }),
    );
    const liquidated = reduceDetailedFinanceCommand(
      invested,
      command(invested, "cmd.liquidate", {
        type: "liquidate_taxable",
        bucket: "taxableSectorCents",
        amountCents: moneyCents(50_000),
        liquidationCostRatePpm: ratePpm(100_000),
      }),
    );

    expect(invested.gameplay.portfolio.taxableBroadIndexCents).toBe(1_100_000);
    expect(liquidated.gameplay.portfolio.taxableSectorCents).toBe(450_000);
    expect(liquidated.finances.cashCents).toBe(2_445_000);
    expect(liquidated.finances.taxableInvestmentsCents).toBe(1_800_000);
    expect(liquidated.revision).toBe(2);
    expect(liquidated.ledger.transactions.at(-1)?.postings).toEqual([
      { accountId: "asset.taxable_investments", debitCents: 0, creditCents: 50_000 },
      { accountId: "asset.cash", debitCents: 45_000, creditCents: 0 },
      { accountId: "expense.living", debitCents: 5_000, creditCents: 0 },
    ]);
    expect(validateGameStateV2(liquidated)).toEqual([]);
    expect(initial.finances.cashCents).toBe(2_500_000);
  });

  it("enforces exact IRA and HSA eligibility and annual limits", () => {
    const initial = state();
    const ira = reduceDetailedFinanceCommand(
      initial,
      command(initial, "cmd.ira", {
        type: "contribute_ira",
        amountCents: moneyCents(750_000),
      }),
    );
    expect(ira.gameplay.portfolio.retirementIraCents).toBe(750_000);
    expect(ira.gameplay.contributions.iraCents).toBe(750_000);
    expect(() =>
      reduceDetailedFinanceCommand(
        ira,
        command(ira, "cmd.ira.over", {
          type: "contribute_ira",
          amountCents: moneyCents(1),
        }),
      ),
    ).toThrow(expect.objectContaining({ code: "CONTRIBUTION_LIMIT" }));

    const hsa = reduceDetailedFinanceCommand(
      initial,
      command(initial, "cmd.hsa", {
        type: "contribute_hsa",
        amountCents: moneyCents(440_000),
      }),
    );
    expect(hsa.gameplay.portfolio.hsaCents).toBe(440_000);
    expect(hsa.gameplay.contributions.hsaCents).toBe(440_000);
    expect(validateGameStateV2(hsa)).toEqual([]);
  });

  it("pays a term debt exactly once and removes its future minimum obligation", () => {
    const initial = state();
    const paid = reduceDetailedFinanceCommand(
      initial,
      command(initial, "cmd.payoff", {
        type: "pay_term_debt",
        debtId: "debt.student.1",
        amountCents: moneyCents(2_000_000),
      }),
    );

    expect(paid.gameplay.debts.termDebts[0]).toMatchObject({
      principalCents: 0,
      minimumPaymentCents: 0,
      remainingTermMonths: 0,
    });
    expect(paid.finances.nonCreditLiabilitiesCents).toBe(0);
    expect(paid.finances.requiredObligationsCents).toBe(
      initial.finances.requiredObligationsCents - 25_000,
    );
    expect(() =>
      reduceDetailedFinanceCommand(
        paid,
        command(paid, "cmd.payoff.again", {
          type: "pay_term_debt",
          debtId: "debt.student.1",
          amountCents: moneyCents(1),
        }),
      ),
    ).toThrow(expect.objectContaining({ code: "PAYMENT_EXCEEDS_DEBT" }));
  });

  it("keeps revolving detail synchronized and rejects stale or duplicate commands", () => {
    const initial = state();
    const drawCommand = command(initial, "cmd.credit", {
      type: "draw_revolving_credit",
      amountCents: moneyCents(300_000),
    });
    const drawn = reduceDetailedFinanceCommand(initial, drawCommand);
    expect(drawn.gameplay.debts.revolvingCreditUsedCents).toBe(500_000);
    expect(drawn.finances.creditUsedCents).toBe(500_000);
    expect(drawn.finances.cashCents).toBe(2_800_000);
    expect(() => reduceDetailedFinanceCommand(drawn, drawCommand)).toThrow(
      expect.objectContaining({ code: "DUPLICATE_COMMAND" }),
    );

    const stale = {
      ...command(drawn, "cmd.stale", {
        type: "pay_revolving_credit",
        amountCents: moneyCents(100_000),
      }),
      expectedRevision: 0,
    };
    expect(() => reduceDetailedFinanceCommand(drawn, stale)).toThrow(
      expect.objectContaining({ code: "STALE_REVISION" }),
    );
    expect(validateGameStateV2(drawn)).toEqual([]);
  });
});
