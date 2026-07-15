import { safeBigIntToNumber } from "./domain/integer";
import {
  addMoney,
  allocateMoney,
  moneyCents,
  multiplyMoneyByRate,
  negateMoney,
  subtractMoney,
  type MoneyCents,
  type RatePpm,
} from "./domain/money";
import { addMonths, type SimulationMonth } from "./domain/month";
import { planMonthlyDebtService, settleMonthlyDebtService } from "./debt-service-v2";
import type { FinancialSnapshot, GameState } from "./game-state";
import {
  finalizeGameStateV2,
  type GameStateV2,
  type PortfolioBreakdown,
} from "./game-state-v2";
import {
  adjudicateCoverageClaim,
  adjudicateHealthClaim,
} from "./insurance-v2";
import { appendTransaction, type JournalPosting, type Ledger } from "./ledger";
import {
  marketSimulationState,
  simulateMarketMonth,
  type MarketMonth,
} from "./market";
import {
  assessV2Liquidity,
  prepareV2ObligationCash,
  type V2FundingRecord,
} from "./obligation-funding-v2";
import { evaluateTerminalOutcome } from "./outcomes";
import { applyMonthlyPayroll, type MonthlyTaxEvidence } from "./payroll-v2";
import {
  planRecurringAllocations,
  type RecurringAllocationPlan,
} from "./recurring-strategy-v2";

export type MonthlyInsuranceClaim =
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

export type ProcessMonthV2Command = Readonly<{
  schemaVersion: 2;
  id: string;
  type: "process_month_v2";
  expectedRevision: number;
  effectiveMonth: SimulationMonth;
  payload: Readonly<{
    taxEvidence: MonthlyTaxEvidence;
    taxableLiquidationCostRatePpm: RatePpm;
    insuranceClaim?: MonthlyInsuranceClaim;
  }>;
}>;

export type MonthlyTurnV2Record = Readonly<{
  processedMonth: SimulationMonth;
  nextMonth: SimulationMonth;
  taxTraceId: string;
  market: MarketMonth;
  marketValueChangeCents: MoneyCents;
  annualInflationIncreaseCents: MoneyCents;
  insurancePlayerCostCents: MoneyCents;
  nonDebtObligationsPaidCents: MoneyCents;
  debtService: ReturnType<typeof planMonthlyDebtService>;
  funding: V2FundingRecord | null;
  recurringAllocations: RecurringAllocationPlan | null;
  outcome: GameStateV2["outcome"];
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
    | "INVALID_LIQUIDATION_RATE"
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
    const principal = subtractMoney(debt.principalCents, payment);
    return {
      ...debt,
      principalCents: principal,
      minimumPaymentCents:
        principal === 0
          ? ZERO
          : moneyCents(Math.min(debt.minimumPaymentCents, principal)),
      remainingTermMonths: principal === 0 ? 0 : debt.remainingTermMonths,
    };
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

export function processMonthlyTurnV2(
  state: GameStateV2,
  command: ProcessMonthV2Command,
): MonthlyTurnV2Result {
  validateCommand(state, command);
  try {
    const claim = applyInsuranceClaim(state, command.payload.insuranceClaim);
    const market = applyMarketMonthV2(claim.state, command.id);
    const annualInflationIncreaseCents = multiplyMoneyByRate(
      market.state.finances.annualLivingCostCents,
      market.month.inflationPpm,
    );
    const monthlyInflationIncreaseCents = allocateMoney(
      annualInflationIncreaseCents,
      1,
      12,
    );
    let working = finalizeGameStateV2({
      ...market.state,
      finances: {
        ...market.state.finances,
        annualLivingCostCents: addMoney(
          market.state.finances.annualLivingCostCents,
          annualInflationIncreaseCents,
        ),
        requiredObligationsCents: addMoney(
          market.state.finances.requiredObligationsCents,
          monthlyInflationIncreaseCents,
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
      const nextState = finalizeGameStateV2({
        ...working,
        currentMonth: nextMonth,
        revision: state.revision + 1,
        acceptedCommandIds: [...state.acceptedCommandIds, command.id],
        outcome,
      });
      return Object.freeze({
        state: nextState,
        record: Object.freeze({
          processedMonth: state.currentMonth,
          nextMonth,
          taxTraceId: command.payload.taxEvidence.traceId,
          market: market.month,
          marketValueChangeCents: market.marketValueChangeCents,
          annualInflationIncreaseCents,
          insurancePlayerCostCents: claim.playerCostCents,
          nonDebtObligationsPaidCents: ZERO,
          debtService: debtPlan,
          funding: null,
          recurringAllocations: null,
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
    const beforeOutcome = finalizeGameStateV2({
      ...working,
      currentMonth: nextMonth,
      revision: state.revision + 1,
      acceptedCommandIds: [...state.acceptedCommandIds, command.id],
    });
    const outcomeProjection: GameState = {
      ...beforeOutcome,
      schemaVersion: 1,
      engineVersion: "4.0.0",
    };
    const outcome = evaluateTerminalOutcome(
      outcomeProjection,
      command.payload.taxableLiquidationCostRatePpm,
    );
    const nextState = finalizeGameStateV2({ ...beforeOutcome, outcome });
    return Object.freeze({
      state: nextState,
      record: Object.freeze({
        processedMonth: state.currentMonth,
        nextMonth,
        taxTraceId: command.payload.taxEvidence.traceId,
        market: market.month,
        marketValueChangeCents: market.marketValueChangeCents,
        annualInflationIncreaseCents,
        insurancePlayerCostCents: claim.playerCostCents,
        nonDebtObligationsPaidCents: nonDebtObligations,
        debtService: debtPlan,
        funding: funding.funding,
        recurringAllocations,
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
