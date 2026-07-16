export type SproutEmotion =
  | "idle"
  | "thinking"
  | "happy"
  | "cry"
  | "shocked"
  | "celebrate";

export type PersonaId =
  | "junior-developer"
  | "educator"
  | "city-survivor";

export type Persona = {
  readonly id: PersonaId;
  readonly name: string;
  readonly eyebrow: string;
  readonly description: string;
  readonly career: string;
  readonly location: string;
  readonly age: number;
  readonly stat: string;
  readonly statLabel: string;
  readonly tone: "lime" | "gold" | "coral";
};

export type ProfileInput = {
  readonly personaId: PersonaId;
  readonly name: string;
  readonly age: string;
  readonly location: string;
  readonly goal: string;
};

export type PlayerView = {
  readonly name: string;
  readonly age: number;
  readonly location: string;
  readonly career: string;
  readonly goal: string;
};

export type GeneratedPlayer = {
  readonly player: PlayerView;
  readonly scenario: BigCityScenarioState;
};

export type ServiceOptions = {
  readonly delayMs?: number;
};

export type ScenarioPhase =
  | "active-simulation"
  | "fast-forwarding"
  | "pending-event"
  | "awaiting-decision"
  | "showing-consequence"
  | "returning-to-simulation";

export type VulnerabilityTone = "stable" | "watch" | "danger";

export type VulnerabilityView = {
  readonly score: number;
  readonly label: string;
  readonly tone: VulnerabilityTone;
  readonly reasons: readonly string[];
};

export type FinancialPositionItem = {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly note: string;
};

export type CashFlowItem = FinancialPositionItem & {
  readonly direction: "in" | "out" | "allocation";
};

export type BigCityFinancialState = {
  readonly monthlyTakeHome: number;
  readonly cash: number;
  readonly monthlySurplus: number;
  readonly cashRunwayMonths: number;
  readonly netWorth: number;
  readonly indexInvestments: number;
  readonly speculativeInvestments: number;
  readonly creditCardDebt: number;
  readonly studentLoanDebt: number;
  readonly availableCredit: number;
  readonly lifestyleTier: "Comfortable";
  readonly vulnerability: VulnerabilityView;
  readonly portfolio: {
    readonly assets: readonly FinancialPositionItem[];
    readonly liabilities: readonly FinancialPositionItem[];
    readonly liquidResources: number;
  };
  readonly cashFlow: {
    readonly items: readonly CashFlowItem[];
    readonly unallocatedSurplus: number;
  };
  readonly banking: {
    readonly checking: number;
    readonly highYieldSavings: number;
    readonly creditLimit: number;
  };
  readonly investments: {
    readonly retirement401k: number;
    readonly brokerageIndexFunds: number;
    readonly speculativeAssets: number;
  };
};

export type NetWorthPoint = {
  readonly month: number;
  readonly label: string;
  readonly value: number;
};

export type ScenarioUpdate = {
  readonly eyebrow: string;
  readonly title: string;
  readonly summary: string;
  readonly tone: "news" | "protected" | "warning";
};

export type BigCityScenarioState = {
  readonly scenarioId: "big-city-survivor";
  readonly scenarioTitle: "Big City Survivor";
  readonly attemptNumber: 1;
  readonly maximumAttempts: 3;
  readonly currentMonth: number;
  readonly totalMonths: 24;
  readonly calendarLabel: string;
  readonly player: PlayerView;
  readonly financial: BigCityFinancialState;
  readonly netWorthHistory: readonly NetWorthPoint[];
  readonly recentUpdate: ScenarioUpdate | null;
  readonly sprout: {
    readonly emotion: SproutEmotion;
    readonly line: string;
  };
  readonly sliceComplete: boolean;
};

export type MonthlyProcessItem = {
  readonly id:
    | "salary"
    | "expenses"
    | "debt-payment"
    | "emergency-savings"
    | "index-investment";
  readonly label: string;
  readonly amount: number;
  readonly direction: "in" | "out" | "allocation";
  readonly note: string;
};

export type ScenarioEventDecisionId =
  | "trim-costs"
  | "pay-cash"
  | "use-credit";

export type ScenarioEventDecision = {
  readonly id: ScenarioEventDecisionId;
  readonly title: string;
  readonly description: string;
  readonly immediateTradeoff: string;
  readonly futureEffect: string;
  readonly tone: "protected" | "neutral" | "danger";
};

export type ScenarioEvent = {
  readonly id: "small-stuff-multiplies";
  readonly eventNumber: 1;
  readonly host: "GM Pengo";
  readonly title: "The Small Stuff Multiplies";
  readonly newspaperName: "The City Ledger";
  readonly headline: string;
  readonly description: string;
  readonly weaknessTested: string;
  readonly amount: number;
  readonly decisions: readonly ScenarioEventDecision[];
};

export type FinancialChange = {
  readonly id: string;
  readonly label: string;
  readonly before: number;
  readonly after: number;
  readonly direction: "up" | "down" | "flat";
  readonly meaning: "positive" | "negative" | "neutral";
};

export type FastForwardResult = {
  readonly state: BigCityScenarioState;
  readonly changes: readonly MonthlyProcessItem[];
  readonly summary: string;
  readonly event: ScenarioEvent;
};

export type EventConsequence = {
  readonly decisionId: ScenarioEventDecisionId;
  readonly title: string;
  readonly summary: string;
  readonly explanation: string;
  readonly persistentEffect: string;
  readonly changes: readonly FinancialChange[];
  readonly state: BigCityScenarioState;
};
