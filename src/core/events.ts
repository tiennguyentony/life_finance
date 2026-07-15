import {
  divideRoundHalfAwayFromZero,
  safeBigIntToNumber,
} from "./domain/integer";
import {
  moneyCents,
  PPM_ONE,
  ratePpm,
  type MoneyCents,
  type RatePpm,
} from "./domain/money";
import type {
  FinancialSnapshot,
  GameState,
  MarketRegime,
  WellbeingSnapshot,
} from "./game-state";

export const EVENT_SCHEMA_VERSION = 1 as const;

export type EventKind = "macro" | "personal_shock";
export type EventTier = "ambient" | "micro" | "medium" | "large" | "catastrophe";
export type EventWeakness =
  | "low_emergency_fund"
  | "high_credit_utilization"
  | "job_portfolio_correlation"
  | "portfolio_concentration"
  | "uninsured_property"
  | "high_fixed_costs"
  | "lifestyle_fragility"
  | "market_timing";
export type MarketAssetClass = "equity" | "bonds" | "cash" | "housing";

export type EventParameterDefinition = Readonly<{
  id: string;
  kind: "money_cents" | "rate_ppm";
  minimum: number;
  maximum: number;
}>;

export type EventEligibilityRule =
  | Readonly<{ type: "minimum_home_value"; amountCents: MoneyCents }>
  | Readonly<{ type: "maximum_emergency_fund_months"; months: number }>
  | Readonly<{ type: "minimum_credit_utilization"; utilizationPpm: RatePpm }>
  | Readonly<{ type: "market_regime"; regimes: readonly MarketRegime[] }>
  | Readonly<{ type: "career_track"; careerTrackIds: readonly string[] }>
  | Readonly<{ type: "location"; locationIds: readonly string[] }>;

export type EventEffectMagnitude =
  | Readonly<{ source: "fixed"; value: number }>
  | Readonly<{
      source: "parameter";
      parameterId: string;
      multiplierPpm: RatePpm;
    }>;

export type EventEffect =
  | Readonly<{
      type: "required_obligation_delta";
      magnitude: EventEffectMagnitude;
    }>
  | Readonly<{
      type: "annual_living_cost_delta";
      magnitude: EventEffectMagnitude;
    }>
  | Readonly<{
      type: "wellbeing_delta";
      field: keyof WellbeingSnapshot;
      magnitude: EventEffectMagnitude;
    }>
  | Readonly<{
      type: "market_return_modifier";
      assetClass: MarketAssetClass;
      magnitude: EventEffectMagnitude;
    }>;

export type EventChoice = Readonly<{
  id: string;
  principle: string;
  effects: readonly EventEffect[];
}>;

export type EventTemplate = Readonly<{
  schemaVersion: typeof EVENT_SCHEMA_VERSION;
  id: string;
  version: number;
  kind: EventKind;
  tier: EventTier;
  teachingPrinciple: string;
  targetsWeaknesses: readonly EventWeakness[];
  parameters: readonly EventParameterDefinition[];
  eligibility: readonly EventEligibilityRule[];
  automaticEffects: readonly EventEffect[];
  choices: readonly EventChoice[];
}>;

export type EventProposal = Readonly<{
  eventId: string;
  templateId: string;
  templateVersion: number;
  parameters: Readonly<Record<string, number>>;
}>;

export type ResolvedEvent = Readonly<{
  eventId: string;
  templateId: string;
  templateVersion: number;
  kind: EventKind;
  tier: EventTier;
  choiceId: string | null;
  teachingPrinciple: string;
  targetsWeaknesses: readonly EventWeakness[];
  parameters: Readonly<Record<string, number>>;
}>;

export type EventApplication = Readonly<{
  event: ResolvedEvent;
  finances: FinancialSnapshot;
  wellbeing: WellbeingSnapshot;
  marketReturnModifiers: Readonly<Record<MarketAssetClass, RatePpm>>;
}>;

export type EventTemplateViolation = Readonly<{
  path: string;
  code: string;
  message: string;
}>;

export class EventDomainError extends Error {
  readonly code:
    | "INVALID_TEMPLATE"
    | "INVALID_PROPOSAL"
    | "EVENT_NOT_APPLICABLE"
    | "INVALID_CHOICE"
    | "RUN_TERMINAL"
    | "EFFECT_OUT_OF_RANGE";
  readonly details: readonly string[];

  constructor(
    code: EventDomainError["code"],
    message: string,
    details: readonly string[] = [],
  ) {
    super(message);
    this.name = "EventDomainError";
    this.code = code;
    this.details = Object.freeze([...details]);
  }
}

const IDENTIFIER_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const MARKET_REGIMES: readonly MarketRegime[] = [
  "expansion",
  "inflation",
  "recession",
  "recovery",
];
const ASSET_CLASSES: readonly MarketAssetClass[] = [
  "equity",
  "bonds",
  "cash",
  "housing",
];
const EVENT_TIERS: readonly EventTier[] = [
  "ambient",
  "micro",
  "medium",
  "large",
  "catastrophe",
];
const EVENT_WEAKNESSES: readonly EventWeakness[] = [
  "low_emergency_fund",
  "high_credit_utilization",
  "job_portfolio_correlation",
  "portfolio_concentration",
  "uninsured_property",
  "high_fixed_costs",
  "lifestyle_fragility",
  "market_timing",
];

function violation(
  path: string,
  code: string,
  message: string,
): EventTemplateViolation {
  return { path, code, message };
}

function validateMagnitude(
  magnitude: EventEffectMagnitude,
  path: string,
  parameters: ReadonlyMap<string, EventParameterDefinition>,
  expectedKind: EventParameterDefinition["kind"],
): EventTemplateViolation[] {
  const violations: EventTemplateViolation[] = [];
  if (magnitude.source === "fixed") {
    if (!Number.isSafeInteger(magnitude.value)) {
      violations.push(
        violation(path, "invalid_fixed_effect", "must be safe integer domain units"),
      );
    }
    return violations;
  }

  const parameter = parameters.get(magnitude.parameterId);
  if (!parameter) {
    violations.push(
      violation(
        `${path}.parameterId`,
        "unknown_parameter",
        "must reference a declared parameter",
      ),
    );
  } else if (parameter.kind !== expectedKind) {
    violations.push(
      violation(
        `${path}.parameterId`,
        "parameter_kind_mismatch",
        `must reference a ${expectedKind} parameter`,
      ),
    );
  }
  if (
    !Number.isSafeInteger(magnitude.multiplierPpm) ||
    magnitude.multiplierPpm < -PPM_ONE ||
    magnitude.multiplierPpm > PPM_ONE
  ) {
    violations.push(
      violation(
        `${path}.multiplierPpm`,
        "invalid_multiplier",
        "must be between -1,000,000 and 1,000,000 PPM",
      ),
    );
  }
  return violations;
}

function validateEffect(
  effect: EventEffect,
  path: string,
  parameters: ReadonlyMap<string, EventParameterDefinition>,
): EventTemplateViolation[] {
  const expectedKind =
    effect.type === "required_obligation_delta" ||
    effect.type === "annual_living_cost_delta"
      ? "money_cents"
      : "rate_ppm";
  const violations = validateMagnitude(
    effect.magnitude,
    `${path}.magnitude`,
    parameters,
    expectedKind,
  );
  if (
    effect.type === "market_return_modifier" &&
    !ASSET_CLASSES.includes(effect.assetClass)
  ) {
    violations.push(
      violation(
        `${path}.assetClass`,
        "invalid_asset_class",
        "must reference a supported market asset class",
      ),
    );
  }
  return violations;
}

export function validateEventTemplate(
  template: EventTemplate,
): readonly EventTemplateViolation[] {
  const violations: EventTemplateViolation[] = [];
  if (template.schemaVersion !== EVENT_SCHEMA_VERSION) {
    violations.push(
      violation("schemaVersion", "unsupported_schema", "must be event schema version 1"),
    );
  }
  if (!IDENTIFIER_PATTERN.test(template.id)) {
    violations.push(violation("id", "invalid_identifier", "must be a safe identifier"));
  }
  if (!Number.isSafeInteger(template.version) || template.version < 1) {
    violations.push(
      violation("version", "invalid_version", "must be a positive safe integer"),
    );
  }
  if (template.kind !== "macro" && template.kind !== "personal_shock") {
    violations.push(
      violation("kind", "invalid_event_kind", "must be macro or personal_shock"),
    );
  }
  if (!EVENT_TIERS.includes(template.tier)) {
    violations.push(violation("tier", "invalid_tier", "must be a supported event tier"));
  }
  if (template.kind === "macro" && template.tier !== "ambient") {
    violations.push(
      violation("tier", "invalid_macro_tier", "macro events must use the ambient tier"),
    );
  }
  if (template.kind === "personal_shock" && template.tier === "ambient") {
    violations.push(
      violation(
        "tier",
        "invalid_personal_tier",
        "personal shocks must use micro through catastrophe tiers",
      ),
    );
  }
  if (
    template.teachingPrinciple.length < 1 ||
    template.teachingPrinciple.length > 500
  ) {
    violations.push(
      violation(
        "teachingPrinciple",
        "invalid_principle",
        "must contain 1 through 500 characters",
      ),
    );
  }
  if (
    template.targetsWeaknesses.length < 1 ||
    new Set(template.targetsWeaknesses).size !== template.targetsWeaknesses.length ||
    template.targetsWeaknesses.some(
      (weakness) => !EVENT_WEAKNESSES.includes(weakness),
    )
  ) {
    violations.push(
      violation(
        "targetsWeaknesses",
        "invalid_weaknesses",
        "must contain at least one unique supported weakness",
      ),
    );
  }

  const parameters = new Map<string, EventParameterDefinition>();
  for (const [index, parameter] of template.parameters.entries()) {
    const path = `parameters.${index}`;
    if (!IDENTIFIER_PATTERN.test(parameter.id)) {
      violations.push(
        violation(`${path}.id`, "invalid_identifier", "must be a safe identifier"),
      );
    }
    if (parameters.has(parameter.id)) {
      violations.push(
        violation(`${path}.id`, "duplicate_parameter", "must be unique"),
      );
    }
    parameters.set(parameter.id, parameter);
    if (
      !Number.isSafeInteger(parameter.minimum) ||
      !Number.isSafeInteger(parameter.maximum) ||
      parameter.minimum > parameter.maximum
    ) {
      violations.push(
        violation(path, "invalid_parameter_range", "must be an ordered safe integer range"),
      );
    }
    if (
      parameter.kind === "money_cents" &&
      (parameter.minimum < 0 || parameter.maximum < 0)
    ) {
      violations.push(
        violation(path, "invalid_money_range", "money parameters must be non-negative"),
      );
    }
    if (
      parameter.kind === "rate_ppm" &&
      (parameter.minimum < -PPM_ONE || parameter.maximum > PPM_ONE)
    ) {
      violations.push(
        violation(path, "invalid_rate_range", "rate parameters must fit signed PPM"),
      );
    }
  }

  for (const [index, rule] of template.eligibility.entries()) {
    const path = `eligibility.${index}`;
    if (rule.type === "minimum_home_value" && rule.amountCents < 0) {
      violations.push(
        violation(`${path}.amountCents`, "invalid_amount", "must be non-negative"),
      );
    }
    if (
      rule.type === "maximum_emergency_fund_months" &&
      (!Number.isSafeInteger(rule.months) || rule.months < 0 || rule.months > 120)
    ) {
      violations.push(
        violation(`${path}.months`, "invalid_months", "must be an integer from 0 to 120"),
      );
    }
    if (
      rule.type === "minimum_credit_utilization" &&
      (!Number.isSafeInteger(rule.utilizationPpm) ||
        rule.utilizationPpm < 0 ||
        rule.utilizationPpm > PPM_ONE)
    ) {
      violations.push(
        violation(
          `${path}.utilizationPpm`,
          "invalid_rate",
          "must be between 0 and 1,000,000 PPM",
        ),
      );
    }
    if (
      rule.type === "market_regime" &&
      (rule.regimes.length === 0 ||
        rule.regimes.some((regime) => !MARKET_REGIMES.includes(regime)))
    ) {
      violations.push(
        violation(`${path}.regimes`, "invalid_regimes", "must contain supported regimes"),
      );
    }
    const eligibilityIds =
      rule.type === "career_track"
        ? rule.careerTrackIds
        : rule.type === "location"
          ? rule.locationIds
          : null;
    if (
      eligibilityIds &&
      (eligibilityIds.length === 0 ||
        eligibilityIds.some((id) => !IDENTIFIER_PATTERN.test(id)))
    ) {
      violations.push(
        violation(path, "invalid_eligibility_ids", "must contain safe identifiers"),
      );
    }
  }

  if (template.kind === "macro") {
    if (template.choices.length !== 0) {
      violations.push(
        violation("choices", "macro_choices_forbidden", "macro events apply automatically"),
      );
    }
    if (
      template.automaticEffects.length === 0 ||
      template.automaticEffects.some(
        (effect) => effect.type !== "market_return_modifier",
      )
    ) {
      violations.push(
        violation(
          "automaticEffects",
          "invalid_macro_effect",
          "macro events must only modify market returns",
        ),
      );
    }
  } else {
    if (template.automaticEffects.length !== 0) {
      violations.push(
        violation(
          "automaticEffects",
          "personal_automatic_effect_forbidden",
          "personal shock effects must belong to a player choice",
        ),
      );
    }
    if (template.choices.length < 2 || template.choices.length > 3) {
      violations.push(
        violation("choices", "invalid_choice_count", "must contain two or three choices"),
      );
    }
  }

  for (const [index, effect] of template.automaticEffects.entries()) {
    violations.push(...validateEffect(effect, `automaticEffects.${index}`, parameters));
  }
  const choiceIds = new Set<string>();
  for (const [choiceIndex, choice] of template.choices.entries()) {
    const path = `choices.${choiceIndex}`;
    if (!IDENTIFIER_PATTERN.test(choice.id) || choiceIds.has(choice.id)) {
      violations.push(
        violation(`${path}.id`, "invalid_choice_id", "must be a unique safe identifier"),
      );
    }
    choiceIds.add(choice.id);
    if (choice.principle.length < 1 || choice.principle.length > 500) {
      violations.push(
        violation(`${path}.principle`, "invalid_principle", "must contain 1 through 500 characters"),
      );
    }
    if (choice.effects.length === 0) {
      violations.push(
        violation(`${path}.effects`, "missing_effect", "must contain at least one effect"),
      );
    }
    for (const [effectIndex, effect] of choice.effects.entries()) {
      if (effect.type === "market_return_modifier") {
        violations.push(
          violation(
            `${path}.effects.${effectIndex}`,
            "personal_market_effect_forbidden",
            "personal shocks cannot change market returns",
          ),
        );
      }
      violations.push(
        ...validateEffect(effect, `${path}.effects.${effectIndex}`, parameters),
      );
    }
  }
  return Object.freeze(violations);
}

export function assertValidEventTemplate(template: EventTemplate): void {
  const violations = validateEventTemplate(template);
  if (violations.length > 0) {
    throw new EventDomainError(
      "INVALID_TEMPLATE",
      `event template violates ${violations.length} invariant${violations.length === 1 ? "" : "s"}`,
      violations.map(({ path, code }) => `${path}:${code}`),
    );
  }
}

export function eventApplicabilityReasons(
  template: EventTemplate,
  state: GameState,
): readonly string[] {
  const reasons: string[] = [];
  for (const rule of template.eligibility) {
    switch (rule.type) {
      case "minimum_home_value":
        if (state.finances.homeValueCents < rule.amountCents) {
          reasons.push("minimum_home_value");
        }
        break;
      case "maximum_emergency_fund_months":
        if (
          state.finances.annualLivingCostCents === 0 ||
          BigInt(state.finances.cashCents) * BigInt(12) >
            BigInt(state.finances.annualLivingCostCents) * BigInt(rule.months)
        ) {
          reasons.push("maximum_emergency_fund_months");
        }
        break;
      case "minimum_credit_utilization":
        if (
          state.finances.creditLimitCents === 0 ||
          BigInt(state.finances.creditUsedCents) * BigInt(PPM_ONE) <
            BigInt(state.finances.creditLimitCents) * BigInt(rule.utilizationPpm)
        ) {
          reasons.push("minimum_credit_utilization");
        }
        break;
      case "market_regime":
        if (!rule.regimes.includes(state.marketRegime)) reasons.push("market_regime");
        break;
      case "career_track":
        if (!rule.careerTrackIds.includes(state.player.careerTrackId)) {
          reasons.push("career_track");
        }
        break;
      case "location":
        if (!rule.locationIds.includes(state.player.locationId)) reasons.push("location");
        break;
    }
  }
  return Object.freeze(reasons);
}

function validateProposal(template: EventTemplate, proposal: EventProposal): void {
  const details: string[] = [];
  if (!IDENTIFIER_PATTERN.test(proposal.eventId)) details.push("eventId:invalid_identifier");
  if (proposal.templateId !== template.id) details.push("templateId:mismatch");
  if (proposal.templateVersion !== template.version) details.push("templateVersion:mismatch");

  const definitions = new Map(
    template.parameters.map((parameter) => [parameter.id, parameter] as const),
  );
  for (const parameter of template.parameters) {
    const value = proposal.parameters[parameter.id];
    if (
      !Number.isSafeInteger(value) ||
      value < parameter.minimum ||
      value > parameter.maximum
    ) {
      details.push(`parameters.${parameter.id}:out_of_range`);
    }
  }
  for (const id of Object.keys(proposal.parameters)) {
    if (!definitions.has(id)) details.push(`parameters.${id}:unknown`);
  }
  if (details.length > 0) {
    throw new EventDomainError(
      "INVALID_PROPOSAL",
      "event proposal does not satisfy its engine-owned template",
      details,
    );
  }
}

function resolveMagnitude(
  magnitude: EventEffectMagnitude,
  parameters: Readonly<Record<string, number>>,
): number {
  if (magnitude.source === "fixed") return magnitude.value;
  return safeBigIntToNumber(
    divideRoundHalfAwayFromZero(
      BigInt(parameters[magnitude.parameterId]) * BigInt(magnitude.multiplierPpm),
      BigInt(PPM_ONE),
    ),
    "event effect",
  );
}

function addExact(left: number, right: number, label: string): number {
  return safeBigIntToNumber(BigInt(left) + BigInt(right), label);
}

function boundedWellbeing(value: number): RatePpm {
  return ratePpm(Math.max(0, Math.min(PPM_ONE, value)));
}

export function applyEvent(
  state: GameState,
  template: EventTemplate,
  proposal: EventProposal,
  choiceId?: string,
): EventApplication {
  if (state.outcome) {
    throw new EventDomainError("RUN_TERMINAL", "terminal runs reject new events");
  }
  assertValidEventTemplate(template);
  validateProposal(template, proposal);
  const applicabilityReasons = eventApplicabilityReasons(template, state);
  if (applicabilityReasons.length > 0) {
    throw new EventDomainError(
      "EVENT_NOT_APPLICABLE",
      "event does not satisfy its deterministic eligibility rules",
      applicabilityReasons,
    );
  }

  let selectedChoice: EventChoice | undefined;
  if (template.kind === "personal_shock") {
    selectedChoice = template.choices.find((choice) => choice.id === choiceId);
    if (!selectedChoice) {
      throw new EventDomainError(
        "INVALID_CHOICE",
        "personal shocks require one declared mitigation choice",
      );
    }
  } else if (choiceId !== undefined) {
    throw new EventDomainError("INVALID_CHOICE", "macro events do not accept choices");
  }

  let requiredObligations = state.finances.requiredObligationsCents as number;
  let annualLivingCost = state.finances.annualLivingCostCents as number;
  let burnout = state.wellbeing.burnoutPpm as number;
  let happiness = state.wellbeing.happinessPpm as number;
  const modifiers: Record<MarketAssetClass, number> = {
    equity: 0,
    bonds: 0,
    cash: 0,
    housing: 0,
  };
  const effects = selectedChoice?.effects ?? template.automaticEffects;
  for (const effect of effects) {
    const amount = resolveMagnitude(effect.magnitude, proposal.parameters);
    switch (effect.type) {
      case "required_obligation_delta":
        requiredObligations = addExact(requiredObligations, amount, "required obligations");
        break;
      case "annual_living_cost_delta":
        annualLivingCost = addExact(annualLivingCost, amount, "annual living cost");
        break;
      case "wellbeing_delta":
        if (effect.field === "burnoutPpm") burnout = addExact(burnout, amount, "burnout");
        else happiness = addExact(happiness, amount, "happiness");
        break;
      case "market_return_modifier":
        modifiers[effect.assetClass] = addExact(
          modifiers[effect.assetClass],
          amount,
          `${effect.assetClass} event modifier`,
        );
        break;
    }
  }

  if (requiredObligations < 0 || annualLivingCost < 0) {
    throw new EventDomainError(
      "EFFECT_OUT_OF_RANGE",
      "event effects cannot make financial plan amounts negative",
    );
  }
  for (const [assetClass, modifier] of Object.entries(modifiers)) {
    if (modifier < -500_000 || modifier > 500_000) {
      throw new EventDomainError(
        "EFFECT_OUT_OF_RANGE",
        `${assetClass} event modifier must remain within +/-500,000 PPM`,
      );
    }
  }

  const frozenParameters = Object.freeze({ ...proposal.parameters });
  return Object.freeze({
    event: Object.freeze({
      eventId: proposal.eventId,
      templateId: template.id,
      templateVersion: template.version,
      kind: template.kind,
      tier: template.tier,
      choiceId: selectedChoice?.id ?? null,
      teachingPrinciple: template.teachingPrinciple,
      targetsWeaknesses: Object.freeze([...template.targetsWeaknesses]),
      parameters: frozenParameters,
    }),
    finances: Object.freeze({
      ...state.finances,
      requiredObligationsCents: moneyCents(requiredObligations),
      annualLivingCostCents: moneyCents(annualLivingCost),
    }),
    wellbeing: Object.freeze({
      burnoutPpm: boundedWellbeing(burnout),
      happinessPpm: boundedWellbeing(happiness),
    }),
    marketReturnModifiers: Object.freeze({
      equity: ratePpm(modifiers.equity),
      bonds: ratePpm(modifiers.bonds),
      cash: ratePpm(modifiers.cash),
      housing: ratePpm(modifiers.housing),
    }),
  });
}
