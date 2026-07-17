import {
  addMoney,
  moneyCents,
  multiplyMoneyByRate,
  ratePpm,
  subtractMoney,
  type MoneyCents,
  type RatePpm,
} from "./domain/money";
import {
  divideRoundHalfAwayFromZero,
  safeBigIntToNumber,
} from "./domain/integer";
import type { GameStateV2 } from "./game-state-v2";
import type { JournalPosting } from "./ledger";
import { calculateStoredMinimumDebtObligationV2 } from "./debt-service-v2";
import {
  DetailedFinanceError,
  type DetailedFinanceCommand,
  type DetailedFinancialAction,
} from "./detailed-actions-v2-contracts";
import {
  accept,
  appendAction,
  assertPositive,
  credit,
  debit,
  requireCash,
} from "./detailed-actions-v2-support";
import type { ResolvedDetailedActionPolicyV2 } from "./action-policy-v2";

function resolvedMortgageRateV2(
  state: GameStateV2,
  policy: ResolvedDetailedActionPolicyV2,
  requestedRate: RatePpm,
): RatePpm {
  const market = state.gameplay.market;
  if (
    policy.actionPolicyVersion !== null &&
    market.modelVersion === "regime-v2" &&
    market.borrowingRatePpm !== undefined
  ) {
    return ratePpm(
      Math.min(
        500_000,
        market.borrowingRatePpm + policy.newMortgageSpreadPpm,
      ),
    );
  }
  return requestedRate;
}

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

export function applyHomePurchase(
  state: GameStateV2,
  command: DetailedFinanceCommand,
  action: Extract<DetailedFinancialAction, { type: "purchase_home" }>,
  policy: ResolvedDetailedActionPolicyV2,
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
  const mortgageRate = resolvedMortgageRateV2(
    state,
    policy,
    action.mortgageAnnualInterestRatePpm,
  );
  validateMortgageTerms(mortgageRate, action.mortgageTermMonths);
  const closingCost = multiplyMoneyByRate(
    action.purchasePriceCents,
    policy.homePurchaseClosingCostRatePpm,
  );
  const cashRequired = addMoney(action.downPaymentCents, closingCost);
  requireCash(state, cashRequired);
  const principal = subtractMoney(
    action.purchasePriceCents,
    action.downPaymentCents,
  );
  const minimumPayment = amortizedPayment(
    principal,
    mortgageRate,
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
          annualInterestRatePpm: mortgageRate,
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

export function applyHomeSale(
  state: GameStateV2,
  command: DetailedFinanceCommand,
  policy: ResolvedDetailedActionPolicyV2,
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
  const removedMinimums = calculateStoredMinimumDebtObligationV2(mortgages);
  const saleCost = multiplyMoneyByRate(
    homeValue,
    policy.homeSaleCostRatePpm,
  );
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

export function applyHomeRefinance(
  state: GameStateV2,
  command: DetailedFinanceCommand,
  action: Extract<DetailedFinancialAction, { type: "refinance_home" }>,
  policy: ResolvedDetailedActionPolicyV2,
): GameStateV2 {
  if (state.finances.homeValueCents <= 0) {
    throw new DetailedFinanceError("HOME_REQUIRED", "run does not own a home");
  }
  const mortgageRate = resolvedMortgageRateV2(
    state,
    policy,
    action.mortgageAnnualInterestRatePpm,
  );
  validateMortgageTerms(mortgageRate, action.mortgageTermMonths);
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
    policy.homeRefinanceCostRatePpm,
  );
  requireCash(state, closingCost);
  const nextMinimum = amortizedPayment(
    debt.principalCents,
    mortgageRate,
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
    annualInterestRatePpm: mortgageRate,
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
