import type { GameStateV2 } from "@/core/game-state-v2";
import type {
  CommandV2Response,
  GameCommandV2Public,
} from "@/server/api/contracts-v2";

import type { PlayerPresetId } from "./play-model";

export type RunCredential = Readonly<{ runId: string; accessSecret: string }>;
export type RunResponse = Readonly<{
  state: GameStateV2;
  stateChecksum: string;
}>;
export type MonthlyRecap = NonNullable<CommandV2Response["monthlyRecord"]>;
export type DetailedAction = Extract<
  GameCommandV2Public,
  { type: "take_detailed_action" }
>["payload"]["action"];
export type PlayTab = "overview" | "strategy" | "actions" | "learn";

export type OnboardingDraft = Readonly<{
  presetId: PlayerPresetId;
  salary: number;
  cash: number;
  studentDebt: number;
  studentDebtPayment: number;
  healthPlanId: string | null;
  coverageIds: readonly string[];
  desiredAnnualFiSpending: number;
  safeWithdrawalRate: number;
  targetAgeYears: number;
}>;

export type StrategyDraft = Readonly<{
  retirement: number;
  hsa: number;
  index: number;
  sector: number;
  speculative: number;
  ira: number;
  debt: number;
}>;

export type UpskillProgramId =
  | "upskill.certificate"
  | "upskill.bootcamp"
  | "upskill.degree";

export type ActionType =
  | "invest_taxable"
  | "invest_sector"
  | "invest_speculative"
  | "liquidate_taxable"
  | "contribute_ira"
  | "contribute_hsa"
  | "pay_term_debt"
  | "pay_revolving_credit"
  | "draw_revolving_credit"
  | "withdraw_401k"
  | "withdraw_ira"
  | "purchase_home"
  | "sell_home"
  | "refinance_home"
  | "reduce_lifestyle"
  | "increase_lifestyle"
  | "start_upskill";

export type ActionDraft = Readonly<{
  type: ActionType;
  amount: number;
  secondaryAmount: number;
  mortgageRate: number;
  mortgageTerm: number;
  upskillProgram: UpskillProgramId;
}>;
