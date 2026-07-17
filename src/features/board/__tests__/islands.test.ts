import { describe, expect, it } from "vitest";

import { BOARD_ISLANDS, HOME_ISLAND_ID, LOOP_ORDER, islandById } from "../islands";

describe("board islands", () => {
  it("has the five reference islands with unique ids", () => {
    expect(BOARD_ISLANDS).toHaveLength(5);
    const ids = BOARD_ISLANDS.map(({ id }) => id);
    expect(new Set(ids).size).toBe(5);
  });

  it("anchors Home at the center of the board", () => {
    const home = islandById(HOME_ISLAND_ID);
    expect(home.position.x).toBe(0);
    expect(home.position.z).toBe(0);
  });

  it("spreads every other island away from Home with breathing room", () => {
    for (const island of BOARD_ISLANDS) {
      if (island.id === HOME_ISLAND_ID) continue;
      const distance = Math.hypot(island.position.x, island.position.z);
      expect(distance).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps islands from crowding each other", () => {
    for (const a of BOARD_ISLANDS) {
      for (const b of BOARD_ISLANDS) {
        if (a.id === b.id) continue;
        const gap = Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
        expect(gap).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("throws on an unknown island id instead of returning undefined", () => {
    expect(() => islandById("casino")).toThrow(/casino/);
  });
});

describe("monopoly loop order", () => {
  it("visits every island exactly once, starting from Home", () => {
    expect(LOOP_ORDER[0]).toBe(HOME_ISLAND_ID);
    expect([...LOOP_ORDER].sort()).toEqual(
      BOARD_ISLANDS.map(({ id }) => id).sort(),
    );
  });
});
