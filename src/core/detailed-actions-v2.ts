import {
  addMoney,
  moneyCents,
  multiplyMoneyByRate,
  subtractMoney,
  type MoneyCents,
  type RatePpm,
} from "./domain/money";
import { monthsBetween, simulationMonth, type SimulationMonth } from "./domain/month";
import { reconcileFinancesWithLedger } from "./game-state";
import {
  finalizeGameStateV2,
  type GameStateV2,
  type PortfolioBreakdown,
} from "./game-state-v2";
import { appendTransaction, type JournalPosting } from "./ledger";

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
    | "CREDIT_LIMIT_EXCEEDED";

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
  }
}
