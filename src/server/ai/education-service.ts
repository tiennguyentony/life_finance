import { randomUUID } from "node:crypto";

import { sha256Canonical } from "../../core/canonical";
import { simulationMonth } from "../../core/domain/month";
import type { RecordLearningInteractionV2Command } from "../../core/learning-interaction-v2";
import { getEducationConcept } from "../../data/education-content";
import type { V2Repository } from "../api/v2/repository-port";
import { AiRoleClient } from "./client";
import { AI_CONTRACT_VERSION } from "./contracts";
import {
  aiExplanationApiResponseSchema,
  type AiExplanationApiRequest,
  type AiExplanationApiResponse,
} from "./education-contracts";
import { buildAiGameContext, contextEvidence } from "./game-context";

export class AiEducationError extends Error {
  readonly code: "UNKNOWN_CONCEPT" | "STALE_REVISION";

  constructor(code: AiEducationError["code"], message: string) {
    super(message);
    this.name = "AiEducationError";
    this.code = code;
  }
}

type ClientFactory = (runId: string) => Pick<AiRoleClient, "generate"> &
  Partial<Pick<AiRoleClient, "responseSource">>;

export class AiEducationService {
  constructor(
    private readonly repository: V2Repository,
    private readonly clientFactory: ClientFactory,
    private readonly idFactory: () => string = randomUUID,
  ) {}

  async explain(
    runId: string,
    accessSecret: string,
    request: AiExplanationApiRequest,
  ): Promise<AiExplanationApiResponse> {
    const initial = await this.repository.loadAuthorizedRunV2(runId, accessSecret);
    if (initial.revision !== request.expectedRevision) {
      throw new AiEducationError("STALE_REVISION", "run changed before the AI lesson started");
    }
    const concept = getEducationConcept(request.conceptId);
    if (!concept) throw new AiEducationError("UNKNOWN_CONCEPT", "education concept does not exist");
    const context = buildAiGameContext(initial);
    const evidence = contextEvidence(context);
    let source: AiExplanationApiResponse["source"] = "deterministic_fallback";
    let explanation: AiExplanationApiResponse["explanation"] = {
      title: concept.title,
      explanation: concept.shortDefinition,
      whyItMattersNow: concept.whyItMatters,
      actionTips: [concept.decisionTradeoff],
      citedEvidenceIds: [],
    };
    try {
      const client = this.clientFactory(runId);
      explanation = await client.generate<"explanation">({
        contractVersion: AI_CONTRACT_VERSION,
        privacyNoticeVersion: request.privacyNoticeVersion,
        dataUseAccepted: request.dataUseAccepted,
        role: "explanation",
        conceptId: concept.id,
        audienceLevel: context.learning.audienceLevel,
        whyNow: `Month ${context.month}; FI progress ${context.goal.progressPpm} ppm; adapt to the supplied evidence.`,
        evidence: [...evidence],
      });
      source = client.responseSource?.() ?? "openai";
    } catch {
      // The deterministic curriculum remains available when model, quota, or audit storage is unavailable.
    }

    const command: RecordLearningInteractionV2Command = {
      schemaVersion: 2,
      id: `ai.lesson.${this.idFactory()}`,
      type: "record_learning_interaction_v2",
      expectedRevision: initial.revision,
      effectiveMonth: simulationMonth(initial.currentMonth),
      payload: { conceptId: concept.id, kind: "ai_explanation" },
    };
    let memoryRecorded = false;
    let finalState = initial;
    try {
      const applied = await this.repository.applyCommandV2(runId, accessSecret, command);
      finalState = applied.state;
      memoryRecorded = true;
    } catch {
      finalState = await this.repository.loadAuthorizedRunV2(runId, accessSecret);
    }
    return aiExplanationApiResponseSchema.parse({
      source,
      explanation,
      memoryRecorded,
      state: finalState,
      stateChecksum: sha256Canonical(finalState),
    });
  }
}
