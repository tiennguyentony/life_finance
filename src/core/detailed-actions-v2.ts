import {
  addMoney,
  allocateMoney,
  moneyCents,
  multiplyMoneyByRate,
  subtractMoney,
  type MoneyCents,
  type RatePpm,
} from "./domain/money";
import {
  divideRoundHalfAwayFromZero,
  safeBigIntToNumber,
} from "./domain/integer";
import {
  addMonths,
  monthsBetween,
  simulationMonth,
  type SimulationMonth,
} from "./domain/month";
import { reconcileFinancesWithLedger } from "./game-state";
import {
  finalizeGameStateV2,
  type GameStateV2,
  type PortfolioBreakdown,
} from "./game-state-v2";
import { appendTransaction, type JournalPosting } from "./ledger";
import { getUpskillProgram } from "../data/upskill-programs";

export const DETAILED_FINANCE_COMMAND_SCHEMA_VERSION = 2 as const;

type InvestableTaxableBucket =
  | "taxableBroadIndexCents"
  | "taxableSectorCents"
  | "taxableSpeculativeCents";

type LiquidatableTaxableBucket =
  | InvestableTaxableBucket
  | "taxableLegacyUnclassifiedCents";

export type DetailedFinancialAction =
  | Readonly<{
      type: "invest_taxable";
      bucket: InvestableTaxableBucket;
      amountCents: MoneyCents;
    }>
  | Readonly<{
      type: "liquidate_taxable";
      bucket: LiquidatableTaxableBucket;
      amountCents: MoneyCents;
      liquidationCostRatePpm: RatePpm;
    }>
  | Readonly<{ type: "contribute_ira"; amountCents: MoneyCents }>
  | Readonly<{ type: "contribute_hsa"; amountCents: MoneyCents }>
  | Readonly<{
      type: "pay_term_debt";
      debtId: string;
      amountCents: MoneyCents;
    }>
  | Readonly<{ type: "pay_revolving_credit"; amountCents: MoneyCents }>
  | Readonly<{ type: "draw_revolving_credit"; amountCents: MoneyCents }>
  | Readonly<{
      type: "withdraw_retirement";
      bucket:
        | "retirement401kCents"
        | "retirementIraCents"
        | "retirementLegacyUnclassifiedCents";
      amountCents: MoneyCents;
    }>
  | Readonly<{
      type: "purchase_home";
      purchasePriceCents: MoneyCents;
      downPaymentCents: MoneyCents;
      mortgageAnnualInterestRatePpm: RatePpm;
      mortgageTermMonths: number;
    }>
  | Readonly<{ type: "sell_home" }>
  | Readonly<{
      type: "refinance_home";
      mortgageAnnualInterestRatePpm: RatePpm;
      mortgageTermMonths: number;
    }>
  | Readonly<{
      type: "change_lifestyle";
      annualLivingCostDeltaCents: MoneyCents;
    }>
  | Readonly<{
      type: "start_upskill";
      programId: "upskill.certificate" | "upskill.bootcamp" | "upskill.degree";
    }>;

export type DetailedFinanceCommand = Readonly<{
  schemaVersion: typeof DETAILED_FINANCE_COMMAND_SCHEMA_VERSION;
  id: string;
  type: "take_detailed_action";
  expectedRevision: number;
  effectiveMonth: SimulationMonth;
  payload: Readonly<{ action: DetailedFinancialAction }>;
}>;

export class DetailedFinanceError extends Error {
  readonly code:
    | "INVALID_COMMAND"
    | "DUPLICATE_COMMAND"
    | "STALE_REVISION"
    | "RUN_TERMINAL"
    | "INVALID_AMOUNT"
    | "INVALID_RATE"
    | "INSUFFICIENT_CASH"
    | "INSUFFICIENT_BALANCE"
    | "CONTRIBUTION_LIMIT"
    | "HSA_INELIGIBLE"
    | "UNKNOWN_DEBT"
    | "PAYMENT_EXCEEDS_DEBT"
    | "CREDIT_LIMIT_EXCEEDED"
    | "HOME_ALREADY_OWNED"
    | "HOME_REQUIRED"
    | "INVALID_TERM"
    | "MORTGAGE_CONFLICT"
    | "LIFESTYLE_OUT_OF_RANGE"
    | "UNKNOWN_PROGRAM"
    | "EMPLOYMENT_REQUIRED";

  constructor(code: DetailedFinanceError["code"], message: string) {
    super(message);
    this.name = "DetailedFinanceError";
    this.code = code;
  }
}

const COMMAND_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

function debit(accountId: string, amountCents: MoneyCents): JournalPosting {
  return { accountId, debitCents: amountCents, creditCents: moneyCents(0) };
}

function credit(accountId: string, amountCents: MoneyCents): JournalPosting {
  return { accountId, debitCents: moneyCents(0), creditCents: amountCents };
}

function assertPositive(value: MoneyCents): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new DetailedFinanceError(
      "INVALID_AMOUNT",
      "amount must be positive safe integer cents",
    );
  }
}

function validateEnvelope(
  state: GameStateV2,
  command: DetailedFinanceCommand,
): void {
  if (
    command.schemaVersion !== DETAILED_FINANCE_COMMAND_SCHEMA_VERSION ||
    command.type !== "take_detailed_action" ||
    !COMMAND_ID.test(command.id) ||
    !Number.isSafeInteger(command.expectedRevision) ||
    command.expectedRevision < 0
  ) {
    throw new DetailedFinanceError("INVALID_COMMAND", "invalid v2 command envelope");
  }
  try {
    simulationMonth(command.effectiveMonth);
  } catch {
    throw new DetailedFinanceError("INVALID_COMMAND", "invalid effective month");
  }
  if (command.effectiveMonth !== state.currentMonth) {
    throw new DetailedFinanceError(
      "INVALID_COMMAND",
      "effective month must equal the authoritative current month",
    );
  }
  if (state.acceptedCommandIds.includes(command.id)) {
    throw new DetailedFinanceError("DUPLICATE_COMMAND", "command was already accepted");
  }
  if (command.expectedRevision !== state.revision) {
    throw new DetailedFinanceError("STALE_REVISION", "command revision is stale");
  }
  if (state.outcome !== null) {
    throw new DetailedFinanceError("RUN_TERMINAL", "terminal runs reject commands");
  }
}

function appendAction(
  state: GameStateV2,
  command: DetailedFinanceCommand,
  reasonCode: string,
  description: string,
  postings: readonly JournalPosting[],
): Pick<GameStateV2, "ledger" | "finances"> {
  const ledger = appendTransaction(state.ledger, {
    id: `txn.${command.id}`,
    commandId: command.id,
    effectiveMonth: command.effectiveMonth,
    reasonCode,
    description,
    postings,
  });
  return {
    ledger,
    finances: reconcileFinancesWithLedger(state.finances, ledger),
  };
}

function accept(
  state: GameStateV2,
  command: DetailedFinanceCommand,
  changes: Partial<GameStateV2>,
): GameStateV2 {
  return finalizeGameStateV2({
    ...state,
    ...changes,
    revision: state.revision + 1,
    acceptedCommandIds: [...state.acceptedCommandIds, command.id],
  });
}

function requireCash(state: GameStateV2, amountCents: MoneyCents): void {
  if (amountCents > state.finances.cashCents) {
    throw new DetailedFinanceError(
      "INSUFFICIENT_CASH",
      "action exceeds available cash",
    );
  }
}

function applyInvestTaxable(
  state: GameStateV2,
  command: DetailedFinanceCommand,
  action: Extract<DetailedFinancialAction, { type: "invest_taxable" }>,
): GameStateV2 {
  assertPositive(action.amountCents);
  requireCash(state, action.amountCents);
  const aggregate = appendAction(
    state,
    command,
    "invest_taxable_v2",
    `Invest cash in ${action.bucket}`,
    [
      debit("asset.taxable_investments", action.amountCents),
      credit("asset.cash", action.amountCents),
    ],
  );
  return accept(state, command, {
    ...aggregate,
    gameplay: {
      ...state.gameplay,
      portfolio: {
        ...state.gameplay.portfolio,
        [action.bucket]: addMoney(
          state.gameplay.portfolio[action.bucket],
          action.amountCents,
        ),
      },
    },
  });
}

function applyLiquidateTaxable(
  state: GameStateV2,
  command: DetailedFinanceCommand,
  action: Extract<DetailedFinancialAction, { type: "liquidate_taxable" }>,
): GameStateV2 {
  assertPositive(action.amountCents);
  if (
    !Number.isSafeInteger(action.liquidationCostRatePpm) ||
    action.liquidationCostRatePpm < 0 ||
    action.liquidationCostRatePpm > 1_000_000
  ) {
    throw new DetailedFinanceError("INVALID_RATE", "liquidation rate must be 0..1,000,000 PPM");
  }
  if (action.amountCents > state.gameplay.portfolio[action.bucket]) {
    throw new DetailedFinanceError(
      "INSUFFICIENT_BALANCE",
      "liquidation exceeds the selected taxable bucket",
    );
  }
  const cost = multiplyMoneyByRate(
    action.amountCents,
    action.liquidationCostRatePpm,
  );
  const proceeds = subtractMoney(action.amountCents, cost);
  const postings: JournalPosting[] = [
    credit("asset.taxable_investments", action.amountCents),
  ];
  if (proceeds > 0) postings.push(debit("asset.cash", proceeds));
  if (cost > 0) postings.push(debit("expense.living", cost));
  const aggregate = appendAction(
    state,
    command,
    "liquidate_taxable_v2",
    `Liquidate ${action.bucket}`,
    postings,
  );
  return accept(state, command, {
    ...aggregate,
    gameplay: {
      ...state.gameplay,
      portfolio: {
        ...state.gameplay.portfolio,
        [action.bucket]: subtractMoney(
          state.gameplay.portfolio[action.bucket],
          action.amountCents,
        ),
      },
    },
  });
}

function applyContribution(
  state: GameStateV2,
  command: DetailedFinanceCommand,
  action: Extract<
    DetailedFinancialAction,
    { type: "contribute_ira" | "contribute_hsa" }
  >,
): GameStateV2 {
  assertPositive(action.amountCents);
  requireCash(state, action.amountCents);
  const snapshot = state.gameplay.catalogSnapshot;
  if (!snapshot) {
    throw new DetailedFinanceError(
      "CONTRIBUTION_LIMIT",
      "legacy state has no verified contribution policy",
    );
  }
  const isHsa = action.type === "contribute_hsa";
  if (isHsa && !state.gameplay.benefits.hsaEligible) {
    throw new DetailedFinanceError("HSA_INELIGIBLE", "selected health plan is not HSA eligible");
  }
  const current = isHsa
    ? state.gameplay.contributions.hsaCents
    : state.gameplay.contributions.iraCents;
  const limit = isHsa
    ? snapshot.derived.hsaAnnualContributionLimitCents
    : snapshot.selected.benefitPolicy.iraContributionLimitCents;
  if (limit === null || addMoney(current, action.amountCents) > limit) {
    throw new DetailedFinanceError(
      "CONTRIBUTION_LIMIT",
      "contribution exceeds the resolved annual policy limit",
    );
  }
  const aggregateAccount = isHsa ? "asset.other_investable" : "asset.retirement";
  const aggregate = appendAction(
    state,
    command,
    isHsa ? "contribute_hsa_v2" : "contribute_ira_v2",
    isHsa ? "Contribute cash to HSA" : "Contribute cash to IRA",
    [debit(aggregateAccount, action.amountCents), credit("asset.cash", action.amountCents)],
  );
  const portfolioKey: keyof PortfolioBreakdown = isHsa
    ? "hsaCents"
    : "retirementIraCents";
  const contributionKey = isHsa ? "hsaCents" : "iraCents";
  return accept(state, command, {
    ...aggregate,
    gameplay: {
      ...state.gameplay,
      portfolio: {
        ...state.gameplay.portfolio,
        [portfolioKey]: addMoney(
          state.gameplay.portfolio[portfolioKey],
          action.amountCents,
        ),
      },
      contributions: {
        ...state.gameplay.contributions,
        [contributionKey]: addMoney(current, action.amountCents),
      },
    },
  });
}

function applyTermDebtPayment(
  state: GameStateV2,
  command: DetailedFinanceCommand,
  action: Extract<DetailedFinancialAction, { type: "pay_term_debt" }>,
): GameStateV2 {
  assertPositive(action.amountCents);
  requireCash(state, action.amountCents);
  const index = state.gameplay.debts.termDebts.findIndex(
    ({ id }) => id === action.debtId,
  );
  if (index < 0) {
    throw new DetailedFinanceError("UNKNOWN_DEBT", "term debt does not exist");
  }
  const debt = state.gameplay.debts.termDebts[index]!;
  if (action.amountCents > debt.principalCents) {
    throw new DetailedFinanceError(
      "PAYMENT_EXCEEDS_DEBT",
      "payment exceeds remaining principal",
    );
  }
  const nextPrincipal = subtractMoney(debt.principalCents, action.amountCents);
  const nextMinimum =
    nextPrincipal === 0
      ? moneyCents(0)
      : moneyCents(Math.min(debt.minimumPaymentCents, nextPrincipal));
  const nextDebt = {
    ...debt,
    principalCents: nextPrincipal,
    minimumPaymentCents: nextMinimum,
    remainingTermMonths: nextPrincipal === 0 ? 0 : debt.remainingTermMonths,
  };
  const termDebts = [...state.gameplay.debts.termDebts];
  termDebts[index] = nextDebt;
  const aggregate = appendAction(
    state,
    command,
    "pay_term_debt_v2",
    `Pay term debt ${action.debtId}`,
    [debit("liability.non_credit", action.amountCents), credit("asset.cash", action.amountCents)],
  );
  const obligationReduction = subtractMoney(
    debt.minimumPaymentCents,
    nextMinimum,
  );
  return accept(state, command, {
    ...aggregate,
    finances: {
      ...aggregate.finances,
      requiredObligationsCents: subtractMoney(
        aggregate.finances.requiredObligationsCents,
        obligationReduction,
      ),
    },
    gameplay: {
      ...state.gameplay,
      debts: { ...state.gameplay.debts, termDebts },
    },
  });
}

function applyRevolvingCredit(
  state: GameStateV2,
  command: DetailedFinanceCommand,
  action: Extract<
    DetailedFinancialAction,
    { type: "pay_revolving_credit" | "draw_revolving_credit" }
  >,
): GameStateV2 {
  assertPositive(action.amountCents);
  const isPayment = action.type === "pay_revolving_credit";
  if (isPayment) {
    requireCash(state, action.amountCents);
    if (action.amountCents > state.gameplay.debts.revolvingCreditUsedCents) {
      throw new DetailedFinanceError(
        "PAYMENT_EXCEEDS_DEBT",
        "payment exceeds revolving balance",
      );
    }
  } else {
    const remaining = subtractMoney(
      state.gameplay.debts.revolvingCreditLimitCents,
      state.gameplay.debts.revolvingCreditUsedCents,
    );
    if (action.amountCents > remaining) {
      throw new DetailedFinanceError(
        "CREDIT_LIMIT_EXCEEDED",
        "draw exceeds remaining revolving credit",
      );
    }
  }
  const aggregate = appendAction(
    state,
    command,
    isPayment ? "pay_revolving_credit_v2" : "draw_revolving_credit_v2",
    isPayment ? "Pay revolving credit" : "Draw revolving credit",
    isPayment
      ? [debit("liability.credit", action.amountCents), credit("asset.cash", action.amountCents)]
      : [debit("asset.cash", action.amountCents), credit("liability.credit", action.amountCents)],
  );
  return accept(state, command, {
    ...aggregate,
    gameplay: {
      ...state.gameplay,
      debts: {
        ...state.gameplay.debts,
        revolvingCreditUsedCents: isPayment
          ? subtractMoney(
              state.gameplay.debts.revolvingCreditUsedCents,
              action.amountCents,
            )
          : addMoney(
              state.gameplay.debts.revolvingCreditUsedCents,
              action.amountCents,
            ),
      },
    },
  });
}

function applyRetirementWithdrawal(
  state: GameStateV2,
  command: DetailedFinanceCommand,
  action: Extract<DetailedFinancialAction, { type: "withdraw_retirement" }>,
): GameStateV2 {
  assertPositive(action.amountCents);
  const balance = state.gameplay.portfolio[action.bucket];
  if (action.amountCents > balance) {
    throw new DetailedFinanceError(
      "INSUFFICIENT_BALANCE",
      "withdrawal exceeds the selected retirement bucket",
    );
  }
  const withholding = multiplyMoneyByRate(
    action.amountCents,
    200_000 as RatePpm,
  );
  const ageMonths = monthsBetween(state.player.birthMonth, state.currentMonth);
  const penalty =
    ageMonths < 714
      ? multiplyMoneyByRate(action.amountCents, 100_000 as RatePpm)
      : moneyCents(0);
  const proceeds = subtractMoney(
    subtractMoney(action.amountCents, withholding),
    penalty,
  );
  const postings: JournalPosting[] = [
    credit("asset.retirement", action.amountCents),
    debit("asset.cash", proceeds),
  ];
  if (withholding > 0) postings.push(debit("expense.tax", withholding));
  if (penalty > 0) postings.push(debit("expense.living", penalty));
  const aggregate = appendAction(
    state,
    command,
    "withdraw_retirement_v2",
    `Withdraw retirement from ${action.bucket}; 20% withholding${penalty > 0 ? " and 10% early penalty" : ""}`,
    postings,
  );
  return accept(state, command, {
    ...aggregate,
    gameplay: {
      ...state.gameplay,
      portfolio: {
        ...state.gameplay.portfolio,
        [action.bucket]: subtractMoney(balance, action.amountCents),
      },
    },
  });
}

const HOME_PURCHASE_CLOSING_COST_PPM = 30_000 as RatePpm;
const HOME_SALE_COST_PPM = 60_000 as RatePpm;
const HOME_REFINANCE_COST_PPM = 20_000 as RatePpm;

function validateMortgageTerms(rate: RatePpm, termMonths: number): void {
  if (!Number.isSafeInteger(rate) || rate < 0 || rate > 500_000) {
    throw new DetailedFinanceError(
      "INVALID_RATE",
      "mortgage annual rate must be 0..500,000 PPM",
    );
  }
  if (!Number.isSafeInteger(termMonths) || termMonths < 12 || termMonths > 480) {
    throw new DetailedFinanceError(
      "INVALID_TERM",
      "mortgage term must be 12..480 months",
    );
  }
}

function amortizedPayment(
  principalCents: MoneyCents,
  annualRatePpm: RatePpm,
  termMonths: number,
): MoneyCents {
  if (principalCents === 0) return moneyCents(0);
  if (annualRatePpm === 0) {
    return moneyCents(
      safeBigIntToNumber(
        divideRoundHalfAwayFromZero(
          BigInt(principalCents),
          BigInt(termMonths),
        ),
        "zero-rate mortgage payment",
      ),
    );
  }
  const denominator = BigInt(12_000_000);
  const growth = denominator + BigInt(annualRatePpm);
  const growthPower = growth ** BigInt(termMonths);
  const denominatorPower = denominator ** BigInt(termMonths);
  return moneyCents(
    safeBigIntToNumber(
      divideRoundHalfAwayFromZero(
        BigInt(principalCents) * BigInt(annualRatePpm) * growthPower,
        denominator * (growthPower - denominatorPower),
      ),
      "amortized mortgage payment",
    ),
  );
}

function applyHomePurchase(
  state: GameStateV2,
  command: DetailedFinanceCommand,
  action: Extract<DetailedFinancialAction, { type: "purchase_home" }>,
): GameStateV2 {
  assertPositive(action.purchasePriceCents);
  if (
    !Number.isSafeInteger(action.downPaymentCents) ||
    action.downPaymentCents < 0 ||
    action.downPaymentCents > action.purchasePriceCents
  ) {
    throw new DetailedFinanceError(
      "INVALID_AMOUNT",
      "down payment must be between zero and purchase price",
    );
  }
  if (state.finances.homeValueCents > 0) {
    throw new DetailedFinanceError("HOME_ALREADY_OWNED", "run already owns a home");
  }
  validateMortgageTerms(
    action.mortgageAnnualInterestRatePpm,
    action.mortgageTermMonths,
  );
  const closingCost = multiplyMoneyByRate(
    action.purchasePriceCents,
    HOME_PURCHASE_CLOSING_COST_PPM,
  );
  const cashRequired = addMoney(action.downPaymentCents, closingCost);
  requireCash(state, cashRequired);
  const principal = subtractMoney(
    action.purchasePriceCents,
    action.downPaymentCents,
  );
  const minimumPayment = amortizedPayment(
    principal,
    action.mortgageAnnualInterestRatePpm,
    action.mortgageTermMonths,
  );
  const postings: JournalPosting[] = [
    debit("asset.home", action.purchasePriceCents),
    credit("asset.cash", cashRequired),
  ];
  if (principal > 0) postings.push(credit("liability.non_credit", principal));
  if (closingCost > 0) postings.push(debit("expense.living", closingCost));
  const aggregate = appendAction(
    state,
    command,
    "purchase_home_v2",
    "Purchase home with authoritative 3% closing cost",
    postings,
  );
  const termDebts = principal > 0
    ? [
        ...state.gameplay.debts.termDebts,
        {
          id: `debt.mortgage.${command.id}`,
          kind: "mortgage" as const,
          principalCents: principal,
          annualInterestRatePpm: action.mortgageAnnualInterestRatePpm,
          minimumPaymentCents: minimumPayment,
          remainingTermMonths: action.mortgageTermMonths,
        },
      ]
    : state.gameplay.debts.termDebts;
  return accept(state, command, {
    ...aggregate,
    finances: {
      ...aggregate.finances,
      requiredObligationsCents: addMoney(
        aggregate.finances.requiredObligationsCents,
        minimumPayment,
      ),
    },
    gameplay: {
      ...state.gameplay,
      debts: { ...state.gameplay.debts, termDebts },
    },
  });
}

function applyHomeSale(
  state: GameStateV2,
  command: DetailedFinanceCommand,
): GameStateV2 {
  const homeValue = state.finances.homeValueCents;
  if (homeValue <= 0) {
    throw new DetailedFinanceError("HOME_REQUIRED", "run does not own a home");
  }
  const mortgages = state.gameplay.debts.termDebts.filter(
    ({ kind }) => kind === "mortgage",
  );
  const mortgagePrincipal = moneyCents(
    safeBigIntToNumber(
      mortgages.reduce(
        (total, debt) => total + BigInt(debt.principalCents),
        BigInt(0),
      ),
      "mortgage payoff",
    ),
  );
  const removedMinimums = moneyCents(
    safeBigIntToNumber(
      mortgages.reduce(
        (total, debt) => total + BigInt(debt.minimumPaymentCents),
        BigInt(0),
      ),
      "mortgage minimums",
    ),
  );
  const saleCost = multiplyMoneyByRate(homeValue, HOME_SALE_COST_PPM);
  const net = homeValue - saleCost - mortgagePrincipal;
  if (net < 0) requireCash(state, moneyCents(-net));
  const postings: JournalPosting[] = [credit("asset.home", homeValue)];
  if (mortgagePrincipal > 0) {
    postings.push(debit("liability.non_credit", mortgagePrincipal));
  }
  if (saleCost > 0) postings.push(debit("expense.living", saleCost));
  if (net > 0) postings.push(debit("asset.cash", moneyCents(net)));
  if (net < 0) postings.push(credit("asset.cash", moneyCents(-net)));
  const aggregate = appendAction(
    state,
    command,
    "sell_home_v2",
    "Sell home at authoritative carrying value with 6% selling cost",
    postings,
  );
  return accept(state, command, {
    ...aggregate,
    finances: {
      ...aggregate.finances,
      requiredObligationsCents: subtractMoney(
        aggregate.finances.requiredObligationsCents,
        removedMinimums,
      ),
    },
    gameplay: {
      ...state.gameplay,
      debts: {
        ...state.gameplay.debts,
        termDebts: state.gameplay.debts.termDebts.filter(
          ({ kind }) => kind !== "mortgage",
        ),
      },
    },
  });
}

function applyHomeRefinance(
  state: GameStateV2,
  command: DetailedFinanceCommand,
  action: Extract<DetailedFinancialAction, { type: "refinance_home" }>,
): GameStateV2 {
  if (state.finances.homeValueCents <= 0) {
    throw new DetailedFinanceError("HOME_REQUIRED", "run does not own a home");
  }
  validateMortgageTerms(
    action.mortgageAnnualInterestRatePpm,
    action.mortgageTermMonths,
  );
  const indexes = state.gameplay.debts.termDebts
    .map((debt, index) => ({ debt, index }))
    .filter(({ debt }) => debt.kind === "mortgage" && debt.principalCents > 0);
  if (indexes.length !== 1) {
    throw new DetailedFinanceError(
      "MORTGAGE_CONFLICT",
      "refinance requires exactly one active mortgage",
    );
  }
  const { debt, index } = indexes[0]!;
  const closingCost = multiplyMoneyByRate(
    debt.principalCents,
    HOME_REFINANCE_COST_PPM,
  );
  requireCash(state, closingCost);
  const nextMinimum = amortizedPayment(
    debt.principalCents,
    action.mortgageAnnualInterestRatePpm,
    action.mortgageTermMonths,
  );
  const aggregate = appendAction(
    state,
    command,
    "refinance_home_v2",
    "Refinance mortgage with authoritative 2% closing cost",
    [debit("expense.living", closingCost), credit("asset.cash", closingCost)],
  );
  const termDebts = [...state.gameplay.debts.termDebts];
  termDebts[index] = {
    ...debt,
    annualInterestRatePpm: action.mortgageAnnualInterestRatePpm,
    minimumPaymentCents: nextMinimum,
    remainingTermMonths: action.mortgageTermMonths,
  };
  return accept(state, command, {
    ...aggregate,
    finances: {
      ...aggregate.finances,
      requiredObligationsCents: addMoney(
        subtractMoney(
          aggregate.finances.requiredObligationsCents,
          debt.minimumPaymentCents,
        ),
        nextMinimum,
      ),
    },
    gameplay: {
      ...state.gameplay,
      debts: { ...state.gameplay.debts, termDebts },
    },
  });
}

function applyLifestyleChange(
  state: GameStateV2,
  command: DetailedFinanceCommand,
  action: Extract<DetailedFinancialAction, { type: "change_lifestyle" }>,
): GameStateV2 {
  const delta = action.annualLivingCostDeltaCents;
  if (!Number.isSafeInteger(delta) || delta === 0) {
    throw new DetailedFinanceError(
      "INVALID_AMOUNT",
      "lifestyle delta must be a non-zero safe integer number of cents",
    );
  }
  const annual = state.finances.annualLivingCostCents + delta;
  const monthlyDelta = allocateMoney(delta, 1, 12);
  const required = state.finances.requiredObligationsCents + monthlyDelta;
  if (!Number.isSafeInteger(annual) || annual < 0 || required < 0) {
    throw new DetailedFinanceError(
      "LIFESTYLE_OUT_OF_RANGE",
      "lifestyle change cannot make living cost or obligations negative",
    );
  }
  return accept(state, command, {
    finances: {
      ...state.finances,
      annualLivingCostCents: moneyCents(annual),
      requiredObligationsCents: moneyCents(required),
    },
  });
}

function applyStartUpskill(
  state: GameStateV2,
  command: DetailedFinanceCommand,
  action: Extract<DetailedFinancialAction, { type: "start_upskill" }>,
): GameStateV2 {
  const program = getUpskillProgram(action.programId);
  if (!program) {
    throw new DetailedFinanceError("UNKNOWN_PROGRAM", "upskill program is unknown");
  }
  if (state.gameplay.employment.status !== "employed") {
    throw new DetailedFinanceError(
      "EMPLOYMENT_REQUIRED",
      "upskill salary effect requires active employment",
    );
  }
  if (
    state.gameplay.careerDevelopment.pending.some(
      ({ programId }) => programId === program.id,
    )
  ) {
    throw new DetailedFinanceError(
      "INVALID_COMMAND",
      "the selected upskill program is already pending",
    );
  }
  requireCash(state, program.costCents);
  const aggregate = appendAction(
    state,
    command,
    "start_upskill_v2",
    `Start engine-owned upskill program ${program.id}`,
    [debit("expense.living", program.costCents), credit("asset.cash", program.costCents)],
  );
  return accept(state, command, {
    ...aggregate,
    gameplay: {
      ...state.gameplay,
      careerDevelopment: {
        ...state.gameplay.careerDevelopment,
        pending: [
          ...state.gameplay.careerDevelopment.pending,
          {
            commandId: command.id,
            programId: program.id,
            catalogVersion: program.version,
            startedMonth: state.currentMonth,
            completesMonth: addMonths(state.currentMonth, program.durationMonths),
            annualSalaryIncreaseCents: program.annualSalaryIncreaseCents,
          },
        ],
      },
    },
  });
}

export function completeCareerDevelopmentV2(state: GameStateV2): GameStateV2 {
  const completed = state.gameplay.careerDevelopment.pending.filter(
    ({ completesMonth }) => completesMonth === state.currentMonth,
  );
  if (completed.length === 0) return finalizeGameStateV2(state);
  if (state.gameplay.employment.status !== "employed") {
    throw new DetailedFinanceError(
      "EMPLOYMENT_REQUIRED",
      "pending salary effect cannot complete without active employment",
    );
  }
  const salaryIncrease = moneyCents(
    safeBigIntToNumber(
      completed.reduce(
        (total, entry) => total + BigInt(entry.annualSalaryIncreaseCents),
        BigInt(0),
      ),
      "completed upskill salary increase",
    ),
  );
  return finalizeGameStateV2({
    ...state,
    gameplay: {
      ...state.gameplay,
      employment: {
        ...state.gameplay.employment,
        annualGrossSalaryCents: addMoney(
          state.gameplay.employment.annualGrossSalaryCents,
          salaryIncrease,
        ),
      },
      careerDevelopment: {
        pending: state.gameplay.careerDevelopment.pending.filter(
          ({ completesMonth }) => completesMonth !== state.currentMonth,
        ),
        history: [
          ...state.gameplay.careerDevelopment.history,
          ...completed.map((entry) => ({
            commandId: entry.commandId,
            programId: entry.programId,
            catalogVersion: entry.catalogVersion,
            startedMonth: entry.startedMonth,
            completedMonth: state.currentMonth,
            annualSalaryIncreaseCents: entry.annualSalaryIncreaseCents,
          })),
        ],
      },
    },
  });
}

export function reduceDetailedFinanceCommand(
  state: GameStateV2,
  command: DetailedFinanceCommand,
): GameStateV2 {
  validateEnvelope(state, command);
  switch (command.payload.action.type) {
    case "invest_taxable":
      return applyInvestTaxable(state, command, command.payload.action);
    case "liquidate_taxable":
      return applyLiquidateTaxable(state, command, command.payload.action);
    case "contribute_ira":
    case "contribute_hsa":
      return applyContribution(state, command, command.payload.action);
    case "pay_term_debt":
      return applyTermDebtPayment(state, command, command.payload.action);
    case "pay_revolving_credit":
    case "draw_revolving_credit":
      return applyRevolvingCredit(state, command, command.payload.action);
    case "withdraw_retirement":
      return applyRetirementWithdrawal(state, command, command.payload.action);
    case "purchase_home":
      return applyHomePurchase(state, command, command.payload.action);
    case "sell_home":
      return applyHomeSale(state, command);
    case "refinance_home":
      return applyHomeRefinance(state, command, command.payload.action);
    case "change_lifestyle":
      return applyLifestyleChange(state, command, command.payload.action);
    case "start_upskill":
      return applyStartUpskill(state, command, command.payload.action);
  }
}
