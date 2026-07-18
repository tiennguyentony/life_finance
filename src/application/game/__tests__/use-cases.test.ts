import { describe, expect, it } from "vitest";

import type { GameCommandV2Public } from "@/server/api/contracts-v2";

import { getRun, submitCommand } from "../use-cases";
import { currentRunState } from "./run-state.fixture";

describe("game application use cases", () => {
  it("projects authorized state reads into RunView", async () => {
    const state = currentRunState();
    const service = {
      getRun: async () => ({ state, stateChecksum: "a".repeat(64) }),
    };

    await expect(
      getRun(service, "run.current", `lf_run_${"a".repeat(43)}`),
    ).resolves.toMatchObject({
      run: { runId: "run.current", revision: 0 },
      stateChecksum: "a".repeat(64),
    });
  });

  it("adds the server-owned schema and effective month to command intent", async () => {
    const state = currentRunState();
    let received: GameCommandV2Public | null = null;
    const service = {
      getRun: async () => Promise.reject(new Error("redundant state read")),
      submitCommand: async (
        _runId: string,
        _secret: string,
        command: GameCommandV2Public,
      ) => {
        received = command;
        return {
          state,
          stateChecksum: "a".repeat(64),
          idempotentReplay: false,
          monthlyRecord: null,
        };
      },
    };

    const response = await submitCommand(
      service,
      "run.current",
      `lf_run_${"a".repeat(43)}`,
      {
        id: "ui.command.1",
        expectedRevision: 0,
        effectiveMonth: "2026-07",
        type: "resolve_event_choice",
        payload: { eventId: "event.1", choiceId: "choice.1" },
      },
    );

    expect(received).toEqual({
      schemaVersion: 2,
      effectiveMonth: "2026-07",
      id: "ui.command.1",
      expectedRevision: 0,
      type: "resolve_event_choice",
      payload: { eventId: "event.1", choiceId: "choice.1" },
    });
    expect(response).toMatchObject({
      run: { runId: "run.current" },
      stateChecksum: "a".repeat(64),
      result: { idempotentReplay: false },
    });
    expect(response).not.toHaveProperty("state");
  });
});
