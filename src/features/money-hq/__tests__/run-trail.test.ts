import { describe, expect, it } from "vitest";

import {
  appendTrailPoint,
  revisionMonthsBack,
  type TrailPoint,
} from "../run-trail";

function point(month: string, revision: number, netWorthCents: number): TrailPoint {
  return {
    month,
    revision,
    netWorthCents,
    cashCents: netWorthCents,
    debtCents: 0,
    investableAssetsCents: netWorthCents,
  };
}

describe("run trail", () => {
  it("keeps points ordered by month", () => {
    const trail = [point("2026-09", 3, 300), point("2026-07", 1, 100)].reduce(
      (accumulated: readonly TrailPoint[], entry) => appendTrailPoint(accumulated, entry),
      [],
    );

    expect(trail.map(({ month }) => month)).toEqual(["2026-07", "2026-09"]);
  });

  it("replaces a month seen again rather than duplicating it", () => {
    const first = appendTrailPoint([], point("2026-07", 1, 100));
    const replayed = appendTrailPoint(first, point("2026-07", 2, 150));

    expect(replayed).toHaveLength(1);
    expect(replayed[0]).toMatchObject({ revision: 2, netWorthCents: 150 });
  });

  it("finds the revision a given number of months back", () => {
    const trail = ["2026-07", "2026-08", "2026-09", "2026-10"].reduce(
      (accumulated: readonly TrailPoint[], month, index) =>
        appendTrailPoint(accumulated, point(month, index + 1, index * 100)),
      [],
    );

    // Latest is 2026-10 at revision 4; two months back is 2026-08 at revision 2.
    expect(revisionMonthsBack(trail, 2)).toBe(2);
  });

  it("clamps to the earliest point when asked for more months than exist", () => {
    const trail = appendTrailPoint([], point("2026-07", 1, 100));

    expect(revisionMonthsBack(trail, 12)).toBe(1);
  });

  it("has no revision for an empty trail", () => {
    expect(revisionMonthsBack([], 12)).toBeNull();
  });

  it("bounds how far the trail can grow", () => {
    let trail: readonly TrailPoint[] = [];
    for (let index = 0; index < 700; index += 1) {
      const year = 2026 + Math.floor(index / 12);
      const month = String((index % 12) + 1).padStart(2, "0");
      trail = appendTrailPoint(trail, point(`${year}-${month}`, index + 1, index));
    }

    expect(trail.length).toBeLessThanOrEqual(600);
    // The most recent month must survive the trim.
    expect(trail.at(-1)?.revision).toBe(700);
  });
});
