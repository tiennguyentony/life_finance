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

/**
 * The jump has three grounded-to-grounded phases. The anticipation and settle
 * windows are symmetric around the midpoint so the airborne arc's apex still
 * lands exactly at progress 0.5.
 */
const ANTICIPATION_END = 0.12;
const SETTLE_START = 0.88;
/** How deep the character compresses loading the jump / absorbing the landing. */
const CROUCH_DEPTH = 0.18;
const LANDING_DEPTH = 0.14;

/** A smooth bump: 0 at u=0 and u=1, peaking at u=0.5. Zero outside [0,1]. */
function edgeBump(u: number): number {
  if (u <= 0 || u >= 1) return 0;
  return Math.sin(Math.PI * u);
}

/** Conserve volume: sideways bulge compensates vertical deformation. */
function poseFrom(x: number, y: number, z: number, scaleY: number): HopPose {
  const scaleXZ = 1 / Math.sqrt(scaleY);
  return { x, y, z, scaleX: scaleXZ, scaleY, scaleZ: scaleXZ };
}

export function hopPose(
  from: BoardPoint,
  to: BoardPoint,
  progress: number,
  opts?: Readonly<{ peak?: number }>,
): HopPose {
  const t = Math.min(1, Math.max(0, progress));
  const peak = opts?.peak ?? DEFAULT_PEAK;

  // Anticipation: crouch on the origin island, loading the jump before liftoff.
  if (t < ANTICIPATION_END) {
    const u = t / ANTICIPATION_END;
    return poseFrom(from.x, 0, from.z, 1 - CROUCH_DEPTH * Math.sin(Math.PI * u));
  }

  // Settle: land on the destination and absorb the impact before standing.
  if (t > SETTLE_START) {
    const u = (t - SETTLE_START) / (1 - SETTLE_START);
    return poseFrom(to.x, 0, to.z, 1 - LANDING_DEPTH * Math.sin(Math.PI * u));
  }

  // Airborne arc: travel across, with squash-and-stretch tracking speed.
  const u = (t - ANTICIPATION_END) / (SETTLE_START - ANTICIPATION_END);
  const x = from.x + (to.x - from.x) * u;
  const z = from.z + (to.z - from.z) * u;
  // Parabola 4u(1-u): grounded at both ends of the arc, apex at u=0.5.
  const y = peak * 4 * u * (1 - u);

  // Stretch tracks vertical speed: neutral at the arc ends and at the
  // weightless apex, peaking mid-rise and mid-fall, so the character is
  // stretched while moving fast instead of ballooning at the motionless top.
  const stretch = STRETCH_AMOUNT * Math.abs(Math.sin(2 * Math.PI * u));
  const squash =
    SQUASH_AMOUNT * (edgeBump(u / SQUASH_WINDOW) + edgeBump((1 - u) / SQUASH_WINDOW));
  return poseFrom(x, y, z, 1 + stretch - squash);
}
