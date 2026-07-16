import { describe, expect, it } from "vitest";

import type { GameStateV2 } from "@/core/game-state-v2";

import { buildDetailedAction } from "../action-builder";
import type { ActionDraft, ActionType } from "../play-types";

const state = {
  gameplay: {
    debts: {
      termDebts: [
        { id: "debt.paid", principalCents: 0 },
        { id: "debt.student", principalCents: 250_000 },
      ],
    },
  },
} as unknown as GameStateV2;

const baseDraft: ActionDraft = {
  type: "invest_taxable",
  amount: 1_234.56,
  secondaryAmount: 20_000,
  mortgageRate: 6.5,
  mortgageTerm: 360,
  upskillProgram: "upskill.bootcamp",
};

function build(type: ActionType) {
  return buildDetailedAction({ ...baseDraft, type }, state);
}

describe("play action builder", () => {
  it.each([
    ["invest_taxable", "taxableBroadIndexCents"],
    ["invest_sector", "taxableSectorCents"],
    ["invest_speculative", "taxableSpeculativeCents"],
  ] as const)("maps %s to its engine-owned portfolio bucket", (type, bucket) => {
    expect(build(type)).toEqual({
      type: "invest_taxable",
      bucket,
      amountCents: 123_456,
    });
  });

  it("selects the first outstanding term debt instead of a paid debt", () => {
    expect(build("pay_term_debt")).toEqual({
      type: "pay_term_debt",
      debtId: "debt.student",
      amountCents: 123_456,
    });
  });

  it("sends liquidation intent without a client-selected transaction-cost rate", () => {
    expect(build("liquidate_taxable")).toEqual({
      type: "liquidate_taxable",
      bucket: "taxableBroadIndexCents",
      amountCents: 123_456,
    });
  });

  it("converts home purchase fields to exact engine units", () => {
    expect(build("purchase_home")).toEqual({
      type: "purchase_home",
      purchasePriceCents: 123_456,
      downPaymentCents: 2_000_000,
      mortgageAnnualInterestRatePpm: 65_000,
      mortgageTermMonths: 360,
    });
  });

  it("preserves the sign of lifestyle intent", () => {
    expect(build("reduce_lifestyle")).toEqual({
      type: "change_lifestyle",
      annualLivingCostDeltaCents: -123_456,
    });
    expect(build("increase_lifestyle")).toEqual({
      type: "change_lifestyle",
      annualLivingCostDeltaCents: 123_456,
    });
  });

  it("maps education program selection explicitly", () => {
    expect(build("start_upskill")).toEqual({
      type: "start_upskill",
      programId: "upskill.bootcamp",
    });
  });
});
