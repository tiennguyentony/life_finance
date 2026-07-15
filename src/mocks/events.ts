import { MOCK_DASHBOARD_BY_EVENT } from "./dashboard";

import type { DecisionId, EventResult } from "@/types/game";

export const MOCK_EVENT_BY_DECISION: Record<DecisionId, EventResult> = {
  "emergency-fund": {
    event: {
      id: "medical",
      title: "Medical bill materializes",
      eyebrow: "Life event 02",
      description: "A harmless-looking ankle chose financial violence.",
      emotion: "happy",
      severity: "ouch",
    },
    changes: [
      { label: "Cash", before: "$3,440", after: "$2,540", direction: "down" },
      { label: "Resilience", before: "51", after: "46", direction: "down" },
    ],
    explanation: "Your fresh emergency buffer kept the bill off your credit card.",
    dashboard: MOCK_DASHBOARD_BY_EVENT.medical,
  },
  "pay-card": {
    event: {
      id: "car-repair",
      title: "Car repair ambush",
      eyebrow: "Life event 02",
      description: "Your transmission has submitted a very expensive resignation letter.",
      emotion: "shocked",
      severity: "rough",
    },
    changes: [
      { label: "Cash", before: "$2,640", after: "$1,440", direction: "down" },
      { label: "Resilience", before: "44", after: "34", direction: "down" },
    ],
    explanation: "Paying debt helped long term, but your small cash buffer took the full hit.",
    dashboard: MOCK_DASHBOARD_BY_EVENT["car-repair"],
  },
  "invest-cash": {
    event: {
      id: "market-drop",
      title: "The market does a backflip",
      eyebrow: "Life event 02",
      description: "Stocks discovered gravity immediately after you invested.",
      emotion: "shocked",
      severity: "wild",
    },
    changes: [
      { label: "Investments", before: "$8,300", after: "$7,470", direction: "down" },
      { label: "Net worth", before: "-$16,960", after: "-$17,790", direction: "down" },
    ],
    explanation: "Your cash stayed safe, but the money you just invested met short-term volatility.",
    dashboard: MOCK_DASHBOARD_BY_EVENT["market-drop"],
  },
  "upgrade-life": {
    event: {
      id: "layoff",
      title: "Surprise calendar invite",
      eyebrow: "Life event 02",
      description: "The meeting was not, in fact, about your exciting future at the company.",
      emotion: "cry",
      severity: "wild",
    },
    changes: [
      { label: "Monthly flow", before: "+$570", after: "-$2,480", direction: "down" },
      { label: "Exposure", before: "74", after: "91", direction: "up" },
    ],
    explanation: "The lifestyle upgrade raised fixed costs right before your income disappeared.",
    dashboard: MOCK_DASHBOARD_BY_EVENT.layoff,
  },
};
