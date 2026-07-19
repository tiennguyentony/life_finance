import type { TaxSummaryResponse } from "@/contracts/api/contracts";
import { safeBigIntToNumber } from "@/core/domain/integer";
import type { GameStateV2 } from "@/core/game-state-v2";
import type { V2Repository } from "@/server/api/run-repository-port";

import {
  buildMonthlyTaxEvidenceFromPolicyEngineV1,
  buildTaxRequest,
} from "../api/tax-orchestrator";
import type { TaxCalculator } from "./client";
import { fingerprintAnnualTaxContext } from "./context-cache";

export type TaxSummaryReader = Readonly<{
  getSummary(
    runId: string,
    accessSecret: string,
  ): Promise<TaxSummaryResponse>;
}>;

function sumLedgerAccount(
  state: GameStateV2,
  economicYear: number,
  accountId: string,
): number {
  let total = BigInt(0);
  for (const transaction of state.ledger.transactions) {
    if (
      Number(transaction.effectiveMonth.slice(0, 4)) !== economicYear ||
      transaction.reasonCode !== "monthly_payroll_v2"
    ) {
      continue;
    }
    for (const posting of transaction.postings) {
      if (posting.accountId !== accountId) continue;
      total += BigInt(posting.debitCents) - BigInt(posting.creditCents);
    }
  }
  // Income accounts carry credits, while expense accounts carry debits.
  return safeBigIntToNumber(
    accountId.startsWith("income.") ? -total : total,
    `year-to-date ${accountId}`,
  );
}

function paycheckCount(state: GameStateV2, economicYear: number): number {
  return state.ledger.transactions.filter(
    (transaction) =>
      Number(transaction.effectiveMonth.slice(0, 4)) === economicYear &&
      transaction.reasonCode === "monthly_payroll_v2",
  ).length;
}

export class TaxSummaryService implements TaxSummaryReader {
  readonly #repository: Pick<
    V2Repository,
    "loadAuthorizedRunV2" | "loadMonthlyTaxEvidenceForContext"
  >;
  readonly #calculator: TaxCalculator;

  constructor(
    repository: Pick<
      V2Repository,
      "loadAuthorizedRunV2" | "loadMonthlyTaxEvidenceForContext"
    >,
    calculator: TaxCalculator,
  ) {
    this.#repository = repository;
    this.#calculator = calculator;
  }

  async getSummary(
    runId: string,
    accessSecret: string,
  ): Promise<TaxSummaryResponse> {
    const state = await this.#repository.loadAuthorizedRunV2(runId, accessSecret);
    const commandId = `tax-summary.${state.revision}`;
    const request = buildTaxRequest(state, commandId);
    const cached = await this.#repository.loadMonthlyTaxEvidenceForContext(
      runId,
      accessSecret,
      fingerprintAnnualTaxContext(request),
    );
    const evidence = buildMonthlyTaxEvidenceFromPolicyEngineV1(
      state,
      commandId,
      cached?.breakdown
        ? { kind: "cached", evidence: cached }
        : { kind: "calculated", result: await this.#calculator.calculate(request) },
    );
    const breakdown = evidence.breakdown;
    if (!breakdown) {
      throw new Error("current tax calculation did not provide a breakdown");
    }

    const economicYear = request.economicYear;
    const grossIncomeCents = sumLedgerAccount(
      state,
      economicYear,
      "income.employment",
    );
    const totalTaxCents = sumLedgerAccount(
      state,
      economicYear,
      "expense.tax",
    );
    const contributions = state.gameplay.contributions;
    const employee401kContributionCents =
      contributions.policyYear === economicYear
        ? contributions.employee401kCents
        : 0;
    const employeeHsaContributionCents =
      contributions.policyYear === economicYear ? contributions.hsaCents : 0;
    const afterTaxCashIncomeCents =
      grossIncomeCents -
      employee401kContributionCents -
      employeeHsaContributionCents -
      totalTaxCents;

    return Object.freeze({
      status: "available" as const,
      asOfMonth: state.currentMonth,
      jurisdiction: Object.freeze({
        stateCode: request.stateCode,
        filingStatus: request.filingStatus,
        economicYear,
        policyYear: request.policyYear,
      }),
      paycheckEstimate: Object.freeze({
        grossIncomeCents: evidence.grossIncomeCents,
        employee401kContributionCents: evidence.employee401kContributionCents,
        employeeHsaContributionCents: evidence.employeeHsaContributionCents,
        federalIncomeTaxCents: breakdown.monthlyFederalIncomeTaxCents,
        stateIncomeTaxCents: breakdown.monthlyStateIncomeTaxCents,
        employeePayrollTaxCents:
          breakdown.monthlyEmployeePayrollTaxCents,
        selfEmploymentTaxCents:
          breakdown.monthlySelfEmploymentTaxCents,
        totalTaxCents: evidence.totalTaxCents,
        afterTaxCashIncomeCents: evidence.afterTaxCashIncomeCents,
        effectiveTaxRatePpm: breakdown.effectiveTaxRatePpm,
      }),
      annualEstimate: breakdown,
      yearToDate: Object.freeze({
        paychecksProcessed: paycheckCount(state, economicYear),
        grossIncomeCents,
        totalTaxCents,
        afterTaxCashIncomeCents,
        employee401kContributionCents,
        employeeHsaContributionCents,
      }),
      settlement: Object.freeze({
        method: "exact_modeled_liability_withholding" as const,
        projectedRefundCents: 0 as const,
        projectedAmountDueCents: 0 as const,
        explanation:
          "The game withholds the modeled liability exactly each paycheck, so the current projection has no refund or amount due. A future tax-context change updates the estimate.",
      }),
      stateContext: Object.freeze({
        hasModeledStateIncomeTax: breakdown.annualStateIncomeTaxCents !== 0,
        annualStateIncomeTaxCents: breakdown.annualStateIncomeTaxCents,
        differenceFromNoIncomeTaxStateCents:
          breakdown.annualStateIncomeTaxCents,
        explanation:
          breakdown.annualStateIncomeTaxCents === 0
            ? `${request.stateCode} has no modeled individual state income tax for this estimate. Federal and payroll taxes still apply.`
            : `${request.stateCode} adds modeled state income tax. A no-income-tax state would remove this line only; salary, benefits, and cost of living would still differ.`,
      }),
      model: Object.freeze({
        provider: evidence.provider,
        bundleVersion: evidence.bundleVersion,
        rulesVersion: evidence.rulesVersion,
        projectedFromFrozenPolicy: evidence.projectedFromFrozenPolicy,
      }),
    });
  }
}
