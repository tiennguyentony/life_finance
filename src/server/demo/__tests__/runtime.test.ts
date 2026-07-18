import { describe, expect, it, vi } from "vitest";

import type { CommandRunner } from "@/application/game/use-cases";

import {
  createLocalDemoRuntime,
  isLocalDemoEnabled,
} from "../runtime";

describe("local demo runtime", () => {
  it("is enabled only for the development server", () => {
    expect(isLocalDemoEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(isLocalDemoEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(isLocalDemoEnabled({ NODE_ENV: "test" })).toBe(false);
  });

  it("creates a playable run and processes a month through the real service", async () => {
    const runtime = createLocalDemoRuntime();
    const created = await runtime.createRun();
    const persistentFactory = vi.fn<() => CommandRunner>();
    const gateway = runtime.createRunGateway(persistentFactory);

    const opened = await gateway.getRun(created.runId, created.accessSecret);
    const advanced = await gateway.submitCommand(
      created.runId,
      created.accessSecret,
      {
        schemaVersion: 2,
        id: "demo.month.1",
        type: "process_month",
        expectedRevision: opened.state.revision,
        effectiveMonth: opened.state.currentMonth,
        payload: {},
      },
    );

    expect(runtime.hasRun(created.runId)).toBe(true);
    expect(advanced.state.revision).toBe(opened.state.revision + 1);
    expect(advanced.state.currentMonth).not.toBe(opened.state.currentMonth);
    expect(advanced.monthlyRecord).not.toBeNull();
    expect(persistentFactory).not.toHaveBeenCalled();
  });

  it("delegates unknown run ids to the lazy persistent service", async () => {
    const runtime = createLocalDemoRuntime();
    const getRun = vi.fn(async () => {
      throw new Error("persistent service reached");
    });
    const persistentFactory = vi.fn(
      () =>
        ({
          getRun,
          submitCommand: vi.fn(),
        }) as unknown as CommandRunner,
    );
    const gateway = runtime.createRunGateway(persistentFactory);

    await expect(
      gateway.getRun(
        "22222222-2222-4222-8222-222222222222",
        `lf_run_${"b".repeat(43)}`,
      ),
    ).rejects.toThrow("persistent service reached");
    expect(persistentFactory).toHaveBeenCalledOnce();
    expect(getRun).toHaveBeenCalledOnce();
  });
});
