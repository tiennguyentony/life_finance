import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import type { GameStateV2 } from "../../core/game-state-v2";
import { moneyCents, ratePpm } from "../../core/domain/money";
import { simulationMonth } from "../../core/domain/month";
import { decodePersistedGameState } from "../../core/persisted-game-state";
import { US_2026_SCENARIO_CATALOG_VERSION } from "../../data/scenario-catalog";
import {
  boundedRatePpmSchema,
  checksumSchema,
  identifierSchema,
  journalTransactionSchema,
  marketRegimeSchema,
  nonNegativeCentsSchema,
  ratePpmSchema,
  runIdPathSchema,
  signedCentsSchema,
  simulationMonthSchema,
} from "./contracts";

extendZodWithOpenApi(z);

const commandIdSchema = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,95}$/);

const brandedSimulationMonthSchema = simulationMonthSchema.transform(
  simulationMonth,
);
const brandedMoneyCentsSchema = signedCentsSchema.transform(moneyCents);
const brandedNonNegativeMoneyCentsSchema = nonNegativeCentsSchema.transform(
  moneyCents,
);
const brandedBoundedRatePpmSchema = boundedRatePpmSchema.transform(ratePpm);

const rateGroupSchema = z
  .object({
    emergencyFundTargetMonthsPpm: z.int().min(0).max(24_000_000).optional(),
    insuranceCoverageIds: z
      .array(identifierSchema)
      .max(16)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "insurance coverage IDs must be unique",
      })
      .optional(),
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
      liquidationCostRatePpm: boundedRatePpmSchema.optional(),
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

export const playerPolicyPreviewV2RequestSchema = z.discriminatedUnion(
  "type",
  [setStrategyV2CommandSchema, detailedActionV2CommandSchema],
);

const monthlyMarketEvidenceSchema = z
  .object({
    modelVersion: z.literal("regime-v1"),
    regime: marketRegimeSchema,
    nextRegime: marketRegimeSchema,
    equityReturnPpm: ratePpmSchema,
    bondReturnPpm: ratePpmSchema,
    cashReturnPpm: ratePpmSchema,
    housingReturnPpm: ratePpmSchema,
    inflationPpm: ratePpmSchema,
    laborDemandChangePpm: ratePpmSchema,
    appliedReturnModifiersPpm: z
      .object({
        equity: ratePpmSchema,
        bonds: ratePpmSchema,
        cash: ratePpmSchema,
        housing: ratePpmSchema,
      })
      .strict(),
    shocks: z
      .object({
        macro: z.int().min(-2).max(2),
        equityIdiosyncratic: z.int().min(-2).max(2),
        bondIdiosyncratic: z.int().min(-2).max(2),
        housingIdiosyncratic: z.int().min(-2).max(2),
      })
      .strict(),
  })
  .strict();

const debtServiceLineSchema = z
  .object({
    debtId: identifierSchema,
    openingPrincipalCents: nonNegativeCentsSchema,
    interestCents: nonNegativeCentsSchema,
    scheduledPaymentCents: nonNegativeCentsSchema,
    principalPaidCents: nonNegativeCentsSchema,
    closingPrincipalCents: nonNegativeCentsSchema,
    closingMinimumPaymentCents: nonNegativeCentsSchema,
    closingRemainingTermMonths: z.int().min(0).max(1_200),
  })
  .strict();

const debtServiceEvidenceSchema = z
  .object({
    lines: z.array(debtServiceLineSchema).max(32),
    totalInterestCents: nonNegativeCentsSchema,
    totalScheduledPaymentCents: nonNegativeCentsSchema,
  })
  .strict();

const taxableBucketSchema = z.enum([
  "taxableLegacyUnclassifiedCents",
  "taxableSpeculativeCents",
  "taxableSectorCents",
  "taxableBroadIndexCents",
]);

const taxableLiquidationSchema = z
  .object({
    bucket: taxableBucketSchema,
    grossCents: nonNegativeCentsSchema,
    costCents: nonNegativeCentsSchema,
    netCents: nonNegativeCentsSchema,
  })
  .strict();

const fundingPlanSchema = z
  .object({
    requiredCashCents: nonNegativeCentsSchema,
    cashAvailableCents: nonNegativeCentsSchema,
    cashUsedCents: nonNegativeCentsSchema,
    taxableLiquidations: z.array(taxableLiquidationSchema).max(4),
    grossLiquidationCents: nonNegativeCentsSchema,
    liquidationCostCents: nonNegativeCentsSchema,
    netLiquidationProceedsCents: nonNegativeCentsSchema,
    remainingCreditCents: nonNegativeCentsSchema,
    creditUsedCents: nonNegativeCentsSchema,
    residualShortfallCents: nonNegativeCentsSchema,
    fullyFunded: z.boolean(),
  })
  .strict();

const fundingRecordSchema = z
  .object({
    grossLiquidationCents: nonNegativeCentsSchema,
    liquidationCostCents: nonNegativeCentsSchema,
    netLiquidationProceedsCents: nonNegativeCentsSchema,
    creditDrawnCents: nonNegativeCentsSchema,
    liquidatedBuckets: z
      .object({
        taxableLegacyUnclassifiedCents: nonNegativeCentsSchema,
        taxableSpeculativeCents: nonNegativeCentsSchema,
        taxableSectorCents: nonNegativeCentsSchema,
        taxableBroadIndexCents: nonNegativeCentsSchema,
      })
      .strict(),
  })
  .strict();

const recurringAllocationEvidenceSchema = z
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
        extraDebtPayments: z
          .array(
            z
              .object({
                debtId: identifierSchema,
                amountCents: nonNegativeCentsSchema,
              })
              .strict(),
          )
          .max(32),
      })
      .strict(),
    unallocatedAfterTaxCents: nonNegativeCentsSchema,
  })
  .strict();

const outcomeKindV2Schema = z.enum([
  "financial_independence",
  "retirement_age",
  "bankruptcy",
]);
const finalGradeV2Schema = z.enum(["S", "A", "B", "C", "D", "E", "F"]);
const retirementGradeV2Schema = z.enum(["A", "B", "C", "D", "E"]);
const legacyGameOutcomeV2Schema = z
  .object({
    kind: outcomeKindV2Schema,
    grade: finalGradeV2Schema,
    reachedMonth: brandedSimulationMonthSchema,
    reasonCode: z.string().trim().min(1).max(128),
  })
  .strict();

const richOutcomeEvidenceShape = {
  outcomePolicyVersion: z.literal("1.0.0"),
  reachedMonth: brandedSimulationMonthSchema,
  financialIndependence: z
    .object({
      goalSource: z.enum(["player_selected", "current_lifestyle_default"]),
      investableAssetsCents: brandedNonNegativeMoneyCentsSchema,
      targetCents: brandedNonNegativeMoneyCentsSchema.refine(
        (value) => value > 0,
      ),
      progressPpm: brandedBoundedRatePpmSchema,
    })
    .strict(),
  displayedNetWorthCents: brandedMoneyCentsSchema,
  automaticLiquidSolvency: z
    .object({
      requiredCashCents: brandedNonNegativeMoneyCentsSchema,
      automaticLiquidityCents: brandedNonNegativeMoneyCentsSchema,
      residualShortfallCents: brandedNonNegativeMoneyCentsSchema,
      isSolvent: z.boolean(),
    })
    .strict(),
  retirementReadiness: z
    .object({
      retirementAgeYears: z.int().min(18).max(120),
      currentAgeYears: z.int().min(0),
      reachedRetirementAge: z.boolean(),
      gradeIfRetiredNow: retirementGradeV2Schema,
    })
    .strict(),
} as const;

const deterministicGameOutcomeV1Schema = z
  .discriminatedUnion("kind", [
    z
      .object({
        ...richOutcomeEvidenceShape,
        kind: z.literal("bankruptcy"),
        grade: z.literal("F"),
        reasonCode: z.literal("actual_required_obligation_shortfall"),
        reasonCodes: z.tuple([
          z.literal("actual_required_obligation_shortfall"),
          z.literal("automatic_liquidity_exhausted"),
        ]),
      })
      .strict(),
    z
      .object({
        ...richOutcomeEvidenceShape,
        kind: z.literal("financial_independence"),
        grade: z.literal("S"),
        reasonCode: z.literal("financial_independence_target_reached"),
        reasonCodes: z.tuple([
          z.literal("financial_independence_target_reached"),
        ]),
      })
      .strict(),
    z
      .object({
        ...richOutcomeEvidenceShape,
        kind: z.literal("retirement_age"),
        grade: retirementGradeV2Schema,
        reasonCode: z.literal("configured_retirement_age_reached"),
        reasonCodes: z.tuple([
          z.literal("configured_retirement_age_reached"),
          z.literal("financial_independence_target_not_reached"),
        ]),
      })
      .strict(),
  ])
  .superRefine((outcome, context) => {
    const solvency = outcome.automaticLiquidSolvency;
    const retirement = outcome.retirementReadiness;
    if (solvency.isSolvent !== (solvency.residualShortfallCents === 0)) {
      context.addIssue({
        code: "custom",
        path: ["automaticLiquidSolvency", "isSolvent"],
        message: "solvency flag must match the residual shortfall",
      });
    }
    if (
      retirement.reachedRetirementAge !==
      (retirement.currentAgeYears >= retirement.retirementAgeYears)
    ) {
      context.addIssue({
        code: "custom",
        path: ["retirementReadiness", "reachedRetirementAge"],
        message: "retirement-age flag must match the supplied ages",
      });
    }
    if (outcome.kind === "bankruptcy" && solvency.isSolvent) {
      context.addIssue({
        code: "custom",
        path: ["automaticLiquidSolvency", "isSolvent"],
        message: "bankruptcy requires an actual automatic-liquidity shortfall",
      });
    }
    if (
      outcome.kind === "bankruptcy" &&
      (solvency.residualShortfallCents > solvency.requiredCashCents ||
        solvency.requiredCashCents - solvency.residualShortfallCents !==
          solvency.automaticLiquidityCents)
    ) {
      context.addIssue({
        code: "custom",
        path: ["automaticLiquidSolvency", "automaticLiquidityCents"],
        message:
          "bankruptcy liquidity plus residual shortfall must equal required cash",
      });
    }
    if (outcome.kind !== "bankruptcy" && !solvency.isSolvent) {
      context.addIssue({
        code: "custom",
        path: ["automaticLiquidSolvency", "isSolvent"],
        message: "non-bankruptcy terminal outcomes require current solvency",
      });
    }
    if (
      outcome.kind === "financial_independence" &&
      outcome.financialIndependence.progressPpm !== 1_000_000
    ) {
      context.addIssue({
        code: "custom",
        path: ["financialIndependence", "progressPpm"],
        message: "financial independence requires 100% goal progress",
      });
    }
    if (outcome.kind === "retirement_age") {
      if (outcome.financialIndependence.progressPpm === 1_000_000) {
        context.addIssue({
          code: "custom",
          path: ["financialIndependence", "progressPpm"],
          message: "retirement outcome requires FI to remain below its target",
        });
      }
      if (!retirement.reachedRetirementAge) {
        context.addIssue({
          code: "custom",
          path: ["retirementReadiness", "reachedRetirementAge"],
          message: "retirement outcome requires reaching retirement age",
        });
      }
      if (outcome.grade !== retirement.gradeIfRetiredNow) {
        context.addIssue({
          code: "custom",
          path: ["grade"],
          message: "retirement grade must match deterministic readiness evidence",
        });
      }
    }
  });

const gameOutcomeV2Schema = z.union([
  deterministicGameOutcomeV1Schema,
  legacyGameOutcomeV2Schema,
]);

const legacyMonthlyRecordSummarySchema = z
  .object({
    processedMonth: simulationMonthSchema,
    nextMonth: simulationMonthSchema,
    taxTraceId: identifierSchema,
    grossIncomeCents: nonNegativeCentsSchema,
    totalTaxCents: signedCentsSchema,
    afterTaxCashIncomeCents: nonNegativeCentsSchema,
    market: monthlyMarketEvidenceSchema,
    marketValueChangeCents: signedCentsSchema,
    annualInflationIncreaseCents: signedCentsSchema,
    insurancePlayerCostCents: nonNegativeCentsSchema,
    requiredCashCents: nonNegativeCentsSchema,
    nonDebtObligationsPaidCents: nonNegativeCentsSchema,
    debtService: debtServiceEvidenceSchema,
    funding: fundingRecordSchema.nullable(),
    recurringAllocations: recurringAllocationEvidenceSchema.nullable(),
    outcome: gameOutcomeV2Schema.nullable(),
  })
  .strict();

const financialShortfallSchema = z
  .object({
    requiredCashCents: nonNegativeCentsSchema,
    residualShortfallCents: nonNegativeCentsSchema,
    fundingPlan: fundingPlanSchema,
    netWorthCents: signedCentsSchema,
    automaticLiquidityCents: nonNegativeCentsSchema,
  })
  .strict();

const financialKernelMonthlyRecordSummarySchema =
  legacyMonthlyRecordSummarySchema
    .extend({
      financialKernelVersion: z.literal("2.0.0"),
      outcomePolicyVersion: z.literal("1.0.0").optional(),
      openingNetWorthCents: signedCentsSchema,
      closingNetWorthCents: signedCentsSchema,
      openingAutomaticLiquidityCents: nonNegativeCentsSchema,
      closingAutomaticLiquidityCents: nonNegativeCentsSchema,
      resolvedIncomeCents: nonNegativeCentsSchema,
      resolvedExpenseCents: nonNegativeCentsSchema,
      monthlyObligationInflationIncreaseCents: signedCentsSchema,
      cumulativePriceIndexPpm: z.int().min(1).max(Number.MAX_SAFE_INTEGER),
      baseNonDebtObligationsCents: nonNegativeCentsSchema,
      fundingPlan: fundingPlanSchema,
      shortfall: financialShortfallSchema.nullable(),
    })
    .strict();

const monthlyRecordSummarySchema = z.union([
  financialKernelMonthlyRecordSummarySchema,
  legacyMonthlyRecordSummarySchema,
]);

export const getRunV2ResponseSchema = z
  .object({ state: gameStateV2WireSchema, stateChecksum: checksumSchema })
  .strict();

export const migrateRunV2ResponseSchema = getRunV2ResponseSchema
  .extend({ idempotentReplay: z.boolean() })
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

const recurringStrategyPreviewSchema = z
  .object({
    effectiveMonth: simulationMonthSchema,
    emergencyFundTargetMonthsPpm: z.int().min(0).max(24_000_000).optional(),
    insuranceCoverageIds: z.array(identifierSchema).max(16).optional(),
    preTax401kSalaryRatePpm: boundedRatePpmSchema,
    preTaxHsaSalaryRatePpm: boundedRatePpmSchema,
    afterTaxBroadIndexRatePpm: boundedRatePpmSchema,
    afterTaxSectorRatePpm: boundedRatePpmSchema,
    afterTaxSpeculativeRatePpm: boundedRatePpmSchema,
    afterTaxIraRatePpm: boundedRatePpmSchema,
    afterTaxExtraDebtRatePpm: boundedRatePpmSchema,
  })
  .strict();

const actionPreviewPolicyChangeV2Schema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("annual_living_cost"),
      effectiveMonth: simulationMonthSchema,
      previousAnnualLivingCostCents: nonNegativeCentsSchema,
      resultingAnnualLivingCostCents: nonNegativeCentsSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("recurring_strategy"),
      effectiveMonth: simulationMonthSchema,
      previous: recurringStrategyPreviewSchema,
      resulting: recurringStrategyPreviewSchema,
    })
    .strict(),
]);

export const playerPolicyPreviewV2ResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    commandType: z.enum(["take_detailed_action", "set_recurring_strategy"]),
    actionPolicyVersion: z.literal("1.0.0").nullable(),
    commandChecksum: checksumSchema,
    openingStateChecksum: checksumSchema,
    resultingStateChecksum: checksumSchema,
    openingRevision: z.int().min(0),
    resultingRevision: z.int().min(1),
    effects: z
      .object({
        cashChangeCents: signedCentsSchema,
        automaticLiquidityChangeCents: signedCentsSchema,
        termDebtPrincipalChangeCents: signedCentsSchema,
        revolvingCreditUsedChangeCents: signedCentsSchema,
        annualLivingCostChangeCents: signedCentsSchema,
        requiredObligationsChangeCents: signedCentsSchema,
      })
      .strict(),
    policyChanges: z.array(actionPreviewPolicyChangeV2Schema).max(8),
    appendedLedgerTransactionIds: z.array(identifierSchema).max(64),
    appendedLedgerTransactions: z.array(journalTransactionSchema).max(64),
  })
  .strict()
  .superRefine((preview, context) => {
    if (preview.resultingRevision !== preview.openingRevision + 1) {
      context.addIssue({
        code: "custom",
        path: ["resultingRevision"],
        message: "a preview must represent exactly one command revision",
      });
    }
    if (
      (preview.commandType === "take_detailed_action" &&
        preview.actionPolicyVersion !== "1.0.0") ||
      (preview.commandType === "set_recurring_strategy" &&
        preview.actionPolicyVersion !== null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["actionPolicyVersion"],
        message: "action policy ownership must match the previewed command type",
      });
    }
    const transactionIds = preview.appendedLedgerTransactions.map(
      ({ id }) => id,
    );
    if (
      transactionIds.length !== preview.appendedLedgerTransactionIds.length ||
      transactionIds.some(
        (id, index) => id !== preview.appendedLedgerTransactionIds[index],
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["appendedLedgerTransactionIds"],
        message: "transaction IDs must exactly match appended ledger evidence",
      });
    }
  });

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
      "unrelated_hazard",
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

const timeAdvanceModeV2Schema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("one_month") }).strict(),
    z
      .object({ kind: z.literal("months"), months: z.int().min(1).max(480) })
      .strict(),
    z.object({ kind: z.literal("until_event") }).strict(),
    z
      .object({
        kind: z.literal("until_checkpoint"),
        intervalMonths: z.int().min(1).max(12),
      })
      .strict(),
    z.object({ kind: z.literal("until_decision") }).strict(),
    z.object({ kind: z.literal("until_end") }).strict(),
    z
      .object({
        kind: z.literal("resume"),
        resolvedDecisionId: commandIdSchema,
        months: z.int().min(1).max(480),
      })
      .strict(),
    z.object({ kind: z.literal("stop") }).strict(),
]);

export const advanceTimeV2RequestSchema = z
  .object({
    schemaVersion: z.literal(2),
    id: commandIdSchema,
    expectedRevision: z.int().min(0),
    effectiveMonth: simulationMonthSchema,
    maxMonths: z.int().min(1).max(480),
    mode: timeAdvanceModeV2Schema,
    checkpointIntervalMonths: z.int().min(1).max(12).optional(),
  })
  .strict()
  .superRefine((request, context) => {
    const requested =
      request.mode.kind === "months" || request.mode.kind === "resume"
        ? request.mode.months
        : null;
    if (requested !== null && requested > request.maxMonths) {
      context.addIssue({
        code: "custom",
        path: ["mode", "months"],
        message: "requested months cannot exceed maxMonths",
      });
    }
    if (
      request.mode.kind === "until_checkpoint" &&
      request.checkpointIntervalMonths !== undefined &&
      request.checkpointIntervalMonths !== request.mode.intervalMonths
    ) {
      context.addIssue({
        code: "custom",
        path: ["checkpointIntervalMonths"],
        message: "checkpoint intervals must agree",
      });
    }
  });

const pauseReasonV2Schema = z.discriminatedUnion(
  "kind",
  [
    z
      .object({
        kind: z.literal("requested_duration"),
        requestedMonths: z.int().min(1).max(480),
      })
      .strict(),
    z
      .object({
        kind: z.literal("periodic_checkpoint"),
        checkpointMonth: brandedSimulationMonthSchema,
      })
      .strict(),
    z
      .object({ kind: z.literal("event_response"), eventId: identifierSchema })
      .strict(),
    z
      .object({
        kind: z.literal("policy_decision"),
        decisionKind: z.literal("life_milestone"),
      })
      .strict(),
    z
      .object({
        kind: z.literal("financial_warning"),
        warning: z
          .object({
            kind: z.literal("monthly_cash_flow_deficit"),
            cashFlowDeficitCents: nonNegativeCentsSchema.transform(moneyCents),
          })
          .strict(),
      })
      .strict(),
    z.object({ kind: z.literal("financial_independence") }).strict(),
    z.object({ kind: z.literal("retirement") }).strict(),
    z.object({ kind: z.literal("bankruptcy") }).strict(),
    z.object({ kind: z.literal("explicit_user_stop") }).strict(),
    z
      .object({
        kind: z.literal("bounded_limit"),
        maxMonths: z.int().min(1).max(480),
      })
      .strict(),
  ],
);

const timeControllerUiChangesV2Schema = z
  .object({
    kind: z.literal("time_advance_summary_v2"),
    fromMonth: brandedSimulationMonthSchema,
    toMonth: brandedSimulationMonthSchema,
    monthsAdvanced: z.int().min(0).max(480),
    pauseKind: z.enum([
      "requested_duration",
      "periodic_checkpoint",
      "event_response",
      "policy_decision",
      "financial_warning",
      "financial_independence",
      "retirement",
      "bankruptcy",
      "explicit_user_stop",
      "bounded_limit",
    ]),
    cashChangeCents: brandedMoneyCentsSchema,
    netWorthChangeCents: brandedMoneyCentsSchema,
    totalGrossIncomeCents: brandedMoneyCentsSchema,
    totalTaxCents: brandedMoneyCentsSchema,
    totalAfterTaxCashIncomeCents: brandedMoneyCentsSchema,
    totalRequiredCashCents: brandedMoneyCentsSchema,
    totalMarketValueChangeCents: brandedMoneyCentsSchema,
  })
  .strict();

const eventWeaknessV2Schema = z.enum([
  "low_emergency_fund",
  "high_credit_utilization",
  "job_portfolio_correlation",
  "portfolio_concentration",
  "uninsured_property",
  "high_fixed_costs",
  "lifestyle_fragility",
  "market_timing",
  "unrelated_hazard",
]);

const pendingEventV2Schema = z
  .object({
    eventId: identifierSchema,
    templateId: identifierSchema,
    templateVersion: z.int().min(1),
    tier: z.enum(["micro", "medium", "large", "catastrophe"]),
    targetedWeakness: eventWeaknessV2Schema,
    parameters: z.record(z.string().min(1), z.int()),
    choiceIds: z
      .array(identifierSchema)
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length),
    scheduledMonth: brandedSimulationMonthSchema,
    expiresMonth: brandedSimulationMonthSchema,
    aiNarrative: z
      .object({
        source: z.enum([
          "openai",
          "hosted_oss",
          "local_oss",
          "deterministic_fallback",
        ]),
        headline: z.string().trim().min(1).max(240),
        narrative: z.string().trim().min(1).max(2_000),
        rationale: z.string().trim().min(1).max(800),
        citedEvidenceIds: z
          .array(identifierSchema)
          .refine((ids) => new Set(ids).size === ids.length),
      })
      .strict()
      .optional(),
  })
  .strict();

const scheduledLifeMilestoneV1Schema = z
  .object({
    version: z.literal("life-milestone-v1"),
    milestoneId: identifierSchema,
    kind: z.enum([
      "move",
      "vehicle",
      "wedding",
      "child",
      "education",
      "travel",
      "caregiving",
      "custom",
    ]),
    label: z.string().trim().min(1).max(80),
    targetMonth: brandedSimulationMonthSchema,
    estimatedCostCents: brandedNonNegativeMoneyCentsSchema.refine(
      (value) => value > 0,
    ),
    postponementCount: z.int().min(0),
    createdMonth: brandedSimulationMonthSchema,
  })
  .strict();

const pendingDecisionV2Schema = z
  .object({
    kind: z.literal("life_milestone"),
    milestones: z.array(scheduledLifeMilestoneV1Schema).min(1).max(12),
  })
  .strict();

export const advanceTimeV2ResponseSchema = getRunV2ResponseSchema
  .extend({
    idempotentReplay: z.boolean(),
    monthsAdvanced: z.int().min(0).max(480),
    pauseReason: pauseReasonV2Schema,
    pendingEvent: pendingEventV2Schema.nullable(),
    pendingDecision: pendingDecisionV2Schema.nullable(),
    checkpointInput: checkpointEvidenceV2Schema.nullable(),
    endCondition: gameOutcomeV2Schema.nullable(),
    uiChanges: timeControllerUiChangesV2Schema,
  })
  .strict();

export { runIdPathSchema as runIdV2PathSchema };

export type CreateRunV2Request = z.infer<typeof createRunV2RequestSchema>;
export type CreateRunV2Response = z.infer<typeof createRunV2ResponseSchema>;
export type GameCommandV2Public = z.infer<typeof gameCommandV2PublicSchema>;
export type GetRunV2Response = z.infer<typeof getRunV2ResponseSchema>;
export type MigrateRunV2Response = z.infer<typeof migrateRunV2ResponseSchema>;
export type CommandV2Response = z.infer<typeof commandV2ResponseSchema>;
export type PlayerPolicyPreviewV2Request = z.infer<
  typeof playerPolicyPreviewV2RequestSchema
>;
export type PlayerPolicyPreviewV2Response = z.infer<
  typeof playerPolicyPreviewV2ResponseSchema
>;
export type CheckpointV2Response = z.infer<typeof checkpointV2ResponseSchema>;
export type AdvanceTimeV2Request = z.infer<typeof advanceTimeV2RequestSchema>;
export type AdvanceTimeV2Response = z.infer<typeof advanceTimeV2ResponseSchema>;
