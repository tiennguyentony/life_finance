import { sha256Canonical } from "../../core/canonical";
import type { GameStateV2 } from "../../core/game-state-v2";
import { generateDeclarativePersonalEventCandidatesV2 } from "../../core/personal-event-v2";
import { analyzeRiskV1 } from "../../core/risk-v1";
import {
  projectScenarioDirectorStateContextV2,
  scenarioDirectorTagsForCandidateV2,
} from "../../core/scenario-director-context-v2";
import {
  rankScenarioCandidatesWithOptionalAiV2,
  type ScenarioDirectorAiRequestV2,
} from "../../core/scenario-director-ai-adapter-v2";
import {
  type ScenarioDirectorInputV2,
} from "../../core/scenario-director-v2";
import { SCENARIO_DIRECTOR_V2_VERSION } from "../../core/scenario-director-policy-v2";
import { PERSONAL_EVENT_TEMPLATES_V2 } from "../../data/personal-event-templates-v2";
import type { V2Repository } from "../api/run-repository-port";
import type { AiRoleClient } from "./client";
import {
  AI_SCENARIO_DIRECTOR_CONTRACT_VERSION,
  scenarioDirectorRequestSchema,
  type ScenarioDirectorRequest,
} from "./contracts";
import {
  aiWorldEventApiResponseSchema,
  type AiWorldEventApiRequest,
  type AiWorldEventApiResponse,
} from "./world-director-contracts";

export class AiWorldDirectorError extends Error {
  readonly code: "STALE_REVISION";

  constructor(code: AiWorldDirectorError["code"], message: string) {
    super(message);
    this.name = "AiWorldDirectorError";
    this.code = code;
  }
}

type ClientFactory = (runId: string) => Pick<AiRoleClient, "generate"> &
  Partial<Pick<AiRoleClient, "responseSource">>;

function directorInputForState(state: GameStateV2): ScenarioDirectorInputV2 {
  const generated = generateDeclarativePersonalEventCandidatesV2(
    state,
    PERSONAL_EVENT_TEMPLATES_V2,
  );
  const context = projectScenarioDirectorStateContextV2(state);
  return {
    version: SCENARIO_DIRECTOR_V2_VERSION,
    month: state.currentMonth,
    riskSnapshot: analyzeRiskV1(state),
    macro: context.macro,
    candidates: generated.candidates.map(({ template, targetedWeakness }) => ({
      templateId: template.id,
      templateVersion: template.version,
      category: template.category,
      tier: template.severityTier,
      targetedWeakness,
      lessonTags: {
        primary: template.lessonTags.primary,
        secondary: [...template.lessonTags.secondary],
      },
      directorTags: scenarioDirectorTagsForCandidateV2(
        template,
        targetedWeakness,
      ),
    })),
    recentDecisions: context.recentDecisions,
    recentEvents: context.recentEvents,
    lessonExposureCounts: context.lessonExposureCounts,
    difficulty: context.difficulty,
    ...(context.storyArc === undefined ? {} : { storyArc: context.storyArc }),
  };
}

function clientRequest(
  request: AiWorldEventApiRequest,
  director: ScenarioDirectorAiRequestV2,
): ScenarioDirectorRequest {
  return scenarioDirectorRequestSchema.parse({
    contractVersion: AI_SCENARIO_DIRECTOR_CONTRACT_VERSION,
    privacyNoticeVersion: request.privacyNoticeVersion,
    dataUseAccepted: request.dataUseAccepted,
    role: "scenario_director",
    director,
  });
}

export class AiWorldDirectorService {
  constructor(
    private readonly repository: V2Repository,
    private readonly clientFactory: ClientFactory,
  ) {}

  async createEvent(
    runId: string,
    accessSecret: string,
    request: AiWorldEventApiRequest,
  ): Promise<AiWorldEventApiResponse> {
    const state = await this.repository.loadAuthorizedRunV2(runId, accessSecret);
    if (state.revision !== request.expectedRevision) {
      throw new AiWorldDirectorError(
        "STALE_REVISION",
        "run changed before world direction started",
      );
    }
    const input = directorInputForState(state);
    let providerSource: AiWorldEventApiResponse["source"] = "openai";
    const decision = await rankScenarioCandidatesWithOptionalAiV2(
      input,
      input.candidates.length === 0
        ? undefined
        : async (safeRequest) => {
            const client = this.clientFactory(runId);
            const response = await client.generate<"scenario_director">(
              clientRequest(request, safeRequest),
            );
            providerSource = client.responseSource?.() ?? "openai";
            return response;
          },
    );
    const source: AiWorldEventApiResponse["source"] =
      decision.rankingSource === "validated_ai_ranking"
        ? providerSource
        : "deterministic_fallback";

    return aiWorldEventApiResponseSchema.parse({
      source,
      eventId: null,
      outcome: {
        status: "no_approved_event",
        reason: "rank_preview_only",
      },
      ranking: {
        version: decision.version,
        policyVersion: decision.policyVersion,
        riskVersion: decision.riskVersion,
        riskAsOfMonth: decision.riskAsOfMonth,
        difficulty: decision.difficulty,
        macroRegime: decision.macroRegime,
        rankingSource: decision.rankingSource,
        candidateSetChecksum: decision.candidateSetChecksum,
        rankingInputChecksum: decision.rankingInputChecksum,
        ranked: decision.ranked.map(
          ({ rank, templateId, templateVersion, intendedLesson, reasonCodes }) => ({
            rank,
            templateId,
            templateVersion,
            intendedLesson,
            reasonCodes: [...reasonCodes],
          }),
        ),
      },
      state,
      stateChecksum: sha256Canonical(state),
    });
  }
}
