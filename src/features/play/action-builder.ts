import type { GameStateV2 } from "@/core/game-state-v2";

import { dollarsToCents, percentToPpm } from "./play-model";
import type { ActionDraft, DetailedAction } from "./play-types";

export function buildDetailedAction(
  draft: ActionDraft,
  state: GameStateV2,
): DetailedAction {
  const amountCents = dollarsToCents(draft.amount);
  const debtId = state.gameplay.debts.termDebts.find(
    ({ principalCents }) => principalCents > 0,
  )?.id;
  switch (draft.type) {
    case "invest_taxable":
      return {
        type: "invest_taxable",
        bucket: "taxableBroadIndexCents",
        amountCents,
      };
    case "invest_sector":
      return {
        type: "invest_taxable",
        bucket: "taxableSectorCents",
        amountCents,
      };
    case "invest_speculative":
      return {
        type: "invest_taxable",
        bucket: "taxableSpeculativeCents",
        amountCents,
      };
    case "liquidate_taxable":
      return {
        type: "liquidate_taxable",
        bucket: "taxableBroadIndexCents",
        amountCents,
        liquidationCostRatePpm: 10_000,
      };
    case "contribute_ira":
      return { type: "contribute_ira", amountCents };
    case "contribute_hsa":
      return { type: "contribute_hsa", amountCents };
    case "pay_term_debt":
      return {
        type: "pay_term_debt",
        debtId: debtId ?? "debt.none",
        amountCents,
      };
    case "pay_revolving_credit":
      return { type: "pay_revolving_credit", amountCents };
    case "draw_revolving_credit":
      return { type: "draw_revolving_credit", amountCents };
    case "withdraw_401k":
      return {
        type: "withdraw_retirement",
        bucket: "retirement401kCents",
        amountCents,
      };
    case "withdraw_ira":
      return {
        type: "withdraw_retirement",
        bucket: "retirementIraCents",
        amountCents,
      };
    case "purchase_home":
      return {
        type: "purchase_home",
        purchasePriceCents: amountCents,
        downPaymentCents: dollarsToCents(draft.secondaryAmount),
        mortgageAnnualInterestRatePpm: percentToPpm(draft.mortgageRate),
        mortgageTermMonths: draft.mortgageTerm,
      };
    case "sell_home":
      return { type: "sell_home" };
    case "refinance_home":
      return {
        type: "refinance_home",
        mortgageAnnualInterestRatePpm: percentToPpm(draft.mortgageRate),
        mortgageTermMonths: draft.mortgageTerm,
      };
    case "reduce_lifestyle":
      return {
        type: "change_lifestyle",
        annualLivingCostDeltaCents: -amountCents,
      };
    case "increase_lifestyle":
      return {
        type: "change_lifestyle",
        annualLivingCostDeltaCents: amountCents,
      };
    case "start_upskill":
      return { type: "start_upskill", programId: draft.upskillProgram };
    default:
      return assertNever(draft.type);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported action type: ${String(value)}`);
}
