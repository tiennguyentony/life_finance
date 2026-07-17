import type { RiskMetricId } from "./risk-policy-v1";
import {
  rankScenarioCandidatesV2,
  validateScenarioDirectorPermutationV2,
  type ScenarioDirectorDecisionV2,
  type ScenarioDirectorInputV2,
  type ScenarioDirectorRankedCandidateV2,
} from "./scenario-director-v2";

export const SCENARIO_DIRECTOR_AI_REQUEST_V1 =
  "scenario-director-ai-request-v1" as const;
export const SCENARIO_DIRECTOR_AI_RESPONSE_V1 =
  "scenario-director-ai-response-v1" as const;

type SeverityBandV2 = "none" | "low" | "medium" | "high" | "critical";
type ExposureBandV2 = "unseen" | "single" | "repeated";

export type ScenarioDirectorAiRequestV2 = Readonly<{
  version: typeof SCENARIO_DIRECTOR_AI_REQUEST_V1;
  candidateSetChecksum: string;
  difficulty: ScenarioDirectorInputV2["difficulty"];
  macro: ScenarioDirectorInputV2["macro"];
  riskFacts: readonly Readonly<{
    metricId: RiskMetricId;
    severityBand: SeverityBandV2;
  }>[];
  candidates: readonly Readonly<{
    templateId: string;
    templateVersion: number;
    category: ScenarioDirectorInputV2["candidates"][number]["category"];
    tier: ScenarioDirectorInputV2["candidates"][number]["tier"];
    targetedWeakness: ScenarioDirectorInputV2["candidates"][number]["targetedWeakness"];
    lessonTags: ScenarioDirectorInputV2["candidates"][number]["lessonTags"];
    directorTags: readonly string[];
    narrativeSetupId?: ScenarioDirectorInputV2["candidates"][number]["narrativeSetupId"];
    intendedLesson: string;
    reasonCodes: ScenarioDirectorRankedCandidateV2["reasonCodes"];
  }>[];
  recentDecisions: readonly Readonly<{
    reasonCode: string;
    semanticTags: readonly string[];
  }>[];
  recentEvents: readonly Readonly<{
    templateId: string;
    templateVersion: number;
    category: ScenarioDirectorInputV2["recentEvents"][number]["category"];
    tier: ScenarioDirectorInputV2["recentEvents"][number]["tier"];
    targetedWeakness: ScenarioDirectorInputV2["recentEvents"][number]["targetedWeakness"];
    lessonTags: readonly string[];
  }>[];
  lessonHistory: readonly Readonly<{
    lessonTag: string;
    exposureBand: ExposureBandV2;
  }>[];
  storyArc?: ScenarioDirectorInputV2["storyArc"];
}>;

export type ScenarioDirectorAiProviderV2 = (
  request: ScenarioDirectorAiRequestV2,
) => unknown | Promise<unknown>;

export type ScenarioDirectorAiAdapterOptionsV2 = Readonly<{
  timeoutMs?: number;
}>;

export type ScenarioDirectorValidatedAiDecisionV2 = Readonly<
  Omit<ScenarioDirectorDecisionV2, "rankingSource"> & {
    rankingSource: "validated_ai_ranking";
  }
>;

export type ScenarioDirectorAiAdapterDecisionV2 =
  | ScenarioDirectorDecisionV2
  | ScenarioDirectorValidatedAiDecisionV2;

type ResponseCandidateV2 = Readonly<{
  templateId: string;
  templateVersion: number;
  intendedLesson: string;
  reasonCodes: readonly string[];
}>;

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function severityBand(severityPpm: number): SeverityBandV2 {
  if (severityPpm === 0) return "none";
  if (severityPpm <= 250_000) return "low";
  if (severityPpm <= 500_000) return "medium";
  if (severityPpm <= 750_000) return "high";
  return "critical";
}

function exposureBand(count: number): ExposureBandV2 {
  return count === 0 ? "unseen" : count === 1 ? "single" : "repeated";
}

function buildRequest(
  input: ScenarioDirectorInputV2,
  fallback: ScenarioDirectorDecisionV2,
): ScenarioDirectorAiRequestV2 {
  const fallbackByIdentity = new Map(
    fallback.ranked.map((candidate) => [
      `${candidate.templateId}@${candidate.templateVersion}`,
      candidate,
    ]),
  );
  return deepFreeze({
    version: SCENARIO_DIRECTOR_AI_REQUEST_V1,
    candidateSetChecksum: fallback.candidateSetChecksum,
    difficulty: input.difficulty,
    macro: { regime: input.macro.regime, tags: [...input.macro.tags] },
    riskFacts: Object.values(input.riskSnapshot.metrics).map((metric) => ({
      metricId: metric.id,
      severityBand: severityBand(metric.severityPpm),
    })),
    candidates: input.candidates.map((candidate) => {
      const ranked = fallbackByIdentity.get(
        `${candidate.templateId}@${candidate.templateVersion}`,
      );
      if (!ranked) throw new Error("deterministic fallback lost a candidate");
      return {
        templateId: candidate.templateId,
        templateVersion: candidate.templateVersion,
        category: candidate.category,
        tier: candidate.tier,
        targetedWeakness: candidate.targetedWeakness,
        lessonTags: {
          primary: candidate.lessonTags.primary,
          secondary: [...candidate.lessonTags.secondary],
        },
        directorTags: [...candidate.directorTags],
        ...(candidate.narrativeSetupId === undefined
          ? {}
          : { narrativeSetupId: candidate.narrativeSetupId }),
        intendedLesson: ranked.intendedLesson,
        reasonCodes: [...ranked.reasonCodes],
      };
    }),
    recentDecisions: input.recentDecisions.map(({ reasonCode, semanticTags }) => ({
      reasonCode,
      semanticTags: [...semanticTags],
    })),
    recentEvents: input.recentEvents.map(
      ({ templateId, templateVersion, category, tier, targetedWeakness, lessonTags }) => ({
        templateId,
        templateVersion,
        category,
        tier,
        targetedWeakness,
        lessonTags: [...lessonTags],
      }),
    ),
    lessonHistory: input.lessonExposureCounts.map(({ lessonTag, count }) => ({
      lessonTag,
      exposureBand: exposureBand(count),
    })),
    ...(input.storyArc === undefined
      ? {}
      : {
          storyArc: {
            arcId: input.storyArc.arcId,
            tags: [...input.storyArc.tags],
          },
        }),
  });
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function parseResponse(
  value: unknown,
  fallback: ScenarioDirectorDecisionV2,
): readonly ResponseCandidateV2[] | null {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !hasExactKeys(value, ["version", "candidateSetChecksum", "ranked"])
  ) {
    return null;
  }
  const response = value as Record<string, unknown>;
  if (
    response.version !== SCENARIO_DIRECTOR_AI_RESPONSE_V1 ||
    response.candidateSetChecksum !== fallback.candidateSetChecksum ||
    !Array.isArray(response.ranked)
  ) {
    return null;
  }
  const ranked: ResponseCandidateV2[] = [];
  for (const value of response.ranked) {
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      !hasExactKeys(value, [
        "templateId",
        "templateVersion",
        "intendedLesson",
        "reasonCodes",
      ])
    ) {
      return null;
    }
    const candidate = value as Record<string, unknown>;
    if (
      typeof candidate.templateId !== "string" ||
      !Number.isSafeInteger(candidate.templateVersion) ||
      typeof candidate.intendedLesson !== "string" ||
      !Array.isArray(candidate.reasonCodes) ||
      !candidate.reasonCodes.every((reason) => typeof reason === "string")
    ) {
      return null;
    }
    ranked.push(candidate as ResponseCandidateV2);
  }

  const permutationViolations = validateScenarioDirectorPermutationV2(
    fallback.ranked,
    ranked,
  );
  if (permutationViolations.length > 0) return null;

  const fallbackByIdentity = new Map(
    fallback.ranked.map((candidate) => [
      `${candidate.templateId}@${candidate.templateVersion}`,
      candidate,
    ]),
  );
  for (const candidate of ranked) {
    const expected = fallbackByIdentity.get(
      `${candidate.templateId}@${candidate.templateVersion}`,
    );
    if (
      !expected ||
      candidate.intendedLesson !== expected.intendedLesson ||
      candidate.reasonCodes.length !== expected.reasonCodes.length ||
      candidate.reasonCodes.some(
        (reason, index) => reason !== expected.reasonCodes[index],
      )
    ) {
      return null;
    }
  }
  return ranked;
}

export async function rankScenarioCandidatesWithOptionalAiV2(
  input: ScenarioDirectorInputV2,
  provider?: ScenarioDirectorAiProviderV2,
  options: ScenarioDirectorAiAdapterOptionsV2 = {},
): Promise<ScenarioDirectorAiAdapterDecisionV2> {
  const fallback = rankScenarioCandidatesV2(input);
  if (!provider) return fallback;

  const request = buildRequest(input, fallback);
  const timeoutMs = options.timeoutMs ?? 2_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    return fallback;
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let response: unknown;
  try {
    const outcome = await Promise.race([
      Promise.resolve()
        .then(() => provider(request))
        .then((value) => ({ status: "response" as const, value })),
      new Promise<Readonly<{ status: "timeout" }>>((resolve) => {
        timeout = setTimeout(() => resolve({ status: "timeout" }), timeoutMs);
      }),
    ]);
    if (outcome.status === "timeout") return fallback;
    response = outcome.value;
  } catch {
    return fallback;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
  const ranked = parseResponse(response, fallback);
  if (!ranked) return fallback;

  const fallbackByIdentity = new Map(
    fallback.ranked.map((candidate) => [
      `${candidate.templateId}@${candidate.templateVersion}`,
      candidate,
    ]),
  );
  return deepFreeze({
    ...fallback,
    rankingSource: "validated_ai_ranking",
    ranked: ranked.map((candidate, index) => ({
      ...fallbackByIdentity.get(
        `${candidate.templateId}@${candidate.templateVersion}`,
      )!,
      rank: index + 1,
    })),
  });
}
