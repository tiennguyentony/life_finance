import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import type { GameStateV2 } from "../../core/game-state-v2";
import { decodePersistedGameState } from "../../core/persisted-game-state";
import { US_2026_SCENARIO_CATALOG_VERSION } from "../../data/scenario-catalog";
import {
  boundedRatePpmSchema,
  checksumSchema,
  identifierSchema,
  marketRegimeSchema,
  nonNegativeCentsSchema,
  runIdPathSchema,
  simulationMonthSchema,
} from "./contracts";

extendZodWithOpenApi(z);

const commandIdSchema = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,95}$/);

const rateGroupSchema = z
  .object({
    preTax401kSalaryRatePpm: boundedRatePpmSchema,
    preTaxHsaSalaryRatePpm: boundedRatePpmSchema,
    afterTaxBroadIndexRatePpm: boundedRatePpmSchema,
    afterTaxSectorRatePpm: boundedRatePpmSchema,
    afterTaxSpeculativeRatePpm: boundedRatePpmSchema,
    afterTaxIraRatePpm: boundedRatePpmSchema,
    afterTaxExtraDebtRatePpm: boundedRatePpmSchema,
  })
  .strict()
  .superRefine((strategy, context) => {
    if (
      strategy.preTax401kSalaryRatePpm + strategy.preTaxHsaSalaryRatePpm >
      1_000_000
    ) {
      context.addIssue({
        code: "custom",
        path: ["preTax401kSalaryRatePpm"],
        message: "pre-tax allocation rates cannot exceed 100% in total",
      });
    }
    if (
      strategy.afterTaxBroadIndexRatePpm +
        strategy.afterTaxSectorRatePpm +
        strategy.afterTaxSpeculativeRatePpm +
        strategy.afterTaxIraRatePpm +
        strategy.afterTaxExtraDebtRatePpm >
      1_000_000
    ) {
      context.addIssue({
        code: "custom",
        path: ["afterTaxBroadIndexRatePpm"],
        message: "after-tax allocation rates cannot exceed 100% in total",
      });
    }
  });

const termDebtSchema = z
  .object({
    id: identifierSchema,
    kind: z.enum(["mortgage", "student_loan", "auto_loan", "personal_loan"]),
    principalCents: nonNegativeCentsSchema,
    annualInterestRatePpm: boundedRatePpmSchema,
    minimumPaymentCents: nonNegativeCentsSchema,
    remainingTermMonths: z.int().min(1).max(1_200),
  })
  .strict();

export const createRunV2RequestSchema = z
  .object({
    schemaVersion: z.literal(2),
    startMonth: simulationMonthSchema,
    birthMonth: simulationMonthSchema,
    randomSeed: z.union([z.string().min(1).max(256), z.int()]),
    catalogVersion: z.literal(US_2026_SCENARIO_CATALOG_VERSION),
    locationId: identifierSchema,
    careerId: identifierSchema,
    householdId: identifierSchema,
    benefitsPackageId: identifierSchema,
    healthPlanId: identifierSchema.nullable(),
    retirementPlanId: identifierSchema,
    insuranceCoverageIds: z.array(identifierSchema).max(16),
    scenarioId: identifierSchema,
    annualGrossSalaryCents: nonNegativeCentsSchema,
    financialGoal: z
      .object({
        version: z.literal("financial-goal-v1"),
        desiredAnnualSpendingCents: nonNegativeCentsSchema.min(1),
        safeWithdrawalRatePpm: z.int().min(20_000).max(60_000),
        targetAgeYears: z.int().min(18).max(80),
        source: z.literal("player_selected"),
      })
      .strict()
      .optional(),
    finances: z
      .object({
        cashCents: nonNegativeCentsSchema,
        taxableBroadIndexCents: nonNegativeCentsSchema,
        taxableSectorCents: nonNegativeCentsSchema,
        taxableSpeculativeCents: nonNegativeCentsSchema,
        retirement401kCents: nonNegativeCentsSchema,
        retirementIraCents: nonNegativeCentsSchema,
        hsaCents: nonNegativeCentsSchema,
        homeValueCents: nonNegativeCentsSchema,
        otherAssetsCents: nonNegativeCentsSchema,
        termDebts: z.array(termDebtSchema).max(32),
        revolvingCreditLimitCents: nonNegativeCentsSchema,
        revolvingCreditUsedCents: nonNegativeCentsSchema,
      })
      .strict()
      .refine(
        (value) => value.revolvingCreditUsedCents <= value.revolvingCreditLimitCents,
        {
          path: ["revolvingCreditUsedCents"],
          message: "used revolving credit cannot exceed its limit",
        },
      ),
    wellbeing: z
      .object({
        burnoutPpm: boundedRatePpmSchema,
        happinessPpm: boundedRatePpmSchema,
      })
      .strict(),
    marketRegime: marketRegimeSchema.optional(),
  })
  .strict();

export const gameStateV2WireSchema = z
  .custom<GameStateV2>((value) => {
    try {
      return decodePersistedGameState(value).schemaVersion === 2;
    } catch {
      return false;
    }
  })
  .openapi({
    type: "object",
    description:
      "Strict schema-v2 authoritative game state; validated by the versioned engine decoder.",
  });

const v2Envelope = z.object({
  schemaVersion: z.literal(2),
  id: commandIdSchema,
  expectedRevision: z.int().min(0),
  effectiveMonth: simulationMonthSchema,
});

const detailedActionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("invest_taxable"),
      bucket: z.enum([
        "taxableBroadIndexCents",
        "taxableSectorCents",
        "taxableSpeculativeCents",
      ]),
      amountCents: nonNegativeCentsSchema.min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("liquidate_taxable"),
      bucket: z.enum([
        "taxableBroadIndexCents",
        "taxableSectorCents",
        "taxableSpeculativeCents",
        "taxableLegacyUnclassifiedCents",
      ]),
      amountCents: nonNegativeCentsSchema.min(1),
      liquidationCostRatePpm: boundedRatePpmSchema,
    })
    .strict(),
  z.object({ type: z.literal("contribute_ira"), amountCents: nonNegativeCentsSchema.min(1) }).strict(),
  z.object({ type: z.literal("contribute_hsa"), amountCents: nonNegativeCentsSchema.min(1) }).strict(),
  z
    .object({
      type: z.literal("pay_term_debt"),
      debtId: identifierSchema,
      amountCents: nonNegativeCentsSchema.min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("pay_revolving_credit"),
      amountCents: nonNegativeCentsSchema.min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("draw_revolving_credit"),
      amountCents: nonNegativeCentsSchema.min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("withdraw_retirement"),
      bucket: z.enum([
        "retirement401kCents",
        "retirementIraCents",
        "retirementLegacyUnclassifiedCents",
      ]),
      amountCents: nonNegativeCentsSchema.min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("purchase_home"),
      purchasePriceCents: nonNegativeCentsSchema.min(1),
      downPaymentCents: nonNegativeCentsSchema,
      mortgageAnnualInterestRatePpm: boundedRatePpmSchema.max(500_000),
      mortgageTermMonths: z.int().min(12).max(480),
    })
    .strict(),
  z.object({ type: z.literal("sell_home") }).strict(),
  z
    .object({
      type: z.literal("refinance_home"),
      mortgageAnnualInterestRatePpm: boundedRatePpmSchema.max(500_000),
      mortgageTermMonths: z.int().min(12).max(480),
    })
    .strict(),
  z
    .object({
      type: z.literal("change_lifestyle"),
      annualLivingCostDeltaCents: z.int().refine((value) => value !== 0),
    })
    .strict(),
  z
    .object({
      type: z.literal("start_upskill"),
      programId: z.enum([
        "upskill.certificate",
        "upskill.bootcamp",
        "upskill.degree",
      ]),
    })
    .strict(),
]);

const setStrategyV2CommandSchema = v2Envelope
  .extend({
    type: z.literal("set_recurring_strategy"),
    payload: z.object({ strategy: rateGroupSchema }).strict(),
  })
  .strict();

const detailedActionV2CommandSchema = v2Envelope
  .extend({
    type: z.literal("take_detailed_action"),
    payload: z.object({ action: detailedActionSchema }).strict(),
  })
  .strict();

const processMonthV2PublicCommandSchema = v2Envelope
  .extend({ type: z.literal("process_month"), payload: z.object({}).strict() })
  .strict();

const resolveEventChoiceV2CommandSchema = v2Envelope
  .extend({
    type: z.literal("resolve_event_choice"),
    payload: z
      .object({ eventId: identifierSchema, choiceId: identifierSchema })
      .strict(),
  })
  .strict();

const manageLifeMilestoneV2CommandSchema = v2Envelope
  .extend({
    type: z.literal("manage_life_milestone"),
    payload: z.discriminatedUnion("action", [
      z.object({
        action: z.literal("schedule"),
        milestoneId: identifierSchema,
        kind: z.enum(["move", "vehicle", "wedding", "child", "education", "travel", "caregiving", "custom"]),
        label: z.string().trim().min(1).max(80),
        targetMonth: simulationMonthSchema,
        estimatedCostCents: nonNegativeCentsSchema.min(1),
      }).strict(),
      z.object({
        action: z.literal("resolve"),
        milestoneId: identifierSchema,
        resolution: z.enum(["pay_cash", "postpone_6_months", "cancel"]),
      }).strict(),
    ]),
  })
  .strict();

export const gameCommandV2PublicSchema = z.discriminatedUnion("type", [
  setStrategyV2CommandSchema,
  detailedActionV2CommandSchema,
  resolveEventChoiceV2CommandSchema,
  manageLifeMilestoneV2CommandSchema,
  processMonthV2PublicCommandSchema,
]);

const monthlyRecordSummarySchema = z
  .object({
    processedMonth: simulationMonthSchema,
    nextMonth: simulationMonthSchema,
    taxTraceId: identifierSchema,
    grossIncomeCents: nonNegativeCentsSchema,
    totalTaxCents: z.int(),
    afterTaxCashIncomeCents: nonNegativeCentsSchema,
    market: z
      .object({
        modelVersion: z.literal("regime-v1"),
        regime: marketRegimeSchema,
        nextRegime: marketRegimeSchema,
        equityReturnPpm: z.int(),
        bondReturnPpm: z.int(),
        cashReturnPpm: z.int(),
        housingReturnPpm: z.int(),
        inflationPpm: z.int(),
        laborDemandChangePpm: z.int(),
      })
      .passthrough(),
    marketValueChangeCents: z.int(),
    annualInflationIncreaseCents: z.int(),
    insurancePlayerCostCents: nonNegativeCentsSchema,
    requiredCashCents: nonNegativeCentsSchema,
    nonDebtObligationsPaidCents: nonNegativeCentsSchema,
    debtService: z
      .object({
        totalInterestCents: nonNegativeCentsSchema,
        totalScheduledPaymentCents: nonNegativeCentsSchema,
      })
      .passthrough(),
    funding: z
      .object({
        grossLiquidationCents: nonNegativeCentsSchema,
        liquidationCostCents: nonNegativeCentsSchema,
        netLiquidationProceedsCents: nonNegativeCentsSchema,
        creditDrawnCents: nonNegativeCentsSchema,
      })
      .passthrough()
      .nullable(),
    recurringAllocations: z
      .object({
        grossSalaryCents: nonNegativeCentsSchema,
        afterTaxDiscretionaryCents: nonNegativeCentsSchema,
        preTax: z
          .object({
            employee401kCents: nonNegativeCentsSchema,
            employer401kMatchCents: nonNegativeCentsSchema,
            hsaCents: nonNegativeCentsSchema,
          })
          .strict(),
        afterTax: z
          .object({
            broadIndexCents: nonNegativeCentsSchema,
            sectorCents: nonNegativeCentsSchema,
            speculativeCents: nonNegativeCentsSchema,
            iraCents: nonNegativeCentsSchema,
            extraDebtPayments: z.array(
              z
                .object({
                  debtId: identifierSchema,
                  amountCents: nonNegativeCentsSchema,
                })
                .strict(),
            ),
          })
          .strict(),
        unallocatedAfterTaxCents: nonNegativeCentsSchema,
      })
      .strict()
      .nullable(),
    outcome: z
      .object({
        kind: z.enum(["financial_independence", "retirement_age", "bankruptcy"]),
        grade: z.enum(["S", "A", "B", "C", "D", "E", "F"]),
        reachedMonth: simulationMonthSchema,
        reasonCode: identifierSchema,
      })
      .strict()
      .nullable(),
  })
  .strict();

export const getRunV2ResponseSchema = z
  .object({ state: gameStateV2WireSchema, stateChecksum: checksumSchema })
  .strict();

export const createRunV2ResponseSchema = getRunV2ResponseSchema
  .extend({
    runId: z.uuid(),
    accessSecret: z.string().regex(/^lf_run_[A-Za-z0-9_-]{43}$/),
  })
  .strict();

export const commandV2ResponseSchema = getRunV2ResponseSchema
  .extend({
    idempotentReplay: z.boolean(),
    monthlyRecord: monthlyRecordSummarySchema.nullable(),
  })
  .strict();

export const checkpointV2QuerySchema = z
  .object({ fromRevision: z.coerce.number().int().min(0) })
  .strict();

const exposureSnapshotV2Schema = z
  .object({
    month: simulationMonthSchema,
    scorePpm: z.int().min(1_000_000).max(3_000_000),
    emergencyFundMonthsPpm: z.int().min(0).max(12_000_000),
    debtToIncomePpm: z.int().min(0).nullable(),
    revolvingDebtPpm: boundedRatePpmSchema,
    insuranceGapPpm: boundedRatePpmSchema.nullable(),
    portfolioConcentrationPpm: boundedRatePpmSchema,
    jobInvestmentCorrelationPpm: boundedRatePpmSchema.nullable(),
  })
  .strict();

const checkpointSnapshotV2Schema = z
  .object({
    month: simulationMonthSchema,
    ageYears: z.int().min(0),
    cashCents: nonNegativeCentsSchema,
    investableAssetsCents: nonNegativeCentsSchema,
    liabilitiesCents: nonNegativeCentsSchema,
    netWorthCents: z.int(),
    annualLivingCostCents: nonNegativeCentsSchema,
    financialIndependenceTargetCents: nonNegativeCentsSchema,
    financialIndependenceProgressPpm: boundedRatePpmSchema,
    exposure: exposureSnapshotV2Schema.nullable(),
  })
  .strict();

const resolvedEventEvidenceV2Schema = z
  .object({
    commandId: commandIdSchema,
    resultingRevision: z.int().min(1),
    eventId: identifierSchema,
    templateId: identifierSchema,
    templateVersion: z.int().min(1),
    tier: z.enum(["micro", "medium", "large", "catastrophe"]),
    targetedWeakness: z.enum([
      "low_emergency_fund",
      "high_credit_utilization",
      "job_portfolio_correlation",
      "portfolio_concentration",
      "uninsured_property",
      "high_fixed_costs",
      "lifestyle_fragility",
      "market_timing",
    ]),
    parameters: z.record(z.string().min(1), z.int()),
    choiceId: identifierSchema,
    availableChoiceIds: z.array(identifierSchema).min(1),
    scheduledMonth: simulationMonthSchema,
    resolvedMonth: simulationMonthSchema,
    playerCostCents: nonNegativeCentsSchema,
    insurerCostCents: nonNegativeCentsSchema,
  })
  .strict();

const checkpointEvidenceV2Schema = z
  .object({
    evidenceVersion: z.literal("checkpoint-v2.1"),
    start: checkpointSnapshotV2Schema,
    end: checkpointSnapshotV2Schema,
    monthsProcessed: z.int().min(0).max(12),
    monthlyCommandIds: z.array(commandIdSchema).max(12),
    taxTraceIds: z.array(identifierSchema).max(12),
    totalGrossIncomeCents: z.int(),
    totalTaxCents: z.int(),
    totalAfterTaxCashIncomeCents: z.int(),
    totalRequiredCashCents: nonNegativeCentsSchema,
    totalMarketValueChangeCents: z.int(),
    totalInflationIncreaseCents: z.int(),
    totalInsurancePlayerCostCents: nonNegativeCentsSchema,
    totalDebtInterestCents: nonNegativeCentsSchema,
    totalDebtPaymentsCents: nonNegativeCentsSchema,
    totalLiquidationCostCents: nonNegativeCentsSchema,
    netWorthChangeCents: z.int(),
    investableAssetsChangeCents: z.int(),
    liabilitiesChangeCents: z.int(),
    eventChoices: z.array(resolvedEventEvidenceV2Schema),
  })
  .strict()
  .refine(
    (value) =>
      value.monthlyCommandIds.length === value.monthsProcessed &&
      value.taxTraceIds.length === value.monthsProcessed,
    { message: "checkpoint record identifiers must match processed month count" },
  );

export const checkpointV2ResponseSchema = z
  .object({ evidence: checkpointEvidenceV2Schema })
  .strict();

export { runIdPathSchema as runIdV2PathSchema };

export type CreateRunV2Request = z.infer<typeof createRunV2RequestSchema>;
export type CreateRunV2Response = z.infer<typeof createRunV2ResponseSchema>;
export type GameCommandV2Public = z.infer<typeof gameCommandV2PublicSchema>;
export type GetRunV2Response = z.infer<typeof getRunV2ResponseSchema>;
export type CommandV2Response = z.infer<typeof commandV2ResponseSchema>;
export type CheckpointV2Response = z.infer<typeof checkpointV2ResponseSchema>;
