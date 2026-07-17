import { describe, expect, it } from "vitest";

import { hopArc, hopPose } from "../hop";

const FROM = { x: 0, z: 0 };
const TO = { x: 4, z: -2 };

describe("hopPose", () => {
  it("starts exactly at the origin island, at rest", () => {
    const pose = hopPose(FROM, TO, 0);
    expect(pose.x).toBe(0);
    expect(pose.z).toBe(0);
    expect(pose.y).toBe(0);
    expect(pose.scaleY).toBeCloseTo(1, 5);
  });

  it("ends exactly at the target island, at rest", () => {
    const pose = hopPose(FROM, TO, 1);
    expect(pose.x).toBe(4);
    expect(pose.z).toBe(-2);
    expect(pose.y).toBe(0);
    expect(pose.scaleY).toBeCloseTo(1, 5);
  });

  it("peaks at the midpoint of the arc", () => {
    const pose = hopPose(FROM, TO, 0.5, { peak: 1.6 });
    expect(pose.x).toBeCloseTo(2, 5);
    expect(pose.z).toBeCloseTo(-1, 5);
    expect(pose.y).toBeCloseTo(1.6, 5);
  });

  it("keeps the arc height symmetric around the midpoint", () => {
    const rising = hopPose(FROM, TO, 0.25);
    const falling = hopPose(FROM, TO, 0.75);
    expect(rising.y).toBeCloseTo(falling.y, 5);
    expect(rising.y).toBeGreaterThan(0);
  });

  it("clamps progress outside 0..1 so overshooting frames cannot fling the character", () => {
    expect(hopPose(FROM, TO, -0.5)).toEqual(hopPose(FROM, TO, 0));
    expect(hopPose(FROM, TO, 1.7)).toEqual(hopPose(FROM, TO, 1));
  });

  it("squashes in anticipation just after takeoff", () => {
    const pose = hopPose(FROM, TO, 0.06);
    expect(pose.scaleY).toBeLessThan(1);
  });

  it("stretches during the fast rise, and is neutral at the weightless apex", () => {
    // Real squash-and-stretch tracks speed: a body stretches when moving
    // fast (rise/fall) and hangs neutral at the top where velocity is zero.
    const rising = hopPose(FROM, TO, 0.28);
    expect(rising.scaleY).toBeGreaterThan(1);
    const apex = hopPose(FROM, TO, 0.5);
    expect(apex.scaleY).toBeCloseTo(1, 2);
  });

  it("squashes again on landing", () => {
    const pose = hopPose(FROM, TO, 0.94);
    expect(pose.scaleY).toBeLessThan(1);
  });

  it("conserves volume: horizontal scales compensate vertical squash and stretch", () => {
    for (const t of [0.06, 0.25, 0.5, 0.75, 0.94]) {
      const pose = hopPose(FROM, TO, t);
      expect(pose.scaleX).toBe(pose.scaleZ);
      expect(pose.scaleX * pose.scaleX * pose.scaleY).toBeCloseTo(1, 5);
    }
  });

});

describe("hopArc", () => {
  it("gives longer hops more airtime and a higher arc", () => {
    const short = hopArc(FROM, { x: 3, z: 0 });
    const long = hopArc(FROM, { x: 10, z: 0 });
    expect(long.durationMs).toBeGreaterThan(short.durationMs);
    expect(long.peak).toBeGreaterThan(short.peak);
  });

  it("keeps a bounce-in-place snappy instead of hanging in the air", () => {
    const bounce = hopArc(FROM, FROM);
    expect(bounce.durationMs).toBeLessThanOrEqual(600);
    expect(bounce.peak).toBeGreaterThan(0); // still visibly leaves the ground
  });

  it("never produces a hop slower than a beat, even across the whole board", () => {
    const arc = hopArc({ x: -5.4, z: 3.6 }, { x: 5.2, z: -3.4 });
    expect(arc.durationMs).toBeLessThanOrEqual(1200);
  });
});
