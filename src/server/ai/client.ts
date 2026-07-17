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
});

export type AiTransportRequest = Readonly<{
  model: (typeof AI_ROLE_MODELS)[AiRole];
  input: readonly Readonly<{ role: "developer" | "user"; content: string }>[];
  textFormat: unknown;
  reasoningEffort: "low" | "medium";
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
  if (request.role === "teacher" || request.role === "explanation") {
    return new Set(request.evidence.map(({ id }) => id));
  }
  return new Set();
}

function assertSubset(values: readonly string[], allowed: ReadonlySet<string>, label: string): void {
  if (new Set(values).size !== values.length || values.some((value) => !allowed.has(value))) {
    throw new Error(`${label} must be unique and reference supplied identifiers`);
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

  const output = response as AiRoleResponseMap["explanation"];
  assertSubset(output.citedEvidenceIds, evidenceIds(request), "explanation evidence");
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
        if (isRetryableTransportError(error) && transportRetries < MAX_TRANSPORT_RETRIES) {
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
        const value = schema.parse(decoded);
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
        if (schemaRetries < MAX_SCHEMA_RETRIES) {
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
