import { describe, expect, it } from "vitest";

import { verticalFovForAspect } from "../camera-fov";

describe("strategy board camera FOV", () => {
  it("preserves the 16:9 camera's horizontal field of view", () => {
    expect(verticalFovForAspect(16 / 9)).toBeCloseTo(30, 10);
    expect(verticalFovForAspect(415 / 800)).toBeCloseTo(85.120838458, 9);

    const portraitVerticalFov = verticalFovForAspect(415 / 800);
    const portraitHorizontalFov =
      2 * Math.atan(Math.tan((portraitVerticalFov * Math.PI) / 360) * (415 / 800));
    const baselineHorizontalFov =
      2 * Math.atan(Math.tan((30 * Math.PI) / 360) * (16 / 9));

    expect(portraitHorizontalFov).toBeCloseTo(baselineHorizontalFov, 10);
  });

  it.each([0, -1, 0.001, Number.NaN, Number.POSITIVE_INFINITY])(
    "falls back to the baseline FOV for an invalid or tiny aspect (%s)",
    (aspect) => {
      expect(verticalFovForAspect(aspect)).toBe(30);
    },
  );
});
