import { describe, expect, it, vi } from "vitest";

import type {
  InterpretEventResponse,
  RunViewWire,
} from "@/contracts/api/contracts";

import { processInteractiveEventDecision } from "../interactive-event-controller";

function run(): RunViewWire {
  return {
    runId: "run.test",
    revision: 4,
    currentMonth: "2026-10",
    pendingInteraction: {
      kind: "event",
      eventId: "event.test",
      templateId: "personal.test",
      choiceIds: ["safe_choice"],
      choices: [],
      parameters: {},
      headline: "A decision",
      body: "What do you do?",
    },
  } as unknown as RunViewWire;
}

function interpretation(
  status: "mapped" | "rejected" | "question",
): InterpretEventResponse {
  return {
    version: "interactive-event-interpretation-v1",
    status,
    source: "deterministic_fast_path",
    choiceId: status === "mapped" ? "safe_choice" : null,
    confidencePpm: status === "mapped" ? 990_000 : 0,
    latencyMs: 1,
    systemMessage: status === "mapped" ? "Valid action." : "Try again.",
    sproutReaction: "A reaction.",
    education: "A lesson.",
    playerTurn: 1,
    remainingPlayerTurns: 2,
  };
}

describe("interactive event controller", () => {
  it("commits a mapped answer immediately before returning the result", async () => {
    const opening = run();
    const ending = {
      ...opening,
      revision: 5,
      pendingInteraction: { kind: "none" as const },
    } as RunViewWire;
    const submitCommand = vi.fn(async () => ({ run: ending }) as never);

    const result = await processInteractiveEventDecision({
      interpretEvent: async () => interpretation("mapped"),
      submitCommand,
    }, opening, [{ role: "player", content: "I will take the safe choice." }], "command.event.test");

    expect(submitCommand).toHaveBeenCalledWith("run.test", expect.objectContaining({
      id: "command.event.test",
      expectedRevision: 4,
      payload: { eventId: "event.test", choiceId: "safe_choice" },
    }));
    expect(result.committedRun).toBe(ending);
  });

  it.each(["rejected", "question"] as const)(
    "does not commit while interpretation is %s",
    async (status) => {
      const submitCommand = vi.fn();
      const result = await processInteractiveEventDecision({
        interpretEvent: async () => interpretation(status),
        submitCommand,
      }, run(), [{ role: "player", content: "An invalid answer." }], "command.not-used");

      expect(submitCommand).not.toHaveBeenCalled();
      expect(result.committedRun).toBeNull();
    },
  );

  it("forwards an explicit hint choice and commits the server-confirmed mapping", async () => {
    const opening = run();
    const ending = {
      ...opening,
      revision: 5,
      pendingInteraction: { kind: "none" as const },
    } as RunViewWire;
    const interpretEvent = vi.fn(async () => interpretation("mapped"));
    const submitCommand = vi.fn(async () => ({ run: ending }) as never);

    const result = await processInteractiveEventDecision({
      interpretEvent,
      submitCommand,
    }, opening, [{ role: "player", content: "Take the safe choice" }],
    "command.event.hint", "safe_choice");

    expect(interpretEvent).toHaveBeenCalledWith("run.test", expect.objectContaining({
      selectedChoiceId: "safe_choice",
    }));
    expect(submitCommand).toHaveBeenCalledOnce();
    expect(result.committedRun).toBe(ending);
  });
});
