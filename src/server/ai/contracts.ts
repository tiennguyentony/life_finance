import { z } from "zod";

import { AI_PRIVACY_NOTICE_VERSION } from "./privacy-notice";

export const AI_CONTRACT_VERSION = 1 as const;

export const AI_ROLE_MODELS = Object.freeze({
  hostile_fed: "gpt-5.6-sol",
  teacher: "gpt-5.6-sol",
  onboarding: "gpt-5.6-terra",
  explanation: "gpt-5.6-terra",
} as const);

export type AiRole = keyof typeof AI_ROLE_MODELS;

const safeIdentifier = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);
const narrativeText = z.string().trim().min(1).max(2_000);
const shortText = z.string().trim().min(1).max(240);
const safeInteger = z.number().int().safe();
const ratePpm = safeInteger.min(0).max(1_000_000);
const privacyConsentFields = {
  privacyNoticeVersion: z.literal(AI_PRIVACY_NOTICE_VERSION),
  dataUseAccepted: z.literal(true),
} as const;

export const aiEvidenceFactSchema = z
  .object({
    id: safeIdentifier,
    label: shortText,
    value: shortText,
  })
  .strict();

export const hostileFedRequestSchema = z
  .object({
    contractVersion: z.literal(AI_CONTRACT_VERSION),
    ...privacyConsentFields,
    role: z.literal("hostile_fed"),
    simulationMonth: z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/),
    marketRegime: z.enum(["expansion", "inflation", "recession", "recovery"]),
    weaknesses: z
      .array(
        z
          .object({
            id: safeIdentifier,
            severityPpm: ratePpm,
            evidence: z.array(aiEvidenceFactSchema).min(1).max(6),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    candidates: z
      .array(
        z
          .object({
            templateId: safeIdentifier,
            templateVersion: safeInteger.min(1),
            tier: z.enum(["ambient", "micro", "medium", "large", "catastrophe"]),
            teachingPrinciple: shortText,
            targetsWeaknesses: z.array(safeIdentifier).min(1).max(8),
            parameters: z
              .array(
                z
                  .object({
                    id: safeIdentifier,
                    minimum: safeInteger,
                    maximum: safeInteger,
                  })
                  .strict()
                  .refine((value) => value.minimum <= value.maximum, {
                    message: "minimum must not exceed maximum",
                  }),
              )
              .max(8),
          })
          .strict(),
      )
      .min(1)
      .max(24),
  })
  .strict();

export const hostileFedResponseSchema = z
  .object({
    templateId: safeIdentifier,
    templateVersion: safeInteger.min(1),
    targetedWeaknessId: safeIdentifier,
    parameters: z
      .array(
        z
          .object({ id: safeIdentifier, value: safeInteger })
          .strict(),
      )
      .max(8),
    headline: shortText,
    narrative: narrativeText,
    rationale: narrativeText.max(800),
    citedEvidenceIds: z.array(safeIdentifier).min(1).max(8),
  })
  .strict();

export const teacherRequestSchema = z
  .object({
    contractVersion: z.literal(AI_CONTRACT_VERSION),
    ...privacyConsentFields,
    role: z.literal("teacher"),
    outcome: z
      .object({
        kind: z.enum(["financial_independence", "retirement_age", "bankruptcy"]),
        grade: z.enum(["S", "A", "B", "C", "D", "E", "F"]),
        reasonCode: safeIdentifier,
      })
      .strict(),
    evidence: z.array(aiEvidenceFactSchema).min(1).max(40),
    decisions: z
      .array(
        z
          .object({
            id: safeIdentifier,
            month: z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/),
            summary: shortText,
            evidenceIds: z.array(safeIdentifier).min(1).max(8),
          })
          .strict(),
      )
      .max(40),
  })
  .strict();

export const teacherResponseSchema = z
  .object({
    grade: z.enum(["S", "A", "B", "C", "D", "E", "F"]),
    title: shortText,
    summary: narrativeText,
    decisiveMoments: z
      .array(
        z
          .object({
            decisionId: safeIdentifier,
            lesson: narrativeText.max(800),
            citedEvidenceIds: z.array(safeIdentifier).min(1).max(8),
          })
          .strict(),
      )
      .min(1)
      .max(3),
    nextSteps: z.array(shortText).min(1).max(3),
  })
  .strict();

const optionalExtractedText = z.string().trim().min(1).max(120).nullable();

export const onboardingRequestSchema = z
  .object({
    contractVersion: z.literal(AI_CONTRACT_VERSION),
    ...privacyConsentFields,
    role: z.literal("onboarding"),
    sanitizedFreeText: z.string().trim().min(1).max(4_000),
    allowedLocationIds: z.array(safeIdentifier).min(1).max(256),
    allowedCareerTrackIds: z.array(safeIdentifier).min(1).max(256),
  })
  .strict();

export const onboardingResponseSchema = z
  .object({
    birthMonth: optionalExtractedText,
    locationId: optionalExtractedText,
    careerTrackId: optionalExtractedText,
    filingStatus: z
      .enum([
        "single",
        "married_filing_jointly",
        "married_filing_separately",
        "head_of_household",
        "qualifying_surviving_spouse",
      ])
      .nullable(),
    statedAmounts: z
      .array(
        z
          .object({
            field: z.enum([
              "cash",
              "taxable_investments",
              "retirement",
              "home_value",
              "other_assets",
              "non_credit_liabilities",
              "credit_limit",
              "credit_used",
              "annual_living_cost",
            ]),
            valueAsStated: z.string().trim().min(1).max(80),
            sourceExcerpt: z.string().trim().min(1).max(200),
          })
          .strict(),
      )
      .max(20),
    missingFields: z.array(safeIdentifier).max(20),
    clarificationQuestion: z.string().trim().min(1).max(300).nullable(),
  })
  .strict();

export const explanationRequestSchema = z
  .object({
    contractVersion: z.literal(AI_CONTRACT_VERSION),
    ...privacyConsentFields,
    role: z.literal("explanation"),
    conceptId: safeIdentifier,
    audienceLevel: z.enum(["beginner", "intermediate"]),
    whyNow: shortText,
    evidence: z.array(aiEvidenceFactSchema).max(10),
  })
  .strict();

export const explanationResponseSchema = z
  .object({
    title: shortText,
    explanation: narrativeText,
    whyItMattersNow: narrativeText.max(800),
    actionTips: z.array(shortText).min(1).max(3),
    citedEvidenceIds: z.array(safeIdentifier).max(8),
  })
  .strict();

export const aiRequestSchema = z.discriminatedUnion("role", [
  hostileFedRequestSchema,
  teacherRequestSchema,
  onboardingRequestSchema,
  explanationRequestSchema,
]);

export const aiResponseSchemas = Object.freeze({
  hostile_fed: hostileFedResponseSchema,
  teacher: teacherResponseSchema,
  onboarding: onboardingResponseSchema,
  explanation: explanationResponseSchema,
} as const);

export type AiRequest = z.infer<typeof aiRequestSchema>;
export type HostileFedRequest = z.infer<typeof hostileFedRequestSchema>;
export type HostileFedResponse = z.infer<typeof hostileFedResponseSchema>;
export type TeacherRequest = z.infer<typeof teacherRequestSchema>;
export type TeacherResponse = z.infer<typeof teacherResponseSchema>;
export type OnboardingRequest = z.infer<typeof onboardingRequestSchema>;
export type OnboardingResponse = z.infer<typeof onboardingResponseSchema>;
export type ExplanationRequest = z.infer<typeof explanationRequestSchema>;
export type ExplanationResponse = z.infer<typeof explanationResponseSchema>;

export type AiRoleRequestMap = Readonly<{
  hostile_fed: HostileFedRequest;
  teacher: TeacherRequest;
  onboarding: OnboardingRequest;
  explanation: ExplanationRequest;
}>;

export type AiRoleResponseMap = Readonly<{
  hostile_fed: HostileFedResponse;
  teacher: TeacherResponse;
  onboarding: OnboardingResponse;
  explanation: ExplanationResponse;
}>;
