import {
  divideRoundHalfAwayFromZero,
  safeBigIntToNumber,
} from "./domain/integer";
import { ratePpm, type RatePpm } from "./domain/money";
import {
  calculateMonthlyDebtInterestV2,
  calculateTotalMinimumDebtPaymentV2,
} from "./debt-service-v2";
import { monthsBetween } from "./domain/month";
import type { GameStateV2 } from "./game-state-v2";
import { activeInsuranceCoveragesV2 } from "./insurance-selection-v2";
import { projectFinancialGoal } from "./financial-goals-v2";
import {
  calculateRevolvingCreditInterestV2,
  calculateRevolvingCreditScheduledPaymentV2,
} from "./revolving-credit-v2";
import {
  RISK_ANALYZER_V1_VERSION,
  RISK_CALCULATION_CONSTANTS_V1,
  RISK_METRIC_POLICIES_V1,
  RISK_METRIC_WEIGHTS_V1,
  type RiskMetricId,
  type RiskMetricPolicy,
  type RiskMetricUnit,
} from "./risk-policy-v1";

export { RISK_ANALYZER_V1_VERSION } from "./risk-policy-v1";

const PPM = RISK_CALCULATION_CONSTANTS_V1.partsPerMillion;

export type RiskSeverityBand =
  | "low"
  | "moderate"
  | "high"
  | "severe"
  | "unknown";

export type RiskMetricV1 = Readonly<{
  id: RiskMetricId;
  rawValue: number | null;
  unit: RiskMetricUnit;
  normalizedInput: number | null;
  normalizedUnit: "ratio_ppm" | "months_ppm";
  severityPpm: RatePpm;
  band: RiskSeverityBand;
  thresholds: RiskMetricPolicy["thresholds"];
}>;

export type RiskFactV1 = Readonly<{
  factId: string;
  metricId: RiskMetricId;
  factCode: string;
  rawValue: number | null;
  unit: RiskMetricUnit;
  normalizedInput: number | null;
  normalizedUnit: "ratio_ppm" | "months_ppm";
  band: RiskSeverityBand;
}>;

export type RiskSnapshotV1 = Readonly<{
  version: typeof RISK_ANALYZER_V1_VERSION;
  asOfMonth: GameStateV2["currentMonth"];
  metrics: Readonly<Record<RiskMetricId, RiskMetricV1>>;
  aggregateSeverityPpm: RatePpm;
  weaknessTags: readonly string[];
  facts: readonly RiskFactV1[];
}>;

type MetricInput = Readonly<{
  rawValue: number | null;
  normalizedInput: number | null;
}>;

function ratioPpm(
  numerator: number | bigint,
  denominator: number | bigint,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (BigInt(denominator) <= 0) return 0;
  const value = safeBigIntToNumber(
    divideRoundHalfAwayFromZero(
      BigInt(numerator) * BigInt(PPM),
      BigInt(denominator),
    ),
    "risk ratio",
  );
  return Math.max(-maximum, Math.min(maximum, value));
}

function ratioAgainstPositiveIncome(
  value: number,
  income: number,
  maximum: number = PPM,
): number {
  if (value <= 0) return 0;
  if (income <= 0) return maximum;
  return ratioPpm(value, income, maximum);
}

function monthlyIncome(state: GameStateV2): number {
  if (state.gameplay.employment.status !== "employed") return 0;
  return Math.max(
    0,
    safeBigIntToNumber(
      divideRoundHalfAwayFromZero(
        BigInt(state.gameplay.employment.annualGrossSalaryCents),
        BigInt(12),
      ),
      "gross monthly income",
    ),
  );
}

function sum(values: readonly number[], label: string): number {
  return safeBigIntToNumber(
    values.reduce((total, value) => total + BigInt(value), BigInt(0)),
    label,
  );
}

function allInvestableAssets(state: GameStateV2): number {
  return sum(Object.values(state.gameplay.portfolio), "investable assets");
}

function totalMinimumDebtPayment(state: GameStateV2): number {
  const termMinimums = calculateTotalMinimumDebtPaymentV2(
    state.gameplay.debts.termDebts,
  );
  const revolvingMinimum = calculateRevolvingCreditScheduledPaymentV2(
    state.gameplay.debts.revolvingCreditUsedCents,
  );
  return sum([termMinimums, revolvingMinimum], "minimum debt service");
}

function highInterestPrincipal(state: GameStateV2): number {
  return sum(
    [
      ...state.gameplay.debts.termDebts
        .filter(
          ({ annualInterestRatePpm }) =>
            annualInterestRatePpm >=
            RISK_CALCULATION_CONSTANTS_V1.highInterestAnnualRateThresholdPpm,
        )
        .map(({ principalCents }) => Math.max(0, principalCents)),
      Math.max(0, state.gameplay.debts.revolvingCreditUsedCents),
    ],
    "high interest principal",
  );
}

function estimatedMonthlyInterest(state: GameStateV2): number {
  const termInterest = sum(
    state.gameplay.debts.termDebts.map((debt) =>
      calculateMonthlyDebtInterestV2(
        debt.principalCents,
        debt.annualInterestRatePpm,
      ),
    ),
    "monthly term debt interest",
  );
  const revolvingInterest = calculateRevolvingCreditInterestV2(
    state.gameplay.debts.revolvingCreditUsedCents,
  );
  return sum([termInterest, revolvingInterest], "monthly interest burden");
}

function insuranceGap(state: GameStateV2): number | null {
  const snapshot = state.gameplay.catalogSnapshot;
  if (!snapshot || state.gameplay.employment.status !== "employed") return null;
  const salary = BigInt(
    Math.max(0, state.gameplay.employment.annualGrossSalaryCents),
  );
  const homeNeed = BigInt(Math.max(0, state.finances.homeValueCents));
  const contentsNeed = BigInt(Math.max(0, state.finances.otherAssetsCents));
  const incomeNeed = salary;
  const lifeNeed = snapshot.selected.household.dependentCount > 0
    ? salary *
      BigInt(
        RISK_CALCULATION_CONSTANTS_V1.dependentLifeInsuranceIncomeYears,
      )
    : BigInt(0);
  let propertyCoverage = BigInt(0);
  let incomeCoverage = BigInt(0);
  let lifeCoverage = BigInt(0);
  for (const coverage of activeInsuranceCoveragesV2(state)) {
    const usableCoverage = BigInt(
      Math.max(0, coverage.coverageLimitCents - coverage.deductibleCents),
    );
    if (coverage.kind === "renters") propertyCoverage += usableCoverage;
    if (
      coverage.kind === "short_term_disability" ||
      coverage.kind === "long_term_disability"
    ) {
      incomeCoverage += usableCoverage;
    }
    if (coverage.kind === "term_life") lifeCoverage += usableCoverage;
  }
  const needs = homeNeed + contentsNeed + incomeNeed + lifeNeed;
  if (needs === BigInt(0)) return 0;
  const uncovered =
    homeNeed +
    (contentsNeed > propertyCoverage
      ? contentsNeed - propertyCoverage
      : BigInt(0)) +
    (incomeNeed > incomeCoverage ? incomeNeed - incomeCoverage : BigInt(0)) +
    (lifeNeed > lifeCoverage ? lifeNeed - lifeCoverage : BigInt(0));
  return ratioPpm(uncovered, needs, PPM);
}

function retirementReadiness(state: GameStateV2): number {
  const configuredGoal = state.gameplay.financialGoal;
  const desiredAnnualSpending = Math.max(
    0,
    configuredGoal?.source === "player_selected"
      ? configuredGoal.desiredAnnualSpendingCents
      : state.finances.annualLivingCostCents,
  );
  if (desiredAnnualSpending === 0) return PPM;
  const target = BigInt(
    projectFinancialGoal(state.finances, configuredGoal).targetCents,
  );
  const retirementAssets = BigInt(
    sum(
      [
        state.gameplay.portfolio.retirement401kCents,
        state.gameplay.portfolio.retirementIraCents,
        state.gameplay.portfolio.retirementLegacyUnclassifiedCents,
        state.gameplay.portfolio.hsaCents,
      ].map((value) => Math.max(0, value)),
      "retirement assets",
    ),
  );
  return Math.min(PPM, ratioPpm(retirementAssets, target, PPM));
}

function recentPlayerEventCosts(state: GameStateV2): number {
  const window = RISK_CALCULATION_CONSTANTS_V1.recentStressWindowMonths;
  return sum(
    state.gameplay.eventLifecycle.history
      .filter(({ resolvedMonth }) => {
        const age = monthsBetween(resolvedMonth, state.currentMonth);
        return age >= 0 && age < window;
      })
      .map(({ playerCostCents }) => Math.max(0, playerCostCents)),
    "recent player event costs",
  );
}

function calculateMetricInputs(state: GameStateV2): Record<RiskMetricId, MetricInput> {
  const income = monthlyIncome(state);
  const revolvingMinimum = calculateRevolvingCreditScheduledPaymentV2(
    state.gameplay.debts.revolvingCreditUsedCents,
  );
  const required = Math.max(
    0,
    state.finances.requiredObligationsCents + revolvingMinimum,
  );
  const cash = Math.max(0, state.finances.cashCents);
  const revolvingDebt = Math.max(0, state.gameplay.debts.revolvingCreditUsedCents);
  // A credit draw can provide transaction liquidity, but it does not create an
  // emergency fund. Count only cash that remains after revolving debt.
  const unborrowedCash = Math.max(0, cash - revolvingDebt);
  const debtService = totalMinimumDebtPayment(state);
  const annualIncome = Math.max(0, income * 12);
  const freeCashFlow = safeBigIntToNumber(
    BigInt(income) - BigInt(required),
    "monthly free cash flow",
  );
  const investable = allInvestableAssets(state);
  const riskyPortfolio = sum(
    [
      Math.max(0, state.gameplay.portfolio.taxableSectorCents),
      Math.max(0, state.gameplay.portfolio.taxableSpeculativeCents),
    ],
    "concentrated portfolio",
  );
  const liquidResources = Math.max(
    0,
    sum(
      [
        cash,
        Math.max(0, state.finances.taxableInvestmentsCents),
        Math.max(0, state.finances.otherInvestableAssetsCents),
        -revolvingDebt,
      ],
      "net liquid resources",
    ),
  );
  const highInterest = highInterestPrincipal(state);
  const interest = estimatedMonthlyInterest(state);
  const monthlyLivingCost = safeBigIntToNumber(
    divideRoundHalfAwayFromZero(
      BigInt(Math.max(0, state.finances.annualLivingCostCents)),
      BigInt(12),
    ),
    "monthly living cost",
  );
  const recentStress = recentPlayerEventCosts(state);
  const emergencyMonths = required === 0
    ? RISK_CALCULATION_CONSTANTS_V1.maximumCoverageMonthsPpm
    : ratioPpm(
        unborrowedCash,
        required,
        RISK_CALCULATION_CONSTANTS_V1.maximumCoverageMonthsPpm,
      );
  const liquidMonths = required === 0
    ? RISK_CALCULATION_CONSTANTS_V1.maximumCoverageMonthsPpm
    : ratioPpm(
        liquidResources,
        required,
        RISK_CALCULATION_CONSTANTS_V1.maximumCoverageMonthsPpm,
      );
  const freeCashFlowShare = income > 0
    ? ratioPpm(freeCashFlow, income, 2_000_000)
    : freeCashFlow < 0
      ? -PPM
      : 0;
  const gap = insuranceGap(state);
  const correlation = state.gameplay.employment.status === "employed"
    ? ratioPpm(
        Math.max(0, state.gameplay.portfolio.taxableSectorCents),
        investable,
        PPM,
      )
    : null;

  return {
    emergency_fund_months: {
      rawValue: emergencyMonths,
      normalizedInput: emergencyMonths,
    },
    monthly_free_cash_flow: {
      rawValue: freeCashFlow,
      normalizedInput: freeCashFlowShare,
    },
    debt_service_ratio: {
      rawValue: ratioAgainstPositiveIncome(debtService, income),
      normalizedInput: ratioAgainstPositiveIncome(debtService, income),
    },
    fixed_cost_ratio: {
      rawValue: ratioAgainstPositiveIncome(required, income),
      normalizedInput: ratioAgainstPositiveIncome(required, income),
    },
    high_interest_debt_burden: {
      rawValue: ratioAgainstPositiveIncome(highInterest, annualIncome),
      normalizedInput: ratioAgainstPositiveIncome(highInterest, annualIncome),
    },
    liquid_resource_coverage: {
      rawValue: liquidMonths,
      normalizedInput: liquidMonths,
    },
    insurance_protection_gap: { rawValue: gap, normalizedInput: gap },
    portfolio_concentration: {
      rawValue: ratioPpm(riskyPortfolio, investable, PPM),
      normalizedInput: ratioPpm(riskyPortfolio, investable, PPM),
    },
    job_investment_sector_correlation: {
      rawValue: correlation,
      normalizedInput: correlation,
    },
    income_stability: {
      rawValue:
        state.gameplay.employment.status === "employed" && income > 0 ? PPM : 0,
      normalizedInput:
        state.gameplay.employment.status === "employed" && income > 0 ? PPM : 0,
    },
    lifestyle_rigidity: {
      rawValue: ratioAgainstPositiveIncome(monthlyLivingCost, income),
      normalizedInput: ratioAgainstPositiveIncome(monthlyLivingCost, income),
    },
    interest_burden: {
      rawValue: ratioAgainstPositiveIncome(interest, income),
      normalizedInput: ratioAgainstPositiveIncome(interest, income),
    },
    retirement_readiness: {
      rawValue: retirementReadiness(state),
      normalizedInput: retirementReadiness(state),
    },
    recent_financial_stress: {
      rawValue: recentStress,
      normalizedInput: ratioAgainstPositiveIncome(
        recentStress,
        income,
        2_000_000,
      ),
    },
  };
}

function bandFor(value: number | null, policy: RiskMetricPolicy): RiskSeverityBand {
  if (value === null) return "unknown";
  const { low, moderate, high } = policy.thresholds;
  if (policy.direction === "higher_is_riskier") {
    if (value <= low) return "low";
    if (value <= moderate) return "moderate";
    if (value <= high) return "high";
    return "severe";
  }
  if (value >= low) return "low";
  if (value >= moderate) return "moderate";
  if (value >= high) return "high";
  return "severe";
}

function severityFor(value: number | null, policy: RiskMetricPolicy): RatePpm {
  if (value === null) return ratePpm(500_000);
  const { best, worst } = policy.normalization;
  const span = Math.abs(best - worst);
  if (span === 0) return ratePpm(0);
  const riskyDistance = policy.direction === "higher_is_riskier"
    ? value - best
    : best - value;
  return ratePpm(Math.max(0, Math.min(PPM, ratioPpm(riskyDistance, span, PPM))));
}

function freezeMetric(
  id: RiskMetricId,
  input: MetricInput,
  policy: RiskMetricPolicy,
): RiskMetricV1 {
  return Object.freeze({
    id,
    rawValue: input.rawValue,
    unit: policy.rawUnit,
    normalizedInput: input.normalizedInput,
    normalizedUnit: policy.normalizationUnit,
    severityPpm: severityFor(input.normalizedInput, policy),
    band: bandFor(input.normalizedInput, policy),
    thresholds: policy.thresholds,
  });
}

export function analyzeRiskV1(state: GameStateV2): RiskSnapshotV1 {
  const inputs = calculateMetricInputs(state);
  const ids = Object.keys(RISK_METRIC_POLICIES_V1) as RiskMetricId[];
  const metrics = Object.freeze(
    Object.fromEntries(
      ids.map((id) => [
        id,
        freezeMetric(id, inputs[id], RISK_METRIC_POLICIES_V1[id]),
      ]),
    ) as Record<RiskMetricId, RiskMetricV1>,
  );
  let weightedSeverity = BigInt(0);
  let availableWeight = BigInt(0);
  for (const id of ids) {
    if (metrics[id].normalizedInput === null) continue;
    const weight = RISK_METRIC_WEIGHTS_V1[id];
    weightedSeverity += BigInt(metrics[id].severityPpm) * BigInt(weight);
    availableWeight += BigInt(weight);
  }
  const aggregateSeverityPpm = ratePpm(
    availableWeight === BigInt(0)
      ? 0
      : safeBigIntToNumber(
          divideRoundHalfAwayFromZero(weightedSeverity, availableWeight),
          "aggregate risk severity",
        ),
  );
  const weaknessTags = Object.freeze(
    ids
      .filter((id) => metrics[id].band === "high" || metrics[id].band === "severe")
      .map((id) => RISK_METRIC_POLICIES_V1[id].weaknessTag),
  );
  const facts = Object.freeze(
    ids.map((id) => {
      const metric = metrics[id];
      return Object.freeze({
        factId: `${RISK_ANALYZER_V1_VERSION}.${id}`,
        metricId: id,
        factCode: RISK_METRIC_POLICIES_V1[id].factCode,
        rawValue: metric.rawValue,
        unit: metric.unit,
        normalizedInput: metric.normalizedInput,
        normalizedUnit: metric.normalizedUnit,
        band: metric.band,
      });
    }),
  );
  return Object.freeze({
    version: RISK_ANALYZER_V1_VERSION,
    asOfMonth: state.currentMonth,
    metrics,
    aggregateSeverityPpm,
    weaknessTags,
    facts,
  });
}
