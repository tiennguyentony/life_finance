import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  DemoLaunchButton,
  launchLocalDemo,
} from "../demo-launch-button";

describe("DemoLaunchButton", () => {
  it("renders an explicit button instead of linking around the backend", () => {
    const markup = renderToStaticMarkup(<DemoLaunchButton />);

    expect(markup).toContain("Instant demo");
    expect(markup).toContain('type="button"');
    expect(markup).not.toContain('href="/board"');
  });

  it("creates the backend session before opening the canonical board", async () => {
    const createDemoRun = vi.fn(async () => ({ ok: true }));
    const navigate = vi.fn();

    await launchLocalDemo({ createDemoRun }, navigate);

    expect(createDemoRun).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("/board");
  });

  it("does not navigate when demo creation fails", async () => {
    const navigate = vi.fn();

    await expect(
      launchLocalDemo(
        {
          createDemoRun: vi.fn(async () => {
            throw new Error("demo unavailable");
          }),
        },
        navigate,
      ),
    ).rejects.toThrow("demo unavailable");
    expect(navigate).not.toHaveBeenCalled();
  });
});
