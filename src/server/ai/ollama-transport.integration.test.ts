import { describe, expect, it } from "vitest";

import { AiRoleClient, type AiAuditRecord } from "./client";
import type {
  ExplanationRequest,
  HostileFedRequest,
  OnboardingRequest,
  TeacherRequest,
} from "./contracts";
import { OllamaGptOssTransport } from "./ollama-transport";

const runIntegration =
  process.env.RUN_OLLAMA_INTEGRATION === "1" ? it : it.skip;

describe("local gpt-oss integration", () => {
  runIntegration(
    "returns a semantically valid role response and records the real local model",
    async () => {
      const audits: AiAuditRecord[] = [];
      const client = new AiRoleClient(
        new OllamaGptOssTransport(),
        {
          async record(record) {
            audits.push(record);
          },
        },
        { delay: async () => undefined },
      );
      const request: ExplanationRequest = {
        contractVersion: 1,
        privacyNoticeVersion: 1,
        dataUseAccepted: true,
        role: "explanation",
        conceptId: "emergency_fund",
        audienceLevel: "beginner",
        whyNow: "A deterministic repair event is due this month.",
        evidence: [
          {
            id: "cash_months",
            label: "Cash buffer",
            value: "0.8 months",
          },
        ],
      };

      const result = await client.generate<"explanation">(request);

      expect(result.title.length).toBeGreaterThan(0);
      expect(result.citedEvidenceIds).toEqual(["cash_months"]);
      expect(audits).toEqual([
        expect.objectContaining({
          role: "explanation",
          model: "ollama/gpt-oss:20b",
          outcome: "success",
          attempts: [expect.objectContaining({ kind: "success" })],
        }),
      ]);
    },
    240_000,
  );

  runIntegration(
    "selects an eligible bounded Hostile Fed event",
    async () => {
      const audits: AiAuditRecord[] = [];
      const client = new AiRoleClient(new OllamaGptOssTransport(), {
        async record(record) {
          audits.push(record);
        },
      });
      const request: HostileFedRequest = {
        contractVersion: 1,
        privacyNoticeVersion: 1,
        dataUseAccepted: true,
        role: "hostile_fed",
        simulationMonth: "2026-07",
        marketRegime: "recession",
        weaknesses: [
          {
            id: "low_emergency_fund",
            severityPpm: 900_000,
            evidence: [
              { id: "cash_months", label: "Cash buffer", value: "0.8 months" },
            ],
          },
        ],
        candidates: [
          {
            templateId: "personal.industry_layoff",
            templateVersion: 1,
            tier: "large",
            teachingPrinciple: "Liquidity matters before income disappears.",
            targetsWeaknesses: ["low_emergency_fund"],
            parameters: [
              {
                id: "income_gap_cents",
                minimum: 300_000,
                maximum: 2_500_000,
              },
            ],
          },
        ],
      };

      const result = await client.generate<"hostile_fed">(request);

      expect(result.templateId).toBe("personal.industry_layoff");
      expect(result.targetedWeaknessId).toBe("low_emergency_fund");
      expect(result.citedEvidenceIds).toEqual(["cash_months"]);
      expect(result.parameters.income_gap_cents).toBeGreaterThanOrEqual(300_000);
      expect(result.parameters.income_gap_cents).toBeLessThanOrEqual(2_500_000);
      expect(audits[0]).toMatchObject({
        model: "ollama/gpt-oss:20b",
        outcome: "success",
      });
    },
    240_000,
  );

  runIntegration(
    "preserves the deterministic grade and evidence in the Teacher role",
    async () => {
      const client = new AiRoleClient(new OllamaGptOssTransport(), {
        async record() {},
      });
      const request: TeacherRequest = {
        contractVersion: 1,
        privacyNoticeVersion: 1,
        dataUseAccepted: true,
        role: "teacher",
        outcome: {
          kind: "retirement_age",
          grade: "B",
          reasonCode: "reached_age_65",
        },
        evidence: [
          { id: "fi_progress", label: "FI progress", value: "70%" },
        ],
        decisions: [
          {
            id: "decision.1",
            month: "2026-07",
            summary: "Protected a recurring index allocation.",
            evidenceIds: ["fi_progress"],
          },
        ],
      };

      const result = await client.generate<"teacher">(request);

      expect(result.grade).toBe("B");
      expect(result.decisiveMoments.map(({ decisionId }) => decisionId)).toEqual([
        "decision.1",
      ]);
      expect(result.decisiveMoments[0]?.citedEvidenceIds).toEqual([
        "fi_progress",
      ]);
    },
    240_000,
  );

  runIntegration(
    "keeps onboarding extraction inside the supplied catalogs",
    async () => {
      const client = new AiRoleClient(new OllamaGptOssTransport(), {
        async record() {},
      });
      const request: OnboardingRequest = {
        contractVersion: 1,
        privacyNoticeVersion: 1,
        dataUseAccepted: true,
        role: "onboarding",
        sanitizedFreeText: "I live in Seattle and work in software.",
        allowedLocationIds: ["location.seattle", "location.portland"],
        allowedCareerTrackIds: ["career.software", "career.education"],
      };

      const result = await client.generate<"onboarding">(request);

      expect([null, ...request.allowedLocationIds]).toContain(result.locationId);
      expect([null, ...request.allowedCareerTrackIds]).toContain(
        result.careerTrackId,
      );
      expect(result.statedAmounts).toEqual([]);
    },
    240_000,
  );
});
