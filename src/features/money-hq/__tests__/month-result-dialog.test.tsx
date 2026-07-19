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
    taxBreakdown: {
      version: "monthly-tax-breakdown-v1",
      monthlyFederalIncomeTaxCents: 125_000,
      monthlyStateIncomeTaxCents: 20_000,
      monthlyEmployeePayrollTaxCents: 75_000,
      monthlySelfEmploymentTaxCents: 0,
      annualGrossIncomeCents: 12_000_000,
      annualTaxableIncomeCents: 11_400_000,
      annualFederalIncomeTaxCents: 1_500_000,
      annualStateIncomeTaxCents: 240_000,
      annualEmployeePayrollTaxCents: 900_000,
      annualSelfEmploymentTaxCents: 0,
      annualTotalTaxCents: 2_640_000,
      annualAfterTaxIncomeCents: 9_360_000,
      effectiveTaxRatePpm: 220_000,
      disclaimer: "Educational estimate only; not tax, legal, or financial advice.",
    },
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
    expect(markup).toContain("Federal income tax");
    expect(markup).toContain("State income tax");
    expect(markup).toContain("Social Security + Medicare");
    expect(markup).toContain("Total taxes and withholding");
    expect(markup).not.toContain(">Insurance cost<");
  });
});
