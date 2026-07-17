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
import type { GameStateV2ValidationOptions } from "./game-state-v2-validation";
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

export type V2TaxableLiquidation = Readonly<{
  bucket: keyof Pick<
    PortfolioBreakdown,
    | "taxableLegacyUnclassifiedCents"
    | "taxableSpeculativeCents"
    | "taxableSectorCents"
    | "taxableBroadIndexCents"
  >;
  grossCents: MoneyCents;
  costCents: MoneyCents;
  netCents: MoneyCents;
}>;

export type V2ObligationFundingPlan = Readonly<{
  requiredCashCents: MoneyCents;
  cashAvailableCents: MoneyCents;
  cashUsedCents: MoneyCents;
  taxableLiquidations: readonly V2TaxableLiquidation[];
  grossLiquidationCents: MoneyCents;
  liquidationCostCents: MoneyCents;
  netLiquidationProceedsCents: MoneyCents;
  remainingCreditCents: MoneyCents;
  creditUsedCents: MoneyCents;
  residualShortfallCents: MoneyCents;
  fullyFunded: boolean;
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
    | "INSUFFICIENT_LIQUIDITY"
    | "PLAN_MISMATCH";

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

function assertCommandId(commandId: string): void {
  if (!COMMAND_ID.test(commandId)) {
    throw new ObligationFundingV2Error(
      "INVALID_COMMAND_ID",
      "funding command id must be a safe identifier",
    );
  }
}

function assertAmount(amountCents: MoneyCents, label: string): void {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
    throw new ObligationFundingV2Error(
      "INVALID_AMOUNT",
      `${label} must be non-negative safe integer cents`,
    );
  }
}

function assertRate(rate: RatePpm): void {
  if (!Number.isSafeInteger(rate) || rate < 0 || rate > 1_000_000) {
    throw new ObligationFundingV2Error(
      "INVALID_RATE",
      "liquidation cost must be 0..1,000,000 PPM",
    );
  }
}

function assertInputs(requiredCashCents: MoneyCents, rate: RatePpm): void {
  assertAmount(requiredCashCents, "required cash");
  assertRate(rate);
}

export function netTaxableLiquidationValueV2(
  grossCents: MoneyCents,
  costRatePpm: RatePpm,
): MoneyCents {
  assertAmount(grossCents, "gross liquidation");
  assertRate(costRatePpm);
  return subtractMoney(
    grossCents,
    multiplyMoneyByRate(grossCents, costRatePpm),
  );
}

export function minimumGrossTaxableLiquidationV2(
  desiredNetCents: MoneyCents,
  availableGrossCents: MoneyCents,
  costRatePpm: RatePpm,
): MoneyCents {
  assertAmount(desiredNetCents, "desired net liquidation");
  assertAmount(availableGrossCents, "available gross liquidation");
  assertRate(costRatePpm);
  if (desiredNetCents === 0 || availableGrossCents === 0) {
    return moneyCents(0);
  }
  if (
    netTaxableLiquidationValueV2(availableGrossCents, costRatePpm) <
    desiredNetCents
  ) {
    return availableGrossCents;
  }
  let low = 1;
  let high: number = availableGrossCents;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (
      netTaxableLiquidationValueV2(moneyCents(middle), costRatePpm) >=
      desiredNetCents
    ) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return moneyCents(low);
}

function planTaxableLiquidations(
  state: GameStateV2,
  grossLiquidationCents: MoneyCents,
  costRatePpm: RatePpm,
): readonly V2TaxableLiquidation[] {
  const liquidations: V2TaxableLiquidation[] = [];
  let remainingGross = grossLiquidationCents;
  let cumulativeGross = moneyCents(0);
  let cumulativeNet = moneyCents(0);
  for (const bucket of BUCKET_ORDER) {
    const grossCents = moneyCents(
      Math.min(remainingGross, state.gameplay.portfolio[bucket]),
    );
    if (grossCents === 0) continue;
    const nextCumulativeGross = addMoney(cumulativeGross, grossCents);
    const nextCumulativeNet = netTaxableLiquidationValueV2(
      nextCumulativeGross,
      costRatePpm,
    );
    const netCents = subtractMoney(nextCumulativeNet, cumulativeNet);
    liquidations.push(
      Object.freeze({
        bucket,
        grossCents,
        costCents: subtractMoney(grossCents, netCents),
        netCents,
      }),
    );
    remainingGross = subtractMoney(remainingGross, grossCents);
    cumulativeGross = nextCumulativeGross;
    cumulativeNet = nextCumulativeNet;
  }
  if (remainingGross !== 0) {
    throw new ObligationFundingV2Error(
      "INSUFFICIENT_LIQUIDITY",
      "detailed taxable buckets do not reconcile to aggregate liquidity",
    );
  }
  return Object.freeze(liquidations);
}

export function planV2ObligationFunding(
  state: GameStateV2,
  requiredCashCents: MoneyCents,
  costRatePpm: RatePpm,
): V2ObligationFundingPlan {
  assertInputs(requiredCashCents, costRatePpm);
  const cashUsedCents = moneyCents(
    Math.min(requiredCashCents, state.finances.cashCents),
  );
  let remainingCents = subtractMoney(requiredCashCents, cashUsedCents);
  const maximumNetLiquidationCents = netTaxableLiquidationValueV2(
    state.finances.taxableInvestmentsCents,
    costRatePpm,
  );
  const desiredNetLiquidationCents = moneyCents(
    Math.min(remainingCents, maximumNetLiquidationCents),
  );
  const grossLiquidationCents = minimumGrossTaxableLiquidationV2(
    desiredNetLiquidationCents,
    state.finances.taxableInvestmentsCents,
    costRatePpm,
  );
  const netLiquidationProceedsCents = netTaxableLiquidationValueV2(
    grossLiquidationCents,
    costRatePpm,
  );
  const liquidationCostCents = subtractMoney(
    grossLiquidationCents,
    netLiquidationProceedsCents,
  );
  remainingCents = subtractMoney(
    remainingCents,
    netLiquidationProceedsCents,
  );
  const remainingCreditCents = calculateRemainingCredit(state.finances);
  const creditUsedCents = moneyCents(
    Math.min(remainingCents, remainingCreditCents),
  );
  const residualShortfallCents = subtractMoney(
    remainingCents,
    creditUsedCents,
  );

  return Object.freeze({
    requiredCashCents,
    cashAvailableCents: state.finances.cashCents,
    cashUsedCents,
    taxableLiquidations: planTaxableLiquidations(
      state,
      grossLiquidationCents,
      costRatePpm,
    ),
    grossLiquidationCents,
    liquidationCostCents,
    netLiquidationProceedsCents,
    remainingCreditCents,
    creditUsedCents,
    residualShortfallCents,
    fullyFunded: residualShortfallCents === 0,
  });
}

function legacyAssessmentFromPlan(
  state: GameStateV2,
  liquidationCostRatePpm: RatePpm,
  plan: V2ObligationFundingPlan,
): V2LiquidityAssessment {
  const taxableLiquidationValueCents = netTaxableLiquidationValueV2(
    state.finances.taxableInvestmentsCents,
    liquidationCostRatePpm,
  );
  const totalAutomaticLiquidityCents = moneyCents(
    safeBigIntToNumber(
      BigInt(state.finances.cashCents) +
        BigInt(taxableLiquidationValueCents) +
        BigInt(plan.remainingCreditCents),
      "v2 automatic liquidity",
    ),
  );
  return Object.freeze({
    requiredCashCents: plan.requiredCashCents,
    cashAvailableCents: plan.cashAvailableCents,
    taxableLiquidationValueCents,
    remainingCreditCents: plan.remainingCreditCents,
    totalAutomaticLiquidityCents,
    shortfallCents: plan.residualShortfallCents,
    isBankrupt: !plan.fullyFunded,
  });
}

export function assessV2Liquidity(
  state: GameStateV2,
  requiredCashCents: MoneyCents,
  liquidationCostRatePpm: RatePpm,
): V2LiquidityAssessment {
  const plan = planV2ObligationFunding(
    state,
    requiredCashCents,
    liquidationCostRatePpm,
  );
  return legacyAssessmentFromPlan(state, liquidationCostRatePpm, plan);
}

function debit(accountId: string, amountCents: MoneyCents): JournalPosting {
  return { accountId, debitCents: amountCents, creditCents: moneyCents(0) };
}

function credit(accountId: string, amountCents: MoneyCents): JournalPosting {
  return { accountId, debitCents: moneyCents(0), creditCents: amountCents };
}

function planMismatch(message: string): never {
  throw new ObligationFundingV2Error("PLAN_MISMATCH", message);
}

function assertPlanAmount(value: MoneyCents, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    planMismatch(`${label} must be non-negative safe integer cents`);
  }
}

function assertPlanMatchesState(
  state: GameStateV2,
  plan: V2ObligationFundingPlan,
): void {
  const scalarAmounts: readonly [MoneyCents, string][] = [
    [plan.requiredCashCents, "required cash"],
    [plan.cashAvailableCents, "cash available"],
    [plan.cashUsedCents, "cash used"],
    [plan.grossLiquidationCents, "gross liquidation"],
    [plan.liquidationCostCents, "liquidation cost"],
    [plan.netLiquidationProceedsCents, "net liquidation proceeds"],
    [plan.remainingCreditCents, "remaining credit"],
    [plan.creditUsedCents, "credit used"],
    [plan.residualShortfallCents, "residual shortfall"],
  ];
  for (const [value, label] of scalarAmounts) assertPlanAmount(value, label);
  if (plan.cashAvailableCents !== state.finances.cashCents) {
    planMismatch("plan cash available does not match the execution state");
  }
  if (plan.remainingCreditCents !== calculateRemainingCredit(state.finances)) {
    planMismatch("plan remaining credit does not match the execution state");
  }
  if (
    plan.cashUsedCents !==
    Math.min(plan.requiredCashCents, plan.cashAvailableCents)
  ) {
    planMismatch("plan cash use does not match the cash-first waterfall");
  }
  if (!Array.isArray(plan.taxableLiquidations)) {
    planMismatch("plan taxable liquidations must be an array");
  }

  let lineIndex = 0;
  let remainingGross = plan.grossLiquidationCents;
  let lineGross = BigInt(0);
  let lineCost = BigInt(0);
  let lineNet = BigInt(0);
  for (const bucket of BUCKET_ORDER) {
    const expectedGross = moneyCents(
      Math.min(remainingGross, state.gameplay.portfolio[bucket]),
    );
    if (expectedGross === 0) continue;
    const line = plan.taxableLiquidations[lineIndex];
    if (!line || line.bucket !== bucket || line.grossCents !== expectedGross) {
      planMismatch("plan taxable buckets do not match the stable waterfall");
    }
    assertPlanAmount(line.grossCents, `${bucket} gross liquidation`);
    assertPlanAmount(line.costCents, `${bucket} liquidation cost`);
    assertPlanAmount(line.netCents, `${bucket} net proceeds`);
    if (BigInt(line.costCents) + BigInt(line.netCents) !== BigInt(line.grossCents)) {
      planMismatch("plan bucket cost and proceeds do not equal gross sale");
    }
    lineGross += BigInt(line.grossCents);
    lineCost += BigInt(line.costCents);
    lineNet += BigInt(line.netCents);
    remainingGross = subtractMoney(remainingGross, expectedGross);
    lineIndex += 1;
  }
  if (remainingGross !== 0 || lineIndex !== plan.taxableLiquidations.length) {
    planMismatch("plan taxable buckets do not reconcile to gross liquidation");
  }
  if (
    lineGross !== BigInt(plan.grossLiquidationCents) ||
    lineCost !== BigInt(plan.liquidationCostCents) ||
    lineNet !== BigInt(plan.netLiquidationProceedsCents)
  ) {
    planMismatch("plan taxable bucket totals do not match aggregate totals");
  }
  if (
    BigInt(plan.liquidationCostCents) +
      BigInt(plan.netLiquidationProceedsCents) !==
    BigInt(plan.grossLiquidationCents)
  ) {
    planMismatch("plan aggregate cost and proceeds do not equal gross sale");
  }
  if (plan.creditUsedCents > plan.remainingCreditCents) {
    planMismatch("plan credit use exceeds remaining credit");
  }
  if (
    BigInt(plan.cashUsedCents) +
      BigInt(plan.netLiquidationProceedsCents) +
      BigInt(plan.creditUsedCents) !==
      BigInt(plan.requiredCashCents) ||
    plan.residualShortfallCents !== 0 ||
    !plan.fullyFunded
  ) {
    planMismatch("fully funded plan does not exactly cover required cash");
  }
}

function assertExecutionMatchesPlan(
  previousState: GameStateV2,
  nextState: GameStateV2,
  plan: V2ObligationFundingPlan,
): void {
  const expectedCashCents = addMoney(
    previousState.finances.cashCents,
    addMoney(plan.netLiquidationProceedsCents, plan.creditUsedCents),
  );
  const expectedTaxableCents = subtractMoney(
    previousState.finances.taxableInvestmentsCents,
    plan.grossLiquidationCents,
  );
  const expectedCreditUsedCents = addMoney(
    previousState.finances.creditUsedCents,
    plan.creditUsedCents,
  );
  if (
    nextState.finances.cashCents !== expectedCashCents ||
    nextState.finances.taxableInvestmentsCents !== expectedTaxableCents ||
    nextState.finances.creditUsedCents !== expectedCreditUsedCents ||
    nextState.gameplay.debts.revolvingCreditUsedCents !==
      expectedCreditUsedCents
  ) {
    planMismatch("executed financial balances do not match the funding plan");
  }
  const liquidatedByBucket = new Map(
    plan.taxableLiquidations.map(({ bucket, grossCents }) => [bucket, grossCents]),
  );
  for (const bucket of BUCKET_ORDER) {
    const expectedBucketCents = subtractMoney(
      previousState.gameplay.portfolio[bucket],
      liquidatedByBucket.get(bucket) ?? moneyCents(0),
    );
    if (nextState.gameplay.portfolio[bucket] !== expectedBucketCents) {
      planMismatch("executed taxable bucket balances do not match the funding plan");
    }
  }
}

export function executeV2ObligationFunding(
  state: GameStateV2,
  commandId: string,
  plan: V2ObligationFundingPlan,
  validationOptions: GameStateV2ValidationOptions = {},
): Readonly<{ state: GameStateV2; record: V2FundingRecord }> {
  assertCommandId(commandId);
  if (!plan.fullyFunded) {
    throw new ObligationFundingV2Error(
      "INSUFFICIENT_LIQUIDITY",
      "cash, taxable liquidation value, and remaining credit cannot fund obligations",
    );
  }
  assertPlanMatchesState(state, plan);

  const nextPortfolio = { ...state.gameplay.portfolio };
  const liquidatedBuckets = {
    taxableLegacyUnclassifiedCents: moneyCents(0),
    taxableSpeculativeCents: moneyCents(0),
    taxableSectorCents: moneyCents(0),
    taxableBroadIndexCents: moneyCents(0),
  };
  for (const liquidation of plan.taxableLiquidations) {
    liquidatedBuckets[liquidation.bucket] = liquidation.grossCents;
    nextPortfolio[liquidation.bucket] = subtractMoney(
      nextPortfolio[liquidation.bucket],
      liquidation.grossCents,
    );
  }

  let ledger = state.ledger;
  if (plan.grossLiquidationCents > 0 || plan.creditUsedCents > 0) {
    const cashRaised = addMoney(
      plan.netLiquidationProceedsCents,
      plan.creditUsedCents,
    );
    const postings: JournalPosting[] = [debit("asset.cash", cashRaised)];
    if (plan.liquidationCostCents > 0) {
      postings.push(debit("expense.living", plan.liquidationCostCents));
    }
    if (plan.grossLiquidationCents > 0) {
      postings.push(
        credit("asset.taxable_investments", plan.grossLiquidationCents),
      );
    }
    if (plan.creditUsedCents > 0) {
      postings.push(credit("liability.credit", plan.creditUsedCents));
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
          plan.creditUsedCents,
        ),
      },
    },
  }, validationOptions);
  assertExecutionMatchesPlan(state, nextState, plan);
  return Object.freeze({
    state: nextState,
    record: Object.freeze({
      grossLiquidationCents: plan.grossLiquidationCents,
      liquidationCostCents: plan.liquidationCostCents,
      netLiquidationProceedsCents: plan.netLiquidationProceedsCents,
      creditDrawnCents: plan.creditUsedCents,
      liquidatedBuckets: Object.freeze(liquidatedBuckets),
    }),
  });
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
  assertCommandId(commandId);
  const plan = planV2ObligationFunding(
    state,
    requiredCashCents,
    liquidationCostRatePpm,
  );
  const assessment = legacyAssessmentFromPlan(
    state,
    liquidationCostRatePpm,
    plan,
  );
  const executed = executeV2ObligationFunding(state, commandId, plan);
  return Object.freeze({
    state: executed.state,
    assessment,
    funding: executed.record,
  });
}
