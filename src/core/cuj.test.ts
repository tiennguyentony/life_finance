import { describe, expect, it } from "vitest";

import { CUJS } from "./cuj";

describe("CUJS", () => {
  it("defines the four journeys in player order", () => {
    expect(CUJS.map(({ number, slug }) => ({ number, slug }))).toEqual([
      { number: 1, slug: "character" },
      { number: 2, slug: "dashboard" },
      { number: 3, slug: "game-master" },
      { number: 4, slug: "psychology-traps" },
    ]);
  });

  it("gives every journey a unique local route", () => {
    const hrefs = CUJS.map(({ href }) => href);

    expect(new Set(hrefs).size).toBe(CUJS.length);
    expect(hrefs.every((href) => href.startsWith("/"))).toBe(true);
  });
});
