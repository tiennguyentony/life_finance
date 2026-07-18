import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const boardShellSource = readFileSync(new URL("../board-shell.tsx", import.meta.url), "utf8");
const boardSceneSource = readFileSync(new URL("../board-scene.tsx", import.meta.url), "utf8");
const hudSource = readFileSync(new URL("../hud.tsx", import.meta.url), "utf8");

describe("board mode integration", () => {
  it("keeps the three board modes and their distinct selection paths", () => {
    expect(boardSceneSource).toMatch(/export type BoardMode = "strategy" \| "free" \| "loop"/);
    expect(boardShellSource).toMatch(
      /if \(mode === "free"\)\s*\{\s*dispatch\(\{ type: "free-select", islandId \}\)/,
    );
    expect(boardShellSource).toMatch(
      /if \(mode === "loop"\)\s*\{[\s\S]*?dispatch\(\{ type: "loop-bounce" \}\)/,
    );
  });

  it("connects loop movement and track navigation to the rendered scene", () => {
    expect(boardShellSource).toContain('{ type: "loop-advance" }');
    expect(boardShellSource).toMatch(/hop=\{mode === "strategy" \? null : nav\.hop\}/);
    expect(boardShellSource).toMatch(
      /flagIslandId=\{mode === "loop" \? destinationLandmarkId\(nav\.trackIndex\) : null\}/,
    );
    expect(boardShellSource).toMatch(/standPointAt\(nav\.trackIndex\)/);
  });

  it("keeps loop tiles separate from the responsive strategy presentation", () => {
    expect(boardSceneSource).toMatch(/mode === "loop"\s*\?\s*TRACK\.flatMap/);
    expect(boardSceneSource).toMatch(
      /mode === "loop"\s*\?\s*\([\s\S]*?<TrackTiles reducedMotion=\{reducedMotion\} \/>[\s\S]*?\)\s*:\s*\(/,
    );
    expect(boardSceneSource).toMatch(
      /mode === "strategy" \? <ResponsiveStrategyCamera \/> : null/,
    );
    expect(boardSceneSource).toContain('"Selected focus"');
    expect(boardSceneSource).toMatch(/<Sprout3d[\s\S]*?reactionToken=\{reactionToken\}/);
  });

  it("preserves board accessibility and non-strategy travel chrome", () => {
    expect(boardSceneSource).toMatch(
      /<Canvas[\s\S]*?aria-label="Financial life game board, viewed from above"[\s\S]*?role="img"/,
    );
    expect(boardShellSource).toContain('<h1 className="sr-only">Life Finance board</h1>');
    expect(boardShellSource).toMatch(
      /<p aria-live="polite" className="sr-only" role="status">[\s\S]*?Sprout is at/,
    );
    expect(hudSource.match(/mode !== "strategy" \? \(/g)).toHaveLength(3);
    expect(hudSource).toMatch(/mode === "strategy" \? \([\s\S]*?\) : \([\s\S]*?board-take-action/);
  });
});
