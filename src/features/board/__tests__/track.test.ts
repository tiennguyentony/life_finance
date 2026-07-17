import { describe, expect, it } from "vitest";

import { BOARD_ISLANDS, HOME_ISLAND_ID, LOOP_ORDER } from "../islands";
import { TRACK, destinationLandmarkId, nextLandmarkIndex, standPointAt } from "../track";

describe("monopoly track", () => {
  it("is a closed ring of landmarks and tiles, starting at Home", () => {
    expect(TRACK.length).toBe(20);
    const first = TRACK[0]!;
    expect(first.kind).toBe("landmark");
    expect(first.kind === "landmark" && first.islandId).toBe(HOME_ISLAND_ID);
  });

  it("places every board island on the track exactly once, in loop order", () => {
    const landmarkIds = TRACK.filter((stop) => stop.kind === "landmark").map(
      (stop) => (stop.kind === "landmark" ? stop.islandId : ""),
    );
    expect(landmarkIds).toEqual([...LOOP_ORDER]);
    expect([...landmarkIds].sort()).toEqual(BOARD_ISLANDS.map(({ id }) => id).sort());
  });

  it("separates landmarks with at least two travel tiles", () => {
    for (let i = 0; i < TRACK.length; i++) {
      if (TRACK[i]!.kind !== "landmark") continue;
      const next = nextLandmarkIndex(i);
      const gap = (next - i + TRACK.length) % TRACK.length;
      expect(gap).toBeGreaterThanOrEqual(3); // landmark + >=2 tiles before the next
    }
  });

  it("keeps neighboring stops within a single comfortable hop", () => {
    for (let i = 0; i < TRACK.length; i++) {
      const a = TRACK[i]!.position;
      const b = TRACK[(i + 1) % TRACK.length]!.position;
      const gap = Math.hypot(a.x - b.x, a.z - b.z);
      expect(gap).toBeGreaterThanOrEqual(1.2);
      expect(gap).toBeLessThanOrEqual(3);
    }
  });

  it("advances to the next landmark from anywhere on the track, wrapping at the end", () => {
    expect(TRACK[nextLandmarkIndex(0)]!.kind).toBe("landmark");
    // From a tile mid-segment, the next landmark is ahead, never behind.
    const tileIndex = TRACK.findIndex((stop) => stop.kind === "tile");
    const landmark = nextLandmarkIndex(tileIndex);
    expect(landmark).toBeGreaterThan(tileIndex);
    // The last segment wraps back to Home.
    const lastLandmark = TRACK.reduce(
      (last, stop, index) => (stop.kind === "landmark" ? index : last),
      0,
    );
    expect(nextLandmarkIndex(lastLandmark)).toBe(0);
  });

  it("labels every travel tile with the landmark it leads to", () => {
    // The first tiles after Home lead to the next stop on the ring: Hospital.
    expect(TRACK[1]!.kind).toBe("tile");
    expect(destinationLandmarkId(1)).toBe("hospital");
    // A landmark's own destination is the following landmark, not itself.
    expect(destinationLandmarkId(0)).toBe("hospital");
    // The last tiles of the lap lead back to Home.
    expect(destinationLandmarkId(TRACK.length - 1)).toBe(HOME_ISLAND_ID);
  });

  it("offsets the stand point on landmarks so buildings never hide Sprout, but not on tiles", () => {
    const home = TRACK[0]!;
    const homeStand = standPointAt(0);
    expect(homeStand).not.toEqual(home.position);
    const tileIndex = TRACK.findIndex((stop) => stop.kind === "tile");
    expect(standPointAt(tileIndex)).toEqual(TRACK[tileIndex]!.position);
  });
});
