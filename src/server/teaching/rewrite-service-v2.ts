import { sha256Canonical } from "../../core/canonical";
import {
  createTeachingTemplateCopyV2,
  resolveOptionalTeachingRewriteV2,
  type TeachingRewriteResolutionV2,
} from "../../core/teaching-rewrite-v2";
import { analyzeRiskV1 } from "../../core/risk-v1";
import { selectTeachingMomentV2 } from "../../core/teaching-relevance-v2";
import type {
  TeachingRewritePolicyV2,
  TeachingTemplateCopyV2,
} from "../../core/teaching-rewrite-v2";
import type { GameStateV2 } from "../../core/game-state-v2";
import type { TeachingCheckpointRepositoryV2 } from "./service-v2";
import type { TeachingRewriteApiRequestV2 } from "./rewrite-contracts-v2";

export type TeachingRewriteRequesterV2 = (
  runId: string,
  request: TeachingRewriteProviderRequestV2,
  signal: AbortSignal,
) => Promise<unknown>;

export type TeachingRewriteProviderRequestV2 = Readonly<{
  privacyNoticeVersion: number;
  dataUseAccepted: true;
  fallback: TeachingTemplateCopyV2;
  policy: TeachingRewritePolicyV2;
}>;

export type TeachingRewriteApiResponseV2 = Readonly<{
  rewrite: TeachingRewriteResolutionV2;
  stateChecksum: string;
}>;

export class TeachingRewriteServiceV2Error extends Error {
  constructor(readonly code: "INVALID_REQUEST" | "STALE_REVISION") {
    super(code);
    this.name = "TeachingRewriteServiceV2Error";
  }
}

export class TeachingRewriteServiceV2 {
  constructor(
    private readonly repository: Pick<TeachingCheckpointRepositoryV2, "loadAuthorizedRunV2">,
    private readonly requester: TeachingRewriteRequesterV2,
    private readonly timeoutMs = 2_000,
  ) {}

  async rewrite(
    runId: string,
    accessSecret: string,
    request: TeachingRewriteApiRequestV2,
  ): Promise<TeachingRewriteApiResponseV2> {
    const initial = await this.repository.loadAuthorizedRunV2(runId, accessSecret) as GameStateV2;
    if (initial.runId !== runId || initial.revision !== request.expectedRevision) {
      throw new TeachingRewriteServiceV2Error("STALE_REVISION");
    }
    const selection = selectTeachingMomentV2(
      initial,
      analyzeRiskV1(initial),
      { kind: "requested_help", conceptId: request.target.conceptId },
    );
    if (!selection.moment || !selection.facts) {
      throw new TeachingRewriteServiceV2Error("INVALID_REQUEST");
    }
    const fallback = createTeachingTemplateCopyV2([
      {
        sectionId: "moment.title",
        fragments: [{ kind: "text", text: selection.moment.title }],
      },
      {
        sectionId: "moment.explanation",
        fragments: [
          ...selection.moment.paragraphs.map((text) => ({ kind: "text" as const, text })),
          ...selection.facts.facts.map(({ factId }) => ({ kind: "fact_ref" as const, factId })),
        ],
      },
    ]);
    const factIds = selection.facts.facts.map(({ factId }) => factId);
    const policy: TeachingRewritePolicyV2 = {
      allowedFactIds: factIds,
      allowedClaimIds: [],
      requiredFactIds: factIds,
      requiredClaimIds: [],
    };
    const initialChecksum = sha256Canonical(initial);
    const rewrite = await resolveOptionalTeachingRewriteV2(
      fallback,
      policy,
      (signal) => this.requester(runId, {
        privacyNoticeVersion: request.privacyNoticeVersion,
        dataUseAccepted: request.dataUseAccepted,
        fallback,
        policy,
      }, signal),
      { timeoutMs: this.timeoutMs },
    );
    const after = await this.repository.loadAuthorizedRunV2(runId, accessSecret) as GameStateV2;
    if (after.revision !== initial.revision || sha256Canonical(after) !== initialChecksum) {
      throw new TeachingRewriteServiceV2Error("STALE_REVISION");
    }
    return Object.freeze({ rewrite, stateChecksum: initialChecksum });
  }
}
