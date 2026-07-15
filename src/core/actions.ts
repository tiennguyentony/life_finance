import {
  addMoney,
  moneyCents,
  multiplyMoneyByRate,
  negateMoney,
  ratePpm,
  subtractMoney,
  type MoneyCents,
  type RatePpm,
} from "./domain/money";
import { safeBigIntToNumber } from "./domain/integer";
import type { SimulationMonth } from "./domain/month";
import {
  reconcileFinancesWithLedger,
  type FinancialSnapshot,
  type GameState,
} from "./game-state";
import {
  appendTransaction,
  type JournalPosting,
  type Ledger,
} from "./ledger";

export type FinancialAction =
  | Readonly<{ type: "invest_cash"; amountCents: MoneyCents }>
  | Readonly<{
      type: "liquidate_taxable_investments";
      amountCents: MoneyCents;
      liquidationCostRatePpm: RatePpm;
    }>
  | Readonly<{ type: "pay_credit"; amountCents: MoneyCents }>
  | Readonly<{ type: "draw_credit"; amountCents: MoneyCents }>
  | Readonly<{
      type: "withdraw_retirement";
      grossAmountCents: MoneyCents;
      withholdingRatePpm: RatePpm;
      penaltyRatePpm: RatePpm;
    }>
  | Readonly<{
      type: "sell_home";
      salePriceCents: MoneyCents;
      nonCreditLiabilityPayoffCents: MoneyCents;
      transactionCostRatePpm: RatePpm;
    }>
  | Readonly<{
      type: "set_annual_living_cost";
      annualLivingCostCents: MoneyCents;
    }>;

export type FinancialActionApplication = Readonly<{
  ledger: Ledger;
  finances: FinancialSnapshot;
}>;

export class FinancialActionError extends Error {
  readonly code:
    | "INVALID_AMOUNT"
    | "INVALID_RATE"
    | "INSUFFICIENT_CASH"
    | "INSUFFICIENT_INVESTMENTS"
    | "INSUFFICIENT_RETIREMENT"
    | "CREDIT_LIMIT_EXCEEDED"
    | "CREDIT_PAYMENT_EXCEEDED"
    | "LIABILITY_PAYOFF_EXCEEDED"
    | "NO_HOME_TO_SELL"
    | "BUDGET_INCREASE_NOT_ALLOWED";

  constructor(code: FinancialActionError["code"], message: string) {
    super(message);
    this.name = "FinancialActionError";
    this.code = code;
  }
}

function assertPositive(value: MoneyCents, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new FinancialActionError(
      "INVALID_AMOUNT",
      `${label} must be positive safe integer cents`,
    );
  }
}

function assertNonNegative(value: MoneyCents, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new FinancialActionError(
      "INVALID_AMOUNT",
      `${label} must be non-negative safe integer cents`,
    );
  }
}

function assertRate(value: RatePpm, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) {
    throw new FinancialActionError(
      "INVALID_RATE",
      `${label} must be between 0 and 1,000,000 PPM`,
    );
  }
}

function debit(accountId: string, amountCents: MoneyCents): JournalPosting {
  return { accountId, debitCents: amountCents, creditCents: moneyCents(0) };
}

function credit(accountId: string, amountCents: MoneyCents): JournalPosting {
  return { accountId, debitCents: moneyCents(0), creditCents: amountCents };
}

function postingForAssetDelta(
  accountId: string,
  deltaCents: MoneyCents,
): JournalPosting | null {
  if (deltaCents === 0) return null;
  return deltaCents > 0
    ? debit(accountId, deltaCents)
    : credit(accountId, negateMoney(deltaCents));
}

function appendActionTransaction(
  state: GameState,
  commandId: string,
  effectiveMonth: SimulationMonth,
  reasonCode: string,
  description: string,
  postings: readonly JournalPosting[],
): FinancialActionApplication {
  const ledger = appendTransaction(state.ledger, {
    id: `txn.${commandId}`,
    commandId,
    effectiveMonth,
    reasonCode,
    description,
    postings,
  });
  return {
    ledger,
    finances: reconcileFinancesWithLedger(state.finances, ledger),
  };
}

function applyInvestCash(
  state: GameState,
  commandId: string,
  effectiveMonth: SimulationMonth,
  amountCents: MoneyCents,
): FinancialActionApplication {
  assertPositive(amountCents, "investment amount");
  if (amountCents > state.finances.cashCents) {
    throw new FinancialActionError(
      "INSUFFICIENT_CASH",
      "investment amount exceeds available cash",
    );
  }
  return appendActionTransaction(
    state,
    commandId,
    effectiveMonth,
    "invest_cash",
    "Move cash into taxable investments",
    [debit("asset.taxable_investments", amountCents), credit("asset.cash", amountCents)],
  );
}

function applyLiquidation(
  state: GameState,
  commandId: string,
  effectiveMonth: SimulationMonth,
  amountCents: MoneyCents,
  costRatePpm: RatePpm,
): FinancialActionApplication {
  assertPositive(amountCents, "liquidation amount");
  assertRate(costRatePpm, "liquidation cost rate");
  if (amountCents > state.finances.taxableInvestmentsCents) {
    throw new FinancialActionError(
      "INSUFFICIENT_INVESTMENTS",
      "liquidation exceeds taxable investments",
    );
  }
  const costCents = multiplyMoneyByRate(amountCents, costRatePpm);
  const proceedsCents = subtractMoney(amountCents, costCents);
  const postings: JournalPosting[] = [
    credit("asset.taxable_investments", amountCents),
  ];
  if (proceedsCents > 0) postings.push(debit("asset.cash", proceedsCents));
  if (costCents > 0) postings.push(debit("expense.living", costCents));
  return appendActionTransaction(
    state,
    commandId,
    effectiveMonth,
    "liquidate_taxable_investments",
    "Liquidate taxable investments",
    postings,
  );
}

function applyCreditPayment(
  state: GameState,
  commandId: string,
  effectiveMonth: SimulationMonth,
  amountCents: MoneyCents,
): FinancialActionApplication {
  assertPositive(amountCents, "credit payment");
  if (amountCents > state.finances.cashCents) {
    throw new FinancialActionError(
      "INSUFFICIENT_CASH",
      "credit payment exceeds available cash",
    );
  }
  if (amountCents > state.finances.creditUsedCents) {
    throw new FinancialActionError(
      "CREDIT_PAYMENT_EXCEEDED",
      "credit payment exceeds credit used",
    );
  }
  return appendActionTransaction(
    state,
    commandId,
    effectiveMonth,
    "pay_credit",
    "Pay down revolving credit",
    [debit("liability.credit", amountCents), credit("asset.cash", amountCents)],
  );
}

function applyCreditDraw(
  state: GameState,
  commandId: string,
  effectiveMonth: SimulationMonth,
  amountCents: MoneyCents,
): FinancialActionApplication {
  assertPositive(amountCents, "credit draw");
  const remainingCredit = subtractMoney(
    state.finances.creditLimitCents,
    state.finances.creditUsedCents,
  );
  if (amountCents > remainingCredit) {
    throw new FinancialActionError(
      "CREDIT_LIMIT_EXCEEDED",
      "credit draw exceeds remaining credit",
    );
  }
  return appendActionTransaction(
    state,
    commandId,
    effectiveMonth,
    "draw_credit",
    "Draw revolving credit",
    [debit("asset.cash", amountCents), credit("liability.credit", amountCents)],
  );
}

function applyRetirementWithdrawal(
  state: GameState,
  commandId: string,
  effectiveMonth: SimulationMonth,
  action: Extract<FinancialAction, { type: "withdraw_retirement" }>,
): FinancialActionApplication {
  assertPositive(action.grossAmountCents, "retirement withdrawal");
  assertRate(action.withholdingRatePpm, "withholding rate");
  assertRate(action.penaltyRatePpm, "penalty rate");
  if (action.withholdingRatePpm + action.penaltyRatePpm > 1_000_000) {
    throw new FinancialActionError(
      "INVALID_RATE",
      "combined retirement withholding and penalty must not exceed 100%",
    );
  }
  if (action.grossAmountCents > state.finances.retirementCents) {
    throw new FinancialActionError(
      "INSUFFICIENT_RETIREMENT",
      "withdrawal exceeds retirement assets",
    );
  }
  const combinedCostRate = ratePpm(
    action.withholdingRatePpm + action.penaltyRatePpm,
  );
  const totalCost = multiplyMoneyByRate(
    action.grossAmountCents,
    combinedCostRate,
  );
  const proceeds = subtractMoney(action.grossAmountCents, totalCost);
  const postings: JournalPosting[] = [
    credit("asset.retirement", action.grossAmountCents),
  ];
  if (proceeds > 0) postings.push(debit("asset.cash", proceeds));
  if (totalCost > 0) postings.push(debit("expense.tax", totalCost));
  return appendActionTransaction(
    state,
    commandId,
    effectiveMonth,
    "withdraw_retirement",
    "Withdraw retirement assets with taxes and penalties",
    postings,
  );
}

function applyHomeSale(
  state: GameState,
  commandId: string,
  effectiveMonth: SimulationMonth,
  action: Extract<FinancialAction, { type: "sell_home" }>,
): FinancialActionApplication {
  assertPositive(action.salePriceCents, "home sale price");
  assertNonNegative(
    action.nonCreditLiabilityPayoffCents,
    "non-credit liability payoff",
  );
  assertRate(action.transactionCostRatePpm, "home transaction cost rate");
  if (state.finances.homeValueCents <= 0) {
    throw new FinancialActionError("NO_HOME_TO_SELL", "there is no home to sell");
  }
  if (
    action.nonCreditLiabilityPayoffCents >
    state.finances.nonCreditLiabilitiesCents
  ) {
    throw new FinancialActionError(
      "LIABILITY_PAYOFF_EXCEEDED",
      "home payoff exceeds non-credit liabilities",
    );
  }

  const cost = multiplyMoneyByRate(
    action.salePriceCents,
    action.transactionCostRatePpm,
  );
  const cashDelta = subtractMoney(
    subtractMoney(action.salePriceCents, cost),
    action.nonCreditLiabilityPayoffCents,
  );
  if (addMoney(state.finances.cashCents, cashDelta) < 0) {
    throw new FinancialActionError(
      "INSUFFICIENT_CASH",
      "available cash cannot cover home closing costs and liability payoff",
    );
  }

  const postings: JournalPosting[] = [
    credit("asset.home", state.finances.homeValueCents),
  ];
  const cashPosting = postingForAssetDelta("asset.cash", cashDelta);
  if (cashPosting) postings.push(cashPosting);
  if (action.nonCreditLiabilityPayoffCents > 0) {
    postings.push(
      debit("liability.non_credit", action.nonCreditLiabilityPayoffCents),
    );
  }
  if (cost > 0) postings.push(debit("expense.living", cost));

  const debits = postings.reduce(
    (total, posting) => total + BigInt(posting.debitCents),
    BigInt(0),
  );
  const credits = postings.reduce(
    (total, posting) => total + BigInt(posting.creditCents),
    BigInt(0),
  );
  if (debits > credits) {
    postings.push(
      credit(
        "equity.adjustment",
        moneyCents(
          safeBigIntToNumber(debits - credits, "home sale equity credit"),
        ),
      ),
    );
  } else if (credits > debits) {
    postings.push(
      debit(
        "equity.adjustment",
        moneyCents(
          safeBigIntToNumber(credits - debits, "home sale equity debit"),
        ),
      ),
    );
  }

  return appendActionTransaction(
    state,
    commandId,
    effectiveMonth,
    "sell_home",
    "Sell home, pay closing costs, and settle secured liabilities",
    postings,
  );
}

export function applyFinancialAction(
  state: GameState,
  commandId: string,
  effectiveMonth: SimulationMonth,
  action: FinancialAction,
): FinancialActionApplication {
  switch (action.type) {
    case "invest_cash":
      return applyInvestCash(state, commandId, effectiveMonth, action.amountCents);
    case "liquidate_taxable_investments":
      return applyLiquidation(
        state,
        commandId,
        effectiveMonth,
        action.amountCents,
        action.liquidationCostRatePpm,
      );
    case "pay_credit":
      return applyCreditPayment(state, commandId, effectiveMonth, action.amountCents);
    case "draw_credit":
      return applyCreditDraw(state, commandId, effectiveMonth, action.amountCents);
    case "withdraw_retirement":
      return applyRetirementWithdrawal(state, commandId, effectiveMonth, action);
    case "sell_home":
      return applyHomeSale(state, commandId, effectiveMonth, action);
    case "set_annual_living_cost":
      assertNonNegative(action.annualLivingCostCents, "annual living cost");
      if (action.annualLivingCostCents > state.finances.annualLivingCostCents) {
        throw new FinancialActionError(
          "BUDGET_INCREASE_NOT_ALLOWED",
          "budget action may only maintain or reduce annual living costs",
        );
      }
      return {
        ledger: state.ledger,
        finances: {
          ...state.finances,
          annualLivingCostCents: action.annualLivingCostCents,
        },
      };
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
