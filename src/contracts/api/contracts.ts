import { z } from "zod";

import {
  CHARACTER_BANTER_IDS,
  CHARACTER_BANTER_TONES,
} from "@/core/character-banter";

const monthSchema = z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/);
const centsSchema = z.number().int().safe();
const rateSchema = z.number().int().min(0).max(1_000_000);
const emergencyFundMonthsSchema = z.number().int().min(0).max(24_000_000);
const identifierSchema = z.string().trim().min(1).max(160);

export const monthlyTaxBreakdownSchema = z
  .object({
    version: z.literal("monthly-tax-breakdown-v1"),
    monthlyFederalIncomeTaxCents: centsSchema,
    monthlyStateIncomeTaxCents: centsSchema,
    monthlyEmployeePayrollTaxCents: centsSchema,
    monthlySelfEmploymentTaxCents: centsSchema,
    annualGrossIncomeCents: centsSchema,
    annualTaxableIncomeCents: centsSchema.nullable(),
    annualFederalIncomeTaxCents: centsSchema,
    annualStateIncomeTaxCents: centsSchema,
    annualEmployeePayrollTaxCents: centsSchema,
    annualSelfEmploymentTaxCents: centsSchema,
    annualTotalTaxCents: centsSchema,
    annualAfterTaxIncomeCents: centsSchema,
    effectiveTaxRatePpm: z.number().int().min(-1_000_000).max(100_000_000),
    disclaimer: z.literal(
      "Educational estimate only; not tax, legal, or financial advice.",
    ),
  })
  .strict();

const eventResponsePreviewSchema = z
  .object({
    version: z.literal("personal-event-response-preview-v1"),
    status: z.enum(["available", "unavailable", "error"]),
    immediateCashChangeCents: centsSchema,
    recurringCashFlows: z.array(z
      .object({
        direction: z.enum(["expense", "income"]),
        monthlyCents: centsSchema.nonnegative(),
        durationMonths: z.number().int().min(2).max(120),
        totalCents: centsSchema.nonnegative(),
      })
      .strict()),
    financing: z.array(z
      .object({
        principalCents: centsSchema.nonnegative(),
        monthlyPaymentCents: centsSchema.nonnegative(),
        termMonths: z.number().int().min(1).max(120),
        annualInterestRatePpm: rateSchema,
      })
      .strict()).optional(),
    annualLivingCostChangeCents: centsSchema,
    wellbeingChangesPpm: z
      .object({ happiness: centsSchema, burnout: centsSchema })
      .strict(),
    followUps: z.array(z
      .object({
        templateId: identifierSchema,
        templateVersion: z.number().int().min(2),
        delayMonths: z.number().int().min(1).max(120),
        parameterRanges: z.record(z.string(), z
          .object({ minimum: centsSchema, maximum: centsSchema })
          .strict()),
      })
      .strict()),
    netOutcomeCents: centsSchema.nullable(),
    unavailableReason: z.string().max(500).nullable(),
    summary: z.string().max(2_000),
  })
  .strict();

const eventChoiceSchema = z
  .object({
    id: identifierSchema,
    label: z.string().trim().min(1).max(120),
    description: z.string().max(2_000),
    enabled: z.boolean(),
    preview: eventResponsePreviewSchema,
  })
  .strict();

const recurringStrategySchema = z
  .object({
    effectiveMonth: monthSchema,
    emergencyFundTargetMonthsPpm: emergencyFundMonthsSchema.optional(),
    insuranceCoverageIds: z.array(identifierSchema).max(16).optional(),
    preTax401kSalaryRatePpm: rateSchema,
    preTaxHsaSalaryRatePpm: rateSchema,
    afterTaxBroadIndexRatePpm: rateSchema,
    afterTaxSectorRatePpm: rateSchema,
    afterTaxSpeculativeRatePpm: rateSchema,
    afterTaxIraRatePpm: rateSchema,
    afterTaxExtraDebtRatePpm: rateSchema,
  })
  .strict();

const preparednessBandSchema = z.enum(["critical", "exposed", "stable", "resilient"]);
const preparednessSchema = z
  .object({
    version: z.literal("preparedness-assessment-v1"),
    riskVersion: z.literal("risk-v1"),
    asOfMonth: monthSchema,
    scorePpm: rateSchema,
    band: preparednessBandSchema,
    components: z
      .object({
        liquidityPpm: rateSchema,
        cashFlowPpm: rateSchema,
        debtPpm: rateSchema,
        insurancePpm: rateSchema,
        diversificationPpm: rateSchema,
      })
      .strict(),
  })
  .strict();

const beginnerCheckpointSchema = z
  .object({
    version: z.literal("beginner-chapter-v1"),
    checkpointMonth: monthSchema,
    outcome: z.enum(["bankrupt", "fragile", "developing", "strong"]),
    completed: z.boolean(),
    scorePpm: rateSchema,
    preparednessBand: preparednessBandSchema,
    weakestComponent: z.enum([
      "liquidity",
      "cash_flow",
      "debt",
      "insurance",
      "diversification",
    ]),
    lessonKey: identifierSchema,
  })
  .strict();

/**
 * Nullable because runs created before the scenario catalog snapshot existed
 * carry no benefits. Readers must render "unknown", never "not covered".
 */
const benefitsSchema = z
  .object({
    retirementPlan: z
      .object({
        label: z.string().max(160),
        employeeAnnualLimitCents: centsSchema.nonnegative(),
        employerMatchTiers: z
          .array(z
            .object({
              employeeContributionRateUpToPpm: rateSchema,
              employerMatchRatePpm: rateSchema,
            })
            .strict())
          .max(8),
      })
      .strict(),
    healthPlan: z
      .object({
        label: z.string().max(160),
        hsaEligible: z.boolean(),
        monthlyPremiumCents: centsSchema.nonnegative(),
        annualDeductibleCents: centsSchema.nonnegative(),
        annualOutOfPocketMaximumCents: centsSchema.nonnegative(),
        coinsurancePpm: rateSchema,
      })
      .strict()
      .nullable(),
    insuranceCoverages: z
      .array(z
        .object({
          id: identifierSchema,
          label: z.string().max(160),
          kind: z.enum([
            "short_term_disability",
            "long_term_disability",
            "term_life",
            "renters",
          ]),
          monthlyPremiumCents: centsSchema.nonnegative(),
          coverageLimitCents: centsSchema.nonnegative(),
          deductibleCents: centsSchema.nonnegative(),
        })
        .strict())
      .max(16),
  })
  .strict()
  .nullable();

const pendingInteractionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }).strict(),
  z
    .object({
      kind: z.literal("event"),
      eventId: identifierSchema,
      templateId: identifierSchema,
      choiceIds: z.array(identifierSchema),
      choices: z.array(eventChoiceSchema),
      parameters: z.record(z.string(), z.number().int().safe()),
      headline: z.string().nullable(),
      body: z.string().nullable(),
    })
    .strict(),
]);

export const runViewSchema = z
  .object({
    runId: identifierSchema,
    revision: z.number().int().min(0),
    startMonth: monthSchema,
    currentMonth: monthSchema,
    status: z.enum(["active", "completed"]),
    player: z
      .object({
        playerId: identifierSchema,
        birthMonth: monthSchema,
        locationId: identifierSchema,
        careerId: identifierSchema,
        filingStatus: z.enum([
          "single",
          "married_filing_jointly",
          "married_filing_separately",
          "head_of_household",
          "qualifying_surviving_spouse",
        ]),
      })
      .strict(),
    finances: z
      .object({
        cashCents: centsSchema,
        taxableInvestmentsCents: centsSchema,
        retirementCents: centsSchema,
        homeValueCents: centsSchema,
        otherInvestableAssetsCents: centsSchema,
        otherAssetsCents: centsSchema,
        nonCreditLiabilitiesCents: centsSchema,
        creditLimitCents: centsSchema,
        creditUsedCents: centsSchema,
        annualLivingCostCents: centsSchema,
        requiredObligationsCents: centsSchema,
        monthlyObligations: z
          .object({
            livingCostCents: centsSchema.nonnegative(),
            healthPremiumCents: centsSchema.nonnegative(),
            additionalInsurancePremiumsCents: centsSchema.nonnegative(),
            termDebtMinimumsCents: centsSchema.nonnegative(),
            revolvingCreditMinimumCents: centsSchema.nonnegative(),
            eventExpensesDueCents: centsSchema.nonnegative(),
            eventIncomeDueCents: centsSchema.nonnegative(),
            otherRequiredCents: centsSchema.nonnegative(),
            totalRequiredCashCents: centsSchema.nonnegative(),
          })
          .strict(),
        investableAssetsCents: centsSchema,
        netWorthCents: centsSchema,
      })
      .strict(),
    debts: z
      .object({
        termDebts: z.array(z
          .object({
            id: identifierSchema,
            kind: z.enum(["mortgage", "student_loan", "auto_loan", "personal_loan"]),
            principalCents: centsSchema.positive(),
            annualInterestRatePpm: rateSchema,
            minimumPaymentCents: centsSchema.positive(),
            remainingTermMonths: z.number().int().min(1).max(1_200),
          })
          .strict()),
      })
      .strict(),
    income: z
      .object({ annualGrossSalaryCents: centsSchema.nullable() })
      .strict(),
    wellbeing: z
      .object({ burnoutPpm: rateSchema, happinessPpm: rateSchema })
      .strict(),
    goal: z
      .object({
        source: z.enum(["player_selected", "current_lifestyle_default"]),
        desiredAnnualSpendingCents: centsSchema,
        safeWithdrawalRatePpm: rateSchema,
        targetAgeYears: z.number().int().min(18).max(120),
        currentCents: centsSchema.nonnegative(),
        targetCents: centsSchema,
        progressPpm: rateSchema,
      })
      .strict(),
    risk: z
      .object({
        aggregateSeverityPpm: rateSchema,
        weaknessTags: z.array(identifierSchema),
      })
      .strict(),
    preparedness: preparednessSchema,
    beginnerCheckpoint: beginnerCheckpointSchema.nullable(),
    strategy: recurringStrategySchema,
    market: z
      .object({
        regime: z.enum(["expansion", "inflation", "recession", "recovery"]),
        modelVersion: z.enum(["regime-v1", "regime-v2"]),
      })
      .strict(),
    career: z
      .object({ pendingProgramIds: z.array(identifierSchema) })
      .strict(),
    benefits: benefitsSchema,
    pendingInteraction: pendingInteractionSchema,
    outcome: z.unknown().nullable(),
    capabilities: z
      .object({
        canAdvance: z.boolean(),
        canAct: z.boolean(),
        canRequestTeaching: z.boolean(),
      })
      .strict(),
  })
  .strict();

export const commandIntentSchema = z
  .object({
    id: identifierSchema,
    expectedRevision: z.number().int().min(0),
    effectiveMonth: monthSchema.optional(),
    type: z.enum([
      "set_recurring_strategy",
      "take_detailed_action",
      "resolve_event_choice",
      "manage_life_milestone",
      "process_month",
    ]),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

export const apiErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: identifierSchema,
        message: z.string().min(1).max(500),
        details: z.array(z.string().max(500)).optional(),
        requestId: identifierSchema,
      })
      .strict(),
  })
  .strict();

export const runViewResponseSchema = z
  .object({
    run: runViewSchema,
    stateChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const commandResponseSchema = runViewResponseSchema
  .extend({
    result: z
      .object({
        idempotentReplay: z.boolean(),
        monthlyExplanation: z
          .object({
            processedMonth: monthSchema,
            grossIncomeCents: centsSchema,
            totalTaxCents: centsSchema,
            afterTaxCashIncomeCents: centsSchema,
            taxBreakdown: monthlyTaxBreakdownSchema.nullable().optional(),
            resolvedIncomeCents: centsSchema,
            resolvedExpenseCents: centsSchema,
            marketValueChangeCents: centsSchema,
            annualInflationIncreaseCents: centsSchema,
            insurancePlayerCostCents: centsSchema,
            requiredCashCents: centsSchema,
            debtInterestCents: centsSchema,
            debtPaymentCents: centsSchema,
          })
          .strict()
          .nullable()
          .optional(),
        aiDirector: z.union([
          z.object({
            mode: z.enum(["shadow", "active"]),
            source: z.enum([
              "openai",
              "hosted_oss",
              "local_oss",
              "deterministic_fallback",
            ]),
            status: z.enum(["validated", "fallback"]),
            latencyMs: z.number().int().min(0).max(30_000),
            candidateCount: z.number().int().min(0).max(64),
            topCandidateAgreement: z.boolean().nullable(),
          })
          .strict(),
          z.object({
            mode: z.literal("operational"),
            source: z.literal("self_trained_local"),
            status: z.enum(["ranked", "fallback"]),
            candidateCount: z.number().int().min(0).max(64),
            artifactChecksum: z.string().regex(/^[a-f0-9]{64}$/),
            topCandidateId: z.string().nullable(),
            fallbackReason: z.string().nullable(),
          }).strict(),
        ])
          .nullable()
          .optional(),
      })
      .strict(),
  })
  .strict();

export const sessionResponseSchema = z
  .object({
    account: z.object({ userId: z.string().uuid() }).strict().optional(),
    session: runViewResponseSchema.nullable(),
  })
  .strict();

export const savedRunSchema = z
  .object({
    runId: z.string().uuid(),
    saveStatus: z.enum(["active", "archived"]),
    runStatus: z.enum(["active", "terminal"]),
    currentMonth: monthSchema,
    revision: z.number().int().min(0),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const savedRunsResponseSchema = z
  .object({ saves: z.array(savedRunSchema).max(50) })
  .strict();

export const activateRunResponseSchema = z
  .object({ activeRunId: z.string().uuid() })
  .strict();

export const taxSummaryResponseSchema = z
  .object({
    status: z.literal("available"),
    asOfMonth: monthSchema,
    jurisdiction: z
      .object({
        stateCode: z.string().regex(/^[A-Z]{2}$/),
        filingStatus: z.enum([
          "single",
          "married_filing_jointly",
          "married_filing_separately",
          "head_of_household",
          "qualifying_surviving_spouse",
        ]),
        economicYear: z.number().int().min(2026).max(2200),
        policyYear: z.literal(2026),
      })
      .strict(),
    paycheckEstimate: z
      .object({
        grossIncomeCents: centsSchema,
        employee401kContributionCents: centsSchema,
        employeeHsaContributionCents: centsSchema,
        federalIncomeTaxCents: centsSchema,
        stateIncomeTaxCents: centsSchema,
        employeePayrollTaxCents: centsSchema,
        selfEmploymentTaxCents: centsSchema,
        totalTaxCents: centsSchema,
        afterTaxCashIncomeCents: centsSchema,
        effectiveTaxRatePpm: z.number().int().min(-1_000_000).max(100_000_000),
      })
      .strict(),
    annualEstimate: monthlyTaxBreakdownSchema,
    yearToDate: z
      .object({
        paychecksProcessed: z.number().int().min(0).max(12),
        grossIncomeCents: centsSchema,
        totalTaxCents: centsSchema,
        afterTaxCashIncomeCents: centsSchema,
        employee401kContributionCents: centsSchema,
        employeeHsaContributionCents: centsSchema,
      })
      .strict(),
    settlement: z
      .object({
        method: z.literal("exact_modeled_liability_withholding"),
        projectedRefundCents: z.literal(0),
        projectedAmountDueCents: z.literal(0),
        explanation: z.string().min(1).max(500),
      })
      .strict(),
    stateContext: z
      .object({
        hasModeledStateIncomeTax: z.boolean(),
        annualStateIncomeTaxCents: centsSchema,
        differenceFromNoIncomeTaxStateCents: centsSchema,
        explanation: z.string().min(1).max(500),
      })
      .strict(),
    model: z
      .object({
        provider: z.literal("PolicyEngine US"),
        bundleVersion: z.string().min(1).max(50),
        rulesVersion: z.string().min(1).max(50),
        projectedFromFrozenPolicy: z.boolean(),
      })
      .strict(),
  })
  .strict();

export const interpretEventRequestSchema = z
  .object({
    eventId: identifierSchema,
    expectedRevision: z.number().int().min(0),
    /** Ask the model for advice without applying any event choice. */
    interactionMode: z.enum(["interpret", "recommend"]).optional(),
    /** Backward-compatible explicit confirmation of an engine-owned choice. */
    selectedChoiceId: identifierSchema.optional(),
    conversation: z
      .array(z
        .object({
          role: z.enum(["player", "sprout"]),
          content: z.string().trim().min(1).max(500),
        })
        .strict())
      .min(1)
      .max(5),
  })
  .strict()
  .superRefine((value, context) => {
    value.conversation.forEach((message, index) => {
      const expectedRole = index % 2 === 0 ? "player" : "sprout";
      if (message.role !== expectedRole) {
        context.addIssue({
          code: "custom",
          message: "conversation must alternate player and Sprout messages",
          path: ["conversation", index, "role"],
        });
      }
    });
    if (value.conversation.at(-1)?.role !== "player") {
      context.addIssue({
        code: "custom",
        message: "conversation must end with the player's latest answer",
        path: ["conversation"],
      });
    }
    if (value.conversation.filter(({ role }) => role === "player").length > 3) {
      context.addIssue({
        code: "custom",
        message: "conversation supports at most three player answers",
        path: ["conversation"],
      });
    }
    if (value.interactionMode === "recommend" && value.selectedChoiceId !== undefined) {
      context.addIssue({
        code: "custom",
        message: "recommend mode cannot also confirm an explicit choice",
        path: ["selectedChoiceId"],
      });
    }
  });

export const interpretEventResponseSchema = z
  .object({
    version: z.literal("interactive-event-interpretation-v1"),
    status: z.enum(["mapped", "rejected", "question", "confirmation", "recommendation"]),
    source: z.enum([
      "deterministic_fast_path",
      "openai",
      "hosted_oss",
      "local_oss",
      "deterministic_fallback",
    ]),
    choiceId: identifierSchema.nullable(),
    confidencePpm: rateSchema,
    latencyMs: z.number().int().min(0).max(30_000),
    systemMessage: z.string().trim().min(1).max(500),
    sproutReaction: z.string().trim().min(1).max(500),
    education: z.string().trim().min(1).max(1_000),
    recommendation: z
      .object({
        choiceId: identifierSchema,
        reason: z.string().trim().min(1).max(500),
        tradeoff: z.string().trim().min(1).max(500),
        citedEvidenceIds: z.array(identifierSchema).min(1).max(4),
      })
      .strict()
      .nullable(),
    playerTurn: z.number().int().min(1).max(3),
    remainingPlayerTurns: z.number().int().min(0).max(2),
  })
  .strict()
  .superRefine((value, context) => {
    const hasChoice = value.choiceId !== null;
    const hasRecommendation = value.recommendation !== null;
    if ((value.status === "mapped" || value.status === "confirmation") && !hasChoice) {
      context.addIssue({
        code: "custom",
        message: `${value.status} requires one engine-owned choice`,
        path: ["choiceId"],
      });
    }
    if (
      value.status !== "mapped" &&
      value.status !== "confirmation" &&
      hasChoice
    ) {
      context.addIssue({
        code: "custom",
        message: `${value.status} cannot contain an applied or proposed choice`,
        path: ["choiceId"],
      });
    }
    if (value.status === "recommendation" && !hasRecommendation) {
      context.addIssue({
        code: "custom",
        message: "recommendation status requires grounded recommendation details",
        path: ["recommendation"],
      });
    }
    if (value.status !== "recommendation" && hasRecommendation) {
      context.addIssue({
        code: "custom",
        message: "only recommendation status may contain recommendation details",
        path: ["recommendation"],
      });
    }
    if (value.remainingPlayerTurns !== 3 - value.playerTurn) {
      context.addIssue({
        code: "custom",
        message: "remainingPlayerTurns must match the bounded conversation budget",
        path: ["remainingPlayerTurns"],
      });
    }
  });

const characterBanterEvidenceSchema = z
  .object({
    id: identifierSchema,
    label: z.string().trim().min(1).max(120),
    value: z.string().trim().min(1).max(120),
  })
  .strict();

export const characterBanterRequestSchema = z
  .object({
    expectedRevision: z.number().int().min(0),
    simulationMonth: monthSchema,
    planLabel: z.string().trim().min(1).max(160),
    variationSeed: z.number().int().min(0).max(2_147_483_647),
    evidence: z.array(characterBanterEvidenceSchema).min(1).max(12),
    recentLines: z.array(z.string().trim().min(1).max(240)).max(8),
    recentEvidenceIds: z.array(identifierSchema).max(8).optional(),
    recentCharacterIds: z.array(z.enum(CHARACTER_BANTER_IDS)).max(8).optional(),
  })
  .strict();

export const characterBanterResponseSchema = z.discriminatedUnion("status", [
  z
    .object({
      version: z.literal("character-banter-v1"),
      status: z.literal("generated"),
      source: z.enum(["openai", "hosted_oss", "local_oss"]),
      characterId: z.enum(CHARACTER_BANTER_IDS),
      tone: z.enum(CHARACTER_BANTER_TONES),
      message: z.string().trim().min(1).max(240),
      citedEvidenceId: identifierSchema,
      latencyMs: z.number().int().min(0).max(30_000),
    })
    .strict(),
  z
    .object({
      version: z.literal("character-banter-v1"),
      status: z.literal("unavailable"),
    })
    .strict(),
]);

export type RunViewWire = z.infer<typeof runViewSchema>;
export type CommandIntent = z.infer<typeof commandIntentSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
export type RunViewResponseWire = z.infer<typeof runViewResponseSchema>;
export type CommandResponseWire = z.infer<typeof commandResponseSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type SavedRunWire = z.infer<typeof savedRunSchema>;
export type SavedRunsResponse = z.infer<typeof savedRunsResponseSchema>;
export type TaxSummaryResponse = z.infer<typeof taxSummaryResponseSchema>;
export type InterpretEventRequest = z.infer<typeof interpretEventRequestSchema>;
export type InterpretEventResponse = z.infer<typeof interpretEventResponseSchema>;
export type CharacterBanterRequest = z.infer<typeof characterBanterRequestSchema>;
export type CharacterBanterResponse = z.infer<typeof characterBanterResponseSchema>;
