import type {
  BigCityScenarioState,
  EventConsequence,
  FastForwardResult,
  MonthlyProcessItem,
  ScenarioEvent,
  ScenarioEventDecisionId,
  ScenarioPhase,
} from "@/types/game";

export type ScenarioMachine = {
  readonly phase: ScenarioPhase;
  readonly snapshot: BigCityScenarioState;
  readonly pendingEvent: ScenarioEvent | null;
  readonly selectedDecisionId: ScenarioEventDecisionId | null;
  readonly consequence: EventConsequence | null;
  readonly monthlyChanges: readonly MonthlyProcessItem[];
  readonly monthlySummary: string | null;
};

function assertPhase(
  machine: ScenarioMachine,
  expected: ScenarioPhase,
  action: string,
): void {
  if (machine.phase !== expected) {
    throw new Error(`Cannot ${action} from ${machine.phase}`);
  }
}

export function createScenarioMachine(
  snapshot: BigCityScenarioState,
): ScenarioMachine {
  return {
    phase: "active-simulation",
    snapshot,
    pendingEvent: null,
    selectedDecisionId: null,
    consequence: null,
    monthlyChanges: [],
    monthlySummary: null,
  };
}

export function startFastForward(machine: ScenarioMachine): ScenarioMachine {
  assertPhase(machine, "active-simulation", "fast-forward");
  return { ...machine, phase: "fast-forwarding" };
}

export function receiveFastForward(
  machine: ScenarioMachine,
  result: FastForwardResult,
): ScenarioMachine {
  assertPhase(machine, "fast-forwarding", "receive fast-forward");
  return {
    ...machine,
    phase: "pending-event",
    snapshot: result.state,
    pendingEvent: result.event,
    monthlyChanges: result.changes,
    monthlySummary: result.summary,
  };
}

export function openPendingEvent(machine: ScenarioMachine): ScenarioMachine {
  assertPhase(machine, "pending-event", "open event");
  if (!machine.pendingEvent) {
    throw new Error("Cannot open event without an event");
  }
  return { ...machine, phase: "awaiting-decision" };
}

export function selectEventDecision(
  machine: ScenarioMachine,
  decisionId: ScenarioEventDecisionId,
): ScenarioMachine {
  assertPhase(machine, "awaiting-decision", "select event decision");
  return { ...machine, selectedDecisionId: decisionId };
}

export function receiveConsequence(
  machine: ScenarioMachine,
  consequence: EventConsequence,
): ScenarioMachine {
  assertPhase(machine, "awaiting-decision", "receive consequence");
  if (machine.selectedDecisionId !== consequence.decisionId) {
    throw new Error("Consequence does not match the selected decision");
  }
  return { ...machine, phase: "showing-consequence", consequence };
}

export function startReturnToSimulation(
  machine: ScenarioMachine,
): ScenarioMachine {
  assertPhase(machine, "showing-consequence", "return to simulation");
  if (!machine.consequence) {
    throw new Error("Cannot return without a consequence");
  }
  return {
    ...machine,
    phase: "returning-to-simulation",
    snapshot: machine.consequence.state,
  };
}

export function completeReturnToSimulation(
  machine: ScenarioMachine,
): ScenarioMachine {
  assertPhase(machine, "returning-to-simulation", "complete return");
  return {
    ...machine,
    phase: "active-simulation",
    pendingEvent: null,
    selectedDecisionId: null,
    consequence: null,
    monthlyChanges: [],
    monthlySummary: null,
  };
}
