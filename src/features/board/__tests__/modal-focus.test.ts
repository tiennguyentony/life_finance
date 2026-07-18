import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { restoreModalFocus } from "../use-modal-dialog";

describe("modal focus restoration", () => {
  it("restores focus to an explicitly supplied surviving control", () => {
    const focus = vi.fn();

    expect(restoreModalFocus({ focus, isConnected: true }, true)).toBe(true);
    expect(focus).toHaveBeenCalledOnce();
  });

  it("does not steal focus when another modal takes over", () => {
    const focus = vi.fn();

    expect(restoreModalFocus({ focus, isConnected: true }, false)).toBe(false);
    expect(focus).not.toHaveBeenCalled();
  });

  it("does not focus a control that has left the document", () => {
    const focus = vi.fn();

    expect(restoreModalFocus({ focus, isConnected: false }, true)).toBe(false);
    expect(focus).not.toHaveBeenCalled();
  });

  it("wires the initiating destination control through the result dialog", () => {
    const boardSceneSource = readFileSync(new URL("../board-scene.tsx", import.meta.url), "utf8");
    const boardShellSource = readFileSync(new URL("../board-shell.tsx", import.meta.url), "utf8");
    const hudSource = readFileSync(new URL("../hud.tsx", import.meta.url), "utf8");
    const resultDialogSource = readFileSync(
      new URL("../month-result-dialog.tsx", import.meta.url),
      "utf8",
    );

    expect(boardSceneSource).toContain("data-board-destination={island.id}");
    expect(boardSceneSource).toContain("onSelect(island.id, event.currentTarget)");
    expect(boardShellSource).toContain("setPlanningFocusTarget(");
    expect(boardShellSource).toContain("document.querySelector<HTMLElement>");
    expect(boardShellSource).toContain("returnFocusTarget={planningFocusTarget}");
    expect(resultDialogSource).toContain("!result.hasPendingEvent");
    expect(hudSource).toMatch(
      /useModalDialog\(eventVisible,\s*\{\s*returnFocusTarget: eventReturnFocusTarget,\s*\}\)/,
    );
  });
});
