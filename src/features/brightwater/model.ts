/**
 * Deterministic frontend game model for the "new grad in the big city" run.
 * Everything here is mocked placeholder data: no backend, no randomness.
 * Five decisions with three options each enumerate exactly 3^5 = 243
 * scenarios, each ending in bankruptcy or survival.
 */

export type ChoiceId = "a" | "b" | "c";

export type ChoiceEffects = Readonly<{
  /** One-time cash applied the moment the choice is made. */
  cashNow?: number;
  /** Recurring monthly cash change from the next month onward. */
  monthly?: number;
  /** One-time transfer into the invested pool. */
  investNow?: number;
  /** Clears the student-loan line for the remaining months. */
  clearsLoan?: boolean;
  /** A delayed one-time hit, landing during a later month tick. */
  delayed?: Readonly<{ month: number; cash: number; note: string }>;
}>;

export type DecisionOption = Readonly<{
  id: ChoiceId;
  label: string;
  flavor: string;
  effectChips: readonly string[];
  effects: ChoiceEffects;
}>;

export type Decision = Readonly<{
  index: number;
  id: string;
  locationId: string;
  title: string;
  prompt: string;
  options: readonly [DecisionOption, DecisionOption, DecisionOption];
}>;

export const START_CASH = 5_000;
export const NET_INCOME = 4_400;
/** Food, utilities, phone, and the $180 student-loan minimum. */
export const FIXED_COSTS = 1_080;
export const LOAN_PAYMENT = 180;
export const MONTHS_PER_CHAPTER = 3;
export const TOTAL_MONTHS = 15;

export const DECISIONS: readonly Decision[] = [
  {
    index: 0,
    id: "housing",
    locationId: "heights",
    title: "Sign a lease",
    prompt:
      "The couch-surfing weeks are over. Brightwater rents want a full month as deposit, and rent decides every month after it.",
    options: [
      {
        id: "a",
        label: "One-bed near the park",
        flavor: "Your own door, your own quiet. The classic first apartment.",
        effectChips: ["Rent $2,350/mo", "Deposit $2,350"],
        effects: { cashNow: -2_350, monthly: -2_350 },
      },
      {
        id: "b",
        label: "Shared walk-up room",
        flavor: "Three roommates, one kitchen, rent that leaves room to live.",
        effectChips: ["Rent $1,150/mo", "Deposit $1,150"],
        effects: { cashNow: -1_150, monthly: -1_150 },
      },
      {
        id: "c",
        label: "Luxe tower studio",
        flavor: "Gym, skyline, doorman. The elevator smells like ambition.",
        effectChips: ["Rent $2,900/mo", "Deposit $2,900"],
        effects: { cashNow: -2_900, monthly: -2_900 },
      },
    ],
  },
  {
    index: 1,
    id: "transport",
    locationId: "transit",
    title: "Get around town",
    prompt:
      "The commute to the office is real now. Wheels, rails, or pedals: each moves your money differently.",
    options: [
      {
        id: "a",
        label: "Finance a car",
        flavor: "Freedom on four wheels, plus a loan, insurance, and parking.",
        effectChips: ["$800 down", "$520/mo all-in"],
        effects: { cashNow: -800, monthly: -520 },
      },
      {
        id: "b",
        label: "Transit pass",
        flavor: "The green line runs two blocks from your door.",
        effectChips: ["$130/mo"],
        effects: { monthly: -130 },
      },
      {
        id: "c",
        label: "E-bike",
        flavor: "Up front it stings; after that the city is basically free.",
        effectChips: ["$900 up front", "$40/mo upkeep"],
        effects: { cashNow: -900, monthly: -40 },
      },
    ],
  },
  {
    index: 2,
    id: "lifestyle",
    locationId: "promenade",
    title: "Pick your pace",
    prompt:
      "New coworkers, new friends, new city. The Neon Promenade is happy to take whatever you bring it.",
    options: [
      {
        id: "a",
        label: "Say yes to everything",
        flavor: "Every dinner, every show, every weekend trip. You only move here once.",
        effectChips: ["$850/mo"],
        effects: { monthly: -850 },
      },
      {
        id: "b",
        label: "Weekend explorer",
        flavor: "Out twice a week, one splurge a month, no FOMO.",
        effectChips: ["$420/mo"],
        effects: { monthly: -420 },
      },
      {
        id: "c",
        label: "Potluck homebody",
        flavor: "Board games, park picnics, and a legendary lentil recipe.",
        effectChips: ["$180/mo"],
        effects: { monthly: -180 },
      },
    ],
  },
  {
    index: 3,
    id: "crisis",
    locationId: "hospital",
    title: "The appendix bill",
    prompt:
      "Week two of month nine: an ambulance, a surgery, and a $3,400 bill. Nobody budgets for this. Now you have to.",
    options: [
      {
        id: "a",
        label: "Pay it in full",
        flavor: "One deep breath, one payment, zero interest. If you can afford it.",
        effectChips: ["-$3,400 now"],
        effects: { cashNow: -3_400 },
      },
      {
        id: "b",
        label: "Hospital payment plan",
        flavor: "Small monthly bites with interest baked in. It follows you past the year.",
        effectChips: ["$320/mo, 6 months"],
        effects: { monthly: -320 },
      },
      {
        id: "c",
        label: "Skip the follow-up care",
        flavor: "Pay the ER minimum and hope. Bodies keep their own ledgers.",
        effectChips: ["-$600 now", "Risk: it comes back"],
        effects: {
          cashNow: -600,
          delayed: {
            month: 13,
            cash: -4_800,
            note: "The old injury flared up: emergency readmission.",
          },
        },
      },
    ],
  },
  {
    index: 4,
    id: "windfall",
    locationId: "bank",
    title: "The year-end bonus",
    prompt:
      "Your manager slides a letter across the desk: a $3,200 bonus. Sprout Bank has opinions about what happens next.",
    options: [
      {
        id: "a",
        label: "Invest it",
        flavor: "Straight into a broad index fund. Future-you sends a thank-you note.",
        effectChips: ["+$3,200 invested", "Grows monthly"],
        effects: { investNow: 3_200 },
      },
      {
        id: "b",
        label: "Clear the student loan",
        flavor: "Kill the $180 payment forever and bank the rest as a cushion.",
        effectChips: ["+$3,200 cash", "Loan payment ends"],
        effects: { cashNow: 3_200, clearsLoan: true },
      },
      {
        id: "c",
        label: "Treat yourself",
        flavor: "Flights, a real mattress, the good headphones. All of it. At once.",
        effectChips: ["+$3,200 bonus", "-$4,100 spent"],
        effects: { cashNow: -900 },
      },
    ],
  },
];

export type Allocation = Readonly<{
  cash: number;
  index: number;
  growth: number;
  reit: number;
}>;

export const INITIAL_ALLOCATION: Allocation = {
  cash: 1,
  index: 0,
  growth: 0,
  reit: 0,
};

/** Deterministic mock monthly returns per bucket (fractions, not percent). */
export const BUCKET_RATES: Readonly<{
  cash: number;
  index: number;
  reit: number;
  growthCycle: readonly number[];
}> = {
  cash: 0,
  index: 0.009,
  reit: 0.0055,
  growthCycle: [0.032, -0.018, 0.041, 0.006, -0.024, 0.05],
};

export function monthlyReturnRate(
  allocation: Allocation,
  monthIndex: number,
): number {
  const growth =
    BUCKET_RATES.growthCycle[monthIndex % BUCKET_RATES.growthCycle.length]!;
  return (
    allocation.cash * BUCKET_RATES.cash +
    allocation.index * BUCKET_RATES.index +
    allocation.growth * growth +
    allocation.reit * BUCKET_RATES.reit
  );
}

export type MonthSnapshot = Readonly<{
  month: number;
  inflow: number;
  outflow: number;
  cash: number;
  invested: number;
  notes: readonly string[];
}>;

export type RunOutcome = "playing" | "survived" | "bankrupt";

export type MoneyMove = Readonly<{
  /** Applied at the start of this month's tick. */
  month: number;
  /** Positive moves cash into investments; negative sells back to cash. */
  toInvested: number;
}>;

export type RunResult = Readonly<{
  choices: readonly ChoiceId[];
  outcome: RunOutcome;
  months: readonly MonthSnapshot[];
  endedAtMonth: number;
  finalCash: number;
  invested: number;
  netWorth: number;
  monthlyNet: number;
  grade: "gold" | "silver" | "bronze" | null;
}>;

export type AllocationChange = Readonly<{
  /** Effective from this month onward (month 0 = from the start). */
  month: number;
  allocation: Allocation;
}>;

export type SimulateOptions = Readonly<{
  allocation?: Allocation;
  /** Overrides `allocation` when present; later entries win per month. */
  allocationTimeline?: readonly AllocationChange[];
  moves?: readonly MoneyMove[];
}>;

function gradeFor(netWorth: number): "gold" | "silver" | "bronze" {
  if (netWorth >= 20_000) return "gold";
  if (netWorth >= 8_000) return "silver";
  return "bronze";
}

export function simulateRun(
  choices: readonly ChoiceId[],
  options: SimulateOptions = {},
): RunResult {
  const timeline = [...(options.allocationTimeline ?? [
    { month: 0, allocation: options.allocation ?? INITIAL_ALLOCATION },
  ])].sort((a, b) => a.month - b.month);
  const allocationAt = (month: number): Allocation => {
    let current = timeline[0]?.allocation ?? INITIAL_ALLOCATION;
    for (const change of timeline) {
      if (change.month <= month) current = change.allocation;
    }
    return current;
  };
  const moves = options.moves ?? [];

  let cash = START_CASH;
  let invested = 0;
  let monthlyChoiceCosts = 0;
  let loanCleared = false;
  let delayedHits: { month: number; cash: number; note: string }[] = [];
  const months: MonthSnapshot[] = [];
  let month = 0;

  const monthlyNetNow = () =>
    NET_INCOME -
    (FIXED_COSTS - (loanCleared ? LOAN_PAYMENT : 0)) +
    monthlyChoiceCosts;

  const finish = (outcome: RunOutcome): RunResult => {
    const netWorth = Math.round(cash + invested);
    return {
      choices,
      outcome,
      months,
      endedAtMonth: month,
      finalCash: Math.round(cash),
      invested: Math.round(invested),
      netWorth,
      monthlyNet: Math.round(monthlyNetNow()),
      grade: outcome === "survived" ? gradeFor(netWorth) : null,
    };
  };

  for (const [index, decision] of DECISIONS.entries()) {
    const choiceId = choices[index];
    if (choiceId === undefined) return finish("playing");
    const option = decision.options.find(({ id }) => id === choiceId);
    if (!option) throw new Error(`unknown choice ${choiceId} for ${decision.id}`);

    const effects = option.effects;
    cash += effects.cashNow ?? 0;
    invested += effects.investNow ?? 0;
    monthlyChoiceCosts += effects.monthly ?? 0;
    if (effects.clearsLoan) loanCleared = true;
    if (effects.delayed) delayedHits.push({ ...effects.delayed });

    if (cash < 0) return finish("bankrupt");

    for (let step = 0; step < MONTHS_PER_CHAPTER; step += 1) {
      month += 1;
      const notes: string[] = [];

      for (const move of moves) {
        if (move.month === month) {
          const amount = Math.max(-invested, Math.min(cash, move.toInvested));
          cash -= amount;
          invested += amount;
          notes.push(
            amount >= 0
              ? `Moved $${Math.round(amount).toLocaleString("en-US")} into investments.`
              : `Sold $${Math.round(-amount).toLocaleString("en-US")} back to cash.`,
          );
        }
      }

      const inflow = NET_INCOME;
      let outflow =
        FIXED_COSTS - (loanCleared ? LOAN_PAYMENT : 0) - monthlyChoiceCosts;

      const due = delayedHits.filter((hit) => hit.month === month);
      delayedHits = delayedHits.filter((hit) => hit.month !== month);
      for (const hit of due) {
        outflow += -hit.cash;
        notes.push(hit.note);
      }

      /* Growth compounds inside the invested pool; it never touches cash. */
      invested += invested * monthlyReturnRate(allocationAt(month), month - 1);

      cash += inflow - outflow;

      months.push({
        month,
        inflow: Math.round(inflow),
        outflow: Math.round(outflow),
        cash: Math.round(cash),
        invested: Math.round(invested),
        notes,
      });

      if (cash < 0) return finish("bankrupt");
    }
  }

  return finish("survived");
}

export type CashflowLine = Readonly<{ label: string; amount: number }>;

/** Monthly cashflow line items for the categories decided so far. */
export function cashflowLines(
  choices: readonly ChoiceId[],
): readonly CashflowLine[] {
  const loanCleared = choices[4] === "b";
  const lines: CashflowLine[] = [
    { label: "Salary (take-home)", amount: NET_INCOME },
    {
      label: "Essentials: food, utilities, phone",
      amount: -(FIXED_COSTS - LOAN_PAYMENT),
    },
    {
      label: loanCleared ? "Student loan (paid off!)" : "Student loan minimum",
      amount: loanCleared ? 0 : -LOAN_PAYMENT,
    },
  ];
  for (const [index, decision] of DECISIONS.entries()) {
    const choiceId = choices[index];
    if (!choiceId) continue;
    const option = decision.options.find(({ id }) => id === choiceId);
    if (option?.effects.monthly) {
      lines.push({ label: option.label, amount: option.effects.monthly });
    }
  }
  return lines;
}

export type ScenarioSummary = Readonly<{
  choices: readonly [ChoiceId, ChoiceId, ChoiceId, ChoiceId, ChoiceId];
  outcome: "survived" | "bankrupt";
  endedAtMonth: number;
  finalCash: number;
  netWorth: number;
  grade: RunResult["grade"];
}>;

/** Enumerates all 3^5 = 243 mocked scenarios of the run. */
export function enumerateScenarios(): readonly ScenarioSummary[] {
  const ids: readonly ChoiceId[] = ["a", "b", "c"];
  const scenarios: ScenarioSummary[] = [];
  for (const d1 of ids)
    for (const d2 of ids)
      for (const d3 of ids)
        for (const d4 of ids)
          for (const d5 of ids) {
            const choices = [d1, d2, d3, d4, d5] as const;
            const run = simulateRun(choices);
            scenarios.push({
              choices,
              outcome: run.outcome === "survived" ? "survived" : "bankrupt",
              endedAtMonth: run.endedAtMonth,
              finalCash: run.finalCash,
              netWorth: run.netWorth,
              grade: run.grade,
            });
          }
  return scenarios;
}
