import { describe, expect, it, vi } from "vitest";

import type {
  AiAuditRecord,
  AiResponsesTransport,
  AiTransportRequest,
  AiTransportResult,
} from "./client";
import { AiRoleClient, AiServiceError } from "./client";
import type { ExplanationRequest, HostileFedRequest, TeacherRequest } from "./contracts";

const hostileRequest: HostileFedRequest = {
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
      evidence: [{ id: "cash_months", label: "Cash buffer", value: "0.8 months" }],
    },
  ],
  candidates: [
    {
      templateId: "personal.industry_layoff",
      templateVersion: 1,
      tier: "large",
      teachingPrinciple: "Liquidity matters before income disappears.",
      targetsWeaknesses: ["low_emergency_fund"],
      parameters: [{ id: "income_gap_cents", minimum: 300_000, maximum: 2_500_000 }],
    },
  ],
};

const hostileOutput = {
  templateId: "personal.industry_layoff",
  templateVersion: 1,
  targetedWeaknessId: "low_emergency_fund",
  parameters: { income_gap_cents: 500_000 },
  headline: "The paycheck stops before the bills do",
  narrative: "Your industry contracts while fixed costs remain due.",
  rationale: "This fairly tests the evidenced thin cash buffer.",
  citedEvidenceIds: ["cash_months"],
};

function completed(output: unknown, id = "resp_1"): AiTransportResult {
  return {
    responseId: id,
    status: "completed",
    outputText: JSON.stringify(output),
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output) }] }],
  };
}

function harness(results: readonly (AiTransportResult | Error)[]) {
  const requests: AiTransportRequest[] = [];
  let index = 0;
  const transport: AiResponsesTransport = {
    async create(request) {
      requests.push(request);
      const result = results[index++];
      if (result instanceof Error) throw result;
      if (!result) throw new Error("missing mocked result");
      return result;
    },
  };
  const audits: AiAuditRecord[] = [];
  const delay = vi.fn(async () => undefined);
  const client = new AiRoleClient(
    transport,
    { async record(record) { audits.push(record); } },
    { delay, invocationId: () => "invocation_1" },
  );
  return { client, requests, audits, delay };
}

describe("AiRoleClient", () => {
  it("uses Sol, strict structured format, medium reasoning, and provider storage disabled", async () => {
    const { client, requests, audits } = harness([completed(hostileOutput)]);
    await expect(client.generate(hostileRequest)).resolves.toEqual(hostileOutput);

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      model: "gpt-5.6-sol",
      reasoningEffort: "medium",
      store: false,
    });
    expect(requests[0]?.textFormat).toMatchObject({
      type: "json_schema",
      name: "life_finance_hostile_fed_v1",
      strict: true,
    });
    expect(audits).toEqual([
      expect.objectContaining({
        invocationId: "invocation_1",
        role: "hostile_fed",
        model: "gpt-5.6-sol",
        outcome: "success",
        prompt: expect.objectContaining({
          instructions: expect.stringContaining("Hostile Fed"),
          input: hostileRequest,
        }),
        attempts: [expect.objectContaining({ kind: "success", responseId: "resp_1" })],
      }),
    ]);
  });

  it("retries transient transport errors exactly twice with bounded backoff", async () => {
    const first = Object.assign(new Error("rate limited"), { status: 429 });
    const second = Object.assign(new Error("server unavailable"), { status: 503 });
    const { client, requests, audits, delay } = harness([
      first,
      second,
      completed(hostileOutput, "resp_3"),
    ]);

    await expect(client.generate(hostileRequest)).resolves.toEqual(hostileOutput);
    expect(requests).toHaveLength(3);
    expect(delay).toHaveBeenNthCalledWith(1, 200);
    expect(delay).toHaveBeenNthCalledWith(2, 400);
    expect(audits[0]?.attempts.map(({ kind }) => kind)).toEqual([
      "transport_error",
      "transport_error",
      "success",
    ]);
  });

  it("does not retry non-transient API errors and exposes no provider message", async () => {
    const providerError = Object.assign(new Error("secret provider detail"), { status: 400 });
    const { client, requests, audits } = harness([providerError]);

    const error = await client.generate(hostileRequest).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AiServiceError);
    expect(error).toMatchObject({ code: "AI_UNAVAILABLE", httpStatus: 503, retryable: true });
    expect(String(error)).not.toContain("secret provider detail");
    expect(requests).toHaveLength(1);
    expect(audits[0]?.attempts[0]).toMatchObject({ errorCode: "http_400", output: null });
  });

  it("retries invalid structured output once, then fails without fallback", async () => {
    const invalid = { ...hostileOutput, parameters: { income_gap_cents: 9_000_000 } };
    const { client, requests, audits } = harness([
      completed(invalid, "resp_invalid_1"),
      completed(invalid, "resp_invalid_2"),
    ]);

    await expect(client.generate(hostileRequest)).rejects.toMatchObject({
      code: "AI_UNAVAILABLE",
      httpStatus: 503,
    });
    expect(requests).toHaveLength(2);
    expect(audits[0]?.outcome).toBe("failure");
    expect(audits[0]?.attempts.map(({ kind }) => kind)).toEqual([
      "invalid_output",
      "invalid_output",
    ]);
  });

  it("treats refusal and incomplete responses as invalid output", async () => {
    const refusal: AiTransportResult = {
      responseId: "resp_refusal",
      status: "completed",
      outputText: "",
      output: [{ type: "message", content: [{ type: "refusal", refusal: "Cannot help" }] }],
    };
    const incomplete: AiTransportResult = {
      responseId: "resp_incomplete",
      status: "incomplete",
      outputText: "{}",
      output: [],
    };
    const { client, audits } = harness([refusal, incomplete]);
    await expect(client.generate(hostileRequest)).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    expect(audits[0]?.attempts.map(({ kind }) => kind)).toEqual([
      "invalid_output",
      "invalid_output",
    ]);
  });

  it("prevents the teacher from changing the deterministic grade", async () => {
    const request: TeacherRequest = {
      contractVersion: 1,
      privacyNoticeVersion: 1,
      dataUseAccepted: true,
      role: "teacher",
      outcome: { kind: "retirement_age", grade: "B", reasonCode: "age_65" },
      evidence: [{ id: "fi_progress", label: "FI progress", value: "70%" }],
      decisions: [
        { id: "decision.1", month: "2026-07", summary: "Invested cash", evidenceIds: ["fi_progress"] },
      ],
    };
    const invalidGrade = {
      grade: "S",
      title: "Perfect",
      summary: "A model cannot promote this deterministic grade.",
      decisiveMoments: [
        { decisionId: "decision.1", lesson: "Keep learning.", citedEvidenceIds: ["fi_progress"] },
      ],
      nextSteps: ["Keep saving."],
    };
    const { client } = harness([completed(invalidGrade), completed(invalidGrade, "resp_2")]);
    await expect(client.generate(request)).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  });

  it("uses Terra for explanations and rejects invented evidence IDs", async () => {
    const request: ExplanationRequest = {
      contractVersion: 1,
      privacyNoticeVersion: 1,
      dataUseAccepted: true,
      role: "explanation",
      conceptId: "emergency_fund",
      audienceLevel: "beginner",
      whyNow: "A repair is due.",
      evidence: [{ id: "cash_months", label: "Cash buffer", value: "0.8 months" }],
    };
    const output = {
      title: "Emergency funds",
      explanation: "Cash can absorb a surprise without a forced sale.",
      whyItMattersNow: "A repair is due while the buffer is thin.",
      actionTips: ["Protect a starter cash buffer."],
      citedEvidenceIds: ["invented_fact"],
    };
    const { client, requests } = harness([completed(output), completed(output, "resp_2")]);
    await expect(client.generate(request)).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    expect(requests[0]).toMatchObject({ model: "gpt-5.6-terra", reasoningEffort: "low" });
  });

  it("rejects sensitive input before transport or audit", async () => {
    const request: ExplanationRequest = {
      contractVersion: 1,
      privacyNoticeVersion: 1,
      dataUseAccepted: true,
      role: "explanation",
      conceptId: "emergency_fund",
      audienceLevel: "beginner",
      whyNow: "Email me@example.com about this.",
      evidence: [],
    };
    const { client, requests, audits } = harness([]);
    await expect(client.generate(request)).rejects.toMatchObject({
      code: "SENSITIVE_INPUT",
      httpStatus: 400,
    });
    expect(requests).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("withholds valid output when durable audit recording fails", async () => {
    const transport: AiResponsesTransport = { async create() { return completed(hostileOutput); } };
    const client = new AiRoleClient(transport, {
      async record() { throw new Error("database detail"); },
    });

    const error = await client.generate(hostileRequest).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "AUDIT_UNAVAILABLE", httpStatus: 503 });
    expect(String(error)).not.toContain("database detail");
  });
});
