import type { MoneyCents, RatePpm } from "./domain/money";
import type { SimulationMonth } from "./domain/month";
import type { ActionPolicyVersionV2 } from "./action-policy-v2";

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
    }>
  | Readonly<{
      type: "purchase_home";
      purchasePriceCents: MoneyCents;
      downPaymentCents: MoneyCents;
      mortgageAnnualInterestRatePpm: RatePpm;
      mortgageTermMonths: number;
    }>
  | Readonly<{ type: "sell_home" }>
  | Readonly<{
      type: "refinance_home";
      mortgageAnnualInterestRatePpm: RatePpm;
      mortgageTermMonths: number;
    }>
  | Readonly<{
      type: "change_lifestyle";
      annualLivingCostDeltaCents: MoneyCents;
    }>
  | Readonly<{
      type: "start_upskill";
      programId: "upskill.certificate" | "upskill.bootcamp" | "upskill.degree";
    }>;

export type DetailedFinanceCommand = Readonly<{
  schemaVersion: typeof DETAILED_FINANCE_COMMAND_SCHEMA_VERSION;
  id: string;
  type: "take_detailed_action";
  expectedRevision: number;
  effectiveMonth: SimulationMonth;
  payload: Readonly<{
    action: DetailedFinancialAction;
    actionPolicyVersion?: ActionPolicyVersionV2;
  }>;
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
    | "CREDIT_LIMIT_EXCEEDED"
    | "HOME_ALREADY_OWNED"
    | "HOME_REQUIRED"
    | "INVALID_TERM"
    | "MORTGAGE_CONFLICT"
    | "LIFESTYLE_OUT_OF_RANGE"
    | "UNKNOWN_PROGRAM"
    | "EMPLOYMENT_REQUIRED";

  constructor(code: DetailedFinanceError["code"], message: string) {
    super(message);
    this.name = "DetailedFinanceError";
    this.code = code;
  }
}
