import { describe, expect, it } from "vitest";

import { ACTION_POLICY_V1_VERSION } from "../action-policy-v2";
import { buildPlayerPolicyCommandPreviewV2 } from "../action-preview-v2";
import { sha256Canonical } from "../canonical";
import {
  reduceDetailedFinanceCommand,
  type DetailedFinanceCommand,
} from "../detailed-actions-v2";
import { moneyCents, ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import type { GameStateV2 } from "../game-state-v2";
import { createNativeGameStateV2 } from "../native-game-state-v2";
import {
  setRecurringStrategy,
  type SetRecurringStrategyCommand,
} from "../recurring-strategy-v2";
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
    runId: "run.action-preview",
    playerId: "player.action-preview",
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "action-preview",
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

describe("action preview v2", () => {
  it("previews the exact detailed-action reduction without mutating state", () => {
    const initial = state();
    const command: DetailedFinanceCommand = {
      schemaVersion: 2,
      id: "cmd.preview.liquidate",
      type: "take_detailed_action",
      expectedRevision: initial.revision,
      effectiveMonth: initial.currentMonth,
      payload: {
        actionPolicyVersion: ACTION_POLICY_V1_VERSION,
        action: {
          type: "liquidate_taxable",
          bucket: "taxableSectorCents",
          amountCents: moneyCents(50_000),
          liquidationCostRatePpm: ratePpm(10_000),
        },
      },
    };
    const openingChecksum = sha256Canonical(initial);

    const applied = reduceDetailedFinanceCommand(initial, command);
    const preview = buildPlayerPolicyCommandPreviewV2(
      initial,
      command,
      applied,
    );

    expect(preview).toMatchObject({
      schemaVersion: 1,
      commandType: "take_detailed_action",
      actionPolicyVersion: "1.0.0",
      commandChecksum: sha256Canonical(command),
      openingStateChecksum: openingChecksum,
      resultingStateChecksum: sha256Canonical(applied),
      openingRevision: 0,
      resultingRevision: 1,
      effects: {
        cashChangeCents: 49_500,
        automaticLiquidityChangeCents: 0,
        termDebtPrincipalChangeCents: 0,
        revolvingCreditUsedChangeCents: 0,
        annualLivingCostChangeCents: 0,
        requiredObligationsChangeCents: 0,
      },
      policyChanges: [],
      appendedLedgerTransactionIds: ["txn.cmd.preview.liquidate"],
    });
    expect(preview.appendedLedgerTransactions).toEqual(
      applied.ledger.transactions.slice(initial.ledger.transactions.length),
    );
    expect(sha256Canonical(initial)).toBe(openingChecksum);
    expect(initial.acceptedCommandIds).not.toContain(command.id);
  });

  it("previews an exact recurring-policy replacement", () => {
    const initial = state();
    const command: SetRecurringStrategyCommand = {
      schemaVersion: 2,
      id: "cmd.preview.strategy",
      type: "set_recurring_strategy",
      expectedRevision: initial.revision,
      effectiveMonth: initial.currentMonth,
      payload: {
        strategy: {
          preTax401kSalaryRatePpm: ratePpm(50_000),
          preTaxHsaSalaryRatePpm: ratePpm(10_000),
          afterTaxBroadIndexRatePpm: ratePpm(100_000),
          afterTaxSectorRatePpm: ratePpm(0),
          afterTaxSpeculativeRatePpm: ratePpm(0),
          afterTaxIraRatePpm: ratePpm(0),
          afterTaxExtraDebtRatePpm: ratePpm(50_000),
        },
      },
    };

    const applied = setRecurringStrategy(initial, command);
    const preview = buildPlayerPolicyCommandPreviewV2(
      initial,
      command,
      applied,
    );

    expect(preview.actionPolicyVersion).toBeNull();
    expect(preview.resultingStateChecksum).toBe(sha256Canonical(applied));
    expect(preview.policyChanges).toEqual([
      {
        kind: "recurring_strategy",
        effectiveMonth: "2026-07",
        previous: initial.gameplay.recurringStrategy,
        resulting: applied.gameplay.recurringStrategy,
      },
    ]);
    expect(preview.appendedLedgerTransactions).toEqual([]);
    expect(preview.effects).toEqual({
      cashChangeCents: 0,
      automaticLiquidityChangeCents: 0,
      termDebtPrincipalChangeCents: 0,
      revolvingCreditUsedChangeCents: 0,
      annualLivingCostChangeCents: 0,
      requiredObligationsChangeCents: 0,
    });
  });

  it("reports a lifestyle replacement as an explicit policy change", () => {
    const initial = state();
    const command: DetailedFinanceCommand = {
      schemaVersion: 2,
      id: "cmd.preview.lifestyle",
      type: "take_detailed_action",
      expectedRevision: initial.revision,
      effectiveMonth: initial.currentMonth,
      payload: {
        actionPolicyVersion: ACTION_POLICY_V1_VERSION,
        action: {
          type: "change_lifestyle",
          annualLivingCostDeltaCents: moneyCents(-1_200_000),
        },
      },
    };

    const applied = reduceDetailedFinanceCommand(initial, command);
    const preview = buildPlayerPolicyCommandPreviewV2(
      initial,
      command,
      applied,
    );

    expect(preview.effects).toMatchObject({
      annualLivingCostChangeCents: -1_200_000,
      requiredObligationsChangeCents: -100_000,
    });
    expect(preview.policyChanges).toEqual([
      {
        kind: "annual_living_cost",
        effectiveMonth: "2026-07",
        previousAnnualLivingCostCents:
          initial.finances.annualLivingCostCents,
        resultingAnnualLivingCostCents:
          initial.finances.annualLivingCostCents - 1_200_000,
      },
    ]);
  });

  it("reports exact immediate debt and liquidity changes", () => {
    const initial = state();
    const command: DetailedFinanceCommand = {
      schemaVersion: 2,
      id: "cmd.preview.debt",
      type: "take_detailed_action",
      expectedRevision: initial.revision,
      effectiveMonth: initial.currentMonth,
      payload: {
        actionPolicyVersion: ACTION_POLICY_V1_VERSION,
        action: {
          type: "pay_term_debt",
          debtId: "debt.student.1",
          amountCents: moneyCents(200_000),
        },
      },
    };

    const applied = reduceDetailedFinanceCommand(initial, command);
    const preview = buildPlayerPolicyCommandPreviewV2(
      initial,
      command,
      applied,
    );

    expect(preview.effects).toMatchObject({
      cashChangeCents: -200_000,
      automaticLiquidityChangeCents: -200_000,
      termDebtPrincipalChangeCents: -200_000,
      revolvingCreditUsedChangeCents: 0,
      annualLivingCostChangeCents: 0,
    });
    expect(preview.appendedLedgerTransactions[0]).toMatchObject({
      id: "txn.cmd.preview.debt",
      commandId: "cmd.preview.debt",
      effectiveMonth: "2026-07",
      reasonCode: "pay_term_debt_v2",
    });
  });
});
