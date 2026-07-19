import type { GameStateV2 } from "@/core/game-state-v2";
import { assessBeginnerChapterV1, type BeginnerChapterAssessmentV1 } from "@/core/beginner-chapter-v1";
import {
  calculateInvestableAssets,
  calculateNetWorth,
} from "@/core/game-state";
import { allocateMoney } from "@/core/domain/money";
import { calculateTotalMinimumDebtPaymentV2 } from "@/core/debt-service-v2";
import { projectFinancialGoal } from "@/core/financial-goals-v2";
import { analyzeRiskV1 } from "@/core/risk-v1";
import {
  assessPreparednessV1,
  type PreparednessAssessmentV1,
} from "@/core/preparedness-assessment-v1";
import { getEventTemplate } from "@/data/event-templates";
import { getPersonalEventTemplateV2 } from "@/data/personal-event-templates-v2";
import { activeInsuranceCoveragesV2 } from "@/core/insurance-selection-v2";
import { planRevolvingCreditMonthV2 } from "@/core/revolving-credit-v2";
import {
  projectPersonalEventResponsePreviewV1,
  type PersonalEventResponsePreviewV1,
} from "./personal-event-response-preview-v1";

export type RunView = Readonly<{
  runId: string;
  revision: number;
  startMonth: string;
  currentMonth: string;
  status: "active" | "completed";
  player: Readonly<{
    playerId: string;
    birthMonth: string;
    locationId: string;
    careerId: string;
    filingStatus: GameStateV2["player"]["filingStatus"];
  }>;
  finances: Readonly<{
    cashCents: number;
    taxableInvestmentsCents: number;
    retirementCents: number;
    homeValueCents: number;
    otherInvestableAssetsCents: number;
    otherAssetsCents: number;
    nonCreditLiabilitiesCents: number;
    creditLimitCents: number;
    creditUsedCents: number;
    annualLivingCostCents: number;
    requiredObligationsCents: number;
    monthlyObligations: Readonly<{
      livingCostCents: number;
      healthPremiumCents: number;
      additionalInsurancePremiumsCents: number;
      termDebtMinimumsCents: number;
      revolvingCreditMinimumCents: number;
      otherRequiredCents: number;
      totalRequiredCashCents: number;
    }>;
    investableAssetsCents: number;
    netWorthCents: number;
  }>;
  income: Readonly<{
    annualGrossSalaryCents: number | null;
  }>;
  wellbeing: Readonly<{
    burnoutPpm: number;
    happinessPpm: number;
  }>;
  goal: Readonly<{
    source: "player_selected" | "current_lifestyle_default";
    desiredAnnualSpendingCents: number;
    safeWithdrawalRatePpm: number;
    targetAgeYears: number;
    /** Investable assets net of current liabilities, owned by goal projection. */
    currentCents: number;
    targetCents: number;
    progressPpm: number;
  }>;
  risk: Readonly<{
    aggregateSeverityPpm: number;
    weaknessTags: readonly string[];
  }>;
  preparedness: PreparednessAssessmentV1;
  beginnerCheckpoint: BeginnerChapterAssessmentV1 | null;
  strategy: Readonly<{
    effectiveMonth: string;
    emergencyFundTargetMonthsPpm?: number;
    insuranceCoverageIds?: readonly string[];
    preTax401kSalaryRatePpm: number;
    preTaxHsaSalaryRatePpm: number;
    afterTaxBroadIndexRatePpm: number;
    afterTaxSectorRatePpm: number;
    afterTaxSpeculativeRatePpm: number;
    afterTaxIraRatePpm: number;
    afterTaxExtraDebtRatePpm: number;
  }>;
  market: Readonly<{
    regime: GameStateV2["marketRegime"];
    modelVersion: GameStateV2["gameplay"]["market"]["modelVersion"];
  }>;
  career: Readonly<{
    pendingProgramIds: readonly string[];
  }>;
  /**
   * Scenario-selected benefits the player is actually enrolled in. Null for
   * legacy runs created before the catalog snapshot existed, so every reader
   * must treat an absent block as "unknown" rather than "no coverage".
   */
  benefits: Readonly<{
    retirementPlan: Readonly<{
      label: string;
      employeeAnnualLimitCents: number;
      employerMatchTiers: readonly Readonly<{
        employeeContributionRateUpToPpm: number;
        employerMatchRatePpm: number;
      }>[];
    }>;
    healthPlan: Readonly<{
      label: string;
      hsaEligible: boolean;
      monthlyPremiumCents: number;
      annualDeductibleCents: number;
      annualOutOfPocketMaximumCents: number;
      coinsurancePpm: number;
    }> | null;
    insuranceCoverages: readonly Readonly<{
      id: string;
      label: string;
      kind: "short_term_disability" | "long_term_disability" | "term_life" | "renters";
      monthlyPremiumCents: number;
      coverageLimitCents: number;
      deductibleCents: number;
    }>[];
  }> | null;
  pendingInteraction:
    | Readonly<{ kind: "none" }>
    | Readonly<{
        kind: "event";
        eventId: string;
        templateId: string;
        choiceIds: readonly string[];
        choices: readonly Readonly<{
          id: string;
          label: string;
          description: string;
          enabled: boolean;
          preview: PersonalEventResponsePreviewV1;
        }>[];
        parameters: Readonly<Record<string, number>>;
        headline: string | null;
        body: string | null;
      }>;
  outcome: unknown | null;
  capabilities: Readonly<{
    canAdvance: boolean;
    canAct: boolean;
    canRequestTeaching: boolean;
  }>;
}>;

/**
 * Mirrors the self/family split `applyInsuranceMonthV2` uses, so the numbers a
 * player reads on the Safety screen are the ones the engine will charge them.
 */
function projectBenefits(state: GameStateV2): RunView["benefits"] {
  const snapshot = state.gameplay.catalogSnapshot;
  if (snapshot === null) return null;
  const { healthPlan, retirementPlan, household } = snapshot.selected;
  const insuranceCoverages = activeInsuranceCoveragesV2(state);
  const family = household.healthCoverageTier === "family";

  return Object.freeze({
    retirementPlan: Object.freeze({
      label: retirementPlan.label,
      employeeAnnualLimitCents: retirementPlan.employeeAnnualLimitCents,
      employerMatchTiers: Object.freeze(
        retirementPlan.employerMatchTiers.map((tier) => Object.freeze({ ...tier })),
      ),
    }),
    healthPlan:
      healthPlan === null
        ? null
        : Object.freeze({
            label: healthPlan.label,
            hsaEligible: healthPlan.hsaEligible,
            monthlyPremiumCents: snapshot.derived.monthlyHealthPremiumCents,
            annualDeductibleCents: family
              ? healthPlan.annualDeductibleFamilyCents
              : healthPlan.annualDeductibleSelfCents,
            annualOutOfPocketMaximumCents: family
              ? healthPlan.annualOutOfPocketMaximumFamilyCents
              : healthPlan.annualOutOfPocketMaximumSelfCents,
            coinsurancePpm: healthPlan.coinsurancePpm,
          }),
    insuranceCoverages: Object.freeze(
      insuranceCoverages.map((coverage) =>
        Object.freeze({
          id: coverage.id,
          label: coverage.label,
          kind: coverage.kind,
          monthlyPremiumCents: coverage.monthlyPremiumCents,
          coverageLimitCents: coverage.coverageLimitCents,
          deductibleCents: coverage.deductibleCents,
        }),
      ),
    ),
  });
}

function projectMonthlyObligations(
  state: GameStateV2,
): RunView["finances"]["monthlyObligations"] {
  const livingCostCents = allocateMoney(
    state.finances.annualLivingCostCents,
    1,
    12,
  );
  const healthPremiumCents =
    state.gameplay.catalogSnapshot?.derived.monthlyHealthPremiumCents ?? 0;
  const additionalInsurancePremiumsCents = activeInsuranceCoveragesV2(state)
    .reduce((total, coverage) => total + coverage.monthlyPremiumCents, 0);
  const termDebtMinimumsCents = calculateTotalMinimumDebtPaymentV2(
    state.gameplay.debts.termDebts,
  );
  const revolvingCreditMinimumCents = planRevolvingCreditMonthV2(
    state.finances.creditUsedCents,
  ).scheduledPaymentCents;
  const knownStoredObligations =
    livingCostCents +
    healthPremiumCents +
    additionalInsurancePremiumsCents +
    termDebtMinimumsCents;
  const otherRequiredCents = Math.max(
    0,
    state.finances.requiredObligationsCents - knownStoredObligations,
  );

  return Object.freeze({
    livingCostCents,
    healthPremiumCents,
    additionalInsurancePremiumsCents,
    termDebtMinimumsCents,
    revolvingCreditMinimumCents,
    otherRequiredCents,
    totalRequiredCashCents:
      state.finances.requiredObligationsCents + revolvingCreditMinimumCents,
  });
}

function titleCaseIdentifier(id: string): string {
  return id.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function legacyChoicePreview(summary: string): PersonalEventResponsePreviewV1 {
  return Object.freeze({
    version: "personal-event-response-preview-v1",
    status: "available",
    immediateCashChangeCents: 0,
    recurringCashFlows: Object.freeze([]),
    annualLivingCostChangeCents: 0,
    wellbeingChangesPpm: Object.freeze({ happiness: 0, burnout: 0 }),
    followUps: Object.freeze([]),
    netOutcomeCents: null,
    unavailableReason: null,
    summary,
  });
}

function projectEventChoices(
  state: GameStateV2,
  pending: NonNullable<GameStateV2["gameplay"]["eventLifecycle"]["pending"]>,
): readonly Readonly<{
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  preview: PersonalEventResponsePreviewV1;
}>[] {
  try {
    if (pending.eventSchemaVersion === 2) {
      const template = getPersonalEventTemplateV2(
        pending.templateId,
        pending.templateVersion,
      );
      return Object.freeze(pending.choiceIds.map((id) => {
        const response = template.responses.find((candidate) => candidate.id === id);
        const preview = response === undefined
          ? legacyChoicePreview("")
          : projectPersonalEventResponsePreviewV1(state, pending, template, id);
        return Object.freeze({
          id,
          label: response?.label ?? titleCaseIdentifier(id),
          description: preview.summary,
          enabled: response !== undefined && preview.status === "available",
          preview,
        });
      }));
    }
    const template = getEventTemplate(pending.templateId, pending.templateVersion);
    return Object.freeze(pending.choiceIds.map((id) => {
      const choice = template.choices.find((candidate) => candidate.id === id);
      return Object.freeze({
        id,
        label: titleCaseIdentifier(id),
        description: choice?.principle ?? "",
        enabled: choice !== undefined,
        preview: legacyChoicePreview(choice?.principle ?? ""),
      });
    }));
  } catch {
    return Object.freeze(pending.choiceIds.map((id) => Object.freeze({
      id,
      label: titleCaseIdentifier(id),
      description: "",
      enabled: false,
      preview: Object.freeze({
        ...legacyChoicePreview("Response preview is unavailable"),
        status: "error" as const,
        unavailableReason: "Response preview is unavailable",
      }),
    })));
  }
}

export function projectRunView(state: GameStateV2): RunView {
  const financialGoal = projectFinancialGoal(
    state.finances,
    state.gameplay.financialGoal,
  );
  const risk = analyzeRiskV1(state);
  const preparedness = assessPreparednessV1(risk);
  const beginnerCheckpoint = assessBeginnerChapterV1({
    startMonth: state.startMonth,
    currentMonth: state.currentMonth,
    preparedness,
    outcome: state.outcome,
  });
  const pending = state.gameplay.eventLifecycle.pending;
  const active = state.outcome === null;

  return Object.freeze({
    runId: state.runId,
    revision: state.revision,
    startMonth: state.startMonth,
    currentMonth: state.currentMonth,
    status: active ? "active" : "completed",
    player: Object.freeze({
      playerId: state.player.playerId,
      birthMonth: state.player.birthMonth,
      locationId: state.player.locationId,
      careerId: state.player.careerTrackId,
      filingStatus: state.player.filingStatus,
    }),
    finances: Object.freeze({
      cashCents: state.finances.cashCents,
      taxableInvestmentsCents: state.finances.taxableInvestmentsCents,
      retirementCents: state.finances.retirementCents,
      homeValueCents: state.finances.homeValueCents,
      otherInvestableAssetsCents: state.finances.otherInvestableAssetsCents,
      otherAssetsCents: state.finances.otherAssetsCents,
      nonCreditLiabilitiesCents: state.finances.nonCreditLiabilitiesCents,
      creditLimitCents: state.finances.creditLimitCents,
      creditUsedCents: state.finances.creditUsedCents,
      annualLivingCostCents: state.finances.annualLivingCostCents,
      requiredObligationsCents: state.finances.requiredObligationsCents,
      monthlyObligations: projectMonthlyObligations(state),
      investableAssetsCents: calculateInvestableAssets(state.finances),
      netWorthCents: calculateNetWorth(state.finances),
    }),
    income: Object.freeze({
      annualGrossSalaryCents: state.gameplay.employment.annualGrossSalaryCents,
    }),
    wellbeing: Object.freeze({
      burnoutPpm: state.wellbeing.burnoutPpm,
      happinessPpm: state.wellbeing.happinessPpm,
    }),
    goal: Object.freeze({
      source: financialGoal.goal.source,
      desiredAnnualSpendingCents:
        financialGoal.goal.desiredAnnualSpendingCents,
      safeWithdrawalRatePpm: financialGoal.goal.safeWithdrawalRatePpm,
      targetAgeYears: financialGoal.goal.targetAgeYears,
      currentCents: financialGoal.investableAssetsCents,
      targetCents: financialGoal.targetCents,
      progressPpm: financialGoal.progressPpm,
    }),
    risk: Object.freeze({
      aggregateSeverityPpm: risk.aggregateSeverityPpm,
      weaknessTags: risk.weaknessTags,
    }),
    preparedness,
    beginnerCheckpoint,
    strategy: state.gameplay.recurringStrategy,
    market: Object.freeze({
      regime: state.marketRegime,
      modelVersion: state.gameplay.market.modelVersion,
    }),
    career: Object.freeze({
      pendingProgramIds: Object.freeze(
        state.gameplay.careerDevelopment.pending.map(({ programId }) => programId),
      ),
    }),
    benefits: projectBenefits(state),
    pendingInteraction:
      pending === null
        ? Object.freeze({ kind: "none" as const })
        : Object.freeze({
            kind: "event" as const,
            eventId: pending.eventId,
            templateId: pending.templateId,
            choiceIds: pending.choiceIds,
            choices: projectEventChoices(state, pending),
            parameters: Object.freeze({ ...pending.parameters }),
            headline:
              pending.aiNarrative?.headline ??
              pending.fallbackNarrative?.headline ??
              null,
            body:
              pending.aiNarrative?.narrative ??
              pending.fallbackNarrative?.body ??
              null,
          }),
    outcome: state.outcome,
    capabilities: Object.freeze({
      canAdvance: active && pending === null,
      canAct: active && pending === null,
      canRequestTeaching: true,
    }),
  });
}
