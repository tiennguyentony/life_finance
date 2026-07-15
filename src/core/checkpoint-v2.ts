import { safeBigIntToNumber } from "./domain/integer";
import { moneyCents, type MoneyCents, type RatePpm } from "./domain/money";
import { addMonths, compareMonths, monthsBetween, type SimulationMonth } from "./domain/month";
import { projectFinancialGoal } from "./financial-goals-v2";
import {
  calculateNetWorth,
  type GameState,
} from "./game-state";
import type {
  ExposureSnapshot,
  GameStateV2,
  ResolvedEventEvidenceV2,
} from "./game-state-v2";
import type { MonthlyTurnV2Record } from "./monthly-turn-v2";
import { calculateAgeYears } from "./outcomes";

export type CheckpointSnapshotV2 = Readonly<{
  month: SimulationMonth;
  ageYears: number;
  cashCents: MoneyCents;
  investableAssetsCents: MoneyCents;
  liabilitiesCents: MoneyCents;
  netWorthCents: MoneyCents;
  annualLivingCostCents: MoneyCents;
  financialIndependenceTargetCents: MoneyCents;
  financialIndependenceProgressPpm: RatePpm;
  exposure: ExposureSnapshot | null;
}>;

export type CheckpointEvidenceV2 = Readonly<{
  evidenceVersion: "checkpoint-v2.1";
  start: CheckpointSnapshotV2;
  end: CheckpointSnapshotV2;
  monthsProcessed: number;
  monthlyCommandIds: readonly string[];
  taxTraceIds: readonly string[];
  totalGrossIncomeCents: MoneyCents;
  totalTaxCents: MoneyCents;
  totalAfterTaxCashIncomeCents: MoneyCents;
  totalRequiredCashCents: MoneyCents;
  totalMarketValueChangeCents: MoneyCents;
  totalInflationIncreaseCents: MoneyCents;
  totalInsurancePlayerCostCents: MoneyCents;
  totalDebtInterestCents: MoneyCents;
  totalDebtPaymentsCents: MoneyCents;
  totalLiquidationCostCents: MoneyCents;
  netWorthChangeCents: MoneyCents;
  investableAssetsChangeCents: MoneyCents;
  liabilitiesChangeCents: MoneyCents;
  eventChoices: readonly ResolvedEventEvidenceV2[];
}>;

export class CheckpointV2Error extends Error {
  readonly code: "INVALID_RANGE" | "RECORD_GAP" | "STATE_MISMATCH";

  constructor(code: CheckpointV2Error["code"], message: string) {
    super(message);
    this.name = "CheckpointV2Error";
    this.code = code;
  }
}

function sum(values: readonly MoneyCents[], label: string): MoneyCents {
  return moneyCents(
    safeBigIntToNumber(
      values.reduce((total, value) => total + BigInt(value), BigInt(0)),
      label,
    ),
  );
}

function difference(left: MoneyCents, right: MoneyCents, label: string): MoneyCents {
  return moneyCents(safeBigIntToNumber(BigInt(left) - BigInt(right), label));
}

function snapshot(state: GameStateV2): CheckpointSnapshotV2 {
  const financialGoal = projectFinancialGoal(
    state.finances,
    state.gameplay.financialGoal,
  );
  const investableAssetsCents = financialGoal.investableAssetsCents;
  const liabilitiesCents = moneyCents(
    safeBigIntToNumber(
      BigInt(state.finances.nonCreditLiabilitiesCents) +
        BigInt(state.finances.creditUsedCents),
      "checkpoint v2 liabilities",
    ),
  );
  const projection: GameState = {
    ...state,
    schemaVersion: 1,
    engineVersion: "4.0.0",
  };
  return Object.freeze({
    month: state.currentMonth,
    ageYears: calculateAgeYears(projection),
    cashCents: state.finances.cashCents,
    investableAssetsCents,
    liabilitiesCents,
    netWorthCents: calculateNetWorth(state.finances),
    annualLivingCostCents: state.finances.annualLivingCostCents,
    financialIndependenceTargetCents: financialGoal.targetCents,
    financialIndependenceProgressPpm: financialGoal.progressPpm,
    exposure: state.gameplay.exposure.current,
  });
}

function validateRange(
  startingState: GameStateV2,
  endingState: GameStateV2,
  records: readonly MonthlyTurnV2Record[],
): void {
  if (
    startingState.runId !== endingState.runId ||
    compareMonths(endingState.currentMonth, startingState.currentMonth) < 0 ||
    records.length > 12 ||
    monthsBetween(startingState.currentMonth, endingState.currentMonth) !== records.length
  ) {
    throw new CheckpointV2Error(
      "INVALID_RANGE",
      "checkpoint states and 0..12 monthly records must describe one run and exact range",
    );
  }
  let expectedMonth = startingState.currentMonth;
  for (const record of records) {
    if (
      record.processedMonth !== expectedMonth ||
      record.nextMonth !== addMonths(expectedMonth, 1)
    ) {
      throw new CheckpointV2Error(
        "RECORD_GAP",
        "monthly checkpoint evidence must be contiguous and ordered",
      );
    }
    expectedMonth = record.nextMonth;
  }
  if (expectedMonth !== endingState.currentMonth) {
    throw new CheckpointV2Error("STATE_MISMATCH", "records do not reach checkpoint end state");
  }
}

export function buildCheckpointEvidenceV2(
  startingState: GameStateV2,
  endingState: GameStateV2,
  records: readonly MonthlyTurnV2Record[],
): CheckpointEvidenceV2 {
  validateRange(startingState, endingState, records);
  const start = snapshot(startingState);
  const end = snapshot(endingState);
  const eventChoices = endingState.gameplay.eventLifecycle.history.filter(
    (event) =>
      event.resultingRevision > startingState.revision &&
      event.resultingRevision <= endingState.revision,
  );
  return Object.freeze({
    evidenceVersion: "checkpoint-v2.1",
    start,
    end,
    monthsProcessed: records.length,
    monthlyCommandIds: Object.freeze(records.map(({ commandId }) => commandId)),
    taxTraceIds: Object.freeze(records.map(({ taxTraceId }) => taxTraceId)),
    totalGrossIncomeCents: sum(records.map(({ grossIncomeCents }) => grossIncomeCents), "checkpoint gross income"),
    totalTaxCents: sum(records.map(({ totalTaxCents }) => totalTaxCents), "checkpoint tax"),
    totalAfterTaxCashIncomeCents: sum(records.map(({ afterTaxCashIncomeCents }) => afterTaxCashIncomeCents), "checkpoint cash income"),
    totalRequiredCashCents: sum(records.map(({ requiredCashCents }) => requiredCashCents), "checkpoint required cash"),
    totalMarketValueChangeCents: sum(records.map(({ marketValueChangeCents }) => marketValueChangeCents), "checkpoint market value"),
    totalInflationIncreaseCents: sum(records.map(({ annualInflationIncreaseCents }) => annualInflationIncreaseCents), "checkpoint inflation"),
    totalInsurancePlayerCostCents: sum(records.map(({ insurancePlayerCostCents }) => insurancePlayerCostCents), "checkpoint insurance"),
    totalDebtInterestCents: sum(records.map(({ debtService }) => debtService.totalInterestCents), "checkpoint debt interest"),
    totalDebtPaymentsCents: sum(records.map(({ debtService }) => debtService.totalScheduledPaymentCents), "checkpoint debt payments"),
    totalLiquidationCostCents: sum(records.map(({ funding }) => funding?.liquidationCostCents ?? moneyCents(0)), "checkpoint liquidation"),
    netWorthChangeCents: difference(end.netWorthCents, start.netWorthCents, "checkpoint net worth change"),
    investableAssetsChangeCents: difference(end.investableAssetsCents, start.investableAssetsCents, "checkpoint investable change"),
    liabilitiesChangeCents: difference(end.liabilitiesCents, start.liabilitiesCents, "checkpoint liability change"),
    eventChoices: Object.freeze(eventChoices),
  });
}
