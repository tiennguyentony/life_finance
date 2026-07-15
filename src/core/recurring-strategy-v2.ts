import {
  addMoney,
  allocateMoney,
  moneyCents,
  subtractMoney,
  type MoneyCents,
} from "./domain/money";
import type { SimulationMonth } from "./domain/month";
import {
  finalizeGameStateV2,
  type GameStateV2,
  type RecurringStrategy,
} from "./game-state-v2";

export type SetRecurringStrategyCommand = Readonly<{
  schemaVersion: 2;
  id: string;
  type: "set_recurring_strategy";
  expectedRevision: number;
  effectiveMonth: SimulationMonth;
  payload: Readonly<{ strategy: Omit<RecurringStrategy, "effectiveMonth"> }>;
}>;

export type RecurringAllocationPlan = Readonly<{
  grossSalaryCents: MoneyCents;
  afterTaxDiscretionaryCents: MoneyCents;
  preTax: Readonly<{
    employee401kCents: MoneyCents;
    employer401kMatchCents: MoneyCents;
    hsaCents: MoneyCents;
  }>;
  afterTax: Readonly<{
    broadIndexCents: MoneyCents;
    sectorCents: MoneyCents;
    speculativeCents: MoneyCents;
    iraCents: MoneyCents;
    extraDebtPayments: readonly Readonly<{
      debtId: string;
      amountCents: MoneyCents;
    }>[];
  }>;
  unallocatedAfterTaxCents: MoneyCents;
}>;

export class RecurringStrategyError extends Error {
  readonly code:
    | "INVALID_COMMAND"
    | "DUPLICATE_COMMAND"
    | "STALE_REVISION"
    | "RUN_TERMINAL"
    | "INVALID_ALLOCATION"
    | "HSA_INELIGIBLE"
    | "NO_ACTIVE_DEBT"
    | "LEGACY_POLICY_UNKNOWN";

  constructor(code: RecurringStrategyError["code"], message: string) {
    super(message);
    this.name = "RecurringStrategyError";
    this.code = code;
  }
}

const COMMAND_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const ZERO = moneyCents(0);

function rateSum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function validateRates(strategy: Omit<RecurringStrategy, "effectiveMonth">): void {
  const values = Object.values(strategy);
  if (
    values.some(
      (value) =>
        !Number.isSafeInteger(value) || value < 0 || value > 1_000_000,
    ) ||
    rateSum([
      strategy.preTax401kSalaryRatePpm,
      strategy.preTaxHsaSalaryRatePpm,
    ]) > 1_000_000 ||
    rateSum([
      strategy.afterTaxBroadIndexRatePpm,
      strategy.afterTaxSectorRatePpm,
      strategy.afterTaxSpeculativeRatePpm,
      strategy.afterTaxIraRatePpm,
      strategy.afterTaxExtraDebtRatePpm,
    ]) > 1_000_000
  ) {
    throw new RecurringStrategyError(
      "INVALID_ALLOCATION",
      "rates must be bounded and pre-tax/after-tax groups cannot exceed 100%",
    );
  }
}

export function setRecurringStrategy(
  state: GameStateV2,
  command: SetRecurringStrategyCommand,
): GameStateV2 {
  if (
    command.schemaVersion !== 2 ||
    command.type !== "set_recurring_strategy" ||
    !COMMAND_ID.test(command.id) ||
    !Number.isSafeInteger(command.expectedRevision) ||
    command.expectedRevision < 0 ||
    command.effectiveMonth !== state.currentMonth
  ) {
    throw new RecurringStrategyError("INVALID_COMMAND", "invalid strategy command envelope");
  }
  if (state.acceptedCommandIds.includes(command.id)) {
    throw new RecurringStrategyError("DUPLICATE_COMMAND", "command was already accepted");
  }
  if (command.expectedRevision !== state.revision) {
    throw new RecurringStrategyError("STALE_REVISION", "command revision is stale");
  }
  if (state.outcome !== null) {
    throw new RecurringStrategyError("RUN_TERMINAL", "terminal runs reject strategy changes");
  }
  validateRates(command.payload.strategy);
  if (
    command.payload.strategy.preTaxHsaSalaryRatePpm > 0 &&
    state.gameplay.benefits.hsaEligible !== true
  ) {
    throw new RecurringStrategyError(
      "HSA_INELIGIBLE",
      "pre-tax HSA allocation requires an HSA-eligible health plan",
    );
  }
  if (
    command.payload.strategy.afterTaxExtraDebtRatePpm > 0 &&
    !state.gameplay.debts.termDebts.some(({ principalCents }) => principalCents > 0)
  ) {
    throw new RecurringStrategyError(
      "NO_ACTIVE_DEBT",
      "extra debt allocation requires active term debt",
    );
  }
  return finalizeGameStateV2({
    ...state,
    revision: state.revision + 1,
    acceptedCommandIds: [...state.acceptedCommandIds, command.id],
    gameplay: {
      ...state.gameplay,
      recurringStrategy: {
        effectiveMonth: command.effectiveMonth,
        ...command.payload.strategy,
      },
    },
  });
}

function remaining(limit: MoneyCents, used: MoneyCents): MoneyCents {
  return used >= limit ? ZERO : subtractMoney(limit, used);
}

function cappedAllocation(
  base: MoneyCents,
  ratePpm: number,
  available: MoneyCents,
): MoneyCents {
  return moneyCents(Math.min(allocateMoney(base, ratePpm, 1_000_000), available));
}

function calculateEmployerMatch(
  state: GameStateV2,
  grossSalaryCents: MoneyCents,
  employeeContributionCents: MoneyCents,
): MoneyCents {
  const snapshot = state.gameplay.catalogSnapshot!;
  const plan = snapshot.selected.retirementPlan;
  if (grossSalaryCents === 0 || employeeContributionCents === 0) return ZERO;
  let priorThreshold = 0;
  let matched = ZERO;
  for (const tier of plan.employerMatchTiers) {
    const tierSalaryRate = tier.employeeContributionRateUpToPpm - priorThreshold;
    const tierEmployeeCapacity = allocateMoney(
      grossSalaryCents,
      tierSalaryRate,
      1_000_000,
    );
    const employeeInTier = moneyCents(
      Math.min(
        tierEmployeeCapacity,
        Math.max(0, employeeContributionCents - allocateMoney(grossSalaryCents, priorThreshold, 1_000_000)),
      ),
    );
    matched = addMoney(
      matched,
      allocateMoney(employeeInTier, tier.employerMatchRatePpm, 1_000_000),
    );
    priorThreshold = tier.employeeContributionRateUpToPpm;
  }
  const additionRemaining = remaining(
    snapshot.selected.benefitPolicy.definedContributionAdditionLimitCents,
    addMoney(
      state.gameplay.contributions.employee401kCents,
      state.gameplay.contributions.employer401kCents,
    ),
  );
  const afterEmployee =
    employeeContributionCents >= additionRemaining
      ? ZERO
      : subtractMoney(additionRemaining, employeeContributionCents);
  return moneyCents(Math.min(matched, afterEmployee));
}

function trimToAvailable(
  values: MoneyCents[],
  available: MoneyCents,
): void {
  let total = values.reduce((sum, value) => sum + value, 0);
  let excess = Math.max(0, total - available);
  for (let index = values.length - 1; index >= 0 && excess > 0; index -= 1) {
    const reduction = Math.min(values[index]!, excess);
    values[index] = moneyCents(values[index]! - reduction);
    total -= reduction;
    excess -= reduction;
  }
}

export function planRecurringAllocations(
  state: GameStateV2,
  grossSalaryCents: MoneyCents,
  afterTaxDiscretionaryCents: MoneyCents,
): RecurringAllocationPlan {
  if (
    !Number.isSafeInteger(grossSalaryCents) ||
    grossSalaryCents < 0 ||
    !Number.isSafeInteger(afterTaxDiscretionaryCents) ||
    afterTaxDiscretionaryCents < 0
  ) {
    throw new RecurringStrategyError(
      "INVALID_ALLOCATION",
      "allocation bases must be non-negative safe integer cents",
    );
  }
  const snapshot = state.gameplay.catalogSnapshot;
  if (!snapshot || state.gameplay.contributions.policyYear === null) {
    throw new RecurringStrategyError(
      "LEGACY_POLICY_UNKNOWN",
      "recurring allocations require a resolved native v2 policy",
    );
  }
  const strategy = state.gameplay.recurringStrategy;
  const employee401k = cappedAllocation(
    grossSalaryCents,
    strategy.preTax401kSalaryRatePpm,
    remaining(
      snapshot.selected.benefitPolicy.employeeRetirementContributionLimitCents,
      state.gameplay.contributions.employee401kCents,
    ),
  );
  const employerMatch = calculateEmployerMatch(
    state,
    grossSalaryCents,
    employee401k,
  );
  const hsaLimit = snapshot.derived.hsaAnnualContributionLimitCents;
  const hsa =
    hsaLimit === null
      ? ZERO
      : cappedAllocation(
          grossSalaryCents,
          strategy.preTaxHsaSalaryRatePpm,
          remaining(hsaLimit, state.gameplay.contributions.hsaCents),
        );

  const afterTax = [
    allocateMoney(
      afterTaxDiscretionaryCents,
      strategy.afterTaxBroadIndexRatePpm,
      1_000_000,
    ),
    allocateMoney(
      afterTaxDiscretionaryCents,
      strategy.afterTaxSectorRatePpm,
      1_000_000,
    ),
    allocateMoney(
      afterTaxDiscretionaryCents,
      strategy.afterTaxSpeculativeRatePpm,
      1_000_000,
    ),
    cappedAllocation(
      afterTaxDiscretionaryCents,
      strategy.afterTaxIraRatePpm,
      remaining(
        snapshot.selected.benefitPolicy.iraContributionLimitCents,
        state.gameplay.contributions.iraCents,
      ),
    ),
    allocateMoney(
      afterTaxDiscretionaryCents,
      strategy.afterTaxExtraDebtRatePpm,
      1_000_000,
    ),
  ];
  trimToAvailable(afterTax, afterTaxDiscretionaryCents);
  const [broadIndex, sector, speculative, ira, extraDebtBudget] = afterTax as [
    MoneyCents,
    MoneyCents,
    MoneyCents,
    MoneyCents,
    MoneyCents,
  ];
  let debtRemaining = extraDebtBudget;
  const extraDebtPayments: { debtId: string; amountCents: MoneyCents }[] = [];
  const avalanche = state.gameplay.debts.termDebts
    .filter(({ principalCents }) => principalCents > 0)
    .toSorted(
      (left, right) =>
        right.annualInterestRatePpm - left.annualInterestRatePpm ||
        left.id.localeCompare(right.id),
    );
  for (const debt of avalanche) {
    if (debtRemaining === 0) break;
    const payment = moneyCents(Math.min(debtRemaining, debt.principalCents));
    extraDebtPayments.push({ debtId: debt.id, amountCents: payment });
    debtRemaining = subtractMoney(debtRemaining, payment);
  }
  const allocatedDebt = subtractMoney(extraDebtBudget, debtRemaining);
  const allocatedAfterTax = [
    broadIndex,
    sector,
    speculative,
    ira,
    allocatedDebt,
  ].reduce((total, value) => addMoney(total, value), ZERO);
  return Object.freeze({
    grossSalaryCents,
    afterTaxDiscretionaryCents,
    preTax: Object.freeze({
      employee401kCents: employee401k,
      employer401kMatchCents: employerMatch,
      hsaCents: hsa,
    }),
    afterTax: Object.freeze({
      broadIndexCents: broadIndex,
      sectorCents: sector,
      speculativeCents: speculative,
      iraCents: ira,
      extraDebtPayments: Object.freeze(extraDebtPayments),
    }),
    unallocatedAfterTaxCents: subtractMoney(
      afterTaxDiscretionaryCents,
      allocatedAfterTax,
    ),
  });
}
