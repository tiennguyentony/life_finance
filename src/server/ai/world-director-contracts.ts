import { z } from "zod";

import { AI_CONTENT_SOURCES } from "../../core/ai-source";
import { RISK_ANALYZER_V1_VERSION } from "../../core/risk-v1";
import {
  SCENARIO_DIRECTOR_POLICY_V1_VERSION,
  SCENARIO_DIRECTOR_REASON_CODES_V2,
  SCENARIO_DIRECTOR_V2_VERSION,
} from "../../core/scenario-director-policy-v2";
import { AI_PRIVACY_NOTICE_VERSION } from "./privacy-notice";

export const aiWorldEventApiRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  privacyNoticeVersion: z.literal(AI_PRIVACY_NOTICE_VERSION),
  dataUseAccepted: z.literal(true),
}).strict();

export const aiWorldEventApiResponseSchema = z.object({
  source: z.enum(AI_CONTENT_SOURCES),
  eventId: z.null(),
  outcome: z.object({
    status: z.literal("no_approved_event"),
    reason: z.literal("rank_preview_only"),
  }).strict(),
  ranking: z.object({
    version: z.literal(SCENARIO_DIRECTOR_V2_VERSION),
    policyVersion: z.literal(SCENARIO_DIRECTOR_POLICY_V1_VERSION),
    riskVersion: z.literal(RISK_ANALYZER_V1_VERSION),
    riskAsOfMonth: z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/),
    difficulty: z.enum(["guided", "normal", "hard"]),
    macroRegime: z.enum(["expansion", "inflation", "recession", "recovery"]),
    rankingSource: z.enum(["deterministic_fallback", "validated_ai_ranking"]),
    candidateSetChecksum: z.string().regex(/^[0-9a-f]{64}$/),
    rankingInputChecksum: z.string().regex(/^[0-9a-f]{64}$/),
    ranked: z.array(z.object({
      rank: z.number().int().positive(),
      templateId: z.string().min(1).max(128),
      templateVersion: z.number().int().positive(),
      intendedLesson: z.string().min(1).max(128),
      reasonCodes: z.array(z.enum(SCENARIO_DIRECTOR_REASON_CODES_V2)),
    }).strict()).max(64),
  }).strict(),
  state: z.unknown(),
  stateChecksum: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

export type AiWorldEventApiRequest = z.infer<typeof aiWorldEventApiRequestSchema>;
export type AiWorldEventApiResponse = z.infer<typeof aiWorldEventApiResponseSchema>;
