import { nextInt, type RandomState } from "./domain/rng";
import { compareMonths, monthsBetween, simulationMonth } from "./domain/month";
import type { GameStateV2 } from "./game-state-v2";
import { sha256Canonical } from "./canonical";
import { eventOpportunityDrawV1 } from "./world-random-v1";
import {
  UNRELATED_HAZARD_TARGET,
  type EventProposal,
  type EventTier,
} from "./events";

export const PERSONAL_EVENT_SCHEMA_V2 = 2 as const;

export type PersonalEventClassificationV2 = "positive" | "neutral" | "negative";
export type PersonalEventCategoryV2 =
  | "maintenance"
  | "health"
  | "housing"
  | "career"
  | "caregiving"
  | "social"
  | "behavioral_trap"
  | "opportunity";

export type PersonalEventParameterV2 = Readonly<{
  id: string;
  kind: "money_cents" | "rate_ppm";
  distribution: "uniform_int";
  minimum: number;
  maximum: number;
}>;

export type PersonalEventMagnitudeV2 =
  | Readonly<{ source: "fixed"; value: number }>
  | Readonly<{
      source: "parameter";
      parameterId: string;
      multiplierPpm: number;
    }>;

export type PersonalEventEffectV2 =
  | Readonly<{
      type: "required_obligation_delta";
      magnitude: PersonalEventMagnitudeV2;
    }>
  | Readonly<{
      type: "annual_living_cost_delta";
      magnitude: PersonalEventMagnitudeV2;
    }>
  | Readonly<{
      type: "wellbeing_delta";
      field: "burnoutPpm" | "happinessPpm";
      magnitude: PersonalEventMagnitudeV2;
    }>
  | Readonly<{
      type: "cash_delta";
      direction: "add" | "subtract";
      magnitude: PersonalEventMagnitudeV2;
    }>
  | Readonly<{
      type: "insurance_claim";
      mitigationId: string;
      coverage: "health" | "selected_coverage";
      coverageId?: string;
      grossAmount: PersonalEventMagnitudeV2;
    }>
  | Readonly<{
      type: "temporary_expense" | "recurring_expense" | "temporary_income";
      magnitude: PersonalEventMagnitudeV2;
      durationMonths: number;
    }>;

export type PersonalEventEligibilityV2 =
  | Readonly<{ type: "home_owned"; expected: boolean }>
  | Readonly<{ type: "employment_status"; statuses: readonly ("employed" | "legacy_unknown")[] }>
  | Readonly<{
      type: "macro_regime";
      required: readonly GameStateV2["marketRegime"][];
      blocked: readonly GameStateV2["marketRegime"][];
    }>;

export type PersonalEventHazardModifierV2 =
  | Readonly<{
      type: "employment_sector";
      sectorIds: readonly string[];
      deltaPpm: number;
    }>
  | Readonly<{
      type: "macro_regime";
      regimes: readonly GameStateV2["marketRegime"][];
      deltaPpm: number;
    }>;

export type PersonalEventTemplateV2 = Readonly<{
  schemaVersion: typeof PERSONAL_EVENT_SCHEMA_V2;
  id: string;
  version: number;
  category: PersonalEventCategoryV2;
  classification: PersonalEventClassificationV2;
  lessonTags: Readonly<{ primary: string; secondary: readonly string[] }>;
  eligibility: readonly PersonalEventEligibilityV2[];
  hazard: Readonly<{
    baseChancePpm: number;
    minimumChancePpm: number;
    maximumChancePpm: number;
    modifiers: readonly PersonalEventHazardModifierV2[];
  }>;
  severityTier: Exclude<EventTier, "ambient">;
  pressureCost: number;
  parameters: readonly PersonalEventParameterV2[];
  mitigations: readonly Readonly<{
    id: string;
    type: "health_insurance" | "selected_coverage";
    coverageId?: string;
  }>[];
  responses: readonly Readonly<{
    id: string;
    label: string;
    requiresMitigationIds: readonly string[];
    effects: readonly PersonalEventEffectV2[];
  }>[];
  followUps: readonly Readonly<{
    templateId: string;
    templateVersion: number;
    delayMonths: number;
    whenResponseIds: readonly string[];
  }>[];
  cooldowns: Readonly<{
    eventMonths: number;
    categoryMonths: number;
    lessonMonths: number;
  }>;
  maximumOccurrences: number;
  recovery: Readonly<{ durationMonths: number }>;
  fallbackNarrative: Readonly<{ headline: string; body: string }>;
}>;

export type PersonalEventTemplateV2Violation = Readonly<{
  path: string;
  code: string;
  message: string;
}>;

export type ScheduledDeclarativePersonalEventV2 = Readonly<{
  proposal: EventProposal;
  template: PersonalEventTemplateV2;
  targetedWeakness: typeof UNRELATED_HAZARD_TARGET;
  followUpSourceEventId?: string;
}>;

export type DeclarativePersonalEventScheduleV2 = Readonly<{
  event: ScheduledDeclarativePersonalEventV2 | null;
  nextRandom: RandomState;
  eligibleTemplateIds: readonly string[];
  candidateTemplateIds: readonly string[];
}>;

export type DeclarativePersonalEventCandidateV2 = Readonly<{
  template: PersonalEventTemplateV2;
  targetedWeakness: typeof UNRELATED_HAZARD_TARGET;
  followUpSourceEventId?: string;
}>;

export type DeclarativePersonalEventCandidatesV2 = Readonly<{
  candidates: readonly DeclarativePersonalEventCandidateV2[];
  nextRandom: RandomState;
  eligibleTemplateIds: readonly string[];
  candidateTemplateIds: readonly string[];
}>;

export type NamedDeclarativePersonalEventCandidatesV2 =
  DeclarativePersonalEventCandidatesV2 & Readonly<{
    rawOpportunityEvidence: readonly Readonly<{
      templateId: string;
      templateVersion: number;
      draw: number;
      chancePpm: number;
    }>[];
    rawOpportunityFingerprint: string;
  }>;

const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const CATEGORIES = new Set<string>([
  "maintenance", "health", "housing", "career", "caregiving", "social",
  "behavioral_trap", "opportunity",
]);
const CLASSIFICATIONS = new Set<string>(["positive", "neutral", "negative"]);
const SEVERITY_TIERS = new Set<string>(["micro", "medium", "large", "catastrophe"]);
const MARKET_REGIMES = new Set<string>([
  "expansion",
  "inflation",
  "recession",
  "recovery",
]);
const FNV_1A_64_OFFSET = BigInt("0xcbf29ce484222325");
const FNV_1A_64_ALT_OFFSET = BigInt("0x84222325cbf29ce4");
const FNV_1A_64_PRIME = BigInt("0x100000001b3");
const UINT64_MASK = BigInt("0xffffffffffffffff");

function personalEventFlowDigest(value: string, offset: bigint): string {
  let hash = offset;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * FNV_1A_64_PRIME) & UINT64_MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

export function personalEventEffectIdV2(
  templateId: string,
  templateVersion: number,
  responseId: string,
  effectIndex: number,
): string {
  return `${templateId}@${templateVersion}.${responseId}.effect.${effectIndex}`;
}

export function personalEventCashFlowIdV2(
  commandId: string,
  eventId: string,
  responseId: string,
  effectIndex: number,
): string {
  const payload = `${commandId.length}:${commandId}${eventId.length}:${eventId}${responseId.length}:${responseId}:${effectIndex}`;
  return `pef.${personalEventFlowDigest(payload, FNV_1A_64_OFFSET)}${personalEventFlowDigest(payload, FNV_1A_64_ALT_OFFSET)}`;
}

function violation(path: string, code: string, message: string): PersonalEventTemplateV2Violation {
  return { path, code, message };
}

function validPpm(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000;
}

function containsNonJsonValue(value: unknown, seen = new Set<object>()): boolean {
  if (
    typeof value === "function" ||
    typeof value === "symbol" ||
    typeof value === "bigint" ||
    value === undefined ||
    (typeof value === "number" && !Number.isFinite(value))
  ) return true;
  if (value === null || typeof value !== "object") return false;
  if (seen.has(value)) return true;
  seen.add(value);
  const invalid = Object.values(value).some((nested) => containsNonJsonValue(nested, seen));
  seen.delete(value);
  return invalid;
}

function validateMagnitude(
  magnitude: unknown,
  path: string,
  parameters: ReadonlyMap<string, PersonalEventParameterV2["kind"]>,
  expectedKind: PersonalEventParameterV2["kind"],
): PersonalEventTemplateV2Violation[] {
  if (magnitude === null || typeof magnitude !== "object") {
    return [violation(path, "missing_effect_magnitude", "effect requires a declarative magnitude")];
  }
  const record = magnitude as Readonly<Record<string, unknown>>;
  if (record.source === "fixed") {
    return Number.isSafeInteger(record.value)
      ? []
      : [violation(path, "invalid_fixed_magnitude", "fixed magnitude must be a safe integer")];
  }
  if (record.source !== "parameter") {
    return [violation(`${path}.source`, "invalid_magnitude_source", "magnitude source must be fixed or parameter")];
  }
  const violations: PersonalEventTemplateV2Violation[] = [];
  if (typeof record.parameterId !== "string" || !parameters.has(record.parameterId)) {
    violations.push(violation(`${path}.parameterId`, "unknown_parameter", "must reference a declared parameter"));
  } else if (parameters.get(record.parameterId) !== expectedKind) {
    violations.push(violation(
      `${path}.parameterId`,
      "invalid_effect_parameter_kind",
      `effect requires a ${expectedKind} parameter`,
    ));
  }
  if (!Number.isSafeInteger(record.multiplierPpm) || Math.abs(Number(record.multiplierPpm)) > 1_000_000) {
    violations.push(violation(`${path}.multiplierPpm`, "invalid_multiplier", "must be signed PPM"));
  }
  return violations;
}

export function validatePersonalEventTemplateV2(
  template: PersonalEventTemplateV2,
): readonly PersonalEventTemplateV2Violation[] {
  const violations: PersonalEventTemplateV2Violation[] = [];
  if (containsNonJsonValue(template)) {
    violations.push(violation("$", "non_json_value", "event configuration must be deterministic JSON data"));
  }
  if (template.schemaVersion !== PERSONAL_EVENT_SCHEMA_V2) {
    violations.push(violation("schemaVersion", "unsupported_schema", "must use personal event schema 2"));
  }
  if (!IDENTIFIER.test(template.id) || !Number.isSafeInteger(template.version) || template.version < 2) {
    violations.push(violation("id", "invalid_event_identity", "requires a stable id and version >= 2"));
  }
  if (!CATEGORIES.has(template.category)) {
    violations.push(violation("category", "invalid_category", "category must use a supported personal-event category"));
  }
  if (!CLASSIFICATIONS.has(template.classification)) {
    violations.push(violation("classification", "invalid_classification", "classification must be positive, neutral, or negative"));
  }
  if (!SEVERITY_TIERS.has(template.severityTier)) {
    violations.push(violation("severityTier", "invalid_severity_tier", "severity must be a supported non-ambient event tier"));
  }
  if (!IDENTIFIER.test(template.lessonTags.primary)) {
    violations.push(violation("lessonTags.primary", "missing_primary_lesson", "requires a machine-readable primary lesson"));
  }
  if (
    new Set(template.lessonTags.secondary).size !== template.lessonTags.secondary.length ||
    template.lessonTags.secondary.some((tag) => !IDENTIFIER.test(tag) || tag === template.lessonTags.primary)
  ) {
    violations.push(violation("lessonTags.secondary", "invalid_secondary_lessons", "secondary lessons must be unique identifiers"));
  }
  const parameterIds = new Map<string, PersonalEventParameterV2["kind"]>();
  template.parameters.forEach((parameter, index) => {
    if (!IDENTIFIER.test(parameter.id) || parameterIds.has(parameter.id)) {
      violations.push(violation(`parameters.${index}.id`, "invalid_parameter_id", "parameter ids must be unique identifiers"));
    }
    parameterIds.set(parameter.id, parameter.kind);
    if (parameter.kind !== "money_cents" && parameter.kind !== "rate_ppm") {
      violations.push(violation(`parameters.${index}.kind`, "invalid_parameter_kind", "parameter kind must use supported domain units"));
    }
    if (parameter.distribution !== "uniform_int") {
      violations.push(violation(`parameters.${index}.distribution`, "invalid_parameter_distribution", "parameter distribution must be deterministic uniform_int"));
    }
    if (
      !Number.isSafeInteger(parameter.minimum) ||
      !Number.isSafeInteger(parameter.maximum) ||
      parameter.minimum > parameter.maximum ||
      (parameter.kind === "money_cents" && parameter.minimum < 0) ||
      (parameter.kind === "rate_ppm" && (parameter.minimum < -1_000_000 || parameter.maximum > 1_000_000))
    ) {
      violations.push(violation(`parameters.${index}`, "invalid_parameter_bounds", "parameter bounds must be ordered safe integers in domain units"));
    }
  });
  if (
    !validPpm(template.hazard.baseChancePpm) ||
    !validPpm(template.hazard.minimumChancePpm) ||
    !validPpm(template.hazard.maximumChancePpm) ||
    template.hazard.minimumChancePpm > template.hazard.maximumChancePpm ||
    template.hazard.baseChancePpm < template.hazard.minimumChancePpm ||
    template.hazard.baseChancePpm > template.hazard.maximumChancePpm
  ) {
    violations.push(violation("hazard", "invalid_hazard_bounds", "hazard chance must be bounded PPM"));
  }
  template.hazard.modifiers.forEach((modifier, index) => {
    if (modifier.type !== "macro_regime" && modifier.type !== "employment_sector") {
      violations.push(violation(`hazard.modifiers.${index}.type`, "invalid_hazard_modifier_type", "hazard modifier type is unsupported"));
    } else if (
      modifier.type === "macro_regime" &&
      (modifier.regimes.length === 0 || modifier.regimes.some((regime) => !MARKET_REGIMES.has(regime)))
    ) {
      violations.push(violation(`hazard.modifiers.${index}.regimes`, "invalid_hazard_modifier", "macro modifier requires supported regimes"));
    } else if (
      modifier.type === "employment_sector" &&
      (modifier.sectorIds.length === 0 || modifier.sectorIds.some((sectorId) => !IDENTIFIER.test(sectorId)))
    ) {
      violations.push(violation(`hazard.modifiers.${index}.sectorIds`, "invalid_hazard_modifier", "sector modifier requires stable sector identifiers"));
    }
    if (!Number.isSafeInteger(modifier.deltaPpm) || Math.abs(modifier.deltaPpm) > 1_000_000) {
      violations.push(violation(`hazard.modifiers.${index}.deltaPpm`, "invalid_hazard_modifier", "modifier must be signed PPM"));
    }
  });
  template.eligibility.forEach((rule, index) => {
    if (rule.type !== "home_owned" && rule.type !== "employment_status" && rule.type !== "macro_regime") {
      violations.push(violation(`eligibility.${index}.type`, "invalid_eligibility_rule", "eligibility rule type is unsupported"));
      return;
    }
    if (rule.type === "home_owned" && typeof rule.expected !== "boolean") {
      violations.push(violation(`eligibility.${index}.expected`, "invalid_eligibility_rule", "home ownership rule requires a boolean expectation"));
    }
    if (
      rule.type === "employment_status" &&
      (rule.statuses.length === 0 || rule.statuses.some((status) => status !== "employed" && status !== "legacy_unknown"))
    ) {
      violations.push(violation(`eligibility.${index}.statuses`, "invalid_eligibility_rule", "employment rule requires supported statuses"));
    }
    if (
      rule.type === "macro_regime" &&
      (rule.required.some((regime) => rule.blocked.includes(regime)) ||
        rule.required.some((regime) => !MARKET_REGIMES.has(regime)) ||
        rule.blocked.some((regime) => !MARKET_REGIMES.has(regime)))
    ) {
      violations.push(violation(`eligibility.${index}`, "macro_condition_conflict", "a macro regime cannot be both required and blocked"));
    }
  });
  if (!Number.isSafeInteger(template.pressureCost) || template.pressureCost < 0) {
    violations.push(violation("pressureCost", "invalid_pressure_cost", "pressure cost must be a non-negative integer"));
  }
  const mitigationIds = new Set<string>();
  template.mitigations.forEach((mitigation, index) => {
    if (!IDENTIFIER.test(mitigation.id) || mitigationIds.has(mitigation.id)) {
      violations.push(violation(`mitigations.${index}.id`, "duplicate_mitigation_id", "mitigation ids must be unique identifiers"));
    }
    mitigationIds.add(mitigation.id);
    if (mitigation.type !== "health_insurance" && mitigation.type !== "selected_coverage") {
      violations.push(violation(`mitigations.${index}.type`, "invalid_mitigation_type", "mitigation type is unsupported"));
    }
    if (
      mitigation.type === "selected_coverage" &&
      (mitigation.coverageId === undefined || !IDENTIFIER.test(mitigation.coverageId))
    ) {
      violations.push(violation(`mitigations.${index}.coverageId`, "unsupported_coverage_reference", "selected coverage mitigation requires a supported coverage identifier"));
    }
  });
  const responseIds = new Set<string>();
  if (template.responses.length === 0) {
    violations.push(violation("responses", "missing_response", "event requires at least one player response"));
  }
  const supportedEffects = new Set([
    "required_obligation_delta",
    "annual_living_cost_delta",
    "wellbeing_delta",
    "cash_delta",
    "insurance_claim",
    "temporary_expense",
    "recurring_expense",
    "temporary_income",
  ]);
  template.responses.forEach((response, responseIndex) => {
    if (!IDENTIFIER.test(response.id) || responseIds.has(response.id)) {
      violations.push(violation(`responses.${responseIndex}.id`, "duplicate_response_id", "response ids must be unique identifiers"));
    }
    responseIds.add(response.id);
    if (response.effects.length === 0) {
      violations.push(violation(`responses.${responseIndex}.effects`, "missing_machine_effect", "response requires a machine-readable effect"));
    }
    if (response.requiresMitigationIds.some((id) => !mitigationIds.has(id))) {
      violations.push(violation(`responses.${responseIndex}.requiresMitigationIds`, "unknown_mitigation", "response references an unknown mitigation"));
    }
    if (response.effects.filter(({ type }) => type === "insurance_claim").length > 1) {
      violations.push(violation(`responses.${responseIndex}.effects`, "multiple_insurance_claims", "a response may adjudicate at most one insurance claim"));
    }
    response.effects.forEach((effect, effectIndex) => {
      const effectRecord = effect as unknown as Readonly<Record<string, unknown>>;
      const effectType = effectRecord.type;
      const effectPath = `responses.${responseIndex}.effects.${effectIndex}`;
      if (
        effectType === "liquidate_asset" &&
        !["taxableBroadIndexCents", "taxableSectorCents", "taxableSpeculativeCents"].includes(String(effectRecord.account))
      ) {
        violations.push(violation(`${effectPath}.account`, "unsupported_account_reference", "liquidation must reference an eligible taxable account"));
      }
      if (typeof effectType !== "string" || !supportedEffects.has(effectType)) {
        violations.push(violation(effectPath, "invalid_effect_operation", "effect must use an implemented declarative operation"));
        return;
      }
      const magnitude = effectType === "insurance_claim"
        ? effectRecord.grossAmount
        : effectRecord.magnitude;
      violations.push(...validateMagnitude(
        magnitude,
        `${effectPath}.magnitude`,
        parameterIds,
        effectType === "wellbeing_delta" ? "rate_ppm" : "money_cents",
      ));
      const magnitudeRecord = magnitude as Readonly<Record<string, unknown>> | undefined;
      if (
        (effectType === "cash_delta" ||
          effectType === "temporary_expense" ||
          effectType === "recurring_expense" ||
          effectType === "temporary_income" ||
          effectType === "insurance_claim") &&
        magnitudeRecord !== undefined &&
        ((magnitudeRecord.source === "fixed" && Number(magnitudeRecord.value) < 0) ||
          (magnitudeRecord.source === "parameter" && Number(magnitudeRecord.multiplierPpm) < 0))
      ) {
        violations.push(violation(
          `${effectPath}.magnitude`,
          "negative_effect_magnitude",
          "cash-flow and insurance magnitudes must be non-negative",
        ));
      }
      if (effectType === "cash_delta" && effectRecord.direction !== "add" && effectRecord.direction !== "subtract") {
        violations.push(violation(`${effectPath}.direction`, "invalid_cash_direction", "cash direction must add or subtract"));
      }
      if (
        (effectType === "temporary_expense" || effectType === "recurring_expense" || effectType === "temporary_income") &&
        (!Number.isSafeInteger(effectRecord.durationMonths) || Number(effectRecord.durationMonths) < 1 || Number(effectRecord.durationMonths) > 120)
      ) {
        violations.push(violation(`${effectPath}.durationMonths`, "invalid_effect_duration", "bounded cash-flow duration must be 1 through 120 months"));
      }
      if (effectType === "wellbeing_delta" && effectRecord.field !== "burnoutPpm" && effectRecord.field !== "happinessPpm") {
        violations.push(violation(`${effectPath}.field`, "invalid_wellbeing_field", "wellbeing effect must target burnout or happiness"));
      }
      if (effectType === "insurance_claim") {
        const mitigationId = String(effectRecord.mitigationId);
        const mitigation = template.mitigations.find(({ id }) => id === mitigationId);
        if (!mitigationIds.has(String(effectRecord.mitigationId))) {
          violations.push(violation(`${effectPath}.mitigationId`, "unknown_mitigation", "claim must reference a declared mitigation"));
        }
        if (!response.requiresMitigationIds.includes(mitigationId)) {
          violations.push(violation(`${effectPath}.mitigationId`, "unrequired_claim_mitigation", "claim mitigation must be required by its response"));
        }
        if (effectRecord.coverage !== "health" && effectRecord.coverage !== "selected_coverage") {
          violations.push(violation(`${effectPath}.coverage`, "invalid_insurance_coverage", "claim coverage must use a supported insurance source"));
        }
        if (
          effectRecord.coverage === "selected_coverage" &&
          (typeof effectRecord.coverageId !== "string" || !IDENTIFIER.test(effectRecord.coverageId))
        ) {
          violations.push(violation(`${effectPath}.coverageId`, "unsupported_coverage_reference", "selected claim coverage requires a stable coverage identifier"));
        }
        if (
          mitigation &&
          ((effectRecord.coverage === "health" &&
              (mitigation.type !== "health_insurance" || effectRecord.coverageId !== undefined)) ||
            (effectRecord.coverage === "selected_coverage" &&
              (mitigation.type !== "selected_coverage" || effectRecord.coverageId !== mitigation.coverageId)))
        ) {
          violations.push(violation(`${effectPath}.mitigationId`, "claim_mitigation_mismatch", "claim coverage must exactly match its declared mitigation"));
        }
      }
    });
  });
  template.followUps.forEach((followUp, index) => {
    if (
      !IDENTIFIER.test(followUp.templateId) ||
      !Number.isSafeInteger(followUp.templateVersion) ||
      followUp.templateVersion < 2
    ) {
      violations.push(violation(`followUps.${index}`, "invalid_followup_target", "follow-up requires a stable v2 template identity"));
    }
    if (!Number.isSafeInteger(followUp.delayMonths) || followUp.delayMonths < 1 || followUp.delayMonths > 120) {
      violations.push(violation(`followUps.${index}.delayMonths`, "invalid_followup_delay", "follow-up delay must be 1 through 120 months"));
    }
    if (
      followUp.whenResponseIds.length === 0 ||
      followUp.whenResponseIds.some((responseId) => !responseIds.has(responseId))
    ) {
      violations.push(violation(`followUps.${index}.whenResponseIds`, "unknown_followup_response", "follow-up responses must exist on the template"));
    }
  });
  for (const [path, value] of Object.entries(template.cooldowns)) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 120) {
      violations.push(violation(`cooldowns.${path}`, "invalid_cooldown", "cooldowns must be 0 through 120 months"));
    }
  }
  if (!Number.isSafeInteger(template.maximumOccurrences) || template.maximumOccurrences < 1) {
    violations.push(violation("maximumOccurrences", "invalid_maximum_occurrences", "maximum occurrences must be positive"));
  }
  if (!Number.isSafeInteger(template.recovery.durationMonths) || template.recovery.durationMonths < 0 || template.recovery.durationMonths > 120) {
    violations.push(violation("recovery.durationMonths", "invalid_recovery_window", "recovery must be 0 through 120 months"));
  }
  if (template.cooldowns.eventMonths < template.recovery.durationMonths) {
    violations.push(violation("cooldowns.eventMonths", "cooldown_recovery_conflict", "event cooldown cannot end before its recovery window"));
  }
  if (!template.fallbackNarrative.headline.trim() || !template.fallbackNarrative.body.trim()) {
    violations.push(violation("fallbackNarrative", "missing_fallback_narrative", "deterministic fallback text is required"));
  }
  return Object.freeze(violations);
}

export function validatePersonalEventCatalogV2(
  templates: readonly PersonalEventTemplateV2[],
): readonly PersonalEventTemplateV2Violation[] {
  const violations: PersonalEventTemplateV2Violation[] = [];
  const identities = new Set<string>();
  templates.forEach((template, index) => {
    const identity = `${template.id}@${template.version}`;
    if (identities.has(identity)) {
      violations.push(violation(`${index}`, "duplicate_event_identity", "event id and version must be unique"));
    }
    identities.add(identity);
    violations.push(...validatePersonalEventTemplateV2(template).map((entry) => ({
      ...entry,
      path: `${index}.${entry.path}`,
    })));
  });
  templates.forEach((template, templateIndex) => {
    const followUpIdentities = new Set<string>();
    template.followUps.forEach((followUp, followUpIndex) => {
      const declarationIdentity = [
        followUp.templateId,
        followUp.templateVersion,
        followUp.delayMonths,
        [...followUp.whenResponseIds].toSorted().join(","),
      ].join("@");
      if (followUpIdentities.has(declarationIdentity)) {
        violations.push(violation(
          `${templateIndex}.followUps.${followUpIndex}`,
          "duplicate_followup_declaration",
          "an exact follow-up declaration may appear only once",
        ));
      }
      followUpIdentities.add(declarationIdentity);
      if (!identities.has(`${followUp.templateId}@${followUp.templateVersion}`)) {
        violations.push(violation(
          `${templateIndex}.followUps.${followUpIndex}`,
          "unknown_followup_target",
          "follow-up target must exist at the exact declared version",
        ));
      }
    });
  });
  return Object.freeze(violations);
}

export function personalEventEligibilityReasonsV2(
  template: PersonalEventTemplateV2,
  state: GameStateV2,
): string[] {
  const reasons: string[] = [];
  for (const rule of template.eligibility) {
    if (rule.type === "home_owned" && (state.finances.homeValueCents > 0) !== rule.expected) reasons.push(rule.type);
    if (rule.type === "employment_status" && !rule.statuses.includes(state.gameplay.employment.status)) reasons.push(rule.type);
    if (
      rule.type === "macro_regime" &&
      ((rule.required.length > 0 && !rule.required.includes(state.marketRegime)) || rule.blocked.includes(state.marketRegime))
    ) reasons.push(rule.type);
  }
  return reasons;
}

function hazardChancePpm(template: PersonalEventTemplateV2, state: GameStateV2): number {
  let chance = template.hazard.baseChancePpm;
  for (const modifier of template.hazard.modifiers) {
    if (
      (modifier.type === "macro_regime" && modifier.regimes.includes(state.marketRegime)) ||
      (modifier.type === "employment_sector" && state.gameplay.employment.status === "employed" && modifier.sectorIds.includes(state.gameplay.employment.sectorId))
    ) chance += modifier.deltaPpm;
  }
  return Math.max(template.hazard.minimumChancePpm, Math.min(template.hazard.maximumChancePpm, chance));
}

function allLessonTags(template: PersonalEventTemplateV2): readonly string[] {
  return [template.lessonTags.primary, ...template.lessonTags.secondary];
}

export function personalEventHistoryAvailabilityReasonsV2(
  template: PersonalEventTemplateV2,
  state: GameStateV2,
  catalog: readonly PersonalEventTemplateV2[],
): readonly string[] {
  const reasons: string[] = [];
  const matching = state.gameplay.eventLifecycle.history.filter(({ templateId }) => templateId === template.id);
  if (matching.length >= template.maximumOccurrences) reasons.push("maximum_occurrences");
  const currentLessons = new Set(allLessonTags(template));
  for (const event of state.gameplay.eventLifecycle.history) {
    const elapsed = monthsBetween(event.resolvedMonth, state.currentMonth);
    if (elapsed < 0) continue;
    const prior = catalog.find(({ id, version }) => id === event.templateId && version === event.templateVersion);
    if (!prior) continue;
    if (event.templateId === template.id && elapsed < template.cooldowns.eventMonths) reasons.push("event_cooldown");
    if (prior.category === template.category && elapsed < template.cooldowns.categoryMonths) reasons.push("category_cooldown");
    if (allLessonTags(prior).some((tag) => currentLessons.has(tag)) && elapsed < template.cooldowns.lessonMonths) reasons.push("lesson_cooldown");
  }
  return Object.freeze([...new Set(reasons)]);
}

export function generateDeclarativePersonalEventCandidatesV2(
  state: GameStateV2,
  activeCatalog: readonly PersonalEventTemplateV2[],
  exactCatalog: readonly PersonalEventTemplateV2[] = activeCatalog,
): DeclarativePersonalEventCandidatesV2 {
  if (state.outcome || state.gameplay.eventLifecycle.pending) {
    return Object.freeze({
      candidates: [],
      nextRandom: state.random,
      eligibleTemplateIds: [],
      candidateTemplateIds: [],
    });
  }
  const dueFollowUp = [...(state.gameplay.eventLifecycle.scheduledFollowUps ?? [])]
    .filter(({ eligibleMonth }) => compareMonths(eligibleMonth, state.currentMonth) <= 0)
    .toSorted((left, right) =>
      left.eligibleMonth.localeCompare(right.eligibleMonth) ||
      left.sourceEventId.localeCompare(right.sourceEventId) ||
      left.templateId.localeCompare(right.templateId) ||
      left.templateVersion - right.templateVersion,
    )
    .find((followUp) => {
      const target = exactCatalog.find(
        ({ id, version }) =>
          id === followUp.templateId && version === followUp.templateVersion,
      );
      return Boolean(
        target &&
        validatePersonalEventTemplateV2(target).length === 0 &&
        personalEventEligibilityReasonsV2(target, state).length === 0 &&
        personalEventHistoryAvailabilityReasonsV2(target, state, exactCatalog).length === 0,
      );
    });
  if (dueFollowUp) {
    const template = exactCatalog.find(
      ({ id, version }) =>
        id === dueFollowUp.templateId && version === dueFollowUp.templateVersion,
    );
    if (!template) {
      throw new RangeError("scheduled follow-up target is absent from the exact event catalog");
    }
    return Object.freeze({
      candidates: Object.freeze([Object.freeze({
        template,
        targetedWeakness: UNRELATED_HAZARD_TARGET,
        followUpSourceEventId: dueFollowUp.sourceEventId,
      })]),
      nextRandom: state.random,
      eligibleTemplateIds: Object.freeze([template.id]),
      candidateTemplateIds: Object.freeze([template.id]),
    });
  }
  const eligible = activeCatalog
    .filter((template) => validatePersonalEventTemplateV2(template).length === 0)
    .filter((template) => personalEventEligibilityReasonsV2(template, state).length === 0)
    .filter((template) => personalEventHistoryAvailabilityReasonsV2(template, state, exactCatalog).length === 0)
    .toSorted((left, right) => left.id.localeCompare(right.id) || left.version - right.version);
  let random = state.random;
  const candidates: DeclarativePersonalEventCandidateV2[] = [];
  for (const template of eligible) {
    const draw = nextInt(random, 1, 1_000_000);
    random = draw.nextState;
    if (draw.value <= hazardChancePpm(template, state)) {
      candidates.push(Object.freeze({
        template,
        targetedWeakness: UNRELATED_HAZARD_TARGET,
      }));
    }
  }
  return Object.freeze({
    candidates: Object.freeze(candidates),
    nextRandom: random,
    eligibleTemplateIds: Object.freeze(eligible.map(({ id }) => id)),
    candidateTemplateIds: Object.freeze(candidates.map(({ template }) => template.id)),
  });
}

/**
 * Additive named-stream candidate path. The frozen legacy scheduler above keeps
 * consuming the root cursor; opted-in commands key every catalog opportunity by
 * exact month/template identity so strategy-dependent eligibility cannot move a
 * later world's cursor.
 */
export function generateNamedDeclarativePersonalEventCandidatesV2(
  state: GameStateV2,
  activeCatalog: readonly PersonalEventTemplateV2[],
  exactCatalog: readonly PersonalEventTemplateV2[] = activeCatalog,
): NamedDeclarativePersonalEventCandidatesV2 {
  const violations = validatePersonalEventCatalogV2(activeCatalog);
  if (violations.length > 0) {
    throw new RangeError(
      `invalid declarative event catalog: ${violations
        .map(({ path, code }) => `${path}:${code}`)
        .join(",")}`,
    );
  }
  if (state.worldRandom === undefined) {
    throw new RangeError("named declarative event scheduling requires named world state");
  }
  const monthIndex = monthsBetween(simulationMonth("0001-01"), state.currentMonth);
  const orderedCatalog = [...activeCatalog].toSorted(
    (left, right) => left.id.localeCompare(right.id) || left.version - right.version,
  );
  const rawOpportunityEvidence = Object.freeze(
    orderedCatalog.map((template) =>
      Object.freeze({
        templateId: template.id,
        templateVersion: template.version,
        draw: eventOpportunityDrawV1({
          epoch: state.worldRandom!.eventOpportunity,
          simulationMonth: monthIndex,
          templateId: template.id,
          templateVersion: template.version,
        }).value,
        chancePpm: hazardChancePpm(template, state),
      }),
    ),
  );
  const evidenceByIdentity = new Map(
    rawOpportunityEvidence.map((entry) => [
      `${entry.templateId}@${entry.templateVersion}`,
      entry,
    ]),
  );

  const frozen = (result: Omit<NamedDeclarativePersonalEventCandidatesV2,
    "rawOpportunityEvidence" | "rawOpportunityFingerprint">) =>
    Object.freeze({
      ...result,
      rawOpportunityEvidence,
      rawOpportunityFingerprint: sha256Canonical(
        rawOpportunityEvidence.map(({ templateId, templateVersion, draw }) => ({
          templateId,
          templateVersion,
          draw,
        })),
      ),
    });
  if (state.outcome || state.gameplay.eventLifecycle.pending) {
    return frozen({
      candidates: Object.freeze([]),
      nextRandom: state.random,
      eligibleTemplateIds: Object.freeze([]),
      candidateTemplateIds: Object.freeze([]),
    });
  }

  const dueFollowUp = [...(state.gameplay.eventLifecycle.scheduledFollowUps ?? [])]
    .filter(({ eligibleMonth }) => compareMonths(eligibleMonth, state.currentMonth) <= 0)
    .toSorted((left, right) =>
      left.eligibleMonth.localeCompare(right.eligibleMonth) ||
      left.sourceEventId.localeCompare(right.sourceEventId) ||
      left.templateId.localeCompare(right.templateId) ||
      left.templateVersion - right.templateVersion,
    )
    .find((followUp) => {
      const target = exactCatalog.find(
        ({ id, version }) => id === followUp.templateId && version === followUp.templateVersion,
      );
      return Boolean(
        target &&
        personalEventEligibilityReasonsV2(target, state).length === 0 &&
        personalEventHistoryAvailabilityReasonsV2(target, state, exactCatalog).length === 0,
      );
    });
  if (dueFollowUp !== undefined) {
    const template = exactCatalog.find(
      ({ id, version }) => id === dueFollowUp.templateId && version === dueFollowUp.templateVersion,
    )!;
    return frozen({
      candidates: Object.freeze([Object.freeze({
        template,
        targetedWeakness: UNRELATED_HAZARD_TARGET,
        followUpSourceEventId: dueFollowUp.sourceEventId,
      })]),
      nextRandom: state.random,
      eligibleTemplateIds: Object.freeze([template.id]),
      candidateTemplateIds: Object.freeze([template.id]),
    });
  }

  const eligible = orderedCatalog
    .filter((template) => personalEventEligibilityReasonsV2(template, state).length === 0)
    .filter((template) =>
      personalEventHistoryAvailabilityReasonsV2(template, state, exactCatalog).length === 0,
    );
  const candidates = eligible
    .filter((template) => {
      const evidence = evidenceByIdentity.get(`${template.id}@${template.version}`)!;
      return evidence.draw <= evidence.chancePpm;
    })
    .map((template) => Object.freeze({
      template,
      targetedWeakness: UNRELATED_HAZARD_TARGET,
    }));
  return frozen({
    candidates: Object.freeze(candidates),
    nextRandom: state.random,
    eligibleTemplateIds: Object.freeze(eligible.map(({ id }) => id)),
    candidateTemplateIds: Object.freeze(candidates.map(({ template }) => template.id)),
  });
}

export function scheduleDeclarativePersonalEventV2(
  state: GameStateV2,
  catalog: readonly PersonalEventTemplateV2[],
): DeclarativePersonalEventScheduleV2 {
  if (state.outcome || state.gameplay.eventLifecycle.pending) {
    return Object.freeze({ event: null, nextRandom: state.random, eligibleTemplateIds: [], candidateTemplateIds: [] });
  }
  const dueFollowUp = [...(state.gameplay.eventLifecycle.scheduledFollowUps ?? [])]
    .filter(({ eligibleMonth }) => compareMonths(eligibleMonth, state.currentMonth) <= 0)
    .toSorted((left, right) =>
      left.eligibleMonth.localeCompare(right.eligibleMonth) ||
      left.sourceEventId.localeCompare(right.sourceEventId) ||
      left.templateId.localeCompare(right.templateId) ||
      left.templateVersion - right.templateVersion,
    )
    .find((followUp) => {
      const target = catalog.find(
        ({ id, version }) =>
          id === followUp.templateId && version === followUp.templateVersion,
      );
      return Boolean(
        target &&
        validatePersonalEventTemplateV2(target).length === 0 &&
        personalEventEligibilityReasonsV2(target, state).length === 0 &&
        personalEventHistoryAvailabilityReasonsV2(target, state, catalog).length === 0,
      );
    });
  if (dueFollowUp) {
    const template = catalog.find(
      ({ id, version }) =>
        id === dueFollowUp.templateId && version === dueFollowUp.templateVersion,
    );
    if (!template) {
      throw new RangeError("scheduled follow-up target is absent from the exact event catalog");
    }
    let random = state.random;
    const parameters: Record<string, number> = {};
    for (const definition of template.parameters) {
      const draw = nextInt(random, definition.minimum, definition.maximum);
      parameters[definition.id] = draw.value;
      random = draw.nextState;
    }
    return Object.freeze({
      event: Object.freeze({
        proposal: Object.freeze({
          eventId: `evt.followup.${state.currentMonth}.${dueFollowUp.sourceEventId}.${template.id}.v${template.version}`,
          templateId: template.id,
          templateVersion: template.version,
          parameters: Object.freeze(parameters),
        }),
        template,
        targetedWeakness: UNRELATED_HAZARD_TARGET,
        followUpSourceEventId: dueFollowUp.sourceEventId,
      }),
      nextRandom: random,
      eligibleTemplateIds: Object.freeze([template.id]),
      candidateTemplateIds: Object.freeze([template.id]),
    });
  }
  const eligible = catalog
    .filter((template) => validatePersonalEventTemplateV2(template).length === 0)
    .filter((template) => personalEventEligibilityReasonsV2(template, state).length === 0)
    .filter((template) => personalEventHistoryAvailabilityReasonsV2(template, state, catalog).length === 0)
    .toSorted((left, right) => left.id.localeCompare(right.id) || left.version - right.version);
  let random = state.random;
  const candidates: PersonalEventTemplateV2[] = [];
  for (const template of eligible) {
    const draw = nextInt(random, 1, 1_000_000);
    random = draw.nextState;
    if (draw.value <= hazardChancePpm(template, state)) candidates.push(template);
  }
  if (candidates.length === 0) {
    return Object.freeze({
      event: null,
      nextRandom: random,
      eligibleTemplateIds: Object.freeze(eligible.map(({ id }) => id)),
      candidateTemplateIds: [],
    });
  }
  const selection = nextInt(random, 0, candidates.length - 1);
  random = selection.nextState;
  const template = candidates[selection.value]!;
  const parameters: Record<string, number> = {};
  for (const definition of template.parameters) {
    const draw = nextInt(random, definition.minimum, definition.maximum);
    parameters[definition.id] = draw.value;
    random = draw.nextState;
  }
  return Object.freeze({
    event: Object.freeze({
      proposal: Object.freeze({
        eventId: `evt.${state.currentMonth}.${template.id}.v${template.version}`,
        templateId: template.id,
        templateVersion: template.version,
        parameters: Object.freeze(parameters),
      }),
      template,
      targetedWeakness: UNRELATED_HAZARD_TARGET,
    }),
    nextRandom: random,
    eligibleTemplateIds: Object.freeze(eligible.map(({ id }) => id)),
    candidateTemplateIds: Object.freeze(candidates.map(({ id }) => id)),
  });
}
