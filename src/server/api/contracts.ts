import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

const safeInteger = z.int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
export const nonNegativeCentsSchema = z.int().min(0).max(Number.MAX_SAFE_INTEGER);
export const signedCentsSchema = safeInteger;
export const ratePpmSchema = z.int().min(-1_000_000).max(1_000_000);
export const boundedRatePpmSchema = z.int().min(0).max(1_000_000);
export const simulationMonthSchema = z
  .string()
  .regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/);
export const identifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/);
export const checksumSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const filingStatusSchema = z.enum([
  "single",
  "married_filing_jointly",
  "married_filing_separately",
  "head_of_household",
  "qualifying_surviving_spouse",
]);
export const marketRegimeSchema = z.enum([
  "expansion",
  "inflation",
  "recession",
  "recovery",
]);

export const financialSnapshotSchema = z
  .object({
    cashCents: nonNegativeCentsSchema,
    taxableInvestmentsCents: nonNegativeCentsSchema,
    retirementCents: nonNegativeCentsSchema,
    homeValueCents: nonNegativeCentsSchema,
    otherInvestableAssetsCents: nonNegativeCentsSchema,
    otherAssetsCents: nonNegativeCentsSchema,
    nonCreditLiabilitiesCents: nonNegativeCentsSchema,
    creditLimitCents: nonNegativeCentsSchema,
    creditUsedCents: nonNegativeCentsSchema,
    annualLivingCostCents: nonNegativeCentsSchema,
    requiredObligationsCents: nonNegativeCentsSchema,
  })
  .strict()
  .refine((value) => value.creditUsedCents <= value.creditLimitCents, {
    message: "credit used must not exceed the credit limit",
    path: ["creditUsedCents"],
  });

export const wellbeingSchema = z
  .object({
    burnoutPpm: boundedRatePpmSchema,
    happinessPpm: boundedRatePpmSchema,
  })
  .strict();

export const playerProfileSchema = z
  .object({
    playerId: identifierSchema,
    birthMonth: simulationMonthSchema,
    locationId: identifierSchema,
    careerTrackId: identifierSchema,
    filingStatus: filingStatusSchema,
  })
  .strict();

export const ledgerAccountSchema = z
  .object({
    id: identifierSchema,
    name: z.string().min(1).max(100),
    category: z.enum(["asset", "liability", "income", "expense", "equity"]),
    normalBalance: z.enum(["debit", "credit"]),
  })
  .strict();

export const journalPostingSchema = z
  .object({
    accountId: identifierSchema,
    debitCents: nonNegativeCentsSchema,
    creditCents: nonNegativeCentsSchema,
  })
  .strict()
  .refine(
    (posting) =>
      (posting.debitCents > 0 && posting.creditCents === 0) ||
      (posting.creditCents > 0 && posting.debitCents === 0),
    { message: "exactly one posting side must be positive" },
  );

export const journalTransactionSchema = z
  .object({
    id: identifierSchema,
    commandId: identifierSchema,
    effectiveMonth: simulationMonthSchema,
    reasonCode: identifierSchema,
    description: z.string().min(1).max(500),
    postings: z.array(journalPostingSchema).min(2),
    reversesTransactionId: identifierSchema.optional(),
  })
  .strict();

export const ledgerSchema = z
  .object({
    accounts: z.record(z.string(), ledgerAccountSchema),
    transactions: z.array(journalTransactionSchema),
  })
  .strict();

export const gameOutcomeSchema = z
  .object({
    kind: z.enum(["financial_independence", "retirement_age", "bankruptcy"]),
    grade: z.enum(["S", "A", "B", "C", "D", "E", "F"]),
    reachedMonth: simulationMonthSchema,
    reasonCode: identifierSchema,
  })
  .strict();

export const gameStateSchema = z
  .object({
    schemaVersion: z.literal(1),
    engineVersion: z.literal("4.0.0"),
    runId: identifierSchema,
    revision: z.int().min(0),
    startMonth: simulationMonthSchema,
    currentMonth: simulationMonthSchema,
    player: playerProfileSchema,
    finances: financialSnapshotSchema,
    wellbeing: wellbeingSchema,
    marketRegime: marketRegimeSchema,
    random: z
      .object({
        algorithm: z.literal("mulberry32-v1"),
        value: z.int().min(0).max(0xffff_ffff),
      })
      .strict(),
    ledger: ledgerSchema,
    acceptedCommandIds: z.array(identifierSchema),
    outcome: gameOutcomeSchema.nullable(),
  })
  .strict();

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("invest_cash"), amountCents: nonNegativeCentsSchema }).strict(),
  z
    .object({
      type: z.literal("liquidate_taxable_investments"),
      amountCents: nonNegativeCentsSchema,
      liquidationCostRatePpm: boundedRatePpmSchema,
    })
    .strict(),
  z.object({ type: z.literal("pay_credit"), amountCents: nonNegativeCentsSchema }).strict(),
  z.object({ type: z.literal("draw_credit"), amountCents: nonNegativeCentsSchema }).strict(),
  z
    .object({
      type: z.literal("withdraw_retirement"),
      grossAmountCents: nonNegativeCentsSchema,
      withholdingRatePpm: boundedRatePpmSchema,
      penaltyRatePpm: boundedRatePpmSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("sell_home"),
      salePriceCents: nonNegativeCentsSchema,
      nonCreditLiabilityPayoffCents: nonNegativeCentsSchema,
      transactionCostRatePpm: boundedRatePpmSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("set_annual_living_cost"),
      annualLivingCostCents: nonNegativeCentsSchema,
    })
    .strict(),
]);

const eventProposalSchema = z
  .object({
    eventId: identifierSchema,
    templateId: identifierSchema,
    templateVersion: z.int().min(1),
    parameters: z.record(identifierSchema, safeInteger),
  })
  .strict();

const monthlyInputSchema = z
  .object({
    employmentIncomeCents: nonNegativeCentsSchema,
    taxableLiquidationCostRatePpm: boundedRatePpmSchema,
    event: z
      .object({
        proposal: eventProposalSchema,
        choiceId: identifierSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const commandEnvelope = z.object({
  schemaVersion: z.literal(1),
  id: identifierSchema,
  expectedRevision: z.int().min(0),
  effectiveMonth: simulationMonthSchema,
});

const advanceMonthCommandSchema = commandEnvelope
  .extend({
    type: z.literal("advance_month"),
    payload: z.object({ months: z.literal(1) }).strict(),
  })
  .strict();
const postTransactionCommandSchema = commandEnvelope
  .extend({
    type: z.literal("post_transaction"),
    payload: z
      .object({
        transactionId: identifierSchema,
        reasonCode: identifierSchema,
        description: z.string().min(1).max(500),
        postings: z.array(journalPostingSchema).min(2),
        reversesTransactionId: identifierSchema.optional(),
      })
      .strict(),
  })
  .strict();
const takeActionCommandSchema = commandEnvelope
  .extend({
    type: z.literal("take_action"),
    payload: z.object({ action: actionSchema }).strict(),
  })
  .strict();
const processMonthCommandSchema = commandEnvelope
  .extend({
    type: z.literal("process_month"),
    payload: monthlyInputSchema,
  })
  .strict();

export const internalGameCommandSchema = z.discriminatedUnion("type", [
  advanceMonthCommandSchema,
  postTransactionCommandSchema,
  takeActionCommandSchema,
  processMonthCommandSchema,
]);

// Only player-authored actions cross the public API. Month processing, market
// inputs, income, taxes, events, and raw journals are server-authoritative.
export const gameCommandSchema = takeActionCommandSchema;

export const createRunRequestSchema = z
  .object({
    startMonth: simulationMonthSchema,
    player: playerProfileSchema.omit({ playerId: true }),
    finances: financialSnapshotSchema,
    wellbeing: wellbeingSchema,
    marketRegime: marketRegimeSchema.optional(),
    randomSeed: z.union([z.string().min(1).max(256), safeInteger]),
  })
  .strict();

export const runIdPathSchema = z.object({ runId: z.uuid() }).strict();
export const createRunResponseSchema = z
  .object({
    runId: z.uuid(),
    accessSecret: z.string().regex(/^lf_run_[A-Za-z0-9_-]{43}$/),
    state: gameStateSchema,
    stateChecksum: checksumSchema,
  })
  .strict();
export const getRunResponseSchema = z
  .object({ state: gameStateSchema, stateChecksum: checksumSchema })
  .strict();
export const commandResponseSchema = getRunResponseSchema
  .extend({ idempotentReplay: z.boolean() })
  .strict();
export const apiErrorSchema = z
  .object({
    error: z
      .object({
        code: identifierSchema,
        message: z.string().min(1).max(500),
        details: z.array(z.string().max(500)).max(100).optional(),
      })
      .strict(),
  })
  .strict();

export type CreateRunRequest = z.infer<typeof createRunRequestSchema>;
export type CreateRunResponse = z.infer<typeof createRunResponseSchema>;
export type GetRunResponse = z.infer<typeof getRunResponseSchema>;
export type CommandRequest = z.infer<typeof gameCommandSchema>;
export type CommandResponse = z.infer<typeof commandResponseSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
