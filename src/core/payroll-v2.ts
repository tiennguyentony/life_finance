import { safeBigIntToNumber } from "./domain/integer";
import {
  addMoney,
  allocateMoney,
  moneyCents,
  type MoneyCents,
} from "./domain/money";
import { reconcileFinancesWithLedger } from "./game-state";
import { finalizeGameStateV2, type GameStateV2 } from "./game-state-v2";
import { appendTransaction, type JournalPosting } from "./ledger";
import {
  planRecurringAllocations,
  type RecurringAllocationPlan,
} from "./recurring-strategy-v2";

export type MonthlyTaxEvidence = Readonly<{
  schemaVersion: 1;
  traceId: string;
  contextFingerprint?: string;
  economicYear: number;
  policyYear: number;
  stateCode: string;
  filingStatus: string;
  provider: "PolicyEngine US";
  bundleVersion: string;
  rulesVersion: string;
  projectedFromFrozenPolicy: boolean;
  grossIncomeCents: MoneyCents;
  employee401kContributionCents: MoneyCents;
  employeeHsaContributionCents: MoneyCents;
  totalTaxCents: number;
  afterTaxCashIncomeCents: MoneyCents;
}>;

export type MonthlyPayrollResult = Readonly<{
  state: GameStateV2;
  allocationPlan: RecurringAllocationPlan;
  evidence: MonthlyTaxEvidence;
}>;

export class PayrollV2Error extends Error {
  readonly code:
    | "INVALID_COMMAND_ID"
    | "INVALID_TAX_EVIDENCE"
    | "TAX_CONTEXT_MISMATCH"
    | "STRATEGY_TAX_MISMATCH"
    | "LEGACY_POLICY_UNKNOWN";

  constructor(code: PayrollV2Error["code"], message: string) {
    super(message);
    this.name = "PayrollV2Error";
    this.code = code;
  }
}

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

function debit(accountId: string, amountCents: MoneyCents): JournalPosting {
  return { accountId, debitCents: amountCents, creditCents: moneyCents(0) };
}

function credit(accountId: string, amountCents: MoneyCents): JournalPosting {
  return { accountId, debitCents: moneyCents(0), creditCents: amountCents };
}

function validateEvidenceShape(evidence: MonthlyTaxEvidence): void {
  const nonNegative = [
    evidence.grossIncomeCents,
    evidence.employee401kContributionCents,
    evidence.employeeHsaContributionCents,
    evidence.afterTaxCashIncomeCents,
  ];
  if (
    evidence.schemaVersion !== 1 ||
    !SAFE_ID.test(evidence.traceId) ||
    (evidence.contextFingerprint !== undefined &&
      !/^[0-9a-f]{64}$/.test(evidence.contextFingerprint)) ||
    !Number.isSafeInteger(evidence.economicYear) ||
    !Number.isSafeInteger(evidence.policyYear) ||
    evidence.provider !== "PolicyEngine US" ||
    evidence.bundleVersion.length === 0 ||
    evidence.rulesVersion.length === 0 ||
    !Number.isSafeInteger(evidence.totalTaxCents) ||
    nonNegative.some((value) => !Number.isSafeInteger(value) || value < 0)
  ) {
    throw new PayrollV2Error(
      "INVALID_TAX_EVIDENCE",
      "monthly tax evidence violates its versioned shape",
    );
  }
  const expectedCash =
    BigInt(evidence.grossIncomeCents) -
    BigInt(evidence.employee401kContributionCents) -
    BigInt(evidence.employeeHsaContributionCents) -
    BigInt(evidence.totalTaxCents);
  if (
    expectedCash < BigInt(0) ||
    safeBigIntToNumber(expectedCash, "monthly after-tax cash") !==
      evidence.afterTaxCashIncomeCents
  ) {
    throw new PayrollV2Error(
      "INVALID_TAX_EVIDENCE",
      "after-tax cash must equal gross less pre-tax contributions and modeled tax",
    );
  }
}

export function applyMonthlyPayroll(
  state: GameStateV2,
  commandId: string,
  evidence: MonthlyTaxEvidence,
): MonthlyPayrollResult {
  if (!SAFE_ID.test(commandId)) {
    throw new PayrollV2Error(
      "INVALID_COMMAND_ID",
      "payroll command id must be a safe identifier",
    );
  }
  validateEvidenceShape(evidence);
  const snapshot = state.gameplay.catalogSnapshot;
  const employment = state.gameplay.employment;
  if (!snapshot || employment.status !== "employed") {
    throw new PayrollV2Error(
      "LEGACY_POLICY_UNKNOWN",
      "payroll requires native employment and catalog policy",
    );
  }
  const expectedGross = allocateMoney(
    employment.annualGrossSalaryCents,
    1,
    12,
  );
  if (
    evidence.economicYear !== Number(state.currentMonth.slice(0, 4)) ||
    evidence.policyYear !== snapshot.selected.benefitPolicy.policyYear ||
    evidence.stateCode !== snapshot.derived.stateCode ||
    evidence.filingStatus !== snapshot.derived.filingStatus ||
    evidence.grossIncomeCents !== expectedGross
  ) {
    throw new PayrollV2Error(
      "TAX_CONTEXT_MISMATCH",
      "tax evidence does not match the run month, policy, jurisdiction, filing status, and salary",
    );
  }
  const allocationPlan = planRecurringAllocations(
    state,
    evidence.grossIncomeCents,
    moneyCents(0),
  );
  if (
    allocationPlan.preTax.employee401kCents !==
      evidence.employee401kContributionCents ||
    allocationPlan.preTax.hsaCents !== evidence.employeeHsaContributionCents
  ) {
    throw new PayrollV2Error(
      "STRATEGY_TAX_MISMATCH",
      "persisted tax evidence must use the authoritative recurring pre-tax plan",
    );
  }

  const postings: JournalPosting[] = [];
  if (evidence.afterTaxCashIncomeCents > 0) {
    postings.push(debit("asset.cash", evidence.afterTaxCashIncomeCents));
  }
  const retirementDeposit = addMoney(
    evidence.employee401kContributionCents,
    allocationPlan.preTax.employer401kMatchCents,
  );
  if (retirementDeposit > 0) {
    postings.push(debit("asset.retirement", retirementDeposit));
  }
  if (evidence.employeeHsaContributionCents > 0) {
    postings.push(
      debit("asset.other_investable", evidence.employeeHsaContributionCents),
    );
  }
  if (evidence.totalTaxCents > 0) {
    postings.push(debit("expense.tax", moneyCents(evidence.totalTaxCents)));
  } else if (evidence.totalTaxCents < 0) {
    postings.push(credit("expense.tax", moneyCents(-evidence.totalTaxCents)));
  }
  postings.push(credit("income.employment", evidence.grossIncomeCents));
  if (allocationPlan.preTax.employer401kMatchCents > 0) {
    postings.push(
      credit("income.other", allocationPlan.preTax.employer401kMatchCents),
    );
  }
  const ledger = appendTransaction(state.ledger, {
    id: `txn.${commandId}.payroll`,
    commandId,
    effectiveMonth: state.currentMonth,
    reasonCode: "monthly_payroll_v2",
    description: `Apply persisted payroll tax evidence ${evidence.traceId}`,
    postings,
  });
  const finances = reconcileFinancesWithLedger(state.finances, ledger);
  const nextState = finalizeGameStateV2({
    ...state,
    ledger,
    finances,
    gameplay: {
      ...state.gameplay,
      portfolio: {
        ...state.gameplay.portfolio,
        retirement401kCents: addMoney(
          state.gameplay.portfolio.retirement401kCents,
          retirementDeposit,
        ),
        hsaCents: addMoney(
          state.gameplay.portfolio.hsaCents,
          evidence.employeeHsaContributionCents,
        ),
      },
      contributions: {
        ...state.gameplay.contributions,
        employee401kCents: addMoney(
          state.gameplay.contributions.employee401kCents,
          evidence.employee401kContributionCents,
        ),
        employer401kCents: addMoney(
          state.gameplay.contributions.employer401kCents,
          allocationPlan.preTax.employer401kMatchCents,
        ),
        hsaCents: addMoney(
          state.gameplay.contributions.hsaCents,
          evidence.employeeHsaContributionCents,
        ),
      },
    },
  });
  return Object.freeze({ state: nextState, allocationPlan, evidence });
}
