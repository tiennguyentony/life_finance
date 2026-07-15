import { moneyCents, ratePpm } from "../core/domain/money";
import {
  assertValidEventTemplate,
  type EventEffect,
  type EventEffectMagnitude,
  type EventTemplate,
  type EventTier,
  type EventWeakness,
  type MarketAssetClass,
} from "../core/events";

export class EventCatalogError extends Error {
  readonly code: "UNKNOWN_TEMPLATE" | "TEMPLATE_VERSION_MISMATCH";

  constructor(code: EventCatalogError["code"], message: string) {
    super(message);
    this.name = "EventCatalogError";
    this.code = code;
  }
}

function parameter(
  parameterId: string,
  multiplierPpm = 1_000_000,
): EventEffectMagnitude {
  return {
    source: "parameter",
    parameterId,
    multiplierPpm: ratePpm(multiplierPpm),
  };
}

function fixed(value: number): EventEffectMagnitude {
  return { source: "fixed", value };
}

function marketEffect(
  assetClass: MarketAssetClass,
  parameterId: string,
  multiplierPpm = 1_000_000,
): EventEffect {
  return {
    type: "market_return_modifier",
    assetClass,
    magnitude: parameter(parameterId, multiplierPpm),
  };
}

function macroTemplate(input: {
  id: string;
  principle: string;
  weaknesses: readonly EventWeakness[];
  parameterId: string;
  minimumPpm: number;
  maximumPpm: number;
  effects: readonly EventEffect[];
  regimes?: EventTemplate["eligibility"];
}): EventTemplate {
  return {
    schemaVersion: 1,
    id: input.id,
    version: 1,
    kind: "macro",
    tier: "ambient",
    teachingPrinciple: input.principle,
    targetsWeaknesses: input.weaknesses,
    parameters: [
      {
        id: input.parameterId,
        kind: "rate_ppm",
        minimum: input.minimumPpm,
        maximum: input.maximumPpm,
      },
    ],
    eligibility: input.regimes ?? [],
    automaticEffects: input.effects,
    choices: [],
  };
}

function personalTemplate(input: {
  id: string;
  tier: Exclude<EventTier, "ambient">;
  principle: string;
  weaknesses: readonly EventWeakness[];
  parameterId: string;
  minimumCents: number;
  maximumCents: number;
  eligibility?: EventTemplate["eligibility"];
  choices: EventTemplate["choices"];
}): EventTemplate {
  return {
    schemaVersion: 1,
    id: input.id,
    version: 1,
    kind: "personal_shock",
    tier: input.tier,
    teachingPrinciple: input.principle,
    targetsWeaknesses: input.weaknesses,
    parameters: [
      {
        id: input.parameterId,
        kind: "money_cents",
        minimum: input.minimumCents,
        maximum: input.maximumCents,
      },
    ],
    eligibility: input.eligibility ?? [],
    automaticEffects: [],
    choices: input.choices,
  };
}

const rawTemplates: readonly EventTemplate[] = [
  macroTemplate({
    id: "macro.tech_boom",
    principle: "Recent gains are not evidence that one sector is a safe portfolio.",
    weaknesses: ["market_timing", "portfolio_concentration", "job_portfolio_correlation"],
    parameterId: "equity_boost_ppm",
    minimumPpm: 10_000,
    maximumPpm: 80_000,
    regimes: [{ type: "market_regime", regimes: ["expansion", "recovery"] }],
    effects: [
      marketEffect("equity", "equity_boost_ppm"),
      marketEffect("bonds", "equity_boost_ppm", -200_000),
    ],
  }),
  macroTemplate({
    id: "macro.rate_hike",
    principle: "Rate changes affect stocks, bonds, cash, and housing differently.",
    weaknesses: ["high_fixed_costs", "market_timing"],
    parameterId: "rate_shock_ppm",
    minimumPpm: 10_000,
    maximumPpm: 70_000,
    regimes: [{ type: "market_regime", regimes: ["expansion", "inflation"] }],
    effects: [
      marketEffect("equity", "rate_shock_ppm", -500_000),
      marketEffect("bonds", "rate_shock_ppm", -750_000),
      marketEffect("cash", "rate_shock_ppm", 250_000),
      marketEffect("housing", "rate_shock_ppm", -600_000),
    ],
  }),
  macroTemplate({
    id: "macro.housing_surge",
    principle: "Rising home prices help owners but can raise the cost of chasing a purchase.",
    weaknesses: ["market_timing", "high_fixed_costs"],
    parameterId: "housing_boost_ppm",
    minimumPpm: 10_000,
    maximumPpm: 100_000,
    effects: [
      marketEffect("housing", "housing_boost_ppm"),
      marketEffect("equity", "housing_boost_ppm", 100_000),
    ],
  }),
  macroTemplate({
    id: "macro.recession_warning",
    principle: "Diversification and liquidity matter before a downturn arrives.",
    weaknesses: ["low_emergency_fund", "portfolio_concentration"],
    parameterId: "downturn_ppm",
    minimumPpm: 20_000,
    maximumPpm: 150_000,
    regimes: [{ type: "market_regime", regimes: ["inflation", "recession"] }],
    effects: [
      marketEffect("equity", "downturn_ppm", -1_000_000),
      marketEffect("housing", "downturn_ppm", -600_000),
      marketEffect("bonds", "downturn_ppm", 250_000),
    ],
  }),
  macroTemplate({
    id: "macro.oil_shock",
    principle: "A dramatic headline can move several asset classes in opposite directions.",
    weaknesses: ["market_timing", "portfolio_concentration"],
    parameterId: "supply_shock_ppm",
    minimumPpm: 10_000,
    maximumPpm: 90_000,
    effects: [
      marketEffect("equity", "supply_shock_ppm", -350_000),
      marketEffect("bonds", "supply_shock_ppm", -150_000),
      marketEffect("cash", "supply_shock_ppm", 50_000),
    ],
  }),
  personalTemplate({
    id: "personal.unexpected_repair",
    tier: "micro",
    principle: "A small cash buffer keeps routine surprises away from expensive credit.",
    weaknesses: ["low_emergency_fund", "high_credit_utilization"],
    parameterId: "repair_cost_cents",
    minimumCents: 25_000,
    maximumCents: 200_000,
    eligibility: [{ type: "maximum_emergency_fund_months", months: 3 }],
    choices: [
      {
        id: "repair_now",
        principle: "Pay the full necessary repair this period.",
        effects: [
          {
            type: "required_obligation_delta",
            magnitude: parameter("repair_cost_cents"),
          },
        ],
      },
      {
        id: "negotiate_repair",
        principle: "Comparison shopping lowers cost but consumes time and energy.",
        effects: [
          {
            type: "required_obligation_delta",
            magnitude: parameter("repair_cost_cents", 800_000),
          },
          {
            type: "wellbeing_delta",
            field: "burnoutPpm",
            magnitude: fixed(30_000),
          },
        ],
      },
    ],
  }),
  personalTemplate({
    id: "personal.medical_bill",
    tier: "medium",
    principle: "Insurance converts an unbounded health shock into a bounded cost.",
    weaknesses: ["low_emergency_fund", "high_credit_utilization"],
    parameterId: "gross_bill_cents",
    minimumCents: 100_000,
    maximumCents: 1_500_000,
    choices: [
      {
        id: "pay_uninsured",
        principle: "Without coverage, the entire bill is due.",
        effects: [
          {
            type: "required_obligation_delta",
            magnitude: parameter("gross_bill_cents"),
          },
          {
            type: "wellbeing_delta",
            field: "burnoutPpm",
            magnitude: fixed(100_000),
          },
        ],
      },
      {
        id: "use_insurance",
        principle: "Coverage absorbs most of the bill in exchange for prior premiums.",
        effects: [
          {
            type: "required_obligation_delta",
            magnitude: parameter("gross_bill_cents", 200_000),
          },
          {
            type: "wellbeing_delta",
            field: "happinessPpm",
            magnitude: fixed(-25_000),
          },
        ],
      },
    ],
  }),
  personalTemplate({
    id: "personal.industry_layoff",
    tier: "large",
    principle: "Job-correlated investments can fall exactly when earned income disappears.",
    weaknesses: [
      "low_emergency_fund",
      "job_portfolio_correlation",
      "high_fixed_costs",
    ],
    parameterId: "income_gap_cents",
    minimumCents: 300_000,
    maximumCents: 2_500_000,
    choices: [
      {
        id: "maintain_lifestyle",
        principle: "Keeping every commitment makes the full income gap immediately payable.",
        effects: [
          {
            type: "required_obligation_delta",
            magnitude: parameter("income_gap_cents"),
          },
          {
            type: "wellbeing_delta",
            field: "burnoutPpm",
            magnitude: fixed(150_000),
          },
        ],
      },
      {
        id: "emergency_budget",
        principle: "Fast spending cuts preserve runway while income recovers.",
        effects: [
          {
            type: "required_obligation_delta",
            magnitude: parameter("income_gap_cents", 650_000),
          },
          {
            type: "wellbeing_delta",
            field: "happinessPpm",
            magnitude: fixed(-100_000),
          },
        ],
      },
    ],
  }),
  personalTemplate({
    id: "personal.property_emergency",
    tier: "catastrophe",
    principle: "Insurance protects liquidity from a low-frequency, high-severity loss.",
    weaknesses: ["uninsured_property", "low_emergency_fund"],
    parameterId: "restoration_cost_cents",
    minimumCents: 2_000_000,
    maximumCents: 20_000_000,
    eligibility: [{ type: "minimum_home_value", amountCents: moneyCents(1) }],
    choices: [
      {
        id: "restore_uninsured",
        principle: "Without coverage, restoration consumes the household balance sheet.",
        effects: [
          {
            type: "required_obligation_delta",
            magnitude: parameter("restoration_cost_cents"),
          },
          {
            type: "wellbeing_delta",
            field: "burnoutPpm",
            magnitude: fixed(300_000),
          },
        ],
      },
      {
        id: "file_covered_claim",
        principle: "Coverage limits the immediate bill to deductible and uncovered costs.",
        effects: [
          {
            type: "required_obligation_delta",
            magnitude: parameter("restoration_cost_cents", 100_000),
          },
          {
            type: "wellbeing_delta",
            field: "burnoutPpm",
            magnitude: fixed(100_000),
          },
        ],
      },
    ],
  }),
  personalTemplate({
    id: "personal.lifestyle_upgrade",
    tier: "medium",
    principle: "Lifestyle creep raises today's burn and moves the FI finish line away.",
    weaknesses: ["lifestyle_fragility", "high_fixed_costs"],
    parameterId: "annual_cost_increase_cents",
    minimumCents: 120_000,
    maximumCents: 2_400_000,
    choices: [
      {
        id: "accept_upgrade",
        principle: "The upgrade improves mood but permanently increases annual burn.",
        effects: [
          {
            type: "annual_living_cost_delta",
            magnitude: parameter("annual_cost_increase_cents"),
          },
          {
            type: "wellbeing_delta",
            field: "happinessPpm",
            magnitude: fixed(75_000),
          },
        ],
      },
      {
        id: "keep_current_lifestyle",
        principle: "Holding the line protects the FI target despite social pressure.",
        effects: [
          {
            type: "wellbeing_delta",
            field: "burnoutPpm",
            magnitude: fixed(20_000),
          },
        ],
      },
    ],
  }),
  personalTemplate({
    id: "personal.transport_breakdown",
    tier: "micro",
    principle: "Transportation failures turn into debt when the budget has no repair reserve.",
    weaknesses: ["low_emergency_fund", "high_credit_utilization", "high_fixed_costs"],
    parameterId: "transport_cost_cents",
    minimumCents: 60_000,
    maximumCents: 450_000,
    choices: [
      {
        id: "restore_reliable_transport",
        principle: "Paying for a durable fix costs more now but restores reliable access to work.",
        effects: [
          { type: "required_obligation_delta", magnitude: parameter("transport_cost_cents") },
          { type: "wellbeing_delta", field: "burnoutPpm", magnitude: fixed(20_000) },
        ],
      },
      {
        id: "use_temporary_transport",
        principle: "A temporary workaround preserves cash but adds time and uncertainty.",
        effects: [
          { type: "required_obligation_delta", magnitude: parameter("transport_cost_cents", 450_000) },
          { type: "wellbeing_delta", field: "burnoutPpm", magnitude: fixed(80_000) },
        ],
      },
    ],
  }),
  personalTemplate({
    id: "personal.lease_renewal_jump",
    tier: "medium",
    principle: "Housing flexibility has value when a lease renewal raises fixed costs.",
    weaknesses: ["lifestyle_fragility", "high_fixed_costs", "low_emergency_fund"],
    parameterId: "annual_rent_increase_cents",
    minimumCents: 60_000,
    maximumCents: 600_000,
    eligibility: [{ type: "maximum_home_value", amountCents: moneyCents(0) }],
    choices: [
      {
        id: "renew_lease",
        principle: "Renewing avoids disruption but permanently increases annual spending.",
        effects: [
          { type: "annual_living_cost_delta", magnitude: parameter("annual_rent_increase_cents") },
        ],
      },
      {
        id: "move_to_lower_cost_home",
        principle: "Moving protects the recurring budget but creates an immediate cash and time cost.",
        effects: [
          { type: "required_obligation_delta", magnitude: parameter("annual_rent_increase_cents", 750_000) },
          { type: "wellbeing_delta", field: "burnoutPpm", magnitude: fixed(90_000) },
        ],
      },
    ],
  }),
  personalTemplate({
    id: "personal.home_system_failure",
    tier: "large",
    principle: "Homeownership needs both insurance and a separate maintenance reserve.",
    weaknesses: ["low_emergency_fund", "uninsured_property", "high_fixed_costs"],
    parameterId: "repair_cost_cents",
    minimumCents: 250_000,
    maximumCents: 2_500_000,
    eligibility: [{ type: "minimum_home_value", amountCents: moneyCents(1) }],
    choices: [
      {
        id: "replace_failed_system",
        principle: "A complete repair restores the home and removes the immediate risk.",
        effects: [
          { type: "required_obligation_delta", magnitude: parameter("repair_cost_cents") },
          { type: "wellbeing_delta", field: "burnoutPpm", magnitude: fixed(60_000) },
        ],
      },
      {
        id: "stabilize_then_save",
        principle: "A temporary stabilization lowers today's bill but leaves disruption and follow-up risk.",
        effects: [
          { type: "required_obligation_delta", magnitude: parameter("repair_cost_cents", 550_000) },
          { type: "wellbeing_delta", field: "burnoutPpm", magnitude: fixed(140_000) },
        ],
      },
    ],
  }),
  personalTemplate({
    id: "personal.wedding_invitation",
    tier: "micro",
    principle: "A values-based spending plan makes room for relationships without pretending every invitation is mandatory.",
    weaknesses: ["low_emergency_fund", "high_credit_utilization", "lifestyle_fragility"],
    parameterId: "attendance_cost_cents",
    minimumCents: 30_000,
    maximumCents: 350_000,
    choices: [
      {
        id: "attend_full_trip",
        principle: "Choosing the full celebration spends money in service of a valued relationship.",
        effects: [
          { type: "required_obligation_delta", magnitude: parameter("attendance_cost_cents") },
          { type: "wellbeing_delta", field: "happinessPpm", magnitude: fixed(75_000) },
        ],
      },
      {
        id: "attend_on_a_budget",
        principle: "A spending boundary can preserve both the relationship and the financial plan.",
        effects: [
          { type: "required_obligation_delta", magnitude: parameter("attendance_cost_cents", 500_000) },
          { type: "wellbeing_delta", field: "happinessPpm", magnitude: fixed(40_000) },
        ],
      },
      {
        id: "decline_invitation",
        principle: "Declining protects liquidity but may carry an emotional cost.",
        effects: [
          { type: "wellbeing_delta", field: "happinessPpm", magnitude: fixed(-35_000) },
        ],
      },
    ],
  }),
  personalTemplate({
    id: "personal.family_care_request",
    tier: "medium",
    principle: "Caregiving is a real financial risk that calls for boundaries, time, and a reserve—not guilt-driven improvisation.",
    weaknesses: ["low_emergency_fund", "high_fixed_costs", "lifestyle_fragility"],
    parameterId: "care_cost_cents",
    minimumCents: 75_000,
    maximumCents: 900_000,
    choices: [
      {
        id: "fund_the_request",
        principle: "Providing the full amount protects the family member but transfers the cash shock to you.",
        effects: [
          { type: "required_obligation_delta", magnitude: parameter("care_cost_cents") },
          { type: "wellbeing_delta", field: "happinessPpm", magnitude: fixed(45_000) },
        ],
      },
      {
        id: "share_cost_and_time",
        principle: "Sharing care reduces cash cost while demanding more personal time.",
        effects: [
          { type: "required_obligation_delta", magnitude: parameter("care_cost_cents", 450_000) },
          { type: "wellbeing_delta", field: "burnoutPpm", magnitude: fixed(90_000) },
        ],
      },
      {
        id: "set_a_financial_boundary",
        principle: "A firm boundary protects the household plan but can be emotionally difficult.",
        effects: [
          { type: "wellbeing_delta", field: "happinessPpm", magnitude: fixed(-50_000) },
        ],
      },
    ],
  }),
  personalTemplate({
    id: "personal.essential_device_failure",
    tier: "micro",
    principle: "Replacement reserves keep predictable equipment failures from becoming revolving debt.",
    weaknesses: ["low_emergency_fund", "high_credit_utilization"],
    parameterId: "replacement_cost_cents",
    minimumCents: 40_000,
    maximumCents: 300_000,
    choices: [
      {
        id: "buy_reliable_replacement",
        principle: "A reliable replacement restores productivity at the full current cost.",
        effects: [
          { type: "required_obligation_delta", magnitude: parameter("replacement_cost_cents") },
        ],
      },
      {
        id: "buy_refurbished",
        principle: "Buying refurbished reduces the immediate bill with a modest inconvenience tradeoff.",
        effects: [
          { type: "required_obligation_delta", magnitude: parameter("replacement_cost_cents", 550_000) },
          { type: "wellbeing_delta", field: "burnoutPpm", magnitude: fixed(25_000) },
        ],
      },
    ],
  }),
];

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

for (const template of rawTemplates) assertValidEventTemplate(template);

export const EVENT_TEMPLATES: readonly EventTemplate[] = deepFreeze([
  ...rawTemplates,
]);

const templatesById = new Map(
  EVENT_TEMPLATES.map((template) => [template.id, template] as const),
);
if (templatesById.size !== EVENT_TEMPLATES.length) {
  throw new EventCatalogError("UNKNOWN_TEMPLATE", "event template identifiers must be unique");
}

export function getEventTemplate(
  templateId: string,
  version?: number,
): EventTemplate {
  const template = templatesById.get(templateId);
  if (!template) {
    throw new EventCatalogError(
      "UNKNOWN_TEMPLATE",
      `event template ${templateId} is not in the engine-owned catalog`,
    );
  }
  if (version !== undefined && version !== template.version) {
    throw new EventCatalogError(
      "TEMPLATE_VERSION_MISMATCH",
      `event template ${templateId} is version ${template.version}, not ${version}`,
    );
  }
  return template;
}
