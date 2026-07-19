import { safeBigIntToNumber } from "../../core/domain/integer";
import {
  addMoney,
  allocateMoney,
  moneyCents,
} from "../../core/domain/money";
import { monthsBetween } from "../../core/domain/month";
import { resetAnnualFinancialAccumulatorsV2 } from "../../core/financial-year-v2";
import { currentCumulativePriceIndexPpmV2 } from "../../core/inflation-v2";
import type {
  MonthlyTaxBreakdownV1,
  MonthlyTaxEvidence,
} from "../../core/payroll-v2";
import { planRecurringAllocations } from "../../core/recurring-strategy-v2";
import type { TaxCalculator } from "../tax/client";
import {
  FROZEN_POLICY_YEAR,
  taxCalculationRequestSchema,
  type TaxCalculationResult,
} from "../tax/contracts";
import { fingerprintAnnualTaxContext } from "../tax/context-cache";
import { RunApiV2Error } from "./errors";
import type { AuthorizedV2State, V2Repository } from "./run-repository-port";

function emptyIncome() {
  return {
    w2Jobs: [],
    selfEmploymentNetProfitCents: 0,
    contractorNetProfitCents: 0,
    taxableInterestCents: 0,
    taxExemptInterestCents: 0,
    ordinaryDividendsCents: 0,
    qualifiedDividendsCents: 0,
    shortTermCapitalGainsCents: 0,
    longTermCapitalGainsCents: 0,
    rentalNetIncomeCents: 0,
    pensionIncomeCents: 0,
    iraDistributionsCents: 0,
    socialSecurityBenefitsCents: 0,
    unemploymentCompensationCents: 0,
    otherTaxableIncomeCents: 0,
  };
}

export function projectAnnualPretaxContributions(state: AuthorizedV2State) {
  const annualOpeningState = resetAnnualFinancialAccumulatorsV2(state);
  const employment = annualOpeningState.gameplay.employment;
  if (employment.status !== "employed") {
    throw new RunApiV2Error(
      "TAX_CONTEXT_MISMATCH",
      "annual contribution projection requires native employment",
    );
  }
  const monthNumber = Number(annualOpeningState.currentMonth.slice(5, 7));
  const remainingMonths = 13 - monthNumber;
  const monthlyGross = allocateMoney(
    employment.annualGrossSalaryCents,
    1,
    12,
  );
  let employee401kCents =
    annualOpeningState.gameplay.contributions.employee401kCents;
  let hsaCents = annualOpeningState.gameplay.contributions.hsaCents;
  let projectionState = annualOpeningState;

  for (let month = 0; month < remainingMonths; month += 1) {
    const plan = planRecurringAllocations(
      projectionState,
      monthlyGross,
      moneyCents(0),
    );
    employee401kCents = addMoney(
      employee401kCents,
      plan.preTax.employee401kCents,
    );
    hsaCents = addMoney(hsaCents, plan.preTax.hsaCents);
    projectionState = {
      ...projectionState,
      gameplay: {
        ...projectionState.gameplay,
        contributions: {
          ...projectionState.gameplay.contributions,
          employee401kCents,
          hsaCents,
        },
      },
    };
  }

  return Object.freeze({ employee401kCents, hsaCents });
}

export function buildTaxRequest(state: AuthorizedV2State, commandId: string) {
  const annualOpeningState = resetAnnualFinancialAccumulatorsV2(state);
  const snapshot = annualOpeningState.gameplay.catalogSnapshot;
  const employment = annualOpeningState.gameplay.employment;
  if (!snapshot || employment.status !== "employed") {
    throw new RunApiV2Error(
      "TAX_CONTEXT_MISMATCH",
      "monthly processing requires a native employed v2 run",
    );
  }
  const projectedContributions = projectAnnualPretaxContributions(
    annualOpeningState,
  );
  const ageYears = Math.max(
    0,
    Math.floor(
      monthsBetween(
        annualOpeningState.player.birthMonth,
        annualOpeningState.currentMonth,
      ) / 12,
    ),
  );
  const household = snapshot.selected.household;
  const people: unknown[] = [
    {
      id: "tax.primary",
      role: "primary" as const,
      ageYears,
      isBlind: false,
      isFullTimeStudent: false,
      income: {
        ...emptyIncome(),
        w2Jobs: [
          {
            id: "job.primary",
            wagesCents: employment.annualGrossSalaryCents,
            pretaxRetirementContributionsCents:
              projectedContributions.employee401kCents,
            pretaxHealthContributionsCents: projectedContributions.hsaCents,
          },
        ],
      },
    },
  ];
  if (household.adultCount > 1) {
    people.push({
      id: "tax.spouse",
      role: "spouse" as const,
      ageYears,
      isBlind: false,
      isFullTimeStudent: false,
      income: emptyIncome(),
    });
  }
  for (let dependent = 0; dependent < household.dependentCount; dependent += 1) {
    people.push({
      id: `tax.dependent.${dependent + 1}`,
      role: "dependent" as const,
      ageYears: 10,
      isBlind: false,
      isFullTimeStudent: true,
      income: emptyIncome(),
    });
  }
  return taxCalculationRequestSchema.parse({
    schemaVersion: 1,
    traceId: `tax.${commandId}`,
    economicYear: Number(annualOpeningState.currentMonth.slice(0, 4)),
    policyYear: FROZEN_POLICY_YEAR,
    cumulativePriceIndexPpm:
      currentCumulativePriceIndexPpmV2(annualOpeningState),
    stateCode: snapshot.derived.stateCode,
    filingStatus: snapshot.derived.filingStatus,
    people,
    deductions: {},
  });
}

type TaxMetadata = Readonly<{
  traceId: string;
  economicYear: number;
  policyYear: number;
  stateCode: string;
  filingStatus: string;
  provider: "PolicyEngine US";
  bundleVersion: string;
  rulesVersion: string;
  projectedFromFrozenPolicy: boolean;
}>;

function assertCachedContext(
  cached: MonthlyTaxEvidence,
  request: ReturnType<typeof buildTaxRequest>,
  monthlyGross: number,
  monthly401k: number,
  monthlyHsa: number,
): void {
  if (
    cached.economicYear !== request.economicYear ||
    cached.policyYear !== request.policyYear ||
    cached.stateCode !== request.stateCode ||
    cached.filingStatus !== request.filingStatus ||
    cached.grossIncomeCents !== monthlyGross ||
    cached.employee401kContributionCents !== monthly401k ||
    cached.employeeHsaContributionCents !== monthlyHsa
  ) {
    throw new RunApiV2Error(
      "TAX_CONTEXT_MISMATCH",
      "cached tax evidence does not match the authoritative run context",
    );
  }
}

export type MonthlyTaxEvidenceSourceV1 =
  | Readonly<{ kind: "calculated"; result: TaxCalculationResult }>
  | Readonly<{ kind: "cached"; evidence: MonthlyTaxEvidence }>;

function monthlyTaxBreakdown(
  result: TaxCalculationResult,
  monthlyTotalTaxCents: number,
): MonthlyTaxBreakdownV1 {
  const monthlyState = allocateMoney(moneyCents(result.stateIncomeTaxCents), 1, 12);
  const monthlyPayroll = allocateMoney(
    moneyCents(result.employeePayrollTaxCents),
    1,
    12,
  );
  const monthlySelfEmployment = allocateMoney(
    moneyCents(result.selfEmploymentTaxCents),
    1,
    12,
  );
  // Put the at-most-few-cent component rounding residual into federal tax so
  // the visible paycheck always reconciles exactly to the posted total.
  const monthlyFederal =
    monthlyTotalTaxCents - monthlyState - monthlyPayroll - monthlySelfEmployment;
  return Object.freeze({
    version: "monthly-tax-breakdown-v1" as const,
    monthlyFederalIncomeTaxCents: monthlyFederal,
    monthlyStateIncomeTaxCents: monthlyState,
    monthlyEmployeePayrollTaxCents: monthlyPayroll,
    monthlySelfEmploymentTaxCents: monthlySelfEmployment,
    annualGrossIncomeCents: result.annualGrossIncomeCents,
    annualTaxableIncomeCents:
      result.componentsCents.taxable_income ?? null,
    annualFederalIncomeTaxCents: result.federalIncomeTaxCents,
    annualStateIncomeTaxCents: result.stateIncomeTaxCents,
    annualEmployeePayrollTaxCents: result.employeePayrollTaxCents,
    annualSelfEmploymentTaxCents: result.selfEmploymentTaxCents,
    annualTotalTaxCents: result.totalTaxCents,
    annualAfterTaxIncomeCents: result.afterTaxIncomeCents,
    effectiveTaxRatePpm: result.effectiveTaxRatePpm,
    disclaimer: result.disclaimer,
  });
}

/** One production-owned conversion shared by the web service and offline lab. */
export function buildMonthlyTaxEvidenceFromPolicyEngineV1(
  state: AuthorizedV2State,
  commandId: string,
  source: MonthlyTaxEvidenceSourceV1,
): MonthlyTaxEvidence {
  const annualOpeningState = resetAnnualFinancialAccumulatorsV2(state);
  const employment = annualOpeningState.gameplay.employment;
  if (employment.status !== "employed") {
    throw new RunApiV2Error(
      "TAX_CONTEXT_MISMATCH",
      "monthly processing requires native employment",
    );
  }
  const request = buildTaxRequest(annualOpeningState, commandId);
  const contextFingerprint = fingerprintAnnualTaxContext(request);
  const monthlyGross = allocateMoney(employment.annualGrossSalaryCents, 1, 12);
  const monthlyPlan = planRecurringAllocations(
    annualOpeningState,
    monthlyGross,
    moneyCents(0),
  );
  let metadata: TaxMetadata;
  let monthlyTax: number;
  let breakdown: MonthlyTaxBreakdownV1 | undefined;
  if (source.kind === "cached") {
    assertCachedContext(
      source.evidence,
      request,
      monthlyGross,
      monthlyPlan.preTax.employee401kCents,
      monthlyPlan.preTax.hsaCents,
    );
    metadata = {
      traceId: `tax.cache.${commandId}`,
      economicYear: source.evidence.economicYear,
      policyYear: source.evidence.policyYear,
      stateCode: source.evidence.stateCode,
      filingStatus: source.evidence.filingStatus,
      provider: source.evidence.provider,
      bundleVersion: source.evidence.bundleVersion,
      rulesVersion: source.evidence.rulesVersion,
      projectedFromFrozenPolicy: source.evidence.projectedFromFrozenPolicy,
    };
    monthlyTax = source.evidence.totalTaxCents;
    breakdown = source.evidence.breakdown;
  } else {
    const result = source.result;
    if (
      result.traceId !== request.traceId ||
      result.economicYear !== request.economicYear ||
      result.policyYear !== request.policyYear ||
      result.stateCode !== request.stateCode ||
      result.filingStatus !== request.filingStatus ||
      result.annualGrossIncomeCents !== employment.annualGrossSalaryCents
    ) {
      throw new RunApiV2Error(
        "TAX_CONTEXT_MISMATCH",
        "tax result does not match the authoritative run context",
      );
    }
    metadata = {
      traceId: result.traceId,
      economicYear: result.economicYear,
      policyYear: result.policyYear,
      stateCode: result.stateCode,
      filingStatus: result.filingStatus,
      provider: result.model.provider,
      bundleVersion: result.model.bundleVersion,
      rulesVersion: result.model.rulesVersion,
      projectedFromFrozenPolicy: result.model.projectedFromFrozenPolicy,
    };
    monthlyTax = allocateMoney(moneyCents(result.totalTaxCents), 1, 12);
    breakdown = monthlyTaxBreakdown(result, monthlyTax);
  }
  const afterTaxCash = safeBigIntToNumber(
    BigInt(monthlyGross) -
      BigInt(monthlyPlan.preTax.employee401kCents) -
      BigInt(monthlyPlan.preTax.hsaCents) -
      BigInt(monthlyTax),
    "monthly after-tax cash",
  );
  if (afterTaxCash < 0) {
    throw new RunApiV2Error(
      "TAX_RESULT_UNUSABLE",
      "tax result leaves negative monthly payroll cash",
    );
  }
  return {
    schemaVersion: 1,
    ...metadata,
    contextFingerprint,
    grossIncomeCents: monthlyGross,
    employee401kContributionCents: monthlyPlan.preTax.employee401kCents,
    employeeHsaContributionCents: monthlyPlan.preTax.hsaCents,
    totalTaxCents: monthlyTax,
    afterTaxCashIncomeCents: moneyCents(afterTaxCash),
    ...(breakdown === undefined ? {} : { breakdown }),
  };
}

export async function resolveMonthlyTaxEvidence(input: Readonly<{
  state: AuthorizedV2State;
  runId: string;
  accessSecret: string;
  commandId: string;
  repository: V2Repository;
  taxCalculator: TaxCalculator;
}>): Promise<MonthlyTaxEvidence> {
  const annualOpeningState = resetAnnualFinancialAccumulatorsV2(input.state);
  const employment = annualOpeningState.gameplay.employment;
  if (employment.status !== "employed") {
    throw new RunApiV2Error(
      "TAX_CONTEXT_MISMATCH",
      "monthly processing requires native employment",
    );
  }
  const request = buildTaxRequest(annualOpeningState, input.commandId);
  const contextFingerprint = fingerprintAnnualTaxContext(request);
  const cached = await input.repository.loadMonthlyTaxEvidenceForContext(
    input.runId,
    input.accessSecret,
    contextFingerprint,
  );
  if (cached) {
    return buildMonthlyTaxEvidenceFromPolicyEngineV1(
      annualOpeningState,
      input.commandId,
      { kind: "cached", evidence: cached },
    );
  }
  const result = await input.taxCalculator.calculate(request);
  return buildMonthlyTaxEvidenceFromPolicyEngineV1(
    annualOpeningState,
    input.commandId,
    { kind: "calculated", result },
  );
}
