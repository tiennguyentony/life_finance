import { randomUUID } from "node:crypto";

import { zodTextFormat } from "openai/helpers/zod";

import { AI_ROLE_MODELS } from "../ai/contracts";
import { aiTransportFromEnvironment, getAiAuditRepository } from "../ai/runtime";
import type { AiAuditAttempt } from "../ai/client";
import type { TeachingRewriteRequesterV2 } from "./rewrite-service-v2";
import { teachingRewriteProviderOutputV2Schema } from "./rewrite-contracts-v2";

const INSTRUCTIONS =
  "Reorder or shorten only the supplied deterministic template words. Preserve every section ID and all fact/claim references. Do not add facts, numbers, causes, recommendations, or new vocabulary. Return only structured sections.";

export const requestTeachingRewriteFromEnvironmentV2: TeachingRewriteRequesterV2 =
  async (runId, request, signal) => {
    if (signal.aborted) throw new Error("teaching rewrite aborted");
    const transport = aiTransportFromEnvironment();
    const audit = getAiAuditRepository(runId);
    const model = AI_ROLE_MODELS.explanation;
    const auditModel = transport.auditModel?.(model) ?? model;
    const invocationId = randomUUID();
    const promptInput = {
      version: "teaching-rewrite-request-v2",
      fallback: request.fallback,
      policy: request.policy,
    } as const;
    const attempts: AiAuditAttempt[] = [];
    try {
      const result = await transport.create({
        model,
        input: [
          { role: "developer", content: INSTRUCTIONS },
          { role: "user", content: JSON.stringify(promptInput) },
        ],
        textFormat: zodTextFormat(
          teachingRewriteProviderOutputV2Schema,
          "life_finance_teaching_rewrite_v2",
        ),
        reasoningEffort: "low",
        store: false,
      });
      if (signal.aborted || result.status !== "completed") {
        throw new Error("teaching rewrite did not complete");
      }
      const decoded: unknown = JSON.parse(result.outputText);
      const output = teachingRewriteProviderOutputV2Schema.parse(decoded);
      attempts.push({
        attempt: 1,
        kind: "success",
        responseId: result.responseId,
        output,
        errorCode: null,
      });
      await audit.record({
        invocationId,
        contractVersion: 2,
        role: "explanation",
        model: auditModel,
        prompt: { instructions: INSTRUCTIONS, input: promptInput },
        attempts,
        outcome: "success",
      });
      return output;
    } catch (error) {
      if (attempts.length === 0) {
        attempts.push({
          attempt: 1,
          kind: "transport_error",
          responseId: null,
          output: null,
          errorCode: "TEACHING_REWRITE_FAILED",
        });
      }
      await audit.record({
        invocationId,
        contractVersion: 2,
        role: "explanation",
        model: auditModel,
        prompt: { instructions: INSTRUCTIONS, input: promptInput },
        attempts,
        outcome: "failure",
      });
      throw error;
    }
  };
