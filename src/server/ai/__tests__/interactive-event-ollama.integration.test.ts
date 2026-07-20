import { describe, expect, it } from "vitest";

import { AiRoleClient } from "../client";
import { AI_CONTRACT_VERSION } from "../contracts";
import { OllamaGptOssTransport } from "../ollama-transport";
import { AI_PRIVACY_NOTICE_VERSION } from "../privacy-notice";

const runIntegration = process.env.RUN_OLLAMA_INTEGRATION === "1";

describe.skipIf(!runIntegration)("interactive event Ollama integration", () => {
  it("maps a natural English answer with the lightweight local classifier", async () => {
    const client = new AiRoleClient(
      new OllamaGptOssTransport({
        model: process.env.AI_INTERACTIVE_OLLAMA_MODEL ?? "qwen2.5:7b-instruct",
        timeoutMs: 10_000,
      }),
      { record: async () => undefined },
      { maxTransportRetries: 0, maxSchemaRetries: 0 },
    );
    const result = await client.generate<"event_interpreter">({
      contractVersion: AI_CONTRACT_VERSION,
      privacyNoticeVersion: AI_PRIVACY_NOTICE_VERSION,
      dataUseAccepted: true,
      role: "event_interpreter",
      interactionMode: "interpret",
      recommendationDirective: null,
      event: {
        templateId: "personal.lifestyle_upgrade",
        headline: "A lifestyle upgrade is within reach",
        situation: "A nicer lifestyle would permanently raise your cost base.",
        choices: [
          {
            id: "keep_current_lifestyle",
            label: "Keep current spending",
            consequence: "Avoid lifestyle inflation.",
          },
          {
            id: "accept_upgrade",
            label: "Upgrade the lifestyle",
            consequence: "Permanently increase annual living costs.",
          },
        ],
      },
      evidence: [{ id: "cash_runway", label: "Cash runway", value: "2.0 months" }],
      conversation: [{
        role: "player",
        content: "I refuse to let lifestyle creep inflate my burn rate.",
      }],
      playerTurn: 1,
      maximumPlayerTurns: 3,
    });

    expect(result).toMatchObject({
      status: "mapped",
      choiceId: "keep_current_lifestyle",
      reasonCode: "choice_match",
    });
    expect(result.confidencePpm).toBeGreaterThanOrEqual(650_000);
  }, 15_000);

  it("recommends one supplied choice using current financial evidence", async () => {
    const client = new AiRoleClient(
      new OllamaGptOssTransport({
        model: process.env.AI_INTERACTIVE_OLLAMA_MODEL ?? "qwen2.5:7b-instruct",
        timeoutMs: 10_000,
      }),
      { record: async () => undefined },
      { maxTransportRetries: 0, maxSchemaRetries: 0 },
    );
    const result = await client.generate<"event_interpreter">({
      contractVersion: AI_CONTRACT_VERSION,
      privacyNoticeVersion: AI_PRIVACY_NOTICE_VERSION,
      dataUseAccepted: true,
      role: "event_interpreter",
      interactionMode: "recommend",
      recommendationDirective: {
        choiceId: "emergency_budget",
        priority: "protect_cash",
        rationale: "A 2.0-month cash runway and no current salary make preserving available cash the priority.",
        tradeoff: "This choice requires immediate spending cuts.",
        requiredEvidenceIds: ["cash_runway", "gross_income"],
      },
      event: {
        templateId: "personal.industry_layoff",
        headline: "The paycheck stopped",
        situation: "Income is interrupted while required expenses continue.",
        choices: [
          {
            id: "maintain_lifestyle",
            label: "Maintain current spending",
            consequence: "Keep every commitment while the full income gap remains payable.",
          },
          {
            id: "emergency_budget",
            label: "Activate an emergency budget",
            consequence: "Cut spending now to preserve cash runway.",
          },
        ],
      },
      evidence: [
        { id: "cash_runway", label: "Cash runway", value: "2.0 months" },
        { id: "gross_income", label: "Annual gross income", value: "No current salary" },
        { id: "preparedness", label: "Financial preparedness", value: "exposed (42%)" },
      ],
      conversation: [{
        role: "player",
        content: "What would you recommend for my current financial situation, and why?",
      }],
      playerTurn: 1,
      maximumPlayerTurns: 3,
    });

    expect(result).toMatchObject({
      status: "recommended",
      choiceId: null,
      recommendedChoiceId: "emergency_budget",
      reasonCode: "personalized_recommendation",
    });
    expect(result.citedEvidenceIds).toContain("cash_runway");
    expect(`${result.assistantMessage} ${result.recommendationReason}`).toMatch(
      /(?:cash runway|2\.0 months|financial preparedness|42%)/iu,
    );
  }, 15_000);

  it("follows the engine directive when a late player message says to protect cash", async () => {
    const client = new AiRoleClient(
      new OllamaGptOssTransport({
        model: process.env.AI_INTERACTIVE_OLLAMA_MODEL ?? "qwen2.5:7b-instruct",
        timeoutMs: 10_000,
      }),
      { record: async () => undefined },
      { maxTransportRetries: 0, maxSchemaRetries: 0 },
    );
    const rationale = "Your latest stated priority is “Protect available cash.” The engine recommends “Decline the commitment.” It has the strongest first-month cash effect among the available choices ($0.00), with $0.00 over the modeled horizon.";
    const tradeoff = "The deterministic preview shows that happiness declines.";
    const result = await client.generate<"event_interpreter">({
      contractVersion: AI_CONTRACT_VERSION,
      privacyNoticeVersion: AI_PRIVACY_NOTICE_VERSION,
      dataUseAccepted: true,
      role: "event_interpreter",
      interactionMode: "recommend",
      recommendationDirective: {
        choiceId: "decline_commitment",
        priority: "protect_cash",
        rationale,
        tradeoff,
        requiredEvidenceIds: ["recommendation_priority", "recommended_choice_outcome"],
      },
      event: {
        templateId: "personal.social_commitment",
        headline: "A meaningful social commitment strains the monthly plan",
        situation: "Paying, financing, and declining each protect a different part of your life.",
        choices: [
          {
            id: "pay_commitment_now",
            label: "Pay for the commitment now",
            consequence: "Pay $433.05 now. Happiness improves.",
          },
          {
            id: "spread_commitment_cost",
            label: "Spread the cost over three months",
            consequence: "Pay $173.22 per month for three months ($519.66 total). Happiness improves.",
          },
          {
            id: "decline_commitment",
            label: "Decline the commitment",
            consequence: "Happiness declines.",
          },
        ],
      },
      evidence: [
        { id: "cash_balance", label: "Available cash", value: "$6,000" },
        { id: "cash_runway", label: "Cash runway", value: "2.0 months" },
        { id: "recommendation_priority", label: "Recommendation priority", value: "Protect available cash" },
        { id: "recommended_choice_outcome", label: "Recommended choice modeled outcome", value: "Strongest first-month cash effect: $0.00" },
      ],
      conversation: [
        { role: "player", content: "I wanto to?" },
        { role: "sprout", content: "What financial priority are you protecting?" },
        { role: "player", content: "my cash" },
        { role: "sprout", content: "What will you do now?" },
        { role: "player", content: "What would you recommend for my current financial situation, and why?" },
      ],
      playerTurn: 3,
      maximumPlayerTurns: 3,
    });

    expect(result).toMatchObject({
      status: "recommended",
      choiceId: null,
      recommendedChoiceId: "decline_commitment",
      recommendationReason: rationale,
      tradeoff,
      citedEvidenceIds: ["recommendation_priority", "recommended_choice_outcome"],
    });
    expect(result.assistantMessage).not.toMatch(/late fee|penalt|interest/iu);
  }, 15_000);

  it("uses the latest correction and resolves references across the full conversation", async () => {
    const client = new AiRoleClient(
      new OllamaGptOssTransport({
        model: process.env.AI_INTERACTIVE_OLLAMA_MODEL ?? "qwen2.5:7b-instruct",
        timeoutMs: 12_000,
      }),
      { record: async () => undefined },
      { maxTransportRetries: 0, maxSchemaRetries: 0 },
    );
    const base = {
      contractVersion: AI_CONTRACT_VERSION,
      privacyNoticeVersion: AI_PRIVACY_NOTICE_VERSION,
      dataUseAccepted: true as const,
      role: "event_interpreter" as const,
      interactionMode: "interpret" as const,
      recommendationDirective: null,
      evidence: [],
      playerTurn: 2,
      maximumPlayerTurns: 3 as const,
    };

    const corrected = await client.generate<"event_interpreter">({
      ...base,
      event: {
        templateId: "personal.medical_bill",
        headline: "An unexpected medical bill arrives",
        situation: "A health visit produced a bill that needs a decision.",
        choices: [
          {
            id: "medical_payment_plan",
            label: "Use a four-month payment plan",
            consequence: "Spread the bill across four months.",
          },
          {
            id: "pay_uninsured",
            label: "Pay without coverage",
            consequence: "Pay the bill immediately without coverage.",
          },
        ],
      },
      conversation: [
        { role: "player", content: "I could use the four-month payment plan." },
        { role: "sprout", content: "Which action should I lock in?" },
        { role: "player", content: "Actually, pay it immediately without coverage instead." },
      ],
    });
    expect(corrected).toMatchObject({
      status: "mapped",
      choiceId: "pay_uninsured",
      reasonCode: "choice_match",
    });

    const referenced = await client.generate<"event_interpreter">({
      ...base,
      event: {
        templateId: "personal.transport_repair",
        headline: "Your transportation needs an urgent repair",
        situation: "The repair needs a payment decision.",
        choices: [
          {
            id: "pay_now",
            label: "Pay for the repair now",
            consequence: "Pay the repair cost immediately.",
          },
          {
            id: "payment_plan",
            label: "Use a three-month payment plan",
            consequence: "Spread a higher total cost over three months.",
          },
        ],
      },
      conversation: [
        { role: "player", content: "I need help choosing." },
        { role: "sprout", content: "I recommend using the three-month payment plan. Do you want that direction?" },
        { role: "player", content: "Yes, do that." },
      ],
    });
    expect(referenced).toMatchObject({
      status: "mapped",
      choiceId: "payment_plan",
      reasonCode: "choice_match",
    });
  }, 25_000);
});
