/**
 * Historical schema-v1 checkpoint compatibility. Prompt 03 owns a future v2
 * controller; this module must not become an alternate financial engine.
 */
import {
  divideRoundHalfAwayFromZero,
  safeBigIntToNumber,
} from "./domain/integer";
import { moneyCents, ratePpm, type MoneyCents, type RatePpm } from "./domain/money";
import {
  addMonths,
  compareMonths,
  monthsBetween,
  simulationMonth,
  type SimulationMonth,
} from "./domain/month";
import { calculateAgeYears } from "./outcomes";
import {
  calculateInvestableAssets,
  calculateNetWorth,
  type GameState,
} from "./game-state";
import {
  processMonthlyTurn,
  type MonthlyTurnInput,
  type MonthlyTurnRecord,
} from "./monthly-turn";

export type PacingSpeed = "monthly" | "quarterly" | "annual";
export type CheckpointMilestoneKind =
  | "personal_event"
  | "player_decision"
  | "notable_macro";

export type CheckpointMilestone = Readonly<{
  id: string;
  month: SimulationMonth;
  kind: CheckpointMilestoneKind;
}>;

export type CheckpointPlan = Readonly<{
  fromMonth: SimulationMonth;
  stopMonth: SimulationMonth;
  monthsToProcess: number;
  stopReason: "periodic_checkpoint" | CheckpointMilestoneKind;
  pendingMilestones: readonly CheckpointMilestone[];
}>;

export type CheckpointSnapshot = Readonly<{
  month: SimulationMonth;
  ageYears: number;
  cashCents: MoneyCents;
  investableAssetsCents: MoneyCents;
  liabilitiesCents: MoneyCents;
  netWorthCents: MoneyCents;
  annualLivingCostCents: MoneyCents;
  financialIndependenceTargetCents: MoneyCents;
  financialIndependenceProgressPpm: RatePpm;
  distanceToFinancialIndependenceCents: MoneyCents;
}>;

export type CheckpointRecap = Readonly<{
  start: CheckpointSnapshot;
  end: CheckpointSnapshot;
  monthsProcessed: number;
  totalEmploymentIncomeCents: MoneyCents;
  totalObligationsDueCents: MoneyCents;
  totalMarketValueChangeCents: MoneyCents;
  totalLiquidationCostCents: MoneyCents;
  netWorthChangeCents: MoneyCents;
  investableAssetsChangeCents: MoneyCents;
  liabilitiesChangeCents: MoneyCents;
  events: readonly NonNullable<MonthlyTurnRecord["event"]>[];
}>;

export type FastForwardResult = Readonly<{
  state: GameState;
  records: readonly MonthlyTurnRecord[];
  stopReason: CheckpointPlan["stopReason"] | "terminal";
  pendingMilestones: readonly CheckpointMilestone[];
  recap: CheckpointRecap;
}>;

export class CheckpointError extends Error {
  readonly code:
    | "INVALID_MILESTONE"
    | "INVALID_PLAN"
    | "INVALID_COMMAND_PREFIX"
    | "INPUT_COUNT_MISMATCH";

  constructor(code: CheckpointError["code"], message: string) {
    super(message);
    this.name = "CheckpointError";
    this.code = code;
  }
}

const IDENTIFIER_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/;
const HORIZON_MONTHS: Readonly<Record<PacingSpeed, number>> = {
  monthly: 1,
  quarterly: 3,
  annual: 12,
};
const MILESTONE_PRIORITY: Readonly<Record<CheckpointMilestoneKind, number>> = {
  personal_event: 0,
  player_decision: 1,
  notable_macro: 2,
};
const MILESTONE_KINDS: readonly CheckpointMilestoneKind[] = [
  "personal_event",
  "player_decision",
  "notable_macro",
];

function validateMilestones(
  currentMonth: SimulationMonth,
  milestones: readonly CheckpointMilestone[],
): void {
  const ids = new Set<string>();
  for (const milestone of milestones) {
    try {
      simulationMonth(milestone.month);
    } catch {
      throw new CheckpointError(
        "INVALID_MILESTONE",
        `milestone ${milestone.id} has an invalid month`,
      );
    }
    if (!IDENTIFIER_PATTERN.test(milestone.id) || ids.has(milestone.id)) {
      throw new CheckpointError(
        "INVALID_MILESTONE",
        "milestone identifiers must be unique safe identifiers",
      );
    }
    if (!MILESTONE_KINDS.includes(milestone.kind)) {
      throw new CheckpointError(
        "INVALID_MILESTONE",
        `milestone ${milestone.id} has an invalid kind`,
      );
    }
    ids.add(milestone.id);
    if (compareMonths(milestone.month, currentMonth) < 0) {
      throw new CheckpointError(
        "INVALID_MILESTONE",
        `milestone ${milestone.id} is before the current simulation month`,
      );
    }
  }
}

export function planCheckpoint(
  state: GameState,
  speed: PacingSpeed,
  milestones: readonly CheckpointMilestone[] = [],
): CheckpointPlan {
  validateMilestones(state.currentMonth, milestones);
  if (!Object.hasOwn(HORIZON_MONTHS, speed)) {
    throw new CheckpointError("INVALID_PLAN", `unsupported pacing speed ${String(speed)}`);
  }
  const horizon = HORIZON_MONTHS[speed];
  const periodicMonth = addMonths(state.currentMonth, horizon);
  const sorted = [...milestones].sort((left, right) => {
    const monthOrder = compareMonths(left.month, right.month);
    if (monthOrder !== 0) return monthOrder;
    const priority = MILESTONE_PRIORITY[left.kind] - MILESTONE_PRIORITY[right.kind];
    return priority !== 0 ? priority : left.id.localeCompare(right.id);
  });
  const first = sorted.find(
    (milestone) => compareMonths(milestone.month, periodicMonth) <= 0,
  );
  if (!first) {
    return Object.freeze({
      fromMonth: state.currentMonth,
      stopMonth: periodicMonth,
      monthsToProcess: horizon,
      stopReason: "periodic_checkpoint",
      pendingMilestones: Object.freeze([]),
    });
  }

  const pendingMilestones = sorted.filter(
    (milestone) => milestone.month === first.month,
  );
  return Object.freeze({
    fromMonth: state.currentMonth,
    stopMonth: first.month,
    monthsToProcess: monthsBetween(state.currentMonth, first.month),
    stopReason: first.kind,
    pendingMilestones: Object.freeze(pendingMilestones),
  });
}

function sumMoney(values: readonly MoneyCents[], label: string): MoneyCents {
  return moneyCents(
    safeBigIntToNumber(
      values.reduce((total, value) => total + BigInt(value), BigInt(0)),
      label,
    ),
  );
}

function subtractMoneyExact(
  left: MoneyCents,
  right: MoneyCents,
  label: string,
): MoneyCents {
  return moneyCents(safeBigIntToNumber(BigInt(left) - BigInt(right), label));
}

function checkpointSnapshot(state: GameState): CheckpointSnapshot {
  const investableAssets = calculateInvestableAssets(state.finances);
  const target = moneyCents(
    safeBigIntToNumber(
      BigInt(state.finances.annualLivingCostCents) * BigInt(25),
      "financial independence target",
    ),
  );
  const uncappedProgress =
    target === 0
      ? BigInt(1_000_000)
      : divideRoundHalfAwayFromZero(
          BigInt(investableAssets) * BigInt(1_000_000),
          BigInt(target),
        );
  const progress = ratePpm(
    safeBigIntToNumber(
      uncappedProgress < BigInt(0)
        ? BigInt(0)
        : uncappedProgress > BigInt(1_000_000)
          ? BigInt(1_000_000)
          : uncappedProgress,
      "financial independence progress",
    ),
  );
  const liabilities = moneyCents(
    safeBigIntToNumber(
      BigInt(state.finances.nonCreditLiabilitiesCents) +
        BigInt(state.finances.creditUsedCents),
      "checkpoint liabilities",
    ),
  );
  return Object.freeze({
    month: state.currentMonth,
    ageYears: calculateAgeYears(state),
    cashCents: state.finances.cashCents,
    investableAssetsCents: investableAssets,
    liabilitiesCents: liabilities,
    netWorthCents: calculateNetWorth(state.finances),
    annualLivingCostCents: state.finances.annualLivingCostCents,
    financialIndependenceTargetCents: target,
    financialIndependenceProgressPpm: progress,
    distanceToFinancialIndependenceCents: moneyCents(
      Math.max(0, target - investableAssets),
    ),
  });
}

export function buildCheckpointRecap(
  startingState: GameState,
  endingState: GameState,
  records: readonly MonthlyTurnRecord[],
): CheckpointRecap {
  const start = checkpointSnapshot(startingState);
  const end = checkpointSnapshot(endingState);
  const events = records.flatMap((record) => (record.event ? [record.event] : []));
  return Object.freeze({
    start,
    end,
    monthsProcessed: records.length,
    totalEmploymentIncomeCents: sumMoney(
      records.map(({ employmentIncomeCents }) => employmentIncomeCents),
      "checkpoint employment income",
    ),
    totalObligationsDueCents: sumMoney(
      records.map(({ obligationsDueCents }) => obligationsDueCents),
      "checkpoint obligations",
    ),
    totalMarketValueChangeCents: sumMoney(
      records.map(({ marketValueChangeCents }) => marketValueChangeCents),
      "checkpoint market changes",
    ),
    totalLiquidationCostCents: sumMoney(
      records.map(
        ({ obligationFunding }) =>
          obligationFunding?.liquidationCostCents ?? moneyCents(0),
      ),
      "checkpoint liquidation costs",
    ),
    netWorthChangeCents: subtractMoneyExact(
      end.netWorthCents,
      start.netWorthCents,
      "checkpoint net worth change",
    ),
    investableAssetsChangeCents: subtractMoneyExact(
      end.investableAssetsCents,
      start.investableAssetsCents,
      "checkpoint investable assets change",
    ),
    liabilitiesChangeCents: subtractMoneyExact(
      end.liabilitiesCents,
      start.liabilitiesCents,
      "checkpoint liabilities change",
    ),
    events: Object.freeze(events),
  });
}

function validatePlan(state: GameState, plan: CheckpointPlan): void {
  if (
    plan.fromMonth !== state.currentMonth ||
    !Number.isSafeInteger(plan.monthsToProcess) ||
    plan.monthsToProcess < 0 ||
    plan.monthsToProcess > 12 ||
    addMonths(plan.fromMonth, plan.monthsToProcess) !== plan.stopMonth
  ) {
    throw new CheckpointError(
      "INVALID_PLAN",
      "checkpoint plan must start at state month and span 0 through 12 months",
    );
  }
}

export function fastForwardToCheckpoint(
  state: GameState,
  plan: CheckpointPlan,
  monthlyInputs: readonly MonthlyTurnInput[],
  commandPrefix = "cmd.fast_forward",
): FastForwardResult {
  validatePlan(state, plan);
  if (!IDENTIFIER_PATTERN.test(commandPrefix)) {
    throw new CheckpointError(
      "INVALID_COMMAND_PREFIX",
      "fast-forward command prefix must be a safe identifier up to 64 characters",
    );
  }
  if (monthlyInputs.length !== plan.monthsToProcess) {
    throw new CheckpointError(
      "INPUT_COUNT_MISMATCH",
      "fast-forward requires exactly one deterministic input per planned month",
    );
  }

  let current = state;
  const records: MonthlyTurnRecord[] = [];
  for (const input of monthlyInputs) {
    if (current.outcome) break;
    const commandId = `${commandPrefix}.${current.currentMonth}`;
    const result = processMonthlyTurn(current, commandId, input);
    current = result.state;
    records.push(result.record);
  }
  const terminal = current.outcome !== null;
  return Object.freeze({
    state: current,
    records: Object.freeze(records),
    stopReason: terminal ? "terminal" : plan.stopReason,
    pendingMilestones: terminal ? Object.freeze([]) : plan.pendingMilestones,
    recap: buildCheckpointRecap(state, current, records),
  });
}
