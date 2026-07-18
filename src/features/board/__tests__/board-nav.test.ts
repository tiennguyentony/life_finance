import { describe, expect, it } from "vitest";

import {
  INITIAL_NAV_STATE,
  boardNavReducer,
  type BoardNavAction,
  type BoardNavState,
} from "../board-nav";
import { HOME_ISLAND_ID } from "../islands";
import { TRACK } from "../track";

function reduce(state: BoardNavState, ...actions: BoardNavAction[]): BoardNavState {
  return actions.reduce(boardNavReducer, state);
}

/** Simulate a whole loop-mode Move: kick it off, then fire hop-end until the
 * character settles (the reducer chains tile hops on each hop-end). */
function runLoopMove(state: BoardNavState): BoardNavState {
  let next = boardNavReducer(state, { type: "loop-advance" });
  let guard = 0;
  while (next.hop && guard++ < 50) {
    next = boardNavReducer(next, { type: "hop-end", mode: "loop" });
  }
  return next;
}

describe("boardNavReducer", () => {
  it("starts at Home, at track 0, not hopping", () => {
    expect(INITIAL_NAV_STATE).toEqual({
      currentIslandId: HOME_ISLAND_ID,
      trackIndex: 0,
      hop: null,
    });
  });

  describe("free mode", () => {
    it("starts a hop to the selected island", () => {
      const next = boardNavReducer(INITIAL_NAV_STATE, { type: "free-select", islandId: "bank" });
      expect(next.hop?.toId).toBe("bank");
      expect(next.currentIslandId).toBe(HOME_ISLAND_ID); // not there until it lands
    });

    it("lands on the selected island when the hop ends", () => {
      const next = reduce(
        INITIAL_NAV_STATE,
        { type: "free-select", islandId: "bank" },
        { type: "hop-end", mode: "free" },
      );
      expect(next.currentIslandId).toBe("bank");
      expect(next.hop).toBeNull();
    });

    it("bounces in place on the current island for a free take-action", () => {
      const next = boardNavReducer(INITIAL_NAV_STATE, { type: "free-bounce" });
      expect(next.hop?.toId).toBe(HOME_ISLAND_ID);
    });

    it("ignores a new selection while a hop is in flight (one hop at a time)", () => {
      const hopping = boardNavReducer(INITIAL_NAV_STATE, { type: "free-select", islandId: "bank" });
      const again = boardNavReducer(hopping, { type: "free-select", islandId: "hospital" });
      expect(again).toBe(hopping); // unchanged
    });
  });

  describe("loop mode", () => {
    it("a Move from Home lands on the next landmark, Hospital", () => {
      const next = runLoopMove(INITIAL_NAV_STATE);
      expect(next.currentIslandId).toBe("hospital");
      expect(next.hop).toBeNull();
      expect(TRACK[next.trackIndex]).toMatchObject({ kind: "landmark", islandId: "hospital" });
    });

    it("walks the whole ring one landmark per Move and wraps past GO", () => {
      let state = INITIAL_NAV_STATE;
      const visited: string[] = [];
      for (let i = 0; i < 5; i++) {
        state = runLoopMove(state);
        visited.push(state.currentIslandId);
      }
      expect(visited).toEqual(["hospital", "financial", "bank", "startup", HOME_ISLAND_ID]);
    });

    it("passes over travel tiles without stopping on them", () => {
      // First hop of a Move lands on a tile (index 1), and must keep going.
      const afterAdvance = boardNavReducer(INITIAL_NAV_STATE, { type: "loop-advance" });
      expect(afterAdvance.hop?.toIndex).toBe(1);
      const afterOneTile = boardNavReducer(afterAdvance, { type: "hop-end", mode: "loop" });
      expect(afterOneTile.trackIndex).toBe(1);
      expect(TRACK[afterOneTile.trackIndex]!.kind).toBe("tile");
      expect(afterOneTile.hop).not.toBeNull(); // still travelling
    });

    it("bounces in place without changing the stop", () => {
      const next = boardNavReducer(INITIAL_NAV_STATE, { type: "loop-bounce" });
      expect(next.hop?.toIndex).toBe(0);
      expect(next.trackIndex).toBe(0);
    });

    it("ignores Move while already hopping", () => {
      const moving = boardNavReducer(INITIAL_NAV_STATE, { type: "loop-advance" });
      const again = boardNavReducer(moving, { type: "loop-advance" });
      expect(again).toBe(moving);
    });
  });

  it("hop-end on an idle state is a no-op", () => {
    expect(boardNavReducer(INITIAL_NAV_STATE, { type: "hop-end", mode: "loop" })).toBe(
      INITIAL_NAV_STATE,
    );
  });

  it("reset returns to the initial state", () => {
    const moved = reduce(
      INITIAL_NAV_STATE,
      { type: "free-select", islandId: "bank" },
      { type: "hop-end", mode: "free" },
    );
    expect(boardNavReducer(moved, { type: "reset" })).toEqual(INITIAL_NAV_STATE);
  });
});
