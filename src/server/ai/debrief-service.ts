import type { GameStateV2 } from "../../core/game-state-v2";
import { sha256Canonical } from "../../core/canonical";
import { lifeMilestoneState } from "../../core/life-milestones-v2";
import type { V2Repository } from "../api/v2/repository-port";
import type { AiRoleClient } from "./client";
import { AI_CONTRACT_VERSION, type TeacherRequest, type TeacherResponse } from "./contracts";
import {
  aiDebriefApiResponseSchema,
  type AiDebriefApiRequest,
  type AiDebriefApiResponse,
} from "./debrief-contracts";
import { buildAiGameContext, contextEvidence } from "./game-context";

export class AiDebriefError extends Error {
  readonly code: "STALE_REVISION" | "RUN_NOT_TERMINAL";

  constructor(code: AiDebriefError["code"], message: string) {
    super(message);
    this.name = "AiDebriefError";
    this.code = code;
  }
}

type ClientFactory = (runId: string) => Pick<AiRoleClient, "generate"> &
  Partial<Pick<AiRoleClient, "responseSource">>;

function decisions(state: GameStateV2, evidenceIds: readonly string[]): TeacherRequest["decisions"] {
  const eventDecisions = state.gameplay.eventLifecycle.history.slice(-10).map((event, index) => ({
    id: `decision.event.${index}`,
    month: event.resolvedMonth,
    summary: `Chose ${event.choiceId.replaceAll("_", " ")} during ${event.templateId.replaceAll("_", " ")}.`,
    evidenceIds: [...evidenceIds.slice(0, 3)],
  }));
  const milestoneDecisions = lifeMilestoneState(state).history.slice(-10).map((milestone, index) => ({
    id: `decision.milestone.${index}`,
    month: milestone.resolvedMonth,
    summary: `${milestone.resolution === "paid_cash" ? "Funded" : "Cancelled"} ${milestone.label}.`,
    evidenceIds: [...evidenceIds.slice(0, 3)],
  }));
  const combined = [...eventDecisions, ...milestoneDecisions].slice(-20);
  return combined.length > 0 ? combined : [{
    id: "decision.run_summary",
    month: state.currentMonth,
    summary: "The recurring plan and balance-sheet choices produced the final outcome.",
    evidenceIds: [...evidenceIds.slice(0, 3)],
  }];
}

function fallback(state: GameStateV2, requestDecisions: TeacherRequest["decisions"], evidenceIds: readonly string[]): TeacherResponse {
  const outcome = state.outcome!;
  return {
    grade: outcome.grade,
    title: `Final grade ${outcome.grade}: ${outcome.kind.replaceAll("_", " ")}`,
    summary: `The deterministic engine ended the run because ${outcome.reasonCode.replaceAll("_", " ")}. This debrief preserves the engine grade and uses only recorded run evidence.`,
    decisiveMoments: [{
      decisionId: requestDecisions[0]!.id,
      lesson: "Liquidity, recurring commitments, protection, and long-term investing must work together; a strong balance in one bucket cannot compensate for every other exposure.",
      citedEvidenceIds: [...evidenceIds.slice(0, 3)],
    }],
    nextSteps: [
      "Replay with one strategy change and compare checkpoint evidence.",
      "Review the weakest exposure metric before increasing investment risk.",
    ],
  };
}

function groundedDebrief(
  candidate: TeacherResponse,
  template: TeacherResponse,
  evidenceIds: ReadonlySet<string>,
): TeacherResponse | null {
  if (
    candidate.grade !== template.grade ||
    candidate.title !== template.title ||
    candidate.summary !== template.summary ||
    sha256Canonical(candidate.nextSteps) !== sha256Canonical(template.nextSteps) ||
    candidate.decisiveMoments.length !== template.decisiveMoments.length
  ) return null;
  for (const [index, moment] of candidate.decisiveMoments.entries()) {
    const trusted = template.decisiveMoments[index]!;
    if (
      moment.decisionId !== trusted.decisionId ||
      moment.lesson !== trusted.lesson ||
      new Set(moment.citedEvidenceIds).size !== moment.citedEvidenceIds.length ||
      moment.citedEvidenceIds.some((id) => !evidenceIds.has(id))
    ) return null;
  }
  return candidate;
}

export class AiDebriefService {
  constructor(
    private readonly repository: V2Repository,
    private readonly clientFactory: ClientFactory,
  ) {}

  async createDebrief(runId: string, accessSecret: string, request: AiDebriefApiRequest): Promise<AiDebriefApiResponse> {
    const state = await this.repository.loadAuthorizedRunV2(runId, accessSecret);
    if (state.revision !== request.expectedRevision) throw new AiDebriefError("STALE_REVISION", "run changed before debrief started");
    if (!state.outcome) throw new AiDebriefError("RUN_NOT_TERMINAL", "final debrief is available when the run ends");
    const context = buildAiGameContext(state);
    const evidence = [...contextEvidence(context)];
    const requestDecisions = decisions(state, evidence.map(({ id }) => id));
    let source: AiDebriefApiResponse["source"] = "deterministic_fallback";
    const deterministicDebrief = fallback(
      state,
      requestDecisions,
      evidence.map(({ id }) => id),
    );
    let debrief = deterministicDebrief;
    try {
      const client = this.clientFactory(runId);
      const candidate = await client.generate<"teacher">({
        contractVersion: AI_CONTRACT_VERSION,
        privacyNoticeVersion: request.privacyNoticeVersion,
        dataUseAccepted: request.dataUseAccepted,
        role: "teacher",
        outcome: {
          kind: state.outcome.kind,
          grade: state.outcome.grade,
          reasonCode: state.outcome.reasonCode,
        },
        evidence,
        decisions: requestDecisions,
      });
      const validated = groundedDebrief(
        candidate,
        deterministicDebrief,
        new Set(evidence.map(({ id }) => id)),
      );
      if (validated) {
        debrief = validated;
        source = client.responseSource?.() ?? "openai";
      }
    } catch {
      // Preserve the deterministic grade and evidence when AI is unavailable.
    }
    return aiDebriefApiResponseSchema.parse({ source, debrief });
  }
}
