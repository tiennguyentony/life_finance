/**
 * The Monopoly track for loop mode: a rounded-rectangle perimeter of stops.
 * Landmarks are the five islands (Home bottom-center as the GO corner, the
 * rest at the four corners); small travel tiles fill the straights between
 * them. Sprout hops stop-to-stop along this ring.
 */

import type { BoardPoint } from "./hop";
import { LOOP_ORDER } from "./islands";

export type TrackStop =
  | Readonly<{ kind: "landmark"; islandId: string; position: BoardPoint }>
  | Readonly<{ kind: "tile"; position: BoardPoint }>;

const HALF_WIDTH = 6.3;
const HALF_DEPTH = 3.9;

/** Landmark corners, keyed by island id, in LOOP_ORDER adjacency. */
const CORNERS: Readonly<Record<string, BoardPoint>> = {
  home: { x: 0, z: HALF_DEPTH },
  hospital: { x: -HALF_WIDTH, z: HALF_DEPTH },
  financial: { x: -HALF_WIDTH, z: -HALF_DEPTH },
  bank: { x: HALF_WIDTH, z: -HALF_DEPTH },
  startup: { x: HALF_WIDTH, z: HALF_DEPTH },
};

/** Travel tiles per segment, proportional to each straight's length. */
const TILES_BETWEEN = [2, 3, 5, 3, 2] as const;

function buildTrack(): readonly TrackStop[] {
  const stops: TrackStop[] = [];
  LOOP_ORDER.forEach((islandId, segment) => {
    const from = CORNERS[islandId]!;
    const to = CORNERS[LOOP_ORDER[(segment + 1) % LOOP_ORDER.length]!]!;
    stops.push({ kind: "landmark", islandId, position: from });
    const tiles = TILES_BETWEEN[segment]!;
    for (let i = 1; i <= tiles; i++) {
      const t = i / (tiles + 1);
      stops.push({
        kind: "tile",
        position: { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t },
      });
    }
  });
  return stops;
}

export const TRACK: readonly TrackStop[] = buildTrack();

/** Index of the next landmark strictly after `index`, wrapping past GO. */
export function nextLandmarkIndex(index: number): number {
  for (let step = 1; step <= TRACK.length; step++) {
    const candidate = (index + step) % TRACK.length;
    if (TRACK[candidate]!.kind === "landmark") return candidate;
  }
  throw new Error("track has no landmarks");
}

/** The landmark a stop leads to; used to color-code each travel segment. */
export function destinationLandmarkId(index: number): string {
  const stop = TRACK[nextLandmarkIndex(index)]!;
  return stop.kind === "landmark" ? stop.islandId : "";
}

/**
 * Where Sprout's feet land at a stop. Landmarks push the character to the
 * platform front so buildings never hide it; tiles are stood on dead center.
 */
const LANDMARK_STAND_OFFSET = { x: 0.3, z: 0.72 } as const;

export function standPointAt(index: number): BoardPoint {
  const stop = TRACK[index];
  if (!stop) throw new Error(`no track stop at ${index}`);
  if (stop.kind === "tile") return stop.position;
  return {
    x: stop.position.x + LANDMARK_STAND_OFFSET.x,
    z: stop.position.z + LANDMARK_STAND_OFFSET.z,
  };
}
