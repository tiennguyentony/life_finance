import { safeBigIntToNumber } from "./domain/integer";
import {
  addMoney,
  moneyCents,
  multiplyMoneyByRate,
  negateMoney,
  subtractMoney,
  type MoneyCents,
  type RatePpm,
} from "./domain/money";
import { addMonths, type SimulationMonth } from "./domain/month";
import {
  applyDebtPaymentV2,
  calculateStoredMinimumDebtObligationV2,
  planLegacyMonthlyDebtService,
  planMonthlyDebtService,
  settleLegacyMonthlyDebtService,
  settleMonthlyDebtService,
  type LegacyMonthlyDebtServicePlan,
  type MonthlyDebtServicePlan,
} from "./debt-service-v2";
import { resetAnnualFinancialAccumulatorsV2 } from "./financial-year-v2";
import { calculateNetWorth, reconcileFinancesWithLedger } from "./game-state";
import {
  finalizeGameStateV2,
  validateGameStateV2,
  type GameStateV2,
  type PortfolioBreakdown,
} from "./game-state-v2";
import type { GameStateV2ValidationOptions } from "./game-state-v2-validation";
import {
  advanceCumulativePriceIndexV2,
  calculateMonthlyLivingCostInflationV2,
  currentCumulativePriceIndexPpmV2,
} from "./inflation-v2";
import { adjudicateCoverageClaim, adjudicateHealthClaim } from "./insurance-v2";
import { ownForDeepFreeze } from "./immutable-ownership";
import { appendTransaction, type JournalPosting } from "./ledger";
import {
  MACRO_MARKET_CALIBRATION_V2_VERSION,
  MACRO_MARKET_MODEL_V2_VERSION,
  MARKET_MODEL_VERSION,
  validateMacroMarketMonthV2,
  type SupportedMarketMonth,
  type SupportedMarketSimulationResult,
} from "./market";
import {
  assessV2Liquidity,
  executeV2ObligationFunding,
  planV2ObligationFunding,
  type V2FundingRecord,
  type V2ObligationFundingPlan,
} from "./obligation-funding-v2";
import { applyMonthlyPayroll, type MonthlyTaxEvidence } from "./payroll-v2";
import {
  planRecurringAllocations,
  type RecurringAllocationPlan,
} from "./recurring-strategy-v2";

export const FINANCIAL_KERNEL_V2_VERSION = "2.0.0" as const;
export const FINANCIAL_CLOSING_STATE_V2_KIND = "financial_closing_v2" as const;

export type MonthlyInsuranceClaimV2 =
  | Readonly<{
      type: "health";
      grossAmountCents: MoneyCents;
      covered: boolean;
    }>
  | Readonly<{
      type: "selected_coverage";
      coverageId: string;
      grossAmountCents: MoneyCents;
      eligible: boolean;
    }>;

export type ResolvedCashFlowV2 = Readonly<{
  id: string;
  kind:
    | "other_income"
    | "recurring_expense"
    | "temporary_income"
    | "temporary_expense";
  amountCents: MoneyCents;
  sourceSystem: string;
}>;

export type FinancialMonthInputV2 = Readonly<{
  version: typeof FINANCIAL_KERNEL_V2_VERSION;
  commandId: string;
  state: GameStateV2;
  taxEvidence: MonthlyTaxEvidence;
  marketStep: SupportedMarketSimulationResult;
  taxableLiquidationCostRatePpm: RatePpm;
  insuranceClaim?: MonthlyInsuranceClaimV2;
  resolvedCashFlows?: readonly ResolvedCashFlowV2[];
  /** False only when replaying a command accepted before this sub-policy. */
  serviceRevolvingCredit?: boolean;
  validationOptions?: GameStateV2ValidationOptions;
}>;

export type FinancialShortfallV2 = Readonly<{
  requiredCashCents: MoneyCents;
  residualShortfallCents: MoneyCents;
  fundingPlan: V2ObligationFundingPlan;
  netWorthCents: MoneyCents;
  automaticLiquidityCents: MoneyCents;
}>;

export type FinancialMonthRecordV2 = Readonly<{
  version: typeof FINANCIAL_KERNEL_V2_VERSION;
  commandId: string;
  processedMonth: SimulationMonth;
  nextMonth: SimulationMonth;
  openingNetWorthCents: MoneyCents;
  closingNetWorthCents: MoneyCents;
  openingAutomaticLiquidityCents: MoneyCents;
  closingAutomaticLiquidityCents: MoneyCents;
  taxTraceId: string;
  grossIncomeCents: MoneyCents;
  totalTaxCents: MoneyCents;
  afterTaxCashIncomeCents: MoneyCents;
  taxBreakdown?: MonthlyTaxEvidence["breakdown"];
  resolvedIncomeCents: MoneyCents;
  resolvedExpenseCents: MoneyCents;
  market: SupportedMarketMonth;
  marketValueChangeCents: MoneyCents;
  annualInflationIncreaseCents: MoneyCents;
  monthlyObligationInflationIncreaseCents: MoneyCents;
  cumulativePriceIndexPpm: number;
  insurancePlayerCostCents: MoneyCents;
  baseNonDebtObligationsCents: MoneyCents;
  nonDebtObligationsPaidCents: MoneyCents;
  debtService: MonthlyDebtServicePlan | LegacyMonthlyDebtServicePlan;
  requiredCashCents: MoneyCents;
  fundingPlan: V2ObligationFundingPlan;
  funding: V2FundingRecord | null;
  recurringAllocations: RecurringAllocationPlan | null;
  shortfall: FinancialShortfallV2 | null;
}>;

export function calculateMonthlyCashFlowDeficitV2(
  record: Pick<
    FinancialMonthRecordV2,
    "afterTaxCashIncomeCents" | "resolvedIncomeCents" | "requiredCashCents"
  >,
): MoneyCents | null {
  const availableIncome =
    BigInt(record.afterTaxCashIncomeCents) + BigInt(record.resolvedIncomeCents);
  const deficit = BigInt(record.requiredCashCents) - availableIncome;
  return deficit > BigInt(0)
    ? moneyCents(
        safeBigIntToNumber(deficit, "monthly cash-flow deficit"),
      )
    : null;
}

export type FinancialClosingStateV2 = Readonly<
  Omit<GameStateV2, "revision" | "acceptedCommandIds" | "outcome"> & {
    closingStateKind: typeof FINANCIAL_CLOSING_STATE_V2_KIND;
  }
>;

export type FinancialMonthResultV2 = Readonly<{
  version: typeof FINANCIAL_KERNEL_V2_VERSION;
  processedMonth: SimulationMonth;
  nextMonth: SimulationMonth;
  state: FinancialClosingStateV2;
  record: FinancialMonthRecordV2;
  shortfall: FinancialShortfallV2 | null;
}>;

export class FinancialKernelV2Error extends Error {
  readonly code:
    | "INVALID_INPUT"
    | "INVALID_MARKET_STEP"
    | "INVALID_RESOLVED_CASH_FLOW";

  constructor(code: FinancialKernelV2Error["code"], message: string) {
    super(message);
    this.name = "FinancialKernelV2Error";
    this.code = code;
  }
}

const COMMAND_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,95}$/;
const FLOW_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/;
const SOURCE_SYSTEM = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/;
const ZERO = moneyCents(0);
const FNV_1A_64_OFFSET = BigInt("0xcbf29ce484222325");
const FNV_1A_64_ALT_OFFSET = BigInt("0x84222325cbf29ce4");
const FNV_1A_64_PRIME = BigInt("0x100000001b3");
const UINT64_MASK = BigInt("0xffffffffffffffff");

function fnv1a64(value: string, offset: bigint): string {
  let hash = offset;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * FNV_1A_64_PRIME) & UINT64_MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

function resolvedFlowTransactionId(commandId: string, flowId: string): string {
  const payload = `v1:c${commandId.length}:${commandId}f${flowId.length}:${flowId}`;
  const digest =
    fnv1a64(payload, FNV_1A_64_OFFSET) +
    fnv1a64(payload, FNV_1A_64_ALT_OFFSET);
  return `txn.flow.${digest}`;
}

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

function assertInput(input: FinancialMonthInputV2): void {
  if (
    input.version !== FINANCIAL_KERNEL_V2_VERSION ||
    !COMMAND_ID.test(input.commandId) ||
    !Number.isSafeInteger(input.taxableLiquidationCostRatePpm) ||
    input.taxableLiquidationCostRatePpm < 0 ||
    input.taxableLiquidationCostRatePpm > 1_000_000
  ) {
    throw new FinancialKernelV2Error(
      "INVALID_INPUT",
      "invalid financial kernel version, command id, or liquidation rate",
    );
  }
  const stateViolations = validateGameStateV2(input.state, input.validationOptions);
  if (stateViolations.length > 0) {
    throw new FinancialKernelV2Error(
      "INVALID_INPUT",
      `invalid opening state: ${stateViolations[0]!.path}`,
    );
  }
  assertMarketStep(input.state, input.marketStep);
  assertResolvedCashFlows(input.resolvedCashFlows ?? []);
}

function assertMarketStep(
  state: GameStateV2,
  marketStep: SupportedMarketSimulationResult,
): void {
  const commonRates = [
    marketStep.month.equityReturnPpm,
    marketStep.month.bondReturnPpm,
    marketStep.month.cashReturnPpm,
    marketStep.month.housingReturnPpm,
    marketStep.month.inflationPpm,
  ];
  const rates =
    marketStep.month.modelVersion === MACRO_MARKET_MODEL_V2_VERSION
      ? [
          ...commonRates,
          marketStep.month.broadIndexReturnPpm,
          marketStep.month.sectorReturnPpm,
          marketStep.month.speculativeReturnPpm,
          marketStep.month.borrowingRatePpm,
          marketStep.month.laborDemandChangePpm,
          marketStep.month.volatilityPpm,
        ]
      : commonRates;
  if (
    marketStep.nextState.modelVersion !== marketStep.month.modelVersion ||
    marketStep.month.regime !== state.marketRegime ||
    marketStep.month.nextRegime !== marketStep.nextState.regime ||
    marketStep.nextState.monthsInRegime !==
      (marketStep.month.nextRegime === marketStep.month.regime
        ? state.gameplay.market.monthsInRegime + 1
        : 0) ||
    rates.some(
      (rate) =>
        !Number.isSafeInteger(rate) || rate < -1_000_000 || rate > 1_000_000,
    )
  ) {
    throw new FinancialKernelV2Error(
      "INVALID_MARKET_STEP",
      "market step is inconsistent with the opening model, regime, or next state",
    );
  }
  if (marketStep.month.modelVersion === MARKET_MODEL_VERSION) {
    if (state.gameplay.market.modelVersion !== MARKET_MODEL_VERSION) {
      throw new FinancialKernelV2Error(
        "INVALID_MARKET_STEP",
        "regime-v1 cannot replace an accepted regime-v2 lifecycle",
      );
    }
    return;
  }
  try {
    validateMacroMarketMonthV2(marketStep.month);
  } catch {
    throw new FinancialKernelV2Error(
      "INVALID_MARKET_STEP",
      "regime-v2 market evidence is outside its accepted calibration",
    );
  }
  if (
    marketStep.month.modelVersion !== MACRO_MARKET_MODEL_V2_VERSION ||
    marketStep.nextState.modelVersion !== MACRO_MARKET_MODEL_V2_VERSION ||
    marketStep.month.calibrationVersion !==
      MACRO_MARKET_CALIBRATION_V2_VERSION ||
    marketStep.nextState.calibrationVersion !==
      marketStep.month.calibrationVersion ||
    marketStep.nextState.difficulty !== marketStep.month.difficulty ||
    marketStep.month.equityReturnPpm !==
      marketStep.month.broadIndexReturnPpm ||
    marketStep.month.borrowingRatePpm < 0 ||
    marketStep.month.volatilityPpm < 0 ||
    (state.gameplay.market.modelVersion === MACRO_MARKET_MODEL_V2_VERSION &&
      (state.gameplay.market.calibrationVersion !==
        marketStep.month.calibrationVersion ||
        state.gameplay.market.macroDifficulty !== marketStep.month.difficulty))
  ) {
    throw new FinancialKernelV2Error(
      "INVALID_MARKET_STEP",
      "regime-v2 market evidence does not match the accepted lifecycle",
    );
  }
}

function assertResolvedCashFlows(flows: readonly ResolvedCashFlowV2[]): void {
  const ids = new Set<string>();
  for (const flow of flows) {
    if (
      !FLOW_ID.test(flow.id) ||
      !SOURCE_SYSTEM.test(flow.sourceSystem) ||
      ![
        "other_income",
        "recurring_expense",
        "temporary_income",
        "temporary_expense",
      ].includes(flow.kind) ||
      !Number.isSafeInteger(flow.amountCents) ||
      flow.amountCents < 0 ||
      ids.has(flow.id)
    ) {
      throw new FinancialKernelV2Error(
        "INVALID_RESOLVED_CASH_FLOW",
        "resolved cash flows require unique safe ids, valid kinds, sources, and non-negative cents",
      );
    }
    ids.add(flow.id);
  }
}

function signedChange(balance: MoneyCents, rate: RatePpm): MoneyCents {
  return multiplyMoneyByRate(balance, rate);
}

function addSigned(balance: MoneyCents, change: MoneyCents): MoneyCents {
  return change >= 0
    ? addMoney(balance, change)
    : subtractMoney(balance, negateMoney(change));
}

function applySuppliedMarketMonth(
  state: GameStateV2,
  commandId: string,
  simulation: SupportedMarketSimulationResult,
  validationOptions: GameStateV2ValidationOptions,
): Readonly<{
  state: GameStateV2;
  month: SupportedMarketMonth;
  marketValueChangeCents: MoneyCents;
  cumulativePriceIndexPpm: number;
}> {
  const month: SupportedMarketMonth =
    simulation.month.modelVersion === MACRO_MARKET_MODEL_V2_VERSION
      ? Object.freeze({
          ...simulation.month,
          appliedReturnModifiersPpm: Object.freeze({
            ...simulation.month.appliedReturnModifiersPpm,
          }),
          shocks: Object.freeze({ ...simulation.month.shocks }),
        })
      : Object.freeze({
          ...simulation.month,
          appliedReturnModifiersPpm: Object.freeze({
            ...simulation.month.appliedReturnModifiersPpm,
          }),
          shocks: Object.freeze({ ...simulation.month.shocks }),
        });
  const portfolio = state.gameplay.portfolio;
  const broadReturnPpm = month.equityReturnPpm;
  const sectorReturnPpm =
    month.modelVersion === MACRO_MARKET_MODEL_V2_VERSION
      ? month.sectorReturnPpm
      : broadReturnPpm;
  const speculativeReturnPpm =
    month.modelVersion === MACRO_MARKET_MODEL_V2_VERSION
      ? month.speculativeReturnPpm
      : broadReturnPpm;
  const portfolioChanges: Record<keyof PortfolioBreakdown, MoneyCents> = {
    taxableBroadIndexCents: signedChange(
      portfolio.taxableBroadIndexCents,
      broadReturnPpm,
    ),
    taxableSectorCents: signedChange(
      portfolio.taxableSectorCents,
      sectorReturnPpm,
    ),
    taxableSpeculativeCents: signedChange(
      portfolio.taxableSpeculativeCents,
      speculativeReturnPpm,
    ),
    taxableLegacyUnclassifiedCents: signedChange(
      portfolio.taxableLegacyUnclassifiedCents,
      broadReturnPpm,
    ),
    retirement401kCents: signedChange(
      portfolio.retirement401kCents,
      broadReturnPpm,
    ),
    retirementIraCents: signedChange(
      portfolio.retirementIraCents,
      broadReturnPpm,
    ),
    retirementLegacyUnclassifiedCents: signedChange(
      portfolio.retirementLegacyUnclassifiedCents,
      broadReturnPpm,
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
    "financial kernel taxable market change",
  );
  const retirementChange = sumMoney(
    [
      portfolioChanges.retirement401kCents,
      portfolioChanges.retirementIraCents,
      portfolioChanges.retirementLegacyUnclassifiedCents,
    ],
    "financial kernel retirement market change",
  );
  const otherInvestableChange = sumMoney(
    [
      portfolioChanges.hsaCents,
      portfolioChanges.otherInvestableLegacyUnclassifiedCents,
    ],
    "financial kernel other-investable market change",
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
    "financial kernel total market change",
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
  const ledger =
    postings.length === 0
      ? state.ledger
      : appendTransaction(state.ledger, {
          id: `txn.${commandId}.market`,
          commandId,
          effectiveMonth: state.currentMonth,
          reasonCode: "monthly_market_revaluation_v2",
          description: "Apply supplied deterministic market returns",
          sourceSystem: "financial_kernel_v2",
          category: "asset.market_revaluation",
          causalReference: { kind: "command", id: commandId },
          postings,
        });
  const nextPortfolio = Object.fromEntries(
    Object.entries(portfolio).map(([key, balance]) => [
      key,
      addSigned(balance, portfolioChanges[key as keyof PortfolioBreakdown]),
    ]),
  ) as unknown as PortfolioBreakdown;
  const cumulativePriceIndexPpm = advanceCumulativePriceIndexV2(
    currentCumulativePriceIndexPpmV2(state),
    month.inflationPpm,
  );
  return Object.freeze({
    state: finalizeGameStateV2({
      ...state,
      ledger,
      finances: reconcileFinancesWithLedger(state.finances, ledger),
      random: { ...simulation.nextState.random },
      marketRegime: simulation.nextState.regime,
      gameplay: {
        ...state.gameplay,
        portfolio: nextPortfolio,
        market:
          month.modelVersion === MACRO_MARKET_MODEL_V2_VERSION
            ? {
                modelVersion: MACRO_MARKET_MODEL_V2_VERSION,
                monthsInRegime: simulation.nextState.monthsInRegime,
                cumulativePriceIndexPpm,
                calibrationVersion: month.calibrationVersion,
                macroDifficulty: month.difficulty,
                observedRegime: month.regime,
                observedMonth: state.currentMonth,
                borrowingRatePpm: month.borrowingRatePpm,
                laborDemandChangePpm: month.laborDemandChangePpm,
                volatilityPpm: month.volatilityPpm,
                lastInflationPpm: month.inflationPpm,
                broadMarketReturnPpm: month.broadIndexReturnPpm,
                sectorMarketReturnPpm: month.sectorReturnPpm,
                speculativeMarketReturnPpm: month.speculativeReturnPpm,
                housingReturnPpm: month.housingReturnPpm,
                cashYieldPpm: month.cashReturnPpm,
              }
            : {
                modelVersion: MARKET_MODEL_VERSION,
                monthsInRegime: simulation.nextState.monthsInRegime,
                cumulativePriceIndexPpm,
              },
      },
    }, validationOptions),
    month,
    marketValueChangeCents,
    cumulativePriceIndexPpm,
  });
}

function applyInsuranceClaim(
  state: GameStateV2,
  claim: MonthlyInsuranceClaimV2 | undefined,
  validationOptions: GameStateV2ValidationOptions,
): Readonly<{ state: GameStateV2; playerCostCents: MoneyCents }> {
  if (!claim) return Object.freeze({ state, playerCostCents: ZERO });
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
    }, validationOptions),
    playerCostCents: settlement.playerResponsibilityCents,
  });
}

function isIncome(flow: ResolvedCashFlowV2): boolean {
  return flow.kind === "other_income" || flow.kind === "temporary_income";
}

function applyResolvedIncome(
  state: GameStateV2,
  commandId: string,
  flows: readonly ResolvedCashFlowV2[],
  validationOptions: GameStateV2ValidationOptions,
): GameStateV2 {
  let working = state;
  for (const flow of flows) {
    if (!isIncome(flow) || flow.amountCents === 0) continue;
    const ledger = appendTransaction(working.ledger, {
      id: resolvedFlowTransactionId(commandId, flow.id),
      commandId,
      effectiveMonth: state.currentMonth,
      reasonCode: "monthly_resolved_income_v2",
      description: `Apply resolved income ${flow.id}`,
      sourceSystem: flow.sourceSystem,
      category: "income.resolved_cash_flow",
      causalReference: { kind: "system", id: flow.id },
      postings: [
        debit("asset.cash", flow.amountCents),
        credit("income.other", flow.amountCents),
      ],
    });
    working = finalizeGameStateV2({
      ...working,
      ledger,
      finances: reconcileFinancesWithLedger(working.finances, ledger),
    }, validationOptions);
  }
  return working;
}

function payResolvedExpenses(
  state: GameStateV2,
  commandId: string,
  flows: readonly ResolvedCashFlowV2[],
  validationOptions: GameStateV2ValidationOptions,
): GameStateV2 {
  let working = state;
  for (const flow of flows) {
    if (isIncome(flow) || flow.amountCents === 0) continue;
    if (flow.amountCents > working.finances.cashCents) {
      throw new FinancialKernelV2Error(
        "INVALID_INPUT",
        "resolved expenses were not fully funded",
      );
    }
    const ledger = appendTransaction(working.ledger, {
      id: resolvedFlowTransactionId(commandId, flow.id),
      commandId,
      effectiveMonth: state.currentMonth,
      reasonCode: "monthly_resolved_expense_v2",
      description: `Pay resolved expense ${flow.id}`,
      sourceSystem: flow.sourceSystem,
      category: "expense.resolved_cash_flow",
      causalReference: { kind: "system", id: flow.id },
      postings: [
        debit("expense.living", flow.amountCents),
        credit("asset.cash", flow.amountCents),
      ],
    });
    working = finalizeGameStateV2({
      ...working,
      ledger,
      finances: reconcileFinancesWithLedger(working.finances, ledger),
    }, validationOptions);
  }
  return working;
}

function payNonDebtObligations(
  state: GameStateV2,
  commandId: string,
  amountCents: MoneyCents,
  validationOptions: GameStateV2ValidationOptions,
): GameStateV2 {
  if (amountCents === 0) return state;
  if (amountCents > state.finances.cashCents) {
    throw new FinancialKernelV2Error(
      "INVALID_INPUT",
      "non-debt obligations were not fully funded",
    );
  }
  const ledger = appendTransaction(state.ledger, {
    id: `txn.${commandId}.non-debt-obligations`,
    commandId,
    effectiveMonth: state.currentMonth,
    reasonCode: "monthly_non_debt_obligations_v2",
    description: "Pay living, benefit, insurance, and claim obligations",
    sourceSystem: "financial_kernel_v2",
    category: "expense.non_debt_obligations",
    causalReference: { kind: "command", id: commandId },
    postings: [
      debit("expense.living", amountCents),
      credit("asset.cash", amountCents),
    ],
  });
  return finalizeGameStateV2({
    ...state,
    ledger,
    finances: reconcileFinancesWithLedger(state.finances, ledger),
  }, validationOptions);
}

function applyAfterTaxPlan(
  state: GameStateV2,
  commandId: string,
  plan: RecurringAllocationPlan,
  validationOptions: GameStateV2ValidationOptions,
): GameStateV2 {
  const taxable = sumMoney(
    [
      plan.afterTax.broadIndexCents,
      plan.afterTax.sectorCents,
      plan.afterTax.speculativeCents,
    ],
    "financial kernel recurring taxable allocation",
  );
  const extraDebt = sumMoney(
    plan.afterTax.extraDebtPayments.map(({ amountCents }) => amountCents),
    "financial kernel recurring extra debt",
  );
  const total = sumMoney(
    [taxable, plan.afterTax.iraCents, extraDebt],
    "financial kernel recurring cash allocation",
  );
  if (total === 0) return state;
  if (total > state.finances.cashCents) {
    throw new FinancialKernelV2Error(
      "INVALID_INPUT",
      "recurring allocations exceed funded cash",
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
    description: "Apply recurring investments, IRA, and optional extra debt",
    sourceSystem: "financial_kernel_v2",
    category: "allocation.after_tax_strategy",
    causalReference: { kind: "command", id: commandId },
    postings,
  });
  const paymentByDebt = new Map(
    plan.afterTax.extraDebtPayments.map(({ debtId, amountCents }) => [
      debtId,
      amountCents,
    ]),
  );
  const oldMinimum = calculateStoredMinimumDebtObligationV2(
    state.gameplay.debts.termDebts,
  );
  const termDebts = state.gameplay.debts.termDebts.map((debt) => {
    const payment = paymentByDebt.get(debt.id) ?? ZERO;
    return payment === 0 ? debt : applyDebtPaymentV2(debt, ZERO, payment).debt;
  });
  const nextMinimum = calculateStoredMinimumDebtObligationV2(termDebts);
  const finances = reconcileFinancesWithLedger(state.finances, ledger);
  return finalizeGameStateV2({
    ...state,
    ledger,
    finances: {
      ...finances,
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
  }, validationOptions);
}

function closeFinancialMonthState(
  state: GameStateV2,
  nextMonth: SimulationMonth,
): FinancialClosingStateV2 {
  // Advancing the month can make non-financial career/event evidence due.
  // Omit authoritative transition metadata so this evidence cannot be
  // mistaken for a persistable GameStateV2 before wrapper orchestration.
  return Object.freeze({
    closingStateKind: FINANCIAL_CLOSING_STATE_V2_KIND,
    schemaVersion: state.schemaVersion,
    engineVersion: state.engineVersion,
    runId: state.runId,
    startMonth: state.startMonth,
    currentMonth: nextMonth,
    player: state.player,
    finances: state.finances,
    wellbeing: state.wellbeing,
    marketRegime: state.marketRegime,
    random: state.random,
    ledger: state.ledger,
    gameplay: state.gameplay,
    migration: state.migration,
  });
}

export function simulateFinancialMonthV2(
  input: FinancialMonthInputV2,
): FinancialMonthResultV2 {
  assertInput(input);
  const validationOptions = input.validationOptions ?? {};
  const flows = input.resolvedCashFlows ?? [];
  const processedMonth = input.state.currentMonth;
  const nextMonth = addMonths(processedMonth, 1);
  const openingNetWorthCents = calculateNetWorth(input.state.finances);
  const openingAutomaticLiquidityCents = assessV2Liquidity(
    input.state,
    ZERO,
    input.taxableLiquidationCostRatePpm,
  ).totalAutomaticLiquidityCents;

  const ownedOpeningState = ownForDeepFreeze(input.state);
  let working = finalizeGameStateV2(
    resetAnnualFinancialAccumulatorsV2(ownedOpeningState),
    validationOptions,
  );
  const claim = applyInsuranceClaim(
    working,
    input.insuranceClaim,
    validationOptions,
  );
  working = claim.state;
  const market = applySuppliedMarketMonth(
    working,
    input.commandId,
    input.marketStep,
    validationOptions,
  );
  working = market.state;
  const inflation = calculateMonthlyLivingCostInflationV2(
    working.finances.annualLivingCostCents,
    input.marketStep.month.inflationPpm,
  );
  working = finalizeGameStateV2({
    ...working,
    finances: {
      ...working.finances,
      annualLivingCostCents: addMoney(
        working.finances.annualLivingCostCents,
        inflation.annualIncreaseCents,
      ),
      requiredObligationsCents: addMoney(
        working.finances.requiredObligationsCents,
        inflation.monthlyObligationIncreaseCents,
      ),
    },
  }, validationOptions);
  const payroll = applyMonthlyPayroll(
    working,
    input.commandId,
    input.taxEvidence,
    validationOptions,
  );
  working = applyResolvedIncome(
    payroll.state,
    input.commandId,
    flows,
    validationOptions,
  );
  const resolvedIncomeCents = sumMoney(
    flows.filter(isIncome).map(({ amountCents }) => amountCents),
    "financial kernel resolved income",
  );
  const resolvedExpenseCents = sumMoney(
    flows.filter((flow) => !isIncome(flow)).map(({ amountCents }) => amountCents),
    "financial kernel resolved expense",
  );
  const serviceRevolvingCredit = input.serviceRevolvingCredit !== false;
  const debtService = serviceRevolvingCredit
    ? planMonthlyDebtService(working)
    : planLegacyMonthlyDebtService(working);
  const baseNonDebtObligationsCents = subtractMoney(
    working.finances.requiredObligationsCents,
    calculateStoredMinimumDebtObligationV2(
      working.gameplay.debts.termDebts,
    ),
  );
  const nonDebtObligations = sumMoney(
    [baseNonDebtObligationsCents, claim.playerCostCents],
    "financial kernel base non-debt obligations",
  );
  const requiredCashCents = sumMoney(
    [
      nonDebtObligations,
      resolvedExpenseCents,
      debtService.totalScheduledPaymentCents,
    ],
    "financial kernel required cash",
  );
  const fundingPlan = planV2ObligationFunding(
    working,
    requiredCashCents,
    input.taxableLiquidationCostRatePpm,
  );
  if (fundingPlan.residualShortfallCents > 0) {
    const automaticLiquidityCents = sumMoney(
      [
        fundingPlan.cashAvailableCents,
        fundingPlan.netLiquidationProceedsCents,
        fundingPlan.remainingCreditCents,
      ],
      "financial kernel shortfall automatic liquidity",
    );
    const state = closeFinancialMonthState(working, nextMonth);
    const closingNetWorthCents = calculateNetWorth(state.finances);
    const shortfall = Object.freeze({
      requiredCashCents,
      residualShortfallCents: fundingPlan.residualShortfallCents,
      fundingPlan,
      netWorthCents: closingNetWorthCents,
      automaticLiquidityCents,
    }) satisfies FinancialShortfallV2;
    const record = Object.freeze({
      version: FINANCIAL_KERNEL_V2_VERSION,
      commandId: input.commandId,
      processedMonth,
      nextMonth,
      openingNetWorthCents,
      closingNetWorthCents,
      openingAutomaticLiquidityCents,
      closingAutomaticLiquidityCents: automaticLiquidityCents,
      taxTraceId: input.taxEvidence.traceId,
      grossIncomeCents: input.taxEvidence.grossIncomeCents,
      totalTaxCents: moneyCents(input.taxEvidence.totalTaxCents),
      afterTaxCashIncomeCents: input.taxEvidence.afterTaxCashIncomeCents,
      ...(input.taxEvidence.breakdown === undefined
        ? {}
        : { taxBreakdown: input.taxEvidence.breakdown }),
      resolvedIncomeCents,
      resolvedExpenseCents,
      market: market.month,
      marketValueChangeCents: market.marketValueChangeCents,
      annualInflationIncreaseCents: inflation.annualIncreaseCents,
      monthlyObligationInflationIncreaseCents:
        inflation.monthlyObligationIncreaseCents,
      cumulativePriceIndexPpm: market.cumulativePriceIndexPpm,
      insurancePlayerCostCents: claim.playerCostCents,
      baseNonDebtObligationsCents,
      nonDebtObligationsPaidCents: ZERO,
      debtService,
      requiredCashCents,
      fundingPlan,
      funding: null,
      recurringAllocations: null,
      shortfall,
    }) satisfies FinancialMonthRecordV2;
    return Object.freeze({
      version: FINANCIAL_KERNEL_V2_VERSION,
      processedMonth,
      nextMonth,
      state,
      record,
      shortfall,
    });
  }
  const funding = executeV2ObligationFunding(
    working,
    input.commandId,
    fundingPlan,
    validationOptions,
  );
  working = payResolvedExpenses(
    funding.state,
    input.commandId,
    flows,
    validationOptions,
  );
  working = payNonDebtObligations(
    working,
    input.commandId,
    nonDebtObligations,
    validationOptions,
  );
  working = serviceRevolvingCredit
    ? settleMonthlyDebtService(
        working,
        input.commandId,
        validationOptions,
        debtService as MonthlyDebtServicePlan,
      ).state
    : settleLegacyMonthlyDebtService(
        working,
        input.commandId,
        validationOptions,
      ).state;
  const postObligationIncomeCents = moneyCents(
    Math.max(
      0,
      input.taxEvidence.afterTaxCashIncomeCents +
        resolvedIncomeCents -
        requiredCashCents,
    ),
  );
  const afterTaxPlan = planRecurringAllocations(
    working,
    input.taxEvidence.grossIncomeCents,
    postObligationIncomeCents,
  );
  const recurringAllocations = Object.freeze({
    ...afterTaxPlan,
    preTax: payroll.allocationPlan.preTax,
  });
  working = applyAfterTaxPlan(
    working,
    input.commandId,
    recurringAllocations,
    validationOptions,
  );
  const closingAutomaticLiquidityCents = assessV2Liquidity(
    working,
    ZERO,
    input.taxableLiquidationCostRatePpm,
  ).totalAutomaticLiquidityCents;
  const state = closeFinancialMonthState(working, nextMonth);
  const closingNetWorthCents = calculateNetWorth(state.finances);
  const record = Object.freeze({
    version: FINANCIAL_KERNEL_V2_VERSION,
    commandId: input.commandId,
    processedMonth,
    nextMonth,
    openingNetWorthCents,
    closingNetWorthCents,
    openingAutomaticLiquidityCents,
    closingAutomaticLiquidityCents,
    taxTraceId: input.taxEvidence.traceId,
    grossIncomeCents: input.taxEvidence.grossIncomeCents,
    totalTaxCents: moneyCents(input.taxEvidence.totalTaxCents),
    afterTaxCashIncomeCents: input.taxEvidence.afterTaxCashIncomeCents,
    ...(input.taxEvidence.breakdown === undefined
      ? {}
      : { taxBreakdown: input.taxEvidence.breakdown }),
    resolvedIncomeCents,
    resolvedExpenseCents,
    market: market.month,
    marketValueChangeCents: market.marketValueChangeCents,
    annualInflationIncreaseCents: inflation.annualIncreaseCents,
    monthlyObligationInflationIncreaseCents:
      inflation.monthlyObligationIncreaseCents,
    cumulativePriceIndexPpm: market.cumulativePriceIndexPpm,
    insurancePlayerCostCents: claim.playerCostCents,
    baseNonDebtObligationsCents,
    nonDebtObligationsPaidCents: nonDebtObligations,
    debtService,
    requiredCashCents,
    fundingPlan,
    funding: funding.record,
    recurringAllocations,
    shortfall: null,
  }) satisfies FinancialMonthRecordV2;
  return Object.freeze({
    version: FINANCIAL_KERNEL_V2_VERSION,
    processedMonth,
    nextMonth,
    state,
    record,
    shortfall: null,
  });
}
