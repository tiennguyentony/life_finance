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

  it("selects only the supplied engine event and bounded parameters", async () => {
    const audits: AiAuditRecord[] = [];
    const client = new AiRoleClient(
      new GroqGptOssTransport(),
      { async record(record) { audits.push(record); } },
      { invocationId: () => "groq-integration-world" },
    );

    try {
      const result = await client.generate<"hostile_fed">({
        contractVersion: 1,
        privacyNoticeVersion: 2,
        dataUseAccepted: true,
        role: "hostile_fed",
        simulationMonth: "2026-08",
        marketRegime: "expansion",
        weaknesses: [
          {
            id: "low_emergency_fund",
            severityPpm: 800_000,
            evidence: [
              {
                id: "weakness.low_emergency_fund",
                label: "low emergency fund",
                value: "800000 ppm severity from deterministic exposure metrics",
              },
            ],
          },
        ],
        candidates: [
          {
            templateId: "personal.industry_layoff",
            templateVersion: 1,
            tier: "large",
            teachingPrinciple: "Liquidity protects required expenses during income loss.",
            targetsWeaknesses: ["low_emergency_fund"],
            parameters: [
              { id: "income_gap_cents", minimum: 300_000, maximum: 2_500_000 },
            ],
          },
        ],
      });

      expect(result).toMatchObject({
        templateId: "personal.industry_layoff",
        templateVersion: 1,
        targetedWeaknessId: "low_emergency_fund",
        citedEvidenceIds: ["weakness.low_emergency_fund"],
      });
      const incomeGap = result.parameters.find(
        ({ id }) => id === "income_gap_cents",
      )?.value;
      expect(incomeGap).toBeGreaterThanOrEqual(300_000);
      expect(incomeGap).toBeLessThanOrEqual(2_500_000);
    } catch (error) {
      const safeAttempts = audits.flatMap(({ attempts }) =>
        attempts.map(({ kind, errorCode }) => ({ kind, errorCode })),
      );
      throw new Error(`hosted world integration failed: ${JSON.stringify(safeAttempts)}`, {
        cause: error,
      });
    }
  }, 60_000);
});
