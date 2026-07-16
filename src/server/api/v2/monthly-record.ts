import type { MonthlyTurnV2Record } from "../../../core/monthly-turn-v2";

export function summarizeMonthlyRecord(record: MonthlyTurnV2Record) {
  const summary = {
    processedMonth: record.processedMonth,
    nextMonth: record.nextMonth,
    taxTraceId: record.taxTraceId,
    grossIncomeCents: record.grossIncomeCents,
    totalTaxCents: record.totalTaxCents,
    afterTaxCashIncomeCents: record.afterTaxCashIncomeCents,
    market: record.market,
    marketValueChangeCents: record.marketValueChangeCents,
    annualInflationIncreaseCents: record.annualInflationIncreaseCents,
    insurancePlayerCostCents: record.insurancePlayerCostCents,
    requiredCashCents: record.requiredCashCents,
    nonDebtObligationsPaidCents: record.nonDebtObligationsPaidCents,
    debtService: record.debtService,
    funding: record.funding,
    recurringAllocations: record.recurringAllocations,
    outcome: record.outcome,
  };
  if (record.financialKernelVersion === undefined) return summary;
  return {
    ...summary,
    financialKernelVersion: record.financialKernelVersion,
    ...(record.outcomePolicyVersion === undefined
      ? {}
      : { outcomePolicyVersion: record.outcomePolicyVersion }),
    openingNetWorthCents: record.openingNetWorthCents,
    closingNetWorthCents: record.closingNetWorthCents,
    openingAutomaticLiquidityCents: record.openingAutomaticLiquidityCents,
    closingAutomaticLiquidityCents: record.closingAutomaticLiquidityCents,
    resolvedIncomeCents: record.resolvedIncomeCents,
    resolvedExpenseCents: record.resolvedExpenseCents,
    monthlyObligationInflationIncreaseCents:
      record.monthlyObligationInflationIncreaseCents,
    cumulativePriceIndexPpm: record.cumulativePriceIndexPpm,
    baseNonDebtObligationsCents: record.baseNonDebtObligationsCents,
    fundingPlan: record.fundingPlan,
    shortfall: record.shortfall,
  };
}
