const BASELINE_ASPECT = 16 / 9;
const BASELINE_VERTICAL_FOV = 30;
const MIN_VALID_ASPECT = 0.01;

const degreesToRadians = (degrees: number) => (degrees * Math.PI) / 180;
const radiansToDegrees = (radians: number) => (radians * 180) / Math.PI;

/** Preserve the baseline camera's horizontal view as the Canvas aspect changes. */
export function verticalFovForAspect(aspect: number): number {
  if (!Number.isFinite(aspect) || aspect < MIN_VALID_ASPECT) {
    return BASELINE_VERTICAL_FOV;
  }

  const baselineHalfVerticalFov = degreesToRadians(BASELINE_VERTICAL_FOV / 2);
  const halfHorizontalFov = Math.atan(
    Math.tan(baselineHalfVerticalFov) * BASELINE_ASPECT,
  );

  return radiansToDegrees(2 * Math.atan(Math.tan(halfHorizontalFov) / aspect));
}
