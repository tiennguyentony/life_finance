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
import {
  addMonths,
  compareMonths,
  monthsBetween,
  simulationMonth,
  type SimulationMonth,
} from "./domain/month";
import { sha256Canonical } from "./canonical";
import {
  applyDebtPaymentV2,
  planMonthlyDebtService,
  settleMonthlyDebtService,
} from "./debt-service-v2";
import type { FinancialSnapshot, GameState } from "./game-state";
import type { AiContentSource } from "./ai-source";
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
  PERSONAL_EVENT_TEMPLATES_V2,
  PRODUCTION_PERSONAL_EVENT_TEMPLATES_V2,
} from "../data/personal-event-templates-v2";
import {
  ACTIVE_BEGINNER_EVENT_CADENCE_VERSION,
  BEGINNER_EVENT_CADENCE_V1_VERSION,
  applyBeginnerEventCadenceV1,
  assessBeginnerEventCadenceV1,
  beginnerEventCadenceFallbackCandidatesV1,
  type BeginnerEventCadenceEvidenceV1,
} from "./beginner-event-cadence-v1";
import {
  generateDeclarativePersonalEventCandidatesV2,
  generateNamedDeclarativePersonalEventCandidatesV2,
  validatePersonalEventCatalogV2,
  type PersonalEventTemplateV2,
} from "./personal-event-v2";
import {
  chooseBalancedEventV2,
  type RuntimeBalanceDecisionV2,
} from "./runtime-balance-controller-v2";
import {
  RUNTIME_BALANCE_CONTROLLER_V1_VERSION,
} from "./runtime-balance-policy-v2";
import {
  advanceRuntimeBalanceCalendarMonthV2,
  recordRuntimeBalanceCashFlowV2,
  runtimeBalanceStateV2,
} from "./runtime-balance-state-v2";
import { analyzeRiskV1 } from "./risk-v1";
import {
  applyScenarioDirectorRankingOverrideV2,
  rankScenarioCandidatesV2,
  type ScenarioDirectorDecisionV2,
  type ScenarioDirectorInputV2,
  type ScenarioDirectorRankingOverrideV2,
} from "./scenario-director-v2";
import {
  projectScenarioDirectorStateContextV2,
  scenarioDirectorTagsForCandidateV2,
} from "./scenario-director-context-v2";
import { SCENARIO_DIRECTOR_V2_VERSION } from "./scenario-director-policy-v2";
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
import {
  advanceEventEpochsV1,
  eventParameterDrawV1,
  initializeNamedWorldRandomV1,
  withNextMacroStateV1,
  WORLD_RANDOM_VERSION_V1,
  type WorldRandomStateV1,
} from "./world-random-v1";

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

export type ScenarioDirectorAiEvidenceV2 = Readonly<{
  mode: "shadow" | "active";
  source: AiContentSource;
  status: "validated" | "fallback";
  latencyMs: number;
  candidateCount: number;
  topCandidateAgreement: boolean | null;
}>;

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
    runtimeBalanceControllerVersion?:
      typeof RUNTIME_BALANCE_CONTROLLER_V1_VERSION;
    scenarioDirectorVersion?: typeof SCENARIO_DIRECTOR_V2_VERSION;
    scenarioDirectorRankingOverride?: ScenarioDirectorRankingOverrideV2;
    scenarioDirectorAiEvidence?: ScenarioDirectorAiEvidenceV2;
    worldRandomVersion?: typeof WORLD_RANDOM_VERSION_V1;
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
  runtimeBalanceControllerVersion?:
    typeof RUNTIME_BALANCE_CONTROLLER_V1_VERSION;
  runtimeBalanceDecision?: RuntimeBalanceDecisionV2;
  scenarioDirectorVersion?: typeof SCENARIO_DIRECTOR_V2_VERSION;
  scenarioDirectorDecision?: ScenarioDirectorDecisionV2;
  scenarioDirectorAiEvidence?: ScenarioDirectorAiEvidenceV2;
  runtimeBalanceCandidateSet?: Readonly<{
    eligibleTemplateIds: readonly string[];
    candidateTemplateIds: readonly string[];
  }>;
  beginnerEventCadence?: BeginnerEventCadenceEvidenceV1;
  worldRandomEvidence?: Readonly<{
    version: typeof WORLD_RANDOM_VERSION_V1;
    macroEvidenceHash: string;
    rawOpportunityFingerprint: string | null;
    grossParameterFingerprint: string | null;
    openingMacroStateValue: number;
    nextMacroStateValue: number;
    openingOpportunityEpochValue: number;
    nextOpportunityEpochValue: number;
    openingParameterEpochValue: number;
    nextParameterEpochValue: number;
  }>;
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
    | "UNSUPPORTED_RUNTIME_BALANCE_CONTROLLER_VERSION"
    | "UNSUPPORTED_SCENARIO_DIRECTOR_VERSION"
    | "UNSUPPORTED_MARKET_MODEL_VERSION"
    | "UNSUPPORTED_WORLD_RANDOM_VERSION"
    | "INVALID_EVENT_CONFIG"
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

export function runtimeBalanceControllerVersionForCommandV2(
  command: ProcessMonthV2Command,
): typeof RUNTIME_BALANCE_CONTROLLER_V1_VERSION | null {
  const version = command.payload.runtimeBalanceControllerVersion;
  if (version === undefined) return null;
  if (version === RUNTIME_BALANCE_CONTROLLER_V1_VERSION) return version;
  throw new MonthlyTurnV2Error(
    "UNSUPPORTED_RUNTIME_BALANCE_CONTROLLER_VERSION",
    `unsupported Runtime Balance controller version: ${String(version)}`,
  );
}

export function scenarioDirectorVersionForCommandV2(
  command: ProcessMonthV2Command,
): typeof SCENARIO_DIRECTOR_V2_VERSION | null {
  const version = command.payload.scenarioDirectorVersion;
  if (version === undefined) return null;
  if (version === SCENARIO_DIRECTOR_V2_VERSION) return version;
  throw new MonthlyTurnV2Error(
    "UNSUPPORTED_SCENARIO_DIRECTOR_VERSION",
    `unsupported Scenario Director version: ${String(version)}`,
  );
}

export function worldRandomVersionForCommandV2(
  command: ProcessMonthV2Command,
): typeof WORLD_RANDOM_VERSION_V1 | null {
  const version = command.payload.worldRandomVersion;
  if (version === undefined) return null;
  if (version === WORLD_RANDOM_VERSION_V1) return version;
  throw new MonthlyTurnV2Error(
    "UNSUPPORTED_WORLD_RANDOM_VERSION",
    `unsupported world random version: ${String(version)}`,
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

export type MonthlyTurnV2Dependencies = Readonly<{
  eventSchedulingPolicy?: EventSchedulingPolicyV2;
  macroStoryPolicy?: MacroStoryPolicyV2;
  personalEventCatalog?: readonly PersonalEventTemplateV2[];
  activePersonalEventCatalog?: readonly PersonalEventTemplateV2[];
  beginnerEventCadenceVersion?:
    | typeof BEGINNER_EVENT_CADENCE_V1_VERSION
    | null;
  scenarioDirectorInputObserver?: (input: ScenarioDirectorInputV2) => void;
}>;

export function processMonthlyTurnV2(
  state: GameStateV2,
  command: ProcessMonthV2Command,
  dependencies: MonthlyTurnV2Dependencies = {},
): MonthlyTurnV2Result {
  const version = financialKernelVersionForCommandV2(command);
  const outcomePolicyVersion = outcomePolicyVersionForCommandV2(command);
  const eventSchedulerVersion = eventSchedulerVersionForCommandV2(command);
  const runtimeBalanceControllerVersion =
    runtimeBalanceControllerVersionForCommandV2(command);
  const scenarioDirectorVersion = scenarioDirectorVersionForCommandV2(command);
  const worldRandomVersion = worldRandomVersionForCommandV2(command);
  const marketSelection = marketModelVersionForCommandV2(command);
  if (state.worldRandom !== undefined && worldRandomVersion === null) {
    throw new MonthlyTurnV2Error(
      "UNSUPPORTED_WORLD_RANDOM_VERSION",
      "states containing named world streams cannot downgrade to shared-root randomness",
    );
  }
  if (
    worldRandomVersion === WORLD_RANDOM_VERSION_V1 &&
    (version !== FINANCIAL_KERNEL_V2_VERSION ||
      eventSchedulerVersion !== DECLARATIVE_EVENT_SCHEDULER_V2_VERSION ||
      runtimeBalanceControllerVersion !== RUNTIME_BALANCE_CONTROLLER_V1_VERSION ||
      scenarioDirectorVersion !== SCENARIO_DIRECTOR_V2_VERSION ||
      marketSelection.modelVersion !== MACRO_MARKET_MODEL_V2_VERSION)
  ) {
    throw new MonthlyTurnV2Error(
      "UNSUPPORTED_WORLD_RANDOM_VERSION",
      "named-world-rng-v1 requires the production financial, macro, declarative event, Runtime Balance, and Scenario Director versions",
    );
  }
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
    runtimeBalanceControllerVersion === RUNTIME_BALANCE_CONTROLLER_V1_VERSION &&
    (version !== FINANCIAL_KERNEL_V2_VERSION ||
      eventSchedulerVersion !== DECLARATIVE_EVENT_SCHEDULER_V2_VERSION)
  ) {
    throw new MonthlyTurnV2Error(
      "UNSUPPORTED_RUNTIME_BALANCE_CONTROLLER_VERSION",
      "runtime-balance-v1 requires financial kernel 2.0.0 and declarative-events-v2",
    );
  }
  if (
    scenarioDirectorVersion === SCENARIO_DIRECTOR_V2_VERSION &&
    runtimeBalanceControllerVersion !== RUNTIME_BALANCE_CONTROLLER_V1_VERSION
  ) {
    throw new MonthlyTurnV2Error(
      "UNSUPPORTED_SCENARIO_DIRECTOR_VERSION",
      "scenario-director-v2 requires runtime-balance-v1",
    );
  }
  if (
    runtimeBalanceControllerVersion === null &&
    state.gameplay.runtimeBalance?.version === 2
  ) {
    throw new MonthlyTurnV2Error(
      "UNSUPPORTED_RUNTIME_BALANCE_CONTROLLER_VERSION",
      "Runtime Balance state v2 cannot downgrade to direct declarative scheduling",
    );
  }
  if (
    runtimeBalanceControllerVersion === RUNTIME_BALANCE_CONTROLLER_V1_VERSION &&
    state.gameplay.runtimeBalance?.version === 2 &&
    marketSelection.difficulty !== null &&
    state.gameplay.runtimeBalance.difficulty !== marketSelection.difficulty
  ) {
    throw new MonthlyTurnV2Error(
      "UNSUPPORTED_RUNTIME_BALANCE_CONTROLLER_VERSION",
      "Runtime Balance difficulty must match the explicit macro difficulty",
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
      runtimeBalanceControllerVersion,
      scenarioDirectorVersion,
      marketSelection,
      worldRandomVersion,
    );
  }
  return processMonthlyTurnV2Legacy410(state, command, dependencies);
}

function sampleFinancialMarketStepV2(
  state: GameStateV2,
  marketSelection: MarketModelSelectionV2,
  random = state.random,
): SupportedMarketSimulationResult {
  if (marketSelection.modelVersion === MACRO_MARKET_MODEL_V2_VERSION) {
    return simulateMarketMonthV2(
      marketSimulationStateV2(
        state.marketRegime,
        random,
        marketSelection.difficulty,
        state.gameplay.market.monthsInRegime,
      ),
      activeMacroReturnModifiersV2(state),
    );
  }
  return simulateMarketMonth(
    marketSimulationState(
      state.marketRegime,
      random,
      state.gameplay.market.monthsInRegime,
    ),
    activeMacroReturnModifiersV2(state),
  );
}

function scenarioDirectorInputForMonthlyTurnV2(
  state: GameStateV2,
  candidates: ReturnType<
    typeof generateDeclarativePersonalEventCandidatesV2
  >["candidates"],
  eventCatalog: readonly PersonalEventTemplateV2[],
): ScenarioDirectorInputV2 {
  const balance = state.gameplay.runtimeBalance;
  if (balance?.version !== 2) {
    throw new RangeError("Scenario Director v2 requires Runtime Balance state v2");
  }
  const context = projectScenarioDirectorStateContextV2(state, {
    personalEventCatalog: eventCatalog,
  });
  return Object.freeze({
    version: SCENARIO_DIRECTOR_V2_VERSION,
    month: state.currentMonth,
    riskSnapshot: analyzeRiskV1(state),
    macro: context.macro,
    candidates: Object.freeze(
      candidates.map(({ template, targetedWeakness }) =>
        Object.freeze({
          templateId: template.id,
          templateVersion: template.version,
          category: template.category,
          tier: template.severityTier,
          targetedWeakness,
          lessonTags: template.lessonTags,
          directorTags: scenarioDirectorTagsForCandidateV2(
            template,
            targetedWeakness,
          ),
        }),
      ),
    ),
    recentDecisions: context.recentDecisions,
    recentEvents: context.recentEvents,
    lessonExposureCounts: context.lessonExposureCounts,
    difficulty: context.difficulty,
    ...(context.storyArc === undefined ? {} : { storyArc: context.storyArc }),
  });
}

function processMonthlyTurnV2Kernel200(
  state: GameStateV2,
  command: ProcessMonthV2Command,
  dependencies: MonthlyTurnV2Dependencies,
  outcomePolicyVersion: OutcomePolicyVersionV2,
  eventSchedulerVersion: EventSchedulerVersionV2,
  runtimeBalanceControllerVersion:
    | typeof RUNTIME_BALANCE_CONTROLLER_V1_VERSION
    | null,
  scenarioDirectorVersion: typeof SCENARIO_DIRECTOR_V2_VERSION | null,
  marketSelection: MarketModelSelectionV2,
  worldRandomVersion: typeof WORLD_RANDOM_VERSION_V1 | null,
): MonthlyTurnV2Result {
  validateCommand(state, command);
  const eventCatalog = dependencies.personalEventCatalog ?? PERSONAL_EVENT_TEMPLATES_V2;
  const activeEventCatalog = dependencies.activePersonalEventCatalog ??
    dependencies.personalEventCatalog ??
    PRODUCTION_PERSONAL_EVENT_TEMPLATES_V2;
  const beginnerEventCadenceVersion =
    dependencies.beginnerEventCadenceVersion ??
    ACTIVE_BEGINNER_EVENT_CADENCE_VERSION;
  const validationOptions = {
    personalEventCatalog: eventCatalog,
    allowTransientRandomAdvance: true,
  };
  if (worldRandomVersion === WORLD_RANDOM_VERSION_V1) {
    const violations = validatePersonalEventCatalogV2(eventCatalog);
    if (violations.length > 0) {
      throw new MonthlyTurnV2Error(
        "INVALID_EVENT_CONFIG",
        `named world scheduling rejected invalid event configuration: ${violations
          .map(({ path, code }) => `${path}:${code}`)
          .join(",")}`,
      );
    }
  }
  try {
    const openingWorld: WorldRandomStateV1 | null = worldRandomVersion === null
      ? null
      : state.worldRandom ?? initializeNamedWorldRandomV1(state.random);
    const stateForMonth: GameStateV2 = openingWorld === null
      ? state
      : ({ ...state, worldRandom: openingWorld } as GameStateV2);
    const marketStep = sampleFinancialMarketStepV2(
      stateForMonth,
      marketSelection,
      openingWorld?.macro,
    );
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
      state: stateForMonth,
      taxEvidence: command.payload.taxEvidence,
      marketStep,
      taxableLiquidationCostRatePpm:
        command.payload.taxableLiquidationCostRatePpm,
      insuranceClaim: command.payload.insuranceClaim,
      resolvedCashFlows: [
        ...(command.payload.resolvedCashFlows ?? []),
        ...eventCashFlows,
      ],
      validationOptions,
    });
    const consumedCashFlows = (state.gameplay.eventLifecycle.activeCashFlows ?? [])
      .map((flow) => compareMonths(flow.startMonth, state.currentMonth) <= 0
        ? { ...flow, remainingMonths: flow.remainingMonths - 1 }
        : flow)
      .filter(({ remainingMonths }) => remainingMonths > 0);
    const persistedCashFlows = state.gameplay.eventLifecycle.activeCashFlows === undefined
      ? {}
      : { activeCashFlows: consumedCashFlows };
    const rehydratedFinancialClosing = rehydrateFinancialClosingStateV2(
      stateForMonth,
      financial.state,
    );
    const retainedMacroStories = rehydratedFinancialClosing.gameplay.eventLifecycle.macroStories
      .filter(({ expiresMonth }) => compareMonths(expiresMonth, financial.nextMonth) >= 0);
    const baseFinancialClosing: GameStateV2 = {
      ...rehydratedFinancialClosing,
      gameplay: {
        ...rehydratedFinancialClosing.gameplay,
        eventLifecycle: {
          ...rehydratedFinancialClosing.gameplay.eventLifecycle,
          macroStories: retainedMacroStories,
          activeStoryIds: retainedMacroStories.map(({ storyId }) => storyId),
        },
      },
    } as GameStateV2;
    let worldAfterMacro = openingWorld === null
      ? null
      : withNextMacroStateV1(openingWorld, marketStep.nextState.random);
    const financialClosing: GameStateV2 = worldAfterMacro === null
      ? baseFinancialClosing
      : ({
          ...baseFinancialClosing,
          random: state.random,
          worldRandom: worldAfterMacro,
        } as GameStateV2);
    const advancedRuntimeBalance =
      runtimeBalanceControllerVersion === RUNTIME_BALANCE_CONTROLLER_V1_VERSION
        ? advanceRuntimeBalanceCalendarMonthV2(runtimeBalanceStateV2(
            state.gameplay.runtimeBalance,
            state.gameplay.runtimeBalance?.version === 2
              ? state.gameplay.runtimeBalance.difficulty
              : marketSelection.difficulty ?? "normal",
            state.currentMonth,
          ))
        : null;
    const rehydrated = advancedRuntimeBalance === null
      ? financialClosing
      : {
          ...financialClosing,
          gameplay: {
            ...financialClosing.gameplay,
            runtimeBalance: advancedRuntimeBalance,
          },
        };
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
      validationOptions,
    );
    const accepted = acceptFinancialMonthCommandV2(
      state,
      careerCompleted,
      command.id,
      validationOptions,
    );
    const exposed = eventSchedulerVersion === LEGACY_EXPOSURE_EVENT_SCHEDULER
      ? recordExposureSnapshotV2(accepted, financial.nextMonth, validationOptions)
      : accepted;
    const outcome =
      outcomePolicyVersion === OUTCOME_POLICY_V1_VERSION
        ? assessTerminalOutcomeV2(
            exposed,
            financial.record,
            outcomePolicyVersion,
          )
        : evaluateTerminalOutcomeV2(exposed, financial.shortfall);
    const exposedWithRuntimeBalance = advancedRuntimeBalance === null
      ? exposed
      : {
          ...exposed,
          gameplay: {
            ...exposed.gameplay,
            runtimeBalance: recordRuntimeBalanceCashFlowV2(
              advancedRuntimeBalance,
              BigInt(financial.record.afterTaxCashIncomeCents) +
                  BigInt(financial.record.resolvedIncomeCents) <
                BigInt(financial.record.requiredCashCents),
            ),
          },
        };
    let nextState = finalizeGameStateV2(
      { ...exposedWithRuntimeBalance, outcome },
      validationOptions,
    );
    let runtimeBalanceDecision: RuntimeBalanceDecisionV2 | undefined;
    let scenarioDirectorInput: ScenarioDirectorInputV2 | undefined;
    let scenarioDirectorDecision: ScenarioDirectorDecisionV2 | undefined;
    let runtimeBalanceCandidateSet:
      | MonthlyTurnV2Record["runtimeBalanceCandidateSet"]
      | undefined;
    let beginnerEventCadence:
      | MonthlyTurnV2Record["beginnerEventCadence"]
      | undefined;
    let rawOpportunityFingerprint: string | null = null;
    let grossParameterFingerprint: string | null = null;
    if (outcome === null) {
      if (worldAfterMacro === null) {
        nextState = advanceMacroStoriesV2(
          nextState,
          dependencies.macroStoryPolicy,
          validationOptions,
        );
      } else {
        const advancedStories = advanceMacroStoriesV2(
          finalizeGameStateV2(
            { ...nextState, random: worldAfterMacro.macro },
            validationOptions,
          ),
          dependencies.macroStoryPolicy,
          validationOptions,
        );
        worldAfterMacro = withNextMacroStateV1(
          worldAfterMacro,
          advancedStories.random,
        );
        nextState = finalizeGameStateV2(
          {
            ...advancedStories,
            random: state.random,
            worldRandom: worldAfterMacro,
          },
          validationOptions,
        );
      }
      if (
        runtimeBalanceControllerVersion ===
        RUNTIME_BALANCE_CONTROLLER_V1_VERSION
      ) {
        const balance = nextState.gameplay.runtimeBalance;
        if (balance?.version !== 2) {
          throw new RangeError("Runtime Balance v2 must be advanced before scheduling");
        }
        const generatedCandidates = worldAfterMacro === null
          ? generateDeclarativePersonalEventCandidatesV2(
              nextState,
              activeEventCatalog,
              eventCatalog,
            )
          : generateNamedDeclarativePersonalEventCandidatesV2(
              nextState,
              activeEventCatalog,
              eventCatalog,
            );
        const cadenceAssessment = beginnerEventCadenceVersion ===
            BEGINNER_EVENT_CADENCE_V1_VERSION
          ? assessBeginnerEventCadenceV1(nextState)
          : null;
        const cadenceResult = cadenceAssessment === null
          ? null
          : applyBeginnerEventCadenceV1(
              cadenceAssessment,
              generatedCandidates.candidates,
              undefined,
              beginnerEventCadenceFallbackCandidatesV1(
                nextState,
                activeEventCatalog,
                eventCatalog,
              ),
            );
        const candidates = cadenceResult === null
          ? generatedCandidates
          : Object.freeze({
              ...generatedCandidates,
              candidates: cadenceResult.candidates,
              candidateTemplateIds: Object.freeze(
                cadenceResult.candidates.map(({ template }) => template.id),
              ),
            });
        if (cadenceAssessment !== null && cadenceResult !== null) {
          beginnerEventCadence = Object.freeze({
            assessment: cadenceAssessment,
            inputCandidateIds: Object.freeze(
              generatedCandidates.candidates.map(({ template }) => template.id),
            ),
            outputCandidateIds: Object.freeze(
              cadenceResult.candidates.map(({ template }) => template.id),
            ),
            preferredCandidateIds: cadenceResult.preferredCandidateIds,
            scheduledTemplateId: null,
            safetyOverride: false,
          });
        }
        if (
          "rawOpportunityFingerprint" in generatedCandidates &&
          typeof generatedCandidates.rawOpportunityFingerprint === "string"
        ) {
          rawOpportunityFingerprint = generatedCandidates.rawOpportunityFingerprint;
        }
        runtimeBalanceCandidateSet = Object.freeze({
          eligibleTemplateIds: candidates.eligibleTemplateIds,
          candidateTemplateIds: candidates.candidateTemplateIds,
        });
        if (scenarioDirectorVersion === SCENARIO_DIRECTOR_V2_VERSION) {
          scenarioDirectorInput = scenarioDirectorInputForMonthlyTurnV2(
            nextState,
            candidates.candidates,
            eventCatalog,
          );
          dependencies.scenarioDirectorInputObserver?.(scenarioDirectorInput);
          scenarioDirectorDecision =
            command.payload.scenarioDirectorRankingOverride === undefined
              ? rankScenarioCandidatesV2(scenarioDirectorInput)
              : applyScenarioDirectorRankingOverrideV2(
                  scenarioDirectorInput,
                  command.payload.scenarioDirectorRankingOverride,
                );
        }
        const monthIndex = monthsBetween(
          simulationMonth("0001-01"),
          nextState.currentMonth,
        );
        const eventParameterEpoch = worldAfterMacro?.eventParameters;
        const parameterCatalogByIdentity = new Map(
          activeEventCatalog.map((template) => [
            `${template.id}@${template.version}`,
            template,
          ]),
        );
        for (const { template } of candidates.candidates) {
          parameterCatalogByIdentity.set(
            `${template.id}@${template.version}`,
            template,
          );
        }
        const grossParameterEvidence = eventParameterEpoch === undefined
          ? null
          : Object.freeze(
              [...parameterCatalogByIdentity.values()]
                .toSorted(
                  (left, right) =>
                    left.id.localeCompare(right.id) || left.version - right.version,
                )
                .map((template) =>
                  Object.freeze({
                    templateId: template.id,
                    templateVersion: template.version,
                    parameters: Object.freeze(
                      Object.fromEntries(
                        [...template.parameters]
                          .toSorted((left, right) => left.id.localeCompare(right.id))
                          .map((parameter) => [
                            parameter.id,
                            eventParameterDrawV1({
                              epoch: eventParameterEpoch,
                              simulationMonth: monthIndex,
                              templateId: template.id,
                              templateVersion: template.version,
                              parameterId: parameter.id,
                              minimumInclusive: parameter.minimum,
                              maximumInclusive: parameter.maximum,
                            }).value,
                          ]),
                      ),
                    ),
                  }),
                ),
            );
        grossParameterFingerprint = grossParameterEvidence === null
          ? null
          : sha256Canonical(grossParameterEvidence);
        const parameterEvidenceByIdentity = grossParameterEvidence === null
          ? null
          : new Map(
              grossParameterEvidence.map((entry) => [
                `${entry.templateId}@${entry.templateVersion}`,
                entry.parameters,
              ]),
            );
        const choice = chooseBalancedEventV2(
          nextState,
          candidates.candidates,
          candidates.nextRandom,
          command.payload.taxableLiquidationCostRatePpm,
          {
            eventCatalog,
            monthlyCashFlowEvidence: {
              monthlyCashInflowCents: moneyCents(
                safeBigIntToNumber(
                  BigInt(financial.record.afterTaxCashIncomeCents) +
                    BigInt(financial.record.resolvedIncomeCents),
                  "runtime balance monthly cash inflow",
                ),
              ),
              requiredCashCents: financial.record.requiredCashCents,
            },
            ...(scenarioDirectorDecision === undefined
              ? {}
              : {
                  scenarioDirectorInput,
                  scenarioDirectorDecision,
                }),
            ...(parameterEvidenceByIdentity === null
              ? {}
              : {
                  parameterSampler: (template: PersonalEventTemplateV2) =>
                    parameterEvidenceByIdentity.get(
                      `${template.id}@${template.version}`,
                    )!,
                }),
            ...(cadenceAssessment?.mode === "challenge_due"
              ? { preferredChallengeBands: ["meaningful", "crisis"] as const }
              : {}),
          },
        );
        runtimeBalanceDecision = choice.decision;
        if (beginnerEventCadence !== undefined) {
          const dueMode = [
            "follow_up_due",
            "positive_due",
            "absurd_due",
            "challenge_due",
            "engagement_due",
          ].includes(beginnerEventCadence.assessment.mode);
          beginnerEventCadence = Object.freeze({
            ...beginnerEventCadence,
            scheduledTemplateId: choice.event?.template.id ?? null,
            safetyOverride:
              dueMode &&
              beginnerEventCadence.preferredCandidateIds.length > 0 &&
              choice.event === null,
          });
        }
        const chosenState = {
          ...nextState,
          random: choice.nextRandom,
          gameplay: {
            ...nextState.gameplay,
            runtimeBalance: choice.runtimeBalance,
          },
        } as GameStateV2;
        nextState = choice.event === null
          ? finalizeGameStateV2(chosenState, validationOptions)
          : queueScheduledDeclarativePersonalEventV2(chosenState, choice.event, {
              personalEventCatalog: eventCatalog,
            });
      } else {
        const schedule = schedulePersonalEventV2(
          nextState,
          dependencies.eventSchedulingPolicy,
          eventSchedulerVersion,
        );
        nextState = finalizeGameStateV2(
          {
            ...nextState,
            random: schedule.nextRandom,
          },
          validationOptions,
        );
        if (schedule.event) {
          nextState = isScheduledDeclarativePersonalEventV2(schedule.event)
            ? queueScheduledDeclarativePersonalEventV2(nextState, schedule.event, {
                personalEventCatalog: eventCatalog,
              })
            : queueScheduledPersonalEventV2(
                nextState,
                schedule.event,
                validationOptions,
              );
        }
      }
      if (worldAfterMacro !== null) {
        nextState = finalizeGameStateV2({
          ...nextState,
          random: state.random,
          worldRandom: advanceEventEpochsV1(worldAfterMacro),
        }, validationOptions);
      }
    }
    const closingWorld = nextState.worldRandom;
    const worldRandomEvidence = openingWorld === null || closingWorld === undefined
      ? undefined
      : Object.freeze({
          version: WORLD_RANDOM_VERSION_V1,
          macroEvidenceHash: sha256Canonical({
            processedMonth: state.currentMonth,
            market: financial.record.market,
          }),
          rawOpportunityFingerprint,
          grossParameterFingerprint,
          openingMacroStateValue: openingWorld.macro.value,
          nextMacroStateValue: closingWorld.macro.value,
          openingOpportunityEpochValue: openingWorld.eventOpportunity.value,
          nextOpportunityEpochValue: closingWorld.eventOpportunity.value,
          openingParameterEpochValue: openingWorld.eventParameters.value,
          nextParameterEpochValue: closingWorld.eventParameters.value,
        });
    const record = Object.freeze({
      ...financial.record,
      financialKernelVersion: FINANCIAL_KERNEL_V2_VERSION,
      ...(outcomePolicyVersion === OUTCOME_POLICY_V1_VERSION
        ? { outcomePolicyVersion }
        : {}),
      scheduledEvent: nextState.gameplay.eventLifecycle.pending,
      ...(runtimeBalanceControllerVersion === null
        ? {}
        : { runtimeBalanceControllerVersion }),
      ...(runtimeBalanceDecision === undefined
        ? {}
        : { runtimeBalanceDecision }),
      ...(scenarioDirectorVersion === null
        ? {}
        : { scenarioDirectorVersion }),
      ...(scenarioDirectorDecision === undefined
        ? {}
        : { scenarioDirectorDecision }),
      ...(command.payload.scenarioDirectorAiEvidence === undefined
        ? {}
        : {
            scenarioDirectorAiEvidence:
              command.payload.scenarioDirectorAiEvidence,
          }),
      ...(runtimeBalanceCandidateSet === undefined
        ? {}
        : { runtimeBalanceCandidateSet }),
      ...(beginnerEventCadence === undefined
        ? {}
        : { beginnerEventCadence }),
      ...(worldRandomEvidence === undefined ? {} : { worldRandomEvidence }),
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
