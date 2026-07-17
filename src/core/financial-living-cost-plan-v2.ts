import {
  addMoney,
  allocateMoney,
  subtractMoney,
  type MoneyCents,
} from "./domain/money";

export const FINANCIAL_LIVING_COST_PLAN_V2_VERSION = "2.0.0" as const;

export type FinancialLivingCostPlanEvidenceV2 = Readonly<{
  version: typeof FINANCIAL_LIVING_COST_PLAN_V2_VERSION;
  previousAnnualLivingCostCents: MoneyCents;
  annualLivingCostDeltaCents: MoneyCents;
  resultingAnnualLivingCostCents: MoneyCents;
  previousMonthlyLivingCostCents: MoneyCents;
  resultingMonthlyLivingCostCents: MoneyCents;
  previousRequiredObligationsCents: MoneyCents;
  monthlyRequiredObligationDeltaCents: MoneyCents;
  resultingRequiredObligationsCents: MoneyCents;
}>;

export class FinancialLivingCostPlanV2Error extends Error {
  readonly code = "LIVING_COST_OUT_OF_RANGE" as const;
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "FinancialLivingCostPlanV2Error";
    this.cause = cause;
  }
}

export function monthlyLivingCostFromAnnualV2(
  annualLivingCostCents: MoneyCents,
): MoneyCents {
  return allocateMoney(annualLivingCostCents, 1, 12);
}

export function applyLivingCostPlanChangeV2<
  TFinances extends Readonly<{
    annualLivingCostCents: MoneyCents;
    requiredObligationsCents: MoneyCents;
  }>,
>(
  finances: TFinances,
  annualLivingCostDeltaCents: MoneyCents,
): Readonly<{
  finances: TFinances;
  evidence: FinancialLivingCostPlanEvidenceV2;
}> {
  try {
    const resultingAnnualLivingCostCents = addMoney(
      finances.annualLivingCostCents,
      annualLivingCostDeltaCents,
    );
    const previousMonthlyLivingCostCents = monthlyLivingCostFromAnnualV2(
      finances.annualLivingCostCents,
    );
    const resultingMonthlyLivingCostCents = monthlyLivingCostFromAnnualV2(
      resultingAnnualLivingCostCents,
    );
    const monthlyRequiredObligationDeltaCents = subtractMoney(
      resultingMonthlyLivingCostCents,
      previousMonthlyLivingCostCents,
    );
    const resultingRequiredObligationsCents = addMoney(
      finances.requiredObligationsCents,
      monthlyRequiredObligationDeltaCents,
    );
    if (
      resultingAnnualLivingCostCents < 0 ||
      resultingRequiredObligationsCents < 0
    ) {
      throw new RangeError(
        "living-cost plan cannot make annual cost or monthly obligations negative",
      );
    }
    const evidence: FinancialLivingCostPlanEvidenceV2 = Object.freeze({
      version: FINANCIAL_LIVING_COST_PLAN_V2_VERSION,
      previousAnnualLivingCostCents: finances.annualLivingCostCents,
      annualLivingCostDeltaCents,
      resultingAnnualLivingCostCents,
      previousMonthlyLivingCostCents,
      resultingMonthlyLivingCostCents,
      previousRequiredObligationsCents: finances.requiredObligationsCents,
      monthlyRequiredObligationDeltaCents,
      resultingRequiredObligationsCents,
    });
    return Object.freeze({
      finances: Object.freeze({
        ...finances,
        annualLivingCostCents: resultingAnnualLivingCostCents,
        requiredObligationsCents: resultingRequiredObligationsCents,
      }) as TFinances,
      evidence,
    });
  } catch (cause) {
    if (cause instanceof FinancialLivingCostPlanV2Error) throw cause;
    throw new FinancialLivingCostPlanV2Error(
      "living-cost plan change is outside safe authoritative bounds",
      cause,
    );
  }
}
