import { describe, expect, it } from "vitest";

import {
  completeCareerDevelopmentV2,
  reduceDetailedFinanceCommand,
  type DetailedFinanceCommand,
  type DetailedFinancialAction,
} from "../detailed-actions-v2";
import { moneyCents, ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import {
  finalizeGameStateV2,
  validateGameStateV2,
  type GameStateV2,
} from "../game-state-v2";
import { createNativeGameStateV2 } from "../native-game-state-v2";
import { resolveScenarioCatalogSelection } from "../scenario-catalog";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";

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

  it("withdraws retirement with authoritative withholding and early penalty", () => {
    const initial = state();
    const contributed = reduceDetailedFinanceCommand(
      initial,
      command(initial, "cmd.retirement.deposit", {
        type: "contribute_ira",
        amountCents: moneyCents(750_000),
      }),
    );
    const withdrawn = reduceDetailedFinanceCommand(
      contributed,
      command(contributed, "cmd.retirement.withdraw", {
        type: "withdraw_retirement",
        bucket: "retirementIraCents",
        amountCents: moneyCents(500_000),
      }),
    );

    expect(withdrawn.gameplay.portfolio.retirementIraCents).toBe(250_000);
    expect(withdrawn.finances.retirementCents).toBe(250_000);
    expect(withdrawn.finances.cashCents).toBe(2_100_000);
    expect(withdrawn.ledger.transactions.at(-1)).toMatchObject({
      reasonCode: "withdraw_retirement_v2",
      postings: [
        { accountId: "asset.retirement", debitCents: 0, creditCents: 500_000 },
        { accountId: "asset.cash", debitCents: 350_000, creditCents: 0 },
        { accountId: "expense.tax", debitCents: 100_000, creditCents: 0 },
        { accountId: "expense.living", debitCents: 50_000, creditCents: 0 },
      ],
    });
    expect(validateGameStateV2(withdrawn)).toEqual([]);

    const eligible = finalizeGameStateV2({
      ...initial,
      player: { ...initial.player, birthMonth: simulationMonth("1967-01") },
    });
    const eligibleDeposit = reduceDetailedFinanceCommand(
      eligible,
      command(eligible, "cmd.retirement.eligible.deposit", {
        type: "contribute_ira",
        amountCents: moneyCents(500_000),
      }),
    );
    const eligibleWithdrawal = reduceDetailedFinanceCommand(
      eligibleDeposit,
      command(eligibleDeposit, "cmd.retirement.eligible.withdraw", {
        type: "withdraw_retirement",
        bucket: "retirementIraCents",
        amountCents: moneyCents(500_000),
      }),
    );
    expect(eligibleWithdrawal.finances.cashCents).toBe(2_400_000);
    expect(eligibleWithdrawal.ledger.transactions.at(-1)?.postings).not.toContainEqual(
      expect.objectContaining({ accountId: "expense.living" }),
    );
  });

  it("purchases, refinances, and sells a home without pre-committing equity", () => {
    const initial = state();
    const purchased = reduceDetailedFinanceCommand(
      initial,
      command(initial, "cmd.home.purchase", {
        type: "purchase_home",
        purchasePriceCents: moneyCents(2_000_000),
        downPaymentCents: moneyCents(500_000),
        mortgageAnnualInterestRatePpm: ratePpm(60_000),
        mortgageTermMonths: 360,
      }),
    );
    const mortgage = purchased.gameplay.debts.termDebts.find(
      ({ kind }) => kind === "mortgage",
    )!;
    expect(purchased.finances).toMatchObject({
      cashCents: 1_940_000,
      homeValueCents: 2_000_000,
      nonCreditLiabilitiesCents: 3_500_000,
    });
    expect(mortgage).toMatchObject({
      principalCents: 1_500_000,
      annualInterestRatePpm: 60_000,
      remainingTermMonths: 360,
    });
    expect(mortgage.minimumPaymentCents).toBeGreaterThan(0);
    expect(purchased.finances.requiredObligationsCents).toBe(
      initial.finances.requiredObligationsCents + mortgage.minimumPaymentCents,
    );

    const refinanced = reduceDetailedFinanceCommand(
      purchased,
      command(purchased, "cmd.home.refinance", {
        type: "refinance_home",
        mortgageAnnualInterestRatePpm: ratePpm(40_000),
        mortgageTermMonths: 360,
      }),
    );
    const refinancedMortgage = refinanced.gameplay.debts.termDebts.find(
      ({ kind }) => kind === "mortgage",
    )!;
    expect(refinanced.finances.cashCents).toBe(1_910_000);
    expect(refinancedMortgage.minimumPaymentCents).toBeLessThan(
      mortgage.minimumPaymentCents,
    );
    expect(refinanced.finances.requiredObligationsCents).toBe(
      initial.finances.requiredObligationsCents +
        refinancedMortgage.minimumPaymentCents,
    );

    const sold = reduceDetailedFinanceCommand(
      refinanced,
      command(refinanced, "cmd.home.sell", { type: "sell_home" }),
    );
    expect(sold.finances).toMatchObject({
      cashCents: 2_290_000,
      homeValueCents: 0,
      nonCreditLiabilitiesCents: 2_000_000,
      requiredObligationsCents: initial.finances.requiredObligationsCents,
    });
    expect(
      sold.gameplay.debts.termDebts.some(({ kind }) => kind === "mortgage"),
    ).toBe(false);
    expect(validateGameStateV2(sold)).toEqual([]);
    expect(() =>
      reduceDetailedFinanceCommand(
        sold,
        command(sold, "cmd.home.sell.again", { type: "sell_home" }),
      ),
    ).toThrow(expect.objectContaining({ code: "HOME_REQUIRED" }));
  });

  it("applies lifestyle plans and completes catalog-owned upskill effects on schedule", () => {
    const initial = state();
    const lifestyle = reduceDetailedFinanceCommand(
      initial,
      command(initial, "cmd.lifestyle.reduce", {
        type: "change_lifestyle",
        annualLivingCostDeltaCents: moneyCents(-1_200_000),
      }),
    );
    expect(lifestyle.finances.annualLivingCostCents).toBe(
      initial.finances.annualLivingCostCents - 1_200_000,
    );
    expect(lifestyle.finances.requiredObligationsCents).toBe(
      initial.finances.requiredObligationsCents - 100_000,
    );
    expect(lifestyle.ledger).toEqual(initial.ledger);

    const started = reduceDetailedFinanceCommand(
      lifestyle,
      command(lifestyle, "cmd.upskill.certificate", {
        type: "start_upskill",
        programId: "upskill.certificate",
      }),
    );
    expect(started.finances.cashCents).toBe(lifestyle.finances.cashCents - 200_000);
    expect(started.gameplay.careerDevelopment.pending[0]).toMatchObject({
      commandId: "cmd.upskill.certificate",
      programId: "upskill.certificate",
      catalogVersion: "upskill-2026.1",
      startedMonth: "2026-07",
      completesMonth: "2026-10",
      annualSalaryIncreaseCents: 300_000,
    });
    const beforeCompletion = completeCareerDevelopmentV2({
      ...started,
      currentMonth: simulationMonth("2026-09"),
    });
    expect(beforeCompletion.gameplay.careerDevelopment.pending).toHaveLength(1);
    const completed = completeCareerDevelopmentV2({
      ...beforeCompletion,
      currentMonth: simulationMonth("2026-10"),
    });
    expect(completed.gameplay.careerDevelopment.pending).toEqual([]);
    expect(completed.gameplay.careerDevelopment.history[0]).toMatchObject({
      completedMonth: "2026-10",
      annualSalaryIncreaseCents: 300_000,
    });
    expect(completed.gameplay.employment).toMatchObject({
      status: "employed",
      annualGrossSalaryCents: 12_300_000,
    });
    expect(validateGameStateV2(completed)).toEqual([]);
  });
});
