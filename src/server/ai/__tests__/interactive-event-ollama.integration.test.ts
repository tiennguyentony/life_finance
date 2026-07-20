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
});
