import type { CheckpointEvidenceV2 } from "./checkpoint-v2";
import { sha256Canonical } from "./canonical";
import { safeBigIntToNumber } from "./domain/integer";
import type { FinancialGoalProjection } from "./financial-goals-v2";
import type { ExposureSnapshot } from "./game-state-v2";
import type { MonthlyTurnV2Record } from "./monthly-turn-v2";
import type { RiskSnapshotV1 } from "./risk-v1";
import {
  createTeachingFactPacketV2,
  type TeachingFactSourceV2,
  type TeachingFactV2,
  type TeachingFactValueV2,
} from "./teaching-facts-v2";
import {
  TeachingPresentationV2Error,
  type MissingTeachingDimensionV2,
  type TeachingCheckpointV2,
} from "./teaching-presentation-v2";

export type TeachingMonthlyOwnerRecordV2 = Readonly<{
  resultingRevision: number;
  recordChecksum: string;
  record: MonthlyTurnV2Record;
}>;

export type TeachingCheckpointOwnerBundleV2 = Readonly<{
  evidence: CheckpointEvidenceV2;
  fromRevision: number;
  toRevision: number;
  endingStateChecksum: string;
  monthlyRecords: readonly TeachingMonthlyOwnerRecordV2[];
  startRisk: RiskSnapshotV1;
  endRisk: RiskSnapshotV1;
  endGoal: FinancialGoalProjection;
  endExposure: ExposureSnapshot | null;
}>;

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function sum(values: readonly number[], label: string): number {
  return safeBigIntToNumber(
    values.reduce((total, value) => total + BigInt(value), BigInt(0)),
    label,
  );
}

function contribution(record: MonthlyTurnV2Record): number {
  if (record.recurringAllocations === null) return 0;
  const allocation = record.recurringAllocations;
  return sum([
    allocation.preTax.employee401kCents,
    allocation.preTax.hsaCents,
    allocation.afterTax.broadIndexCents,
    allocation.afterTax.sectorCents,
    allocation.afterTax.speculativeCents,
    allocation.afterTax.iraCents,
  ], "teaching checkpoint employee contributions");
}

function monthlySource(
  bundle: TeachingCheckpointOwnerBundleV2,
  field: string,
): TeachingFactSourceV2 {
  const sourceIds = bundle.monthlyRecords.map(
    ({ record }) => `monthly:${record.commandId}`,
  );
  if (sourceIds.length === 0) {
    const sourceId = `checkpoint:${sha256Canonical(bundle.evidence)}`;
    return {
      kind: "checkpoint",
      sourceId,
      supportingSourceIds: [sourceId],
      field,
      revision: bundle.toRevision,
      month: bundle.evidence.end.month,
    };
  }
  return {
    kind: "monthly_record",
    sourceId: sourceIds[0]!,
    supportingSourceIds: sourceIds,
    field,
    revision: bundle.toRevision,
    month: bundle.evidence.end.month,
  };
}

function stateSource(
  bundle: TeachingCheckpointOwnerBundleV2,
  field: string,
): TeachingFactSourceV2 {
  const sourceId = `state:${bundle.toRevision}:${bundle.endingStateChecksum}`;
  return {
    kind: "game_state",
    sourceId,
    supportingSourceIds: [sourceId],
    field,
    revision: bundle.toRevision,
    month: bundle.evidence.end.month,
  };
}

function goalSource(
  bundle: TeachingCheckpointOwnerBundleV2,
  field: string,
): TeachingFactSourceV2 {
  const sourceId = `goal:${bundle.toRevision}:${sha256Canonical(bundle.endGoal)}`;
  return {
    kind: "goal_result",
    sourceId,
    supportingSourceIds: [sourceId],
    field,
    revision: bundle.toRevision,
    month: bundle.evidence.end.month,
  };
}

function exposureSource(
  bundle: TeachingCheckpointOwnerBundleV2,
  field: string,
): TeachingFactSourceV2 {
  const sourceId = `exposure:${bundle.evidence.end.month}:${sha256Canonical(bundle.endExposure)}`;
  return {
    kind: "exposure_snapshot",
    sourceId,
    supportingSourceIds: [sourceId],
    field,
    revision: bundle.toRevision,
    month: bundle.evidence.end.month,
  };
}

function riskSource(
  bundle: TeachingCheckpointOwnerBundleV2,
  metricId: string,
  field: string,
): TeachingFactSourceV2 {
  const sourceId = `risk:${bundle.endRisk.asOfMonth}:${bundle.endRisk.version}.${metricId}`;
  return {
    kind: "risk_snapshot",
    sourceId,
    supportingSourceIds: [sourceId],
    field,
    revision: bundle.toRevision,
    month: bundle.endRisk.asOfMonth,
  };
}

function assertOwnerBundle(bundle: TeachingCheckpointOwnerBundleV2): void {
  const { evidence, monthlyRecords } = bundle;
  if (
    evidence.evidenceVersion !== "checkpoint-v2.1" ||
    !/^[a-f0-9]{64}$/.test(bundle.endingStateChecksum) ||
    bundle.fromRevision < 0 ||
    bundle.toRevision < bundle.fromRevision ||
    monthlyRecords.length !== evidence.monthsProcessed ||
    evidence.monthlyCommandIds.some(
      (id, index) => monthlyRecords[index]?.record.commandId !== id,
    ) ||
    evidence.taxTraceIds.some(
      (id, index) => monthlyRecords[index]?.record.taxTraceId !== id,
    ) ||
    (monthlyRecords.length > 0 &&
      (monthlyRecords[0]!.record.processedMonth !== evidence.start.month ||
        monthlyRecords[monthlyRecords.length - 1]!.record.nextMonth !==
          evidence.end.month)) ||
    monthlyRecords.some(
      ({ record }, index) =>
        index > 0 &&
        monthlyRecords[index - 1]!.record.nextMonth !== record.processedMonth,
    ) ||
    monthlyRecords.some(
      ({ record, recordChecksum }) => sha256Canonical(record) !== recordChecksum,
    ) ||
    monthlyRecords.some(
      ({ resultingRevision }, index) =>
        !Number.isSafeInteger(resultingRevision) ||
        resultingRevision <= bundle.fromRevision ||
        resultingRevision > bundle.toRevision ||
        (index > 0 &&
          resultingRevision <= monthlyRecords[index - 1]!.resultingRevision),
    ) ||
    bundle.startRisk.asOfMonth !== evidence.start.month ||
    bundle.endRisk.asOfMonth !== evidence.end.month ||
    bundle.endGoal.investableAssetsCents !== evidence.end.investableAssetsCents ||
    bundle.endGoal.targetCents !== evidence.end.financialIndependenceTargetCents ||
    bundle.endGoal.progressPpm !== evidence.end.financialIndependenceProgressPpm ||
    sum(monthlyRecords.map(({ record }) => record.grossIncomeCents), "gross income") !==
      evidence.totalGrossIncomeCents ||
    sum(monthlyRecords.map(({ record }) => record.afterTaxCashIncomeCents), "after-tax income") !==
      evidence.totalAfterTaxCashIncomeCents ||
    sum(monthlyRecords.map(({ record }) => record.requiredCashCents), "required cash") !==
      evidence.totalRequiredCashCents ||
    sum(monthlyRecords.map(({ record }) => record.marketValueChangeCents), "market value change") !==
      evidence.totalMarketValueChangeCents ||
    sum(monthlyRecords.map(({ record }) => record.debtService.totalScheduledPaymentCents), "debt payments") !==
      evidence.totalDebtPaymentsCents ||
    sum(monthlyRecords.map(({ record }) => record.debtService.totalInterestCents), "debt interest") !==
      evidence.totalDebtInterestCents
  ) {
    throw new TeachingPresentationV2Error("INVALID_INPUT");
  }
}

export function buildTeachingCheckpointFromOwnersV2(
  bundle: TeachingCheckpointOwnerBundleV2,
): TeachingCheckpointV2 {
  assertOwnerBundle(bundle);
  const records = bundle.monthlyRecords.map(({ record }) => record);
  const fact = (
    factId: string,
    labelId: string,
    value: TeachingFactValueV2,
    source: TeachingFactSourceV2,
  ): TeachingFactV2 => ({ factId, labelId, value, source });
  const monthlyFact = (
    factId: string,
    labelId: string,
    value: number,
    field: string,
  ) => fact(factId, labelId, { kind: "money_cents", value }, monthlySource(bundle, field));
  const facts: TeachingFactV2[] = [
    monthlyFact("checkpoint.total_gross_income_cents", "gross_income", bundle.evidence.totalGrossIncomeCents, "records.grossIncomeCents"),
    monthlyFact("checkpoint.total_after_tax_income_cents", "after_tax_income", bundle.evidence.totalAfterTaxCashIncomeCents, "records.afterTaxCashIncomeCents"),
    monthlyFact("checkpoint.total_required_cash_cents", "total_required_cash", bundle.evidence.totalRequiredCashCents, "records.requiredCashCents"),
    monthlyFact("checkpoint.total_debt_payments_cents", "debt_payments", bundle.evidence.totalDebtPaymentsCents, "records.debtService.totalScheduledPaymentCents"),
    monthlyFact("checkpoint.total_debt_interest_cents", "debt_interest", bundle.evidence.totalDebtInterestCents, "records.debtService.totalInterestCents"),
    monthlyFact("checkpoint.total_market_value_change_cents", "market_value_change", bundle.evidence.totalMarketValueChangeCents, "records.marketValueChangeCents"),
    monthlyFact("checkpoint.total_employee_contributions_cents", "employee_contributions", sum(records.map(contribution), "employee contributions"), "records.recurringAllocations"),
    monthlyFact("checkpoint.total_employer_match_cents", "employer_match", sum(records.map((record) => record.recurringAllocations?.preTax.employer401kMatchCents ?? 0), "employer match"), "records.recurringAllocations.preTax.employer401kMatchCents"),
    fact("checkpoint.net_worth_change_cents", "net_worth_change", { kind: "money_cents", value: bundle.evidence.netWorthChangeCents }, { ...stateSource(bundle, "checkpointEvidence.netWorthChangeCents"), kind: "checkpoint", sourceId: `checkpoint:${sha256Canonical(bundle.evidence)}`, supportingSourceIds: [`checkpoint:${sha256Canonical(bundle.evidence)}`] }),
    fact("checkpoint.investable_assets_change_cents", "investable_assets_change", { kind: "money_cents", value: bundle.evidence.investableAssetsChangeCents }, { ...stateSource(bundle, "checkpointEvidence.investableAssetsChangeCents"), kind: "checkpoint", sourceId: `checkpoint:${sha256Canonical(bundle.evidence)}`, supportingSourceIds: [`checkpoint:${sha256Canonical(bundle.evidence)}`] }),
    fact("checkpoint.liabilities_change_cents", "liabilities_change", { kind: "money_cents", value: bundle.evidence.liabilitiesChangeCents }, { ...stateSource(bundle, "checkpointEvidence.liabilitiesChangeCents"), kind: "checkpoint", sourceId: `checkpoint:${sha256Canonical(bundle.evidence)}`, supportingSourceIds: [`checkpoint:${sha256Canonical(bundle.evidence)}`] }),
    fact("checkpoint.closing_cash_cents", "closing_cash", { kind: "money_cents", value: bundle.evidence.end.cashCents }, stateSource(bundle, "finances.cashCents")),
    fact("checkpoint.fi_target_cents", "financial_independence_target", { kind: "money_cents", value: bundle.endGoal.targetCents }, goalSource(bundle, "targetCents")),
    fact("checkpoint.fi_progress_ppm", "financial_independence_progress", { kind: "rate_ppm", value: bundle.endGoal.progressPpm }, goalSource(bundle, "progressPpm")),
    fact("checkpoint.age_years", "age", { kind: "years", value: bundle.evidence.end.ageYears }, stateSource(bundle, "player.ageYears")),
  ];
  const missingDimensions: MissingTeachingDimensionV2[] = [];
  // Neither base non-debt obligations nor event expenses are owner-labeled
  // essential/discretionary consumption categories.
  missingDimensions.push(
    { dimensionId: "essential_spending", reasonCode: "source_not_recorded" },
    { dimensionId: "discretionary_spending", reasonCode: "source_not_recorded" },
  );
  for (const metric of Object.values(bundle.endRisk.metrics)) {
    const value = metric.rawValue;
    if (value !== null) {
      const kind = metric.unit === "months_ppm"
        ? "months_ppm" as const
        : metric.unit === "money_cents_per_month"
          ? "money_cents" as const
          : "rate_ppm" as const;
      facts.push(fact(
        `checkpoint.risk.${metric.id}.value`,
        metric.id,
        { kind, value },
        riskSource(bundle, metric.id, `metrics.${metric.id}.rawValue`),
      ));
    }
    facts.push(fact(
      `checkpoint.risk.${metric.id}.band`,
      `${metric.id}_band`,
      { kind: "enum", value: metric.band },
      riskSource(bundle, metric.id, `metrics.${metric.id}.band`),
    ));
  }
  if (bundle.endRisk.metrics.emergency_fund_months.rawValue === null) {
    missingDimensions.push({ dimensionId: "emergency_fund_months", reasonCode: "source_unknown" });
  }
  if (bundle.endRisk.metrics.liquid_resource_coverage.rawValue === null) {
    missingDimensions.push({ dimensionId: "liquid_solvency", reasonCode: "source_unknown" });
  }
  if (bundle.endExposure?.debtToIncomePpm !== null && bundle.endExposure !== null) {
    facts.push(fact("checkpoint.current_debt_to_income_ppm", "current_debt_to_income", { kind: "rate_ppm", value: bundle.endExposure.debtToIncomePpm! }, exposureSource(bundle, "debtToIncomePpm")));
  }
  facts.push(fact("checkpoint.current_risk_score_ppm", "current_risk_score", { kind: "rate_ppm", value: bundle.endRisk.aggregateSeverityPpm }, riskSource(bundle, "aggregate", "aggregateSeverityPpm")));
  return deepFreeze({
    version: "teaching-checkpoint-v2",
    evidenceVersion: bundle.evidence.evidenceVersion,
    monthsAggregated: bundle.evidence.monthsProcessed,
    facts: createTeachingFactPacketV2({
      asOfRevision: bundle.toRevision,
      asOfMonth: bundle.evidence.end.month,
      facts,
    }),
    missingDimensions,
    policyAdjustmentAvailable: true,
  }) as TeachingCheckpointV2;
}
