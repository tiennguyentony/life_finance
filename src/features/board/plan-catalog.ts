import type { CommandIntent } from "@/contracts/api/contracts";
import { moneyCents } from "@/core/domain/money";
import {
  planRevolvingCreditMonthV2,
  REVOLVING_CREDIT_POLICY_V2,
} from "@/core/revolving-credit-v2";
import { UPSKILL_PROGRAMS, type UpskillProgram } from "@/data/upskill-programs";

export type BoardDestinationId =
  | "home"
  | "bank"
  | "financial"
  | "startup"
  | "hospital";

export type BoardPlanEffect = Readonly<{
  label: string;
  value: string;
  tone: "positive" | "negative" | "neutral";
  certainty: "exact" | "directional";
}>;

export type BoardPlan = Readonly<{
  id: string;
  destinationId: BoardDestinationId;
  label: string;
  description: string;
  effects: readonly BoardPlanEffect[];
  disabledReason: string | null;
  command:
    | Readonly<{ type: "none" }>
    | Readonly<{ type: "take_detailed_action"; action: Record<string, unknown> }>
    | Readonly<{
        type: "set_recurring_strategy";
        emergencyFundTargetMonthsPpm: number;
      }>
    /**
     * Money HQ's Invest screen edits several contribution rates at once, so it
     * sends a patch rather than the single buffer target the board offers.
     */
    | Readonly<{
        type: "set_recurring_strategy_patch";
        patch: Readonly<Partial<RecurringStrategyRates>>;
      }>;
}>;

export type RecurringStrategyRates = Readonly<{
  emergencyFundTargetMonthsPpm: number;
  preTax401kSalaryRatePpm: number;
  preTaxHsaSalaryRatePpm: number;
  afterTaxBroadIndexRatePpm: number;
  afterTaxSectorRatePpm: number;
  afterTaxSpeculativeRatePpm: number;
  afterTaxIraRatePpm: number;
  afterTaxExtraDebtRatePpm: number;
}>;

export const DEMO_ACTION_CENTS = 50_000;
export const ANNUAL_LIFESTYLE_DELTA_CENTS = 120_000;

type BoardPlanRun = Readonly<{
  revision: number;
  currentMonth: string;
  finances: Readonly<{
    cashCents: number;
    creditLimitCents: number;
    creditUsedCents: number;
    annualLivingCostCents: number;
    requiredObligationsCents: number;
  }>;
  income: Readonly<{ annualGrossSalaryCents: number | null }>;
  career: Readonly<{ pendingProgramIds: readonly string[] }>;
  strategy: Readonly<{
    effectiveMonth: string;
    emergencyFundTargetMonthsPpm?: number;
    insuranceCoverageIds?: readonly string[];
    preTax401kSalaryRatePpm: number;
    preTaxHsaSalaryRatePpm: number;
    afterTaxBroadIndexRatePpm: number;
    afterTaxSectorRatePpm: number;
    afterTaxSpeculativeRatePpm: number;
    afterTaxIraRatePpm: number;
    afterTaxExtraDebtRatePpm: number;
  }>;
}>;

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatPlanMoney(cents: number): string {
  return money.format(cents / 100);
}

function exactEffect(
  label: string,
  value: string,
  tone: BoardPlanEffect["tone"],
): BoardPlanEffect {
  return { label, value, tone, certainty: "exact" };
}

function directionalEffect(
  label: string,
  value: string,
  tone: BoardPlanEffect["tone"],
): BoardPlanEffect {
  return { label, value, tone, certainty: "directional" };
}

function homePlans(run: BoardPlanRun): readonly BoardPlan[] {
  const cannotReduce =
    run.finances.annualLivingCostCents < ANNUAL_LIFESTYLE_DELTA_CENTS ||
    run.finances.requiredObligationsCents < 10_000;

  return [
    {
      id: "home.reduce-lifestyle",
      destinationId: "home",
      label: "Reduce lifestyle costs",
      description: "Trim living costs by $100 per month.",
      effects: [
        exactEffect("Annual living costs", "-$1,200", "positive"),
        exactEffect("Required monthly obligations", "-$100", "positive"),
        directionalEffect("Lifestyle flexibility", "Lower", "negative"),
        directionalEffect("Financial-independence target", "Lower", "positive"),
      ],
      disabledReason: cannotReduce
        ? "Living costs cannot be reduced by another $100 per month."
        : null,
      command: {
        type: "take_detailed_action",
        action: {
          type: "change_lifestyle",
          annualLivingCostDeltaCents: -ANNUAL_LIFESTYLE_DELTA_CENTS,
        },
      },
    },
    {
      id: "home.increase-lifestyle",
      destinationId: "home",
      label: "Increase lifestyle costs",
      description: "Allow $100 more per month for living costs.",
      effects: [
        exactEffect("Annual living costs", "+$1,200", "negative"),
        exactEffect("Required monthly obligations", "+$100", "negative"),
        directionalEffect("Lifestyle flexibility", "Higher", "positive"),
        directionalEffect("Financial-independence target", "Higher", "negative"),
      ],
      disabledReason: null,
      command: {
        type: "take_detailed_action",
        action: {
          type: "change_lifestyle",
          annualLivingCostDeltaCents: ANNUAL_LIFESTYLE_DELTA_CENTS,
        },
      },
    },
    stayTheCoursePlan("home"),
  ];
}

function bankPlans(run: BoardPlanRun): readonly BoardPlan[] {
  const paymentCents = Math.min(
    DEMO_ACTION_CENTS,
    run.finances.cashCents,
    run.finances.creditUsedCents,
  );
  const drawCents = Math.min(
    DEMO_ACTION_CENTS,
    run.finances.creditLimitCents - run.finances.creditUsedCents,
  );
  const paymentClosingBalanceCents = Math.max(
    0,
    run.finances.creditUsedCents - paymentCents,
  );
  const drawClosingBalanceCents = run.finances.creditUsedCents + drawCents;
  const paymentMinimumCents = planRevolvingCreditMonthV2(
    moneyCents(paymentClosingBalanceCents),
  ).scheduledPaymentCents;
  const drawMinimumCents = planRevolvingCreditMonthV2(
    moneyCents(drawClosingBalanceCents),
  ).scheduledPaymentCents;
  const apr = `${REVOLVING_CREDIT_POLICY_V2.annualInterestRatePpm / 10_000}% APR`;

  return [
    {
      id: "bank.pay-credit",
      destinationId: "bank",
      label: "Pay revolving credit",
      description: "Pay up to $500 toward your revolving balance.",
      effects: [
        exactEffect("Cash", `-${formatPlanMoney(paymentCents)}`, "negative"),
        exactEffect("Revolving debt", `-${formatPlanMoney(paymentCents)}`, "positive"),
        exactEffect("Scenario credit policy", apr, "neutral"),
        directionalEffect(
          "Next minimum at this balance",
          formatPlanMoney(paymentMinimumCents),
          "positive",
        ),
        exactEffect("Net worth", "No immediate change", "neutral"),
      ],
      disabledReason: paymentCents <= 0
        ? run.finances.creditUsedCents <= 0
          ? "No revolving credit balance is available to pay."
          : "You need cash to make a revolving-credit payment."
        : null,
      command: {
        type: "take_detailed_action",
        action: { type: "pay_revolving_credit", amountCents: paymentCents },
      },
    },
    {
      id: "bank.draw-credit",
      destinationId: "bank",
      label: "Draw revolving credit",
      description: "Draw up to $500 of your available revolving credit.",
      effects: [
        exactEffect("Cash", `+${formatPlanMoney(drawCents)}`, "positive"),
        exactEffect("Revolving debt", `+${formatPlanMoney(drawCents)}`, "negative"),
        exactEffect("Scenario credit policy", apr, "negative"),
        directionalEffect(
          "Next minimum at this balance",
          formatPlanMoney(drawMinimumCents),
          "negative",
        ),
      ],
      disabledReason: drawCents <= 0
        ? "No revolving credit is available to draw."
        : null,
      command: {
        type: "take_detailed_action",
        action: { type: "draw_revolving_credit", amountCents: drawCents },
      },
    },
    stayTheCoursePlan("bank"),
  ];
}

function investmentPlan(
  id: "broad-index" | "sector" | "speculative",
  label: string,
  bucket:
    | "taxableBroadIndexCents"
    | "taxableSectorCents"
    | "taxableSpeculativeCents",
  riskEffect: string,
  run: BoardPlanRun,
): BoardPlan {
  return {
    id: `financial.${id}`,
    destinationId: "financial",
    label,
    description: `Invest ${formatPlanMoney(DEMO_ACTION_CENTS)} in a taxable ${id.replace("-", " ")} fund.`,
    effects: [
      exactEffect("Cash", `-${formatPlanMoney(DEMO_ACTION_CENTS)}`, "negative"),
      exactEffect("Taxable investments", `+${formatPlanMoney(DEMO_ACTION_CENTS)}`, "positive"),
      directionalEffect("Concentration risk", riskEffect, riskEffect === "Lower" ? "positive" : "negative"),
    ],
    disabledReason: run.finances.cashCents < DEMO_ACTION_CENTS
      ? "You need $500 in cash."
      : null,
    command: {
      type: "take_detailed_action",
      action: { type: "invest_taxable", bucket, amountCents: DEMO_ACTION_CENTS },
    },
  };
}

function financialPlans(run: BoardPlanRun): readonly BoardPlan[] {
  return [
    investmentPlan("broad-index", "Invest in broad index", "taxableBroadIndexCents", "Lower", run),
    investmentPlan("sector", "Invest in sector assets", "taxableSectorCents", "Higher", run),
    investmentPlan("speculative", "Invest in speculative assets", "taxableSpeculativeCents", "Higher", run),
  ];
}

function upskillPlan(program: UpskillProgram, run: BoardPlanRun): BoardPlan {
  const label = program.id.replace("upskill.", "Start ");
  const disabledReason = run.income.annualGrossSalaryCents === null
    ? "Upskilling requires active employment."
    : run.career.pendingProgramIds.includes(program.id)
      ? "This program is already in progress."
      : run.finances.cashCents < program.costCents
        ? `You need ${formatPlanMoney(program.costCents)} in cash.`
        : null;

  return {
    id: `startup.${program.id.replace("upskill.", "")}`,
    destinationId: "startup",
    label,
    description: `Commit to a ${program.durationMonths}-month program for future earning potential.`,
    effects: [
      exactEffect("Cash", `-${formatPlanMoney(program.costCents)}`, "negative"),
      exactEffect("Program duration", `${program.durationMonths} months`, "neutral"),
      exactEffect(
        "Annual salary on completion",
        `+${formatPlanMoney(program.annualSalaryIncreaseCents)}`,
        "positive",
      ),
    ],
    disabledReason,
    command: {
      type: "take_detailed_action",
      action: { type: "start_upskill", programId: program.id },
    },
  };
}

function startupPlans(run: BoardPlanRun): readonly BoardPlan[] {
  return UPSKILL_PROGRAMS.map((program) => upskillPlan(program, run));
}

function hospitalPlans(): readonly BoardPlan[] {
  return [
    reservePlan(3),
    reservePlan(6),
    stayTheCoursePlan("hospital"),
  ];
}

function reservePlan(months: number): BoardPlan {
  return {
    id: `hospital.reserve-${months}`,
    destinationId: "hospital",
    label: `Set a ${months}-month safety buffer`,
    description: "Set the emergency-fund target used by your recurring strategy.",
    effects: [
      exactEffect("Immediate transfer", "None", "neutral"),
      directionalEffect("Future reserve allocation", "Protects the target", "positive"),
    ],
    disabledReason: null,
    command: {
      type: "set_recurring_strategy",
      emergencyFundTargetMonthsPpm: months * 1_000_000,
    },
  };
}

function stayTheCoursePlan(destinationId: "home" | "bank" | "hospital"): BoardPlan {
  return {
    id: `${destinationId}.stay-the-course`,
    destinationId,
    label: "Stay the course",
    description: "Make no immediate change before living this month.",
    effects: [exactEffect("Immediate change", "None", "neutral")],
    disabledReason: null,
    command: { type: "none" },
  };
}

export function plansForDestination(
  run: BoardPlanRun,
  destinationId: BoardDestinationId,
): readonly BoardPlan[] {
  switch (destinationId) {
    case "home":
      return homePlans(run);
    case "bank":
      return bankPlans(run);
    case "financial":
      return financialPlans(run);
    case "startup":
      return startupPlans(run);
    case "hospital":
      return hospitalPlans();
  }
}

export function commandIntentForPlan(
  run: BoardPlanRun,
  plan: BoardPlan,
  commandId: string,
): CommandIntent | null {
  if (plan.command.type === "none") return null;
  if (plan.command.type === "take_detailed_action") {
    return {
      id: commandId,
      expectedRevision: run.revision,
      effectiveMonth: run.currentMonth,
      type: "take_detailed_action",
      payload: { action: plan.command.action },
    };
  }

  const { effectiveMonth, ...strategy } = run.strategy;
  void effectiveMonth;
  const patch = plan.command.type === "set_recurring_strategy_patch"
    ? plan.command.patch
    : {
        emergencyFundTargetMonthsPpm: plan.command.emergencyFundTargetMonthsPpm,
      };

  return {
    id: commandId,
    expectedRevision: run.revision,
    effectiveMonth: run.currentMonth,
    type: "set_recurring_strategy",
    payload: { strategy: { ...strategy, ...patch } },
  };
}
