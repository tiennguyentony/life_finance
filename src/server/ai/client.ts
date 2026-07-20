import { createHash, randomUUID } from "node:crypto";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";

import type { AiModelSource } from "../../core/ai-source";
import {
  AI_ROLE_MODELS,
  aiRequestSchema,
  aiResponseSchemas,
  type AiRole,
  type AiRoleRequestMap,
  type AiRoleResponseMap,
} from "./contracts";
import { assertNoKnownSensitiveData } from "./privacy";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TRANSPORT_RETRIES = 2;
const MAX_SCHEMA_RETRIES = 1;
const MAX_OUTPUT_CHARACTERS = 32_000;

const ROLE_INSTRUCTIONS: Readonly<Record<AiRole, string>> = Object.freeze({
  hostile_fed:
    "You are the Hostile Fed World Director in a personal-finance life simulation. Select exactly one supplied engine-owned event candidate that fairly targets an evidenced weakness. Balance severity with narrative variety; do not automatically choose the strongest signal, and prefer a plausible life context over repeating the same lesson. The engine has already removed recently used event families. Use only supplied candidate IDs, versions, parameter bounds, and evidence IDs. Never calculate balances, invent financial effects, or issue state mutations. Return only the required structured output.",
  scenario_director:
    "You are the Hostile Fed scenario-ranking personality, with influence over presentation order only. Rank every supplied engine-owned scenario candidate exactly once, balancing relevance, novelty, narrative coherence, and lesson variety. Return only the supplied candidate IDs, versions, intended lessons, and reason codes in your preferred order. Never select or approve an event, invent prose, parameters, amounts, effects, severity, impacts, or state changes. Preserve the supplied candidate-set checksum and return only the required structured output.",
  teacher:
    "You are a precise personal-finance teacher. Explain the supplied engine-computed outcome and identify at most three decisive supplied decisions. The grade is immutable. Every lesson must cite only supplied evidence IDs. Do not recompute money, invent facts, or give regulated professional advice. Return only the required structured output.",
  onboarding:
    "Extract only facts explicitly stated by the learner. Preserve monetary values exactly as source strings and label explicitly stated monthly/annual periods and gross/take-home basis; never calculate, normalize, infer, or convert money. Use only supplied location and career IDs. Use null and missingFields when uncertain, and ask one concise clarification question when needed. Return only the required structured output.",
  explanation:
    "Give a concise, beginner-friendly explanation of the supplied financial concept using only supplied context and evidence. Cite only supplied evidence IDs. Never recompute financial values or invent personalized facts. Return only the required structured output.",
  event_interpreter:
    "You are Sprout, a concise personal-finance decision coach inside a game. The deterministic engine owns every supplied choice, consequence, amount, state change, and recommendation directive; you may explain only those supplied facts and must never invent or apply an action. Read the complete alternating English conversation as one dialogue. Later player messages override earlier ideas when they correct, reject, or replace them. Resolve words such as 'that', 'it', 'the safer one', and 'yes' against the most recent Sprout message and the preceding player goal; never merge contradictory old and new intentions. In interpret mode, map immediately when the player's current intent is semantically equivalent to one supplied choice; do not require exact wording or a fixed number of turns. If the player asks what they should choose, return recommended instead of mapped so advice never becomes an automatic decision. In recommend mode, do not choose or rank options yourself: return exactly recommendationDirective.choiceId as recommendedChoiceId, name that supplied choice in assistantMessage, and use only the selected choice's visible consequence, the directive, and supplied evidence. Never mention a fee, penalty, interest, debt, coverage, income, wellbeing effect, amount, time period, or a change to preparedness, resilience, financial stability, or cash runway unless that exact claim is explicitly supplied. recommendationReason, tradeoff, and citedEvidenceIds are engine-owned: return the directive values exactly and in the supplied order. A recommendation is advisory and choiceId must stay null. For mapped answers, write a natural brief assistantMessage that restates the action you understood in the context of the latest player message; recommendation fields must be null. If intent is genuinely unclear and another turn remains, return ambiguous with one event-specific open follow-up question that helps distinguish the supplied choices. The follow-up may name or paraphrase supplied choice labels, but it must not invent a new action or reveal an unsupplied outcome. On the final turn, return mapped only when confident; otherwise return unsupported or unsafe. Mark illegal or dangerous proposals unsafe. confidencePpm is parts per million: 800000 means 80% confidence. Return only the required structured output.",
  banter_writer:
    "You write one fresh, funny English speech-bubble line for a personal-finance game. Reason from exactly one supplied evidence fact and cite its ID. Treat that fact's label and value as the complete truth: visibly refer to its named metric or exact value, and never infer a cause, purchase, habit, choice, or life event that is not stated. A cash increase is a larger cash pile, not evidence of spending; a cash decrease is not evidence of what was bought. Choose the cast member whose personality best fits: Debtzilla reacts to debt, Inflato to living-cost creep, Impulso to cash decreases, Bengo to investing, Buddi to preparedness or risk, Lucky Cat to taxes, and Sprout to cash or net-worth increases and mixed months. recentLines are forbidden prior copy, not factual evidence; never borrow facts or characters from them. recentEvidenceIds and recentCharacterIds are ordered histories. When another supplied fact supports a joke, avoid the latest evidence topic and prefer a different speaker; do not simply pick the largest dollar amount every month. Roast the financial result or situation, never the player's identity. Keep the message to one sentence, roughly 6–24 words, playful rather than cruel, and suitable for a general audience. The UI already displays the speaker, so never prefix the message with a character name. Write a punchline, not a hashtag, caption, or advice. Never tell the player what they should, must, or need to do, and never use consider, make sure, next time, remember to, try to, watch out, or 'don't let'. Do not calculate new numbers, mention being an AI, or repeat/paraphrase any recent line. Use variationSeed only as a creativity cue. Return only the required structured output.",
});

export type AiTransportRequest = Readonly<{
  model: (typeof AI_ROLE_MODELS)[AiRole];
  input: readonly Readonly<{ role: "developer" | "user"; content: string }>[];
  textFormat: unknown;
  reasoningEffort: "low" | "medium";
  maxOutputTokens?: number;
  sampling?: Readonly<{
    temperature: number;
    seed: number;
  }>;
  store: false;
}>;

export type AiTransportResult = Readonly<{
  responseId: string;
  status: string;
  outputText: string;
  output: unknown;
}>;

export interface AiResponsesTransport {
  auditModel?(requestedModel: AiTransportRequest["model"]): string;
  responseSource?(): AiModelSource;
  create(request: AiTransportRequest): Promise<AiTransportResult>;
}

export type AiAuditAttempt = Readonly<{
  attempt: number;
  kind: "transport_error" | "invalid_output" | "success";
  responseId: string | null;
  output: unknown | null;
  errorCode: string | null;
}>;

export type AiAuditRecord = Readonly<{
  invocationId: string;
  contractVersion: number;
  role: AiRole;
  model: string;
  prompt: Readonly<{
    instructions: string;
    input: unknown;
  }>;
  attempts: readonly AiAuditAttempt[];
  outcome: "success" | "failure";
}>;

export interface AiAuditRecorder {
  record(record: AiAuditRecord): Promise<void>;
}

function auditRecordForPersistence(record: AiAuditRecord): AiAuditRecord {
  if (record.role === "event_interpreter") {
    const input = record.prompt.input as AiRoleRequestMap["event_interpreter"];
    return Object.freeze({
      ...record,
      prompt: Object.freeze({
        instructions: record.prompt.instructions,
        input: Object.freeze({
          contractVersion: input.contractVersion,
          privacyNoticeVersion: input.privacyNoticeVersion,
          dataUseAccepted: input.dataUseAccepted,
          role: input.role,
          event: input.event,
          conversationHash: createHash("sha256")
            .update(JSON.stringify(input.conversation), "utf8")
            .digest("hex"),
          conversationMessageCount: input.conversation.length,
          conversationCharacterCount: input.conversation.reduce(
            (total, message) => total + message.content.length,
            0,
          ),
          interactionMode: input.interactionMode,
          recommendationDirective: input.recommendationDirective,
          evidence: input.evidence,
          playerTurn: input.playerTurn,
          maximumPlayerTurns: input.maximumPlayerTurns,
        }),
      }),
      attempts: Object.freeze(
        record.attempts.map((attempt) => Object.freeze({ ...attempt, output: null })),
      ),
    });
  }
  if (record.role !== "onboarding") return record;
  const input = record.prompt.input as Readonly<{
    contractVersion: number;
    privacyNoticeVersion: number;
    dataUseAccepted: true;
    role: "onboarding";
    sanitizedFreeText: string;
    allowedLocationIds: readonly string[];
    allowedCareerTrackIds: readonly string[];
  }>;
  return Object.freeze({
    ...record,
    prompt: Object.freeze({
      instructions: record.prompt.instructions,
      input: Object.freeze({
        contractVersion: input.contractVersion,
        privacyNoticeVersion: input.privacyNoticeVersion,
        dataUseAccepted: input.dataUseAccepted,
        role: input.role,
        sanitizedFreeTextHash: createHash("sha256")
          .update(input.sanitizedFreeText, "utf8")
          .digest("hex"),
        sanitizedFreeTextLength: input.sanitizedFreeText.length,
        allowedLocationCount: input.allowedLocationIds.length,
        allowedCareerTrackCount: input.allowedCareerTrackIds.length,
      }),
    }),
    attempts: Object.freeze(
      record.attempts.map((attempt) => Object.freeze({ ...attempt, output: null })),
    ),
  });
}

export class AiServiceError extends Error {
  readonly code:
    | "INVALID_REQUEST"
    | "SENSITIVE_INPUT"
    | "AI_UNAVAILABLE"
    | "AUDIT_UNAVAILABLE";
  readonly httpStatus: 400 | 503;
  readonly retryable: boolean;

  constructor(
    code: AiServiceError["code"],
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "AiServiceError";
    this.code = code;
    this.httpStatus = code === "INVALID_REQUEST" || code === "SENSITIVE_INPUT" ? 400 : 503;
    this.retryable = this.httpStatus === 503;
  }
}

function responseSchemaFor<R extends AiRole>(role: R): z.ZodType<AiRoleResponseMap[R]> {
  return aiResponseSchemas[role] as unknown as z.ZodType<AiRoleResponseMap[R]>;
}

function evidenceIds(request: AiRoleRequestMap[AiRole]): Set<string> {
  if (request.role === "hostile_fed") {
    return new Set(request.weaknesses.flatMap((weakness) => weakness.evidence.map(({ id }) => id)));
  }
  if (
    request.role === "teacher" ||
    request.role === "explanation" ||
    request.role === "banter_writer"
  ) {
    return new Set(request.evidence.map(({ id }) => id));
  }
  return new Set();
}

function assertSubset(values: readonly string[], allowed: ReadonlySet<string>, label: string): void {
  if (new Set(values).size !== values.length || values.some((value) => !allowed.has(value))) {
    throw new Error(`${label} must be unique and reference supplied identifiers`);
  }
}

const RECOMMENDATION_CLAIM_FAMILIES = [
  /\bfees?\b/iu,
  /\blate fees?\b/iu,
  /\bpenalt(?:y|ies)\b/iu,
  /\binterest(?: rate| charges?)?\b/iu,
  /\bcredit score\b/iu,
  /\b(?:insurance|coverage)\b/iu,
  /\b(?:debt|loan)\b/iu,
  /\b(?:income|salary|paycheck)\b/iu,
  /\b(?:happiness|wellbeing|well-being|burnout)\b/iu,
  /\b(?:improv(?:e|es|ed|ing)|increase(?:s|d)?|strengthen(?:s|ed|ing)?|boost(?:s|ed|ing)?|raise(?:s|d|ing)?|protect(?:s|ed|ing)?|preserve(?:s|d|ing)?)\b.{0,60}\b(?:financial preparedness|financial stability|financial security|financial resilience|cash runway)\b/iu,
  /\b(?:financial preparedness|financial stability|financial security|financial resilience|cash runway)\b.{0,40}\b(?:better|higher|stronger|improv(?:e|es|ed|ing)|increase(?:s|d)?|strengthen(?:s|ed|ing)?|boost(?:s|ed|ing)?)\b/iu,
] as const;

function normalizedTokens(value: string): ReadonlySet<string> {
  const stopWords = new Set(["a", "an", "and", "for", "of", "over", "the", "to"]);
  return new Set(
    value
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, " ")
      .split(" ")
      .filter((token) => token.length >= 2 && !stopWords.has(token)),
  );
}

function recommendationTokenVariants(value: string): ReadonlySet<string> {
  const variants = new Set([value]);
  if (value.endsWith("ing") && value.length > 5) {
    const base = value.slice(0, -3);
    variants.add(base);
    variants.add(`${base}e`);
  }
  if (value.endsWith("ed") && value.length > 4) {
    const base = value.slice(0, -2);
    variants.add(base);
    variants.add(`${base}e`);
  }
  if (value.endsWith("es") && value.length > 4) variants.add(value.slice(0, -2));
  if (value.endsWith("s") && value.length > 3) variants.add(value.slice(0, -1));
  return variants;
}

function sameRecommendationToken(left: string, right: string): boolean {
  const leftVariants = recommendationTokenVariants(left);
  const rightVariants = recommendationTokenVariants(right);
  return [...leftVariants].some((variant) => rightVariants.has(variant));
}

function choiceMentionScore(choiceLabel: string, assistantMessage: string): number {
  const assistantTokens = normalizedTokens(assistantMessage);
  const choiceTokens = normalizedTokens(choiceLabel);
  if (choiceTokens.size === 0) return 0;
  const matches = [...choiceTokens].filter((choiceToken) =>
    [...assistantTokens].some((assistantToken) =>
      sameRecommendationToken(choiceToken, assistantToken)
    )
  ).length;
  return matches / choiceTokens.size;
}

function canonicalNumber(value: string): string {
  const unit = value.includes("%")
    ? "%"
    : /months?/iu.test(value)
      ? "months"
      : "number";
  const amount = Number(
    value.replace(/[$,%]|months?/giu, "").replace(/[-\s]+$/u, "").trim(),
  );
  return Number.isFinite(amount) ? `${amount}:${unit}` : value.toLowerCase();
}

function assertRecommendationMessageGrounded(
  request: AiRoleRequestMap["event_interpreter"],
  output: AiRoleResponseMap["event_interpreter"],
): void {
  const directive = request.recommendationDirective;
  if (directive === null) throw new Error("recommend mode requires an engine directive");
  const choice = request.event.choices.find(({ id }) => id === directive.choiceId);
  if (choice === undefined) throw new Error("recommendation choice must be supplied");

  const expectedMentionScore = choiceMentionScore(choice.label, output.assistantMessage);
  const strongestOtherMentionScore = Math.max(
    0,
    ...request.event.choices
      .filter(({ id }) => id !== choice.id)
      .map(({ label }) => choiceMentionScore(label, output.assistantMessage)),
  );
  if (
    expectedMentionScore < 0.6 ||
    strongestOtherMentionScore > expectedMentionScore
  ) {
    throw new Error("recommendation message must name the engine-selected choice");
  }

  const effectGroundingText = [
    request.event.headline,
    request.event.situation,
    choice.label,
    choice.consequence,
    directive.rationale,
    directive.tradeoff,
  ].join(" ");
  for (const claim of RECOMMENDATION_CLAIM_FAMILIES) {
    if (claim.test(output.assistantMessage) && !claim.test(effectGroundingText)) {
      throw new Error("recommendation message contains an unsupported financial claim");
    }
  }

  const numericGroundingText = [
    effectGroundingText,
    ...request.evidence.flatMap(({ label, value }) => [label, value]),
  ].join(" ");
  const suppliedNumbers = new Set(
    (numericGroundingText.match(/[$]?\d[\d,.]*(?:%|[-\s]+months?)?/giu) ?? [])
      .map(canonicalNumber),
  );
  const generatedNumbers = output.assistantMessage.match(
    /[$]?\d[\d,.]*(?:%|[-\s]+months?)?/giu,
  ) ?? [];
  if (generatedNumbers.some((value) => !suppliedNumbers.has(canonicalNumber(value)))) {
    throw new Error("recommendation message contains an unsupported number");
  }
}

function validateRoleSemantics<R extends AiRole>(
  request: AiRoleRequestMap[R],
  response: AiRoleResponseMap[R],
): void {
  if (request.role === "hostile_fed") {
    const output = response as AiRoleResponseMap["hostile_fed"];
    const candidate = request.candidates.find(
      ({ templateId, templateVersion }) =>
        templateId === output.templateId && templateVersion === output.templateVersion,
    );
    if (!candidate) throw new Error("selected event must be an engine-owned candidate");
    const weakness = request.weaknesses.find(({ id }) => id === output.targetedWeaknessId);
    if (!weakness || !candidate.targetsWeaknesses.includes(weakness.id)) {
      throw new Error("selected weakness must be supplied and targeted by the candidate");
    }
    const parameterKeys = output.parameters.map(({ id }) => id).sort();
    const definitions = [...candidate.parameters].sort((left, right) => left.id.localeCompare(right.id));
    if (
      parameterKeys.length !== definitions.length ||
      definitions.some(({ id }, index) => parameterKeys[index] !== id)
    ) {
      throw new Error("event parameters must exactly match the selected candidate");
    }
    for (const definition of definitions) {
      const value = output.parameters.find(({ id }) => id === definition.id)?.value;
      if (value === undefined || value < definition.minimum || value > definition.maximum) {
        throw new Error("event parameter is outside engine-owned bounds");
      }
    }
    assertSubset(output.citedEvidenceIds, evidenceIds(request), "Hostile Fed evidence");
    return;
  }

  if (request.role === "scenario_director") {
    const output = response as AiRoleResponseMap["scenario_director"];
    if (output.candidateSetChecksum !== request.director.candidateSetChecksum) {
      throw new Error("scenario ranking must preserve the candidate-set checksum");
    }
    const expectedByIdentity = new Map(
      request.director.candidates.map((candidate) => [
        `${candidate.templateId}@${candidate.templateVersion}`,
        candidate,
      ]),
    );
    if (output.ranked.length !== expectedByIdentity.size) {
      throw new Error("scenario ranking must contain every candidate exactly once");
    }
    const seen = new Set<string>();
    for (const candidate of output.ranked) {
      const identity = `${candidate.templateId}@${candidate.templateVersion}`;
      const expected = expectedByIdentity.get(identity);
      if (seen.has(identity) || !expected) {
        throw new Error("scenario ranking must be an exact candidate permutation");
      }
      seen.add(identity);
      if (
        candidate.intendedLesson !== expected.intendedLesson ||
        candidate.reasonCodes.length !== expected.reasonCodes.length ||
        candidate.reasonCodes.some(
          (reasonCode, index) => reasonCode !== expected.reasonCodes[index],
        )
      ) {
        throw new Error("scenario ranking cannot alter engine-owned explanations");
      }
    }
    return;
  }

  if (request.role === "teacher") {
    const output = response as AiRoleResponseMap["teacher"];
    if (output.grade !== request.outcome.grade) throw new Error("teacher cannot change grade");
    const decisions = new Set(request.decisions.map(({ id }) => id));
    const citedDecisions = output.decisiveMoments.map(({ decisionId }) => decisionId);
    assertSubset(citedDecisions, decisions, "teacher decisions");
    for (const moment of output.decisiveMoments) {
      assertSubset(moment.citedEvidenceIds, evidenceIds(request), "teacher evidence");
    }
    return;
  }

  if (request.role === "onboarding") {
    const output = response as AiRoleResponseMap["onboarding"];
    if (output.locationId !== null && !request.allowedLocationIds.includes(output.locationId)) {
      throw new Error("onboarding location must use an allowed identifier");
    }
    if (
      output.careerTrackId !== null &&
      !request.allowedCareerTrackIds.includes(output.careerTrackId)
    ) {
      throw new Error("onboarding career must use an allowed identifier");
    }
    if (output.birthMonth !== null && !/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(output.birthMonth)) {
      throw new Error("onboarding birth month must be canonical when supplied");
    }
    const amountFields = output.statedAmounts.map(({ field }) => field);
    if (new Set(amountFields).size !== amountFields.length) {
      throw new Error("onboarding monetary fields must be unique");
    }
    if (
      output.statedAmounts.some(({ sourceExcerpt }) =>
        !request.sanitizedFreeText.includes(sourceExcerpt),
      )
    ) {
      throw new Error("onboarding source excerpts must occur verbatim in sanitized input");
    }
    if (new Set(output.missingFields).size !== output.missingFields.length) {
      throw new Error("onboarding missing fields must be unique");
    }
    return;
  }

  if (request.role === "event_interpreter") {
    const output = response as AiRoleResponseMap["event_interpreter"];
    const choiceIds = new Set(request.event.choices.map(({ id }) => id));
    const suppliedEvidenceIds = new Set(request.evidence.map(({ id }) => id));
    assertSubset(output.citedEvidenceIds, suppliedEvidenceIds, "event interpreter evidence");
    if (output.status === "mapped") {
      if (output.choiceId === null || !choiceIds.has(output.choiceId)) {
        throw new Error("event interpreter must map to a supplied choice");
      }
      if (output.reasonCode !== "choice_match") {
        throw new Error("mapped event interpretation requires choice_match");
      }
      if (output.followUpQuestion !== null) {
        throw new Error("mapped event interpretation cannot ask a follow-up");
      }
      if (
        output.recommendedChoiceId !== null ||
        output.recommendationReason !== null ||
        output.tradeoff !== null
      ) {
        throw new Error("mapped event interpretation cannot also recommend a choice");
      }
    } else if (output.choiceId !== null) {
      throw new Error("unmapped event interpretation cannot select a choice");
    }
    if (output.status === "recommended") {
      const directive = request.recommendationDirective;
      if (
        directive === null ||
        output.recommendedChoiceId === null ||
        !choiceIds.has(output.recommendedChoiceId) ||
        output.recommendedChoiceId !== directive.choiceId ||
        output.reasonCode !== "personalized_recommendation" ||
        output.recommendationReason !== directive.rationale ||
        output.tradeoff !== directive.tradeoff ||
        output.citedEvidenceIds.length !== directive.requiredEvidenceIds.length ||
        directive.requiredEvidenceIds.some(
          (id, index) => output.citedEvidenceIds[index] !== id,
        )
      ) {
        throw new Error("event recommendation must preserve the engine-owned directive");
      }
      assertRecommendationMessageGrounded(request, output);
    } else if (
      output.recommendedChoiceId !== null ||
      output.recommendationReason !== null ||
      output.tradeoff !== null
    ) {
      throw new Error("only a recommendation may contain recommendation details");
    }
    if (request.interactionMode === "recommend" && output.status !== "recommended") {
      throw new Error("recommend mode requires a grounded recommendation");
    }
    if (
      output.status === "ambiguous" &&
      (output.followUpQuestion === null || request.playerTurn >= request.maximumPlayerTurns)
    ) {
      throw new Error("ambiguous event interpretation requires an available follow-up turn");
    }
    if (output.status !== "ambiguous" && output.followUpQuestion !== null) {
      throw new Error("only ambiguous event interpretation may ask a follow-up");
    }
    return;
  }

  if (request.role === "banter_writer") {
    const output = response as AiRoleResponseMap["banter_writer"];
    if (!evidenceIds(request).has(output.citedEvidenceId)) {
      throw new Error("banter must cite one supplied evidence fact");
    }
    if (/[\r\n]/u.test(output.message)) {
      throw new Error("banter must be a single line");
    }
    if (/#/u.test(output.message)) {
      throw new Error("banter must not include hashtags");
    }
    if (/\b(?:(?:you|the player)\s+(?:should|must|need to)|consider|make sure|next time|remember to|try to|watch out|do not|don['’]t let)\b/iu.test(output.message)) {
      throw new Error("banter must be a punchline rather than advice");
    }
    return;
  }

  const output = response as AiRoleResponseMap["explanation"];
  assertSubset(output.citedEvidenceIds, evidenceIds(request), "explanation evidence");
}

function normalizeRoleResponse<R extends AiRole>(
  request: AiRoleRequestMap[R],
  response: AiRoleResponseMap[R],
): AiRoleResponseMap[R] {
  if (request.role === "banter_writer") {
    const output = response as AiRoleResponseMap["banter_writer"];
    const banterRequest = request as AiRoleRequestMap["banter_writer"];
    const cited = banterRequest.evidence.find(
      ({ id }) => id === output.citedEvidenceId,
    );
    const groundedCharacter = (() => {
      switch (output.citedEvidenceId) {
        case "debt_change":
        case "debt_interest":
          return "debtzilla";
        case "annual_living_cost_change":
          return "inflato";
        case "taxable_investment_change":
          return "bengo";
        case "risk_change":
        case "preparedness_change":
          return "buddi";
        case "monthly_tax":
          return "lucky_cat";
        case "cash_change":
          return cited?.label.toLowerCase().includes("decreased")
            ? "impulso"
            : "sprout";
        case "net_worth_change":
          return "sprout";
        default:
          return output.characterId;
      }
    })();
    return Object.freeze({
      ...output,
      characterId: groundedCharacter,
      message: output.message.replace(
        /^(?:sprout|debtzilla|inflato|impulso|bengo|buddi|lucky cat)\s*[:,—-]\s*/iu,
        "",
      ),
    }) as AiRoleResponseMap[R];
  }
  if (request.role !== "event_interpreter") return response;
  const output = response as AiRoleResponseMap["event_interpreter"];
  if (request.interactionMode === "recommend" && request.recommendationDirective !== null) {
    return Object.freeze({
      ...output,
      status: "recommended",
      choiceId: null,
      recommendedChoiceId: output.recommendedChoiceId ?? output.choiceId,
      reasonCode: "personalized_recommendation",
      followUpQuestion: null,
      recommendationReason: request.recommendationDirective.rationale,
      tradeoff: request.recommendationDirective.tradeoff,
      citedEvidenceIds: [...request.recommendationDirective.requiredEvidenceIds],
    }) as AiRoleResponseMap[R];
  }
  const mappedChoiceId = output.choiceId ?? output.recommendedChoiceId;
  if (
    output.status === "mapped" &&
    mappedChoiceId !== null
  ) {
    return Object.freeze({
      ...output,
      choiceId: mappedChoiceId,
      recommendedChoiceId: null,
      reasonCode: "choice_match",
      followUpQuestion: null,
      recommendationReason: null,
      tradeoff: null,
      citedEvidenceIds: [],
    }) as unknown as AiRoleResponseMap[R];
  }
  if (output.status === "ambiguous" || output.followUpQuestion === null) {
    return response;
  }
  return Object.freeze({
    ...output,
    followUpQuestion: null,
  }) as AiRoleResponseMap[R];
}

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

function isRetryableTransportError(error: unknown): boolean {
  if (error instanceof OpenAI.APIConnectionError || error instanceof OpenAI.APIConnectionTimeoutError) {
    return true;
  }
  const status = errorStatus(error);
  return status === 408 || status === 409 || status === 429 || (status !== undefined && status >= 500);
}

function safeTransportErrorCode(error: unknown): string {
  const status = errorStatus(error);
  if (status !== undefined) return `http_${status}`;
  if (error instanceof OpenAI.APIConnectionTimeoutError) return "connection_timeout";
  if (error instanceof OpenAI.APIConnectionError) return "connection_error";
  return "transport_error";
}

async function defaultDelay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class OpenAiResponsesTransport implements AiResponsesTransport {
  private readonly client: OpenAI;

  constructor(options?: { apiKey?: string; timeoutMs?: number }) {
    const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey.trim().length < 20) {
      throw new Error("OPENAI_API_KEY must be configured server-side");
    }
    this.client = new OpenAI({
      apiKey,
      maxRetries: 0,
      timeout: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
  }

  responseSource(): AiModelSource {
    return "openai";
  }

  async create(request: AiTransportRequest): Promise<AiTransportResult> {
    const response = await this.client.responses.create({
      model: request.model,
      input: [...request.input],
      text: { format: request.textFormat as ReturnType<typeof zodTextFormat> },
      reasoning: { effort: request.reasoningEffort },
      ...(request.maxOutputTokens === undefined
        ? {}
        : { max_output_tokens: request.maxOutputTokens }),
      store: request.store,
    });
    return {
      responseId: response.id,
      status: response.status ?? "unknown",
      outputText: response.output_text,
      output: response.output,
    };
  }
}

export class AiRoleClient {
  constructor(
    private readonly transport: AiResponsesTransport,
    private readonly auditRecorder: AiAuditRecorder,
    private readonly options: Readonly<{
      delay?: (milliseconds: number) => Promise<void>;
      invocationId?: () => string;
      maxTransportRetries?: number;
      maxSchemaRetries?: number;
    }> = {},
  ) {}

  responseSource(): AiModelSource {
    return this.transport.responseSource?.() ?? "openai";
  }

  async generate<R extends AiRole>(
    request: AiRoleRequestMap[R],
  ): Promise<AiRoleResponseMap[R]> {
    const parsedRequest = aiRequestSchema.safeParse(request);
    if (!parsedRequest.success) {
      throw new AiServiceError("INVALID_REQUEST", "AI request is invalid");
    }
    try {
      assertNoKnownSensitiveData(parsedRequest.data);
    } catch (error) {
      throw new AiServiceError("SENSITIVE_INPUT", "AI request contains sensitive data", {
        cause: error,
      });
    }

    const role = parsedRequest.data.role as R;
    const requestedModel = AI_ROLE_MODELS[role];
    const auditModel =
      this.transport.auditModel?.(requestedModel) ?? requestedModel;
    const schema = responseSchemaFor(role);
    const promptBody = JSON.stringify(parsedRequest.data);
    const invocationId = this.options.invocationId?.() ?? randomUUID();
    const attempts: AiAuditAttempt[] = [];
    let transportRetries = 0;
    let schemaRetries = 0;
    let finalValue: AiRoleResponseMap[R] | undefined;

    while (finalValue === undefined) {
      const attemptNumber = attempts.length + 1;
      let transportResult: AiTransportResult;
      try {
        transportResult = await this.transport.create({
          model: requestedModel,
          input: [
            { role: "developer", content: ROLE_INSTRUCTIONS[role] },
            { role: "user", content: promptBody },
          ],
          textFormat: zodTextFormat(schema, `life_finance_${role}_v1`),
          reasoningEffort:
            role === "hostile_fed" ||
            role === "scenario_director" ||
            role === "teacher"
              ? "medium"
              : "low",
          ...(role === "event_interpreter"
            ? { maxOutputTokens: 384 }
            : role === "banter_writer"
              ? {
                  // gpt-oss may spend part of this budget on its hidden
                  // low-effort reasoning before emitting the short JSON.
                  maxOutputTokens: 256,
                  sampling: {
                    temperature: 0.9,
                    // A semantic repair must not deterministically replay the
                    // same invalid local-model answer.
                    seed: ((parsedRequest.data as AiRoleRequestMap["banter_writer"])
                      .variationSeed + attemptNumber - 1) % 2_147_483_648,
                  },
                }
              : {}),
          store: false,
        });
      } catch (error) {
        attempts.push({
          attempt: attemptNumber,
          kind: "transport_error",
          responseId: null,
          output: null,
          errorCode: safeTransportErrorCode(error),
        });
        if (
          isRetryableTransportError(error) &&
          transportRetries < (this.options.maxTransportRetries ?? MAX_TRANSPORT_RETRIES)
        ) {
          transportRetries += 1;
          await (this.options.delay ?? defaultDelay)(200 * 2 ** (transportRetries - 1));
          continue;
        }
        break;
      }

      try {
        if (transportResult.status !== "completed") {
          throw new Error("response did not complete");
        }
        if (transportResult.outputText.length > MAX_OUTPUT_CHARACTERS) {
          throw new Error("response exceeds output limit");
        }
        const decoded: unknown = JSON.parse(transportResult.outputText);
        const parsedValue = schema.parse(decoded);
        const value = schema.parse(normalizeRoleResponse(request, parsedValue));
        validateRoleSemantics(request, value);
        attempts.push({
          attempt: attemptNumber,
          kind: "success",
          responseId: transportResult.responseId,
          output: transportResult.output,
          errorCode: null,
        });
        finalValue = value;
      } catch {
        attempts.push({
          attempt: attemptNumber,
          kind: "invalid_output",
          responseId: transportResult.responseId,
          output: transportResult.output,
          errorCode: "invalid_structured_output",
        });
        if (schemaRetries < (this.options.maxSchemaRetries ?? MAX_SCHEMA_RETRIES)) {
          schemaRetries += 1;
          continue;
        }
        break;
      }
    }

    try {
      await this.auditRecorder.record(auditRecordForPersistence({
        invocationId,
        contractVersion: parsedRequest.data.contractVersion,
        role,
        model: auditModel,
        prompt: {
          instructions: ROLE_INSTRUCTIONS[role],
          input: parsedRequest.data,
        },
        attempts: Object.freeze([...attempts]),
        outcome: finalValue === undefined ? "failure" : "success",
      }));
    } catch (error) {
      throw new AiServiceError(
        "AUDIT_UNAVAILABLE",
        "AI audit storage is temporarily unavailable",
        { cause: error },
      );
    }

    if (finalValue === undefined) {
      throw new AiServiceError("AI_UNAVAILABLE", "AI service is temporarily unavailable");
    }
    return finalValue;
  }
}
