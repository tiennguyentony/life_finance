import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const boardStyles = readFileSync(new URL("../../../app/styles/board.css", import.meta.url), "utf8");

describe("strategy board styles", () => {
  it("gives strategy planning a desktop side sheet and distinct selected plan", () => {
    expect(boardStyles).toMatch(/\.board-planning-panel\s*\{[\s\S]*?top:\s*7\.25rem;[\s\S]*?right:\s*1\.25rem;[\s\S]*?width:\s*min\(25rem, calc\(100vw - 2\.5rem\)\);/);
    expect(boardStyles).toMatch(/\.board-plan-card\[aria-pressed="true"\]\s*\{[\s\S]*?transform:\s*translateY\(2px\);/);
    expect(boardStyles).toContain(".board-plan-card small");
    expect(boardStyles).toContain(".board-plan-disabled-reason");
    expect(boardStyles).toContain(".board-planning-panel [role=\"alert\"]");
  });

  it("styles result and event choices with readable direction details", () => {
    expect(boardStyles).toMatch(/\.board-month-result-dialog\s*\{[\s\S]*?max-height:\s*calc\(100dvh - 2rem\);[\s\S]*?overflow:\s*auto;/);
    expect(boardStyles).toContain(".board-month-result-deltas");
    expect(boardStyles).toContain(".board-month-result-deltas dd");
    expect(boardStyles).toContain(".board-month-result-highlight");
    expect(boardStyles).toMatch(/\.board-month-result-actions\s*\{[^}]*display:\s*grid;/);
    expect(boardStyles).toMatch(/\.board-month-result-actions button \+ button\s*\{[^}]*background:\s*var\(--paper-deep\);/);
    expect(boardStyles).toMatch(/\.board-event-dialog\s*\{[\s\S]*?max-height:\s*calc\(100dvh - 2rem\);[\s\S]*?overflow:\s*auto;/);
    expect(boardStyles).toMatch(/\.board-event-dialog\s*\{[^}]*color:\s*var\(--ink\);/);
    expect(boardStyles).toMatch(/\.board-event-dialog > span\s*\{[^}]*color:\s*var\(--ink\);/);
    expect(boardStyles).toMatch(/\.board-event-dialog button span\s*\{[^}]*color:\s*#27472d;/);
    expect(boardStyles).toContain(".board-event-dialog button span");
  });

  it("uses a compact bottom sheet and disables planning motion on narrow or reduced-motion screens", () => {
    expect(boardStyles).toMatch(/@media \(max-width: 760px\)\s*\{[\s\S]*?\.board-planning-panel\s*\{[\s\S]*?top:\s*auto;[\s\S]*?bottom:\s*0\.65rem;/);
    expect(boardStyles).toMatch(/@media \(max-width: 760px\)\s*\{[\s\S]*?\.board-planning-actions\s*\{[^}]*position:\s*sticky;[^}]*bottom:\s*0;[^}]*background:\s*rgb\(255 253 246\);/);
    expect(boardStyles).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.board-plan-card/);
    expect(boardStyles).toContain(".board-month-result-dialog");
  });
});
