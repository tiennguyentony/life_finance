/**
 * Frozen schema-v1 replay/test compatibility. New Web months dispatch through
 * processMonthlyTurnV2 and the 2.0.0 financial kernel.
 */
import { getEventTemplate } from "../data/event-templates";
import { safeBigIntToNumber } from "./domain/integer";
import {
  addMoney,
  moneyCents,
  multiplyMoneyByRate,
  negateMoney,
  ratePpm,
  type MoneyCents,
  type RatePpm,
} from "./domain/money";
import { addMonths, type SimulationMonth } from "./domain/month";
import {
  applyEvent,
  type EventProposal,
  type MarketAssetClass,
  type ResolvedEvent,
} from "./events";
import {
  finalizeGameState,
  hasReachedFinancialIndependence,
  reconcileFinancesWithLedger,
  type FinancialSnapshot,
  type GameOutcome,
  type GameState,
} from "./game-state";
import {
  appendTransaction,
  type JournalPosting,
  type Ledger,
} from "./ledger";
import {
  marketSimulationState,
  simulateMarketMonth,
  type MarketMonth,
} from "./market";
import {
  assessRequiredObligationLiquidity,
  evaluateTerminalOutcome,
  fundRequiredObligations,
  type ObligationFunding,
} from "./outcomes";

export type ScheduledEvent = Readonly<{
  proposal: EventProposal;
  choiceId?: string;
}>;

export type MonthlyTurnInput = Readonly<{
  employmentIncomeCents: MoneyCents;
  taxableLiquidationCostRatePpm: RatePpm;
  event?: ScheduledEvent;
}>;

export type MonthlyTurnRecord = Readonly<{
  processedMonth: SimulationMonth;
  nextMonth: SimulationMonth;
  market: MarketMonth;
  event: ResolvedEvent | null;
  employmentIncomeCents: MoneyCents;
  marketValueChangeCents: MoneyCents;
  inflationIncreaseCents: MoneyCents;
  obligationsDueCents: MoneyCents;
  obligationFunding: Omit<ObligationFunding, "ledger" | "finances"> | null;
  outcome: GameOutcome | null;
}>;

export type MonthlyTurnResult = Readonly<{
  state: GameState;
  record: MonthlyTurnRecord;
}>;

export class MonthlyTurnError extends Error {
  readonly code:
    | "INVALID_COMMAND_ID"
    | "DUPLICATE_COMMAND"
    | "INVALID_INCOME"
    | "INVALID_LIQUIDATION_RATE"
    | "RUN_TERMINAL";

  constructor(code: MonthlyTurnError["code"], message: string) {
    super(message);
    this.name = "MonthlyTurnError";
    this.code = code;
  }
}

const COMMAND_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,95}$/;
const ZERO_MODIFIERS: Readonly<Record<MarketAssetClass, RatePpm>> = Object.freeze({
  equity: ratePpm(0),
  bonds: ratePpm(0),
  cash: ratePpm(0),
  housing: ratePpm(0),
});

function debit(accountId: string, amountCents: MoneyCents): JournalPosting {
  return { accountId, debitCents: amountCents, creditCents: moneyCents(0) };
}

function credit(accountId: string, amountCents: MoneyCents): JournalPosting {
  return { accountId, debitCents: moneyCents(0), creditCents: amountCents };
}

function effectiveReturn(base: RatePpm, modifier: RatePpm): RatePpm {
  return ratePpm(Math.max(-500_000, Math.min(500_000, base + modifier)));
}

function revalueAssets(
  state: GameState,
  commandId: string,
  market: MarketMonth,
  modifiers: Readonly<Record<MarketAssetClass, RatePpm>>,
): Readonly<{
  ledger: Ledger;
  finances: FinancialSnapshot;
  marketValueChangeCents: MoneyCents;
}> {
  const changes: readonly Readonly<{
    accountId: string;
    amountCents: MoneyCents;
  }>[] = [
    {
      accountId: "asset.cash",
      amountCents: multiplyMoneyByRate(
        state.finances.cashCents,
        effectiveReturn(market.cashReturnPpm, modifiers.cash),
      ),
    },
    {
      accountId: "asset.taxable_investments",
      amountCents: multiplyMoneyByRate(
        state.finances.taxableInvestmentsCents,
        effectiveReturn(market.equityReturnPpm, modifiers.equity),
      ),
    },
    {
      accountId: "asset.retirement",
      amountCents: multiplyMoneyByRate(
        state.finances.retirementCents,
        effectiveReturn(market.equityReturnPpm, modifiers.equity),
      ),
    },
    {
      accountId: "asset.home",
      amountCents: multiplyMoneyByRate(
        state.finances.homeValueCents,
        effectiveReturn(market.housingReturnPpm, modifiers.housing),
      ),
    },
    {
      accountId: "asset.other_investable",
      amountCents: multiplyMoneyByRate(
        state.finances.otherInvestableAssetsCents,
        effectiveReturn(market.bondReturnPpm, modifiers.bonds),
      ),
    },
  ];
  const totalChange = moneyCents(
    safeBigIntToNumber(
      changes.reduce((total, change) => total + BigInt(change.amountCents), BigInt(0)),
      "monthly market value change",
    ),
  );
  const postings: JournalPosting[] = [];
  for (const change of changes) {
    if (change.amountCents > 0) postings.push(debit(change.accountId, change.amountCents));
    if (change.amountCents < 0) {
      postings.push(credit(change.accountId, negateMoney(change.amountCents)));
    }
  }
  if (totalChange > 0) postings.push(credit("equity.adjustment", totalChange));
  if (totalChange < 0) postings.push(debit("equity.adjustment", negateMoney(totalChange)));
  if (postings.length === 0) {
    return Object.freeze({
      ledger: state.ledger,
      finances: state.finances,
      marketValueChangeCents: totalChange,
    });
  }

  const ledger = appendTransaction(state.ledger, {
    id: `txn.${commandId}.market`,
    commandId,
    effectiveMonth: state.currentMonth,
    reasonCode: "monthly_market_revaluation",
    description: "Apply deterministic monthly market returns to asset balances",
    sourceSystem: "monthly_turn",
    category: "asset.market_revaluation",
    causalReference: {
      kind: "command",
      id: commandId,
    },
    postings,
  });
  return Object.freeze({
    ledger,
    finances: reconcileFinancesWithLedger(state.finances, ledger),
    marketValueChangeCents: totalChange,
  });
}

function postEmploymentIncome(
  state: GameState,
  commandId: string,
  incomeCents: MoneyCents,
): Pick<GameState, "ledger" | "finances"> {
  if (incomeCents === 0) return { ledger: state.ledger, finances: state.finances };
  const ledger = appendTransaction(state.ledger, {
    id: `txn.${commandId}.income`,
    commandId,
    effectiveMonth: state.currentMonth,
    reasonCode: "monthly_employment_income",
    description: "Receive after-tax employment income for the month",
    sourceSystem: "monthly_turn",
    category: "income.employment",
    causalReference: {
      kind: "command",
      id: commandId,
    },
    postings: [debit("asset.cash", incomeCents), credit("income.employment", incomeCents)],
  });
  return {
    ledger,
    finances: reconcileFinancesWithLedger(state.finances, ledger),
  };
}

function withChanges(state: GameState, changes: Partial<GameState>): GameState {
  return { ...state, ...changes };
}

export function processMonthlyTurn(
  state: GameState,
  commandId: string,
  input: MonthlyTurnInput,
): MonthlyTurnResult {
  if (state.outcome) {
    throw new MonthlyTurnError("RUN_TERMINAL", "terminal runs reject monthly turns");
  }
  if (!COMMAND_ID_PATTERN.test(commandId)) {
    throw new MonthlyTurnError(
      "INVALID_COMMAND_ID",
      "monthly command id must contain 1 through 96 safe identifier characters",
    );
  }
  if (state.acceptedCommandIds.includes(commandId)) {
    throw new MonthlyTurnError(
      "DUPLICATE_COMMAND",
      `monthly command ${commandId} was already accepted`,
    );
  }
  if (!Number.isSafeInteger(input.employmentIncomeCents) || input.employmentIncomeCents < 0) {
    throw new MonthlyTurnError(
      "INVALID_INCOME",
      "employment income must be non-negative safe integer cents",
    );
  }
  if (
    !Number.isSafeInteger(input.taxableLiquidationCostRatePpm) ||
    input.taxableLiquidationCostRatePpm < 0 ||
    input.taxableLiquidationCostRatePpm > 1_000_000
  ) {
    throw new MonthlyTurnError(
      "INVALID_LIQUIDATION_RATE",
      "taxable liquidation cost rate must be between 0 and 1,000,000 PPM",
    );
  }

  let working = state;
  let resolvedEvent: ResolvedEvent | null = null;
  let modifiers = ZERO_MODIFIERS;
  if (input.event) {
    const template = getEventTemplate(
      input.event.proposal.templateId,
      input.event.proposal.templateVersion,
    );
    const application = applyEvent(
      working,
      template,
      input.event.proposal,
      input.event.choiceId,
    );
    working = withChanges(working, {
      finances: application.finances,
      wellbeing: application.wellbeing,
    });
    resolvedEvent = application.event;
    modifiers = application.marketReturnModifiers;
  }

  const marketResult = simulateMarketMonth(
    marketSimulationState(working.marketRegime, working.random),
  );
  const revaluation = revalueAssets(
    working,
    commandId,
    marketResult.month,
    modifiers,
  );
  working = withChanges(working, {
    ledger: revaluation.ledger,
    finances: revaluation.finances,
  });
  working = withChanges(
    working,
    postEmploymentIncome(working, commandId, input.employmentIncomeCents),
  );

  const inflationIncrease = multiplyMoneyByRate(
    working.finances.annualLivingCostCents,
    marketResult.month.inflationPpm,
  );
  working = withChanges(working, {
    finances: {
      ...working.finances,
      annualLivingCostCents: addMoney(
        working.finances.annualLivingCostCents,
        inflationIncrease,
      ),
    },
  });

  const obligationsDue = working.finances.requiredObligationsCents;
  const nextMonth = addMonths(state.currentMonth, 1);
  let funding: ObligationFunding | null = null;
  let outcome: GameOutcome | null = null;
  if (hasReachedFinancialIndependence(working.finances)) {
    outcome = evaluateTerminalOutcome(
      withChanges(working, { currentMonth: nextMonth }),
      input.taxableLiquidationCostRatePpm,
    );
  } else {
    const liquidity = assessRequiredObligationLiquidity(
      working.finances,
      input.taxableLiquidationCostRatePpm,
    );
    if (liquidity.isBankrupt) {
      outcome = evaluateTerminalOutcome(
        withChanges(working, { currentMonth: nextMonth }),
        input.taxableLiquidationCostRatePpm,
      );
    } else {
      funding = fundRequiredObligations(
        working,
        commandId,
        state.currentMonth,
        input.taxableLiquidationCostRatePpm,
        `txn.${commandId}.obligations`,
      );
      working = withChanges(working, {
        ledger: funding.ledger,
        finances: {
          ...funding.finances,
          requiredObligationsCents: state.finances.requiredObligationsCents,
        },
      });
      outcome = evaluateTerminalOutcome(
        withChanges(working, { currentMonth: nextMonth }),
        input.taxableLiquidationCostRatePpm,
      );
    }
  }

  const nextState = finalizeGameState({
    ...working,
    currentMonth: nextMonth,
    revision: state.revision + 1,
    random: marketResult.nextState.random,
    marketRegime: marketResult.nextState.regime,
    acceptedCommandIds: [...state.acceptedCommandIds, commandId],
    outcome,
  });
  const fundingRecord = funding
    ? Object.freeze({
        cashUsedCents: funding.cashUsedCents,
        taxableInvestmentsLiquidatedCents: funding.taxableInvestmentsLiquidatedCents,
        liquidationCostCents: funding.liquidationCostCents,
        creditDrawnCents: funding.creditDrawnCents,
      })
    : null;
  return Object.freeze({
    state: nextState,
    record: Object.freeze({
      processedMonth: state.currentMonth,
      nextMonth,
      market: marketResult.month,
      event: resolvedEvent,
      employmentIncomeCents: input.employmentIncomeCents,
      marketValueChangeCents: revaluation.marketValueChangeCents,
      inflationIncreaseCents: inflationIncrease,
      obligationsDueCents: obligationsDue,
      obligationFunding: fundingRecord,
      outcome,
    }),
  });
}
