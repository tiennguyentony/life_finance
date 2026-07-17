import type {
  BigCityFinancialState,
  BigCityScenarioState,
  EventConsequence,
  FastForwardResult,
  ScenarioEvent,
  ScenarioEventDecisionId,
} from "@/types/game";

export const SMALL_STUFF_EVENT: ScenarioEvent = {
  id: "small-stuff-multiplies",
  eventNumber: 1,
  host: "GM Pengo",
  title: "The Small Stuff Multiplies",
  newspaperName: "The City Ledger",
  headline: "Tiny charges form organized group",
  description:
    "Parking, subscriptions, and city fees found each other. This month, they want $180.",
  weaknessTested: "Lifestyle creep and limited monthly surplus",
  amount: 180,
  decisions: [
    {
      id: "trim-costs",
      title: "Trim the leaks",
      description: "Pay the bill and cancel the costs you barely notice.",
      immediateTradeoff: "$180 cash today",
      futureEffect: "+$120 monthly surplus",
      tone: "protected",
    },
    {
      id: "pay-cash",
      title: "Absorb the hit",
      description: "Pay from cash and keep the comfortable setup unchanged.",
      immediateTradeoff: "$180 cash today",
      futureEffect: "No recurring change",
      tone: "neutral",
    },
    {
      id: "use-credit",
      title: "Put it on credit",
      description: "Keep cash intact and let the card carry the surprise.",
      immediateTradeoff: "+$180 card debt",
      futureEffect: "Less credit, more exposure",
      tone: "danger",
    },
  ],
};

function createProcessedFinancialState(): BigCityFinancialState {
  return {
    monthlyTakeHome: 7200,
    cash: 12850,
    monthlySurplus: 250,
    cashRunwayMonths: 2.1,
    netWorth: -3800,
    indexInvestments: 4300,
    speculativeInvestments: 0,
    creditCardDebt: 2950,
    studentLoanDebt: 18000,
    availableCredit: 7050,
    lifestyleTier: "Comfortable",
    vulnerability: {
      score: 62,
      label: "Watch",
      tone: "watch",
      reasons: ["Runway is improving", "Fixed costs remain high"],
    },
    portfolio: {
      assets: [
        { id: "cash", label: "Liquid cash", value: 12850, note: "Checking and HYSA" },
        { id: "index-funds", label: "Index funds", value: 4300, note: "$300 added this month" },
      ],
      liabilities: [
        { id: "credit-card", label: "Credit card", value: 2950, note: "$550 payment processed" },
        { id: "student-loan", label: "Student loan", value: 18000, note: "Monthly payment active" },
      ],
      liquidResources: 17150,
    },
    cashFlow: {
      items: [
        { id: "income", label: "Take-home income", value: 7200, note: "Salary processed", direction: "in" },
        { id: "mandatory", label: "Rent and insurance", value: 3050, note: "Paid automatically", direction: "out" },
        { id: "lifestyle", label: "Comfortable lifestyle", value: 2450, note: "City living", direction: "out" },
        { id: "debt", label: "Debt payments", value: 550, note: "Applied to credit card", direction: "out" },
        { id: "safety", label: "Emergency savings", value: 600, note: "Moved to HYSA", direction: "allocation" },
        { id: "index", label: "Index funds", value: 300, note: "Invested automatically", direction: "allocation" },
      ],
      unallocatedSurplus: 250,
    },
    banking: {
      checking: 5450,
      highYieldSavings: 7400,
      creditLimit: 10000,
    },
    investments: {
      retirement401k: 0,
      brokerageIndexFunds: 4300,
      speculativeAssets: 0,
    },
  };
}

export function createFastForwardResult(
  state: BigCityScenarioState,
): FastForwardResult {
  return {
    state: {
      ...state,
      currentMonth: 2,
      calendarLabel: "August 2026",
      financial: createProcessedFinancialState(),
      netWorthHistory: [
        ...state.netWorthHistory,
        { month: 2, label: "M2", value: -3800 },
      ],
      recentUpdate: {
        eyebrow: "Month 2 processed",
        title: "The plan moved forward",
        summary: "Salary arrived, routine costs cleared, debt fell, and your safety buffer grew.",
        tone: "protected",
      },
      sprout: {
        emotion: "happy",
        line: "Bills paid themselves. I supervised aggressively.",
      },
    },
    changes: [
      { id: "salary", label: "Salary", amount: 7200, direction: "in", note: "Take-home pay" },
      { id: "expenses", label: "Expenses", amount: 5500, direction: "out", note: "Rent, insurance, and lifestyle" },
      { id: "debt-payment", label: "Debt payment", amount: 550, direction: "out", note: "Credit card balance reduced" },
      { id: "emergency-savings", label: "Emergency savings", amount: 600, direction: "allocation", note: "Moved to HYSA" },
      { id: "index-investment", label: "Index funds", amount: 300, direction: "allocation", note: "Invested automatically" },
    ],
    summary: "One month processed. A city expense is waiting in the morning paper.",
    event: SMALL_STUFF_EVENT,
  };
}

type OutcomeDefinition = Omit<EventConsequence, "state"> & {
  readonly financial: BigCityFinancialState;
};

function withFinancialUpdates(
  base: BigCityFinancialState,
  updates: Partial<BigCityFinancialState>,
): BigCityFinancialState {
  return { ...base, ...updates };
}

function createTrimCostsOutcome(base: BigCityFinancialState): OutcomeDefinition {
  const cashAfterPayment = 12670;
  return {
    decisionId: "trim-costs",
    title: "Small costs, smaller",
    summary: "You paid the surprise and cut $120 from future monthly spending.",
    explanation: "Your cash took a small hit, but lower recurring costs made every future month safer.",
    persistentEffect: "Comfortable lifestyle now costs $120 less each month.",
    changes: [
      { id: "cash", label: "Available cash", before: base.cash, after: cashAfterPayment, direction: "down", meaning: "negative" },
      { id: "surplus", label: "Monthly surplus", before: base.monthlySurplus, after: 370, direction: "up", meaning: "positive" },
      { id: "vulnerability", label: "Vulnerability", before: base.vulnerability.score, after: 56, direction: "down", meaning: "positive" },
    ],
    financial: withFinancialUpdates(base, {
      cash: cashAfterPayment,
      monthlySurplus: 370,
      cashRunwayMonths: 2.1,
      netWorth: -3980,
      vulnerability: {
        score: 56,
        label: "Improving",
        tone: "watch",
        reasons: ["Recurring costs are lower", "Emergency savings are growing"],
      },
      portfolio: {
        ...base.portfolio,
        assets: base.portfolio.assets.map((item) =>
          item.id === "cash" ? { ...item, value: cashAfterPayment } : item,
        ),
        liquidResources: 16970,
      },
      cashFlow: {
        items: base.cashFlow.items.map((item) =>
          item.id === "lifestyle" ? { ...item, value: 2330, note: "Subscriptions trimmed" } : item,
        ),
        unallocatedSurplus: 370,
      },
      banking: { ...base.banking, checking: 5270 },
    }),
  };
}

function createPayCashOutcome(base: BigCityFinancialState): OutcomeDefinition {
  const cashAfterPayment = 12670;
  return {
    decisionId: "pay-cash",
    title: "Cash handled it",
    summary: "You paid the $180 bill without adding debt or changing your lifestyle.",
    explanation: "Your liquid buffer absorbed the surprise, but the same recurring pressure remains.",
    persistentEffect: "No recurring strategy changed.",
    changes: [
      { id: "cash", label: "Available cash", before: base.cash, after: cashAfterPayment, direction: "down", meaning: "negative" },
      { id: "runway", label: "Cash runway", before: base.cashRunwayMonths, after: 2.1, direction: "flat", meaning: "neutral" },
    ],
    financial: withFinancialUpdates(base, {
      cash: cashAfterPayment,
      netWorth: -3980,
      portfolio: {
        ...base.portfolio,
        assets: base.portfolio.assets.map((item) =>
          item.id === "cash" ? { ...item, value: cashAfterPayment } : item,
        ),
        liquidResources: 16970,
      },
      banking: { ...base.banking, checking: 5270 },
    }),
  };
}

function createUseCreditOutcome(base: BigCityFinancialState): OutcomeDefinition {
  return {
    decisionId: "use-credit",
    title: "Cash preserved, debt added",
    summary: "You kept the cash and moved the $180 surprise onto the credit card.",
    explanation: "The runway stayed intact, but less available credit and more expensive debt increased your exposure.",
    persistentEffect: "Credit-card debt is $180 higher until a future payment removes it.",
    changes: [
      { id: "credit-card", label: "Credit-card debt", before: base.creditCardDebt, after: 3130, direction: "up", meaning: "negative" },
      { id: "available-credit", label: "Available credit", before: base.availableCredit, after: 6870, direction: "down", meaning: "negative" },
      { id: "vulnerability", label: "Vulnerability", before: base.vulnerability.score, after: 72, direction: "up", meaning: "negative" },
    ],
    financial: withFinancialUpdates(base, {
      creditCardDebt: 3130,
      availableCredit: 6870,
      netWorth: -3980,
      vulnerability: {
        score: 72,
        label: "Danger",
        tone: "danger",
        reasons: ["High-interest debt increased", "Fixed city costs remain high"],
      },
      portfolio: {
        ...base.portfolio,
        liabilities: base.portfolio.liabilities.map((item) =>
          item.id === "credit-card" ? { ...item, value: 3130, note: "Event charge added" } : item,
        ),
      },
    }),
  };
}

function createOutcomeDefinitions(
  base: BigCityFinancialState,
): Record<ScenarioEventDecisionId, OutcomeDefinition> {
  return {
    "trim-costs": createTrimCostsOutcome(base),
    "pay-cash": createPayCashOutcome(base),
    "use-credit": createUseCreditOutcome(base),
  };
}

export function createEventConsequence(
  state: BigCityScenarioState,
  decisionId: ScenarioEventDecisionId,
): EventConsequence {
  const definition = createOutcomeDefinitions(state.financial)[decisionId];
  const sproutLine =
    decisionId === "trim-costs"
      ? "We defeated subscriptions. Their leader was parking."
      : decisionId === "pay-cash"
        ? "Cash took the hit. Dignity remains mostly liquid."
        : "The card volunteered. The interest rate also volunteered.";

  return {
    ...definition,
    state: {
      ...state,
      financial: definition.financial,
      netWorthHistory: state.netWorthHistory.map((point) =>
        point.month === state.currentMonth
          ? { ...point, value: definition.financial.netWorth }
          : point,
      ),
      recentUpdate: {
        eyebrow: "The City Ledger follow-up",
        title: definition.title,
        summary: definition.summary,
        tone: decisionId === "use-credit" ? "warning" : "protected",
      },
      sprout: {
        emotion: decisionId === "use-credit" ? "shocked" : "happy",
        line: sproutLine,
      },
      sliceComplete: true,
    },
  };
}
