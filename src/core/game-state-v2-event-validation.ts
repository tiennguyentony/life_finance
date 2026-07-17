import { sha256Canonical } from "./canonical";
import { canonicalJson } from "./canonical";
import { getPersonalEventTemplateV2 } from "../data/personal-event-templates-v2";
import { isAiContentSource } from "./ai-source";
import { divideRoundHalfAwayFromZero, safeBigIntToNumber } from "./domain/integer";
import { addMoney, moneyCents, subtractMoney } from "./domain/money";
import { compareMonths, monthsBetween, simulationMonth } from "./domain/month";
import type { StateInvariantViolation } from "./game-state";
import type {
  GameStateV2,
  ResolvedEventEvidenceV2,
  ScheduledPersonalEventCashFlowV2,
} from "./game-state-v2";
import {
  personalEventCashFlowIdV2,
  personalEventEffectIdV2,
  type PersonalEventMagnitudeV2,
  type PersonalEventTemplateV2,
} from "./personal-event-v2";
import {
  FINANCIAL_LIVING_COST_PLAN_V2_VERSION,
  monthlyLivingCostFromAnnualV2,
} from "./financial-living-cost-plan-v2";

function personalEventTemplateForValidationV2(
  templateId: string,
  templateVersion: number,
  personalEventCatalog?: readonly PersonalEventTemplateV2[],
): PersonalEventTemplateV2 {
  if (personalEventCatalog === undefined) {
    return getPersonalEventTemplateV2(templateId, templateVersion);
  }
  const template = personalEventCatalog.find(
    ({ id, version }) => id === templateId && version === templateVersion,
  );
  if (template === undefined) throw new RangeError("unknown personal-event template version");
  return template;
}

const EVENT_FLOW_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/;
const DECLARATIVE_METADATA_KEYS = [
  "category",
  "classification",
  "lessonTags",
  "pressureCost",
  "recoveryDurationMonths",
  "fallbackNarrative",
] as const;

function violation(
  path: string,
  code: string,
  message: string,
): StateInvariantViolation {
  return { path, code, message };
}

function declarativeDiscriminator(
  event: Readonly<Record<string, unknown>>,
  path: string,
  violations: StateInvariantViolation[],
): boolean {
  const version = event.eventSchemaVersion;
  if (version !== undefined && version !== 2) {
    violations.push(violation(
      path,
      "unsupported_event_schema_version",
      "event schema discriminator must use a supported exact version",
    ));
    return false;
  }
  if (
    version === undefined &&
    DECLARATIVE_METADATA_KEYS.some((key) => event[key] !== undefined)
  ) {
    violations.push(violation(
      path,
      "missing_event_schema_discriminator",
      "declarative event metadata requires its version discriminator",
    ));
  }
  return version === 2;
}

function proposalMatchesTemplate(
  parameters: Readonly<Record<string, number>>,
  template: ReturnType<typeof getPersonalEventTemplateV2>,
): boolean {
  return (
    Object.keys(parameters).length === template.parameters.length &&
    template.parameters.every((definition) => {
      const value = parameters[definition.id];
      return Number.isSafeInteger(value) && value! >= definition.minimum && value! <= definition.maximum;
    }) &&
    Object.keys(parameters).every((id) => template.parameters.some((definition) => definition.id === id))
  );
}

function resolveEvidenceMagnitude(
  magnitude: PersonalEventMagnitudeV2,
  parameters: Readonly<Record<string, number>>,
): number {
  if (magnitude.source === "fixed") return magnitude.value;
  const value = parameters[magnitude.parameterId];
  if (!Number.isSafeInteger(value)) throw new RangeError("missing event parameter");
  return safeBigIntToNumber(
    divideRoundHalfAwayFromZero(
      BigInt(value) * BigInt(magnitude.multiplierPpm),
      BigInt(1_000_000),
    ),
    "persisted personal-event magnitude",
  );
}

function canonicalScheduledCashFlows(
  event: ResolvedEventEvidenceV2,
  template: ReturnType<typeof getPersonalEventTemplateV2>,
): readonly ScheduledPersonalEventCashFlowV2[] {
  const response = template.responses.find(({ id }) => id === event.choiceId);
  if (!response) throw new RangeError("unknown resolved response");
  let knownPlayerCost = BigInt(0);
  let insuranceEffectIndex: number | null = null;
  let insuranceGrossAmount = BigInt(0);
  for (const [effectIndex, effect] of response.effects.entries()) {
    if (effect.type === "insurance_claim") {
      if (insuranceEffectIndex !== null) throw new RangeError("multiple insurance claims");
      insuranceEffectIndex = effectIndex;
      insuranceGrossAmount = BigInt(resolveEvidenceMagnitude(effect.grossAmount, event.parameters));
      continue;
    }
    const amount = resolveEvidenceMagnitude(effect.magnitude, event.parameters);
    if (effect.type === "required_obligation_delta" && amount > 0) {
      knownPlayerCost += BigInt(amount);
    } else if (
      (effect.type === "temporary_expense" || effect.type === "recurring_expense") &&
      amount > 0
    ) {
      knownPlayerCost += BigInt(amount) * BigInt(effect.durationMonths);
    } else if (effect.type === "cash_delta" && effect.direction === "subtract" && amount > 0) {
      knownPlayerCost += BigInt(amount);
    }
  }
  const insurancePlayerCost = BigInt(event.playerCostCents) - knownPlayerCost;
  if (insurancePlayerCost < 0) throw new RangeError("player cost is below canonical non-insurance cost");
  if (insuranceEffectIndex === null) {
    if (insurancePlayerCost !== BigInt(0) || event.insurerCostCents !== 0) {
      throw new RangeError("insurance evidence exists without a claim");
    }
  } else if (insurancePlayerCost + BigInt(event.insurerCostCents) !== insuranceGrossAmount) {
    throw new RangeError("insurance settlement does not reconcile to the gross claim");
  }

  const flows: ScheduledPersonalEventCashFlowV2[] = [];
  for (const [effectIndex, effect] of response.effects.entries()) {
    let kind: ScheduledPersonalEventCashFlowV2["kind"] | null = null;
    let amount = 0;
    let durationMonths = 1;
    if (effect.type === "insurance_claim") {
      kind = "temporary_expense";
      amount = safeBigIntToNumber(insurancePlayerCost, "persisted insurance player cost");
    } else {
      amount = resolveEvidenceMagnitude(effect.magnitude, event.parameters);
      if (
        effect.type === "temporary_expense" ||
        effect.type === "recurring_expense" ||
        effect.type === "temporary_income"
      ) {
        kind = effect.type;
        durationMonths = effect.durationMonths;
      } else if (effect.type === "cash_delta") {
        kind = effect.direction === "add" ? "temporary_income" : "temporary_expense";
      }
    }
    if (kind !== null && amount > 0) {
      flows.push({
        id: personalEventCashFlowIdV2(event.commandId, event.eventId, response.id, effectIndex),
        sourceEffectId: personalEventEffectIdV2(template.id, template.version, response.id, effectIndex),
        kind,
        amountCents: moneyCents(amount),
        startMonth: event.resolvedMonth,
        durationMonths,
      });
    }
  }
  return flows;
}

function assertCanonicalLivingCostPlans(
  event: ResolvedEventEvidenceV2,
  template: PersonalEventTemplateV2,
): void {
  if (event.livingCostPlans === undefined) return;
  const response = template.responses.find(({ id }) => id === event.choiceId);
  if (!response) throw new RangeError("unknown resolved response");
  const livingEffects = response.effects
    .map((effect, effectIndex) => ({ effect, effectIndex }))
    .filter(({ effect }) => effect.type === "annual_living_cost_delta")
    .map(({ effect, effectIndex }) => {
      if (effect.type !== "annual_living_cost_delta") {
        throw new RangeError("unexpected living-cost effect");
      }
      return {
        effectIndex,
        annualDelta: moneyCents(
          resolveEvidenceMagnitude(effect.magnitude, event.parameters),
        ),
      };
    });
  if (event.livingCostPlans.length !== livingEffects.length) {
    throw new RangeError("living-cost evidence count mismatch");
  }
  event.livingCostPlans.forEach((plan, index) => {
    const livingEffect = livingEffects[index]!;
    const annualDelta = livingEffect.annualDelta;
    const resultingAnnualLivingCostCents = addMoney(
      plan.previousAnnualLivingCostCents,
      annualDelta,
    );
    const previousMonthlyLivingCostCents = monthlyLivingCostFromAnnualV2(
      plan.previousAnnualLivingCostCents,
    );
    const resultingMonthlyLivingCostCents = monthlyLivingCostFromAnnualV2(
      resultingAnnualLivingCostCents,
    );
    const monthlyDelta = subtractMoney(
      resultingMonthlyLivingCostCents,
      previousMonthlyLivingCostCents,
    );
    const expected = {
      version: FINANCIAL_LIVING_COST_PLAN_V2_VERSION,
      previousAnnualLivingCostCents: plan.previousAnnualLivingCostCents,
      annualLivingCostDeltaCents: annualDelta,
      resultingAnnualLivingCostCents,
      previousMonthlyLivingCostCents,
      resultingMonthlyLivingCostCents,
      previousRequiredObligationsCents: plan.previousRequiredObligationsCents,
      monthlyRequiredObligationDeltaCents: monthlyDelta,
      resultingRequiredObligationsCents: addMoney(
        plan.previousRequiredObligationsCents,
        monthlyDelta,
      ),
    };
    if (
      expected.resultingAnnualLivingCostCents < 0 ||
      expected.resultingRequiredObligationsCents < 0 ||
      canonicalJson(plan) !== canonicalJson(expected)
    ) {
      throw new RangeError("living-cost evidence mismatch");
    }
    if (index > 0) {
      const previous = event.livingCostPlans![index - 1]!;
      const previousEffect = livingEffects[index - 1]!;
      const interveningRequiredDelta = response.effects
        .slice(previousEffect.effectIndex + 1, livingEffect.effectIndex)
        .filter(({ type }) => type === "required_obligation_delta")
        .reduce((total, effect) => {
          if (effect.type !== "required_obligation_delta") return total;
          return addMoney(
            total,
            moneyCents(
              resolveEvidenceMagnitude(effect.magnitude, event.parameters),
            ),
          );
        }, moneyCents(0));
      if (
        plan.previousAnnualLivingCostCents !==
          previous.resultingAnnualLivingCostCents ||
        plan.previousRequiredObligationsCents !==
          addMoney(
            previous.resultingRequiredObligationsCents,
            interveningRequiredDelta,
          )
      ) {
        throw new RangeError("living-cost evidence chain mismatch");
      }
    }
  });
}

export function validateEventAndCareerStateV2(
  state: GameStateV2,
  personalEventCatalog?: readonly PersonalEventTemplateV2[],
): readonly StateInvariantViolation[] {
  const violations: StateInvariantViolation[] = [];

  const lifecycle = state.gameplay.eventLifecycle;
  const pending = lifecycle.pending;
  if (pending) {
    const pendingRecord = pending as unknown as Readonly<Record<string, unknown>>;
    if (
      pending.eventId.length === 0 ||
      pending.templateId.length === 0 ||
      !Number.isSafeInteger(pending.templateVersion) ||
      pending.templateVersion < 1 ||
      pending.choiceIds.length === 0 ||
      new Set(pending.choiceIds).size !== pending.choiceIds.length ||
      pending.choiceIds.some((choiceId) => choiceId.length === 0) ||
      (pending.aiNarrative !== undefined &&
        (!isAiContentSource(pending.aiNarrative.source) ||
          pending.aiNarrative.headline.trim().length < 1 ||
          pending.aiNarrative.headline.length > 240 ||
          pending.aiNarrative.narrative.trim().length < 1 ||
          pending.aiNarrative.narrative.length > 2_000 ||
          pending.aiNarrative.rationale.trim().length < 1 ||
          pending.aiNarrative.rationale.length > 800 ||
          new Set(pending.aiNarrative.citedEvidenceIds).size !==
            pending.aiNarrative.citedEvidenceIds.length)) ||
      Object.entries(pending.parameters).some(
        ([id, value]) =>
          id.length === 0 || !Number.isSafeInteger(value),
      )
    ) {
      violations.push(
        violation(
          "gameplay.eventLifecycle.pending",
          "invalid_pending_event",
          "pending event evidence must contain stable ids, parameters, and choices",
        ),
      );
    }
    if (declarativeDiscriminator(
      pendingRecord,
      "gameplay.eventLifecycle.pending",
      violations,
    )) {
      try {
        const template = personalEventTemplateForValidationV2(
          pending.templateId,
          pending.templateVersion,
          personalEventCatalog,
        );
        const metadata = {
          tier: pending.tier,
          category: pending.category,
          classification: pending.classification,
          lessonTags: pending.lessonTags,
          pressureCost: pending.pressureCost,
          recoveryDurationMonths: pending.recoveryDurationMonths,
          fallbackNarrative: pending.fallbackNarrative,
          choiceIds: pending.choiceIds,
        };
        const canonicalMetadata = {
          tier: template.severityTier,
          category: template.category,
          classification: template.classification,
          lessonTags: template.lessonTags,
          pressureCost: template.pressureCost,
          recoveryDurationMonths: template.recovery.durationMonths,
          fallbackNarrative: template.fallbackNarrative,
          choiceIds: template.responses.map(({ id }) => id),
        };
        if (canonicalJson(metadata) !== canonicalJson(canonicalMetadata)) {
          throw new RangeError("declarative metadata mismatch");
        }
      } catch {
        violations.push(
          violation(
            "gameplay.eventLifecycle.pending",
            "event_template_metadata_mismatch",
            "declarative pending metadata must match the exact registry version",
          ),
        );
      }
      try {
        const template = personalEventTemplateForValidationV2(
          pending.templateId,
          pending.templateVersion,
          personalEventCatalog,
        );
        if (!proposalMatchesTemplate(pending.parameters, template)) {
          throw new RangeError("declarative proposal mismatch");
        }
      } catch {
        violations.push(violation(
          "gameplay.eventLifecycle.pending",
          "event_template_proposal_mismatch",
          "declarative pending parameters must exactly match the registry template",
        ));
      }
    }
    try {
      simulationMonth(pending.scheduledMonth);
      simulationMonth(pending.expiresMonth);
      if (
        pending.scheduledMonth !== state.currentMonth ||
        compareMonths(pending.expiresMonth, pending.scheduledMonth) <= 0
      ) {
        violations.push(
          violation(
            "gameplay.eventLifecycle.pending",
            "invalid_pending_window",
            "pending event must begin in the current month and expire later",
          ),
        );
      }
    } catch {
      violations.push(
        violation(
          "gameplay.eventLifecycle.pending",
          "invalid_month",
          "pending event months must use canonical YYYY-MM",
        ),
      );
    }
  }
  const eventIds = lifecycle.history.map(({ eventId }) => eventId);
  const canonicalCashFlows = new Map<
    string,
    ScheduledPersonalEventCashFlowV2 & Readonly<{ sourceEventId: string }>
  >();
  if (
    new Set(eventIds).size !== eventIds.length ||
    (pending !== null && eventIds.includes(pending.eventId))
  ) {
    violations.push(
      violation(
        "gameplay.eventLifecycle.history",
        "duplicate_event",
        "event ids must be unique across pending and resolved evidence",
      ),
    );
  }
  lifecycle.history.forEach((event, index) => {
    const eventRecord = event as unknown as Readonly<Record<string, unknown>>;
    try {
      simulationMonth(event.scheduledMonth);
      simulationMonth(event.resolvedMonth);
      if (
        compareMonths(event.resolvedMonth, event.scheduledMonth) < 0 ||
        compareMonths(event.resolvedMonth, state.currentMonth) > 0 ||
        event.commandId.length === 0 ||
        !Number.isSafeInteger(event.resultingRevision) ||
        event.resultingRevision < 1 ||
        event.resultingRevision > state.revision ||
        event.eventId.length === 0 ||
        event.templateId.length === 0 ||
        event.choiceId.length === 0 ||
        event.availableChoiceIds.length === 0 ||
        !event.availableChoiceIds.includes(event.choiceId) ||
        new Set(event.availableChoiceIds).size !== event.availableChoiceIds.length ||
        !Number.isSafeInteger(event.playerCostCents) ||
        event.playerCostCents < 0 ||
        !Number.isSafeInteger(event.insurerCostCents) ||
        event.insurerCostCents < 0
      ) {
        throw new RangeError("invalid resolved event");
      }
    } catch {
      violations.push(
        violation(
          `gameplay.eventLifecycle.history.${index}`,
          "invalid_resolved_event",
          "resolved event evidence must be chronological and financially bounded",
        ),
      );
    }
    if (declarativeDiscriminator(
      eventRecord,
      `gameplay.eventLifecycle.history.${index}`,
      violations,
    )) {
      try {
        const template = personalEventTemplateForValidationV2(
          event.templateId,
          event.templateVersion,
          personalEventCatalog,
        );
        if (
          canonicalJson({
            tier: event.tier,
            category: event.category,
            classification: event.classification,
            lessonTags: event.lessonTags,
            pressureCost: event.pressureCost,
            recoveryDurationMonths: event.recoveryDurationMonths,
            fallbackNarrative: event.fallbackNarrative,
            choiceIds: event.availableChoiceIds,
          }) !== canonicalJson({
            tier: template.severityTier,
            category: template.category,
            classification: template.classification,
            lessonTags: template.lessonTags,
            pressureCost: template.pressureCost,
            recoveryDurationMonths: template.recovery.durationMonths,
            fallbackNarrative: template.fallbackNarrative,
            choiceIds: template.responses.map(({ id }) => id),
          }) ||
          !template.responses.some(({ id }) => id === event.choiceId)
        ) throw new RangeError("declarative metadata mismatch");
      } catch {
        violations.push(
          violation(
            `gameplay.eventLifecycle.history.${index}`,
            "event_template_metadata_mismatch",
            "declarative history metadata must match the exact registry version",
          ),
        );
      }
      try {
        const template = personalEventTemplateForValidationV2(
          event.templateId,
          event.templateVersion,
          personalEventCatalog,
        );
        if (!proposalMatchesTemplate(event.parameters, template)) {
          throw new RangeError("declarative proposal mismatch");
        }
      } catch {
        violations.push(violation(
          `gameplay.eventLifecycle.history.${index}`,
          "event_template_proposal_mismatch",
          "declarative history parameters must exactly match the registry template",
        ));
      }
      try {
        const template = personalEventTemplateForValidationV2(
          event.templateId,
          event.templateVersion,
          personalEventCatalog,
        );
        const expectedCashFlows = canonicalScheduledCashFlows(event, template);
        if (canonicalJson(event.scheduledCashFlows ?? []) !== canonicalJson(expectedCashFlows)) {
          throw new RangeError("scheduled cash-flow evidence mismatch");
        }
        for (const flow of expectedCashFlows) {
          canonicalCashFlows.set(flow.id, { ...flow, sourceEventId: event.eventId });
        }
      } catch {
        violations.push(violation(
          `gameplay.eventLifecycle.history.${index}.scheduledCashFlows`,
          "event_scheduled_cash_flow_mismatch",
          "scheduled cash flows must exactly match the resolved template response and financial evidence",
        ));
      }
      try {
        const template = personalEventTemplateForValidationV2(
          event.templateId,
          event.templateVersion,
          personalEventCatalog,
        );
        assertCanonicalLivingCostPlans(event, template);
      } catch {
        violations.push(violation(
          `gameplay.eventLifecycle.history.${index}.livingCostPlans`,
          "event_living_cost_plan_mismatch",
          "living-cost plans must use exact Financial Engine rounding and match the resolved response",
        ));
      }
    }
  });
  const activeCashFlows = lifecycle.activeCashFlows ?? [];
  const activeCashFlowIds = activeCashFlows.map(({ id }) => id);
  if (new Set(activeCashFlowIds).size !== activeCashFlowIds.length) {
    violations.push(violation(
      "gameplay.eventLifecycle.activeCashFlows",
      "duplicate_event_cash_flow",
      "active personal-event cash-flow ids must be unique",
    ));
  }
  for (const expected of canonicalCashFlows.values()) {
    const elapsedMonths = monthsBetween(expected.startMonth, state.currentMonth);
    const expectedRemainingMonths = expected.durationMonths - elapsedMonths;
    const active = activeCashFlows.find(({ id }) => id === expected.id);
    if (elapsedMonths < 0 || (expectedRemainingMonths > 0) !== Boolean(active)) {
      violations.push(violation(
        "gameplay.eventLifecycle.activeCashFlows",
        "invalid_event_cash_flow",
        "active flows must exactly reflect every unconsumed canonical scheduled flow",
      ));
    }
  }
  activeCashFlows.forEach((flow, index) => {
    try {
      simulationMonth(flow.startMonth);
      const expected = canonicalCashFlows.get(flow.id);
      const expectedRemainingMonths = expected
        ? expected.durationMonths - monthsBetween(expected.startMonth, state.currentMonth)
        : 0;
      const exactExpected = expected
        ? {
            id: expected.id,
            sourceEventId: expected.sourceEventId,
            sourceEffectId: expected.sourceEffectId,
            kind: expected.kind,
            amountCents: expected.amountCents,
            startMonth: expected.startMonth,
            remainingMonths: expectedRemainingMonths,
          }
        : null;
      if (
        !EVENT_FLOW_ID.test(flow.id) ||
        !expected ||
        canonicalJson(flow) !== canonicalJson(exactExpected) ||
        flow.sourceEventId !== expected.sourceEventId ||
        flow.sourceEffectId !== expected.sourceEffectId ||
        flow.kind !== expected.kind ||
        flow.amountCents !== expected.amountCents ||
        flow.startMonth !== expected.startMonth ||
        !["temporary_expense", "recurring_expense", "temporary_income"].includes(flow.kind) ||
        !Number.isSafeInteger(flow.amountCents) ||
        flow.amountCents <= 0 ||
        !Number.isSafeInteger(flow.remainingMonths) ||
        flow.remainingMonths !== expectedRemainingMonths ||
        expectedRemainingMonths < 1
      ) throw new RangeError("invalid active event cash flow");
    } catch {
      violations.push(violation(
        `gameplay.eventLifecycle.activeCashFlows.${index}`,
        "invalid_event_cash_flow",
        "active personal-event cash flow must have bounded authoritative source and schedule evidence",
      ));
    }
  });
  if (new Set(state.gameplay.eventLifecycle.activeStoryIds).size !== state.gameplay.eventLifecycle.activeStoryIds.length) {
    violations.push(
      violation("gameplay.eventLifecycle.activeStoryIds", "duplicate_story", "active story ids must be unique"),
    );
  }
  const storyIds = state.gameplay.eventLifecycle.macroStories.map(
    ({ storyId }) => storyId,
  );
  if (
    new Set(storyIds).size !== storyIds.length ||
    sha256Canonical(storyIds.toSorted()) !==
      sha256Canonical([...state.gameplay.eventLifecycle.activeStoryIds].toSorted())
  ) {
    violations.push(
      violation(
        "gameplay.eventLifecycle.macroStories",
        "story_identity_mismatch",
        "active story ids must exactly identify persisted macro stories",
      ),
    );
  }
  state.gameplay.eventLifecycle.macroStories.forEach((story, index) => {
    try {
      simulationMonth(story.startedMonth);
      simulationMonth(story.expiresMonth);
      const modifiers = Object.values(story.returnModifiersPpm);
      if (
        story.storyId.length === 0 ||
        story.templateId.length === 0 ||
        !Number.isSafeInteger(story.templateVersion) ||
        story.templateVersion < 1 ||
        compareMonths(story.startedMonth, state.currentMonth) > 0 ||
        compareMonths(story.expiresMonth, state.currentMonth) < 0 ||
        compareMonths(story.expiresMonth, story.startedMonth) < 0 ||
        modifiers.length !== 4 ||
        modifiers.some(
          (modifier) =>
            !Number.isSafeInteger(modifier) ||
            modifier < -500_000 ||
            modifier > 500_000,
        )
      ) {
        throw new RangeError("invalid macro story");
      }
    } catch {
      violations.push(
        violation(
          `gameplay.eventLifecycle.macroStories.${index}`,
          "invalid_macro_story",
          "macro stories must be current, bounded, and chronological",
        ),
      );
    }
  });
  const scheduledFollowUpIdentities = new Set<string>();
  (lifecycle.scheduledFollowUps ?? []).forEach((followUp, index) => {
    const identity = `${followUp.sourceEventId}:${followUp.templateId}@${followUp.templateVersion}`;
    if (scheduledFollowUpIdentities.has(identity)) {
      violations.push(
        violation(
          `gameplay.eventLifecycle.scheduledFollowUps.${index}`,
          "duplicate_scheduled_followup",
          "a source event may schedule an exact follow-up only once",
        ),
      );
    }
    scheduledFollowUpIdentities.add(identity);
    try {
      simulationMonth(followUp.eligibleMonth);
      personalEventTemplateForValidationV2(
        followUp.templateId,
        followUp.templateVersion,
        personalEventCatalog,
      );
      const source = lifecycle.history.find(
        ({ eventId }) => eventId === followUp.sourceEventId,
      );
      if (
        followUp.sourceEventId.length === 0 ||
        !source ||
        compareMonths(followUp.eligibleMonth, source.resolvedMonth) <= 0
      ) throw new RangeError("invalid follow-up source or due window");
    } catch {
      violations.push(
        violation(
          `gameplay.eventLifecycle.scheduledFollowUps.${index}`,
          "invalid_scheduled_followup",
          "scheduled follow-up must reference exact registry and resolved-event identities",
        ),
      );
    }
  });
  const cooldownTemplateIds = state.gameplay.eventLifecycle.cooldowns.map(
    ({ templateId }) => templateId,
  );
  if (new Set(cooldownTemplateIds).size !== cooldownTemplateIds.length) {
    violations.push(
      violation("gameplay.eventLifecycle.cooldowns", "duplicate_cooldown", "each template may have one cooldown"),
    );
  }
  state.gameplay.eventLifecycle.cooldowns.forEach((cooldown, index) => {
    try {
      simulationMonth(cooldown.eligibleAgainMonth);
      if (cooldown.templateId.length === 0) throw new RangeError("empty template");
    } catch {
      violations.push(
        violation(
          `gameplay.eventLifecycle.cooldowns.${index}`,
          "invalid_cooldown",
          "cooldown requires a template id and canonical month",
        ),
      );
    }
  });
  const development = state.gameplay.careerDevelopment;
  const developmentCommands = [
    ...development.pending.map(({ commandId }) => commandId),
    ...development.history.map(({ commandId }) => commandId),
  ];
  if (new Set(developmentCommands).size !== developmentCommands.length) {
    violations.push(
      violation(
        "gameplay.careerDevelopment",
        "duplicate_upskill",
        "upskill command ids must be unique across pending and history",
      ),
    );
  }
  development.pending.forEach((entry, index) => {
    try {
      simulationMonth(entry.startedMonth);
      simulationMonth(entry.completesMonth);
      if (
        entry.commandId.length === 0 ||
        entry.programId.length === 0 ||
        entry.catalogVersion.length === 0 ||
        entry.annualSalaryIncreaseCents <= 0 ||
        compareMonths(entry.completesMonth, state.currentMonth) <= 0 ||
        compareMonths(entry.completesMonth, entry.startedMonth) <= 0
      ) {
        throw new RangeError("invalid pending upskill");
      }
    } catch {
      violations.push(
        violation(
          `gameplay.careerDevelopment.pending.${index}`,
          "invalid_upskill",
          "pending upskill must have valid evidence and a future completion",
        ),
      );
    }
  });
  development.history.forEach((entry, index) => {
    try {
      simulationMonth(entry.startedMonth);
      simulationMonth(entry.completedMonth);
      if (
        entry.annualSalaryIncreaseCents <= 0 ||
        compareMonths(entry.completedMonth, entry.startedMonth) <= 0 ||
        compareMonths(entry.completedMonth, state.currentMonth) > 0
      ) {
        throw new RangeError("invalid completed upskill");
      }
    } catch {
      violations.push(
        violation(
          `gameplay.careerDevelopment.history.${index}`,
          "invalid_upskill",
          "completed upskill must be chronological and financially bounded",
        ),
      );
    }
  });

  return violations;
}
