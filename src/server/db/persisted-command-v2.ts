import { z } from "zod";

import {
  ACTION_POLICY_V1_VERSION,
  actionPolicyForVersionV2,
} from "../../core/action-policy-v2";
import { simulationMonth } from "../../core/domain/month";
import type { GameCommandV2 } from "./run-repository-contracts";

const identifierSchema = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/);
const monthlyCommandIdSchema = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,95}$/);
const resolvedCashFlowIdentifierSchema = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/);
const simulationMonthSchema = z
  .string()
  .regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/);
const nonNegativeCentsSchema = z.int().min(0);
const positiveCentsSchema = nonNegativeCentsSchema.min(1);
const boundedRatePpmSchema = z.int().min(0).max(1_000_000);

const v2EnvelopeSchema = z.object({
  schemaVersion: z.literal(2),
  id: identifierSchema,
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
      amountCents: positiveCentsSchema,
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
      amountCents: positiveCentsSchema,
      liquidationCostRatePpm: boundedRatePpmSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("contribute_ira"),
      amountCents: positiveCentsSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("contribute_hsa"),
      amountCents: positiveCentsSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("pay_term_debt"),
      debtId: identifierSchema,
      amountCents: positiveCentsSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("pay_revolving_credit"),
      amountCents: positiveCentsSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("draw_revolving_credit"),
      amountCents: positiveCentsSchema,
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
      amountCents: positiveCentsSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("purchase_home"),
      purchasePriceCents: positiveCentsSchema,
      downPaymentCents: nonNegativeCentsSchema,
      mortgageAnnualInterestRatePpm: boundedRatePpmSchema.max(500_000),
      mortgageTermMonths: z.int().min(12).max(480),
    })
    .strict()
    .refine(
      ({ downPaymentCents, purchasePriceCents }) =>
        downPaymentCents <= purchasePriceCents,
      {
        path: ["downPaymentCents"],
        message: "down payment cannot exceed purchase price",
      },
    ),
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

const recurringStrategySchema = z
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
      strategy.preTax401kSalaryRatePpm +
        strategy.preTaxHsaSalaryRatePpm >
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

const milestonePayloadSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("schedule"),
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
      label: z
        .string()
        .max(80)
        .refine((value) => value.trim().length > 0),
      targetMonth: simulationMonthSchema,
      estimatedCostCents: positiveCentsSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("resolve"),
      milestoneId: identifierSchema,
      resolution: z.enum(["pay_cash", "postpone_6_months", "cancel"]),
    })
    .strict(),
]);

const taxEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    traceId: identifierSchema,
    contextFingerprint: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    economicYear: z.int(),
    policyYear: z.int(),
    stateCode: z.string().min(1),
    filingStatus: z.string().min(1),
    provider: z.literal("PolicyEngine US"),
    bundleVersion: z.string().min(1),
    rulesVersion: z.string().min(1),
    projectedFromFrozenPolicy: z.boolean(),
    grossIncomeCents: nonNegativeCentsSchema,
    employee401kContributionCents: nonNegativeCentsSchema,
    employeeHsaContributionCents: nonNegativeCentsSchema,
    totalTaxCents: z.int(),
    afterTaxCashIncomeCents: nonNegativeCentsSchema,
  })
  .strict()
  .superRefine((evidence, context) => {
    const expectedCash =
      BigInt(evidence.grossIncomeCents) -
      BigInt(evidence.employee401kContributionCents) -
      BigInt(evidence.employeeHsaContributionCents) -
      BigInt(evidence.totalTaxCents);
    if (
      expectedCash < BigInt(0) ||
      expectedCash !== BigInt(evidence.afterTaxCashIncomeCents)
    ) {
      context.addIssue({
        code: "custom",
        path: ["afterTaxCashIncomeCents"],
        message:
          "after-tax cash must equal gross less contributions and modeled tax",
      });
    }
  });

const insuranceClaimSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("health"),
      grossAmountCents: positiveCentsSchema,
      covered: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("selected_coverage"),
      coverageId: identifierSchema,
      grossAmountCents: positiveCentsSchema,
      eligible: z.boolean(),
    })
    .strict(),
]);

const resolvedCashFlowSchema = z
  .object({
    id: resolvedCashFlowIdentifierSchema,
    kind: z.enum([
      "other_income",
      "recurring_expense",
      "temporary_income",
      "temporary_expense",
    ]),
    amountCents: nonNegativeCentsSchema,
    sourceSystem: resolvedCashFlowIdentifierSchema,
  })
  .strict();

const resolvedCashFlowsSchema = z
  .array(resolvedCashFlowSchema)
  .max(64)
  .refine(
    (flows) => new Set(flows.map(({ id }) => id)).size === flows.length,
    { message: "resolved cash-flow IDs must be unique" },
  );

const textSchema = (maximum: number) =>
  z
    .string()
    .max(maximum)
    .refine((value) => value.trim().length > 0);

const persistedDetailedActionCommandV2Schema = v2EnvelopeSchema
  .extend({
    type: z.literal("take_detailed_action"),
    payload: z
      .object({
        action: detailedActionSchema,
        actionPolicyVersion: z.literal(ACTION_POLICY_V1_VERSION).optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((command, context) => {
    if (
      command.payload.actionPolicyVersion === ACTION_POLICY_V1_VERSION &&
      command.payload.action.type === "liquidate_taxable" &&
      command.payload.action.liquidationCostRatePpm !==
        actionPolicyForVersionV2(ACTION_POLICY_V1_VERSION)
          .taxableLiquidationCostRatePpm
    ) {
      context.addIssue({
        code: "custom",
        path: ["payload", "action", "liquidationCostRatePpm"],
        message:
          "versioned liquidation cost must match the frozen action policy",
      });
    }
  });

const persistedGameCommandV2Schema = z.discriminatedUnion("type", [
  persistedDetailedActionCommandV2Schema,
  v2EnvelopeSchema
    .extend({
      type: z.literal("set_recurring_strategy"),
      payload: z.object({ strategy: recurringStrategySchema }).strict(),
    })
    .strict(),
  v2EnvelopeSchema
    .extend({
      type: z.literal("resolve_event_choice"),
      payload: z
        .object({ eventId: identifierSchema, choiceId: identifierSchema })
        .strict(),
    })
    .strict(),
  v2EnvelopeSchema
    .extend({
      type: z.literal("manage_life_milestone"),
      payload: milestonePayloadSchema,
    })
    .strict(),
  v2EnvelopeSchema
    .extend({
      type: z.literal("record_learning_interaction_v2"),
      payload: z
        .object({
          conceptId: identifierSchema,
          kind: z.enum([
            "glossary",
            "ai_explanation",
            "decision_feedback",
            "debrief",
          ]),
        })
        .strict(),
    })
    .strict(),
  v2EnvelopeSchema
    .extend({
      type: z.literal("queue_ai_world_event_v2"),
      payload: z
        .object({
          source: z.enum([
            "openai",
            "hosted_oss",
            "local_oss",
            "deterministic_fallback",
          ]),
          templateId: identifierSchema,
          templateVersion: z.int().min(1),
          targetedWeaknessId: z.enum([
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
          headline: textSchema(240),
          narrative: textSchema(2_000),
          rationale: textSchema(800),
          citedEvidenceIds: z
            .array(identifierSchema)
            .min(1)
            .max(8)
            .refine((ids) => new Set(ids).size === ids.length),
        })
        .strict(),
    })
    .strict(),
  v2EnvelopeSchema
    .extend({
      id: monthlyCommandIdSchema,
      type: z.literal("process_month_v2"),
      payload: z
        .object({
          financialKernelVersion: z
            .enum(["legacy-4.1.0", "2.0.0"])
            .optional(),
          outcomePolicyVersion: z.literal("1.0.0").optional(),
          taxEvidence: taxEvidenceSchema,
          taxableLiquidationCostRatePpm: boundedRatePpmSchema,
          insuranceClaim: insuranceClaimSchema.optional(),
          resolvedCashFlows: resolvedCashFlowsSchema.optional(),
        })
        .strict()
        .superRefine((payload, context) => {
          if (
            payload.resolvedCashFlows !== undefined &&
            payload.financialKernelVersion !== "2.0.0"
          ) {
            context.addIssue({
              code: "custom",
              path: ["resolvedCashFlows"],
              message:
                "resolved cash flows require financial kernel version 2.0.0",
            });
          }
          if (
            payload.outcomePolicyVersion !== undefined &&
            payload.financialKernelVersion !== "2.0.0"
          ) {
            context.addIssue({
              code: "custom",
              path: ["outcomePolicyVersion"],
              message:
                "outcome policy 1.0.0 requires financial kernel version 2.0.0",
            });
          }
        }),
    })
    .strict(),
]);

export function decodePersistedGameCommandV2(value: unknown): GameCommandV2 {
  const decoded = persistedGameCommandV2Schema.parse(value);
  return {
    ...decoded,
    effectiveMonth: simulationMonth(decoded.effectiveMonth),
  } as GameCommandV2;
}
