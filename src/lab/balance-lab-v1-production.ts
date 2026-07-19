import { sha256Canonical } from "../core/canonical";
import { assessBeginnerChapterV1 } from "../core/beginner-chapter-v1";
import { BEGINNER_EVENT_CADENCE_V1_VERSION } from "../core/beginner-event-cadence-v1";
import { projectPersonalEventResponsePreviewV1 } from "../application/game/personal-event-response-preview-v1";
import { reduceDetailedFinanceCommand } from "../core/detailed-actions-v2";
import type { DetailedFinancialAction } from "../core/detailed-actions-v2";
import { moneyCents, ratePpm } from "../core/domain/money";
import { monthsBetween } from "../core/domain/month";
import type { SimulationMonth } from "../core/domain/month";
import { resolveEventChoiceV2 } from "../core/event-lifecycle-v2";
import { projectFinancialGoal } from "../core/financial-goals-v2";
import {
  calculateAutomaticLiquidity,
  calculateNetWorth,
} from "../core/game-state";
import { finalizeGameStateV2, type GameStateV2 } from "../core/game-state-v2";
import { MACRO_MARKET_MODEL_V2_VERSION } from "../core/market";
import {
  FINANCIAL_KERNEL_V2_VERSION,
  type MonthlyTurnV2Record,
} from "../core/monthly-turn-v2";
import { OUTCOME_POLICY_V1_VERSION } from "../core/outcome-policy-v2";
import { setRecurringStrategy } from "../core/recurring-strategy-v2";
import { RUNTIME_BALANCE_CONTROLLER_V1_VERSION } from "../core/runtime-balance-policy-v2";
import { runtimeBalanceDifficultyPolicyV2 } from "../core/runtime-balance-policy-v2";
import { SCENARIO_DIRECTOR_V2_VERSION } from "../core/scenario-director-policy-v2";
import { advanceTimeV2 } from "../core/time-controller-v2";
import { DECLARATIVE_EVENT_SCHEDULER_V2_VERSION } from "../core/event-scheduler-v2";
import { WORLD_RANDOM_VERSION_V1 } from "../core/world-random-v1";
import {
  activePersonalEventTemplatesV2,
  ACTIVE_PERSONAL_EVENT_TEMPLATES_V2,
  PERSONAL_EVENT_TEMPLATES_V2,
} from "../data/personal-event-templates-v2";
import {
  getPersonalEventPresentationV1,
  type PersonalEventCadenceRoleV1,
  type PersonalEventPresentationToneV1,
} from "../data/personal-event-presentation-v1";
import type { PersonalEventTemplateV2 } from "../core/personal-event-v2";
import {
  balanceLabBotPolicyV1,
  chooseBalanceLabEventResponseV1,
  chooseRandomControlOptionV1,
  type BalanceLabBotPolicyV1,
} from "./balance-lab-v1-bots";
import { OfflineBalanceLabV1Error } from "./balance-lab-v1-contracts";
import type {
  BalanceLabBotIntentEvidenceV1,
  BalanceLabProductionOwnersV1,
  BalanceLabWorldEvidenceV1,
} from "./balance-lab-v1-runner";
import type { BalanceLabTaxEvidenceSourceV1 } from "./balance-lab-v1-tax-evidence";
import { observeBalanceLabMonthV1 } from "./balance-lab-balance-observation-v1";

export const BALANCE_LAB_PRODUCTION_PORTS_V1 = Object.freeze({
  setStrategy: setRecurringStrategy,
  takeAction: reduceDetailedFinanceCommand,
  advanceTime: advanceTimeV2,
  resolveEvent: resolveEventChoiceV2,
  projectGoal: projectFinancialGoal,
  calculateNetWorth,
  calculateAutomaticLiquidity,
});

export type BalanceLabProductionPortsV1 = typeof BALANCE_LAB_PRODUCTION_PORTS_V1;

export type BalanceLabProductionOwnerOptionsV1 = Readonly<{
  createPersonaState(input: Readonly<{
    personaId: string;
    matchedSeed: number;
    difficulty: "guided" | "normal" | "hard";
  }>): GameStateV2;
  taxEvidence: BalanceLabTaxEvidenceSourceV1;
  ports?: BalanceLabProductionPortsV1;
  personalEventCatalog?: readonly PersonalEventTemplateV2[];
}>;

export type BalanceLabProductionMonthRecordV1 = Readonly<{
  turn: MonthlyTurnV2Record;
  closingAutomaticLiquidityCents: number;
  resolvedEvent?: Readonly<{
    monthIndex: number;
    eventId: string;
    templateId: string;
    templateVersion: number;
    scheduledMonth: SimulationMonth;
    choiceId: string;
    availableChoiceIds: readonly string[];
    materiallyAvailableChoiceIds: readonly string[];
    responseAvailability: readonly Readonly<{
      responseId: string;
      status: "available" | "unavailable" | "error";
      materiallyDistinct: boolean;
    }>[];
    classification: "positive" | "neutral" | "negative";
    followUpSourceEventId: string | null;
    playerCostCents: number;
    insurerCostCents: number;
    baselineLiquidityCents: number;
  }>;
  shortfall: MonthlyTurnV2Record["shortfall"];
}>;

type RecoveryRecord = Readonly<{
  closingAutomaticLiquidityCents?: number;
  resolvedEvent?: Readonly<{
    monthIndex: number;
    classification: "positive" | "neutral" | "negative";
    playerCostCents: number;
    baselineLiquidityCents: number;
  }>;
}>;

export function measureRecoveryObservationsV1(
  records: readonly RecoveryRecord[],
): readonly Readonly<{
  eventMonthIndex: number;
  status: "recovered" | "censored";
  observedMonths: number;
}>[] {
  const recovery: Array<{
    eventMonthIndex: number;
    status: "recovered" | "censored";
    observedMonths: number;
  }> = [];
  for (let index = 0; index < records.length; index += 1) {
    const event = records[index]!.resolvedEvent;
    if (
      event === undefined ||
      event.classification !== "negative" ||
      event.playerCostCents <= 0
    ) continue;
    const recoveredAt = records.findIndex(
      (candidate, candidateIndex) =>
        candidateIndex > index &&
        (candidate.closingAutomaticLiquidityCents ?? -1) >= event.baselineLiquidityCents,
    );
    recovery.push(Object.freeze(
      recoveredAt > index
        ? {
            eventMonthIndex: event.monthIndex,
            status: "recovered" as const,
            observedMonths: recoveredAt - index,
          }
        : {
            eventMonthIndex: event.monthIndex,
            status: "censored" as const,
            observedMonths: Math.max(0, records.length - 1 - index),
          },
    ));
  }
  return Object.freeze(recovery);
}

export function bankruptcyResidualShortfallCentsV1(
  endReason: "active" | "bankruptcy" | "financial_independence" | "retirement",
  records: readonly Readonly<{
    shortfall?: Readonly<{ residualShortfallCents: number }> | null;
  }>[],
): number {
  if (endReason !== "bankruptcy") return 0;
  return records.reduce(
    (maximum, { shortfall }) =>
      Math.max(maximum, shortfall?.residualShortfallCents ?? 0),
    0,
  );
}

export function measureRuntimeBalancePacingV1(
  history: readonly Readonly<{
    tier: "micro" | "medium" | "large" | "catastrophe";
    resolvedMonth: SimulationMonth;
    recoveryDurationMonths?: number;
  }>[],
  difficulty: "guided" | "normal" | "hard",
): Readonly<{ violationCount: number; sampleCount: number }> {
  const policy = runtimeBalanceDifficultyPolicyV2(difficulty);
  const major = history.filter(({ tier }) => tier !== "micro");
  const latestByTier = new Map<string, (typeof major)[number]>();
  let latestRecoveryEvent: (typeof major)[number] | undefined;
  let catastropheCount = 0;
  let violationCount = 0;
  for (const event of major) {
    let violated = false;
    const latestTier = latestByTier.get(event.tier);
    if (
      latestTier !== undefined &&
      monthsBetween(latestTier.resolvedMonth, event.resolvedMonth) <
        policy.tierCooldownMonths[event.tier]
    ) violated = true;
    if (
      (event.tier === "large" || event.tier === "catastrophe") &&
      latestRecoveryEvent !== undefined
    ) {
      const sourceTier = latestRecoveryEvent.tier as "large" | "catastrophe";
      const recoveryMonths = Math.max(
        latestRecoveryEvent.recoveryDurationMonths ?? 0,
        policy.recoveryDurationMonths[sourceTier],
      );
      if (
        monthsBetween(latestRecoveryEvent.resolvedMonth, event.resolvedMonth) <
        recoveryMonths
      ) violated = true;
    }
    if (event.tier === "catastrophe") {
      catastropheCount += 1;
      if (catastropheCount > policy.maximumCatastrophes) violated = true;
    }
    if (violated) violationCount += 1;
    latestByTier.set(event.tier, event);
    if (event.tier === "large" || event.tier === "catastrophe") {
      latestRecoveryEvent = event;
    }
  }
  return Object.freeze({ violationCount, sampleCount: major.length });
}

function eventPresentationV1(
  templateId: string,
  templateVersion: number,
): Readonly<{
  tone: PersonalEventPresentationToneV1;
  cadenceRole: PersonalEventCadenceRoleV1;
}> {
  try {
    const presentation = getPersonalEventPresentationV1(
      templateId,
      templateVersion,
    );
    return Object.freeze({
      tone: presentation.tone,
      cadenceRole: presentation.cadenceRole,
    });
  } catch {
    return Object.freeze({ tone: "serious", cadenceRole: "challenge" });
  }
}

function strategyForPolicy(
  state: GameStateV2,
  policy: BalanceLabBotPolicyV1,
) {
  const availableInsurance = [...state.gameplay.benefits.insuranceCoverageIds];
  const insuranceCoverageIds = policy.optionalInsurance === "all_available"
    ? availableInsurance
    : policy.optionalInsurance === "first_available"
      ? availableInsurance.slice(0, 1)
      : [];
  return Object.freeze({
    emergencyFundTargetMonthsPpm: ratePpm(policy.emergencyFundMonths * 1_000_000),
    insuranceCoverageIds: Object.freeze(insuranceCoverageIds),
    preTax401kSalaryRatePpm: policy.retirementContributionPpm,
    preTaxHsaSalaryRatePpm: ratePpm(0),
    afterTaxBroadIndexRatePpm: policy.afterTaxAllocationPpm.broadIndex,
    afterTaxSectorRatePpm: policy.afterTaxAllocationPpm.sector,
    afterTaxSpeculativeRatePpm: policy.afterTaxAllocationPpm.speculative,
    afterTaxIraRatePpm: ratePpm(0),
    afterTaxExtraDebtRatePpm: policy.afterTaxAllocationPpm.extraDebt,
  });
}

function safeSum(values: readonly number[]): number {
  const total = values.reduce((sum, value) => sum + BigInt(value), BigInt(0));
  const number = Number(total);
  if (!Number.isSafeInteger(number)) {
    throw new OfflineBalanceLabV1Error(
      "PRODUCTION_OWNER_VIOLATION",
      "authoritative metric total exceeded safe integer range",
    );
  }
  return number;
}

function openingActionForPolicy(
  state: GameStateV2,
  policy: BalanceLabBotPolicyV1,
): DetailedFinancialAction | null {
  if (policy.monthlyAction === "pay_highest_rate_debt") {
    if (
      state.gameplay.debts.revolvingCreditUsedCents > 0 &&
      state.finances.cashCents > 0
    ) {
      return Object.freeze({
        type: "pay_revolving_credit",
        amountCents: moneyCents(
          Math.min(
            10_000,
            state.gameplay.debts.revolvingCreditUsedCents,
            state.finances.cashCents,
          ),
        ),
      });
    }
    const debt = [...state.gameplay.debts.termDebts]
      .filter(({ principalCents }) => principalCents > 0)
      .toSorted(
        (left, right) =>
          right.annualInterestRatePpm - left.annualInterestRatePpm ||
          left.id.localeCompare(right.id),
      )[0];
    if (debt !== undefined && state.finances.cashCents > 0) {
      return Object.freeze({
        type: "pay_term_debt",
        debtId: debt.id,
        amountCents: moneyCents(
          Math.min(10_000, debt.principalCents, state.finances.cashCents),
        ),
      });
    }
  }
  if (
    policy.monthlyAction === "invest_discretionary" &&
    state.finances.cashCents >= 10_000
  ) {
    return Object.freeze({
      type: "invest_taxable",
      bucket: "taxableBroadIndexCents",
      amountCents: moneyCents(10_000),
    });
  }
  if (policy.monthlyAction === "increase_lifestyle_and_borrow") {
    return Object.freeze({
      type: "change_lifestyle",
      annualLivingCostDeltaCents: moneyCents(360_000),
    });
  }
  return null;
}

export function createBalanceLabProductionOwnersV1(
  options: BalanceLabProductionOwnerOptionsV1,
): BalanceLabProductionOwnersV1<GameStateV2, BalanceLabProductionMonthRecordV1> {
  const ports = options.ports ?? BALANCE_LAB_PRODUCTION_PORTS_V1;
  const personalEventCatalog = options.personalEventCatalog ?? PERSONAL_EVENT_TEMPLATES_V2;
  const activePersonalEventCatalog = options.personalEventCatalog === undefined
    ? ACTIVE_PERSONAL_EVENT_TEMPLATES_V2
    : activePersonalEventTemplatesV2(options.personalEventCatalog);
  return Object.freeze({
    createOpeningState: ({ personaId, matchedSeed, difficulty, worldRandom }) =>
      finalizeGameStateV2({
        ...options.createPersonaState({ personaId, matchedSeed, difficulty }),
        worldRandom,
      }),
    checksumState: sha256Canonical,
    applyBotPolicy: ({ state, policy, botRandom }) => {
      let selected = policy;
      let nextBotRandom = botRandom;
      if (policy.id === "random-control-v1") {
        if (botRandom === undefined) {
          throw new OfflineBalanceLabV1Error(
            "PRODUCTION_OWNER_VIOLATION",
            "random control requires its separate lab cursor",
          );
        }
        const choices = [
          balanceLabBotPolicyV1("average-beginner-v1"),
          balanceLabBotPolicyV1("aggressive-investor-v1"),
          balanceLabBotPolicyV1("cash-hoarder-v1"),
        ] as const;
        const draw = chooseRandomControlOptionV1(botRandom, choices);
        selected = draw.value;
        nextBotRandom = draw.nextState;
      }
      const next = ports.setStrategy(state, {
        schemaVersion: 2,
        id: `lab.strategy.${policy.id}`,
        type: "set_recurring_strategy",
        expectedRevision: state.revision,
        effectiveMonth: state.currentMonth,
        payload: { strategy: strategyForPolicy(state, selected) },
      });
      return Object.freeze({ state: next, nextBotRandom });
    },
    processMonth: ({ state, monthIndex, difficulty, policy, botRandom }) => {
      let selected = policy;
      let nextBotRandom = botRandom;
      if (policy.monthlyAction === "random_valid_intent") {
        if (botRandom === undefined) {
          throw new OfflineBalanceLabV1Error(
            "PRODUCTION_OWNER_VIOLATION",
            "random monthly intent requires its separate lab cursor",
          );
        }
        const draw = chooseRandomControlOptionV1(botRandom, [
          balanceLabBotPolicyV1("average-beginner-v1"),
          balanceLabBotPolicyV1("aggressive-investor-v1"),
          balanceLabBotPolicyV1("cash-hoarder-v1"),
        ] as const);
        selected = draw.value;
        nextBotRandom = draw.nextState;
      }
      const monthlyAction = openingActionForPolicy(state, selected);
      const botIntents: BalanceLabBotIntentEvidenceV1[] = [];
      if (monthlyAction !== null) {
        state = ports.takeAction(state, {
          schemaVersion: 2,
          id: `lab.action.${policy.id}.${monthIndex}.${state.revision}`,
          type: "take_detailed_action",
          expectedRevision: state.revision,
          effectiveMonth: state.currentMonth,
          payload: { action: monthlyAction },
        });
      }
      botIntents.push(Object.freeze({
        monthIndex,
        intentId: selected.monthlyIntent.id,
        command: selected.monthlyAction,
        disposition: monthlyAction === null ? "not_applicable" : "applied",
      }));
      const commandId = `lab.month.${monthIndex}.${state.revision}`;
      const taxEvidence = options.taxEvidence.getEvidence(state, commandId);
      const advanced = ports.advanceTime(
        state,
        {
          schemaVersion: 2,
          id: `lab.advance.${monthIndex}.${state.revision}`,
          type: "advance_time_v2",
          maxMonths: 1,
          mode: { kind: "one_month" },
          monthlyInputs: [
            {
              commandId,
              payload: {
                financialKernelVersion: FINANCIAL_KERNEL_V2_VERSION,
                outcomePolicyVersion: OUTCOME_POLICY_V1_VERSION,
                eventSchedulerVersion: DECLARATIVE_EVENT_SCHEDULER_V2_VERSION,
                runtimeBalanceControllerVersion:
                  RUNTIME_BALANCE_CONTROLLER_V1_VERSION,
                scenarioDirectorVersion: SCENARIO_DIRECTOR_V2_VERSION,
                worldRandomVersion: WORLD_RANDOM_VERSION_V1,
                marketModelVersion: MACRO_MARKET_MODEL_V2_VERSION,
                macroDifficulty: difficulty,
                taxEvidence,
                taxableLiquidationCostRatePpm: ratePpm(10_000),
                resolvedCashFlows: [],
              },
            },
          ],
        },
        {
          personalEventCatalog,
          activePersonalEventCatalog,
          beginnerEventCadenceVersion: BEGINNER_EVENT_CADENCE_V1_VERSION,
        },
      );
      const record = advanced.records[0];
      const evidence = record?.worldRandomEvidence;
      if (
        advanced.monthsAdvanced !== 1 ||
        record === undefined ||
        evidence === undefined
      ) {
        throw new OfflineBalanceLabV1Error(
          "PRODUCTION_OWNER_VIOLATION",
          "production Time Controller did not return complete named-world evidence",
        );
      }
      let nextState = advanced.state;
      let resolvedEvent: BalanceLabProductionMonthRecordV1["resolvedEvent"];
      if (nextState.outcome === null && nextState.gameplay.eventLifecycle.pending !== null) {
        const pending = nextState.gameplay.eventLifecycle.pending;
        const template = personalEventCatalog.find(
          ({ id, version }) =>
            id === pending.templateId && version === pending.templateVersion,
        );
        if (template === undefined) {
          throw new OfflineBalanceLabV1Error(
            "PRODUCTION_OWNER_VIOLATION",
            "pending event is absent from the exact lab event catalog",
          );
        }
        const seenMaterialOutcomes = new Set<string>();
        const responseAvailability = Object.freeze(
          pending.choiceIds.map((responseId) => {
            const preview = projectPersonalEventResponsePreviewV1(
              nextState,
              pending,
              template,
              responseId,
              personalEventCatalog,
            );
            const materialFingerprint = sha256Canonical({
              immediateCashChangeCents: preview.immediateCashChangeCents,
              recurringCashFlows: preview.recurringCashFlows,
              annualLivingCostChangeCents: preview.annualLivingCostChangeCents,
              wellbeingChangesPpm: preview.wellbeingChangesPpm,
              followUps: preview.followUps,
              netOutcomeCents: preview.netOutcomeCents,
            });
            const materiallyDistinct = preview.status === "available" &&
              !seenMaterialOutcomes.has(materialFingerprint);
            if (preview.status === "available") {
              seenMaterialOutcomes.add(materialFingerprint);
            }
            return Object.freeze({
              responseId,
              status: preview.status,
              materiallyDistinct,
            });
          }),
        );
        const availableChoiceIds = Object.freeze(
          responseAvailability
            .filter(({ status }) => status === "available")
            .map(({ responseId }) => responseId),
        );
        const materiallyAvailableChoiceIds = Object.freeze(
          responseAvailability
            .filter(({ status, materiallyDistinct }) =>
              status === "available" && materiallyDistinct
            )
            .map(({ responseId }) => responseId),
        );
        if (availableChoiceIds.length === 0) {
          throw new OfflineBalanceLabV1Error(
            "PRODUCTION_OWNER_VIOLATION",
            "pending event has no available response",
          );
        }
        const baselineLiquidityCents = record.closingAutomaticLiquidityCents ??
          ports.calculateAutomaticLiquidity(nextState.finances);
        const response = chooseBalanceLabEventResponseV1({
          policy,
          templateId: pending.templateId,
          validChoiceIds: availableChoiceIds,
          botRandom: nextBotRandom,
        });
        const choiceId = response.choiceId;
        nextBotRandom = response.nextBotRandom;
        nextState = ports.resolveEvent(
          nextState,
          {
            schemaVersion: 2,
            id: `lab.event.${monthIndex}.${nextState.revision}`,
            type: "resolve_event_choice",
            expectedRevision: nextState.revision,
            effectiveMonth: nextState.currentMonth,
            payload: { eventId: pending.eventId, choiceId },
          },
          { personalEventCatalog },
        );
        const evidence = nextState.gameplay.eventLifecycle.history.at(-1);
        if (evidence !== undefined) {
          resolvedEvent = Object.freeze({
            monthIndex,
            eventId: evidence.eventId,
            templateId: evidence.templateId,
            templateVersion: evidence.templateVersion,
            scheduledMonth: evidence.scheduledMonth,
            choiceId: evidence.choiceId,
            availableChoiceIds,
            materiallyAvailableChoiceIds,
            responseAvailability,
            classification: evidence.classification ?? "neutral",
            followUpSourceEventId: evidence.followUpSourceEventId ?? null,
            playerCostCents: evidence.playerCostCents,
            insurerCostCents: evidence.insurerCostCents,
            baselineLiquidityCents,
          });
        }
        botIntents.push(Object.freeze({
          monthIndex,
          intentId: `intent.event.${pending.templateId}`,
          command: "resolve_event_choice",
          disposition: "resolved",
          eventId: pending.eventId,
          choiceId,
        }));
      }
      const worldRandom = nextState.worldRandom;
      if (worldRandom === undefined) {
        throw new OfflineBalanceLabV1Error(
          "PRODUCTION_OWNER_VIOLATION",
          "production state lost named world streams",
        );
      }
      const worldEvidence: BalanceLabWorldEvidenceV1 = Object.freeze({
        monthIndex,
        macroEvidenceHash: evidence.macroEvidenceHash,
        rawOpportunityFingerprint:
          evidence.rawOpportunityFingerprint ??
          sha256Canonical({ terminalSchedulingMonth: monthIndex }),
        nextMacroStateValue: worldRandom.macro.value,
        nextOpportunityEpochValue: worldRandom.eventOpportunity.value,
      });
      return Object.freeze({
        state: nextState,
        record: Object.freeze({
          turn: record,
          closingAutomaticLiquidityCents: resolvedEvent === undefined
            ? (record.closingAutomaticLiquidityCents ??
                ports.calculateAutomaticLiquidity(nextState.finances))
            : ports.calculateAutomaticLiquidity(nextState.finances),
          ...(resolvedEvent === undefined ? {} : { resolvedEvent }),
          shortfall: record.shortfall,
        }),
        worldRandom,
        worldEvidence,
        terminal: nextState.outcome !== null,
        nextBotRandom,
        botIntents: Object.freeze(botIntents),
      });
    },
    observeBalance: ({ state, record, monthIndex }) =>
      observeBalanceLabMonthV1(state, record, monthIndex, personalEventCatalog),
    readAuthoritativeMetrics: ({ state, records, processedMonths, balanceObservations }) => {
      const goal = ports.projectGoal(state.finances);
      const netWorth = ports.calculateNetWorth(state.finances);
      const liquidSolvency = ports.calculateAutomaticLiquidity(state.finances);
      const history = state.gameplay.eventLifecycle.history;
      const eventCountByTier = Object.freeze({
        micro: history.filter(({ tier }) => tier === "micro").length,
        medium: history.filter(({ tier }) => tier === "medium").length,
        large: history.filter(({ tier }) => tier === "large").length,
        catastrophe: history.filter(({ tier }) => tier === "catastrophe").length,
      });
      const outcomeKind = state.outcome?.kind;
      const endReason = outcomeKind === "bankruptcy"
        ? "bankruptcy"
        : outcomeKind === "financial_independence"
          ? "financial_independence"
          : outcomeKind === "retirement_age"
            ? "retirement"
            : "active";
      const difficulty = state.gameplay.runtimeBalance?.version === 2
        ? state.gameplay.runtimeBalance.difficulty
        : "normal";
      const pacing = measureRuntimeBalancePacingV1(history, difficulty);
      const recoveryObservations = measureRecoveryObservationsV1(records);
      const openingObservation = balanceObservations.find(({ stage }) => stage === "opening");
      const terminalObservation = balanceObservations.findLast(({ stage }) => stage === "monthly") ??
        openingObservation;
      const chapterAssessment =
        processedMonths === 12 && openingObservation !== undefined && terminalObservation !== undefined
          ? assessBeginnerChapterV1({
              startMonth: openingObservation.month,
              currentMonth: terminalObservation.month,
              preparedness: terminalObservation.preparedness,
              outcome: state.outcome,
            })
          : null;
      const beginnerChapterEvidence = endReason === "bankruptcy" && processedMonths <= 12 &&
          terminalObservation !== undefined
        ? Object.freeze({
            outcome: "bankrupt" as const,
            completed: false,
            observedMonths: processedMonths,
            scorePpm: terminalObservation.preparedness.scorePpm,
            preparednessBand: terminalObservation.preparedness.band,
          })
        : chapterAssessment === null
          ? undefined
          : Object.freeze({
              outcome: chapterAssessment.outcome,
              completed: chapterAssessment.completed,
              observedMonths: processedMonths,
              scorePpm: chapterAssessment.scorePpm,
              preparednessBand: chapterAssessment.preparednessBand,
            });
      const eventDecisionEvidence = Object.freeze(
        records.flatMap(({ resolvedEvent }) => {
          if (resolvedEvent === undefined) return [];
          const presentation = eventPresentationV1(
            resolvedEvent.templateId,
            resolvedEvent.templateVersion,
          );
          const approvedChallenge = balanceObservations.find(
            ({ monthIndex, approvedChallenge }) =>
              monthIndex === resolvedEvent.monthIndex &&
              approvedChallenge?.templateId === resolvedEvent.templateId &&
              approvedChallenge.templateVersion === resolvedEvent.templateVersion,
          )?.approvedChallenge;
          return [Object.freeze({
            eventId: resolvedEvent.eventId,
            templateId: resolvedEvent.templateId,
            templateVersion: resolvedEvent.templateVersion,
            scheduledMonth: resolvedEvent.scheduledMonth,
            tone: presentation.tone,
            cadenceRole: presentation.cadenceRole,
            classification: resolvedEvent.classification,
            challengeBand: approvedChallenge?.assessment.band ?? null,
            followUpSourceEventId: resolvedEvent.followUpSourceEventId,
            choiceId: resolvedEvent.choiceId,
            availableChoiceIds: resolvedEvent.availableChoiceIds,
            materiallyAvailableChoiceIds:
              resolvedEvent.materiallyAvailableChoiceIds,
            responseAvailability: resolvedEvent.responseAvailability,
          })];
        }),
      );
      const beginnerEventCadenceEvidence = Object.freeze(
        records.flatMap(({ turn }) =>
          turn.beginnerEventCadence === undefined
            ? []
            : [turn.beginnerEventCadence]
        ),
      );
      return Object.freeze({
        endReason,
        grade: state.outcome?.grade ?? null,
        retirementFiProgressPpm: goal.progressPpm,
        displayedNetWorthCents: netWorth,
        liquidSolvencyCents: liquidSolvency,
        highInterestDebtCreatedCents: safeSum(
          records.map(({ turn }) => turn.funding?.creditDrawnCents ?? 0),
        ),
        interestPaidCents: safeSum(
          records.map(({ turn }) => turn.debtService.totalInterestCents),
        ),
        forcedSaleCount: records.filter(
          ({ turn }) => (turn.fundingPlan?.grossLiquidationCents ?? 0) > 0,
        ).length,
        eventCountByTier,
        catastropheCount: eventCountByTier.catastrophe,
        recoveryObservations,
        recoveryMonths: Object.freeze(
          recoveryObservations
            .filter(({ status }) => status === "recovered")
            .map(({ observedMonths }) => observedMonths),
        ),
        lessonIds: Object.freeze(
          history.flatMap(({ lessonTags }) =>
            lessonTags === undefined
              ? []
              : [lessonTags.primary, ...lessonTags.secondary],
          ),
        ),
        noEventMonths: records.filter(
          ({ turn }) => turn.runtimeBalanceDecision?.status === "none",
        ).length,
        unavoidableFailure: false,
        bankruptcyResidualShortfallCents:
          bankruptcyResidualShortfallCentsV1(endReason, records),
        totalEventPlayerCostCents: safeSum(
          history.map(({ playerCostCents }) => playerCostCents),
        ),
        totalEventGrossCostCents: safeSum(
          history.map(
            ({ playerCostCents, insurerCostCents }) =>
              playerCostCents + insurerCostCents,
          ),
        ),
        eventImpactSamples: Object.freeze(
          history
            .map((event) => Object.freeze({
              eventId: event.eventId,
              templateId: event.templateId,
              playerCostCents: event.playerCostCents,
              grossCostCents: event.playerCostCents + event.insurerCostCents,
            }))
            .filter(({ grossCostCents }) => grossCostCents > 0),
        ),
        majorEventPacingViolationCount: pacing.violationCount,
        majorEventPacingSampleCount: pacing.sampleCount,
        balanceObservations,
        ...(beginnerChapterEvidence === undefined ? {} : { beginnerChapterEvidence }),
        eventDecisionEvidence,
        beginnerEventCadenceEvidence,
        objectiveValues: Object.freeze({
          survival: state.outcome?.kind === "bankruptcy" ? 0 : 1,
          fiProgressPpm: goal.progressPpm,
          displayedNetWorthCents: netWorth,
          liquidSolvencyCents: liquidSolvency,
        }),
      });
    },
  });
}
