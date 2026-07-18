/**
 * Pure navigation state machine for the board: where Sprout is and where it
 * is hopping. Kept free of React and the backend so the loop-chaining logic
 * (the feature's most intricate behavior) can be unit tested in isolation.
 *
 * Free mode travels by island id; loop mode travels by track index and chains
 * tile-to-tile until it reaches the next landmark. Side effects (toasts, the
 * backend command) stay in the component; this only computes the next state.
 */

import { standPointForIsland, HOME_ISLAND_ID } from "./islands";
import type { HopRequest } from "./sprout-3d";
import { TRACK, standPointAt } from "./track";

export type ActiveHop = HopRequest & Readonly<{ toId?: string; toIndex?: number }>;

export type BoardNavState = Readonly<{
  currentIslandId: string;
  trackIndex: number;
  hop: ActiveHop | null;
}>;

export type BoardNavAction =
  | { type: "free-select"; islandId: string }
  | { type: "free-bounce" }
  | { type: "loop-bounce" }
  | { type: "loop-advance" }
  | { type: "hop-end"; mode: "free" | "loop" }
  | { type: "reset" };

export const INITIAL_NAV_STATE: BoardNavState = {
  currentIslandId: HOME_ISLAND_ID,
  trackIndex: 0,
  hop: null,
};

function hopToIsland(state: BoardNavState, islandId: string): BoardNavState {
  return {
    ...state,
    hop: {
      from: standPointForIsland(state.currentIslandId),
      to: standPointForIsland(islandId),
      toId: islandId,
    },
  };
}

function hopToTrackIndex(state: BoardNavState, from: number, to: number): BoardNavState {
  return {
    ...state,
    hop: { from: standPointAt(from), to: standPointAt(to), toIndex: to },
  };
}

export function boardNavReducer(
  state: BoardNavState,
  action: BoardNavAction,
): BoardNavState {
  switch (action.type) {
    // Initiating a hop is ignored while one is in flight: one hop at a time.
    case "free-select":
      return state.hop ? state : hopToIsland(state, action.islandId);
    case "free-bounce":
      return state.hop ? state : hopToIsland(state, state.currentIslandId);
    case "loop-bounce":
      return state.hop ? state : hopToTrackIndex(state, state.trackIndex, state.trackIndex);
    case "loop-advance":
      return state.hop
        ? state
        : hopToTrackIndex(state, state.trackIndex, (state.trackIndex + 1) % TRACK.length);

    case "hop-end": {
      if (!state.hop) return state;
      if (action.mode === "free") {
        return {
          ...state,
          currentIslandId: state.hop.toId ?? state.currentIslandId,
          hop: null,
        };
      }
      // Loop: land on the tile, then keep hopping until the next landmark.
      const landedIndex = state.hop.toIndex ?? state.trackIndex;
      const landed = TRACK[landedIndex]!;
      if (landed.kind === "landmark") {
        return {
          ...state,
          trackIndex: landedIndex,
          currentIslandId: landed.islandId,
          hop: null,
        };
      }
      return hopToTrackIndex(
        { ...state, trackIndex: landedIndex },
        landedIndex,
        (landedIndex + 1) % TRACK.length,
      );
    }

    case "reset":
      return INITIAL_NAV_STATE;
  }
}
