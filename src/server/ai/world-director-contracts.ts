import { z } from "zod";

import { AI_PRIVACY_NOTICE_VERSION } from "./privacy-notice";

export const aiWorldEventApiRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  privacyNoticeVersion: z.literal(AI_PRIVACY_NOTICE_VERSION),
  dataUseAccepted: z.literal(true),
}).strict();

export const aiWorldEventApiResponseSchema = z.object({
  source: z.enum(["openai", "local_oss", "deterministic_fallback"]),
  eventId: z.string(),
  memory: z.object({
    targetedWeaknessId: z.string(),
    rationale: z.string(),
    citedEvidenceIds: z.array(z.string()),
  }).strict(),
  state: z.unknown(),
  stateChecksum: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

export type AiWorldEventApiRequest = z.infer<typeof aiWorldEventApiRequestSchema>;
export type AiWorldEventApiResponse = z.infer<typeof aiWorldEventApiResponseSchema>;
