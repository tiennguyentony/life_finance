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
import { monthsBetween, type SimulationMonth } from "./domain/month";
import {
  calculateRemainingCredit,
  reconcileFinancesWithLedger,
  type FinalGrade,
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
  projectFinancialGoal,
  type FinancialGoalV1,
} from "./financial-goals-v2";

export type LiquidityAssessment = Readonly<{
  requiredObligationsCents: MoneyCents;
  cashAvailableCents: MoneyCents;
  taxableInvestmentsGrossCents: MoneyCents;
  taxableLiquidationCostCents: MoneyCents;
  taxableLiquidationValueCents: MoneyCents;
  remainingCreditCents: MoneyCents;
  totalAutomaticLiquidityCents: MoneyCents;
  shortfallCents: MoneyCents;
  isBankrupt: boolean;
}>;

export type ObligationFunding = Readonly<{
  ledger: Ledger;
  finances: FinancialSnapshot;
  cashUsedCents: MoneyCents;
  taxableInvestmentsLiquidatedCents: MoneyCents;
  liquidationCostCents: MoneyCents;
  creditDrawnCents: MoneyCents;
}>;

export class OutcomeDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutcomeDomainError";
  }
}

// Historical v1 outcome compatibility. New v2 financial processing consumes
// the canonical obligation-funding plan and hands its shortfall to outcomes.
function assertLiquidationRate(rate: RatePpm): void {
  if (!Number.isSafeInteger(rate) || rate < 0 || rate > 1_000_000) {
    throw new OutcomeDomainError(
      "taxable liquidation cost rate must be between 0 and 1,000,000 PPM",
    );
  }
}

export function assessRequiredObligationLiquidity(
  finances: FinancialSnapshot,
  taxableLiquidationCostRatePpm: RatePpm,
): LiquidityAssessment {
  assertLiquidationRate(taxableLiquidationCostRatePpm);
  const liquidationCost = multiplyMoneyByRate(
    finances.taxableInvestmentsCents,
    taxableLiquidationCostRatePpm,
  );
  const liquidationValue = subtractMoney(
    finances.taxableInvestmentsCents,
    liquidationCost,
  );
  const remainingCredit = calculateRemainingCredit(finances);
  const totalLiquidity = moneyCents(
    safeBigIntToNumber(
      BigInt(finances.cashCents) +
        BigInt(liquidationValue) +
        BigInt(remainingCredit),
      "bankruptcy liquidity",
    ),
  );
  const shortfall = moneyCents(
    Math.max(0, finances.requiredObligationsCents - totalLiquidity),
  );

  return Object.freeze({
    requiredObligationsCents: finances.requiredObligationsCents,
    cashAvailableCents: finances.cashCents,
    taxableInvestmentsGrossCents: finances.taxableInvestmentsCents,
    taxableLiquidationCostCents: liquidationCost,
    taxableLiquidationValueCents: liquidationValue,
    remainingCreditCents: remainingCredit,
    totalAutomaticLiquidityCents: totalLiquidity,
    shortfallCents: shortfall,
    isBankrupt: shortfall > 0,
  });
}

export function calculateAgeYears(state: GameState): number {
  return Math.floor(
    monthsBetween(state.player.birthMonth, state.currentMonth) / 12,
  );
}

export function gradeRetirementProgress(
  finances: FinancialSnapshot,
  financialGoal?: FinancialGoalV1,
): Exclude<FinalGrade, "S" | "F"> {
  const projection = projectFinancialGoal(finances, financialGoal);
  const investable = BigInt(projection.investableAssetsCents);
  const goal = BigInt(projection.targetCents);

  if (investable * BigInt(100) >= goal * BigInt(80)) return "A";
  if (investable * BigInt(100) >= goal * BigInt(60)) return "B";
  if (investable * BigInt(100) >= goal * BigInt(40)) return "C";
  if (investable * BigInt(100) >= goal * BigInt(20)) return "D";
  return "E";
}

export function evaluateTerminalOutcome(
  state: GameState,
  taxableLiquidationCostRatePpm: RatePpm,
  financialGoal?: FinancialGoalV1,
): GameOutcome | null {
  if (state.outcome) return state.outcome;
  const goalProjection = projectFinancialGoal(state.finances, financialGoal);
  if (goalProjection.investableAssetsCents >= goalProjection.targetCents) {
    const isPlayerSelectedGoal = financialGoal?.source === "player_selected";
    return Object.freeze({
      kind: "financial_independence",
      grade: "S",
      reachedMonth: state.currentMonth,
      reasonCode: isPlayerSelectedGoal
        ? "investable_assets_reached_player_fi_goal"
        : "investable_assets_reached_25x_living_cost",
    });
  }
  const liquidity = assessRequiredObligationLiquidity(
    state.finances,
    taxableLiquidationCostRatePpm,
  );
  if (liquidity.isBankrupt) {
    return Object.freeze({
      kind: "bankruptcy",
      grade: "F",
      reachedMonth: state.currentMonth,
      reasonCode: "required_obligations_exceed_automatic_liquidity",
    });
  }
  const targetAgeYears = financialGoal?.targetAgeYears ?? 65;
  if (calculateAgeYears(state) >= targetAgeYears) {
    const isPlayerSelectedGoal = financialGoal?.source === "player_selected";
    return Object.freeze({
      kind: "retirement_age",
      grade: gradeRetirementProgress(state.finances, financialGoal),
      reachedMonth: state.currentMonth,
      reasonCode: isPlayerSelectedGoal
        ? "reached_player_target_age"
        : "reached_age_65",
    });
  }
  return null;
}

function netLiquidationValueV1Compatibility(
  grossCents: MoneyCents,
  costRatePpm: RatePpm,
): MoneyCents {
  return subtractMoney(
    grossCents,
    multiplyMoneyByRate(grossCents, costRatePpm),
  );
}

function minimumGrossLiquidationV1Compatibility(
  requiredNetCents: MoneyCents,
  maximumGrossCents: MoneyCents,
  costRatePpm: RatePpm,
): MoneyCents {
  if (requiredNetCents <= 0) return moneyCents(0);
  let low = 1;
  let high: number = maximumGrossCents;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (
      netLiquidationValueV1Compatibility(moneyCents(middle), costRatePpm) >=
      requiredNetCents
    ) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return moneyCents(low);
}

function debit(accountId: string, amountCents: MoneyCents): JournalPosting {
  return { accountId, debitCents: amountCents, creditCents: moneyCents(0) };
}

function credit(accountId: string, amountCents: MoneyCents): JournalPosting {
  return { accountId, debitCents: moneyCents(0), creditCents: amountCents };
}

function assetDeltaPosting(
  accountId: string,
  deltaCents: MoneyCents,
): JournalPosting | null {
  if (deltaCents === 0) return null;
  return deltaCents > 0
    ? debit(accountId, deltaCents)
    : credit(accountId, negateMoney(deltaCents));
}

export function fundRequiredObligations(
  state: GameState,
  commandId: string,
  effectiveMonth: SimulationMonth,
  taxableLiquidationCostRatePpm: RatePpm,
  transactionId = `txn.${commandId}`,
): ObligationFunding {
  const assessment = assessRequiredObligationLiquidity(
    state.finances,
    taxableLiquidationCostRatePpm,
  );
  if (assessment.isBankrupt) {
    throw new OutcomeDomainError(
      "required obligations cannot be funded from cash, taxable investments, and credit",
    );
  }
  const required = state.finances.requiredObligationsCents;
  if (required === 0) {
    return Object.freeze({
      ledger: state.ledger,
      finances: state.finances,
      cashUsedCents: moneyCents(0),
      taxableInvestmentsLiquidatedCents: moneyCents(0),
      liquidationCostCents: moneyCents(0),
      creditDrawnCents: moneyCents(0),
    });
  }

  const cashUsed = moneyCents(Math.min(required, state.finances.cashCents));
  let remaining = subtractMoney(required, cashUsed);
  const maximumNetLiquidation = assessment.taxableLiquidationValueCents;
  const netInvestmentsUsed = moneyCents(
    Math.min(remaining, maximumNetLiquidation),
  );
  const grossLiquidation =
    netInvestmentsUsed === 0
      ? moneyCents(0)
      : netInvestmentsUsed === maximumNetLiquidation
        ? state.finances.taxableInvestmentsCents
        : minimumGrossLiquidationV1Compatibility(
            netInvestmentsUsed,
            state.finances.taxableInvestmentsCents,
            taxableLiquidationCostRatePpm,
          );
  const actualNetProceeds = netLiquidationValueV1Compatibility(
    grossLiquidation,
    taxableLiquidationCostRatePpm,
  );
  const liquidationCost = subtractMoney(grossLiquidation, actualNetProceeds);
  remaining = subtractMoney(remaining, netInvestmentsUsed);
  const creditDrawn = remaining;
  const investmentRoundingRemainder = subtractMoney(
    actualNetProceeds,
    netInvestmentsUsed,
  );
  const cashDelta = addMoney(negateMoney(cashUsed), investmentRoundingRemainder);

  const postings: JournalPosting[] = [
    debit("expense.living", addMoney(required, liquidationCost)),
  ];
  const cashPosting = assetDeltaPosting("asset.cash", cashDelta);
  if (cashPosting) postings.push(cashPosting);
  if (grossLiquidation > 0) {
    postings.push(credit("asset.taxable_investments", grossLiquidation));
  }
  if (creditDrawn > 0) {
    postings.push(credit("liability.credit", creditDrawn));
  }

  const ledger = appendTransaction(state.ledger, {
    id: transactionId,
    commandId,
    effectiveMonth,
    reasonCode: "fund_required_obligations",
    description: "Fund required obligations using cash, taxable assets, then credit",
    sourceSystem: "outcome_obligation_funding",
    category: "expense.required_obligations",
    causalReference: {
      kind: "command",
      id: commandId,
    },
    postings,
  });

  return Object.freeze({
    ledger,
    finances: reconcileFinancesWithLedger(state.finances, ledger),
    cashUsedCents: cashUsed,
    taxableInvestmentsLiquidatedCents: grossLiquidation,
    liquidationCostCents: liquidationCost,
    creditDrawnCents: creditDrawn,
  });
}
