import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { BoardMonthResult } from "@/features/board/board-model";

import { HqMonthResultDialog } from "../dialogs/month-result-dialog";

const RESULT: BoardMonthResult = {
  fromMonth: "2026-07",
  toMonth: "2026-08",
  planLabel: "Reduce lifestyle costs",
  cashChangeCents: 12_500,
  netWorthChangeCents: 15_000,
  debtChangeCents: -5_000,
  taxableInvestmentsChangeCents: 50_000,
  annualLivingCostChangeCents: -120_000,
  requiredObligationsChangeCents: -10_000,
  annualGrossSalaryChangeCents: 240_000,
  goalProgressChangePpm: 4_000,
  riskSeverityChangePpm: -5_000,
  preparednessScoreChangePpm: 7_000,
  emergencyFundTargetMonthsPpm: 6_000_000,
  hasPendingEvent: false,
  startedProgramIds: [],
  completedProgramIds: [],
  beginnerCheckpoint: null,
  monthlyExplanation: {
    processedMonth: "2026-07",
    grossIncomeCents: 1_000_000,
    totalTaxCents: 220_000,
    afterTaxCashIncomeCents: 730_000,
    resolvedIncomeCents: 50_000,
    resolvedExpenseCents: 25_000,
    marketValueChangeCents: -12_500,
    annualInflationIncreaseCents: 14_300,
    insurancePlayerCostCents: 184_000,
    requiredCashCents: 555_659,
    debtInterestCents: 8_000,
    debtPaymentCents: 25_000,
  },
};

describe("Money HQ month result", () => {
  it("renders every material engine-owned action and monthly-flow field", () => {
    const markup = renderToStaticMarkup(
      <HqMonthResultDialog onDismiss={() => undefined} result={RESULT} />,
    );

    expect(markup).toContain("Taxable investments");
    expect(markup).toContain("Annual living cost");
    expect(markup).toContain("Required monthly obligations");
    expect(markup).toContain("Annual gross salary");
    expect(markup).toContain("Event and other income");
    expect(markup).toContain("Event and other expenses");
    expect(markup).toContain("Insurance claim cost");
    expect(markup).not.toContain(">Insurance cost<");
  });
});
