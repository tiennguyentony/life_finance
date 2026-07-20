import type { RunView } from "../../application/game/run-view";
import type {
  CharacterBanterRequest,
  CharacterBanterResponse,
} from "../../contracts/api/contracts";
import type { AiModelSource } from "../../core/ai-source";
import { AI_PRIVACY_NOTICE_VERSION } from "./privacy-notice";
import {
  AI_CONTRACT_VERSION,
  type BanterWriterRequest,
  type BanterWriterResponse,
} from "./contracts";

const MAX_LATENCY_MS = 30_000;

export type CharacterBanterAiClient = Readonly<{
  generate(request: BanterWriterRequest): Promise<BanterWriterResponse>;
  responseSource(): AiModelSource;
}>;

export type CharacterBanterClientFactory = (
  runId: string,
) => CharacterBanterAiClient | null;

export class CharacterBanterError extends Error {
  readonly code: "STALE_REVISION" | "MONTH_MISMATCH";

  constructor(code: CharacterBanterError["code"], message: string) {
    super(message);
    this.name = "CharacterBanterError";
    this.code = code;
  }
}

function unavailable(): CharacterBanterResponse {
  return Object.freeze({
    version: "character-banter-v1",
    status: "unavailable",
  });
}

function normalizedTokens(value: string): ReadonlySet<string> {
  return new Set(value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim()
    .split(" ")
    .filter((token) => token.length >= 3));
}

function normalizedWords(value: string): readonly string[] {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function trigrams(value: string): ReadonlySet<string> {
  const words = normalizedWords(value);
  const phrases = new Set<string>();
  for (let index = 0; index + 2 < words.length; index += 1) {
    phrases.add(words.slice(index, index + 3).join(" "));
  }
  return phrases;
}

function sharesPhrase(left: string, right: string): boolean {
  const leftPhrases = trigrams(left);
  for (const phrase of trigrams(right)) {
    if (leftPhrases.has(phrase)) return true;
  }
  return false;
}

function similarity(left: string, right: string): number {
  const leftTokens = normalizedTokens(left);
  const rightTokens = normalizedTokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  return intersection / (leftTokens.size + rightTokens.size - intersection);
}

export function repeatsRecentBanter(
  message: string,
  recentLines: readonly string[],
): boolean {
  const normalized = message.trim().toLowerCase();
  return recentLines.some((line) => {
    const recent = line.trim().toLowerCase();
    return (
      normalized === recent ||
      sharesPhrase(normalized, recent) ||
      similarity(normalized, recent) >= 0.62
    );
  });
}

/**
 * Generates cosmetic copy only. The service never owns or mutates financial
 * state; it merely verifies the supplied month still matches the current run
 * before grounding a single model call in bounded authoritative evidence.
 */
export class CharacterBanterService {
  constructor(private readonly clientForRun: CharacterBanterClientFactory) {}

  async generate(
    run: RunView,
    input: CharacterBanterRequest,
  ): Promise<CharacterBanterResponse> {
    if (run.revision !== input.expectedRevision) {
      throw new CharacterBanterError(
        "STALE_REVISION",
        "the game changed before the character message was generated",
      );
    }
    if (run.currentMonth !== input.simulationMonth) {
      throw new CharacterBanterError(
        "MONTH_MISMATCH",
        "the character message belongs to a different simulation month",
      );
    }
    if (run.status !== "active" || run.pendingInteraction.kind === "event") {
      return unavailable();
    }

    let client: CharacterBanterAiClient | null;
    try {
      client = this.clientForRun(run.runId);
    } catch {
      return unavailable();
    }
    if (client === null) return unavailable();

    const startedAt = Date.now();
    try {
      const recentlyUsedEvidence = new Set(
        (input.recentEvidenceIds ?? []).slice(-2),
      );
      const freshEvidence = input.evidence.filter(
        ({ id }) => !recentlyUsedEvidence.has(id),
      );
      const generated = await client.generate({
        contractVersion: AI_CONTRACT_VERSION,
        privacyNoticeVersion: AI_PRIVACY_NOTICE_VERSION,
        dataUseAccepted: true,
        role: "banter_writer",
        simulationMonth: input.simulationMonth,
        planLabel: input.planLabel,
        variationSeed: input.variationSeed,
        // Remove the latest topics when another real month fact is available.
        // This prevents a large recurring tax line from winning every month.
        evidence: freshEvidence.length > 0 ? freshEvidence : input.evidence,
        recentLines: input.recentLines,
        recentEvidenceIds: input.recentEvidenceIds ?? [],
        recentCharacterIds: input.recentCharacterIds ?? [],
      });
      if (repeatsRecentBanter(generated.message, input.recentLines)) {
        return unavailable();
      }
      return Object.freeze({
        version: "character-banter-v1",
        status: "generated",
        source: client.responseSource(),
        characterId: generated.characterId,
        tone: generated.tone,
        message: generated.message,
        citedEvidenceId: generated.citedEvidenceId,
        latencyMs: Math.min(
          MAX_LATENCY_MS,
          Math.max(0, Date.now() - startedAt),
        ),
      });
    } catch {
      return unavailable();
    }
  }
}
