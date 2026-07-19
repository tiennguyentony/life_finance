import type { MonthlyTurnV2Record } from "../../core/monthly-turn-v2";

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
    ...(record.runtimeBalanceControllerVersion === undefined
      ? {}
      : {
          runtimeBalanceControllerVersion:
            record.runtimeBalanceControllerVersion,
        }),
    ...(record.runtimeBalanceDecision === undefined
      ? {}
      : {
          runtimeBalanceDecision: {
            version: record.runtimeBalanceDecision.version,
            controllerVersion:
              record.runtimeBalanceDecision.controllerVersion,
            policyVersion: record.runtimeBalanceDecision.policyVersion,
            impactEstimatorVersion:
              record.runtimeBalanceDecision.impactEstimatorVersion,
            difficulty: record.runtimeBalanceDecision.difficulty,
            candidateLimit: record.runtimeBalanceDecision.candidateLimit,
            warningStrength: record.runtimeBalanceDecision.warningStrength,
            status: record.runtimeBalanceDecision.status,
            nullReason: record.runtimeBalanceDecision.nullReason ?? null,
            approvedEventId:
              record.runtimeBalanceDecision.approved?.eventId ?? null,
            pressureBeforeUnits:
              record.runtimeBalanceDecision.pressureBeforeUnits,
            pressureAfterUnits:
              record.runtimeBalanceDecision.pressureAfterUnits,
            evaluatedCandidateCount:
              record.runtimeBalanceDecision.evaluatedCandidateCount,
            rejectionCodes: [
              ...new Set(
                record.runtimeBalanceDecision.candidates.flatMap(
                  ({ rejectionCodes }) => rejectionCodes,
                ),
              ),
            ],
            warningCodes: [
              ...new Set(
                record.runtimeBalanceDecision.candidates.flatMap(
                  ({ warningCodes }) => warningCodes,
                ),
              ),
            ],
          },
        }),
    ...(record.runtimeBalanceCandidateSet === undefined
      ? {}
      : { runtimeBalanceCandidateSet: record.runtimeBalanceCandidateSet }),
    ...(record.scenarioDirectorVersion === undefined
      ? {}
      : { scenarioDirectorVersion: record.scenarioDirectorVersion }),
    ...(record.scenarioDirectorDecision === undefined
      ? {}
      : {
          scenarioDirectorDecision: {
            version: record.scenarioDirectorDecision.version,
            policyVersion: record.scenarioDirectorDecision.policyVersion,
            riskVersion: record.scenarioDirectorDecision.riskVersion,
            riskAsOfMonth: record.scenarioDirectorDecision.riskAsOfMonth,
            difficulty: record.scenarioDirectorDecision.difficulty,
            macroRegime: record.scenarioDirectorDecision.macroRegime,
            rankingSource: record.scenarioDirectorDecision.rankingSource,
            candidateSetChecksum:
              record.scenarioDirectorDecision.candidateSetChecksum,
            rankingInputChecksum:
              record.scenarioDirectorDecision.rankingInputChecksum,
            rankedCandidateCount:
              record.scenarioDirectorDecision.ranked.length,
            topCandidateId:
              record.scenarioDirectorDecision.ranked[0]?.templateId ?? null,
          },
        }),
    ...(record.scenarioDirectorAiEvidence === undefined
      ? {}
      : { scenarioDirectorAiEvidence: record.scenarioDirectorAiEvidence }),
    ...(record.operationalEventRankerEvidence === undefined
      ? {}
      : {
          operationalEventRankerEvidence:
            record.operationalEventRankerEvidence,
        }),
  };
}
