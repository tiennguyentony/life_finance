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

export type DecisionId =
  | "emergency-fund"
  | "pay-card"
  | "invest-cash"
  | "upgrade-life";

export type EventId = "car-repair" | "layoff" | "medical" | "market-drop";

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

export type StatView = {
  readonly label: string;
  readonly value: string;
  readonly note: string;
  readonly trend?: "up" | "down" | "flat";
};

export type ScoreView = {
  readonly label: string;
  readonly value: number;
  readonly note: string;
  readonly tone: "safe" | "watch" | "danger";
};

export type DashboardView = {
  readonly playerName: string;
  readonly month: string;
  readonly runLabel: string;
  readonly cash: StatView;
  readonly cashFlow: StatView;
  readonly investments: StatView;
  readonly debt: StatView;
  readonly netWorth: StatView;
  readonly resilience: ScoreView;
  readonly exposure: ScoreView;
  readonly sproutEmotion: SproutEmotion;
  readonly sproutLine: string;
};

export type DecisionView = {
  readonly id: DecisionId;
  readonly title: string;
  readonly description: string;
  readonly cost: string;
  readonly impact: string;
  readonly tone: "lime" | "blue" | "gold" | "coral";
};

export type DecisionResult = {
  readonly decisionId: DecisionId;
  readonly confirmation: string;
  readonly dashboard: DashboardView;
};

export type EventView = {
  readonly id: EventId;
  readonly title: string;
  readonly eyebrow: string;
  readonly description: string;
  readonly emotion: SproutEmotion;
  readonly severity: "ouch" | "rough" | "wild";
};

export type EventChange = {
  readonly label: string;
  readonly before: string;
  readonly after: string;
  readonly direction: "up" | "down";
};

export type EventResult = {
  readonly event: EventView;
  readonly changes: readonly EventChange[];
  readonly explanation: string;
  readonly dashboard: DashboardView;
};

export type GeneratedPlayer = {
  readonly player: PlayerView;
  readonly dashboard: DashboardView;
};

export type ServiceOptions = {
  readonly delayMs?: number;
};
