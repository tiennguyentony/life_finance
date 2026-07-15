import { nextInt, type RandomState } from "./domain/rng";
import { compareMonths, monthsBetween } from "./domain/month";
import type { GameState } from "./game-state";
import type { EventProposal, EventTemplate, EventWeakness } from "./events";
import { eventApplicabilityReasons } from "./events";
import type { GameStateV2 } from "./game-state-v2";
import { EVENT_TEMPLATES } from "../data/event-templates";
import { personalEventFamily } from "../data/event-experience";

export const EVENT_FAMILY_RECENCY_MONTHS = 9;

export type EventSchedulingPolicyV2 = Readonly<{
  version: "fairness-v1";
  minimumChancePpm: number;
  maximumChancePpm: number;
}>;

export const DEFAULT_EVENT_SCHEDULING_POLICY_V2: EventSchedulingPolicyV2 =
  Object.freeze({
    version: "fairness-v1",
    minimumChancePpm: 120_000,
    maximumChancePpm: 350_000,
  });

export type ScheduledPersonalEventV2 = Readonly<{
  proposal: EventProposal;
  template: EventTemplate;
  targetedWeakness: EventWeakness;
}>;

export type EventScheduleResultV2 = Readonly<{
  event: ScheduledPersonalEventV2 | null;
  nextRandom: RandomState;
  eligibleTemplateIds: readonly string[];
}>;

export function demonstratedWeaknessesV2(state: GameStateV2): ReadonlySet<EventWeakness> {
  const exposure = state.gameplay.exposure.current;
  if (!exposure) return new Set();
  const weaknesses = new Set<EventWeakness>();
  if (exposure.emergencyFundMonthsPpm < 3_000_000) {
    weaknesses.add("low_emergency_fund");
  }
  if (exposure.revolvingDebtPpm >= 500_000) {
    weaknesses.add("high_credit_utilization");
  }
  if ((exposure.jobInvestmentCorrelationPpm ?? 0) >= 300_000) {
    weaknesses.add("job_portfolio_correlation");
  }
  if (exposure.portfolioConcentrationPpm >= 300_000) {
    weaknesses.add("portfolio_concentration");
  }
  if ((exposure.insuranceGapPpm ?? 0) >= 300_000) {
    weaknesses.add("uninsured_property");
  }
  if ((exposure.debtToIncomePpm ?? 0) >= 500_000) {
    weaknesses.add("high_fixed_costs");
  }
  const income =
    state.gameplay.employment.status === "employed"
      ? state.gameplay.employment.annualGrossSalaryCents
      : 0;
  if (
    income > 0 &&
    BigInt(state.finances.annualLivingCostCents) * BigInt(2) > BigInt(income)
  ) {
    weaknesses.add("lifestyle_fragility");
  }
  const investable = state.finances.taxableInvestmentsCents +
    state.finances.retirementCents +
    state.finances.otherInvestableAssetsCents;
  if (
    investable > 0 &&
    BigInt(state.gameplay.portfolio.taxableSpeculativeCents) * BigInt(10) >=
      BigInt(investable)
  ) {
    weaknesses.add("market_timing");
  }
  return weaknesses;
}

export function eligiblePersonalEventTemplatesV2(
  state: GameStateV2,
): readonly EventTemplate[] {
  const weaknesses = demonstratedWeaknessesV2(state);
  const projection = v1Projection(state);
  return Object.freeze(EVENT_TEMPLATES.filter(
    (template) =>
      template.kind === "personal_shock" &&
      template.targetsWeaknesses.some((weakness) => weaknesses.has(weakness)) &&
      isOffCooldown(state, template.id) &&
      isOutsideFamilyRecencyWindow(state, template.id) &&
      eventApplicabilityReasons(template, projection).length === 0 &&
      (template.tier !== "catastrophe" ||
        (state.gameplay.exposure.current?.scorePpm ?? 0) >= 2_400_000),
  ).toSorted((left, right) => left.id.localeCompare(right.id)));
}

function isOutsideFamilyRecencyWindow(state: GameStateV2, templateId: string): boolean {
  const family = personalEventFamily(templateId);
  if (!family) return true;
  return !state.gameplay.eventLifecycle.history.some((event) => {
    const elapsed = monthsBetween(event.resolvedMonth, state.currentMonth);
    return (
      elapsed >= 0 &&
      elapsed < EVENT_FAMILY_RECENCY_MONTHS &&
      personalEventFamily(event.templateId) === family
    );
  });
}

function isOffCooldown(state: GameStateV2, templateId: string): boolean {
  const cooldown = state.gameplay.eventLifecycle.cooldowns.find(
    (entry) => entry.templateId === templateId,
  );
  return !cooldown || compareMonths(cooldown.eligibleAgainMonth, state.currentMonth) <= 0;
}

function v1Projection(state: GameStateV2): GameState {
  return { ...state, schemaVersion: 1, engineVersion: "4.0.0" };
}

function chancePpm(state: GameStateV2, policy: EventSchedulingPolicyV2): number {
  const score = state.gameplay.exposure.current?.scorePpm ?? 1_000_000;
  const risk = Math.max(0, Math.min(2_000_000, score - 1_000_000));
  return Math.round(
    policy.minimumChancePpm +
      ((policy.maximumChancePpm - policy.minimumChancePpm) * risk) / 2_000_000,
  );
}

export function schedulePersonalEventV2(
  state: GameStateV2,
  policy: EventSchedulingPolicyV2 = DEFAULT_EVENT_SCHEDULING_POLICY_V2,
): EventScheduleResultV2 {
  if (
    policy.version !== "fairness-v1" ||
    !Number.isSafeInteger(policy.minimumChancePpm) ||
    !Number.isSafeInteger(policy.maximumChancePpm) ||
    policy.minimumChancePpm < 0 ||
    policy.maximumChancePpm > 1_000_000 ||
    policy.minimumChancePpm > policy.maximumChancePpm
  ) {
    throw new RangeError("event scheduling policy must use bounded PPM chance");
  }
  if (state.outcome || state.gameplay.eventLifecycle.pending) {
    return Object.freeze({ event: null, nextRandom: state.random, eligibleTemplateIds: [] });
  }
  const weaknesses = demonstratedWeaknessesV2(state);
  const eligible = eligiblePersonalEventTemplatesV2(state);
  const frequency = nextInt(state.random, 1, 1_000_000);
  if (eligible.length === 0 || frequency.value > chancePpm(state, policy)) {
    return Object.freeze({
      event: null,
      nextRandom: frequency.nextState,
      eligibleTemplateIds: Object.freeze(eligible.map(({ id }) => id)),
    });
  }
  const selection = nextInt(frequency.nextState, 0, eligible.length - 1);
  const template = eligible[selection.value]!;
  let random = selection.nextState;
  const parameters: Record<string, number> = {};
  for (const parameter of template.parameters) {
    const draw = nextInt(random, parameter.minimum, parameter.maximum);
    parameters[parameter.id] = draw.value;
    random = draw.nextState;
  }
  const targetedWeakness = template.targetsWeaknesses.find((weakness) =>
    weaknesses.has(weakness),
  )!;
  return Object.freeze({
    event: Object.freeze({
      proposal: Object.freeze({
        eventId: `evt.${state.currentMonth}.${template.id}`,
        templateId: template.id,
        templateVersion: template.version,
        parameters: Object.freeze(parameters),
      }),
      template,
      targetedWeakness,
    }),
    nextRandom: random,
    eligibleTemplateIds: Object.freeze(eligible.map(({ id }) => id)),
  });
}
