import { describe, expect, it, vi } from "vitest";

import type {
  AiAuditRecord,
  AiResponsesTransport,
  AiTransportRequest,
  AiTransportResult,
} from "../client";
import { AiRoleClient, AiServiceError } from "../client";
import type {
  BanterWriterRequest,
  ExplanationRequest,
  EventInterpreterRequest,
  HostileFedRequest,
  ScenarioDirectorRequest,
  TeacherRequest,
} from "../contracts";

const hostileRequest: HostileFedRequest = {
  contractVersion: 1,
  privacyNoticeVersion: 2,
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
  parameters: [{ id: "income_gap_cents", value: 500_000 }],
  headline: "The paycheck stops before the bills do",
  narrative: "Your industry contracts while fixed costs remain due.",
  rationale: "This fairly tests the evidenced thin cash buffer.",
  citedEvidenceIds: ["cash_months"],
};

const scenarioDirectorRequest: ScenarioDirectorRequest = {
  contractVersion: 2,
  privacyNoticeVersion: 2,
  dataUseAccepted: true,
  role: "scenario_director",
  director: {
    version: "scenario-director-ai-request-v1",
    candidateSetChecksum: "a".repeat(64),
    difficulty: "normal",
    macro: { regime: "recession", tags: ["macro.recession"] },
    riskFacts: [
      { metricId: "emergency_fund_months", severityBand: "high" },
    ],
    candidates: [
      {
        templateId: "personal.medical_bill",
        templateVersion: 2,
        category: "health",
        tier: "medium",
        targetedWeakness: "low_emergency_fund",
        lessonTags: {
          primary: "lesson.insurance",
          secondary: ["lesson.emergency_fund"],
        },
        directorTags: ["director.category.health"],
        intendedLesson: "lesson.insurance",
        reasonCodes: ["weakness_relevance"],
      },
    ],
    recentDecisions: [],
    recentEvents: [],
    lessonHistory: [],
  },
};

const scenarioDirectorOutput = {
  version: "scenario-director-ai-response-v1",
  candidateSetChecksum: "a".repeat(64),
  ranked: [
    {
      templateId: "personal.medical_bill",
      templateVersion: 2,
      intendedLesson: "lesson.insurance",
      reasonCodes: ["weakness_relevance"],
    },
  ],
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

  it("accepts only an exact Scenario Director candidate permutation", async () => {
    const valid = harness([completed(scenarioDirectorOutput)]);
    await expect(
      valid.client.generate(scenarioDirectorRequest),
    ).resolves.toEqual(scenarioDirectorOutput);
    expect(valid.requests[0]).toMatchObject({
      model: "gpt-5.6-sol",
      reasoningEffort: "medium",
      store: false,
    });
    expect(valid.audits[0]).toMatchObject({
      contractVersion: 2,
      role: "scenario_director",
      outcome: "success",
    });

    const unknown = {
      ...scenarioDirectorOutput,
      ranked: [{
        ...scenarioDirectorOutput.ranked[0],
        templateId: "personal.unknown",
      }],
    };
    const invalid = harness([
      completed(unknown, "resp_unknown_1"),
      completed(unknown, "resp_unknown_2"),
    ]);
    await expect(
      invalid.client.generate(scenarioDirectorRequest),
    ).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    expect(invalid.audits[0]?.attempts.map(({ kind }) => kind)).toEqual([
      "invalid_output",
      "invalid_output",
    ]);
  });

  it("records the actual local provider model instead of the requested production model", async () => {
    const audits: AiAuditRecord[] = [];
    const transport: AiResponsesTransport = {
      auditModel: () => "ollama/gpt-oss:20b",
      async create() {
        return completed(hostileOutput);
      },
    };
    const client = new AiRoleClient(transport, {
      async record(record) {
        audits.push(record);
      },
    });

    await client.generate(hostileRequest);

    expect(audits[0]?.model).toBe("ollama/gpt-oss:20b");
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
    const invalid = {
      ...hostileOutput,
      parameters: [{ id: "income_gap_cents", value: 9_000_000 }],
    };
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
      privacyNoticeVersion: 2,
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
      privacyNoticeVersion: 2,
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

  it("uses the fast interpreter model and keeps raw conversations out of audit records", async () => {
    const request: EventInterpreterRequest = {
      contractVersion: 1,
      privacyNoticeVersion: 2,
      dataUseAccepted: true,
      role: "event_interpreter",
      event: {
        templateId: "personal.industry_layoff",
        headline: "The paycheck stopped",
        situation: "Income is interrupted while expenses continue.",
        choices: [{
          id: "emergency_budget",
          label: "Activate an emergency budget",
          consequence: "Reduce ongoing expenses.",
        }],
      },
      conversation: [{ role: "player", content: "I want to protect my runway." }],
      playerTurn: 1,
      maximumPlayerTurns: 3,
    };
    const output = {
      status: "ambiguous",
      choiceId: null,
      confidencePpm: 400_000,
      reasonCode: "multiple_choices",
      followUpQuestion: "What concrete action would you take first?",
    };
    const { client, requests, audits } = harness([completed(output)]);

    await expect(client.generate(request)).resolves.toEqual(output);
    expect(requests[0]).toMatchObject({
      model: "gpt-5.6-luna",
      reasoningEffort: "low",
      maxOutputTokens: 160,
      store: false,
    });
    expect(audits[0]?.prompt.input).toMatchObject({
      conversationMessageCount: 1,
      conversationCharacterCount: 28,
      playerTurn: 1,
    });
    expect(audits[0]?.prompt.input).not.toHaveProperty("conversation");
    expect(audits[0]?.attempts[0]?.output).toBeNull();
  });

  it("uses randomized low-cost generation and enforces banter evidence grounding", async () => {
    const request: BanterWriterRequest = {
      contractVersion: 1,
      privacyNoticeVersion: 2,
      dataUseAccepted: true,
      role: "banter_writer",
      simulationMonth: "2026-10",
      planLabel: "Pay down debt",
      variationSeed: 91_337,
      evidence: [{ id: "debt_change", label: "Debt change", value: "-$500.00" }],
      recentLines: [],
      recentEvidenceIds: [],
      recentCharacterIds: [],
    };
    const output = {
      characterId: "debtzilla",
      tone: "roast",
      message: "Excuse me, who authorized debt to start moving in the correct direction?",
      citedEvidenceId: "debt_change",
    } as const;
    const { client, requests } = harness([completed(output)]);

    await expect(client.generate(request)).resolves.toEqual(output);
    expect(requests[0]).toMatchObject({
      model: "gpt-5.6-luna",
      reasoningEffort: "low",
      maxOutputTokens: 256,
      sampling: { temperature: 0.9, seed: 91_337 },
      store: false,
    });
  });

  it("removes a redundant cast prefix from generated banter", async () => {
    const request: BanterWriterRequest = {
      contractVersion: 1,
      privacyNoticeVersion: 2,
      dataUseAccepted: true,
      role: "banter_writer",
      simulationMonth: "2026-10",
      planLabel: "Build cash",
      variationSeed: 81,
      evidence: [{ id: "cash_change", label: "Cash increased", value: "$500.00" }],
      recentLines: [],
      recentEvidenceIds: [],
      recentCharacterIds: [],
    };
    const { client } = harness([completed({
      characterId: "sprout",
      tone: "cheer",
      message: "Sprout: Cash finally brought its own growth chart.",
      citedEvidenceId: "cash_change",
    })]);

    await expect(client.generate(request)).resolves.toMatchObject({
      message: "Cash finally brought its own growth chart.",
    });
  });

  it("treats speaker rotation as a creative preference rather than dropping copy", async () => {
    const request: BanterWriterRequest = {
      contractVersion: 1,
      privacyNoticeVersion: 2,
      dataUseAccepted: true,
      role: "banter_writer",
      simulationMonth: "2026-10",
      planLabel: "Invest steadily",
      variationSeed: 44,
      evidence: [{ id: "cash_change", label: "Cash change", value: "+$500.00" }],
      recentLines: ["A prior Sprout line."],
      recentEvidenceIds: ["preparedness_change"],
      recentCharacterIds: ["sprout"],
    };
    const repeated = {
      characterId: "sprout",
      tone: "cheer",
      message: "Cash showed up wearing its responsible shoes.",
      citedEvidenceId: "cash_change",
    } as const;
    const { client, requests } = harness([completed(repeated)]);

    await expect(client.generate(request)).resolves.toEqual(repeated);
    expect(requests).toHaveLength(1);
  });

  it("drops an irrelevant local follow-up after a valid mapped interpretation", async () => {
    const request: EventInterpreterRequest = {
      contractVersion: 1,
      privacyNoticeVersion: 2,
      dataUseAccepted: true,
      role: "event_interpreter",
      event: {
        templateId: "personal.lifestyle_upgrade",
        headline: "A lifestyle upgrade is within reach",
        situation: "A nicer lifestyle would permanently raise your cost base.",
        choices: [{
          id: "keep_current_lifestyle",
          label: "Keep current spending",
          consequence: "Avoid lifestyle inflation.",
        }],
      },
      conversation: [{
        role: "player",
        content: "I refuse to inflate my long-term baseline burn.",
      }],
      playerTurn: 1,
      maximumPlayerTurns: 3,
    };
    const modelOutput = {
      status: "mapped",
      choiceId: "keep_current_lifestyle",
      confidencePpm: 950_000,
      reasonCode: "choice_match",
      followUpQuestion: "How can I help you keep spending stable?",
    };
    const { client, requests } = harness([completed(modelOutput)]);

    await expect(client.generate(request)).resolves.toEqual({
      ...modelOutput,
      followUpQuestion: null,
    });
    expect(requests).toHaveLength(1);
  });

  it("does not permit another follow-up after the final player turn", async () => {
    const request: EventInterpreterRequest = {
      contractVersion: 1,
      privacyNoticeVersion: 2,
      dataUseAccepted: true,
      role: "event_interpreter",
      event: {
        templateId: "personal.industry_layoff",
        headline: "The paycheck stopped",
        situation: "Income is interrupted while expenses continue.",
        choices: [{
          id: "emergency_budget",
          label: "Activate an emergency budget",
          consequence: "Reduce ongoing expenses.",
        }],
      },
      conversation: [
        { role: "player", content: "I have a plan." },
        { role: "sprout", content: "What action?" },
        { role: "player", content: "Something cautious." },
        { role: "sprout", content: "What would change?" },
        { role: "player", content: "I am not sure." },
      ],
      playerTurn: 3,
      maximumPlayerTurns: 3,
    };
    const invalid = {
      status: "ambiguous",
      choiceId: null,
      confidencePpm: 300_000,
      reasonCode: "multiple_choices",
      followUpQuestion: "Could you explain again?",
    };
    const { client, requests } = harness([
      completed(invalid),
      completed(invalid, "resp_2"),
    ]);

    await expect(client.generate(request)).rejects.toMatchObject({
      code: "AI_UNAVAILABLE",
    });
    expect(requests).toHaveLength(2);
  });

  it("rejects sensitive input before transport or audit", async () => {
    const request: ExplanationRequest = {
      contractVersion: 1,
      privacyNoticeVersion: 2,
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
