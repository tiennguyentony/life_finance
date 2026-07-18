import {
  divideRoundHalfAwayFromZero,
  safeBigIntToNumber,
} from "./domain/integer";
import { simulationMonth } from "./domain/month";
import {
  RISK_ANALYZER_V1_VERSION,
  RISK_METRIC_POLICIES_V1,
  type RiskMetricId,
} from "./risk-policy-v1";
import type { RiskMetricV1, RiskSnapshotV1 } from "./risk-v1";

const PPM = 1_000_000;

export const PREPAREDNESS_ASSESSMENT_V1_VERSION =
  "preparedness-assessment-v1" as const;

export const PREPAREDNESS_POLICY_V1 = Object.freeze({
  version: PREPAREDNESS_ASSESSMENT_V1_VERSION,
  neutralPpm: 500_000,
  weightsPpm: Object.freeze({
    liquidity: 350_000,
    cashFlow: 250_000,
    debt: 200_000,
    insurance: 150_000,
    diversification: 50_000,
  }),
});

export type PreparednessBandV1 =
  | "critical"
  | "exposed"
  | "stable"
  | "resilient";

export type PreparednessAssessmentV1 = Readonly<{
  version: typeof PREPAREDNESS_ASSESSMENT_V1_VERSION;
  riskVersion: RiskSnapshotV1["version"];
  asOfMonth: RiskSnapshotV1["asOfMonth"];
  scorePpm: number;
  band: PreparednessBandV1;
  components: Readonly<{
    liquidityPpm: number;
    cashFlowPpm: number;
    debtPpm: number;
    insurancePpm: number;
    diversificationPpm: number;
  }>;
}>;

function fail(message: string): never {
  throw new RangeError(`invalid Risk V1 preparedness evidence: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateMetric(id: RiskMetricId, value: unknown): RiskMetricV1 {
  if (!isRecord(value) || value.id !== id) fail(`${id} identity does not match`);
  if (
    value.normalizedInput !== null &&
    !Number.isSafeInteger(value.normalizedInput)
  ) {
    fail(`${id} normalized input must be a safe integer or null`);
  }
  if (
    !Number.isSafeInteger(value.severityPpm) ||
    (value.severityPpm as number) < 0 ||
    (value.severityPpm as number) > PPM
  ) {
    fail(`${id} severity must be an integer between 0 and ${PPM}`);
  }
  return value as unknown as RiskMetricV1;
}

function validateSnapshot(snapshot: RiskSnapshotV1): void {
  if (!isRecord(snapshot) || snapshot.version !== RISK_ANALYZER_V1_VERSION) {
    fail(`version must be ${RISK_ANALYZER_V1_VERSION}`);
  }
  if (typeof snapshot.asOfMonth !== "string") fail("as-of month is missing");
  try {
    simulationMonth(snapshot.asOfMonth);
  } catch {
    fail("as-of month must use YYYY-MM");
  }
  if (!isRecord(snapshot.metrics)) fail("metrics must be a record");
  const expectedIds = Object.keys(RISK_METRIC_POLICIES_V1).toSorted();
  const actualIds = Object.keys(snapshot.metrics).toSorted();
  if (actualIds.join("|") !== expectedIds.join("|")) {
    fail("metrics must contain exactly the Risk V1 metric set");
  }
  for (const id of expectedIds as RiskMetricId[]) {
    validateMetric(id, snapshot.metrics[id]);
  }
}

function preparedKnown(metric: RiskMetricV1): number | null {
  return metric.normalizedInput === null ? null : PPM - metric.severityPpm;
}

function preparedOrNeutral(metric: RiskMetricV1): number {
  return preparedKnown(metric) ?? PREPAREDNESS_POLICY_V1.neutralPpm;
}

function minimumKnown(values: readonly (number | null)[]): number {
  const known = values.filter((value): value is number => value !== null);
  return known.length === 0
    ? PREPAREDNESS_POLICY_V1.neutralPpm
    : Math.min(...known);
}

function bandFor(scorePpm: number): PreparednessBandV1 {
  if (scorePpm < 250_000) return "critical";
  if (scorePpm < 500_000) return "exposed";
  if (scorePpm < 750_000) return "stable";
  return "resilient";
}

export function assessPreparednessV1(
  snapshot: RiskSnapshotV1,
): PreparednessAssessmentV1 {
  validateSnapshot(snapshot);
  const { metrics } = snapshot;
  const components = Object.freeze({
    liquidityPpm: Math.min(
      preparedOrNeutral(metrics.emergency_fund_months),
      preparedOrNeutral(metrics.liquid_resource_coverage),
    ),
    cashFlowPpm: Math.min(
      preparedOrNeutral(metrics.monthly_free_cash_flow),
      preparedOrNeutral(metrics.fixed_cost_ratio),
      preparedOrNeutral(metrics.lifestyle_rigidity),
    ),
    debtPpm: Math.min(
      preparedOrNeutral(metrics.debt_service_ratio),
      preparedOrNeutral(metrics.high_interest_debt_burden),
      preparedOrNeutral(metrics.interest_burden),
    ),
    insurancePpm: preparedOrNeutral(metrics.insurance_protection_gap),
    diversificationPpm: minimumKnown([
      preparedKnown(metrics.portfolio_concentration),
      preparedKnown(metrics.job_investment_sector_correlation),
    ]),
  });
  const weights = PREPAREDNESS_POLICY_V1.weightsPpm;
  const weightedTotal =
    BigInt(components.liquidityPpm) * BigInt(weights.liquidity) +
    BigInt(components.cashFlowPpm) * BigInt(weights.cashFlow) +
    BigInt(components.debtPpm) * BigInt(weights.debt) +
    BigInt(components.insurancePpm) * BigInt(weights.insurance) +
    BigInt(components.diversificationPpm) * BigInt(weights.diversification);
  const scorePpm = safeBigIntToNumber(
    divideRoundHalfAwayFromZero(weightedTotal, BigInt(PPM)),
    "preparedness score",
  );

  return Object.freeze({
    version: PREPAREDNESS_ASSESSMENT_V1_VERSION,
    riskVersion: snapshot.version,
    asOfMonth: snapshot.asOfMonth,
    scorePpm,
    band: bandFor(scorePpm),
    components,
  });
}
