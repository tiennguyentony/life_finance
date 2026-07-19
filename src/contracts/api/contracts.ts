import { z } from "zod";

const monthSchema = z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/);
const centsSchema = z.number().int().safe();
const rateSchema = z.number().int().min(0).max(1_000_000);
const emergencyFundMonthsSchema = z.number().int().min(0).max(24_000_000);
const identifierSchema = z.string().trim().min(1).max(160);

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
        investableAssetsCents: centsSchema,
        netWorthCents: centsSchema,
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

export type RunViewWire = z.infer<typeof runViewSchema>;
export type CommandIntent = z.infer<typeof commandIntentSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
export type RunViewResponseWire = z.infer<typeof runViewResponseSchema>;
export type CommandResponseWire = z.infer<typeof commandResponseSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type SavedRunWire = z.infer<typeof savedRunSchema>;
export type SavedRunsResponse = z.infer<typeof savedRunsResponseSchema>;
