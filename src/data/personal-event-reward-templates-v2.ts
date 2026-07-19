import {
  PERSONAL_EVENT_SCHEMA_V2,
  type PersonalEventTemplateV2,
} from "../core/personal-event-v2";
import { deepFreeze, parameter } from "./personal-event-template-helpers";

/** Positive events are bounded decisions, not unconditional bailouts. Each
 * response has an exact deterministic effect and a meaningful timing or
 * wellbeing trade-off. */
export const PERSONAL_EVENT_REWARD_TEMPLATES_V2:
  readonly PersonalEventTemplateV2[] = deepFreeze([
  {
    schemaVersion: PERSONAL_EVENT_SCHEMA_V2,
    id: "personal.employer_wellness_credit",
    version: 2,
    category: "opportunity",
    classification: "positive",
    lessonTags: {
      primary: "lesson.small_windfall",
      secondary: ["lesson.emergency_fund"],
    },
    eligibility: [{ type: "employment_status", statuses: ["employed"] }],
    hazard: {
      baseChancePpm: 35_000,
      minimumChancePpm: 25_000,
      maximumChancePpm: 45_000,
      modifiers: [],
    },
    severityTier: "micro",
    pressureCost: 0,
    parameters: [{
      id: "credit_cents",
      kind: "money_cents",
      distribution: "uniform_int",
      minimum: 10_000,
      maximum: 75_000,
    }],
    mitigations: [],
    responses: [
      {
        id: "claim_full_credit",
        label: "Claim the full wellness credit",
        requiresMitigationIds: [],
        effects: [{
          type: "cash_delta",
          direction: "add",
          magnitude: parameter("credit_cents"),
        }],
      },
      {
        id: "use_credit_for_recovery",
        label: "Use most of it for recovery",
        requiresMitigationIds: [],
        effects: [
          {
            type: "cash_delta",
            direction: "add",
            magnitude: parameter("credit_cents", 700_000),
          },
          {
            type: "wellbeing_delta",
            field: "burnoutPpm",
            magnitude: { source: "fixed", value: -35_000 },
          },
        ],
      },
    ],
    followUps: [],
    cooldowns: { eventMonths: 18, categoryMonths: 2, lessonMonths: 2 },
    maximumOccurrences: 2,
    recovery: { durationMonths: 0 },
    fallbackNarrative: {
      headline: "Your employer offers a wellness credit",
      body: "A small verified benefit can become cash or support recovery from burnout.",
    },
  },
  {
    schemaVersion: PERSONAL_EVENT_SCHEMA_V2,
    id: "personal.professional_development_stipend",
    version: 2,
    category: "career",
    classification: "positive",
    lessonTags: {
      primary: "lesson.income_growth",
      secondary: ["lesson.goal_tradeoff"],
    },
    eligibility: [{ type: "employment_status", statuses: ["employed"] }],
    hazard: {
      baseChancePpm: 30_000,
      minimumChancePpm: 20_000,
      maximumChancePpm: 40_000,
      modifiers: [],
    },
    severityTier: "micro",
    pressureCost: 0,
    parameters: [{
      id: "monthly_stipend_cents",
      kind: "money_cents",
      distribution: "uniform_int",
      minimum: 25_000,
      maximum: 200_000,
    }],
    mitigations: [],
    responses: [
      {
        id: "take_intensive_program",
        label: "Take the intensive three-month program",
        requiresMitigationIds: [],
        effects: [
          {
            type: "temporary_income",
            magnitude: parameter("monthly_stipend_cents"),
            durationMonths: 3,
          },
          {
            type: "wellbeing_delta",
            field: "burnoutPpm",
            magnitude: { source: "fixed", value: 25_000 },
          },
        ],
      },
      {
        id: "take_lighter_program",
        label: "Choose a lighter six-month schedule",
        requiresMitigationIds: [],
        effects: [
          {
            type: "temporary_income",
            magnitude: parameter("monthly_stipend_cents", 500_000),
            durationMonths: 6,
          },
          {
            type: "wellbeing_delta",
            field: "happinessPpm",
            magnitude: { source: "fixed", value: 15_000 },
          },
        ],
      },
    ],
    followUps: [],
    cooldowns: { eventMonths: 24, categoryMonths: 3, lessonMonths: 3 },
    maximumOccurrences: 2,
    recovery: { durationMonths: 0 },
    fallbackNarrative: {
      headline: "A paid development stipend opens up",
      body: "You can trade a shorter intense schedule for a longer, lower monthly stipend.",
    },
  },
  {
    schemaVersion: PERSONAL_EVENT_SCHEMA_V2,
    id: "personal.consumer_refund",
    version: 2,
    category: "opportunity",
    classification: "positive",
    lessonTags: {
      primary: "lesson.small_windfall",
      secondary: ["lesson.goal_tradeoff"],
    },
    eligibility: [],
    hazard: {
      baseChancePpm: 30_000,
      minimumChancePpm: 20_000,
      maximumChancePpm: 40_000,
      modifiers: [],
    },
    severityTier: "micro",
    pressureCost: 0,
    parameters: [{
      id: "refund_cents",
      kind: "money_cents",
      distribution: "uniform_int",
      minimum: 5_000,
      maximum: 150_000,
    }],
    mitigations: [],
    responses: [
      {
        id: "keep_refund",
        label: "Keep the full refund",
        requiresMitigationIds: [],
        effects: [{
          type: "cash_delta",
          direction: "add",
          magnitude: parameter("refund_cents"),
        }],
      },
      {
        id: "share_refund",
        label: "Share some and keep half",
        requiresMitigationIds: [],
        effects: [
          {
            type: "cash_delta",
            direction: "add",
            magnitude: parameter("refund_cents", 500_000),
          },
          {
            type: "wellbeing_delta",
            field: "happinessPpm",
            magnitude: { source: "fixed", value: 25_000 },
          },
        ],
      },
    ],
    followUps: [],
    cooldowns: { eventMonths: 24, categoryMonths: 2, lessonMonths: 2 },
    maximumOccurrences: 2,
    recovery: { durationMonths: 0 },
    fallbackNarrative: {
      headline: "A consumer refund is approved",
      body: "A past billing correction produces a bounded, non-recurring refund.",
    },
  },
  {
    schemaVersion: PERSONAL_EVENT_SCHEMA_V2,
    id: "personal.side_project_license",
    version: 2,
    category: "career",
    classification: "positive",
    lessonTags: {
      primary: "lesson.income_growth",
      secondary: ["lesson.cash_flow_timing"],
    },
    eligibility: [{ type: "employment_status", statuses: ["employed"] }],
    hazard: {
      baseChancePpm: 25_000,
      minimumChancePpm: 15_000,
      maximumChancePpm: 35_000,
      modifiers: [],
    },
    severityTier: "micro",
    pressureCost: 0,
    parameters: [{
      id: "license_value_cents",
      kind: "money_cents",
      distribution: "uniform_int",
      minimum: 100_000,
      maximum: 1_000_000,
    }],
    mitigations: [],
    responses: [
      {
        id: "take_upfront_payment",
        label: "Take the full upfront payment",
        requiresMitigationIds: [],
        effects: [{
          type: "cash_delta",
          direction: "add",
          magnitude: parameter("license_value_cents"),
        }],
      },
      {
        id: "take_six_month_royalty",
        label: "Take six monthly royalty payments",
        requiresMitigationIds: [],
        effects: [{
          type: "temporary_income",
          magnitude: parameter("license_value_cents", 200_000),
          durationMonths: 6,
        }],
      },
    ],
    followUps: [],
    cooldowns: { eventMonths: 30, categoryMonths: 3, lessonMonths: 3 },
    maximumOccurrences: 2,
    recovery: { durationMonths: 0 },
    fallbackNarrative: {
      headline: "Someone wants to license your side project",
      body: "Choose certain cash now or a larger total paid over six months.",
    },
  },
] satisfies readonly PersonalEventTemplateV2[]);
