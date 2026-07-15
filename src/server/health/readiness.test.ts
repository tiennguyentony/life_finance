import { describe, expect, it, vi } from "vitest";

import {
  checkReadiness,
  probePinnedTaxService,
} from "./readiness";

describe("deployment readiness", () => {
  it("reports ready only when every independent probe succeeds", async () => {
    await expect(
      checkReadiness({
        configuration: () => undefined,
        database: async () => undefined,
        taxPolicy: async () => undefined,
      }),
    ).resolves.toEqual({
      status: "ready",
      service: "life-finance",
      apiVersion: "v1",
      engineVersion: "4.0.0",
      checks: { configuration: "ok", database: "ok", taxPolicy: "ok" },
    });
  });

  it("reports component-safe failures without leaking exception content", async () => {
    const result = await checkReadiness({
      configuration: () => { throw new Error("OPENAI_API_KEY secret detail"); },
      database: async () => { throw new Error("postgres password detail"); },
      taxPolicy: async () => undefined,
    });
    expect(result).toEqual({
      status: "unavailable",
      service: "life-finance",
      apiVersion: "v1",
      engineVersion: "4.0.0",
      checks: { configuration: "failed", database: "failed", taxPolicy: "ok" },
    });
    expect(JSON.stringify(result)).not.toMatch(/secret|password/i);
  });

  it("requires the exact pinned PolicyEngine health contract", async () => {
    const fetchFunction = vi.fn(async (input: string | URL | Request) => {
      void input;
      return Response.json({
        status: "ok",
        policyYear: 2026,
        bundleVersion: "4.21.0",
        rulesVersion: "1.764.6",
      });
    });
    await expect(
      probePinnedTaxService("https://tax.example.test/base", fetchFunction),
    ).resolves.toBeUndefined();
    expect(fetchFunction.mock.calls[0]?.[0].toString()).toBe(
      "https://tax.example.test/base/healthz",
    );

    await expect(
      probePinnedTaxService(
        "https://tax.example.test",
        async () => Response.json({ status: "ok", policyYear: 2027 }),
      ),
    ).rejects.toBeTruthy();
  });

  it("rejects oversized tax health responses", async () => {
    await expect(
      probePinnedTaxService(
        "https://tax.example.test",
        async () =>
          new Response("x", {
            headers: { "content-length": "4097" },
          }),
      ),
    ).rejects.toBeTruthy();
  });
});
