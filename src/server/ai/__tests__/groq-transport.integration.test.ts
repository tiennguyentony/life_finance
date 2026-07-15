import { describe, expect, it } from "vitest";

import { AiRoleClient, type AiAuditRecord } from "../client";
import { GroqGptOssTransport } from "../groq-transport";

const describeIfEnabled = process.env.RUN_GROQ_INTEGRATION === "1"
  ? describe
  : describe.skip;

describeIfEnabled("hosted Groq gpt-oss integration", () => {
  it("returns a semantically valid strict explanation and records provider identity", async () => {
    const audits: AiAuditRecord[] = [];
    const client = new AiRoleClient(
      new GroqGptOssTransport(),
      {
        async record(record) {
          audits.push(record);
        },
      },
      { invocationId: () => "groq-integration-explanation" },
    );

    const result = await client.generate<"explanation">({
      contractVersion: 1,
      privacyNoticeVersion: 2,
      dataUseAccepted: true,
      role: "explanation",
      conceptId: "emergency_fund",
      audienceLevel: "beginner",
      whyNow: "The deterministic engine reports one month of required expenses in cash.",
      evidence: [
        {
          id: "context.emergency_fund",
          label: "Emergency fund",
          value: "1.0 months",
        },
      ],
    });

    expect(result.title.length).toBeGreaterThan(0);
    expect(result.explanation.length).toBeGreaterThan(0);
    expect(result.actionTips.length).toBeGreaterThan(0);
    expect(result.citedEvidenceIds).toEqual(["context.emergency_fund"]);
    expect(client.responseSource()).toBe("hosted_oss");
    expect(audits).toEqual([
      expect.objectContaining({
        invocationId: "groq-integration-explanation",
        model: "groq/openai/gpt-oss-120b",
        outcome: "success",
      }),
    ]);
  }, 60_000);
});
