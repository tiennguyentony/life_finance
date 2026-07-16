import { safeBigIntToNumber } from "./domain/integer";
import { completeCareerDevelopmentV2 } from "./detailed-actions-v2";
import {
  addMoney,
  moneyCents,
  multiplyMoneyByRate,
  negateMoney,
  subtractMoney,
  type MoneyCents,
  type RatePpm,
} from "./domain/money";
import { addMonths, compareMonths, type SimulationMonth } from "./domain/month";
import {
  applyDebtPaymentV2,
  planMonthlyDebtService,
  settleMonthlyDebtService,
} from "./debt-service-v2";
import type { FinancialSnapshot, GameState } from "./game-state";
import {
  FINANCIAL_KERNEL_V2_VERSION,
  simulateFinancialMonthV2,
  type FinancialClosingStateV2,
  type FinancialMonthInputV2,
  type FinancialMonthRecordV2,
  type FinancialMonthResultV2,
  type FinancialShortfallV2,
  type MonthlyInsuranceClaimV2,
  type ResolvedCashFlowV2,
} from "./financial-kernel-v2";
import {
  finalizeGameStateV2,
  type GameStateV2,
  type PendingEventV2,
  type PortfolioBreakdown,
} from "./game-state-v2";
import { calculateMonthlyLivingCostInflationV2 } from "./inflation-v2";
import {
  queueScheduledDeclarativePersonalEventV2,
  queueScheduledPersonalEventV2,
} from "./event-lifecycle-v2";
import {
  CAUSAL_EVENT_SCHEDULER_V1_VERSION,
  DECLARATIVE_EVENT_SCHEDULER_V2_VERSION,
  isScheduledDeclarativePersonalEventV2,
  LEGACY_EXPOSURE_EVENT_SCHEDULER,
  schedulePersonalEventV2,
  type EventSchedulerVersionV2,
  type EventSchedulingPolicyV2,
} from "./event-scheduler-v2";
import {
  adjudicateCoverageClaim,
  adjudicateHealthClaim,
} from "./insurance-v2";
import { appendTransaction, type JournalPosting, type Ledger } from "./ledger";
import {
  MACRO_MARKET_MODEL_V2_VERSION,
  MARKET_MODEL_VERSION,
  marketSimulationState,
  marketSimulationStateV2,
  simulateMarketMonth,
  simulateMarketMonthV2,
  type MacroMarketDifficultyV2,
  type MarketMonth,
  type SupportedMarketMonth,
  type SupportedMarketSimulationResult,
} from "./market";
import {
  activeMacroReturnModifiersV2,
  advanceMacroStoriesV2,
  type MacroStoryPolicyV2,
} from "./macro-story-v2";
import {
  assessV2Liquidity,
  prepareV2ObligationCash,
  type V2FundingRecord,
} from "./obligation-funding-v2";
import {
  assessTerminalOutcomeV2,
  evaluateTerminalOutcome,
  evaluateTerminalOutcomeV2,
} from "./outcomes";
import {
  LEGACY_UNVERSIONED_OUTCOME_POLICY,
  OUTCOME_POLICY_V1_VERSION,
} from "./outcome-policy-v2";
import {
  acceptFinancialMonthCommandV2,
  rehydrateFinancialClosingStateV2,
} from "./financial-transition-v2";
import { recordExposureSnapshotV2 } from "./exposure-v2";
import { applyMonthlyPayroll, type MonthlyTaxEvidence } from "./payroll-v2";
import {
  planRecurringAllocations,
  type RecurringAllocationPlan,
} from "./recurring-strategy-v2";

export { FINANCIAL_KERNEL_V2_VERSION };
export type {
  FinancialMonthInputV2,
  FinancialClosingStateV2,
  FinancialMonthRecordV2,
  FinancialMonthResultV2,
  FinancialShortfallV2,
  MonthlyInsuranceClaimV2,
  ResolvedCashFlowV2,
};

export type MonthlyInsuranceClaim = MonthlyInsuranceClaimV2;

export type FinancialKernelVersionV2 =
  | "legacy-4.1.0"
  | typeof FINANCIAL_KERNEL_V2_VERSION;

export type OutcomePolicyVersionV2 =
  | typeof LEGACY_UNVERSIONED_OUTCOME_POLICY
  | typeof OUTCOME_POLICY_V1_VERSION;

export type ProcessMonthV2Command = Readonly<{
  schemaVersion: 2;
  id: string;
  type: "process_month_v2";
  expectedRevision: number;
  effectiveMonth: SimulationMonth;
  payload: Readonly<{
    financialKernelVersion?: FinancialKernelVersionV2;
    outcomePolicyVersion?: typeof OUTCOME_POLICY_V1_VERSION;
    eventSchedulerVersion?:
      | typeof CAUSAL_EVENT_SCHEDULER_V1_VERSION
      | typeof DECLARATIVE_EVENT_SCHEDULER_V2_VERSION;
    marketModelVersion?:
      | typeof MARKET_MODEL_VERSION
      | typeof MACRO_MARKET_MODEL_V2_VERSION;
    macroDifficulty?: MacroMarketDifficultyV2;
    taxEvidence: MonthlyTaxEvidence;
    taxableLiquidationCostRatePpm: RatePpm;
    insuranceClaim?: MonthlyInsuranceClaim;
    resolvedCashFlows?: readonly ResolvedCashFlowV2[];
  }>;
}>;

export type MonthlyTurnV2Record = Readonly<{
  commandId: string;
  processedMonth: SimulationMonth;
  nextMonth: SimulationMonth;
  taxTraceId: string;
  grossIncomeCents: MoneyCents;
  totalTaxCents: MoneyCents;
  afterTaxCashIncomeCents: MoneyCents;
  market: SupportedMarketMonth;
  marketValueChangeCents: MoneyCents;
  annualInflationIncreaseCents: MoneyCents;
  insurancePlayerCostCents: MoneyCents;
  requiredCashCents: MoneyCents;
  nonDebtObligationsPaidCents: MoneyCents;
  debtService: ReturnType<typeof planMonthlyDebtService>;
  funding: V2FundingRecord | null;
  recurringAllocations: RecurringAllocationPlan | null;
  scheduledEvent: PendingEventV2 | null;
  outcome: GameStateV2["outcome"];
  financialKernelVersion?: typeof FINANCIAL_KERNEL_V2_VERSION;
  outcomePolicyVersion?: typeof OUTCOME_POLICY_V1_VERSION;
  openingNetWorthCents?: MoneyCents;
  closingNetWorthCents?: MoneyCents;
  openingAutomaticLiquidityCents?: MoneyCents;
  closingAutomaticLiquidityCents?: MoneyCents;
  resolvedIncomeCents?: MoneyCents;
  resolvedExpenseCents?: MoneyCents;
  monthlyObligationInflationIncreaseCents?: MoneyCents;
  cumulativePriceIndexPpm?: number;
  baseNonDebtObligationsCents?: MoneyCents;
  fundingPlan?: FinancialMonthRecordV2["fundingPlan"];
  shortfall?: FinancialShortfallV2 | null;
}>;

export type MonthlyTurnV2Result = Readonly<{
  state: GameStateV2;
  record: MonthlyTurnV2Record;
}>;

export class MonthlyTurnV2Error extends Error {
  readonly code:
    | "INVALID_COMMAND"
    | "DUPLICATE_COMMAND"
    | "STALE_REVISION"
    | "RUN_TERMINAL"
    | "PENDING_EVENT"
    | "INVALID_LIQUIDATION_RATE"
    | "UNSUPPORTED_FINANCIAL_KERNEL_VERSION"
    | "UNSUPPORTED_OUTCOME_POLICY_VERSION"
    | "UNSUPPORTED_EVENT_SCHEDULER_VERSION"
    | "UNSUPPORTED_MARKET_MODEL_VERSION"
    | "TRANSITION_INVARIANT";
  override readonly cause?: unknown;

  constructor(
    code: MonthlyTurnV2Error["code"],
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = "MonthlyTurnV2Error";
    this.code = code;
    this.cause = cause;
  }
}

export function financialKernelVersionForCommandV2(
  command: ProcessMonthV2Command,
): FinancialKernelVersionV2 {
  const version = command.payload.financialKernelVersion;
  if (version === undefined || version === "legacy-4.1.0") {
    return "legacy-4.1.0";
  }
  if (version === "2.0.0") return version;
  throw new MonthlyTurnV2Error(
    "UNSUPPORTED_FINANCIAL_KERNEL_VERSION",
    `unsupported financial kernel version: ${String(version)}`,
  );
}

export function outcomePolicyVersionForCommandV2(
  command: ProcessMonthV2Command,
): OutcomePolicyVersionV2 {
  const version = command.payload.outcomePolicyVersion;
  if (version === undefined) return LEGACY_UNVERSIONED_OUTCOME_POLICY;
  if (version === OUTCOME_POLICY_V1_VERSION) return version;
  throw new MonthlyTurnV2Error(
    "UNSUPPORTED_OUTCOME_POLICY_VERSION",
    `unsupported outcome policy version: ${String(version)}`,
  );
}

export function eventSchedulerVersionForCommandV2(
  command: ProcessMonthV2Command,
): EventSchedulerVersionV2 {
  const version = command.payload.eventSchedulerVersion;
  if (version === undefined) return LEGACY_EXPOSURE_EVENT_SCHEDULER;
  if (
    version === CAUSAL_EVENT_SCHEDULER_V1_VERSION ||
    version === DECLARATIVE_EVENT_SCHEDULER_V2_VERSION
  ) return version;
  throw new MonthlyTurnV2Error(
    "UNSUPPORTED_EVENT_SCHEDULER_VERSION",
    `unsupported event scheduler version: ${String(version)}`,
  );
}

export type MarketModelSelectionV2 = Readonly<
  | {
      modelVersion: typeof MARKET_MODEL_VERSION;
      difficulty: null;
    }
  | {
      modelVersion: typeof MACRO_MARKET_MODEL_V2_VERSION;
      difficulty: MacroMarketDifficultyV2;
    }
>;

export function marketModelVersionForCommandV2(
  command: ProcessMonthV2Command,
): MarketModelSelectionV2 {
  const version = command.payload.marketModelVersion;
  const difficulty = command.payload.macroDifficulty;
  if (version === undefined || version === MARKET_MODEL_VERSION) {
    if (difficulty === undefined) {
      return Object.freeze({ modelVersion: MARKET_MODEL_VERSION, difficulty: null });
    }
  } else if (
    version === MACRO_MARKET_MODEL_V2_VERSION &&
    (["guided", "normal", "hard"] as const).includes(
      difficulty as MacroMarketDifficultyV2,
    )
  ) {
    return Object.freeze({ modelVersion: version, difficulty: difficulty! });
  }
  throw new MonthlyTurnV2Error(
    "UNSUPPORTED_MARKET_MODEL_VERSION",
    "market model selection requires regime-v1 without difficulty or regime-v2 with a supported difficulty",
  );
}

const COMMAND_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,95}$/;
const ZERO = moneyCents(0);

function debit(accountId: string, amountCents: MoneyCents): JournalPosting {
  return { accountId, debitCents: amountCents, creditCents: ZERO };
}

function credit(accountId: string, amountCents: MoneyCents): JournalPosting {
  return { accountId, debitCents: ZERO, creditCents: amountCents };
}

function sumMoney(values: readonly MoneyCents[], label: string): MoneyCents {
  return moneyCents(
    safeBigIntToNumber(
      values.reduce((total, value) => total + BigInt(value), BigInt(0)),
      label,
    ),
  );
}

function validateCommand(
  state: GameStateV2,
  command: ProcessMonthV2Command,
): void {
  if (
    command.schemaVersion !== 2 ||
    command.type !== "process_month_v2" ||
    !COMMAND_ID.test(command.id) ||
    !Number.isSafeInteger(command.expectedRevision) ||
    command.expectedRevision < 0
  ) {
    throw new MonthlyTurnV2Error("INVALID_COMMAND", "invalid v2 monthly command envelope");
  }
  if (state.acceptedCommandIds.includes(command.id)) {
    throw new MonthlyTurnV2Error("DUPLICATE_COMMAND", "monthly command was already accepted");
  }
  if (command.expectedRevision !== state.revision) {
    throw new MonthlyTurnV2Error("STALE_REVISION", "monthly command revision is stale");
  }
  if (command.effectiveMonth !== state.currentMonth) {
    throw new MonthlyTurnV2Error(
      "INVALID_COMMAND",
      "monthly command effective month does not match the run",
    );
  }
  if (state.outcome !== null) {
    throw new MonthlyTurnV2Error("RUN_TERMINAL", "terminal runs reject monthly turns");
  }
  if (state.gameplay.eventLifecycle.pending !== null) {
    throw new MonthlyTurnV2Error(
      "PENDING_EVENT",
      "pending event choice must be resolved before monthly progression",
    );
  }
  const rate = command.payload.taxableLiquidationCostRatePpm;
  if (!Number.isSafeInteger(rate) || rate < 0 || rate > 1_000_000) {
    throw new MonthlyTurnV2Error(
      "INVALID_LIQUIDATION_RATE",
      "liquidation cost rate must be 0..1,000,000 PPM",
    );
  }
}

type MarketApplication = Readonly<{
  state: GameStateV2;
  month: MarketMonth;
  marketValueChangeCents: MoneyCents;
}>;

function signedChange(balance: MoneyCents, rate: RatePpm): MoneyCents {
  return multiplyMoneyByRate(balance, rate);
}

function addSigned(balance: MoneyCents, change: MoneyCents): MoneyCents {
  return change >= 0
    ? addMoney(balance, change)
    : subtractMoney(balance, negateMoney(change));
}

function applyMarketMonthV2(
  state: GameStateV2,
  commandId: string,
): MarketApplication {
  const simulation = simulateMarketMonth(
    marketSimulationState(
      state.marketRegime,
      state.random,
      state.gameplay.market.monthsInRegime,
    ),
    activeMacroReturnModifiersV2(state),
  );
  const month = simulation.month;
  const portfolio = state.gameplay.portfolio;
  const portfolioChanges: Record<keyof PortfolioBreakdown, MoneyCents> = {
    taxableBroadIndexCents: signedChange(
      portfolio.taxableBroadIndexCents,
      month.equityReturnPpm,
    ),
    taxableSectorCents: signedChange(
      portfolio.taxableSectorCents,
      month.equityReturnPpm,
    ),
    taxableSpeculativeCents: signedChange(
      portfolio.taxableSpeculativeCents,
      month.equityReturnPpm,
    ),
    taxableLegacyUnclassifiedCents: signedChange(
      portfolio.taxableLegacyUnclassifiedCents,
      month.equityReturnPpm,
    ),
    retirement401kCents: signedChange(
      portfolio.retirement401kCents,
      month.equityReturnPpm,
    ),
    retirementIraCents: signedChange(
      portfolio.retirementIraCents,
      month.equityReturnPpm,
    ),
    retirementLegacyUnclassifiedCents: signedChange(
      portfolio.retirementLegacyUnclassifiedCents,
      month.equityReturnPpm,
    ),
    hsaCents: signedChange(portfolio.hsaCents, month.bondReturnPpm),
    otherInvestableLegacyUnclassifiedCents: signedChange(
      portfolio.otherInvestableLegacyUnclassifiedCents,
      month.bondReturnPpm,
    ),
  };
  const cashChange = signedChange(state.finances.cashCents, month.cashReturnPpm);
  const homeChange = signedChange(
    state.finances.homeValueCents,
    month.housingReturnPpm,
  );
  const taxableChange = sumMoney(
    [
      portfolioChanges.taxableBroadIndexCents,
      portfolioChanges.taxableSectorCents,
      portfolioChanges.taxableSpeculativeCents,
      portfolioChanges.taxableLegacyUnclassifiedCents,
    ],
    "v2 taxable market change",
  );
  const retirementChange = sumMoney(
    [
      portfolioChanges.retirement401kCents,
      portfolioChanges.retirementIraCents,
      portfolioChanges.retirementLegacyUnclassifiedCents,
    ],
    "v2 retirement market change",
  );
  const otherInvestableChange = sumMoney(
    [
      portfolioChanges.hsaCents,
      portfolioChanges.otherInvestableLegacyUnclassifiedCents,
    ],
    "v2 other-investable market change",
  );
  const accountChanges = [
    { accountId: "asset.cash", change: cashChange },
    { accountId: "asset.taxable_investments", change: taxableChange },
    { accountId: "asset.retirement", change: retirementChange },
    { accountId: "asset.other_investable", change: otherInvestableChange },
    { accountId: "asset.home", change: homeChange },
  ];
  const marketValueChangeCents = sumMoney(
    accountChanges.map(({ change }) => change),
    "v2 total market change",
  );
  const postings: JournalPosting[] = [];
  for (const { accountId, change } of accountChanges) {
    if (change > 0) postings.push(debit(accountId, change));
    if (change < 0) postings.push(credit(accountId, negateMoney(change)));
  }
  if (marketValueChangeCents > 0) {
    postings.push(credit("equity.adjustment", marketValueChangeCents));
  }
  if (marketValueChangeCents < 0) {
    postings.push(debit("equity.adjustment", negateMoney(marketValueChangeCents)));
  }
  let ledger: Ledger = state.ledger;
  let finances: FinancialSnapshot = state.finances;
  if (postings.length > 0) {
    ledger = appendTransaction(ledger, {
      id: `txn.${commandId}.market`,
      commandId,
      effectiveMonth: state.currentMonth,
      reasonCode: "monthly_market_revaluation_v2",
      description: "Apply deterministic market returns to detailed v2 balances",
      sourceSystem: "monthly_turn_v2",
      category: "asset.market_revaluation",
      causalReference: {
        kind: "command",
        id: commandId,
      },
      postings,
    });
    const nextPortfolio = Object.fromEntries(
      Object.entries(portfolio).map(([key, balance]) => [
        key,
        addSigned(
          balance,
          portfolioChanges[key as keyof PortfolioBreakdown],
        ),
      ]),
    ) as unknown as PortfolioBreakdown;
    finances = {
      ...state.finances,
      cashCents: addSigned(state.finances.cashCents, cashChange),
      taxableInvestmentsCents: addSigned(
        state.finances.taxableInvestmentsCents,
        taxableChange,
      ),
      retirementCents: addSigned(
        state.finances.retirementCents,
        retirementChange,
      ),
      otherInvestableAssetsCents: addSigned(
        state.finances.otherInvestableAssetsCents,
        otherInvestableChange,
      ),
      homeValueCents: addSigned(state.finances.homeValueCents, homeChange),
    };
    state = finalizeGameStateV2({
      ...state,
      ledger,
      finances,
      gameplay: { ...state.gameplay, portfolio: nextPortfolio },
    });
  }
  return Object.freeze({
    state: finalizeGameStateV2({
      ...state,
      random: simulation.nextState.random,
      marketRegime: simulation.nextState.regime,
      gameplay: {
        ...state.gameplay,
        market: {
          modelVersion: "regime-v1",
          monthsInRegime: simulation.nextState.monthsInRegime,
        },
      },
    }),
    month,
    marketValueChangeCents,
  });
}

function applyInsuranceClaim(
  state: GameStateV2,
  claim: MonthlyInsuranceClaim | undefined,
): Readonly<{ state: GameStateV2; playerCostCents: MoneyCents }> {
  if (!claim) return { state, playerCostCents: ZERO };
  const settlement =
    claim.type === "health"
      ? adjudicateHealthClaim(state, claim.grossAmountCents, claim.covered)
      : adjudicateCoverageClaim(
          state,
          claim.coverageId,
          claim.grossAmountCents,
          claim.eligible,
        );
  return Object.freeze({
    state: finalizeGameStateV2({
      ...state,
      gameplay: { ...state.gameplay, insurance: settlement.nextInsurance },
    }),
    playerCostCents: settlement.playerResponsibilityCents,
  });
}

function payNonDebtObligations(
  state: GameStateV2,
  commandId: string,
  amountCents: MoneyCents,
): GameStateV2 {
  if (amountCents === 0) return state;
  if (amountCents > state.finances.cashCents) {
    throw new MonthlyTurnV2Error(
      "TRANSITION_INVARIANT",
      "non-debt obligations were not pre-funded",
    );
  }
  const ledger = appendTransaction(state.ledger, {
    id: `txn.${commandId}.non-debt-obligations`,
    commandId,
    effectiveMonth: state.currentMonth,
    reasonCode: "monthly_non_debt_obligations_v2",
    description: "Pay living, benefit, insurance, and event obligations",
    sourceSystem: "monthly_turn_v2",
    category: "expense.non_debt_obligations",
    causalReference: {
      kind: "command",
      id: commandId,
    },
    postings: [debit("expense.living", amountCents), credit("asset.cash", amountCents)],
  });
  return finalizeGameStateV2({
    ...state,
    ledger,
    finances: {
      ...state.finances,
      cashCents: subtractMoney(state.finances.cashCents, amountCents),
    },
  });
}

function minimumDebtTotal(state: GameStateV2): MoneyCents {
  return sumMoney(
    state.gameplay.debts.termDebts.map(({ minimumPaymentCents }) =>
      minimumPaymentCents,
    ),
    "v2 minimum debt total",
  );
}

function applyAfterTaxPlan(
  state: GameStateV2,
  commandId: string,
  plan: RecurringAllocationPlan,
): GameStateV2 {
  const taxable = sumMoney(
    [
      plan.afterTax.broadIndexCents,
      plan.afterTax.sectorCents,
      plan.afterTax.speculativeCents,
    ],
    "v2 recurring taxable allocation",
  );
  const extraDebt = sumMoney(
    plan.afterTax.extraDebtPayments.map(({ amountCents }) => amountCents),
    "v2 recurring extra debt",
  );
  const total = sumMoney(
    [taxable, plan.afterTax.iraCents, extraDebt],
    "v2 recurring cash allocation",
  );
  if (total === 0) return state;
  if (total > state.finances.cashCents) {
    throw new MonthlyTurnV2Error(
      "TRANSITION_INVARIANT",
      "recurring allocation exceeds funded cash",
    );
  }
  const postings: JournalPosting[] = [];
  if (taxable > 0) postings.push(debit("asset.taxable_investments", taxable));
  if (plan.afterTax.iraCents > 0) {
    postings.push(debit("asset.retirement", plan.afterTax.iraCents));
  }
  if (extraDebt > 0) postings.push(debit("liability.non_credit", extraDebt));
  postings.push(credit("asset.cash", total));
  const ledger = appendTransaction(state.ledger, {
    id: `txn.${commandId}.after-tax-strategy`,
    commandId,
    effectiveMonth: state.currentMonth,
    reasonCode: "monthly_after_tax_strategy_v2",
    description: "Apply recurring investments, IRA, and extra debt payments",
    sourceSystem: "monthly_turn_v2",
    category: "allocation.after_tax_strategy",
    causalReference: {
      kind: "command",
      id: commandId,
    },
    postings,
  });
  const paymentByDebt = new Map(
    plan.afterTax.extraDebtPayments.map(({ debtId, amountCents }) => [
      debtId,
      amountCents,
    ]),
  );
  const oldMinimum = minimumDebtTotal(state);
  const termDebts = state.gameplay.debts.termDebts.map((debt) => {
    const payment = paymentByDebt.get(debt.id) ?? ZERO;
    if (payment === 0) return debt;
    return applyDebtPaymentV2(debt, ZERO, payment).debt;
  });
  const nextMinimum = sumMoney(
    termDebts.map(({ minimumPaymentCents }) => minimumPaymentCents),
    "v2 next minimum debt total",
  );
  return finalizeGameStateV2({
    ...state,
    ledger,
    finances: {
      ...state.finances,
      cashCents: subtractMoney(state.finances.cashCents, total),
      taxableInvestmentsCents: addMoney(
        state.finances.taxableInvestmentsCents,
        taxable,
      ),
      retirementCents: addMoney(
        state.finances.retirementCents,
        plan.afterTax.iraCents,
      ),
      nonCreditLiabilitiesCents: subtractMoney(
        state.finances.nonCreditLiabilitiesCents,
        extraDebt,
      ),
      requiredObligationsCents: addMoney(
        subtractMoney(state.finances.requiredObligationsCents, oldMinimum),
        nextMinimum,
      ),
    },
    gameplay: {
      ...state.gameplay,
      portfolio: {
        ...state.gameplay.portfolio,
        taxableBroadIndexCents: addMoney(
          state.gameplay.portfolio.taxableBroadIndexCents,
          plan.afterTax.broadIndexCents,
        ),
        taxableSectorCents: addMoney(
          state.gameplay.portfolio.taxableSectorCents,
          plan.afterTax.sectorCents,
        ),
        taxableSpeculativeCents: addMoney(
          state.gameplay.portfolio.taxableSpeculativeCents,
          plan.afterTax.speculativeCents,
        ),
        retirementIraCents: addMoney(
          state.gameplay.portfolio.retirementIraCents,
          plan.afterTax.iraCents,
        ),
      },
      debts: { ...state.gameplay.debts, termDebts },
      contributions: {
        ...state.gameplay.contributions,
        iraCents: addMoney(
          state.gameplay.contributions.iraCents,
          plan.afterTax.iraCents,
        ),
      },
    },
  });
}

type MonthlyTurnV2Dependencies = Readonly<{
  eventSchedulingPolicy?: EventSchedulingPolicyV2;
  macroStoryPolicy?: MacroStoryPolicyV2;
}>;

export function processMonthlyTurnV2(
  state: GameStateV2,
  command: ProcessMonthV2Command,
  dependencies: MonthlyTurnV2Dependencies = {},
): MonthlyTurnV2Result {
  const version = financialKernelVersionForCommandV2(command);
  const outcomePolicyVersion = outcomePolicyVersionForCommandV2(command);
  const eventSchedulerVersion = eventSchedulerVersionForCommandV2(command);
  const marketSelection = marketModelVersionForCommandV2(command);
  if (
    outcomePolicyVersion === OUTCOME_POLICY_V1_VERSION &&
    version !== FINANCIAL_KERNEL_V2_VERSION
  ) {
    throw new MonthlyTurnV2Error(
      "UNSUPPORTED_OUTCOME_POLICY_VERSION",
      "outcome policy 1.0.0 requires financial kernel 2.0.0",
    );
  }
  if (
    (eventSchedulerVersion === CAUSAL_EVENT_SCHEDULER_V1_VERSION ||
      eventSchedulerVersion === DECLARATIVE_EVENT_SCHEDULER_V2_VERSION) &&
    version !== FINANCIAL_KERNEL_V2_VERSION
  ) {
    throw new MonthlyTurnV2Error(
      "UNSUPPORTED_EVENT_SCHEDULER_VERSION",
      "causal event scheduling requires financial kernel 2.0.0",
    );
  }
  if (
    marketSelection.modelVersion === MACRO_MARKET_MODEL_V2_VERSION &&
    version !== FINANCIAL_KERNEL_V2_VERSION
  ) {
    throw new MonthlyTurnV2Error(
      "UNSUPPORTED_MARKET_MODEL_VERSION",
      "regime-v2 requires financial kernel 2.0.0",
    );
  }
  if (version === FINANCIAL_KERNEL_V2_VERSION) {
    return processMonthlyTurnV2Kernel200(
      state,
      command,
      dependencies,
      outcomePolicyVersion,
      eventSchedulerVersion,
      marketSelection,
    );
  }
  return processMonthlyTurnV2Legacy410(state, command, dependencies);
}

function sampleFinancialMarketStepV2(
  state: GameStateV2,
  marketSelection: MarketModelSelectionV2,
): SupportedMarketSimulationResult {
  if (marketSelection.modelVersion === MACRO_MARKET_MODEL_V2_VERSION) {
    return simulateMarketMonthV2(
      marketSimulationStateV2(
        state.marketRegime,
        state.random,
        marketSelection.difficulty,
        state.gameplay.market.monthsInRegime,
      ),
      activeMacroReturnModifiersV2(state),
    );
  }
  return simulateMarketMonth(
    marketSimulationState(
      state.marketRegime,
      state.random,
      state.gameplay.market.monthsInRegime,
    ),
    activeMacroReturnModifiersV2(state),
  );
}

function processMonthlyTurnV2Kernel200(
  state: GameStateV2,
  command: ProcessMonthV2Command,
  dependencies: MonthlyTurnV2Dependencies,
  outcomePolicyVersion: OutcomePolicyVersionV2,
  eventSchedulerVersion: EventSchedulerVersionV2,
  marketSelection: MarketModelSelectionV2,
): MonthlyTurnV2Result {
  validateCommand(state, command);
  try {
    const marketStep = sampleFinancialMarketStepV2(state, marketSelection);
    const eventCashFlows = (state.gameplay.eventLifecycle.activeCashFlows ?? [])
      .filter(({ startMonth }) => compareMonths(startMonth, state.currentMonth) <= 0)
      .map(({ id, kind, amountCents }) => ({
        id,
        kind,
        amountCents,
        sourceSystem: "personal_event_v2",
      })) satisfies readonly ResolvedCashFlowV2[];
    const financial = simulateFinancialMonthV2({
      version: FINANCIAL_KERNEL_V2_VERSION,
      commandId: command.id,
      state,
      taxEvidence: command.payload.taxEvidence,
      marketStep,
      taxableLiquidationCostRatePpm:
        command.payload.taxableLiquidationCostRatePpm,
      insuranceClaim: command.payload.insuranceClaim,
      resolvedCashFlows: [
        ...(command.payload.resolvedCashFlows ?? []),
        ...eventCashFlows,
      ],
    });
    const consumedCashFlows = (state.gameplay.eventLifecycle.activeCashFlows ?? [])
      .map((flow) => compareMonths(flow.startMonth, state.currentMonth) <= 0
        ? { ...flow, remainingMonths: flow.remainingMonths - 1 }
        : flow)
      .filter(({ remainingMonths }) => remainingMonths > 0);
    const persistedCashFlows = state.gameplay.eventLifecycle.activeCashFlows === undefined
      ? {}
      : { activeCashFlows: consumedCashFlows };
    const rehydrated = rehydrateFinancialClosingStateV2(state, financial.state);
    const careerCompleted = completeCareerDevelopmentV2(
      {
        ...rehydrated,
        gameplay: {
          ...rehydrated.gameplay,
          eventLifecycle: {
            ...rehydrated.gameplay.eventLifecycle,
            ...persistedCashFlows,
          },
        },
      },
    );
    const accepted = acceptFinancialMonthCommandV2(
      state,
      careerCompleted,
      command.id,
    );
    const exposed = recordExposureSnapshotV2(accepted, financial.nextMonth);
    const outcome =
      outcomePolicyVersion === OUTCOME_POLICY_V1_VERSION
        ? assessTerminalOutcomeV2(
            exposed,
            financial.record,
            outcomePolicyVersion,
          )
        : evaluateTerminalOutcomeV2(exposed, financial.shortfall);
    let nextState = finalizeGameStateV2({ ...exposed, outcome });
    if (outcome === null) {
      nextState = advanceMacroStoriesV2(
        nextState,
        dependencies.macroStoryPolicy,
      );
      const schedule = schedulePersonalEventV2(
        nextState,
        dependencies.eventSchedulingPolicy,
        eventSchedulerVersion,
      );
      nextState = finalizeGameStateV2({
        ...nextState,
        random: schedule.nextRandom,
      });
      if (schedule.event) {
        nextState = isScheduledDeclarativePersonalEventV2(schedule.event)
          ? queueScheduledDeclarativePersonalEventV2(nextState, schedule.event)
          : queueScheduledPersonalEventV2(nextState, schedule.event);
      }
    }
    const record = Object.freeze({
      ...financial.record,
      financialKernelVersion: FINANCIAL_KERNEL_V2_VERSION,
      ...(outcomePolicyVersion === OUTCOME_POLICY_V1_VERSION
        ? { outcomePolicyVersion }
        : {}),
      scheduledEvent: nextState.gameplay.eventLifecycle.pending,
      outcome,
    }) satisfies MonthlyTurnV2Record;
    return Object.freeze({ state: nextState, record });
  } catch (cause) {
    if (cause instanceof MonthlyTurnV2Error) throw cause;
    throw new MonthlyTurnV2Error(
      "TRANSITION_INVARIANT",
      "monthly v2 command failed atomically",
      cause,
    );
  }
}

/** Frozen unversioned/legacy-4.1.0 replay compatibility; dispatcher-only. */
function processMonthlyTurnV2Legacy410(
  state: GameStateV2,
  command: ProcessMonthV2Command,
  dependencies: MonthlyTurnV2Dependencies = {},
): MonthlyTurnV2Result {
  validateCommand(state, command);
  try {
    const claim = applyInsuranceClaim(state, command.payload.insuranceClaim);
    const market = applyMarketMonthV2(claim.state, command.id);
    const inflation = calculateMonthlyLivingCostInflationV2(
      market.state.finances.annualLivingCostCents,
      market.month.inflationPpm,
    );
    let working = finalizeGameStateV2({
      ...market.state,
      finances: {
        ...market.state.finances,
        annualLivingCostCents: addMoney(
          market.state.finances.annualLivingCostCents,
          inflation.annualIncreaseCents,
        ),
        requiredObligationsCents: addMoney(
          market.state.finances.requiredObligationsCents,
          inflation.monthlyObligationIncreaseCents,
        ),
      },
    });
    const payroll = applyMonthlyPayroll(
      working,
      command.id,
      command.payload.taxEvidence,
    );
    working = payroll.state;
    const debtPlan = planMonthlyDebtService(working);
    const oldMinimumDebt = minimumDebtTotal(working);
    const baseNonDebt = subtractMoney(
      working.finances.requiredObligationsCents,
      oldMinimumDebt,
    );
    const nonDebtObligations = addMoney(
      baseNonDebt,
      claim.playerCostCents,
    );
    const requiredCash = addMoney(
      nonDebtObligations,
      debtPlan.totalScheduledPaymentCents,
    );
    const liquidity = assessV2Liquidity(
      working,
      requiredCash,
      command.payload.taxableLiquidationCostRatePpm,
    );
    const nextMonth = addMonths(state.currentMonth, 1);
    if (liquidity.isBankrupt) {
      const outcome = Object.freeze({
        kind: "bankruptcy" as const,
        grade: "F" as const,
        reachedMonth: nextMonth,
        reasonCode: "required_obligations_exceed_automatic_liquidity",
      });
      const nextState = recordExposureSnapshotV2(
        completeCareerDevelopmentV2({
          ...working,
          currentMonth: nextMonth,
          revision: state.revision + 1,
          acceptedCommandIds: [...state.acceptedCommandIds, command.id],
          outcome,
        }),
        nextMonth,
      );
      return Object.freeze({
        state: nextState,
        record: Object.freeze({
          commandId: command.id,
          processedMonth: state.currentMonth,
          nextMonth,
          taxTraceId: command.payload.taxEvidence.traceId,
          grossIncomeCents: command.payload.taxEvidence.grossIncomeCents,
          totalTaxCents: moneyCents(command.payload.taxEvidence.totalTaxCents),
          afterTaxCashIncomeCents:
            command.payload.taxEvidence.afterTaxCashIncomeCents,
          market: market.month,
          marketValueChangeCents: market.marketValueChangeCents,
          annualInflationIncreaseCents: inflation.annualIncreaseCents,
          insurancePlayerCostCents: claim.playerCostCents,
          requiredCashCents: requiredCash,
          nonDebtObligationsPaidCents: ZERO,
          debtService: debtPlan,
          funding: null,
          recurringAllocations: null,
          scheduledEvent: null,
          outcome,
        }),
      });
    }
    const funding = prepareV2ObligationCash(
      working,
      command.id,
      requiredCash,
      command.payload.taxableLiquidationCostRatePpm,
    );
    working = payNonDebtObligations(
      funding.state,
      command.id,
      nonDebtObligations,
    );
    working = settleMonthlyDebtService(working, command.id).state;
    const discretionaryPay = moneyCents(
      Math.max(
        0,
        command.payload.taxEvidence.afterTaxCashIncomeCents - requiredCash,
      ),
    );
    const afterTaxPlan = planRecurringAllocations(
      working,
      command.payload.taxEvidence.grossIncomeCents,
      discretionaryPay,
    );
    const recurringAllocations = Object.freeze({
      ...afterTaxPlan,
      preTax: payroll.allocationPlan.preTax,
    });
    working = applyAfterTaxPlan(working, command.id, recurringAllocations);
    const beforeOutcome = recordExposureSnapshotV2(
      completeCareerDevelopmentV2({
        ...working,
        currentMonth: nextMonth,
        revision: state.revision + 1,
        acceptedCommandIds: [...state.acceptedCommandIds, command.id],
      }),
      nextMonth,
    );
    const outcomeProjection: GameState = {
      ...beforeOutcome,
      schemaVersion: 1,
      engineVersion: "4.0.0",
    };
    const outcome = evaluateTerminalOutcome(
      outcomeProjection,
      command.payload.taxableLiquidationCostRatePpm,
      beforeOutcome.gameplay.financialGoal,
    );
    let nextState = finalizeGameStateV2({ ...beforeOutcome, outcome });
    if (outcome === null) {
      nextState = advanceMacroStoriesV2(
        nextState,
        dependencies.macroStoryPolicy,
      );
      const schedule = schedulePersonalEventV2(
        nextState,
        dependencies.eventSchedulingPolicy,
        eventSchedulerVersionForCommandV2(command),
      );
      nextState = finalizeGameStateV2({
        ...nextState,
        random: schedule.nextRandom,
      });
      if (schedule.event) {
        nextState = isScheduledDeclarativePersonalEventV2(schedule.event)
          ? queueScheduledDeclarativePersonalEventV2(nextState, schedule.event)
          : queueScheduledPersonalEventV2(nextState, schedule.event);
      }
    }
    return Object.freeze({
      state: nextState,
      record: Object.freeze({
        commandId: command.id,
        processedMonth: state.currentMonth,
        nextMonth,
        taxTraceId: command.payload.taxEvidence.traceId,
        grossIncomeCents: command.payload.taxEvidence.grossIncomeCents,
        totalTaxCents: moneyCents(command.payload.taxEvidence.totalTaxCents),
        afterTaxCashIncomeCents:
          command.payload.taxEvidence.afterTaxCashIncomeCents,
        market: market.month,
        marketValueChangeCents: market.marketValueChangeCents,
        annualInflationIncreaseCents: inflation.annualIncreaseCents,
        insurancePlayerCostCents: claim.playerCostCents,
        requiredCashCents: requiredCash,
        nonDebtObligationsPaidCents: nonDebtObligations,
        debtService: debtPlan,
        funding: funding.funding,
        recurringAllocations,
        scheduledEvent: nextState.gameplay.eventLifecycle.pending,
        outcome,
      }),
    });
  } catch (cause) {
    if (cause instanceof MonthlyTurnV2Error) throw cause;
    throw new MonthlyTurnV2Error(
      "TRANSITION_INVARIANT",
      "monthly v2 command failed atomically",
      cause,
    );
  }
}
