import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";

describe("server-only AI runtime composition", () => {
  it("binds generated output to encrypted audit persistence without exposing an audit route", () => {
    const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");
    expect(source).toContain("OpenAiResponsesTransport");
    expect(source).toContain("AiAuditRepository");
    expect(source).toContain("getDatabaseConnection");

    const routeFiles = [
      "../../app/api/v1/openapi.json/route.ts",
      "../../app/api/v1/runs/route.ts",
      "../../app/api/v1/runs/[runId]/route.ts",
      "../../app/api/v1/runs/[runId]/commands/route.ts",
    ];
    for (const routeFile of routeFiles) {
      expect(readFileSync(new URL(routeFile, import.meta.url), "utf8")).not.toContain(
        "getAiAuditRepository",
      );
    }
  });
});
