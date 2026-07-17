import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import type { PolicyPreviewSession } from "../policy-preview-model";
import { PolicyPreviewPanel } from "../policy-preview-panel";

const session = {
  command: {
    schemaVersion: 2,
    id: "action.preview.browser",
    expectedRevision: 7,
    effectiveMonth: "2028-03",
    type: "take_detailed_action",
    payload: {
      action: {
        type: "invest_taxable",
        bucket: "taxableBroadIndexCents",
        amountCents: 100_000,
      },
    },
  },
  response: {
    schemaVersion: 1,
    commandType: "take_detailed_action",
    actionPolicyVersion: "1.0.0",
    commandChecksum: "1".repeat(64),
    openingStateChecksum: "2".repeat(64),
    resultingStateChecksum: "3".repeat(64),
    openingRevision: 7,
    resultingRevision: 8,
    effects: {
      cashChangeCents: -100_000,
      automaticLiquidityChangeCents: 75_000,
      termDebtPrincipalChangeCents: -200_000,
      revolvingCreditUsedChangeCents: 30_000,
      annualLivingCostChangeCents: -120_000,
      requiredObligationsChangeCents: -10_000,
    },
    policyChanges: [
      {
        kind: "annual_living_cost",
        effectiveMonth: "2028-03",
        previousAnnualLivingCostCents: 6_000_000,
        resultingAnnualLivingCostCents: 5_880_000,
      },
    ],
    appendedLedgerTransactionIds: ["tx.action.preview.browser.invest_taxable"],
    appendedLedgerTransactions: [
      {
        id: "tx.action.preview.browser.invest_taxable",
        commandId: "action.preview.browser",
        effectiveMonth: "2028-03",
        reasonCode: "detailed_action_invest_taxable",
        description: "Invest cash in taxable broad index",
        sourceSystem: "detailed-actions-v2",
        category: "investment",
        causalReference: { kind: "command", id: "action.preview.browser" },
        postings: [
          { accountId: "asset.cash", debitCents: 0, creditCents: 100_000 },
          {
            accountId: "asset.taxable_broad_index",
            debitCents: 100_000,
            creditCents: 0,
          },
        ],
      },
    ],
  },
  activityMessage: "Action accepted: invest taxable.",
} as const satisfies PolicyPreviewSession;

const strategySession = {
  command: {
    schemaVersion: 2,
    id: "strategy.preview.browser",
    expectedRevision: 7,
    effectiveMonth: "2028-03",
    type: "set_recurring_strategy",
    payload: {
      strategy: {
        emergencyFundTargetMonthsPpm: 6_000_000,
        insuranceCoverageIds: [],
        preTax401kSalaryRatePpm: 100_000,
        preTaxHsaSalaryRatePpm: 20_000,
        afterTaxBroadIndexRatePpm: 150_000,
        afterTaxSectorRatePpm: 30_000,
        afterTaxSpeculativeRatePpm: 10_000,
        afterTaxIraRatePpm: 25_000,
        afterTaxExtraDebtRatePpm: 50_000,
      },
    },
  },
  response: {
    schemaVersion: 1,
    commandType: "set_recurring_strategy",
    actionPolicyVersion: null,
    commandChecksum: "4".repeat(64),
    openingStateChecksum: "5".repeat(64),
    resultingStateChecksum: "6".repeat(64),
    openingRevision: 7,
    resultingRevision: 8,
    effects: {
      cashChangeCents: 0,
      automaticLiquidityChangeCents: 0,
      termDebtPrincipalChangeCents: 0,
      revolvingCreditUsedChangeCents: 0,
      annualLivingCostChangeCents: 0,
      requiredObligationsChangeCents: 0,
    },
    policyChanges: [
      {
        kind: "recurring_strategy",
        effectiveMonth: "2028-03",
        previous: {
          effectiveMonth: "2028-02",
          preTax401kSalaryRatePpm: 0,
          preTaxHsaSalaryRatePpm: 0,
          afterTaxBroadIndexRatePpm: 0,
          afterTaxSectorRatePpm: 0,
          afterTaxSpeculativeRatePpm: 0,
          afterTaxIraRatePpm: 0,
          afterTaxExtraDebtRatePpm: 0,
        },
        resulting: {
          effectiveMonth: "2028-03",
          emergencyFundTargetMonthsPpm: 6_000_000,
          insuranceCoverageIds: [],
          preTax401kSalaryRatePpm: 100_000,
          preTaxHsaSalaryRatePpm: 20_000,
          afterTaxBroadIndexRatePpm: 150_000,
          afterTaxSectorRatePpm: 30_000,
          afterTaxSpeculativeRatePpm: 10_000,
          afterTaxIraRatePpm: 25_000,
          afterTaxExtraDebtRatePpm: 50_000,
        },
      },
    ],
    appendedLedgerTransactionIds: [],
    appendedLedgerTransactions: [],
  },
  activityMessage: "Recurring strategy updated.",
} as const satisfies PolicyPreviewSession;

describe("policy effect preview", () => {
  it("shows every immediate effect family, policy evidence, and ledger evidence before approval", () => {
    const html = renderToStaticMarkup(
      <PolicyPreviewPanel
        busy={false}
        session={session}
        onApprove={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(html).toContain("Review exact engine effects");
    expect(html).toContain("Cash");
    expect(html).toContain("-$1,000");
    expect(html).toContain("Automatic liquidity");
    expect(html).toContain("+$750");
    expect(html).toContain("Term debt principal");
    expect(html).toContain("-$2,000");
    expect(html).toContain("Revolving credit used");
    expect(html).toContain("+$300");
    expect(html).toContain("Annual living cost");
    expect(html).toContain("-$1,200");
    expect(html).toContain("Required obligations");
    expect(html).toContain("-$100");
    expect(html).toContain("Action policy 1.0.0");
    expect(html).toContain("$60,000");
    expect(html).toContain("$58,800");
    expect(html).toContain("Invest cash in taxable broad index");
    expect(html).toContain("Approve exact preview");
  });

  it("shows every recurring allocation before approval", () => {
    const html = renderToStaticMarkup(
      <PolicyPreviewPanel
        busy={false}
        session={strategySession}
        onApprove={() => undefined}
        onCancel={() => undefined}
      />,
    );

    for (const label of [
      "401(k)",
      "HSA",
      "Broad index",
      "Sector",
      "Speculative",
      "IRA",
      "Extra debt",
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("Recurring strategy policy");
    expect(html).toContain("Emergency target");
    expect(html).toContain("6 months");
    expect(html).toContain("Insurance");
    expect(html).toContain("none");
    expect(html).not.toContain("Historical action policy");
  });
});
