import {
  createEventConsequence,
  createFastForwardResult,
} from "@/mocks/big-city-event";
import { createBigCityStartingState } from "@/mocks/big-city-scenario";
import type {
  BigCityScenarioState,
  EventConsequence,
  FastForwardResult,
  PlayerView,
  ScenarioEvent,
  ScenarioEventDecisionId,
  ServiceOptions,
} from "@/types/game";

import { mockDelay } from "./mock-delay";

export async function getBigCityScenario(
  options?: ServiceOptions,
  player?: PlayerView,
): Promise<BigCityScenarioState> {
  await mockDelay(options);
  return createBigCityStartingState(player);
}

export async function runBigCityFastForward(
  state: BigCityScenarioState,
  options?: ServiceOptions,
): Promise<FastForwardResult> {
  await mockDelay(options);
  if (state.currentMonth !== 1 || state.sliceComplete) {
    throw new Error("This vertical slice can only process Month 1");
  }
  return createFastForwardResult(state);
}

function isEventDecisionId(value: string): value is ScenarioEventDecisionId {
  return value === "trim-costs" || value === "pay-cash" || value === "use-credit";
}

export async function resolveBigCityEvent(
  state: BigCityScenarioState,
  event: ScenarioEvent,
  decisionId: string,
  options?: ServiceOptions,
): Promise<EventConsequence> {
  await mockDelay(options);
  if (event.id !== "small-stuff-multiplies") {
    throw new Error("Unknown scenario event");
  }
  if (!isEventDecisionId(decisionId)) {
    throw new Error("Unknown event decision");
  }
  return createEventConsequence(state, decisionId);
}
