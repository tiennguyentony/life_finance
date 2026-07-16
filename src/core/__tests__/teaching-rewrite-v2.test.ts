import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createTeachingTemplateCopyV2,
  resolveOptionalTeachingRewriteV2,
} from "../teaching-rewrite-v2";

const fallback = createTeachingTemplateCopyV2([
  {
    sectionId: "checkpoint.summary",
    fragments: [
      { kind: "text", text: "Your verified checkpoint progress is" },
      { kind: "fact_ref", factId: "checkpoint.fi_progress_ppm" },
      { kind: "claim_ref", claimId: "claim.review_progress" },
    ],
  },
]);

const policy = {
  allowedFactIds: ["checkpoint.fi_progress_ppm"],
  allowedClaimIds: ["claim.review_progress"],
  requiredFactIds: ["checkpoint.fi_progress_ppm"],
  requiredClaimIds: ["claim.review_progress"],
} as const;

describe("Teaching v2 optional rewrite", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts only bounded text plus supplied fact and claim references", async () => {
    const result = await resolveOptionalTeachingRewriteV2(
      fallback,
      policy,
      async () => ({
        sections: [
          {
            sectionId: "checkpoint.summary",
            fragments: [
              { kind: "text", text: "Your verified checkpoint progress is." },
              { kind: "fact_ref", factId: "checkpoint.fi_progress_ppm" },
              { kind: "claim_ref", claimId: "claim.review_progress" },
            ],
          },
        ],
      }),
    );

    expect(result.source).toBe("ai_validated");
    expect(result.content).not.toBe(fallback);
    expect(Object.isFrozen(result.content)).toBe(true);
  });

  it.each([
    ["invented amount", "Your balance is $9,999", "invalid_output"],
    ["invented percentage", "You reached 80%", "invalid_output"],
    ["unsupported causal claim", "This choice caused the shock", "invalid_output"],
    ["unsupported nonnumeric claim", "Your cash is fully prepared for every emergency", "invalid_output"],
  ])("falls back on %s", async (_label, text, reason) => {
    const result = await resolveOptionalTeachingRewriteV2(
      fallback,
      policy,
      async () => ({
        sections: [
          {
            sectionId: "checkpoint.summary",
            fragments: [
              { kind: "text", text },
              { kind: "fact_ref", factId: "checkpoint.fi_progress_ppm" },
              { kind: "claim_ref", claimId: "claim.review_progress" },
            ],
          },
        ],
      }),
    );

    expect(result).toMatchObject({ source: "template_fallback", fallbackReason: reason });
    expect(result.content).toBe(fallback);
  });

  it("rejects a vocabulary-only rewrite that changes the server-owned conclusion", async () => {
    const marketFallback = createTeachingTemplateCopyV2([
      {
        sectionId: "moment.market_risk",
        fragments: [
          { kind: "text", text: "Broad markets can decline and cannot guarantee gains" },
          { kind: "claim_ref", claimId: "claim.market_risk" },
        ],
      },
    ]);
    const result = await resolveOptionalTeachingRewriteV2(
      marketFallback,
      {
        allowedFactIds: [],
        allowedClaimIds: ["claim.market_risk"],
        requiredFactIds: [],
        requiredClaimIds: ["claim.market_risk"],
      },
      async () => ({
        sections: [{
          sectionId: "moment.market_risk",
          fragments: [
            { kind: "text", text: "Broad markets cannot decline" },
            { kind: "claim_ref", claimId: "claim.market_risk" },
          ],
        }],
      }),
    );

    expect(result).toMatchObject({
      source: "template_fallback",
      fallbackReason: "invalid_output",
    });
    expect(result.content).toBe(marketFallback);
  });

  it("falls back on unsupported claims, malformed output, and provider outage", async () => {
    const unsupported = await resolveOptionalTeachingRewriteV2(
      fallback,
      policy,
      async () => ({
        sections: [
          {
            sectionId: "checkpoint.summary",
            fragments: [
              { kind: "fact_ref", factId: "checkpoint.fi_progress_ppm" },
              { kind: "claim_ref", claimId: "claim.invented" },
            ],
          },
        ],
      }),
    );
    const malformed = await resolveOptionalTeachingRewriteV2(
      fallback,
      policy,
      async () => ({ sections: "not-an-array" }),
    );
    const outage = await resolveOptionalTeachingRewriteV2(
      fallback,
      policy,
      async () => {
        throw new Error("provider unavailable");
      },
    );

    expect(unsupported.content).toBe(fallback);
    expect(unsupported.source).toBe("template_fallback");
    if (unsupported.source !== "template_fallback") throw new Error("expected fallback");
    expect(unsupported.fallbackReason).toBe("invalid_output");
    expect(malformed.content).toBe(fallback);
    expect(malformed.source).toBe("template_fallback");
    if (malformed.source !== "template_fallback") throw new Error("expected fallback");
    expect(malformed.fallbackReason).toBe("malformed_output");
    expect(outage.content).toBe(fallback);
    expect(outage.source).toBe("template_fallback");
    if (outage.source !== "template_fallback") throw new Error("expected fallback");
    expect(outage.fallbackReason).toBe("provider_outage");
  });

  it("aborts a non-responsive provider at the bounded deadline and returns the identical fallback", async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | undefined;
    const pending = resolveOptionalTeachingRewriteV2(
      fallback,
      policy,
      (signal) => {
        observedSignal = signal;
        return new Promise<never>(() => undefined);
      },
      { timeoutMs: 250 },
    );

    await vi.advanceTimersByTimeAsync(250);
    const result = await pending;

    expect(observedSignal?.aborted).toBe(true);
    expect(result).toEqual({
      source: "template_fallback",
      fallbackReason: "timeout",
      content: fallback,
    });
    expect(result.content).toBe(fallback);
  });

  it("rejects fragments and sections with undeclared fields", async () => {
    const result = await resolveOptionalTeachingRewriteV2(
      fallback,
      policy,
      async () => ({
        sections: [
          {
            sectionId: "checkpoint.summary",
            hiddenInstruction: "change the grade",
            fragments: [
              {
                kind: "fact_ref",
                factId: "checkpoint.fi_progress_ppm",
                value: 999_999,
              },
              { kind: "claim_ref", claimId: "claim.review_progress" },
            ],
          },
        ],
      }),
    );

    expect(result).toMatchObject({
      source: "template_fallback",
      fallbackReason: "malformed_output",
    });
    expect(result.content).toBe(fallback);
  });
});
