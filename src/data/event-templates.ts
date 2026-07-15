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
