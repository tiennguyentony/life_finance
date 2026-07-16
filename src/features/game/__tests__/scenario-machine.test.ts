import { describe, expect, it } from "vitest";

import {
  completeReturnToSimulation,
  createScenarioMachine,
  openPendingEvent,
  receiveConsequence,
  receiveFastForward,
  selectEventDecision,
  startFastForward,
  startReturnToSimulation,
} from "../scenario-machine";
import {
  getBigCityScenario,
  resolveBigCityEvent,
  runBigCityFastForward,
} from "@/services/scenario.service";

describe("Big City Survivor scenario machine", () => {
  it("moves through the complete playable event loop", async () => {
    const startingState = await getBigCityScenario({ delayMs: 0 });
    const active = createScenarioMachine(startingState);

    expect(active.phase).toBe("active-simulation");

    const fastForwarding = startFastForward(active);
    expect(fastForwarding.phase).toBe("fast-forwarding");

    const turn = await runBigCityFastForward(startingState, { delayMs: 0 });
    const interrupted = receiveFastForward(fastForwarding, turn);
    expect(interrupted.phase).toBe("pending-event");
    expect(interrupted.pendingEvent?.id).toBe("small-stuff-multiplies");

    const awaitingDecision = openPendingEvent(interrupted);
    expect(awaitingDecision.phase).toBe("awaiting-decision");

    const selected = selectEventDecision(awaitingDecision, "trim-costs");
    expect(selected.selectedDecisionId).toBe("trim-costs");

    const consequence = await resolveBigCityEvent(
      turn.state,
      turn.event,
      "trim-costs",
      { delayMs: 0 },
    );
    const showingConsequence = receiveConsequence(selected, consequence);
    expect(showingConsequence.phase).toBe("showing-consequence");

    const returning = startReturnToSimulation(showingConsequence);
    expect(returning.phase).toBe("returning-to-simulation");
    expect(returning.snapshot.currentMonth).toBe(2);

    const updated = completeReturnToSimulation(returning);
    expect(updated.phase).toBe("active-simulation");
    expect(updated.pendingEvent).toBeNull();
    expect(updated.consequence).toBeNull();
    expect(updated.snapshot.recentUpdate?.title).toBe("Small costs, smaller");
  });

  it("rejects transitions that do not match the current phase", async () => {
    const startingState = await getBigCityScenario({ delayMs: 0 });
    const active = createScenarioMachine(startingState);

    expect(() => openPendingEvent(active)).toThrow(
      "Cannot open event from active-simulation",
    );
    expect(() => completeReturnToSimulation(active)).toThrow(
      "Cannot complete return from active-simulation",
    );
  });
});
