import { z } from "zod";

import { AI_PRIVACY_NOTICE_VERSION } from "../ai/privacy-notice";

const identifier = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,191}$/);
const fragment = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string().trim().min(1).max(180) }).strict(),
  z.object({ kind: z.literal("fact_ref"), factId: identifier }).strict(),
  z.object({ kind: z.literal("claim_ref"), claimId: identifier }).strict(),
]);
const section = z.object({
  sectionId: identifier,
  fragments: z.array(fragment).min(1).max(8),
}).strict();

export const teachingTemplateCopyV2Schema = z.object({
  version: z.literal("teaching-copy-v2"),
  sections: z.array(section).min(1).max(12),
}).strict();

export const teachingRewritePolicyV2Schema = z.object({
  allowedFactIds: z.array(identifier).max(64),
  allowedClaimIds: z.array(identifier).max(64),
  requiredFactIds: z.array(identifier).max(64),
  requiredClaimIds: z.array(identifier).max(64),
}).strict();

export const teachingRewriteApiRequestV2Schema = z.object({
  expectedRevision: z.number().int().safe().nonnegative(),
  privacyNoticeVersion: z.literal(AI_PRIVACY_NOTICE_VERSION),
  dataUseAccepted: z.literal(true),
  target: z.object({
    kind: z.literal("moment"),
    conceptId: identifier,
  }).strict(),
}).strict();

export const teachingRewriteProviderOutputV2Schema = z.object({
  sections: z.array(section).min(1).max(12),
}).strict();

export type TeachingRewriteApiRequestV2 = z.infer<typeof teachingRewriteApiRequestV2Schema>;
