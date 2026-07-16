import { sha256Canonical } from "../../core/canonical";
import type { GameStateV2 } from "../../core/game-state-v2";
import { generateDeclarativePersonalEventCandidatesV2 } from "../../core/personal-event-v2";
import { analyzeRiskV1 } from "../../core/risk-v1";
import {
  rankScenarioCandidatesWithOptionalAiV2,
  type ScenarioDirectorAiRequestV2,
} from "../../core/scenario-director-ai-adapter-v2";
import {
  type ScenarioDirectorInputV2,
} from "../../core/scenario-director-v2";
import { SCENARIO_DIRECTOR_V2_VERSION } from "../../core/scenario-director-policy-v2";
import { PERSONAL_EVENT_TEMPLATES_V2 } from "../../data/personal-event-templates-v2";
import type { V2Repository } from "../api/v2/repository-port";
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
  readonly code: "STALE_REVISION" | "WORLD_EVENT_NOT_READY";

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
  const balance = state.gameplay.runtimeBalance?.version === 2
    ? state.gameplay.runtimeBalance
    : undefined;
  return {
    version: SCENARIO_DIRECTOR_V2_VERSION,
    month: state.currentMonth,
    riskSnapshot: analyzeRiskV1(state),
    macro: {
      regime: state.marketRegime,
      tags: [`macro.${state.marketRegime}`],
    },
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
      directorTags: [
        `director.category.${template.category}`,
        `director.tier.${template.severityTier}`,
      ],
    })),
    recentDecisions: [],
    recentEvents: (balance?.recentEvents ?? []).map((event) => ({
      templateId: event.templateId,
      templateVersion: event.templateVersion,
      category: event.category,
      tier: event.tier,
      targetedWeakness: event.targetedWeakness,
      lessonTags: [...event.lessonTags],
      month: event.approvedMonth,
    })),
    lessonExposureCounts: (balance?.lessonExposureCounts ?? []).map(
      ({ lessonTag, count }) => ({ lessonTag, count }),
    ),
    difficulty: balance?.difficulty ?? "normal",
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
    if (!state.gameplay.exposure.current) {
      throw new AiWorldDirectorError(
        "WORLD_EVENT_NOT_READY",
        "process at least one month before requesting a scenario ranking",
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
