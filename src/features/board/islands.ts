/**
 * The five islands of the board, laid out like the reference: Home in the
 * center, the four destinations ringed around it. Positions are three.js
 * world units on the ground plane (x right, z toward the camera).
 */

import type { BoardPoint } from "./hop";

export type BoardIsland = Readonly<{
  id: string;
  name: string;
  tagline: string;
  /** Hex accent used for the island's glow ring and label chip. */
  accent: string;
  position: BoardPoint;
}>;

export const HOME_ISLAND_ID = "home";

export const BOARD_ISLANDS: readonly BoardIsland[] = [
  {
    id: HOME_ISLAND_ID,
    name: "Home",
    tagline: "Rest and recharge",
    accent: "#7dd3fc",
    position: { x: 0, z: 0 },
  },
  {
    id: "financial",
    name: "Financial District",
    tagline: "High earnings",
    accent: "#60a5fa",
    position: { x: -5.2, z: -3.4 },
  },
  {
    id: "bank",
    name: "Bank",
    tagline: "Manage money",
    accent: "#facc15",
    position: { x: 5.2, z: -3.4 },
  },
  {
    id: "hospital",
    name: "Hospital",
    tagline: "Health is wealth",
    accent: "#fb7185",
    position: { x: -5.4, z: 3.6 },
  },
  {
    id: "startup",
    name: "Startup Hub",
    tagline: "Build your dream",
    accent: "#c084fc",
    position: { x: 5.4, z: 3.6 },
  },
];

export function islandById(id: string): BoardIsland {
  const found = BOARD_ISLANDS.find((island) => island.id === id);
  if (!found) throw new Error(`unknown island ${id}`);
  return found;
}

/**
 * Where Sprout stands on a free-mode island: pushed to the platform front
 * so the buildings behind never hide the character.
 */
export function standPointForIsland(id: string): BoardPoint {
  const { position } = islandById(id);
  return { x: position.x + 0.55, z: position.z + 1.25 };
}

/**
 * Monopoly-style travel order: clockwise around the track perimeter,
 * Home first (the GO corner). Track geometry lives in track.ts.
 */
export const LOOP_ORDER: readonly string[] = [
  HOME_ISLAND_ID,
  "hospital",
  "financial",
  "bank",
  "startup",
];
