import {
  divideRoundHalfAwayFromZero,
  safeBigIntToNumber,
} from "./domain/integer";
import {
  addMoney,
  moneyCents,
  subtractMoney,
  type MoneyCents,
  type RatePpm,
} from "./domain/money";
import { reconcileFinancesWithLedger } from "./game-state";
import {
  finalizeGameStateV2,
  type DebtBreakdown,
  type GameStateV2,
} from "./game-state-v2";
import { appendTransaction, type JournalPosting } from "./ledger";

export type DebtServiceLine = Readonly<{
  debtId: string;
  openingPrincipalCents: MoneyCents;
  interestCents: MoneyCents;
  scheduledPaymentCents: MoneyCents;
  principalPaidCents: MoneyCents;
  closingPrincipalCents: MoneyCents;
  closingMinimumPaymentCents: MoneyCents;
  closingRemainingTermMonths: number;
}>;

export type MonthlyDebtServicePlan = Readonly<{
  lines: readonly DebtServiceLine[];
  totalInterestCents: MoneyCents;
  totalScheduledPaymentCents: MoneyCents;
}>;

export class DebtServiceV2Error extends Error {
  readonly code: "INVALID_DEBT" | "INSUFFICIENT_CASH" | "INVALID_COMMAND_ID";

  constructor(code: DebtServiceV2Error["code"], message: string) {
    super(message);
    this.name = "DebtServiceV2Error";
    this.code = code;
  }
}

const COMMAND_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,95}$/;

function sumMoney(values: readonly MoneyCents[], label: string): MoneyCents {
  return moneyCents(
    safeBigIntToNumber(
      values.reduce((total, value) => total + BigInt(value), BigInt(0)),
      label,
    ),
  );
}

export function calculateMonthlyDebtInterestV2(
  principalCents: MoneyCents,
  annualInterestRatePpm: RatePpm,
): MoneyCents {
  return moneyCents(
    safeBigIntToNumber(
      divideRoundHalfAwayFromZero(
        BigInt(principalCents) * BigInt(annualInterestRatePpm),
        BigInt(12_000_000),
      ),
      "monthly debt interest",
    ),
  );
}

export function calculateTotalMinimumDebtPaymentV2(
  debts: DebtBreakdown["termDebts"],
): MoneyCents {
  return sumMoney(
    debts.map(({ minimumPaymentCents, principalCents }) =>
      moneyCents(Math.min(minimumPaymentCents, principalCents)),
    ),
    "term debt minimum total",
  );
}

export function calculateStoredMinimumDebtObligationV2(
  debts: DebtBreakdown["termDebts"],
): MoneyCents {
  return sumMoney(
    debts.map(({ minimumPaymentCents }) => minimumPaymentCents),
    "stored term debt minimum obligation",
  );
}

export function applyDebtPaymentV2(
  debt: DebtBreakdown["termDebts"][number],
  interestCents: MoneyCents,
  requestedPaymentCents: MoneyCents,
): Readonly<{
  debt: DebtBreakdown["termDebts"][number];
  appliedPaymentCents: MoneyCents;
}> {
  if (
    debt.principalCents < 0 ||
    interestCents < 0 ||
    requestedPaymentCents < 0
  ) {
    throw new DebtServiceV2Error(
      "INVALID_DEBT",
      "debt principal, interest, and requested payment must be non-negative",
    );
  }
  const payoffCents = addMoney(debt.principalCents, interestCents);
  const appliedPaymentCents = moneyCents(
    Math.min(requestedPaymentCents, payoffCents),
  );
  const principalCents = subtractMoney(payoffCents, appliedPaymentCents);
  const nextDebt = Object.freeze({
    ...debt,
    principalCents,
    minimumPaymentCents:
      principalCents === 0
        ? moneyCents(0)
        : moneyCents(Math.min(debt.minimumPaymentCents, principalCents)),
    remainingTermMonths:
      principalCents === 0 ? 0 : debt.remainingTermMonths,
  });
  return Object.freeze({ debt: nextDebt, appliedPaymentCents });
}

export function planMonthlyDebtService(
  state: GameStateV2,
): MonthlyDebtServicePlan {
  const lines = state.gameplay.debts.termDebts
    .filter(({ principalCents }) => principalCents > 0)
    .map((debt): DebtServiceLine => {
      if (
        debt.minimumPaymentCents <= 0 ||
        debt.remainingTermMonths <= 0 ||
        debt.annualInterestRatePpm < 0 ||
        debt.annualInterestRatePpm > 1_000_000
      ) {
        throw new DebtServiceV2Error(
          "INVALID_DEBT",
          `active debt ${debt.id} has invalid payment, term, or rate`,
        );
      }
      const interestCents = calculateMonthlyDebtInterestV2(
        debt.principalCents,
        debt.annualInterestRatePpm,
      );
      const balanceAfterInterest = addMoney(debt.principalCents, interestCents);
      const requestedPaymentCents =
        debt.remainingTermMonths === 1
          ? balanceAfterInterest
          : moneyCents(Math.min(debt.minimumPaymentCents, balanceAfterInterest));
      const payment = applyDebtPaymentV2(
        debt,
        interestCents,
        requestedPaymentCents,
      );
      const scheduledPaymentCents = payment.appliedPaymentCents;
      const closingPrincipalCents = payment.debt.principalCents;
      const principalPaidCents = moneyCents(
        Math.max(0, scheduledPaymentCents - interestCents),
      );
      return Object.freeze({
        debtId: debt.id,
        openingPrincipalCents: debt.principalCents,
        interestCents,
        scheduledPaymentCents,
        principalPaidCents,
        closingPrincipalCents,
        closingMinimumPaymentCents: payment.debt.minimumPaymentCents,
        closingRemainingTermMonths:
          closingPrincipalCents === 0 ? 0 : debt.remainingTermMonths - 1,
      });
    });
  return Object.freeze({
    lines: Object.freeze(lines),
    totalInterestCents: sumMoney(
      lines.map(({ interestCents }) => interestCents),
      "monthly total debt interest",
    ),
    totalScheduledPaymentCents: sumMoney(
      lines.map(({ scheduledPaymentCents }) => scheduledPaymentCents),
      "monthly total debt payments",
    ),
  });
}

function debit(accountId: string, amountCents: MoneyCents): JournalPosting {
  return { accountId, debitCents: amountCents, creditCents: moneyCents(0) };
}

function credit(accountId: string, amountCents: MoneyCents): JournalPosting {
  return { accountId, debitCents: moneyCents(0), creditCents: amountCents };
}

export function settleMonthlyDebtService(
  state: GameStateV2,
  commandId: string,
): Readonly<{ state: GameStateV2; plan: MonthlyDebtServicePlan }> {
  if (!COMMAND_ID.test(commandId)) {
    throw new DebtServiceV2Error(
      "INVALID_COMMAND_ID",
      "debt service command id must be a safe identifier",
    );
  }
  const plan = planMonthlyDebtService(state);
  if (plan.totalScheduledPaymentCents > state.finances.cashCents) {
    throw new DebtServiceV2Error(
      "INSUFFICIENT_CASH",
      "cash must be funded before debt service settles",
    );
  }
  let ledger = state.ledger;
  if (plan.totalInterestCents > 0) {
    ledger = appendTransaction(ledger, {
      id: `txn.${commandId}.debt-interest`,
      commandId,
      effectiveMonth: state.currentMonth,
      reasonCode: "monthly_term_debt_interest",
      description: "Accrue exact monthly interest on active term debts",
      sourceSystem: "debt_service_v2",
      category: "expense.debt_interest",
      causalReference: {
        kind: "command",
        id: commandId,
      },
      postings: [
        debit("expense.interest", plan.totalInterestCents),
        credit("liability.non_credit", plan.totalInterestCents),
      ],
    });
  }
  if (plan.totalScheduledPaymentCents > 0) {
    ledger = appendTransaction(ledger, {
      id: `txn.${commandId}.debt-payment`,
      commandId,
      effectiveMonth: state.currentMonth,
      reasonCode: "monthly_term_debt_payment",
      description: "Pay scheduled principal and interest on active term debts",
      sourceSystem: "debt_service_v2",
      category: "liability.debt_payment",
      causalReference: {
        kind: "command",
        id: commandId,
      },
      postings: [
        debit("liability.non_credit", plan.totalScheduledPaymentCents),
        credit("asset.cash", plan.totalScheduledPaymentCents),
      ],
    });
  }
  const lineById = new Map(plan.lines.map((line) => [line.debtId, line]));
  const nextDebts = state.gameplay.debts.termDebts.map((debt) => {
    const line = lineById.get(debt.id);
    return line
      ? {
          ...debt,
          principalCents: line.closingPrincipalCents,
          minimumPaymentCents: line.closingMinimumPaymentCents,
          remainingTermMonths: line.closingRemainingTermMonths,
        }
      : debt;
  });
  const oldMinimum = calculateStoredMinimumDebtObligationV2(
    state.gameplay.debts.termDebts,
  );
  const nextMinimum = calculateStoredMinimumDebtObligationV2(nextDebts);
  const reconciled = reconcileFinancesWithLedger(state.finances, ledger);
  const requiredWithoutOldMinimum = subtractMoney(
    reconciled.requiredObligationsCents,
    oldMinimum,
  );
  const nextState = finalizeGameStateV2({
    ...state,
    ledger,
    finances: {
      ...reconciled,
      requiredObligationsCents: addMoney(
        requiredWithoutOldMinimum,
        nextMinimum,
      ),
    },
    gameplay: {
      ...state.gameplay,
      debts: { ...state.gameplay.debts, termDebts: nextDebts },
    },
  });
  return Object.freeze({ state: nextState, plan });
}
