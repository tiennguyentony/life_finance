import { z } from "zod";

import { AI_PRIVACY_NOTICE_VERSION } from "./privacy-notice";

export const aiDebriefApiRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  privacyNoticeVersion: z.literal(AI_PRIVACY_NOTICE_VERSION),
  dataUseAccepted: z.literal(true),
}).strict();

export const aiDebriefApiResponseSchema = z.object({
  source: z.enum(["openai", "local_oss", "deterministic_fallback"]),
  debrief: z.object({
    grade: z.enum(["S", "A", "B", "C", "D", "E", "F"]),
    title: z.string(),
    summary: z.string(),
    decisiveMoments: z.array(z.object({
      decisionId: z.string(),
      lesson: z.string(),
      citedEvidenceIds: z.array(z.string()),
    }).strict()).min(1).max(3),
    nextSteps: z.array(z.string()).min(1).max(3),
  }).strict(),
}).strict();

export type AiDebriefApiRequest = z.infer<typeof aiDebriefApiRequestSchema>;
export type AiDebriefApiResponse = z.infer<typeof aiDebriefApiResponseSchema>;
