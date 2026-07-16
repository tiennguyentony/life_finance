import {
  PERSONAL_EVENT_SCHEMA_V2,
  validatePersonalEventCatalogV2,
  type PersonalEventMagnitudeV2,
  type PersonalEventTemplateV2,
} from "../core/personal-event-v2";

function parameter(parameterId: string, multiplierPpm = 1_000_000): PersonalEventMagnitudeV2 {
  return { source: "parameter", parameterId, multiplierPpm };
}

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

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

const violations = validatePersonalEventCatalogV2(templates);
if (violations.length > 0) {
  throw new Error(`invalid personal event v2 catalog: ${violations[0]!.path}:${violations[0]!.code}`);
}

export const PERSONAL_EVENT_TEMPLATES_V2: readonly PersonalEventTemplateV2[] = deepFreeze([
  ...templates,
]);

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
