import {
  divideRoundHalfAwayFromZero,
  safeBigIntToNumber,
} from "./domain/integer";
import {
  moneyCents,
  ratePpm,
  type MoneyCents,
} from "./domain/money";
import { reconcileFinancesWithLedger } from "./game-state";
import type {
  ActivePersonalEventCashFlowV2,
  GameStateV2,
  OriginatedPersonalEventDebtV2,
  ScheduledPersonalEventCashFlowV2,
} from "./game-state-v2";
import {
  adjudicateCoverageClaim,
  adjudicateHealthClaim,
} from "./insurance-v2";
import { appendTransaction, type JournalPosting, type Ledger } from "./ledger";
import type {
  PersonalEventMagnitudeV2,
  PersonalEventTemplateV2,
} from "./personal-event-v2";
import {
  personalEventCashFlowIdV2,
  personalEventDebtIdV2,
  personalEventEffectIdV2,
  validatePersonalEventTemplateV2,
} from "./personal-event-v2";
import type { EventProposal } from "./events";
import {
  applyLivingCostPlanChangeV2,
  type FinancialLivingCostPlanEvidenceV2,
} from "./financial-living-cost-plan-v2";

export class PersonalEventEffectV2Error extends Error {
  readonly code:
    | "INVALID_PROPOSAL"
    | "INVALID_RESPONSE"
    | "MITIGATION_UNAVAILABLE"
    | "EFFECT_OUT_OF_RANGE";

  constructor(code: PersonalEventEffectV2Error["code"], message: string) {
    super(message);
    this.name = "PersonalEventEffectV2Error";
    this.code = code;
  }
}

export type PersonalEventEffectResolutionV2 = Readonly<{
  finances: GameStateV2["finances"];
  debts: GameStateV2["gameplay"]["debts"];
  wellbeing: GameStateV2["wellbeing"];
  insurance: GameStateV2["gameplay"]["insurance"];
  ledger: Ledger;
  playerCostCents: MoneyCents;
  insurerCostCents: MoneyCents;
  activeCashFlows: readonly ActivePersonalEventCashFlowV2[];
  scheduledCashFlows: readonly ScheduledPersonalEventCashFlowV2[];
  originatedDebts: readonly OriginatedPersonalEventDebtV2[];
  livingCostPlans: readonly FinancialLivingCostPlanEvidenceV2[];
}>;

function addPlayerCost(current: number, amount: number, durationMonths = 1): number {
  try {
    return safeBigIntToNumber(
      BigInt(current) + BigInt(amount) * BigInt(durationMonths),
      "personal event scheduled player cost",
    );
  } catch {
    throw new PersonalEventEffectV2Error(
      "EFFECT_OUT_OF_RANGE",
      "scheduled personal-event player cost exceeds safe integer cents",
    );
  }
}

function debit(accountId: string, amountCents: MoneyCents): JournalPosting {
  return { accountId, debitCents: amountCents, creditCents: moneyCents(0) };
}

function credit(accountId: string, amountCents: MoneyCents): JournalPosting {
  return { accountId, debitCents: moneyCents(0), creditCents: amountCents };
}

function resolveMagnitude(
  magnitude: PersonalEventMagnitudeV2,
  parameters: Readonly<Record<string, number>>,
): number {
  if (magnitude.source === "fixed") return magnitude.value;
  const value = parameters[magnitude.parameterId];
  if (!Number.isSafeInteger(value)) {
    throw new PersonalEventEffectV2Error(
      "INVALID_PROPOSAL",
      `missing event parameter ${magnitude.parameterId}`,
    );
  }
  return safeBigIntToNumber(
    divideRoundHalfAwayFromZero(
      BigInt(value) * BigInt(magnitude.multiplierPpm),
      BigInt(1_000_000),
    ),
    "personal event effect",
  );
}

function assertProposal(
  template: PersonalEventTemplateV2,
  proposal: EventProposal,
): void {
  if (
    proposal.templateId !== template.id ||
    proposal.templateVersion !== template.version ||
    template.parameters.some((parameter) => {
      const value = proposal.parameters[parameter.id];
      return !Number.isSafeInteger(value) || value! < parameter.minimum || value! > parameter.maximum;
    }) ||
    Object.keys(proposal.parameters).some(
      (parameterId) => !template.parameters.some(({ id }) => id === parameterId),
    )
  ) {
    throw new PersonalEventEffectV2Error(
      "INVALID_PROPOSAL",
      "proposal must exactly match the declarative event template",
    );
  }
}

export function isPersonalEventMitigationAvailableV2(
  state: GameStateV2,
  template: PersonalEventTemplateV2,
  mitigationId: string,
): boolean {
  const mitigation = template.mitigations.find(({ id }) => id === mitigationId);
  if (!mitigation) return false;
  if (mitigation.type === "health_insurance") {
    return (
      state.gameplay.catalogSnapshot?.selected.healthPlan != null &&
      state.gameplay.insurance.policyYear !== null
    );
  }
  return (
    mitigation.coverageId !== undefined &&
    (state.gameplay.recurringStrategy.insuranceCoverageIds ??
      state.gameplay.benefits.insuranceCoverageIds).includes(mitigation.coverageId)
  );
}

export function resolvePersonalEventResponseV2(
  state: GameStateV2,
  template: PersonalEventTemplateV2,
  proposal: EventProposal,
  responseId: string,
  commandId: string,
): PersonalEventEffectResolutionV2 {
  const templateViolations = validatePersonalEventTemplateV2(template);
  if (templateViolations.length > 0) {
    throw new PersonalEventEffectV2Error(
      "INVALID_RESPONSE",
      `invalid declarative event template: ${templateViolations[0]!.path}:${templateViolations[0]!.code}`,
    );
  }
  assertProposal(template, proposal);
  const response = template.responses.find(({ id }) => id === responseId);
  if (!response) {
    throw new PersonalEventEffectV2Error(
      "INVALID_RESPONSE",
      "response must be declared by the event template",
    );
  }
  const claimMitigationIds = new Set(
    response.effects
      .filter(({ type }) => type === "insurance_claim")
      .map((effect) => effect.type === "insurance_claim" ? effect.mitigationId : ""),
  );
  if (response.requiresMitigationIds.some(
    (mitigationId) =>
      !claimMitigationIds.has(mitigationId) &&
      !isPersonalEventMitigationAvailableV2(state, template, mitigationId),
  )) {
    throw new PersonalEventEffectV2Error(
      "MITIGATION_UNAVAILABLE",
      "response requires an active declared mitigation",
    );
  }

  let requiredObligations = state.finances.requiredObligationsCents as number;
  let annualLivingCost = state.finances.annualLivingCostCents as number;
  let burnout = state.wellbeing.burnoutPpm as number;
  let happiness = state.wellbeing.happinessPpm as number;
  let insurance = state.gameplay.insurance;
  let ledger = state.ledger;
  let debts = state.gameplay.debts;
  let playerCost = 0;
  let insurerCost = 0;
  const activeCashFlows: ActivePersonalEventCashFlowV2[] = [
    ...(state.gameplay.eventLifecycle.activeCashFlows ?? []),
  ];
  const scheduledCashFlows: ScheduledPersonalEventCashFlowV2[] = [];
  const originatedDebts: OriginatedPersonalEventDebtV2[] = [];
  const livingCostPlans: FinancialLivingCostPlanEvidenceV2[] = [];
  const scheduleCashFlow = (
    effectIndex: number,
    kind: ScheduledPersonalEventCashFlowV2["kind"],
    amountCents: MoneyCents,
    durationMonths: number,
  ): void => {
    const evidence: ScheduledPersonalEventCashFlowV2 = {
      id: personalEventCashFlowIdV2(commandId, proposal.eventId, response.id, effectIndex),
      sourceEffectId: personalEventEffectIdV2(template.id, template.version, response.id, effectIndex),
      kind,
      amountCents,
      startMonth: state.currentMonth,
      durationMonths,
    };
    scheduledCashFlows.push(evidence);
    activeCashFlows.push({
      id: evidence.id,
      sourceEventId: proposal.eventId,
      sourceEffectId: evidence.sourceEffectId,
      kind: evidence.kind,
      amountCents: evidence.amountCents,
      startMonth: evidence.startMonth,
      remainingMonths: durationMonths,
    });
  };

  for (const [effectIndex, effect] of response.effects.entries()) {
    if (![
      "insurance_claim",
      "required_obligation_delta",
      "annual_living_cost_delta",
      "wellbeing_delta",
      "cash_delta",
      "temporary_expense",
      "recurring_expense",
      "temporary_income",
      "financed_expense",
    ].includes(effect.type)) {
      throw new PersonalEventEffectV2Error(
        "INVALID_RESPONSE",
        `unsupported declarative effect operation ${String((effect as { type?: unknown }).type)}`,
      );
    }
    if (effect.type === "insurance_claim") {
      const mitigation = template.mitigations.find(({ id }) => id === effect.mitigationId);
      if (
        !mitigation ||
        !response.requiresMitigationIds.includes(effect.mitigationId) ||
        !isPersonalEventMitigationAvailableV2(state, template, effect.mitigationId) ||
        (effect.coverage === "health" && mitigation.type !== "health_insurance") ||
        (effect.coverage === "selected_coverage" &&
          (mitigation.type !== "selected_coverage" || effect.coverageId !== mitigation.coverageId))
      ) {
        throw new PersonalEventEffectV2Error(
          "MITIGATION_UNAVAILABLE",
          "insurance claim requires an available exact matching mitigation",
        );
      }
      const grossAmountCents = moneyCents(
        resolveMagnitude(effect.grossAmount, proposal.parameters),
      );
      const workingState: GameStateV2 = {
        ...state,
        gameplay: { ...state.gameplay, insurance },
      };
      const settlement = effect.coverage === "health"
        ? adjudicateHealthClaim(workingState, grossAmountCents, true)
        : adjudicateCoverageClaim(
            workingState,
            effect.coverageId ?? "",
            grossAmountCents,
            true,
          );
      if (settlement.playerResponsibilityCents > 0) {
        scheduleCashFlow(effectIndex, "temporary_expense", settlement.playerResponsibilityCents, 1);
      }
      playerCost = addPlayerCost(playerCost, settlement.playerResponsibilityCents);
      insurerCost += settlement.insurerResponsibilityCents;
      insurance = settlement.nextInsurance;
      continue;
    }
    const amount = resolveMagnitude(effect.magnitude, proposal.parameters);
    if (effect.type === "financed_expense") {
      if (
        amount < 0 ||
        !Number.isSafeInteger(effect.durationMonths) ||
        effect.durationMonths < 1 ||
        effect.durationMonths > 120
      ) {
        throw new PersonalEventEffectV2Error(
          "EFFECT_OUT_OF_RANGE",
          "event financing requires a non-negative installment and a term of 1 through 120 months",
        );
      }
      if (amount === 0) continue;
      let principal: number;
      try {
        principal = safeBigIntToNumber(
          BigInt(amount) * BigInt(effect.durationMonths),
          "personal event financed principal",
        );
      } catch {
        throw new PersonalEventEffectV2Error(
          "EFFECT_OUT_OF_RANGE",
          "personal-event financed principal exceeds safe integer cents",
        );
      }
      const debtId = personalEventDebtIdV2(
        commandId,
        proposal.eventId,
        response.id,
        effectIndex,
      );
      const sourceEffectId = personalEventEffectIdV2(
        template.id,
        template.version,
        response.id,
        effectIndex,
      );
      const principalCents = moneyCents(principal);
      const minimumPaymentCents = moneyCents(amount);
      const debt: OriginatedPersonalEventDebtV2 = {
        id: debtId,
        sourceEffectId,
        kind: "personal_loan",
        principalCents,
        annualInterestRatePpm: ratePpm(0),
        minimumPaymentCents,
        termMonths: effect.durationMonths,
      };
      ledger = appendTransaction(ledger, {
        id: `txn.${debtId}`,
        commandId,
        effectiveMonth: state.currentMonth,
        reasonCode: "personal_event_financing_originated",
        description: "Recognize an event installment plan as term debt",
        sourceSystem: "personal_event_v2",
        category: "event.financed_expense",
        causalReference: { kind: "event", id: proposal.eventId },
        postings: [
          debit("expense.living", principalCents),
          credit("liability.non_credit", principalCents),
        ],
      });
      debts = {
        ...debts,
        termDebts: [
          ...debts.termDebts,
          {
            id: debt.id,
            kind: debt.kind,
            principalCents: debt.principalCents,
            annualInterestRatePpm: debt.annualInterestRatePpm,
            minimumPaymentCents: debt.minimumPaymentCents,
            remainingTermMonths: debt.termMonths,
          },
        ],
      };
      requiredObligations += amount;
      playerCost = addPlayerCost(playerCost, amount, effect.durationMonths);
      originatedDebts.push(debt);
    } else if (
      effect.type === "temporary_expense" ||
      effect.type === "recurring_expense" ||
      effect.type === "temporary_income"
    ) {
      if (amount < 0 || !Number.isSafeInteger(effect.durationMonths) || effect.durationMonths < 1 || effect.durationMonths > 120) {
        throw new PersonalEventEffectV2Error(
          "EFFECT_OUT_OF_RANGE",
          "bounded event cash flow requires a non-negative amount and duration of 1 through 120 months",
        );
      }
      if (amount > 0) {
        scheduleCashFlow(effectIndex, effect.type, moneyCents(amount), effect.durationMonths);
      }
      if (effect.type !== "temporary_income") {
        playerCost = addPlayerCost(playerCost, amount, effect.durationMonths);
      }
    } else if (effect.type === "required_obligation_delta") {
      requiredObligations += amount;
      if (amount > 0) playerCost = addPlayerCost(playerCost, amount);
    } else if (effect.type === "annual_living_cost_delta") {
      try {
        const application = applyLivingCostPlanChangeV2(
          {
            annualLivingCostCents: moneyCents(annualLivingCost),
            requiredObligationsCents: moneyCents(requiredObligations),
          },
          moneyCents(amount),
        );
        annualLivingCost = application.finances.annualLivingCostCents;
        requiredObligations = application.finances.requiredObligationsCents;
        livingCostPlans.push(application.evidence);
      } catch (cause) {
        throw new PersonalEventEffectV2Error(
          "EFFECT_OUT_OF_RANGE",
          cause instanceof Error
            ? cause.message
            : "living-cost plan is outside safe authoritative bounds",
        );
      }
    } else if (effect.type === "wellbeing_delta") {
      if (effect.field === "burnoutPpm") burnout += amount;
      else happiness += amount;
    } else if (effect.type === "cash_delta") {
      if (amount < 0) {
        throw new PersonalEventEffectV2Error(
          "EFFECT_OUT_OF_RANGE",
          "cash delta requires a non-negative magnitude",
        );
      }
      if (amount > 0) {
        scheduleCashFlow(
          effectIndex,
          effect.direction === "add" ? "temporary_income" : "temporary_expense",
          moneyCents(amount),
          1,
        );
      }
      if (effect.direction === "subtract") playerCost = addPlayerCost(playerCost, amount);
    } else {
      throw new PersonalEventEffectV2Error(
        "INVALID_RESPONSE",
        `unsupported declarative effect operation ${String((effect as { type?: unknown }).type)}`,
      );
    }
  }

  if (
    !Number.isSafeInteger(requiredObligations) || requiredObligations < 0 ||
    !Number.isSafeInteger(annualLivingCost) || annualLivingCost < 0
  ) {
    throw new PersonalEventEffectV2Error(
      "EFFECT_OUT_OF_RANGE",
      "event effect cannot make authoritative plan values negative",
    );
  }
  return Object.freeze({
    finances: Object.freeze(reconcileFinancesWithLedger({
      ...state.finances,
      requiredObligationsCents: moneyCents(requiredObligations),
      annualLivingCostCents: moneyCents(annualLivingCost),
    }, ledger)),
    debts: Object.freeze(debts),
    wellbeing: Object.freeze({
      burnoutPpm: ratePpm(Math.max(0, Math.min(1_000_000, burnout))),
      happinessPpm: ratePpm(Math.max(0, Math.min(1_000_000, happiness))),
    }),
    insurance,
    ledger,
    playerCostCents: moneyCents(playerCost),
    insurerCostCents: moneyCents(insurerCost),
    activeCashFlows: Object.freeze(activeCashFlows),
    scheduledCashFlows: Object.freeze(scheduledCashFlows),
    originatedDebts: Object.freeze(originatedDebts),
    livingCostPlans: Object.freeze(livingCostPlans),
  });
}
