import type { MonthlyTurnV2Record } from "../../../core/monthly-turn-v2";

export function summarizeMonthlyRecord(record: MonthlyTurnV2Record) {
  return {
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
}
