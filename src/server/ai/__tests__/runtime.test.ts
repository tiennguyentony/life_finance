import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";

import { OpenAiResponsesTransport } from "../client";
import { OllamaGptOssTransport } from "../ollama-transport";
import { aiTransportFromEnvironment } from "../runtime";

describe("server-only AI runtime composition", () => {
  it("binds generated output to encrypted audit persistence without exposing an audit route", () => {
    const source = readFileSync(new URL("../runtime.ts", import.meta.url), "utf8");
    expect(source).toContain("OpenAiResponsesTransport");
    expect(source).toContain("AiAuditRepository");
    expect(source).toContain("getDatabaseConnection");

    const routeFiles = [
      "../../../app/api/v1/openapi.json/route.ts",
      "../../../app/api/v1/runs/route.ts",
      "../../../app/api/v1/runs/[runId]/route.ts",
      "../../../app/api/v1/runs/[runId]/commands/route.ts",
    ];
    for (const routeFile of routeFiles) {
      expect(readFileSync(new URL(routeFile, import.meta.url), "utf8")).not.toContain(
        "getAiAuditRepository",
      );
    }
  });

  it("selects OpenAI by default and Ollama only through an explicit local provider", () => {
    expect(
      aiTransportFromEnvironment({ OPENAI_API_KEY: `sk-test-${"x".repeat(32)}` }),
    ).toBeInstanceOf(OpenAiResponsesTransport);
    expect(aiTransportFromEnvironment({ AI_PROVIDER: "ollama" })).toBeInstanceOf(
      OllamaGptOssTransport,
    );
    expect(() =>
      aiTransportFromEnvironment({
        AI_PROVIDER: "ollama",
        VERCEL_ENV: "production",
      }),
    ).toThrow("restricted to local development");
    expect(() => aiTransportFromEnvironment({ AI_PROVIDER: "unknown" })).toThrow(
      "openai or ollama",
    );
  });
});
