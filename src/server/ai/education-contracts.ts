import { z } from "zod";

import { AI_PRIVACY_NOTICE_VERSION } from "./privacy-notice";

export const aiExplanationApiRequestSchema = z.object({
  conceptId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/),
  expectedRevision: z.number().int().nonnegative(),
  privacyNoticeVersion: z.literal(AI_PRIVACY_NOTICE_VERSION),
  dataUseAccepted: z.literal(true),
}).strict();

export const aiExplanationApiResponseSchema = z.object({
  source: z.enum(["openai", "local_oss", "deterministic_fallback"]),
  explanation: z.object({
    title: z.string().min(1).max(240),
    explanation: z.string().min(1).max(2_000),
    whyItMattersNow: z.string().min(1).max(800),
    actionTips: z.array(z.string().min(1).max(240)).min(1).max(3),
    citedEvidenceIds: z.array(z.string()).max(8),
  }).strict(),
  memoryRecorded: z.boolean(),
  state: z.unknown(),
  stateChecksum: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

export type AiExplanationApiRequest = z.infer<typeof aiExplanationApiRequestSchema>;
export type AiExplanationApiResponse = z.infer<typeof aiExplanationApiResponseSchema>;
