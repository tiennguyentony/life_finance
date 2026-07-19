import type { AiContentSource } from "../../core/ai-source";
import type { ScenarioDirectorAiEvidenceV2 } from "../../core/monthly-turn-v2";
import {
  rankScenarioCandidatesWithOptionalAiV2,
  type ScenarioDirectorAiRequestV2,
} from "../../core/scenario-director-ai-adapter-v2";
import {
  rankScenarioCandidatesV2,
  type ScenarioDirectorInputV2,
  type ScenarioDirectorRankingOverrideV2,
} from "../../core/scenario-director-v2";
import {
  AI_SCENARIO_DIRECTOR_CONTRACT_VERSION,
  scenarioDirectorRequestSchema,
  type ScenarioDirectorRequest,
} from "./contracts";
import type { AiRoleResponseMap } from "./contracts";
import { AI_PRIVACY_NOTICE_VERSION } from "./privacy-notice";

export type GameplayAiMode = "off" | "shadow" | "active";

export type GameplayDirectorResult = Readonly<{
  evidence: ScenarioDirectorAiEvidenceV2;
  rankingOverride?: ScenarioDirectorRankingOverrideV2;
}>;

export interface GameplayDirector {
  rank(
    runId: string,
    input: ScenarioDirectorInputV2,
  ): Promise<GameplayDirectorResult | null>;
}

type ClientFactory = (runId: string) => Readonly<{
  generate(request: ScenarioDirectorRequest): Promise<AiRoleResponseMap["scenario_director"]>;
  responseSource?(): Exclude<AiContentSource, "deterministic_fallback">;
}>;

export type GameplayDirectorConfig = Readonly<{
  mode: GameplayAiMode;
  timeoutMs: number;
  sampleEveryMonths: number;
  minimumCandidates: number;
  failureThreshold: number;
  cooldownMs: number;
}>;

const DEFAULT_CONFIG: GameplayDirectorConfig = Object.freeze({
  mode: "off",
  timeoutMs: 8_000,
  sampleEveryMonths: 3,
  minimumCandidates: 2,
  failureThreshold: 3,
  cooldownMs: 60_000,
});

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

export function gameplayDirectorConfigFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): GameplayDirectorConfig {
  const configuredMode = environment.AI_GAMEPLAY_MODE ?? "off";
  const mode: GameplayAiMode = ["off", "shadow", "active"].includes(configuredMode)
    ? configuredMode as GameplayAiMode
    : "off";
  return Object.freeze({
    mode,
    timeoutMs: boundedInteger(
      environment.AI_GAMEPLAY_TIMEOUT_MS,
      DEFAULT_CONFIG.timeoutMs,
      250,
      30_000,
    ),
    sampleEveryMonths: boundedInteger(
      environment.AI_GAMEPLAY_SAMPLE_EVERY_MONTHS,
      DEFAULT_CONFIG.sampleEveryMonths,
      1,
      24,
    ),
    minimumCandidates: boundedInteger(
      environment.AI_GAMEPLAY_MINIMUM_CANDIDATES,
      DEFAULT_CONFIG.minimumCandidates,
      1,
      64,
    ),
    failureThreshold: DEFAULT_CONFIG.failureThreshold,
    cooldownMs: DEFAULT_CONFIG.cooldownMs,
  });
}

function monthOrdinal(month: string): number {
  const [year, monthNumber] = month.split("-").map(Number);
  return year * 12 + monthNumber - 1;
}

function clientRequest(director: ScenarioDirectorAiRequestV2) {
  return scenarioDirectorRequestSchema.parse({
    contractVersion: AI_SCENARIO_DIRECTOR_CONTRACT_VERSION,
    privacyNoticeVersion: AI_PRIVACY_NOTICE_VERSION,
    dataUseAccepted: true,
    role: "scenario_director",
    director,
  });
}

export class GameplayDirectorService implements GameplayDirector {
  #consecutiveFailures = 0;
  #circuitOpenUntil = 0;

  constructor(
    private readonly clientFactory: ClientFactory,
    private readonly config: GameplayDirectorConfig,
    private readonly now: () => number = Date.now,
  ) {}

  async rank(
    runId: string,
    input: ScenarioDirectorInputV2,
  ): Promise<GameplayDirectorResult | null> {
    if (
      this.config.mode === "off" ||
      input.candidates.length < this.config.minimumCandidates ||
      monthOrdinal(input.month) % this.config.sampleEveryMonths !== 0 ||
      this.now() < this.#circuitOpenUntil
    ) {
      return null;
    }

    const fallback = rankScenarioCandidatesV2(input);
    let source: AiContentSource = "deterministic_fallback";
    const startedAt = this.now();
    const decision = await rankScenarioCandidatesWithOptionalAiV2(
      input,
      async (safeRequest) => {
        const client = this.clientFactory(runId);
        const response = await client.generate(clientRequest(safeRequest));
        source = client.responseSource?.() ?? "openai";
        return response;
      },
      { timeoutMs: this.config.timeoutMs },
    );
    const latencyMs = Math.min(30_000, Math.max(0, this.now() - startedAt));
    const validated = decision.rankingSource === "validated_ai_ranking";
    if (validated) {
      this.#consecutiveFailures = 0;
    } else {
      this.#consecutiveFailures += 1;
      source = "deterministic_fallback";
      if (this.#consecutiveFailures >= this.config.failureThreshold) {
        this.#circuitOpenUntil = this.now() + this.config.cooldownMs;
        this.#consecutiveFailures = 0;
      }
    }
    const evidence: ScenarioDirectorAiEvidenceV2 = Object.freeze({
      mode: this.config.mode === "active" ? "active" : "shadow",
      source,
      status: validated ? "validated" : "fallback",
      latencyMs,
      candidateCount: input.candidates.length,
      topCandidateAgreement: validated
        ? decision.ranked[0]?.templateId === fallback.ranked[0]?.templateId
        : null,
    });
    if (!validated || this.config.mode !== "active") return { evidence };
    return {
      evidence,
      rankingOverride: Object.freeze({
        version: "scenario-director-ranking-override-v1",
        candidateSetChecksum: decision.candidateSetChecksum,
        rankingInputChecksum: decision.rankingInputChecksum,
        ranked: Object.freeze(
          decision.ranked.map(({ templateId, templateVersion }) =>
            Object.freeze({ templateId, templateVersion }),
          ),
        ),
      }),
    };
  }
}
