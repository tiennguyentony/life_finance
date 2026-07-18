import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const imageSources = [
  new URL("../../../components/sprout.tsx", import.meta.url),
  new URL("../landing.tsx", import.meta.url),
  new URL("../../board/hud.tsx", import.meta.url),
];

describe("local image delivery", () => {
  it("does not depend on the unavailable Vercel Services image optimizer", () => {
    const imageTags = imageSources.flatMap((url) =>
      readFileSync(url, "utf8").match(/<Image[\s\S]*?\/>/g) ?? [],
    );

    expect(imageTags).toHaveLength(5);
    for (const imageTag of imageTags) {
      expect(imageTag).toContain("unoptimized");
    }
  });
});
