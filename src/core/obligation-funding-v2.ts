import { safeBigIntToNumber } from "./domain/integer";
import {
  addMoney,
  moneyCents,
  multiplyMoneyByRate,
  subtractMoney,
  type MoneyCents,
  type RatePpm,
} from "./domain/money";
import { calculateRemainingCredit, reconcileFinancesWithLedger } from "./game-state";
import {
  finalizeGameStateV2,
  type GameStateV2,
  type PortfolioBreakdown,
} from "./game-state-v2";
import { appendTransaction, type JournalPosting } from "./ledger";

export type V2LiquidityAssessment = Readonly<{
  requiredCashCents: MoneyCents;
  cashAvailableCents: MoneyCents;
  taxableLiquidationValueCents: MoneyCents;
  remainingCreditCents: MoneyCents;
  totalAutomaticLiquidityCents: MoneyCents;
  shortfallCents: MoneyCents;
  isBankrupt: boolean;
}>;

export type V2FundingRecord = Readonly<{
  grossLiquidationCents: MoneyCents;
  liquidationCostCents: MoneyCents;
  netLiquidationProceedsCents: MoneyCents;
  creditDrawnCents: MoneyCents;
  liquidatedBuckets: Readonly<
    Pick<
      PortfolioBreakdown,
      | "taxableLegacyUnclassifiedCents"
      | "taxableSpeculativeCents"
      | "taxableSectorCents"
      | "taxableBroadIndexCents"
    >
  >;
}>;

export class ObligationFundingV2Error extends Error {
  readonly code:
    | "INVALID_AMOUNT"
    | "INVALID_RATE"
    | "INVALID_COMMAND_ID"
    | "INSUFFICIENT_LIQUIDITY";

  constructor(code: ObligationFundingV2Error["code"], message: string) {
    super(message);
    this.name = "ObligationFundingV2Error";
    this.code = code;
  }
}

const COMMAND_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,95}$/;
const BUCKET_ORDER = [
  "taxableLegacyUnclassifiedCents",
  "taxableSpeculativeCents",
  "taxableSectorCents",
  "taxableBroadIndexCents",
] as const;

function assertInputs(requiredCashCents: MoneyCents, rate: RatePpm): void {
  if (!Number.isSafeInteger(requiredCashCents) || requiredCashCents < 0) {
    throw new ObligationFundingV2Error(
      "INVALID_AMOUNT",
      "required cash must be non-negative safe integer cents",
    );
  }
  if (!Number.isSafeInteger(rate) || rate < 0 || rate > 1_000_000) {
    throw new ObligationFundingV2Error(
      "INVALID_RATE",
      "liquidation cost must be 0..1,000,000 PPM",
    );
  }
}

function netValue(gross: MoneyCents, rate: RatePpm): MoneyCents {
  return subtractMoney(gross, multiplyMoneyByRate(gross, rate));
}

export function assessV2Liquidity(
  state: GameStateV2,
  requiredCashCents: MoneyCents,
  liquidationCostRatePpm: RatePpm,
): V2LiquidityAssessment {
  assertInputs(requiredCashCents, liquidationCostRatePpm);
  const taxableLiquidationValueCents = netValue(
    state.finances.taxableInvestmentsCents,
    liquidationCostRatePpm,
  );
  const remainingCreditCents = calculateRemainingCredit(state.finances);
  const totalAutomaticLiquidityCents = moneyCents(
    safeBigIntToNumber(
      BigInt(state.finances.cashCents) +
        BigInt(taxableLiquidationValueCents) +
        BigInt(remainingCreditCents),
      "v2 automatic liquidity",
    ),
  );
  const shortfallCents = moneyCents(
    Math.max(0, requiredCashCents - totalAutomaticLiquidityCents),
  );
  return Object.freeze({
    requiredCashCents,
    cashAvailableCents: state.finances.cashCents,
    taxableLiquidationValueCents,
    remainingCreditCents,
    totalAutomaticLiquidityCents,
    shortfallCents,
    isBankrupt: shortfallCents > 0,
  });
}

function minimumGrossLiquidation(
  requiredNet: MoneyCents,
  maximumGross: MoneyCents,
  rate: RatePpm,
): MoneyCents {
  if (requiredNet === 0) return moneyCents(0);
  let low = 1;
  let high: number = maximumGross;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (netValue(moneyCents(middle), rate) >= requiredNet) high = middle;
    else low = middle + 1;
  }
  return moneyCents(low);
}

function debit(accountId: string, amountCents: MoneyCents): JournalPosting {
  return { accountId, debitCents: amountCents, creditCents: moneyCents(0) };
}

function credit(accountId: string, amountCents: MoneyCents): JournalPosting {
  return { accountId, debitCents: moneyCents(0), creditCents: amountCents };
}

export function prepareV2ObligationCash(
  state: GameStateV2,
  commandId: string,
  requiredCashCents: MoneyCents,
  liquidationCostRatePpm: RatePpm,
): Readonly<{
  state: GameStateV2;
  assessment: V2LiquidityAssessment;
  funding: V2FundingRecord;
}> {
  if (!COMMAND_ID.test(commandId)) {
    throw new ObligationFundingV2Error(
      "INVALID_COMMAND_ID",
      "funding command id must be a safe identifier",
    );
  }
  const assessment = assessV2Liquidity(
    state,
    requiredCashCents,
    liquidationCostRatePpm,
  );
  if (assessment.isBankrupt) {
    throw new ObligationFundingV2Error(
      "INSUFFICIENT_LIQUIDITY",
      "cash, taxable liquidation value, and remaining credit cannot fund obligations",
    );
  }
  const cashShortfall = moneyCents(
    Math.max(0, requiredCashCents - state.finances.cashCents),
  );
  const netNeededFromInvestments = moneyCents(
    Math.min(cashShortfall, assessment.taxableLiquidationValueCents),
  );
  const grossLiquidationCents = minimumGrossLiquidation(
    netNeededFromInvestments,
    state.finances.taxableInvestmentsCents,
    liquidationCostRatePpm,
  );
  const netLiquidationProceedsCents = netValue(
    grossLiquidationCents,
    liquidationCostRatePpm,
  );
  const liquidationCostCents = subtractMoney(
    grossLiquidationCents,
    netLiquidationProceedsCents,
  );
  const remainingAfterInvestments = moneyCents(
    Math.max(0, cashShortfall - netLiquidationProceedsCents),
  );
  const creditDrawnCents = remainingAfterInvestments;

  let remainingGross = grossLiquidationCents;
  const nextPortfolio = { ...state.gameplay.portfolio };
  const liquidated = {
    taxableLegacyUnclassifiedCents: moneyCents(0),
    taxableSpeculativeCents: moneyCents(0),
    taxableSectorCents: moneyCents(0),
    taxableBroadIndexCents: moneyCents(0),
  };
  for (const bucket of BUCKET_ORDER) {
    const amount = moneyCents(
      Math.min(remainingGross, state.gameplay.portfolio[bucket]),
    );
    liquidated[bucket] = amount;
    nextPortfolio[bucket] = subtractMoney(nextPortfolio[bucket], amount);
    remainingGross = subtractMoney(remainingGross, amount);
  }
  if (remainingGross !== 0) {
    throw new ObligationFundingV2Error(
      "INSUFFICIENT_LIQUIDITY",
      "detailed taxable buckets do not reconcile to aggregate liquidity",
    );
  }

  let ledger = state.ledger;
  if (grossLiquidationCents > 0 || creditDrawnCents > 0) {
    const cashRaised = addMoney(
      netLiquidationProceedsCents,
      creditDrawnCents,
    );
    const postings: JournalPosting[] = [debit("asset.cash", cashRaised)];
    if (liquidationCostCents > 0) {
      postings.push(debit("expense.living", liquidationCostCents));
    }
    if (grossLiquidationCents > 0) {
      postings.push(
        credit("asset.taxable_investments", grossLiquidationCents),
      );
    }
    if (creditDrawnCents > 0) {
      postings.push(credit("liability.credit", creditDrawnCents));
    }
    ledger = appendTransaction(ledger, {
      id: `txn.${commandId}.liquidity`,
      commandId,
      effectiveMonth: state.currentMonth,
      reasonCode: "prepare_v2_obligation_cash",
      description: "Raise obligation cash from taxable assets then revolving credit",
      sourceSystem: "obligation_funding_v2",
      category: "liquidity.obligation_funding",
      causalReference: {
        kind: "command",
        id: commandId,
      },
      postings,
    });
  }
  const finances = reconcileFinancesWithLedger(state.finances, ledger);
  const nextState = finalizeGameStateV2({
    ...state,
    ledger,
    finances,
    gameplay: {
      ...state.gameplay,
      portfolio: nextPortfolio,
      debts: {
        ...state.gameplay.debts,
        revolvingCreditUsedCents: addMoney(
          state.gameplay.debts.revolvingCreditUsedCents,
          creditDrawnCents,
        ),
      },
    },
  });
  return Object.freeze({
    state: nextState,
    assessment,
    funding: Object.freeze({
      grossLiquidationCents,
      liquidationCostCents,
      netLiquidationProceedsCents,
      creditDrawnCents,
      liquidatedBuckets: Object.freeze(liquidated),
    }),
  });
}
