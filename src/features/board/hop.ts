/**
 * Pure math for the character's island-to-island jump. Kept free of three.js
 * so the cartoon physics (arc, squash-and-stretch) can be unit tested.
 */

export type BoardPoint = Readonly<{ x: number; z: number }>;

export type HopPose = Readonly<{
  x: number;
  y: number;
  z: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
}>;

/** Height of the jump arc in world units when no override is given. */
const DEFAULT_PEAK = 1.4;

/**
 * Long hops get more airtime and a higher arc so speed feels constant;
 * a bounce-in-place stays quick and low.
 */
export function hopArc(
  from: BoardPoint,
  to: BoardPoint,
): Readonly<{ durationMs: number; peak: number }> {
  const distance = Math.hypot(to.x - from.x, to.z - from.z);
  return {
    durationMs: Math.min(1200, 480 + distance * 45),
    peak: 1.1 + distance * 0.06,
  };
}

/** Fraction of the timeline spent squashing at takeoff and again at landing. */
const SQUASH_WINDOW = 0.15;
const SQUASH_AMOUNT = 0.22;
const STRETCH_AMOUNT = 0.16;

/** A smooth bump: 0 at u=0 and u=1, peaking at u=0.5. Zero outside [0,1]. */
function edgeBump(u: number): number {
  if (u <= 0 || u >= 1) return 0;
  return Math.sin(Math.PI * u);
}

export function hopPose(
  from: BoardPoint,
  to: BoardPoint,
  progress: number,
  opts?: Readonly<{ peak?: number }>,
): HopPose {
  const t = Math.min(1, Math.max(0, progress));
  const peak = opts?.peak ?? DEFAULT_PEAK;

  const x = from.x + (to.x - from.x) * t;
  const z = from.z + (to.z - from.z) * t;
  // Parabola 4t(1-t): grounded at both ends, apex exactly at t=0.5.
  const y = peak * 4 * t * (1 - t);

  const stretch = STRETCH_AMOUNT * Math.sin(Math.PI * t);
  const squash =
    SQUASH_AMOUNT * (edgeBump(t / SQUASH_WINDOW) + edgeBump((1 - t) / SQUASH_WINDOW));
  const scaleY = 1 + stretch - squash;
  // Conserve volume: sideways bulge compensates vertical deformation.
  const scaleXZ = 1 / Math.sqrt(scaleY);

  return { x, y, z, scaleX: scaleXZ, scaleY, scaleZ: scaleXZ };
}
