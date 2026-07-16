import type {
  BigCityFinancialState,
  BigCityScenarioState,
  PlayerView,
} from "@/types/game";

const DEFAULT_PLAYER: PlayerView = {
  name: "Alex",
  age: 24,
  location: "San Francisco, California",
  career: "Junior Software Engineer",
  goal: "Build enough runway to survive the city",
};

const STARTING_FINANCIAL_STATE: BigCityFinancialState = {
  monthlyTakeHome: 7200,
  cash: 12000,
  monthlySurplus: 250,
  cashRunwayMonths: 2,
  netWorth: -5500,
  indexInvestments: 4000,
  speculativeInvestments: 0,
  creditCardDebt: 3500,
  studentLoanDebt: 18000,
  availableCredit: 6500,
  lifestyleTier: "Comfortable",
  vulnerability: {
    score: 64,
    label: "Watch",
    tone: "watch",
    reasons: ["Two months of runway", "High fixed city costs"],
  },
  portfolio: {
    assets: [
      { id: "cash", label: "Liquid cash", value: 12000, note: "Checking and HYSA" },
      { id: "index-funds", label: "Index funds", value: 4000, note: "Taxable brokerage" },
    ],
    liabilities: [
      { id: "credit-card", label: "Credit card", value: 3500, note: "High-interest debt" },
      { id: "student-loan", label: "Student loan", value: 18000, note: "Monthly payment active" },
    ],
    liquidResources: 16000,
  },
  cashFlow: {
    items: [
      { id: "income", label: "Take-home income", value: 7200, note: "Monthly salary", direction: "in" },
      { id: "mandatory", label: "Rent and insurance", value: 3050, note: "Required each month", direction: "out" },
      { id: "lifestyle", label: "Comfortable lifestyle", value: 2450, note: "City living", direction: "out" },
      { id: "debt", label: "Debt payments", value: 550, note: "Credit card first", direction: "out" },
      { id: "safety", label: "Emergency savings", value: 600, note: "Recurring allocation", direction: "allocation" },
      { id: "index", label: "Index funds", value: 300, note: "Recurring allocation", direction: "allocation" },
    ],
    unallocatedSurplus: 250,
  },
  banking: {
    checking: 5200,
    highYieldSavings: 6800,
    creditLimit: 10000,
  },
  investments: {
    retirement401k: 0,
    brokerageIndexFunds: 4000,
    speculativeAssets: 0,
  },
};

export function createBigCityStartingState(
  player: PlayerView = DEFAULT_PLAYER,
): BigCityScenarioState {
  return {
    scenarioId: "big-city-survivor",
    scenarioTitle: "Big City Survivor",
    attemptNumber: 1,
    maximumAttempts: 3,
    currentMonth: 1,
    totalMonths: 24,
    calendarLabel: "July 2026",
    player,
    financial: STARTING_FINANCIAL_STATE,
    netWorthHistory: [
      { month: 0, label: "Start", value: -5500 },
      { month: 1, label: "M1", value: -5500 },
    ],
    recentUpdate: {
      eyebrow: "Scenario briefing",
      title: "The city is expensive",
      summary: "Your salary is solid. Your fixed costs leave very little room for surprises.",
      tone: "warning",
    },
    sprout: {
      emotion: "idle",
      line: "Two months of runway. Plenty of time to become responsible.",
    },
    sliceComplete: false,
  };
}

export const BIG_CITY_STARTING_STATE = createBigCityStartingState();
