import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("Money HQ dialog layout", () => {
  it("does not inherit the full-page canvas height from nested HQ content", () => {
    const styles = readFileSync(
      new URL("../../../app/styles/money-hq.css", import.meta.url),
      "utf8",
    );

    expect(styles).toMatch(
      /\.hq-dialog\s*>\s*\.hq\s*{[\s\S]*?min-height:\s*0;[\s\S]*?padding:\s*0;[\s\S]*?background:\s*transparent;/,
    );
  });
});
