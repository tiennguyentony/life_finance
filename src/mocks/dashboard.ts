import type { DashboardView, DecisionId, EventId } from "@/types/game";

export const MOCK_STARTING_DASHBOARD: DashboardView = {
  playerName: "Alex",
  month: "JUL 2026",
  runLabel: "Month 01",
  cash: { label: "Cash", value: "$3,140", note: "1.4 months of runway", trend: "flat" },
  cashFlow: { label: "Monthly flow", value: "+$820", note: "After the usual damage", trend: "up" },
  investments: { label: "Investments", value: "$7,800", note: "+4.2% this year", trend: "up" },
  debt: { label: "Total debt", value: "$27,900", note: "$3,900 is on cards", trend: "down" },
  netWorth: { label: "Net worth", value: "-$16,960", note: "The comeback starts here", trend: "up" },
  resilience: { label: "Resilience", value: 44, note: "One weird bill hurts", tone: "watch" },
  exposure: { label: "Exposure", value: 68, note: "Debt plus high fixed costs", tone: "danger" },
  sproutEmotion: "idle",
  sproutLine: "We have income. We have vibes. A plan would also help.",
};

const decisionDashboard = (
  changes: Partial<DashboardView>,
): DashboardView => ({ ...MOCK_STARTING_DASHBOARD, ...changes });

export const MOCK_DASHBOARD_BY_DECISION: Record<DecisionId, DashboardView> = {
  "emergency-fund": decisionDashboard({
    cash: { label: "Cash", value: "$3,440", note: "$300 moved to safety", trend: "up" },
    cashFlow: { label: "Monthly flow", value: "+$520", note: "Safety first this month", trend: "down" },
    resilience: { label: "Resilience", value: 51, note: "The cushion is growing", tone: "safe" },
    sproutEmotion: "happy",
    sproutLine: "A tiny pile of safety money. I shall sit on it.",
  }),
  "pay-card": decisionDashboard({
    cash: { label: "Cash", value: "$2,640", note: "$500 sent to the card", trend: "down" },
    debt: { label: "Total debt", value: "$27,400", note: "Card balance is shrinking", trend: "down" },
    netWorth: { label: "Net worth", value: "-$16,960", note: "Same total, cleaner shape", trend: "flat" },
    exposure: { label: "Exposure", value: 62, note: "Less expensive debt", tone: "watch" },
    sproutEmotion: "celebrate",
    sproutLine: "The card got bonked. Financial violence, but wholesome.",
  }),
  "invest-cash": decisionDashboard({
    cash: { label: "Cash", value: "$2,640", note: "$500 entered the market", trend: "down" },
    investments: { label: "Investments", value: "$8,300", note: "Long game activated", trend: "up" },
    sproutEmotion: "idle",
    sproutLine: "Line goes up eventually. I read that on the internet.",
  }),
  "upgrade-life": decisionDashboard({
    cashFlow: { label: "Monthly flow", value: "+$570", note: "More joy, less margin", trend: "down" },
    exposure: { label: "Exposure", value: 74, note: "Fixed costs got chunkier", tone: "danger" },
    sproutEmotion: "happy",
    sproutLine: "The apartment has sunlight now. Worth it? Ask future us.",
  }),
};

const eventDashboard = (
  decision: DecisionId,
  changes: Partial<DashboardView>,
): DashboardView => ({
  ...MOCK_DASHBOARD_BY_DECISION[decision],
  month: "AUG 2026",
  runLabel: "Month 02",
  ...changes,
});

export const MOCK_DASHBOARD_BY_EVENT: Record<EventId, DashboardView> = {
  "car-repair": eventDashboard("pay-card", {
    cash: { label: "Cash", value: "$1,440", note: "The car ate $1,200", trend: "down" },
    netWorth: { label: "Net worth", value: "-$18,160", note: "Repairs are rude like that", trend: "down" },
    resilience: { label: "Resilience", value: 34, note: "Buffer took a direct hit", tone: "danger" },
    sproutEmotion: "shocked",
    sproutLine: "The car made a noise. The noise cost twelve hundred dollars.",
  }),
  layoff: eventDashboard("upgrade-life", {
    cashFlow: { label: "Monthly flow", value: "-$2,480", note: "Income temporarily offline", trend: "down" },
    exposure: { label: "Exposure", value: 91, note: "Fixed costs have entered chat", tone: "danger" },
    sproutEmotion: "cry",
    sproutLine: "Plot twist: the job was not family after all.",
  }),
  medical: eventDashboard("emergency-fund", {
    cash: { label: "Cash", value: "$2,540", note: "$900 bill absorbed", trend: "down" },
    resilience: { label: "Resilience", value: 46, note: "The new buffer did its job", tone: "watch" },
    sproutEmotion: "happy",
    sproutLine: "Ouch. But we paid it without summoning the credit-card dragon.",
  }),
  "market-drop": eventDashboard("invest-cash", {
    investments: { label: "Investments", value: "$7,470", note: "A rough market month", trend: "down" },
    netWorth: { label: "Net worth", value: "-$17,790", note: "Paper loss, real feelings", trend: "down" },
    sproutEmotion: "shocked",
    sproutLine: "The line went down. I was told there would be up.",
  }),
};
