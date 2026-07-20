import {
  PERSONAL_EVENT_SCHEMA_V2,
  validatePersonalEventCatalogV2,
  type PersonalEventTemplateV2,
} from "../core/personal-event-v2";
import { deepFreeze, parameter } from "./personal-event-template-helpers";
import { PERSONAL_EVENT_FUNNY_TEMPLATES_V2 } from "./personal-event-funny-templates-v2";
import { createPersonalEventExpandedTemplatesV3 } from "./personal-event-expanded-templates-v3";
import { createPersonalEventFinancingTemplatesV1 } from "./personal-event-financing-templates-v1";
import { PERSONAL_EVENT_REWARD_TEMPLATES_V2 } from "./personal-event-reward-templates-v2";

const templates: readonly PersonalEventTemplateV2[] = [
  {
    schemaVersion: PERSONAL_EVENT_SCHEMA_V2,
    id: "personal.medical_bill",
    version: 2,
    category: "health",
    classification: "negative",
    lessonTags: {
      primary: "lesson.insurance",
      secondary: ["lesson.emergency_fund"],
    },
    eligibility: [],
    hazard: {
      baseChancePpm: 50_000,
      minimumChancePpm: 50_000,
      maximumChancePpm: 50_000,
      modifiers: [],
    },
    severityTier: "medium",
    pressureCost: 3,
    parameters: [{
      id: "gross_bill_cents",
      kind: "money_cents",
      distribution: "uniform_int",
      minimum: 100_000,
      maximum: 1_500_000,
    }],
    mitigations: [{ id: "health_plan", type: "health_insurance" }],
    responses: [
      {
        id: "pay_uninsured",
        label: "Pay without coverage",
        requiresMitigationIds: [],
        effects: [{
          type: "temporary_expense",
          magnitude: parameter("gross_bill_cents"),
          durationMonths: 1,
        }],
      },
      {
        id: "use_insurance",
        label: "Use health coverage",
        requiresMitigationIds: ["health_plan"],
        effects: [{
          type: "insurance_claim",
          mitigationId: "health_plan",
          coverage: "health",
          grossAmount: parameter("gross_bill_cents"),
        }],
      },
    ],
    followUps: [],
    cooldowns: { eventMonths: 9, categoryMonths: 3, lessonMonths: 2 },
    maximumOccurrences: 3,
    recovery: { durationMonths: 2 },
    fallbackNarrative: {
      headline: "An unexpected medical bill arrives",
      body: "A health visit produced a bounded bill that now requires a coverage decision.",
    },
  },
  {
    schemaVersion: PERSONAL_EVENT_SCHEMA_V2,
    id: "personal.lifestyle_upgrade",
    version: 2,
    category: "behavioral_trap",
    classification: "neutral",
    lessonTags: {
      primary: "lesson.lifestyle_creep",
      secondary: ["lesson.goal_tradeoff"],
    },
    eligibility: [],
    hazard: {
      baseChancePpm: 80_000,
      minimumChancePpm: 80_000,
      maximumChancePpm: 80_000,
      modifiers: [],
    },
    severityTier: "medium",
    pressureCost: 2,
    parameters: [{
      id: "annual_cost_increase_cents",
      kind: "money_cents",
      distribution: "uniform_int",
      minimum: 120_000,
      maximum: 2_400_000,
    }],
    mitigations: [],
    responses: [
      {
        id: "accept_upgrade",
        label: "Upgrade the lifestyle",
        requiresMitigationIds: [],
        effects: [{
          type: "annual_living_cost_delta",
          magnitude: parameter("annual_cost_increase_cents"),
        }],
      },
      {
        id: "keep_current_lifestyle",
        label: "Keep current spending",
        requiresMitigationIds: [],
        effects: [{
          type: "wellbeing_delta",
          field: "burnoutPpm",
          magnitude: { source: "fixed", value: 20_000 },
        }],
      },
    ],
    followUps: [],
    cooldowns: { eventMonths: 12, categoryMonths: 4, lessonMonths: 4 },
    maximumOccurrences: 2,
    recovery: { durationMonths: 1 },
    fallbackNarrative: {
      headline: "A lifestyle upgrade is within reach",
      body: "The offer is appealing, but accepting it permanently raises annual spending.",
    },
  },
  {
    schemaVersion: PERSONAL_EVENT_SCHEMA_V2,
    id: "personal.performance_bonus",
    version: 2,
    category: "opportunity",
    classification: "positive",
    lessonTags: {
      primary: "lesson.windfall_plan",
      secondary: ["lesson.goal_tradeoff"],
    },
    eligibility: [{ type: "employment_status", statuses: ["employed"] }],
    hazard: {
      baseChancePpm: 60_000,
      minimumChancePpm: 60_000,
      maximumChancePpm: 60_000,
      modifiers: [],
    },
    severityTier: "micro",
    pressureCost: 0,
    parameters: [{
      id: "bonus_cents",
      kind: "money_cents",
      distribution: "uniform_int",
      minimum: 50_000,
      maximum: 500_000,
    }],
    mitigations: [],
    responses: [{
      id: "accept_bonus",
      label: "Accept the bonus",
      requiresMitigationIds: [],
      effects: [{
        type: "cash_delta",
        direction: "add",
        magnitude: parameter("bonus_cents"),
      }],
    }],
    followUps: [{
      templateId: "personal.utility_rebate",
      templateVersion: 2,
      delayMonths: 2,
      whenResponseIds: ["accept_bonus"],
    }],
    cooldowns: { eventMonths: 12, categoryMonths: 2, lessonMonths: 2 },
    maximumOccurrences: 4,
    recovery: { durationMonths: 0 },
    fallbackNarrative: {
      headline: "Your work earns a performance bonus",
      body: "A bounded one-time cash award creates a new allocation decision.",
    },
  },
  {
    schemaVersion: PERSONAL_EVENT_SCHEMA_V2,
    id: "personal.transport_repair",
    version: 2,
    category: "maintenance",
    classification: "negative",
    lessonTags: {
      primary: "lesson.emergency_fund",
      secondary: ["lesson.payment_plan"],
    },
    eligibility: [],
    hazard: {
      baseChancePpm: 100_000,
      minimumChancePpm: 100_000,
      maximumChancePpm: 100_000,
      modifiers: [],
    },
    severityTier: "medium",
    pressureCost: 3,
    parameters: [{
      id: "repair_cost_cents",
      kind: "money_cents",
      distribution: "uniform_int",
      minimum: 100_000,
      maximum: 400_000,
    }],
    mitigations: [],
    responses: [
      {
        id: "pay_now",
        label: "Pay for the repair now",
        requiresMitigationIds: [],
        effects: [{
          type: "temporary_expense",
          magnitude: parameter("repair_cost_cents"),
          durationMonths: 1,
        }],
      },
      {
        id: "payment_plan",
        label: "Use a three-month payment plan",
        requiresMitigationIds: [],
        effects: [{
          type: "recurring_expense",
          magnitude: parameter("repair_cost_cents", 400_000),
          durationMonths: 3,
        }],
      },
      {
        id: "defer_repair",
        label: "Defer the repair",
        requiresMitigationIds: [],
        effects: [{
          type: "wellbeing_delta",
          field: "burnoutPpm",
          magnitude: { source: "fixed", value: 40_000 },
        }],
      },
    ],
    followUps: [{
      templateId: "personal.transport_repair_followup",
      templateVersion: 2,
      delayMonths: 2,
      whenResponseIds: ["defer_repair"],
    }],
    cooldowns: { eventMonths: 12, categoryMonths: 3, lessonMonths: 3 },
    maximumOccurrences: 2,
    recovery: { durationMonths: 9 },
    fallbackNarrative: {
      headline: "Your transportation needs an urgent repair",
      body: "The repair can be paid now, financed at a higher total, or deferred with added risk.",
    },
  },
  {
    schemaVersion: PERSONAL_EVENT_SCHEMA_V2,
    id: "personal.transport_repair_followup",
    version: 2,
    category: "maintenance",
    classification: "negative",
    lessonTags: {
      primary: "lesson.cost_of_delay",
      secondary: ["lesson.emergency_fund"],
    },
    eligibility: [],
    hazard: {
      baseChancePpm: 0,
      minimumChancePpm: 0,
      maximumChancePpm: 0,
      modifiers: [],
    },
    severityTier: "large",
    pressureCost: 4,
    parameters: [{
      id: "escalated_repair_cost_cents",
      kind: "money_cents",
      distribution: "uniform_int",
      minimum: 500_000,
      maximum: 1_500_000,
    }],
    mitigations: [],
    responses: [{
      id: "complete_repair",
      label: "Complete the more expensive repair",
      requiresMitigationIds: [],
      effects: [{
        type: "temporary_expense",
        magnitude: parameter("escalated_repair_cost_cents"),
        durationMonths: 1,
      }],
    }],
    followUps: [],
    cooldowns: { eventMonths: 12, categoryMonths: 3, lessonMonths: 3 },
    maximumOccurrences: 2,
    recovery: { durationMonths: 12 },
    fallbackNarrative: {
      headline: "The deferred repair has become more expensive",
      body: "Waiting allowed the original problem to grow into a larger required repair.",
    },
  },
  {
    schemaVersion: PERSONAL_EVENT_SCHEMA_V2,
    id: "personal.rent_renewal",
    version: 2,
    category: "housing",
    classification: "neutral",
    lessonTags: {
      primary: "lesson.fixed_costs",
      secondary: ["lesson.goal_tradeoff"],
    },
    eligibility: [{ type: "home_owned", expected: false }],
    hazard: {
      baseChancePpm: 90_000,
      minimumChancePpm: 90_000,
      maximumChancePpm: 90_000,
      modifiers: [],
    },
    severityTier: "medium",
    pressureCost: 2,
    parameters: [
      {
        id: "annual_rent_increase_cents",
        kind: "money_cents",
        distribution: "uniform_int",
        minimum: 120_000,
        maximum: 360_000,
      },
      {
        id: "moving_cost_cents",
        kind: "money_cents",
        distribution: "uniform_int",
        minimum: 150_000,
        maximum: 400_000,
      },
    ],
    mitigations: [],
    responses: [
      {
        id: "accept_increase",
        label: "Renew at the higher rent",
        requiresMitigationIds: [],
        effects: [{
          type: "annual_living_cost_delta",
          magnitude: parameter("annual_rent_increase_cents"),
        }],
      },
      {
        id: "move_to_cheaper_home",
        label: "Move to a cheaper home",
        requiresMitigationIds: [],
        effects: [
          {
            type: "temporary_expense",
            magnitude: parameter("moving_cost_cents"),
            durationMonths: 1,
          },
          {
            type: "annual_living_cost_delta",
            magnitude: parameter("annual_rent_increase_cents", -500_000),
          },
        ],
      },
      {
        id: "share_housing",
        label: "Share housing to lower costs",
        requiresMitigationIds: [],
        effects: [
          {
            type: "annual_living_cost_delta",
            magnitude: parameter("annual_rent_increase_cents", -1_000_000),
          },
          {
            type: "wellbeing_delta",
            field: "burnoutPpm",
            magnitude: { source: "fixed", value: 50_000 },
          },
        ],
      },
    ],
    followUps: [],
    cooldowns: { eventMonths: 12, categoryMonths: 4, lessonMonths: 3 },
    maximumOccurrences: 3,
    recovery: { durationMonths: 9 },
    fallbackNarrative: {
      headline: "Your rent renewal requires a housing decision",
      body: "You can absorb the increase, pay to move, or trade privacy for lower fixed costs.",
    },
  },
  {
    schemaVersion: PERSONAL_EVENT_SCHEMA_V2,
    id: "personal.family_care_request",
    version: 2,
    category: "caregiving",
    classification: "neutral",
    lessonTags: {
      primary: "lesson.boundaries",
      secondary: ["lesson.emergency_fund"],
    },
    eligibility: [],
    hazard: {
      baseChancePpm: 80_000,
      minimumChancePpm: 80_000,
      maximumChancePpm: 80_000,
      modifiers: [],
    },
    severityTier: "medium",
    pressureCost: 2,
    parameters: [{
      id: "care_cost_cents",
      kind: "money_cents",
      distribution: "uniform_int",
      minimum: 60_000,
      maximum: 240_000,
    }],
    mitigations: [],
    responses: [
      {
        id: "cover_full_cost",
        label: "Cover the full care cost",
        requiresMitigationIds: [],
        effects: [{
          type: "temporary_expense",
          magnitude: parameter("care_cost_cents"),
          durationMonths: 1,
        }],
      },
      {
        id: "split_cost_and_time",
        label: "Split the cost and contribute time",
        requiresMitigationIds: [],
        effects: [
          {
            type: "recurring_expense",
            magnitude: parameter("care_cost_cents", 300_000),
            durationMonths: 2,
          },
          {
            type: "wellbeing_delta",
            field: "burnoutPpm",
            magnitude: { source: "fixed", value: 60_000 },
          },
        ],
      },
      {
        id: "decline_request",
        label: "Decline the request",
        requiresMitigationIds: [],
        effects: [{
          type: "wellbeing_delta",
          field: "happinessPpm",
          magnitude: { source: "fixed", value: -60_000 },
        }],
      },
    ],
    followUps: [],
    cooldowns: { eventMonths: 10, categoryMonths: 3, lessonMonths: 3 },
    maximumOccurrences: 3,
    recovery: { durationMonths: 9 },
    fallbackNarrative: {
      headline: "A family member asks for help with care",
      body: "Money, time, and personal boundaries pull in different directions.",
    },
  },
  {
    schemaVersion: PERSONAL_EVENT_SCHEMA_V2,
    id: "personal.work_device_replacement",
    version: 2,
    category: "career",
    classification: "negative",
    lessonTags: {
      primary: "lesson.needs_vs_wants",
      secondary: ["lesson.payment_plan"],
    },
    eligibility: [{ type: "employment_status", statuses: ["employed"] }],
    hazard: {
      baseChancePpm: 80_000,
      minimumChancePpm: 80_000,
      maximumChancePpm: 80_000,
      modifiers: [],
    },
    severityTier: "medium",
    pressureCost: 2,
    parameters: [{
      id: "device_cost_cents",
      kind: "money_cents",
      distribution: "uniform_int",
      minimum: 100_000,
      maximum: 400_000,
    }],
    mitigations: [],
    responses: [
      {
        id: "buy_basic",
        label: "Buy a basic replacement",
        requiresMitigationIds: [],
        effects: [{
          type: "temporary_expense",
          magnitude: parameter("device_cost_cents", 600_000),
          durationMonths: 1,
        }],
      },
      {
        id: "device_payment_plan",
        label: "Use a four-month payment plan",
        requiresMitigationIds: [],
        effects: [{
          type: "recurring_expense",
          magnitude: parameter("device_cost_cents", 300_000),
          durationMonths: 4,
        }],
      },
      {
        id: "buy_premium",
        label: "Buy the premium replacement",
        requiresMitigationIds: [],
        effects: [
          {
            type: "temporary_expense",
            magnitude: parameter("device_cost_cents"),
            durationMonths: 1,
          },
          {
            type: "wellbeing_delta",
            field: "happinessPpm",
            magnitude: { source: "fixed", value: 30_000 },
          },
        ],
      },
    ],
    followUps: [],
    cooldowns: { eventMonths: 14, categoryMonths: 3, lessonMonths: 3 },
    maximumOccurrences: 2,
    recovery: { durationMonths: 4 },
    fallbackNarrative: {
      headline: "A work device needs to be replaced",
      body: "A basic purchase, financing, and a premium upgrade create different costs and benefits.",
    },
  },
  {
    schemaVersion: PERSONAL_EVENT_SCHEMA_V2,
    id: "personal.reduced_work_hours",
    version: 2,
    category: "career",
    classification: "negative",
    lessonTags: {
      primary: "lesson.income_shock",
      secondary: ["lesson.flexible_spending"],
    },
    eligibility: [{ type: "employment_status", statuses: ["employed"] }],
    hazard: {
      baseChancePpm: 30_000,
      minimumChancePpm: 30_000,
      maximumChancePpm: 200_000,
      modifiers: [{
        type: "wellbeing_threshold",
        field: "burnoutPpm",
        comparator: "at_least",
        thresholdPpm: 400_000,
        deltaPpm: 170_000,
      }],
    },
    severityTier: "medium",
    pressureCost: 3,
    parameters: [{
      id: "cash_flow_gap_cents",
      kind: "money_cents",
      distribution: "uniform_int",
      minimum: 300_000,
      maximum: 700_000,
    }],
    mitigations: [],
    responses: [
      {
        id: "trim_spending",
        label: "Trim spending immediately",
        requiresMitigationIds: [],
        effects: [
          {
            type: "temporary_expense",
            magnitude: parameter("cash_flow_gap_cents", 500_000),
            durationMonths: 1,
          },
          {
            type: "wellbeing_delta",
            field: "happinessPpm",
            magnitude: { source: "fixed", value: -50_000 },
          },
        ],
      },
      {
        id: "spread_income_gap",
        label: "Spread a higher total gap over six months",
        requiresMitigationIds: [],
        effects: [{
          type: "recurring_expense",
          magnitude: parameter("cash_flow_gap_cents", 600_000),
          durationMonths: 6,
        }],
      },
      {
        id: "protect_current_routine",
        label: "Protect the current routine",
        requiresMitigationIds: [],
        effects: [{
          type: "temporary_expense",
          magnitude: parameter("cash_flow_gap_cents"),
          durationMonths: 1,
        }],
      },
    ],
    followUps: [],
    cooldowns: { eventMonths: 14, categoryMonths: 4, lessonMonths: 3 },
    maximumOccurrences: 2,
    recovery: { durationMonths: 9 },
    fallbackNarrative: {
      headline: "Reduced work hours create a temporary cash-flow gap",
      body: "You can cut spending, spread a higher total cost, or protect your current routine.",
    },
  },
  {
    schemaVersion: PERSONAL_EVENT_SCHEMA_V2,
    id: "personal.social_commitment",
    version: 2,
    category: "social",
    classification: "neutral",
    lessonTags: {
      primary: "lesson.social_spending",
      secondary: ["lesson.goal_tradeoff"],
    },
    eligibility: [],
    hazard: {
      baseChancePpm: 70_000,
      minimumChancePpm: 70_000,
      maximumChancePpm: 70_000,
      modifiers: [],
    },
    severityTier: "micro",
    pressureCost: 1,
    parameters: [{
      id: "commitment_cost_cents",
      kind: "money_cents",
      distribution: "uniform_int",
      minimum: 30_000,
      maximum: 150_000,
    }],
    mitigations: [],
    responses: [
      {
        id: "pay_commitment_now",
        label: "Pay for the commitment now",
        requiresMitigationIds: [],
        effects: [
          {
            type: "temporary_expense",
            magnitude: parameter("commitment_cost_cents"),
            durationMonths: 1,
          },
          {
            type: "wellbeing_delta",
            field: "happinessPpm",
            magnitude: { source: "fixed", value: 40_000 },
          },
        ],
      },
      {
        id: "spread_commitment_cost",
        label: "Spread the cost over three months",
        requiresMitigationIds: [],
        effects: [
          {
            type: "recurring_expense",
            magnitude: parameter("commitment_cost_cents", 400_000),
            durationMonths: 3,
          },
          {
            type: "wellbeing_delta",
            field: "happinessPpm",
            magnitude: { source: "fixed", value: 40_000 },
          },
        ],
      },
      {
        id: "decline_commitment",
        label: "Decline the commitment",
        requiresMitigationIds: [],
        effects: [{
          type: "wellbeing_delta",
          field: "happinessPpm",
          magnitude: { source: "fixed", value: -50_000 },
        }],
      },
    ],
    followUps: [],
    cooldowns: { eventMonths: 8, categoryMonths: 3, lessonMonths: 2 },
    maximumOccurrences: 4,
    recovery: { durationMonths: 2 },
    fallbackNarrative: {
      headline: "A meaningful social commitment strains the monthly plan",
      body: "Paying, financing, and declining each protect a different part of your life.",
    },
  },
  {
    schemaVersion: PERSONAL_EVENT_SCHEMA_V2,
    id: "personal.utility_rebate",
    version: 2,
    category: "opportunity",
    classification: "positive",
    lessonTags: {
      primary: "lesson.small_windfall",
      secondary: [],
    },
    eligibility: [],
    hazard: {
      baseChancePpm: 40_000,
      minimumChancePpm: 40_000,
      maximumChancePpm: 40_000,
      modifiers: [],
    },
    severityTier: "micro",
    pressureCost: 0,
    parameters: [{
      id: "rebate_cents",
      kind: "money_cents",
      distribution: "uniform_int",
      minimum: 10_000,
      maximum: 100_000,
    }],
    mitigations: [],
    responses: [{
      id: "claim_rebate",
      label: "Claim the rebate",
      requiresMitigationIds: [],
      effects: [{
        type: "cash_delta",
        direction: "add",
        magnitude: parameter("rebate_cents"),
      }],
    }],
    followUps: [],
    cooldowns: { eventMonths: 18, categoryMonths: 2, lessonMonths: 2 },
    maximumOccurrences: 2,
    recovery: { durationMonths: 0 },
    fallbackNarrative: {
      headline: "A utility rebate becomes available",
      body: "A verified program offers a small, bounded household rebate.",
    },
  },
];

const expandedTemplatesV3 = createPersonalEventExpandedTemplatesV3(templates);

const preFinancingTemplates = [
  ...templates,
  ...PERSONAL_EVENT_FUNNY_TEMPLATES_V2,
  ...PERSONAL_EVENT_REWARD_TEMPLATES_V2,
  ...expandedTemplatesV3,
] as const satisfies readonly PersonalEventTemplateV2[];

const financingTemplates = createPersonalEventFinancingTemplatesV1(
  preFinancingTemplates,
);

const completeTemplates = [
  ...preFinancingTemplates,
  ...financingTemplates,
] as const satisfies readonly PersonalEventTemplateV2[];

const violations = validatePersonalEventCatalogV2(completeTemplates);
if (violations.length > 0) {
  throw new Error(`invalid personal event v2 catalog: ${violations[0]!.path}:${violations[0]!.code}`);
}

export const HISTORICAL_PERSONAL_EVENT_TEMPLATES_V2:
  readonly PersonalEventTemplateV2[] = deepFreeze([
  ...templates,
]);

export const PERSONAL_EVENT_TEMPLATES_V2: readonly PersonalEventTemplateV2[] =
  deepFreeze([...completeTemplates]);

export function activePersonalEventTemplatesV2(
  catalog: readonly PersonalEventTemplateV2[],
): readonly PersonalEventTemplateV2[] {
  const highest = new Map<string, PersonalEventTemplateV2>();
  for (const template of catalog) {
    const current = highest.get(template.id);
    if (current === undefined || template.version > current.version) {
      highest.set(template.id, template);
    }
  }
  return deepFreeze(
    [...highest.values()].toSorted(
      (left, right) => left.id.localeCompare(right.id) || left.version - right.version,
    ),
  );
}

export const ACTIVE_PERSONAL_EVENT_TEMPLATES_V2:
  readonly PersonalEventTemplateV2[] = activePersonalEventTemplatesV2(
    PERSONAL_EVENT_TEMPLATES_V2,
  );

export type PersonalEventSchedulingSelectionV2 =
  | "historical-v2"
  | "highest-supported";

/**
 * Production scheduling draws from the highest-supported catalog, so every
 * template the project ships can appear in play rather than only the original
 * historical set. Scheduling stays deterministic: the scheduler still picks by
 * seeded RNG from templates the run is actually eligible for.
 */
export const PERSONAL_EVENT_SCHEDULING_SELECTION_V2:
  PersonalEventSchedulingSelectionV2 = "highest-supported";

function productionPersonalEventCatalogV2(
  selection: PersonalEventSchedulingSelectionV2,
): readonly PersonalEventTemplateV2[] {
  return selection === "highest-supported"
    ? ACTIVE_PERSONAL_EVENT_TEMPLATES_V2
    : HISTORICAL_PERSONAL_EVENT_TEMPLATES_V2;
}

export const PRODUCTION_PERSONAL_EVENT_TEMPLATES_V2:
  readonly PersonalEventTemplateV2[] = productionPersonalEventCatalogV2(
    PERSONAL_EVENT_SCHEDULING_SELECTION_V2,
  );

export function getPersonalEventTemplateV2(
  templateId: string,
  version = 2,
): PersonalEventTemplateV2 {
  const template = PERSONAL_EVENT_TEMPLATES_V2.find(
    ({ id, version: candidateVersion }) => id === templateId && candidateVersion === version,
  );
  if (!template) throw new RangeError(`unknown personal event v2 template ${templateId}@${version}`);
  return template;
}

export function getActivePersonalEventTemplateV2(
  templateId: string,
): PersonalEventTemplateV2 {
  const template = ACTIVE_PERSONAL_EVENT_TEMPLATES_V2.find(
    ({ id }) => id === templateId,
  );
  if (template === undefined) {
    throw new RangeError(`unknown active personal event template ${templateId}`);
  }
  return template;
}
