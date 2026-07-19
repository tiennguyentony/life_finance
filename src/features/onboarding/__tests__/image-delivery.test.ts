import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const sourceRoot = new URL("../../../", import.meta.url);

function findRuntimeTsxFiles(directory: URL): URL[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : findRuntimeTsxFiles(child);
    }
    return entry.name.endsWith(".tsx") ? [child] : [];
  });
}

describe("local image delivery", () => {
  it("does not depend on the unavailable Vercel Services image optimizer", () => {
    const imageTags = findRuntimeTsxFiles(sourceRoot).flatMap(
      (url) => readFileSync(url, "utf8").match(/<Image[\s\S]*?\/>/g) ?? [],
    );

    expect(imageTags.length).toBeGreaterThan(0);
    for (const imageTag of imageTags) {
      expect(imageTag).toContain("unoptimized");
    }
  });
});
