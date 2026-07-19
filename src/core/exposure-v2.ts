import {
  divideRoundHalfAwayFromZero,
  safeBigIntToNumber,
} from "./domain/integer";
import { ratePpm, type MoneyCents, type RatePpm } from "./domain/money";
import type { SimulationMonth } from "./domain/month";
import {
  finalizeGameStateV2,
  type ExposureSnapshot,
  type GameStateV2,
} from "./game-state-v2";
import type { GameStateV2ValidationOptions } from "./game-state-v2-validation";
import { activeInsuranceCoveragesV2 } from "./insurance-selection-v2";
import { planRevolvingCreditMonthV2 } from "./revolving-credit-v2";

const PPM = 1_000_000;
const MAX_EMERGENCY_MONTHS_PPM = 12_000_000;

function ratioPpm(
  numerator: number | bigint,
  denominator: number | bigint,
  maximum = Number.MAX_SAFE_INTEGER,
): RatePpm {
  if (BigInt(denominator) <= 0) return ratePpm(0);
  const value = safeBigIntToNumber(
    divideRoundHalfAwayFromZero(
      BigInt(numerator) * BigInt(PPM),
      BigInt(denominator),
    ),
    "exposure ratio",
  );
  return ratePpm(Math.max(0, Math.min(maximum, value)));
}

function sum(values: readonly MoneyCents[]): bigint {
  return values.reduce((total, value) => total + BigInt(value), BigInt(0));
}

function propertyAndIncomeInsuranceGap(state: GameStateV2): RatePpm | null {
  const snapshot = state.gameplay.catalogSnapshot;
  if (!snapshot || state.gameplay.employment.status !== "employed") return null;
  const salary = BigInt(state.gameplay.employment.annualGrossSalaryCents);
  const propertyNeed = BigInt(state.finances.homeValueCents) +
    BigInt(state.finances.otherAssetsCents);
  const lifeNeed = snapshot.selected.household.dependentCount > 0
    ? salary * BigInt(5)
    : BigInt(0);
  const incomeNeed = salary;
  let propertyCoverage = BigInt(0);
  let incomeCoverage = BigInt(0);
  let lifeCoverage = BigInt(0);
  for (const coverage of activeInsuranceCoveragesV2(state)) {
    const amount = BigInt(coverage.coverageLimitCents);
    if (coverage.kind === "renters") propertyCoverage += amount;
    if (
      coverage.kind === "short_term_disability" ||
      coverage.kind === "long_term_disability"
    ) {
      incomeCoverage += amount;
    }
    if (coverage.kind === "term_life") lifeCoverage += amount;
  }
  const needs = propertyNeed + incomeNeed + lifeNeed;
  if (needs === BigInt(0)) return ratePpm(0);
  const uncovered =
    (propertyNeed > propertyCoverage ? propertyNeed - propertyCoverage : BigInt(0)) +
    (incomeNeed > incomeCoverage ? incomeNeed - incomeCoverage : BigInt(0)) +
    (lifeNeed > lifeCoverage ? lifeNeed - lifeCoverage : BigInt(0));
  return ratioPpm(uncovered, needs, PPM);
}

function weightedRisk(parts: readonly [number, number][]): RatePpm {
  const weighted = parts.reduce(
    (total, [risk, weight]) => total + BigInt(risk) * BigInt(weight),
    BigInt(0),
  );
  return ratePpm(
    safeBigIntToNumber(
      divideRoundHalfAwayFromZero(weighted, BigInt(PPM)),
      "weighted exposure risk",
    ),
  );
}

export function computeExposureSnapshotV2(
  state: GameStateV2,
  month: SimulationMonth = state.currentMonth,
): ExposureSnapshot {
  const effectiveRequiredObligationsCents =
    state.finances.requiredObligationsCents +
    planRevolvingCreditMonthV2(
      state.gameplay.debts.revolvingCreditUsedCents,
    ).scheduledPaymentCents;
  const emergencyFundMonthsPpm =
    effectiveRequiredObligationsCents === 0
      ? ratePpm(MAX_EMERGENCY_MONTHS_PPM)
      : ratioPpm(
          state.finances.cashCents,
          effectiveRequiredObligationsCents,
          MAX_EMERGENCY_MONTHS_PPM,
        );
  const annualIncome =
    state.gameplay.employment.status === "employed"
      ? state.gameplay.employment.annualGrossSalaryCents
      : null;
  const totalDebt =
    BigInt(state.finances.nonCreditLiabilitiesCents) +
    BigInt(state.finances.creditUsedCents);
  const debtToIncomePpm =
    annualIncome === null || annualIncome === 0
      ? null
      : ratioPpm(totalDebt, annualIncome);
  const revolvingDebtPpm = ratioPpm(
    state.finances.creditUsedCents,
    state.finances.creditLimitCents,
    PPM,
  );
  const portfolio = state.gameplay.portfolio;
  const investable = sum([
    portfolio.taxableBroadIndexCents,
    portfolio.taxableSectorCents,
    portfolio.taxableSpeculativeCents,
    portfolio.taxableLegacyUnclassifiedCents,
    portfolio.retirement401kCents,
    portfolio.retirementIraCents,
    portfolio.retirementLegacyUnclassifiedCents,
    portfolio.hsaCents,
    portfolio.otherInvestableLegacyUnclassifiedCents,
  ]);
  const concentrated =
    BigInt(portfolio.taxableSectorCents) +
    BigInt(portfolio.taxableSpeculativeCents);
  const portfolioConcentrationPpm = ratioPpm(concentrated, investable, PPM);
  const jobInvestmentCorrelationPpm =
    state.gameplay.employment.status !== "employed"
      ? null
      : ratioPpm(portfolio.taxableSectorCents, investable, PPM);
  const insuranceGapPpm = propertyAndIncomeInsuranceGap(state);

  const emergencyRisk = Math.max(
    0,
    PPM - Math.min(PPM, Math.round(emergencyFundMonthsPpm / 6)),
  );
  const dtiRisk = debtToIncomePpm === null ? 500_000 : Math.min(PPM, debtToIncomePpm);
  const insuranceRisk = insuranceGapPpm === null ? 500_000 : insuranceGapPpm;
  const correlationRisk = jobInvestmentCorrelationPpm ?? 0;
  const risk = weightedRisk([
    [emergencyRisk, 300_000],
    [dtiRisk, 200_000],
    [revolvingDebtPpm, 150_000],
    [insuranceRisk, 100_000],
    [portfolioConcentrationPpm, 150_000],
    [correlationRisk, 100_000],
  ]);
  const scorePpm = ratePpm(PPM + risk * 2);
  return Object.freeze({
    month,
    scorePpm,
    emergencyFundMonthsPpm,
    debtToIncomePpm,
    revolvingDebtPpm,
    insuranceGapPpm,
    portfolioConcentrationPpm,
    jobInvestmentCorrelationPpm,
  });
}

export function recordExposureSnapshotV2(
  state: GameStateV2,
  month: SimulationMonth = state.currentMonth,
  validationOptions: GameStateV2ValidationOptions = {},
): GameStateV2 {
  const snapshot = computeExposureSnapshotV2(state, month);
  const history = state.gameplay.exposure.history.filter(
    (existing) => existing.month !== month,
  );
  return finalizeGameStateV2({
    ...state,
    gameplay: {
      ...state.gameplay,
      exposure: { current: snapshot, history: [...history, snapshot] },
    },
  }, validationOptions);
}
