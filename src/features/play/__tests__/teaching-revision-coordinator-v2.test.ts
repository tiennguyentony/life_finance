import { describe, expect, it } from "vitest";

import {
  rebaseStateBoundCommandV2,
  TeachingRevisionCoordinatorV2,
} from "../teaching-revision-coordinator-v2";

describe("Teaching v2 revision-operation coordination", () => {
  it("serializes a player operation behind an in-flight automatic teaching write", async () => {
    const coordinator = new TeachingRevisionCoordinatorV2();
    const order: string[] = [];
    let releaseAutomatic!: () => void;
    const automaticGate = new Promise<void>((resolve) => {
      releaseAutomatic = resolve;
    });

    const automatic = coordinator.run(async () => {
      order.push("automatic:start");
      await automaticGate;
      order.push("automatic:end");
      return 1;
    });
    const player = coordinator.run(async () => {
      order.push("player:start");
      return 2;
    });

    await Promise.resolve();
    expect(order).toEqual(["automatic:start"]);
    releaseAutomatic();
    await expect(Promise.all([automatic, player])).resolves.toEqual([1, 2]);
    expect(order).toEqual(["automatic:start", "automatic:end", "player:start"]);
  });

  it("does not let a failed additive teaching request poison later player work", async () => {
    const coordinator = new TeachingRevisionCoordinatorV2();
    const automatic = coordinator.run(async () => {
      throw new Error("teaching unavailable");
    });
    const player = coordinator.run(async () => "player accepted");

    await expect(automatic).rejects.toThrow("teaching unavailable");
    await expect(player).resolves.toBe("player accepted");
  });

  it.each(["submit", "advance", "teaching"])(
    "invalidates an in-flight %s response when the player resets the session",
    async (operationName) => {
      const coordinator = new TeachingRevisionCoordinatorV2();
      const session = coordinator.captureSession();
      let releaseResponse!: () => void;
      const responseGate = new Promise<void>((resolve) => {
        releaseResponse = resolve;
      });
      let restoredState: string | null = null;

      const operation = coordinator.run(async () => {
        await responseGate;
        if (coordinator.isSessionCurrent(session)) restoredState = operationName;
      });

      await Promise.resolve();
      coordinator.reset();
      releaseResponse();
      await operation;

      expect(restoredState).toBeNull();
    },
  );

  it("allows rebasing only across an explicitly recorded teaching-only revision chain", () => {
    const coordinator = new TeachingRevisionCoordinatorV2();
    const command = {
      id: "action.1",
      expectedRevision: 4,
      effectiveMonth: "2030-05",
    };

    coordinator.recordTeachingOnlyRevision(
      { revision: 4, currentMonth: "2030-05" },
      { revision: 5, currentMonth: "2030-05" },
    );
    coordinator.recordTeachingOnlyRevision(
      { revision: 5, currentMonth: "2030-05" },
      { revision: 6, currentMonth: "2030-05" },
    );

    expect(coordinator.canRebaseAcrossTeachingOnly(command, {
      revision: 6,
      currentMonth: "2030-05",
    })).toBe(true);
    expect(rebaseStateBoundCommandV2(command, {
      revision: 6,
      currentMonth: "2030-05",
    })).toMatchObject({ expectedRevision: 6, effectiveMonth: "2030-05" });
  });

  it("refuses to rebase across an unrecorded player revision or month change", () => {
    const coordinator = new TeachingRevisionCoordinatorV2();
    const command = {
      id: "action.2",
      expectedRevision: 8,
      effectiveMonth: "2031-01",
    };

    coordinator.recordTeachingOnlyRevision(
      { revision: 8, currentMonth: "2031-01" },
      { revision: 9, currentMonth: "2031-01" },
    );

    expect(coordinator.canRebaseAcrossTeachingOnly(command, {
      revision: 10,
      currentMonth: "2031-01",
    })).toBe(false);
    expect(coordinator.canRebaseAcrossTeachingOnly(command, {
      revision: 9,
      currentMonth: "2031-02",
    })).toBe(false);
  });
});
