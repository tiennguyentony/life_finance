import { describe, expect, it, vi } from "vitest";

import { AI_PRIVACY_NOTICE_VERSION } from "../privacy-notice";
import { AiRoleClient, type AiAuditRecord } from "../client";
import { OnboardingAiServiceV1 } from "../onboarding-service-v1";
import { handleOnboardingParseV1 } from "../../api/onboarding-http-v1";
import { onboardingParseResponseV1Schema } from "../../api/onboarding-contracts-v1";

const validOutput = {
  birthMonth: "1990-04",
  locationId: "location.seattle",
  careerTrackId: "career.software",
  filingStatus: "single" as const,
  statedAmounts: [],
  missingFields: ["gross_income"],
  clarificationQuestion: "Is your income gross and annual or monthly?",
};

describe("Onboarding AI extraction v1", () => {
  it("returns only allow-listed typed candidates and never creates state", async () => {
    const generate = vi.fn(async () => validOutput);
    const service = new OnboardingAiServiceV1({ generate });

    const result = await service.extract(
      "I was born in April 1990 and work in software in Seattle.",
    );

    expect(result).toEqual({
      status: "ready",
      patch: {
        birthMonth: "1990-04",
        locationId: "location.seattle",
        careerId: "career.software",
      },
      financialCandidates: [],
      filingStatusCandidate: "single",
      clarificationQuestion: "Is your income gross and annual or monthly?",
      acceptedFieldIds: ["birthMonth", "careerId", "locationId"],
      issues: [],
    });
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "onboarding",
        privacyNoticeVersion: AI_PRIVACY_NOTICE_VERSION,
      }),
    );
    expect(JSON.stringify(result)).not.toContain("work in software");
    expect(result).not.toHaveProperty("state");
  });

  it("falls back without blocking typed onboarding when AI is absent or malformed", async () => {
    const unavailable = await new OnboardingAiServiceV1(null).extract(
      "No provider should receive this text.",
    );
    expect(unavailable).toMatchObject({
      status: "unavailable",
      patch: {},
      acceptedFieldIds: [],
      issues: [{ code: "AI_UNAVAILABLE" }],
    });

    const malformed = await new OnboardingAiServiceV1({
      generate: vi.fn(async () => ({
        ...validOutput,
        locationId: "location.not-allowed",
      })),
    }).extract("I live somewhere unsupported.");
    expect(malformed).toMatchObject({
      status: "rejected",
      patch: {},
      issues: [{ code: "MALFORMED_AI_EXTRACTION" }],
    });
  });

  it("returns exact financial candidates without converting them to authoritative cents", async () => {
    const service = new OnboardingAiServiceV1({
      generate: vi.fn(async () => ({
        ...validOutput,
        statedAmounts: [
          {
            field: "gross_income" as const,
            valueAsStated: "$92k",
            sourceExcerpt: "make $92k gross per year",
            period: "annual" as const,
            basis: "gross" as const,
          },
        ],
      })),
    });

    const result = await service.extract(
      "I make $92k gross per year as a software developer.",
    );

    expect(result.status).toBe("ready");
    expect(result.financialCandidates).toEqual([
      {
        field: "gross_income",
        valueAsStated: "$92k",
        sourceExcerpt: "make $92k gross per year",
        period: "annual",
        basis: "gross",
        requiresConfirmation: true,
      },
    ]);
    expect(result.patch).not.toHaveProperty("grossIncome");
    expect(JSON.stringify(result)).not.toContain("9200000");
    expect(onboardingParseResponseV1Schema.safeParse(result).success).toBe(true);
    expect(
      onboardingParseResponseV1Schema.safeParse({ ...result, invented: true })
        .success,
    ).toBe(false);
  });

  it("keeps the HTTP parse endpoint optional while enforcing explicit consent", async () => {
    const service = new OnboardingAiServiceV1(null);
    const unavailable = await handleOnboardingParseV1(
      new Request("http://local/api/v2/onboarding/parse", {
        method: "POST",
        body: JSON.stringify({
          privacyNoticeVersion: AI_PRIVACY_NOTICE_VERSION,
          dataUseAccepted: true,
          freeText: "I work in software in Seattle.",
        }),
      }),
      service,
    );
    expect(unavailable.status).toBe(200);
    await expect(unavailable.json()).resolves.toMatchObject({
      status: "unavailable",
      issues: [{ code: "AI_UNAVAILABLE" }],
    });

    const missingConsent = await handleOnboardingParseV1(
      new Request("http://local/api/v2/onboarding/parse", {
        method: "POST",
        body: JSON.stringify({ freeText: "I work in software in Seattle." }),
      }),
      service,
    );
    expect(missingConsent.status).toBe(400);
  });

  it("removes transient free text and provider excerpts from onboarding audit records", async () => {
    const marker = "PRIVACYMARKER-ONBOARDING-731";
    const records: AiAuditRecord[] = [];
    const client = new AiRoleClient(
      {
        async create() {
          const output = {
            ...validOutput,
            statedAmounts: [
              {
                field: "cash" as const,
                valueAsStated: "$12,500",
                sourceExcerpt: `${marker} has $12,500 in cash`,
                period: null,
                basis: null,
              },
            ],
          };
          return {
            responseId: "response.onboarding.1",
            status: "completed",
            outputText: JSON.stringify(output),
            output,
          };
        },
      },
      { async record(record) { records.push(record); } },
      { invocationId: () => "invocation.onboarding.1" },
    );
    const service = new OnboardingAiServiceV1(client);

    await service.extract(`${marker} has $12,500 in cash`);

    expect(records).toHaveLength(1);
    const serialized = JSON.stringify(records[0]);
    expect(serialized).not.toContain(marker);
    expect(serialized).not.toContain("$12,500");
    expect(records[0]?.prompt.input).toMatchObject({
      role: "onboarding",
      sanitizedFreeTextLength: `${marker} has $12,500 in cash`.length,
    });
  });
});
