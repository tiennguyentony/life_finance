import { MOCK_DASHBOARD_BY_DECISION } from "@/mocks/dashboard";
import { MOCK_DECISIONS } from "@/mocks/decisions";
import { MOCK_EVENT_BY_DECISION } from "@/mocks/events";
import type {
  DecisionId,
  DecisionResult,
  DecisionView,
  EventResult,
  ServiceOptions,
} from "@/types/game";

import { mockDelay } from "./mock-delay";

function isDecisionId(value: string): value is DecisionId {
  return MOCK_DECISIONS.some((decision) => decision.id === value);
}

export async function getDecisionOptions(
  options?: ServiceOptions,
): Promise<readonly DecisionView[]> {
  await mockDelay(options);
  return MOCK_DECISIONS;
}

export async function submitDecision(
  decisionId: string,
  options?: ServiceOptions,
): Promise<DecisionResult> {
  await mockDelay(options);
  if (!isDecisionId(decisionId)) {
    throw new Error("Unknown decision");
  }

  const decision = MOCK_DECISIONS.find((item) => item.id === decisionId);
  return {
    decisionId,
    confirmation: `${decision?.title ?? "Decision"} locked in.`,
    dashboard: MOCK_DASHBOARD_BY_DECISION[decisionId],
  };
}

export async function getNextEvent(
  decisionId: string,
  options?: ServiceOptions,
): Promise<EventResult> {
  await mockDelay(options);
  if (!isDecisionId(decisionId)) {
    throw new Error("Unknown decision");
  }

  return MOCK_EVENT_BY_DECISION[decisionId];
}
