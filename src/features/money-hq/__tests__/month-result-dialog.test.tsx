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

    // Delta tiles.
    expect(markup).toContain("Taxable funds");
    expect(markup).toContain("Goal progress");
    expect(markup).toContain("Preparedness");

    // Monthly flow bars.
    expect(markup).toContain("Paycheck (gross)");
    expect(markup).toContain("Taxes withheld");
    expect(markup).toContain("Bills and essentials");
    expect(markup).toContain("Event income");
    expect(markup).toContain("Event costs");
    expect(markup).toContain("Insurance claim");
    expect(markup).toContain("Debt interest");
    expect(markup).toContain("Debt payments");
    expect(markup).toContain("Market movement");

    // Tax detail chips.
    expect(markup).toContain("Federal");
    expect(markup).toContain("State");
    expect(markup).toContain("Social Security + Medicare");

    // Annual-rate shifts land in the recurring chips.
    expect(markup).toContain("Inflation");
    expect(markup).toContain("Living costs");
    expect(markup).toContain("Monthly bills");
    expect(markup).toContain("Salary");
  });

  it("draws flow bars scaled against the largest monthly amount", () => {
    const markup = renderToStaticMarkup(
      <HqMonthResultDialog onDismiss={() => undefined} result={RESULT} />,
    );

    // Gross income is the largest flow, so its bar spans the full track.
    expect(markup).toContain("width:100%");
    // Every flow renders a bar.
    expect(markup.match(/hq-flow-bar/g)?.length).toBe(9);
  });
});
