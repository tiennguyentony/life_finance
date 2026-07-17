import {
  addMoney,
  moneyCents,
  multiplyMoneyByRate,
  subtractMoney,
} from "./domain/money";
import { safeBigIntToNumber } from "./domain/integer";
import {
  addMonths,
  compareMonths,
  monthsBetween,
} from "./domain/month";
import { applyDebtPaymentV2 } from "./debt-service-v2";
import {
  finalizeGameStateV2,
  type GameStateV2,
  type PortfolioBreakdown,
} from "./game-state-v2";
import type { GameStateV2ValidationOptions } from "./game-state-v2-validation";
import type { JournalPosting } from "./ledger";
import { getUpskillProgram } from "../data/upskill-programs";
import type { ResolvedDetailedActionPolicyV2 } from "./action-policy-v2";

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
  validateEnvelope,
} from "./detailed-actions-v2-support";
import {
  applyHomePurchase,
  applyHomeRefinance,
  applyHomeSale,
} from "./detailed-actions-v2-housing";
import { applyLivingCostPlanChangeV2 } from "./financial-living-cost-plan-v2";

export {
  DETAILED_FINANCE_COMMAND_SCHEMA_VERSION,
  DetailedFinanceError,
  type DetailedFinanceCommand,
  type DetailedFinancialAction,
} from "./detailed-actions-v2-contracts";

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
  policy: ResolvedDetailedActionPolicyV2,
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
    policy.taxableLiquidationCostRatePpm,
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
  const nextDebt = applyDebtPaymentV2(
    debt,
    moneyCents(0),
    action.amountCents,
  ).debt;
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
    nextDebt.minimumPaymentCents,
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
  policy: ResolvedDetailedActionPolicyV2,
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
    policy.retirementWithholdingRatePpm,
  );
  const ageMonths = monthsBetween(state.player.birthMonth, state.currentMonth);
  const penalty =
    ageMonths < policy.earlyRetirementAgeMonths
      ? multiplyMoneyByRate(
          action.amountCents,
          policy.earlyRetirementPenaltyRatePpm,
        )
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
  try {
    const application = applyLivingCostPlanChangeV2(state.finances, delta);
    return accept(state, command, {
      finances: application.finances,
    });
  } catch {
    throw new DetailedFinanceError(
      "LIFESTYLE_OUT_OF_RANGE",
      "lifestyle change cannot make living cost or obligations negative",
    );
  }
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

export function completeCareerDevelopmentV2(
  state: GameStateV2,
  validationOptions: GameStateV2ValidationOptions = {},
): GameStateV2 {
  const retainedStories = state.gameplay.eventLifecycle.macroStories.filter(
    ({ expiresMonth }) => compareMonths(expiresMonth, state.currentMonth) >= 0,
  );
  const working: GameStateV2 = {
    ...state,
    gameplay: {
      ...state.gameplay,
      eventLifecycle: {
        ...state.gameplay.eventLifecycle,
        macroStories: retainedStories,
        activeStoryIds: retainedStories.map(({ storyId }) => storyId),
      },
    },
  };
  const completed = working.gameplay.careerDevelopment.pending.filter(
    ({ completesMonth }) => completesMonth === working.currentMonth,
  );
  if (completed.length === 0) {
    return finalizeGameStateV2(working, validationOptions);
  }
  if (working.gameplay.employment.status !== "employed") {
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
    ...working,
    gameplay: {
      ...working.gameplay,
      employment: {
        ...working.gameplay.employment,
        annualGrossSalaryCents: addMoney(
          working.gameplay.employment.annualGrossSalaryCents,
          salaryIncrease,
        ),
      },
      careerDevelopment: {
        pending: working.gameplay.careerDevelopment.pending.filter(
          ({ completesMonth }) => completesMonth !== working.currentMonth,
        ),
        history: [
          ...working.gameplay.careerDevelopment.history,
          ...completed.map((entry) => ({
            commandId: entry.commandId,
            programId: entry.programId,
            catalogVersion: entry.catalogVersion,
            startedMonth: entry.startedMonth,
            completedMonth: working.currentMonth,
            annualSalaryIncreaseCents: entry.annualSalaryIncreaseCents,
          })),
        ],
      },
    },
  }, validationOptions);
}

export function reduceDetailedFinanceCommand(
  state: GameStateV2,
  command: DetailedFinanceCommand,
): GameStateV2 {
  const policy = validateEnvelope(state, command);
  switch (command.payload.action.type) {
    case "invest_taxable":
      return applyInvestTaxable(state, command, command.payload.action);
    case "liquidate_taxable":
      return applyLiquidateTaxable(
        state,
        command,
        command.payload.action,
        policy,
      );
    case "contribute_ira":
    case "contribute_hsa":
      return applyContribution(state, command, command.payload.action);
    case "pay_term_debt":
      return applyTermDebtPayment(state, command, command.payload.action);
    case "pay_revolving_credit":
    case "draw_revolving_credit":
      return applyRevolvingCredit(state, command, command.payload.action);
    case "withdraw_retirement":
      return applyRetirementWithdrawal(
        state,
        command,
        command.payload.action,
        policy,
      );
    case "purchase_home":
      return applyHomePurchase(state, command, command.payload.action, policy);
    case "sell_home":
      return applyHomeSale(state, command, policy);
    case "refinance_home":
      return applyHomeRefinance(state, command, command.payload.action, policy);
    case "change_lifestyle":
      return applyLifestyleChange(state, command, command.payload.action);
    case "start_upskill":
      return applyStartUpskill(state, command, command.payload.action);
  }
}
