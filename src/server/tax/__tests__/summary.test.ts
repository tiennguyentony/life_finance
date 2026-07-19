import { describe, expect, it } from "vitest";

import { createLocalDemoRuntime } from "@/server/demo/runtime";

describe("TaxSummaryService", () => {
  it("returns a reconciled authoritative estimate for a new run", async () => {
    const runtime = createLocalDemoRuntime();
    const created = await runtime.createRun();

    const summary = await runtime
      .createTaxSummaryReader()
      .getSummary(created.runId, created.accessSecret);

    expect(summary.status).toBe("available");
    expect(summary.asOfMonth).toBe(created.state.currentMonth);
    expect(summary.jurisdiction.stateCode).toBe("WA");
    expect(summary.paycheckEstimate.totalTaxCents).toBe(
      summary.paycheckEstimate.federalIncomeTaxCents +
        summary.paycheckEstimate.stateIncomeTaxCents +
        summary.paycheckEstimate.employeePayrollTaxCents +
        summary.paycheckEstimate.selfEmploymentTaxCents,
    );
    expect(summary.paycheckEstimate.afterTaxCashIncomeCents).toBe(
      summary.paycheckEstimate.grossIncomeCents -
        summary.paycheckEstimate.employee401kContributionCents -
        summary.paycheckEstimate.employeeHsaContributionCents -
        summary.paycheckEstimate.totalTaxCents,
    );
    expect(summary.annualEstimate.annualTotalTaxCents).toBe(
      summary.annualEstimate.annualFederalIncomeTaxCents +
        summary.annualEstimate.annualStateIncomeTaxCents +
        summary.annualEstimate.annualEmployeePayrollTaxCents +
        summary.annualEstimate.annualSelfEmploymentTaxCents,
    );
    expect(summary.annualEstimate.annualAfterTaxIncomeCents).toBe(
      summary.annualEstimate.annualGrossIncomeCents -
        summary.annualEstimate.annualTotalTaxCents,
    );
    expect(summary.yearToDate).toMatchObject({
      paychecksProcessed: 0,
      grossIncomeCents: 0,
      totalTaxCents: 0,
      afterTaxCashIncomeCents: 0,
    });
    expect(summary.settlement).toMatchObject({
      projectedRefundCents: 0,
      projectedAmountDueCents: 0,
    });
    expect(summary.stateContext.hasModeledStateIncomeTax).toBe(false);
  });

  it("rejects a caller that does not own the run secret", async () => {
    const runtime = createLocalDemoRuntime();
    const created = await runtime.createRun();

    await expect(
      runtime
        .createTaxSummaryReader()
        .getSummary(created.runId, `lf_run_${"z".repeat(43)}`),
    ).rejects.toMatchObject({ code: "NOT_FOUND_OR_UNAUTHORIZED" });
  });
});
