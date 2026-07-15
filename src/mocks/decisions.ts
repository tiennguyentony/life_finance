import type { DecisionView } from "@/types/game";

export const MOCK_DECISIONS = [
  {
    id: "emergency-fund",
    title: "Build emergency fund",
    description: "Hide some money from your future bad ideas.",
    cost: "$300 today",
    impact: "+7 resilience",
    tone: "lime",
  },
  {
    id: "pay-card",
    title: "Pay down credit card",
    description: "Bonk the debt with the truly offensive interest rate.",
    cost: "$500 cash",
    impact: "-6 exposure",
    tone: "blue",
  },
  {
    id: "invest-cash",
    title: "Invest extra cash",
    description: "Send money into the mysterious future machine.",
    cost: "$500 cash",
    impact: "+$500 invested",
    tone: "gold",
  },
  {
    id: "upgrade-life",
    title: "Upgrade lifestyle",
    description: "Buy a little joy. Future you can leave a review.",
    cost: "$250 / month",
    impact: "+12 exposure",
    tone: "coral",
  },
] as const satisfies readonly DecisionView[];
