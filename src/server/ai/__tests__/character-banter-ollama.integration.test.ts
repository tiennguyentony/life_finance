import { describe, expect, it } from "vitest";

import {
  AiRoleClient,
  type AiAuditRecord,
} from "../client";
import { aiTransportFromEnvironment } from "../runtime";

const describeOllama = process.env.RUN_OLLAMA_INTEGRATION === "1"
  ? describe
  : describe.skip;

describeOllama("local character banter integration", () => {
  it("produces one grounded, structured punchline", async () => {
    const audits: AiAuditRecord[] = [];
    const client = new AiRoleClient(
      aiTransportFromEnvironment(process.env, {
        // Match the local runtime ceiling, including a bounded cold load.
        timeoutMs: 8_000,
        ollamaModel: process.env.AI_BANTER_OLLAMA_MODEL ?? "qwen2.5:7b-instruct",
      }),
      { record: async (record) => { audits.push(record); } },
      { maxTransportRetries: 0, maxSchemaRetries: 1 },
    );

    try {
      const result = await client.generate<"banter_writer">({
        contractVersion: 1,
        privacyNoticeVersion: 2,
        dataUseAccepted: true,
        role: "banter_writer",
        simulationMonth: "2026-10",
        planLabel: "Stay steady",
        variationSeed: Number(process.env.BANTER_SEED ?? 777),
        evidence: [
          { id: "debt_change", label: "Debt decreased this month", value: "$250.00" },
          { id: "monthly_tax", label: "Tax withheld from income this month", value: "$480.00" },
        ],
        recentLines: ["Looks like your piggy bank finally got a spa day, sprouting money faster than my optimism!"],
        recentEvidenceIds: ["cash_change"],
        recentCharacterIds: ["sprout"],
      });
      expect(result.citedEvidenceId).toMatch(/^(?:debt_change|monthly_tax)$/u);
      expect(result.message).not.toBe("Looks like your piggy bank finally got a spa day, sprouting money faster than my optimism!");
    } catch (error) {
      throw new Error(
        `Banter integration failed: ${String(error)}; attempts=${JSON.stringify(audits.at(-1)?.attempts ?? [])}`,
      );
    }
  }, 20_000);
});
