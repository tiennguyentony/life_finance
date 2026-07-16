import { describe, expect, it } from "vitest";

import { simulationMonth } from "../../../core/domain/month";
import {
  deduplicateSnapshotRequestsV2,
  snapshotRequestForMigrationV2,
  snapshotRequestForRunStartV2,
  snapshotRequestsForAcceptedCommandV2,
  type SnapshotPolicyStateV2,
} from "../snapshot-policy-v2";

function state(
  revision: number,
  currentMonth: string,
  options: Readonly<{
    pendingEventId?: string | null;
    terminal?: boolean;
  }> = {},
): SnapshotPolicyStateV2 {
  return {
    revision,
    startMonth: simulationMonth("2026-01"),
    currentMonth: simulationMonth(currentMonth),
    outcome: options.terminal ? { kind: "bankruptcy" } : null,
    gameplay: {
      eventLifecycle: {
        pending: options.pendingEventId
          ? { eventId: options.pendingEventId }
          : null,
      },
    },
  };
}

describe("v2 sparse snapshot policy", () => {
  it("persists run-start and migration anchors with no causal command", () => {
    const initial = state(0, "2026-01");

    expect(snapshotRequestForRunStartV2(initial)).toMatchObject({
      state: initial,
      snapshotKind: "run_start",
      causalCommandId: null,
    });
    expect(snapshotRequestForMigrationV2(initial)).toMatchObject({
      state: initial,
      snapshotKind: "migration",
      causalCommandId: null,
    });
  });

  it("stores no ordinary month and checkpoints each twelve processed months", () => {
    const ordinary = snapshotRequestsForAcceptedCommandV2(
      state(10, "2026-11"),
      state(11, "2026-12"),
      { id: "cmd.month.11", type: "process_month_v2" },
    );
    const annual = snapshotRequestsForAcceptedCommandV2(
      state(11, "2026-12"),
      state(12, "2027-01"),
      { id: "cmd.month.12", type: "process_month_v2" },
    );

    expect(ordinary).toEqual([]);
    expect(annual).toEqual([
      expect.objectContaining({
        state: expect.objectContaining({ revision: 12 }),
        snapshotKind: "checkpoint",
        causalCommandId: "cmd.month.12",
      }),
    ]);
  });

  it.each([
    ["process_month_v2", "evt.automatic"],
    ["queue_ai_world_event_v2", "evt.ai"],
  ])(
    "stores both sides when %s queues a pending event",
    (type, eventId) => {
      const before = state(4, "2026-05");
      const after = state(5, "2026-06", { pendingEventId: eventId });

      expect(
        snapshotRequestsForAcceptedCommandV2(before, after, {
          id: `cmd.${eventId}`,
          type,
        }),
      ).toEqual([
        expect.objectContaining({
          state: before,
          snapshotKind: "before_event",
        }),
        expect.objectContaining({
          state: after,
          snapshotKind: "after_event",
        }),
      ]);
    },
  );

  it("stores both sides when an event choice clears the pending event", () => {
    const before = state(5, "2026-06", { pendingEventId: "evt.choice" });
    const after = state(6, "2026-06");

    expect(
      snapshotRequestsForAcceptedCommandV2(before, after, {
        id: "cmd.event.choice",
        type: "resolve_event_choice",
      }),
    ).toEqual([
      expect.objectContaining({
        state: before,
        snapshotKind: "before_event",
      }),
      expect.objectContaining({
        state: after,
        snapshotKind: "after_event",
      }),
    ]);
  });

  it("stores both sides of a milestone decision", () => {
    const before = state(7, "2026-08");
    const after = state(8, "2026-08");

    expect(
      snapshotRequestsForAcceptedCommandV2(before, after, {
        id: "cmd.milestone",
        type: "manage_life_milestone",
      }),
    ).toEqual([
      expect.objectContaining({
        state: before,
        snapshotKind: "before_milestone",
      }),
      expect.objectContaining({
        state: after,
        snapshotKind: "after_milestone",
      }),
    ]);
  });

  it("deduplicates same-revision reasons by stable priority", () => {
    const terminal = state(12, "2027-01", { terminal: true });
    const requests = deduplicateSnapshotRequestsV2([
      {
        state: terminal,
        snapshotKind: "checkpoint",
        causalCommandId: "cmd.final",
      },
      {
        state: terminal,
        snapshotKind: "after_event",
        causalCommandId: "cmd.final",
      },
      {
        state: terminal,
        snapshotKind: "terminal",
        causalCommandId: "cmd.final",
      },
    ]);

    expect(requests).toEqual([
      expect.objectContaining({
        state: terminal,
        snapshotKind: "terminal",
        causalCommandId: "cmd.final",
      }),
    ]);
  });
});
