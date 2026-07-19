import { describe, expect, expectTypeOf, it } from "vitest";

import { sha256Canonical } from "../canonical";
import { buildCheckpointEvidenceV2 } from "../checkpoint-v2";
import { reduceDetailedFinanceCommand } from "../detailed-actions-v2";
import { moneyCents, ratePpm } from "../domain/money";
import { simulationMonth } from "../domain/month";
import { randomState } from "../domain/rng";
import {
  FINANCIAL_KERNEL_V2_VERSION,
  simulateFinancialMonthV2,
  type ResolvedCashFlowV2,
} from "../financial-kernel-v2";
import { projectFinancialGoal } from "../financial-goals-v2";
import {
  CAUSAL_EVENT_SCHEDULER_V1_VERSION,
  DECLARATIVE_EVENT_SCHEDULER_V2_VERSION,
  LEGACY_EXPOSURE_EVENT_SCHEDULER,
} from "../event-scheduler-v2";
import { calculateNetWorth } from "../game-state";
import {
  finalizeGameStateV2,
  validateGameStateV2,
  type GameStateV2,
} from "../game-state-v2";
import {
  MACRO_MARKET_MODEL_V2_VERSION,
  marketSimulationState,
  simulateMarketMonth,
} from "../market";
import { activeMacroReturnModifiersV2 } from "../macro-story-v2";
import * as monthlyTurnV2Module from "../monthly-turn-v2";
import {
  financialKernelVersionForCommandV2,
  eventSchedulerVersionForCommandV2,
  marketModelVersionForCommandV2,
  outcomePolicyVersionForCommandV2,
  processMonthlyTurnV2,
  runtimeBalanceControllerVersionForCommandV2,
  scenarioDirectorVersionForCommandV2,
  worldRandomVersionForCommandV2,
  type ProcessMonthV2Command,
} from "../monthly-turn-v2";
import { OUTCOME_POLICY_V1_VERSION } from "../outcome-policy-v2";
import { RUNTIME_BALANCE_CONTROLLER_V1_VERSION } from "../runtime-balance-policy-v2";
import { createInitialRuntimeBalanceStateV2 } from "../runtime-balance-state-v2";
import { SCENARIO_DIRECTOR_V2_VERSION } from "../scenario-director-policy-v2";
import { createNativeGameStateV2 } from "../native-game-state-v2";
import { setRecurringStrategy } from "../recurring-strategy-v2";
import { resolveScenarioCatalogSelection } from "../scenario-catalog";
import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../../data/scenario-catalog";
import { decodePersistedGameCommandV2 } from "../../server/db/persisted-command-v2";
import { reduceGameCommandV2 } from "../../server/db/run-repository-support";
import { decodePersistedGameState } from "../persisted-game-state";
import {
  HISTORICAL_PERSONAL_EVENT_TEMPLATES_V2,
  PERSONAL_EVENT_TEMPLATES_V2,
  getActivePersonalEventTemplateV2,
} from "../../data/personal-event-templates-v2";
import { BEGINNER_EVENT_CADENCE_V1_VERSION } from "../beginner-event-cadence-v1";
import {
  initializeNamedWorldRandomV1,
  WORLD_RANDOM_VERSION_V1,
} from "../world-random-v1";

function configuredState(
  financeOverrides: Partial<
    Parameters<typeof createNativeGameStateV2>[0]["finances"]
  > = {},
) {
  const resolvedScenario = resolveScenarioCatalogSelection(
    US_2026_SCENARIO_CATALOG,
    {
      catalogVersion: US_2026_SCENARIO_CATALOG_VERSION,
      locationId: "location.seattle",
      careerId: "career.software",
      householdId: "household.single",
      benefitsPackageId: "benefits.corporate_flex",
      healthPlanId: "health.hdhp_hsa",
      retirementPlanId: "retirement.401k_standard",
      insuranceCoverageIds: ["insurance.renters"],
      scenarioId: "scenario.fresh_start",
    },
  );
  const initial = createNativeGameStateV2({
    runId: "run.monthly-v2",
    playerId: "player.monthly-v2",
    birthMonth: simulationMonth("1995-01"),
    startMonth: simulationMonth("2026-07"),
    randomSeed: "monthly-v2-golden",
    resolvedScenario,
    annualGrossSalaryCents: moneyCents(12_000_000),
    finances: {
      cashCents: moneyCents(1_000_000),
      taxableBroadIndexCents: moneyCents(1_000_000),
      taxableSectorCents: moneyCents(200_000),
      taxableSpeculativeCents: moneyCents(100_000),
      retirement401kCents: moneyCents(500_000),
      retirementIraCents: moneyCents(100_000),
      hsaCents: moneyCents(50_000),
      homeValueCents: moneyCents(0),
      otherAssetsCents: moneyCents(0),
      termDebts: [
        {
          id: "debt.student.1",
          kind: "student_loan",
          principalCents: moneyCents(120_000),
          annualInterestRatePpm: ratePpm(120_000),
          minimumPaymentCents: moneyCents(11_000),
          remainingTermMonths: 12,
        },
      ],
      revolvingCreditLimitCents: moneyCents(1_000_000),
      revolvingCreditUsedCents: moneyCents(0),
      ...financeOverrides,
    },
    wellbeing: {
      burnoutPpm: ratePpm(100_000),
      happinessPpm: ratePpm(900_000),
    },
  });
  return setRecurringStrategy(initial, {
    schemaVersion: 2,
    id: "cmd.strategy.initial",
    type: "set_recurring_strategy",
    expectedRevision: 0,
    effectiveMonth: initial.currentMonth,
    payload: {
      strategy: {
        preTax401kSalaryRatePpm: ratePpm(50_000),
        preTaxHsaSalaryRatePpm: ratePpm(20_000),
        afterTaxBroadIndexRatePpm: ratePpm(200_000),
        afterTaxSectorRatePpm: ratePpm(0),
        afterTaxSpeculativeRatePpm: ratePpm(0),
        afterTaxIraRatePpm: ratePpm(100_000),
        afterTaxExtraDebtRatePpm: ratePpm(200_000),
      },
    },
  });
}

describe("named world random monthly routing", () => {
  const namedCommand = (state: ReturnType<typeof configuredState>) =>
    command(state, {
      financialKernelVersion: FINANCIAL_KERNEL_V2_VERSION,
      outcomePolicyVersion: OUTCOME_POLICY_V1_VERSION,
      eventSchedulerVersion: DECLARATIVE_EVENT_SCHEDULER_V2_VERSION,
      runtimeBalanceControllerVersion: RUNTIME_BALANCE_CONTROLLER_V1_VERSION,
      scenarioDirectorVersion: SCENARIO_DIRECTOR_V2_VERSION,
      worldRandomVersion: WORLD_RANDOM_VERSION_V1,
      marketModelVersion: MACRO_MARKET_MODEL_V2_VERSION,
      macroDifficulty: "normal",
    });

  it("routes macro, opportunity, and parameter draws without advancing the historical root cursor", () => {
    const opening = configuredState();
    const expectedWorld = initializeNamedWorldRandomV1(opening.random);
    const accepted = namedCommand(opening);

    expect(worldRandomVersionForCommandV2(accepted)).toBe(WORLD_RANDOM_VERSION_V1);
    const first = processMonthlyTurnV2(opening, accepted);
    const repeated = processMonthlyTurnV2(opening, accepted);

    expect(first).toEqual(repeated);
    expect(first.state.random).toEqual(opening.random);
    expect(first.state.worldRandom?.macro).not.toEqual(expectedWorld.macro);
    expect(first.state.worldRandom?.eventOpportunity).not.toEqual(
      expectedWorld.eventOpportunity,
    );
    expect(first.state.worldRandom?.eventParameters).not.toEqual(
      expectedWorld.eventParameters,
    );
    expect(first.state.worldRandom?.balanceDirector).toEqual(
      expectedWorld.balanceDirector,
    );
    expect(first.record.worldRandomEvidence).toMatchObject({
      version: WORLD_RANDOM_VERSION_V1,
      openingMacroStateValue: expectedWorld.macro.value,
      openingOpportunityEpochValue: expectedWorld.eventOpportunity.value,
      openingParameterEpochValue: expectedWorld.eventParameters.value,
    });
    expect(first.record.worldRandomEvidence?.rawOpportunityFingerprint).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(first.record.worldRandomEvidence?.grossParameterFingerprint).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });

  it("round-trips the discriminator through the accepted command decoder", () => {
    const accepted = namedCommand(configuredState());
    expect(decodePersistedGameCommandV2(JSON.parse(JSON.stringify(accepted)))).toEqual(
      accepted,
    );
  });

  it("uses the trained local ranker after exact impacts and remains replayable", () => {
    const opening = configuredState();
    const templates = [
      getActivePersonalEventTemplateV2("personal.performance_bonus"),
      getActivePersonalEventTemplateV2("personal.utility_rebate"),
    ].map((template) => ({
      ...template,
      hazard: {
        ...template.hazard,
        baseChancePpm: 1_000_000,
        minimumChancePpm: 1_000_000,
        maximumChancePpm: 1_000_000,
      },
    }));
    const dependencies = {
      personalEventCatalog: templates,
      activePersonalEventCatalog: templates,
    };
    const first = processMonthlyTurnV2(
      opening,
      namedCommand(opening),
      dependencies,
    );
    const replay = processMonthlyTurnV2(
      opening,
      namedCommand(opening),
      dependencies,
    );

    expect(replay).toEqual(first);
    expect(first.record.scenarioDirectorDecision?.rankingSource).toBe(
      "operational_ml_ranking",
    );
    expect(first.record.operationalEventRankerEvidence).toMatchObject({
      version: "operational-event-ranker-v1",
      status: "ranked",
      candidateCount: 2,
      artifactChecksum: expect.stringMatching(/^[a-f0-9]{64}$/),
      featureSetChecksum: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(first.record.runtimeBalanceDecision?.scenarioDirector?.rankingSource)
      .toBe("operational_ml_ranking");
  });

  it("locks the accepted-command named-world replay checksum", () => {
    const opening = configuredState();
    const accepted = decodePersistedGameCommandV2(
      JSON.parse(JSON.stringify(namedCommand(opening))),
    );
    const first = reduceGameCommandV2(opening, accepted);
    const repeated = reduceGameCommandV2(opening, accepted);

    expect(first).toEqual(repeated);
    expect(first.monthlyRecord?.worldRandomEvidence?.version).toBe(
      WORLD_RANDOM_VERSION_V1,
    );
    expect(sha256Canonical(first.state)).toBe(
      "7c8b5ad039c1e5914246919a538f37e04a4b61f3bcb39897d766a81dc9b8e4e9",
    );
  });

  it("rejects invalid event configuration before a named world transition", () => {
    const opening = configuredState();
    const invalidCatalog = [
      {
        ...PERSONAL_EVENT_TEMPLATES_V2[0]!,
        parameters: [
          {
            ...PERSONAL_EVENT_TEMPLATES_V2[0]!.parameters[0]!,
            minimum: 10,
            maximum: 1,
          },
        ],
      },
    ];
    const checksum = sha256Canonical(opening);

    expect(() =>
      processMonthlyTurnV2(opening, namedCommand(opening), {
        personalEventCatalog: invalidCatalog,
      }),
    ).toThrowError(/invalid event configuration/);
    expect(sha256Canonical(opening)).toBe(checksum);
    expect(opening.worldRandom).toBeUndefined();
  });

  it("separates complete replay templates from active root scheduling templates", () => {
    const opening = configuredState();
    const source = getActivePersonalEventTemplateV2(
      "personal.subscription_archaeology",
    );
    const guaranteed = {
      ...source,
      hazard: {
        ...source.hazard,
        baseChancePpm: 1_000_000,
        minimumChancePpm: 1_000_000,
        maximumChancePpm: 1_000_000,
      },
    };
    const completeCatalog = PERSONAL_EVENT_TEMPLATES_V2.map((template) =>
      template.id === guaranteed.id && template.version === guaranteed.version
        ? guaranteed
        : template
    );
    const result = processMonthlyTurnV2(opening, namedCommand(opening), {
      personalEventCatalog: completeCatalog,
      activePersonalEventCatalog: [guaranteed],
      beginnerEventCadenceVersion: BEGINNER_EVENT_CADENCE_V1_VERSION,
    });

    expect(result.record.runtimeBalanceCandidateSet).toEqual({
      eligibleTemplateIds: [guaranteed.id],
      candidateTemplateIds: [guaranteed.id],
    });
    expect(result.record.beginnerEventCadence).toMatchObject({
      assessment: { mode: "engagement_due", chapterMonth: 2 },
      inputCandidateIds: [guaranteed.id],
      outputCandidateIds: [guaranteed.id],
    });
  });

  it("keeps the uncalibrated production root catalog historical", () => {
    const opening = configuredState();
    const result = processMonthlyTurnV2(opening, namedCommand(opening));
    const historicalIds = new Set(
      HISTORICAL_PERSONAL_EVENT_TEMPLATES_V2.map(({ id }) => id),
    );

    expect(result.record.runtimeBalanceCandidateSet?.eligibleTemplateIds.every(
      (id) => historicalIds.has(id),
    )).toBe(true);
    expect(result.record.beginnerEventCadence).toBeUndefined();
  });
});

const NO_FOLLOW_UP_EVENTS = Object.freeze({
  eventSchedulingPolicy: Object.freeze({
    version: "fairness-v1" as const,
    minimumChancePpm: 0,
    maximumChancePpm: 0,
  }),
  macroStoryPolicy: Object.freeze({
    version: "macro-story-v1" as const,
    monthlyChancePpm: 0,
    minimumDurationMonths: 1,
    maximumDurationMonths: 1,
  }),
});

function expectedMarketStep(state: ReturnType<typeof configuredState>) {
  return simulateMarketMonth(
    marketSimulationState(
      state.marketRegime,
      state.random,
      state.gameplay.market.monthsInRegime,
    ),
    activeMacroReturnModifiersV2(state),
  );
}

function directFinancialMonth(
  state: ReturnType<typeof configuredState>,
  monthCommand: ProcessMonthV2Command,
) {
  return simulateFinancialMonthV2({
    version: FINANCIAL_KERNEL_V2_VERSION,
    commandId: monthCommand.id,
    state,
    taxEvidence: monthCommand.payload.taxEvidence,
    marketStep: expectedMarketStep(state),
    taxableLiquidationCostRatePpm:
      monthCommand.payload.taxableLiquidationCostRatePpm,
    insuranceClaim: monthCommand.payload.insuranceClaim,
    resolvedCashFlows: monthCommand.payload.resolvedCashFlows,
  });
}

function exactLiquidityClaim(
  state: ReturnType<typeof configuredState>,
  residualShortfallCents: number,
) {
  const oversizedClaimCents = moneyCents(100_000_000);
  const probeCommand = command(state, {
    financialKernelVersion: "2.0.0",
    insuranceClaim: {
      type: "health",
      grossAmountCents: oversizedClaimCents,
      covered: false,
    },
  });
  const probe = directFinancialMonth(state, probeCommand);
  if (probe.shortfall === null) {
    throw new Error("oversized claim fixture must exceed automatic liquidity");
  }
  const baseRequiredCashCents =
    probe.record.requiredCashCents - oversizedClaimCents;
  const maximumFundedCashCents =
    probe.record.requiredCashCents - probe.shortfall.residualShortfallCents;
  return moneyCents(
    maximumFundedCashCents -
      baseRequiredCashCents +
      residualShortfallCents,
  );
}

function command(
  state = configuredState(),
  overrides: Partial<ProcessMonthV2Command["payload"]> = {},
  id = `cmd.month.${state.currentMonth}`,
): ProcessMonthV2Command {
  return {
    schemaVersion: 2,
    id,
    type: "process_month_v2",
    expectedRevision: state.revision,
    effectiveMonth: state.currentMonth,
    payload: {
      taxEvidence: {
        schemaVersion: 1,
        traceId: `tax.${id}`,
        economicYear: 2026,
        policyYear: 2026,
        stateCode: "WA",
        filingStatus: "single",
        provider: "PolicyEngine US",
        bundleVersion: "4.21.0",
        rulesVersion: "1.764.6",
        projectedFromFrozenPolicy: false,
        grossIncomeCents: moneyCents(1_000_000),
        employee401kContributionCents: moneyCents(50_000),
        employeeHsaContributionCents: moneyCents(20_000),
        totalTaxCents: 200_000,
        afterTaxCashIncomeCents: moneyCents(730_000),
      },
      taxableLiquidationCostRatePpm: ratePpm(10_000),
      ...overrides,
    },
  };
}

describe("atomic v2 monthly turn", () => {
  it("keeps the legacy reducer private and dispatches legacy commands publicly", () => {
    const initial = configuredState();
    const unversioned = command(initial);
    const explicitLegacy = command(initial, {
      financialKernelVersion: "legacy-4.1.0",
    });

    expect(monthlyTurnV2Module).not.toHaveProperty(
      "processMonthlyTurnV2Legacy410",
    );
    expect(financialKernelVersionForCommandV2(unversioned)).toBe(
      "legacy-4.1.0",
    );
    expect(financialKernelVersionForCommandV2(explicitLegacy)).toBe(
      "legacy-4.1.0",
    );
    expect(
      sha256Canonical(processMonthlyTurnV2(initial, unversioned).state),
    ).toBe(sha256Canonical(processMonthlyTurnV2(initial, explicitLegacy).state));
    expect(
      financialKernelVersionForCommandV2(
        command(configuredState(), { financialKernelVersion: "2.0.0" }),
      ),
    ).toBe("2.0.0");
  });

  it("rejects invented financial kernels without legacy fallback", () => {
    const initial = configuredState();
    const versioned = command(initial, {
      financialKernelVersion: "invented-kernel",
    } as never);

    expect(() => processMonthlyTurnV2(initial, versioned)).toThrow(
      expect.objectContaining({
        code: "UNSUPPORTED_FINANCIAL_KERNEL_VERSION",
      }),
    );
    expect(initial.revision).toBe(1);
  });

  it("defaults missing outcome policy to frozen history and accepts policy 1.0.0", () => {
    const initial = configuredState();
    expect(outcomePolicyVersionForCommandV2(command(initial))).toBe(
      "legacy-unversioned",
    );
    expect(
      outcomePolicyVersionForCommandV2(
        command(initial, {
          financialKernelVersion: "2.0.0",
          outcomePolicyVersion: OUTCOME_POLICY_V1_VERSION,
        }),
      ),
    ).toBe("1.0.0");
  });

  it("rejects invented or legacy-kernel outcome policies", () => {
    const initial = configuredState();
    expect(() =>
      processMonthlyTurnV2(
        initial,
        command(initial, {
          financialKernelVersion: "2.0.0",
          outcomePolicyVersion: "invented-policy",
        } as never),
      ),
    ).toThrow(
      expect.objectContaining({ code: "UNSUPPORTED_OUTCOME_POLICY_VERSION" }),
    );
    expect(() =>
      processMonthlyTurnV2(
        initial,
        command(initial, {
          financialKernelVersion: "legacy-4.1.0",
          outcomePolicyVersion: OUTCOME_POLICY_V1_VERSION,
        }),
      ),
    ).toThrow(
      expect.objectContaining({ code: "UNSUPPORTED_OUTCOME_POLICY_VERSION" }),
    );
  });

  it("defaults historical commands to exposure scheduling and accepts causal scheduling", () => {
    const initial = configuredState();
    expect(eventSchedulerVersionForCommandV2(command(initial))).toBe(
      LEGACY_EXPOSURE_EVENT_SCHEDULER,
    );
    expect(
      eventSchedulerVersionForCommandV2(
        command(initial, {
          financialKernelVersion: "2.0.0",
          eventSchedulerVersion: CAUSAL_EVENT_SCHEDULER_V1_VERSION,
        }),
      ),
    ).toBe(CAUSAL_EVENT_SCHEDULER_V1_VERSION);
    expect(() =>
      processMonthlyTurnV2(
        initial,
        command(initial, {
          financialKernelVersion: "2.0.0",
          eventSchedulerVersion: "invented-scheduler",
        } as never),
      ),
    ).toThrow(
      expect.objectContaining({ code: "UNSUPPORTED_EVENT_SCHEDULER_VERSION" }),
    );
    expect(() =>
      processMonthlyTurnV2(
        initial,
        command(initial, {
          financialKernelVersion: "legacy-4.1.0",
          eventSchedulerVersion: CAUSAL_EVENT_SCHEDULER_V1_VERSION,
        }),
      ),
    ).toThrow(
      expect.objectContaining({ code: "UNSUPPORTED_EVENT_SCHEDULER_VERSION" }),
    );
  });

  it("does not persist Exposure snapshots on the causal scheduler path", () => {
    const initial = configuredState();
    const result = processMonthlyTurnV2(
      initial,
      command(initial, {
        financialKernelVersion: "2.0.0",
        eventSchedulerVersion: CAUSAL_EVENT_SCHEDULER_V1_VERSION,
      }),
      NO_FOLLOW_UP_EVENTS,
    );

    expect(result.state.gameplay.exposure).toEqual(initial.gameplay.exposure);
  });

  it("requires an explicit compatible Runtime Balance controller selection", () => {
    const initial = configuredState();
    expect(runtimeBalanceControllerVersionForCommandV2(command(initial))).toBeNull();
    expect(
      runtimeBalanceControllerVersionForCommandV2(
        command(initial, {
          financialKernelVersion: "2.0.0",
          eventSchedulerVersion: DECLARATIVE_EVENT_SCHEDULER_V2_VERSION,
          runtimeBalanceControllerVersion: RUNTIME_BALANCE_CONTROLLER_V1_VERSION,
        }),
      ),
    ).toBe(RUNTIME_BALANCE_CONTROLLER_V1_VERSION);
    expect(() =>
      processMonthlyTurnV2(
        initial,
        command(initial, {
          financialKernelVersion: "2.0.0",
          eventSchedulerVersion: CAUSAL_EVENT_SCHEDULER_V1_VERSION,
          runtimeBalanceControllerVersion: RUNTIME_BALANCE_CONTROLLER_V1_VERSION,
        }),
      ),
    ).toThrow(
      expect.objectContaining({ code: "UNSUPPORTED_RUNTIME_BALANCE_CONTROLLER_VERSION" }),
    );
    expect(() =>
      runtimeBalanceControllerVersionForCommandV2(
        command(initial, {
          runtimeBalanceControllerVersion: "invented-controller",
        } as never),
      ),
    ).toThrow(
      expect.objectContaining({ code: "UNSUPPORTED_RUNTIME_BALANCE_CONTROLLER_VERSION" }),
    );
    const persisted = decodePersistedGameCommandV2(
      JSON.parse(JSON.stringify(command(initial, {
        financialKernelVersion: "2.0.0",
        eventSchedulerVersion: DECLARATIVE_EVENT_SCHEDULER_V2_VERSION,
        runtimeBalanceControllerVersion: RUNTIME_BALANCE_CONTROLLER_V1_VERSION,
      }))) as unknown,
    );
    expect(persisted.type === "process_month_v2" &&
      persisted.payload.runtimeBalanceControllerVersion).toBe(
      RUNTIME_BALANCE_CONTROLLER_V1_VERSION,
    );
    expect(() => decodePersistedGameCommandV2({
      ...persisted,
      payload: {
        ...persisted.payload,
        eventSchedulerVersion: CAUSAL_EVENT_SCHEDULER_V1_VERSION,
      },
    })).toThrow();
  });

  it("requires an explicit compatible Scenario Director selection", () => {
    const initial = configuredState();
    expect(scenarioDirectorVersionForCommandV2(command(initial))).toBeNull();
    const selected = command(initial, {
      financialKernelVersion: "2.0.0",
      eventSchedulerVersion: DECLARATIVE_EVENT_SCHEDULER_V2_VERSION,
      runtimeBalanceControllerVersion: RUNTIME_BALANCE_CONTROLLER_V1_VERSION,
      scenarioDirectorVersion: SCENARIO_DIRECTOR_V2_VERSION,
    });
    expect(scenarioDirectorVersionForCommandV2(selected)).toBe(
      SCENARIO_DIRECTOR_V2_VERSION,
    );
    expect(() =>
      processMonthlyTurnV2(
        initial,
        command(initial, {
          financialKernelVersion: "2.0.0",
          eventSchedulerVersion: DECLARATIVE_EVENT_SCHEDULER_V2_VERSION,
          scenarioDirectorVersion: SCENARIO_DIRECTOR_V2_VERSION,
        }),
      ),
    ).toThrow(
      expect.objectContaining({ code: "UNSUPPORTED_SCENARIO_DIRECTOR_VERSION" }),
    );
    expect(() =>
      scenarioDirectorVersionForCommandV2(
        command(initial, {
          scenarioDirectorVersion: "invented-director",
        } as never),
      ),
    ).toThrow(
      expect.objectContaining({ code: "UNSUPPORTED_SCENARIO_DIRECTOR_VERSION" }),
    );

    const persisted = decodePersistedGameCommandV2(
      JSON.parse(JSON.stringify(selected)) as unknown,
    );
    expect(
      persisted.type === "process_month_v2" &&
        persisted.payload.scenarioDirectorVersion,
    ).toBe(SCENARIO_DIRECTOR_V2_VERSION);
    expect(() =>
      decodePersistedGameCommandV2({
        ...persisted,
        payload: {
          ...persisted.payload,
          runtimeBalanceControllerVersion: undefined,
        },
      }),
    ).toThrow();
  });

  it("persists deterministic Director ranking before Runtime Balance approval", () => {
    const base = configuredState();
    const opening: GameStateV2 = {
      ...base,
      random: randomState("runtime-balance-monthly.13"),
    };
    const selected = command(
      opening as ReturnType<typeof configuredState>,
      {
        financialKernelVersion: "2.0.0",
        eventSchedulerVersion: DECLARATIVE_EVENT_SCHEDULER_V2_VERSION,
        runtimeBalanceControllerVersion: RUNTIME_BALANCE_CONTROLLER_V1_VERSION,
        scenarioDirectorVersion: SCENARIO_DIRECTOR_V2_VERSION,
      },
      "cmd.scenario-director.golden",
    );

    const first = processMonthlyTurnV2(opening, selected);
    const second = processMonthlyTurnV2(opening, selected);

    expect(second).toEqual(first);
    expect(first.record.scenarioDirectorVersion).toBe(
      SCENARIO_DIRECTOR_V2_VERSION,
    );
    expect(first.record.scenarioDirectorDecision).toMatchObject({
      version: SCENARIO_DIRECTOR_V2_VERSION,
      rankingSource: "deterministic_fallback",
      riskAsOfMonth: first.state.currentMonth,
    });
    expect(
      first.record.scenarioDirectorDecision?.ranked
        .map(({ templateId }) => templateId)
        .toSorted(),
    ).toEqual(
      first.record.runtimeBalanceCandidateSet?.candidateTemplateIds.toSorted(),
    );
    expect(
      first.record.runtimeBalanceDecision?.candidates.map(
        ({ templateId }) => templateId,
      ),
    ).toEqual(
      first.record.scenarioDirectorDecision?.ranked
        .slice(0, 5)
        .map(({ templateId }) => templateId),
    );
    expect(first.record.runtimeBalanceDecision?.scenarioDirector).toEqual({
      version: SCENARIO_DIRECTOR_V2_VERSION,
      policyVersion:
        first.record.scenarioDirectorDecision?.policyVersion,
      rankingSource: "deterministic_fallback",
      candidateSetChecksum:
        first.record.scenarioDirectorDecision?.candidateSetChecksum,
      rankingInputChecksum:
        first.record.scenarioDirectorDecision?.rankingInputChecksum,
    });
    const replayed = reduceGameCommandV2(opening, selected);
    expect(replayed.state).toEqual(first.state);
    expect(replayed.monthlyRecord).toEqual(first.record);
    expect({
      stateChecksum: sha256Canonical(first.state),
      randomValue: first.state.random.value,
      candidateSetChecksum:
        first.record.scenarioDirectorDecision?.candidateSetChecksum,
      rankingInputChecksum:
        first.record.scenarioDirectorDecision?.rankingInputChecksum,
      topCandidate:
        first.record.scenarioDirectorDecision?.ranked[0]?.templateId ?? null,
      approvedCandidate:
        first.record.runtimeBalanceDecision?.approved?.templateId ?? null,
    }).toEqual({
      stateChecksum: "8cbe67a510e1da8a8aa62e9b69e5fe2c9d1a8846408dff3f18adea6ff86955bd",
      randomValue: 2_579_994_238,
      candidateSetChecksum:
        "3af4ea6d7042ad8fc85fcb56a0f78315a7745a41a43e464db8c87c1c08eafc8d",
      rankingInputChecksum:
        "ba4440f908a637cb4cfd3548b0547561bb05f64455e385fc156555beafdec8f8",
      topCandidate: "personal.performance_bonus",
      approvedCandidate: "personal.performance_bonus",
    });
  });

  it("integrates hazard candidates through Runtime Balance and persists approval/null evidence", () => {
    const base = configuredState();
    const opening: GameStateV2 = {
      ...base,
      random: randomState("runtime-balance-monthly.13"),
    };
    const observed = processMonthlyTurnV2(
      opening,
      command(
        opening as ReturnType<typeof configuredState>,
        {
          financialKernelVersion: "2.0.0",
          eventSchedulerVersion: DECLARATIVE_EVENT_SCHEDULER_V2_VERSION,
          runtimeBalanceControllerVersion: RUNTIME_BALANCE_CONTROLLER_V1_VERSION,
        },
        "cmd.runtime-balance.golden",
      ),
    );

    expect(observed.record.runtimeBalanceDecision).toMatchObject({
      controllerVersion: RUNTIME_BALANCE_CONTROLLER_V1_VERSION,
      status: "approved",
    });
    expect(observed.state.gameplay.runtimeBalance?.version).toBe(2);
    expect(observed.state.gameplay.eventLifecycle.pending).not.toBeNull();
    expect(observed.record.runtimeBalanceDecision?.approved).toMatchObject({
      eventId: observed.record.scheduledEvent?.eventId,
    });
    expect(observed.record.runtimeBalanceControllerVersion).toBe(
      RUNTIME_BALANCE_CONTROLLER_V1_VERSION,
    );
    expect(observed.record.runtimeBalanceCandidateSet).toEqual({
      eligibleTemplateIds: expect.any(Array),
      candidateTemplateIds: expect.arrayContaining([
        observed.record.scheduledEvent!.templateId,
      ]),
    });
    const storedState = JSON.parse(JSON.stringify(observed.state)) as unknown;
    const decodedState = decodePersistedGameState(storedState);
    expect(decodedState.schemaVersion).toBe(2);
    expect(sha256Canonical(decodedState)).toBe(sha256Canonical(observed.state));
    const reduced = reduceGameCommandV2(
      opening,
      command(
        opening as ReturnType<typeof configuredState>,
        {
          financialKernelVersion: "2.0.0",
          eventSchedulerVersion: DECLARATIVE_EVENT_SCHEDULER_V2_VERSION,
          runtimeBalanceControllerVersion: RUNTIME_BALANCE_CONTROLLER_V1_VERSION,
        },
        "cmd.runtime-balance.golden",
      ),
    );
    expect(reduced.monthlyRecord?.runtimeBalanceDecision).toEqual(
      observed.record.runtimeBalanceDecision,
    );
    expect(sha256Canonical(reduced.state)).toBe(
      sha256Canonical(observed.state),
    );
    expect({
      checksum: sha256Canonical(observed.state),
      randomValue: observed.state.random.value,
      approvedEventId:
        observed.record.runtimeBalanceDecision?.approved?.eventId,
    }).toEqual({
      checksum: "e3ab92c6783cd9ab1702a40fca80f15b805298f177ae096c7ce86b2258d25c69",
      randomValue: 2_579_994_238,
      approvedEventId: "evt.2026-08.personal.performance_bonus.v2",
    });
  });

  it("updates negative-cash-flow balance evidence from the completed financial month", () => {
    const opening = configuredState();
    const selected = command(opening, {
      financialKernelVersion: "2.0.0",
      eventSchedulerVersion: DECLARATIVE_EVENT_SCHEDULER_V2_VERSION,
      runtimeBalanceControllerVersion: RUNTIME_BALANCE_CONTROLLER_V1_VERSION,
      resolvedCashFlows: [{
        id: "runtime-balance-negative-cash-flow",
        kind: "temporary_expense",
        amountCents: moneyCents(1_000_000),
        sourceSystem: "runtime_balance_test",
      }],
    }, "cmd.runtime-balance.negative-cash-flow");
    const result = processMonthlyTurnV2(opening, selected);

    expect(result.state.gameplay.runtimeBalance).toMatchObject({
      version: 2,
      recentNegativeCashFlowMonths: 1,
    });
  });

  it("upgrades v1 timing at the opening month and advances it exactly once", () => {
    const base = configuredState();
    const opening = {
      ...base,
      gameplay: {
        ...base.gameplay,
        runtimeBalance: {
          version: 1 as const,
          pressurePpm: ratePpm(500_000),
          recoveryUntilMonth: simulationMonth("2026-09"),
          catastropheCount: 1,
          lastApprovedEventMonth: base.currentMonth,
        },
      },
    } as ReturnType<typeof configuredState>;
    const result = processMonthlyTurnV2(
      opening,
      command(opening, {
        financialKernelVersion: "2.0.0",
        eventSchedulerVersion: DECLARATIVE_EVENT_SCHEDULER_V2_VERSION,
        runtimeBalanceControllerVersion: RUNTIME_BALANCE_CONTROLLER_V1_VERSION,
      }, "cmd.runtime-balance.v1-upgrade"),
      { personalEventCatalog: [] },
    );

    expect(result.state.gameplay.runtimeBalance).toMatchObject({
      version: 2,
      pressureUnits: 6,
      monthsSinceAnyEvent: 1,
      recovery: {
        sourceEventId: "legacy.runtime-balance-v1",
        remainingMonths: 1,
      },
      catastropheCount: 1,
      legacyCarryover: {
        lastApprovedEventMonth: base.currentMonth,
        catastropheCount: 1,
      },
    });
  });

  it("rejects a direct declarative downgrade after Runtime Balance v2 exists", () => {
    const initial = configuredState();
    const upgraded: GameStateV2 = {
      ...initial,
      gameplay: {
        ...initial.gameplay,
        runtimeBalance: createInitialRuntimeBalanceStateV2("normal"),
      },
    };

    expect(() =>
      processMonthlyTurnV2(
        upgraded,
        command(upgraded as ReturnType<typeof configuredState>, {
          financialKernelVersion: "2.0.0",
          eventSchedulerVersion: DECLARATIVE_EVENT_SCHEDULER_V2_VERSION,
        }),
      ),
    ).toThrow(
      expect.objectContaining({ code: "UNSUPPORTED_RUNTIME_BALANCE_CONTROLLER_VERSION" }),
    );
    expect(() =>
      processMonthlyTurnV2(
        upgraded,
        command(upgraded as ReturnType<typeof configuredState>, {
          financialKernelVersion: "2.0.0",
          eventSchedulerVersion: CAUSAL_EVENT_SCHEDULER_V1_VERSION,
        }),
      ),
    ).toThrow(
      expect.objectContaining({ code: "UNSUPPORTED_RUNTIME_BALANCE_CONTROLLER_VERSION" }),
    );
  });

  it("rejects Runtime Balance recovery evidence absent from the event lifecycle", () => {
    const initial = configuredState();
    const balance = createInitialRuntimeBalanceStateV2("normal");
    const impossible = {
      ...initial,
      gameplay: {
        ...initial.gameplay,
        runtimeBalance: {
          ...balance,
          recovery: {
            sourceEventId: "evt.missing.large",
            sourceTier: "catastrophe" as const,
            targetedWeakness: "unrelated_hazard" as const,
            remainingMonths: 3,
          },
          recentEvents: [{
            eventId: "evt.missing.large",
            templateId: "personal.missing_large",
            templateVersion: 1,
            category: "health" as const,
            lessonTags: ["lesson.emergency_fund"],
            tier: "catastrophe" as const,
            targetedWeakness: "unrelated_hazard" as const,
            approvedMonth: initial.currentMonth,
          }],
        },
      },
    } as GameStateV2;

    expect(validateGameStateV2(impossible)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "gameplay.runtimeBalance.recentEvents.0",
          code: "runtime_balance_lifecycle_mismatch",
        }),
        expect.objectContaining({
          path: "gameplay.runtimeBalance.recovery",
          code: "runtime_balance_recovery_source_mismatch",
        }),
        expect.objectContaining({
          path: "gameplay.runtimeBalance.monthsSinceCatastrophicEvent",
          code: "runtime_balance_timer_mismatch",
        }),
        expect.objectContaining({
          path: "gameplay.runtimeBalance.catastropheCount",
          code: "runtime_balance_catastrophe_count_mismatch",
        }),
      ]),
    );
  });

  it("rejects explicit macro and Runtime Balance difficulty drift", () => {
    const initial = configuredState();
    const guided: GameStateV2 = {
      ...initial,
      gameplay: {
        ...initial.gameplay,
        runtimeBalance: createInitialRuntimeBalanceStateV2("guided"),
      },
    };

    expect(() =>
      processMonthlyTurnV2(
        guided,
        command(guided as ReturnType<typeof configuredState>, {
          financialKernelVersion: "2.0.0",
          eventSchedulerVersion: DECLARATIVE_EVENT_SCHEDULER_V2_VERSION,
          runtimeBalanceControllerVersion: RUNTIME_BALANCE_CONTROLLER_V1_VERSION,
          marketModelVersion: MACRO_MARKET_MODEL_V2_VERSION,
          macroDifficulty: "hard",
        }),
      ),
    ).toThrow(
      expect.objectContaining({ code: "UNSUPPORTED_RUNTIME_BALANCE_CONTROLLER_VERSION" }),
    );
  });

  it("defaults historical commands to regime-v1 and requires explicit v2 difficulty", () => {
    const initial = configuredState();
    expect(marketModelVersionForCommandV2(command(initial))).toEqual({
      modelVersion: "regime-v1",
      difficulty: null,
    });
    expect(
      marketModelVersionForCommandV2(
        command(initial, {
          financialKernelVersion: "2.0.0",
          marketModelVersion: MACRO_MARKET_MODEL_V2_VERSION,
          macroDifficulty: "normal",
        }),
      ),
    ).toEqual({ modelVersion: "regime-v2", difficulty: "normal" });
    expect(() =>
      processMonthlyTurnV2(
        initial,
        command(initial, {
          financialKernelVersion: "2.0.0",
          marketModelVersion: MACRO_MARKET_MODEL_V2_VERSION,
        } as never),
      ),
    ).toThrow(expect.objectContaining({ code: "UNSUPPORTED_MARKET_MODEL_VERSION" }));
    expect(() =>
      processMonthlyTurnV2(
        initial,
        command(initial, {
          financialKernelVersion: "legacy-4.1.0",
          marketModelVersion: MACRO_MARKET_MODEL_V2_VERSION,
          macroDifficulty: "normal",
        }),
      ),
    ).toThrow(expect.objectContaining({ code: "UNSUPPORTED_MARKET_MODEL_VERSION" }));
  });

  it("uses player target age only for historical commands, never policy 1.0.0", () => {
    const initial = configuredState();
    const ageForty = finalizeGameStateV2({
      ...initial,
      player: { ...initial.player, birthMonth: simulationMonth("1986-01") },
      gameplay: {
        ...initial.gameplay,
        financialGoal: {
          version: "financial-goal-v1",
          desiredAnnualSpendingCents: moneyCents(100_000_000),
          safeWithdrawalRatePpm: ratePpm(40_000),
          targetAgeYears: 40,
          source: "player_selected",
        },
      },
    });
    const historical = processMonthlyTurnV2(
      ageForty,
      command(ageForty, { financialKernelVersion: "2.0.0" }, "cmd.month.old"),
      NO_FOLLOW_UP_EVENTS,
    );
    const current = processMonthlyTurnV2(
      ageForty,
      command(
        ageForty,
        {
          financialKernelVersion: "2.0.0",
          outcomePolicyVersion: OUTCOME_POLICY_V1_VERSION,
        },
        "cmd.month.current",
      ),
      NO_FOLLOW_UP_EVENTS,
    );

    expect(historical.state.outcome).toMatchObject({
      kind: "retirement_age",
      reasonCode: "reached_player_target_age",
    });
    expect(historical.record).not.toHaveProperty("outcomePolicyVersion");
    expect(current.state.outcome).toBeNull();
    expect(current.record.outcomePolicyVersion).toBe("1.0.0");
  });

  it("composes market, payroll, obligations, debt, strategy, and outcome once", () => {
    const initial = configuredState();
    const result = processMonthlyTurnV2(
      initial,
      command(initial, { financialKernelVersion: "2.0.0" }),
    );

    expect(result.state.currentMonth).toBe("2026-08");
    expect(result.state.revision).toBe(2);
    expect(result.state.acceptedCommandIds).toEqual([
      "cmd.strategy.initial",
      "cmd.month.2026-07",
    ]);
    expect(result.record).toMatchObject({
      financialKernelVersion: "2.0.0",
      processedMonth: "2026-07",
      nextMonth: "2026-08",
      taxTraceId: "tax.cmd.month.2026-07",
      resolvedIncomeCents: 0,
      resolvedExpenseCents: 0,
      insurancePlayerCostCents: 0,
      shortfall: null,
      outcome: null,
    });
    expect(result.record.openingNetWorthCents).toBeTypeOf("number");
    expect(result.record.closingNetWorthCents).toBeTypeOf("number");
    expect(result.record.openingAutomaticLiquidityCents).toBeTypeOf("number");
    expect(result.record.closingAutomaticLiquidityCents).toBeTypeOf("number");
    expect(result.record.monthlyObligationInflationIncreaseCents).toBeTypeOf(
      "number",
    );
    expect(result.record.cumulativePriceIndexPpm).toBeTypeOf("number");
    expect(result.record.baseNonDebtObligationsCents).toBeTypeOf("number");
    expect(result.record.fundingPlan?.fullyFunded).toBe(true);
    expect(result.record.debtService.lines[0]).toMatchObject({
      interestCents: 1_200,
      scheduledPaymentCents: 11_000,
      closingPrincipalCents: 110_200,
    });
    expect(result.record.recurringAllocations?.preTax).toEqual({
      employee401kCents: 50_000,
      employer401kMatchCents: 40_000,
      hsaCents: 20_000,
    });
    expect(result.state.gameplay.contributions).toMatchObject({
      employee401kCents: 50_000,
      employer401kCents: 40_000,
      hsaCents: 20_000,
    });
    expect(
      result.state.ledger.transactions.map(({ reasonCode }) => reasonCode),
    ).toEqual(
      expect.arrayContaining([
        "monthly_market_revaluation_v2",
        "monthly_payroll_v2",
        "monthly_non_debt_obligations_v2",
        "monthly_term_debt_interest",
        "monthly_term_debt_payment",
        "monthly_after_tax_strategy_v2",
      ]),
    );
    expect(result.state.gameplay.market.monthsInRegime).toBeGreaterThanOrEqual(0);
    expect(result.state.gameplay.exposure).toMatchObject({
      current: { month: "2026-08" },
      history: [{ month: "2026-08" }],
    });
    expect(validateGameStateV2(result.state)).toEqual([]);
    expect(initial.currentMonth).toBe("2026-07");
  });

  it("samples one complete deterministic market step for the 2.0.0 kernel", () => {
    const leftInitial = configuredState();
    const rightInitial = configuredState();
    const expected = expectedMarketStep(leftInitial);
    const left = processMonthlyTurnV2(
      leftInitial,
      command(leftInitial, { financialKernelVersion: "2.0.0" }),
      NO_FOLLOW_UP_EVENTS,
    );
    const right = processMonthlyTurnV2(
      rightInitial,
      command(rightInitial, { financialKernelVersion: "2.0.0" }),
      NO_FOLLOW_UP_EVENTS,
    );

    expect(left.record.market).toEqual(expected.month);
    expect(left.record.market).toEqual(right.record.market);
    expect(left.state.marketRegime).toBe(expected.nextState.regime);
    expect(left.state.gameplay.market.monthsInRegime).toBe(
      expected.nextState.monthsInRegime,
    );
    expect(left.state.random).toEqual({
      algorithm: "mulberry32-v1",
      value: 2_209_615_456,
    });
    expect(sha256Canonical(left.state)).toBe(
      "de37add20665a53f9de5f2f8080b22195a5a2a148d77c18e812603c9fd552200",
    );
    expect(sha256Canonical(left.record)).toBe(
      "3f8499e6d045b3eba3c514b841471c91e0136317df1214c9c5381f73b81ecca6",
    );
    expect(sha256Canonical(left.record)).toBe(sha256Canonical(right.record));
  });

  it("rejects invalid 2.0.0 tax evidence atomically", () => {
    const initial = configuredState();
    const valid = command(initial, { financialKernelVersion: "2.0.0" });
    const invalid = command(initial, {
      financialKernelVersion: "2.0.0",
      taxEvidence: {
        ...valid.payload.taxEvidence,
        afterTaxCashIncomeCents: moneyCents(1),
      },
    });
    const openingChecksum = sha256Canonical(initial);

    expect(() => processMonthlyTurnV2(initial, invalid)).toThrow(
      expect.objectContaining({
        code: "TRANSITION_INVARIANT",
        cause: expect.objectContaining({ code: "INVALID_TAX_EVIDENCE" }),
      }),
    );
    expect(sha256Canonical(initial)).toBe(openingChecksum);
    expect(initial).toMatchObject({
      currentMonth: "2026-07",
      revision: 1,
      acceptedCommandIds: ["cmd.strategy.initial"],
    });
  });

  it("does not freeze authoritative metadata owned by a mutable dispatcher input", () => {
    const mutable = structuredClone(configuredState());
    const openingChecksum = sha256Canonical(mutable);
    const acceptedCommandIds = mutable.acceptedCommandIds;

    processMonthlyTurnV2(
      mutable,
      command(mutable, { financialKernelVersion: "2.0.0" }),
      NO_FOLLOW_UP_EVENTS,
    );

    expect(Object.isFrozen(mutable)).toBe(false);
    expect(Object.isFrozen(acceptedCommandIds)).toBe(false);
    expect(sha256Canonical(mutable)).toBe(openingChecksum);
  });

  it("passes every resolved cash-flow kind through the command once with provenance", () => {
    const initial = configuredState();
    const resolvedCashFlows = Object.freeze([
      {
        id: "flow.other-income",
        kind: "other_income",
        amountCents: moneyCents(10_000),
        sourceSystem: "fixture.other",
      },
      {
        id: "flow.recurring-expense",
        kind: "recurring_expense",
        amountCents: moneyCents(2_000),
        sourceSystem: "fixture.recurring",
      },
      {
        id: "flow.temporary-income",
        kind: "temporary_income",
        amountCents: moneyCents(20_000),
        sourceSystem: "fixture.temporary",
      },
      {
        id: "flow.temporary-expense",
        kind: "temporary_expense",
        amountCents: moneyCents(3_000),
        sourceSystem: "fixture.temporary",
      },
    ] satisfies readonly ResolvedCashFlowV2[]);
    const result = processMonthlyTurnV2(
      initial,
      command(initial, {
        financialKernelVersion: "2.0.0",
        resolvedCashFlows,
      }),
      NO_FOLLOW_UP_EVENTS,
    );

    expect(result.record).toMatchObject({
      resolvedIncomeCents: 30_000,
      resolvedExpenseCents: 5_000,
    });
    const flowTransactions = result.state.ledger.transactions.filter(
      ({ causalReference }) =>
        causalReference?.kind === "system" &&
        resolvedCashFlows.some(({ id }) => id === causalReference?.id),
    );
    expect(flowTransactions).toHaveLength(4);
    for (const flow of resolvedCashFlows) {
      expect(
        flowTransactions.filter(
          ({ causalReference }) => causalReference?.id === flow.id,
        ),
      ).toHaveLength(1);
      expect(
        flowTransactions.find(
          ({ causalReference }) => causalReference?.id === flow.id,
        ),
      ).toMatchObject({
        commandId: "cmd.month.2026-07",
        sourceSystem: flow.sourceSystem,
        causalReference: { kind: "system", id: flow.id },
      });
    }
  });

  it("turns an exact one-cent kernel shortfall into bankruptcy without partial payment", () => {
    const initial = configuredState();
    const marketStep = expectedMarketStep(initial);
    const exactClaimCents = exactLiquidityClaim(initial, 1);
    const result = processMonthlyTurnV2(
      initial,
      command(initial, {
        financialKernelVersion: "2.0.0",
        insuranceClaim: {
          type: "health",
          grossAmountCents: exactClaimCents,
          covered: false,
        },
      }),
      NO_FOLLOW_UP_EVENTS,
    );

    expect(result.record.shortfall).toMatchObject({
      residualShortfallCents: 1,
    });
    expect(result.state.outcome).toMatchObject({
      kind: "bankruptcy",
      grade: "F",
    });
    expect(result.record).toMatchObject({
      funding: null,
      nonDebtObligationsPaidCents: 0,
      recurringAllocations: null,
      scheduledEvent: null,
    });
    expect(result.state.revision).toBe(initial.revision + 1);
    expect(result.state.acceptedCommandIds).toEqual([
      ...initial.acceptedCommandIds,
      "cmd.month.2026-07",
    ]);
    expect(result.state.random).toEqual(marketStep.nextState.random);
    expect(
      result.state.ledger.transactions.some(({ reasonCode }) =>
        [
          "execute_v2_obligation_funding",
          "monthly_resolved_expense_v2",
          "monthly_non_debt_obligations_v2",
          "monthly_term_debt_interest",
          "monthly_term_debt_payment",
          "monthly_after_tax_strategy_v2",
        ].includes(reasonCode),
      ),
    ).toBe(false);
  });

  it("persists rich policy 1.0.0 evidence from the actual kernel shortfall", () => {
    const initial = configuredState({
      retirement401kCents: moneyCents(100_000_000),
    });
    const exactClaimCents = exactLiquidityClaim(initial, 1);
    const result = processMonthlyTurnV2(
      initial,
      command(initial, {
        financialKernelVersion: "2.0.0",
        outcomePolicyVersion: OUTCOME_POLICY_V1_VERSION,
        insuranceClaim: {
          type: "health",
          grossAmountCents: exactClaimCents,
          covered: false,
        },
      }),
      NO_FOLLOW_UP_EVENTS,
    );

    expect(result.record.outcomePolicyVersion).toBe("1.0.0");
    expect(result.state.outcome).toMatchObject({
      outcomePolicyVersion: "1.0.0",
      kind: "bankruptcy",
      grade: "F",
      displayedNetWorthCents: result.record.closingNetWorthCents,
      automaticLiquidSolvency: {
        residualShortfallCents: 1,
        isSolvent: false,
      },
      reasonCodes: [
        "actual_required_obligation_shortfall",
        "automatic_liquidity_exhausted",
      ],
    });
  });

  it("declares bankruptcy when high positive net worth is restricted", () => {
    const initial = configuredState({
      cashCents: moneyCents(100_000),
      taxableBroadIndexCents: moneyCents(0),
      taxableSectorCents: moneyCents(0),
      taxableSpeculativeCents: moneyCents(0),
      retirement401kCents: moneyCents(100_000_000),
      retirementIraCents: moneyCents(0),
      hsaCents: moneyCents(0),
      revolvingCreditLimitCents: moneyCents(0),
      revolvingCreditUsedCents: moneyCents(0),
    });
    const result = processMonthlyTurnV2(
      initial,
      command(initial, {
        financialKernelVersion: "2.0.0",
        insuranceClaim: {
          type: "health",
          grossAmountCents: moneyCents(100_000_000),
          covered: false,
        },
      }),
      NO_FOLLOW_UP_EVENTS,
    );

    expect(result.record.closingNetWorthCents).toBeGreaterThan(0);
    expect(result.record.shortfall).not.toBeNull();
    expect(result.state.outcome).toMatchObject({ kind: "bankruptcy" });
  });

  it("does not predict bankruptcy after an exactly funded current month", () => {
    const initial = configuredState();
    const exactClaimCents = exactLiquidityClaim(initial, 0);
    const result = processMonthlyTurnV2(
      initial,
      command(initial, {
        financialKernelVersion: "2.0.0",
        insuranceClaim: {
          type: "health",
          grossAmountCents: exactClaimCents,
          covered: false,
        },
      }),
      NO_FOLLOW_UP_EVENTS,
    );

    expect(result.record.shortfall).toBeNull();
    expect(result.record.fundingPlan?.residualShortfallCents).toBe(0);
    expect(result.record.closingAutomaticLiquidityCents).toBe(0);
    expect(result.state.outcome).toBeNull();
  });

  it("keeps career, outcome, exposure, macro, and event orchestration outside the kernel", () => {
    const initial = configuredState();
    const monthCommand = command(initial, {
      financialKernelVersion: "2.0.0",
    });
    const direct = directFinancialMonth(initial, monthCommand);
    const wrapped = processMonthlyTurnV2(initial, monthCommand, {
      eventSchedulingPolicy: {
        version: "fairness-v1",
        minimumChancePpm: 1_000_000,
        maximumChancePpm: 1_000_000,
      },
      macroStoryPolicy: {
        version: "macro-story-v1",
        monthlyChancePpm: 1_000_000,
        minimumDurationMonths: 2,
        maximumDurationMonths: 2,
      },
    });

    expect(direct.state).toMatchObject({
      closingStateKind: "financial_closing_v2",
    });
    expect(direct.state).not.toHaveProperty("revision");
    expect(direct.state).not.toHaveProperty("acceptedCommandIds");
    expect(direct.state).not.toHaveProperty("outcome");
    expect(direct.state.gameplay.careerDevelopment).toEqual(
      initial.gameplay.careerDevelopment,
    );
    expect(direct.state.gameplay.exposure).toEqual(initial.gameplay.exposure);
    expect(direct.state.gameplay.eventLifecycle).toEqual(
      initial.gameplay.eventLifecycle,
    );

    expect(wrapped.state.gameplay.careerDevelopment.pending).toEqual([]);
    expect(wrapped.state.gameplay.careerDevelopment).toEqual(
      initial.gameplay.careerDevelopment,
    );
    expect(wrapped.state.gameplay.exposure.current).toMatchObject({
      month: "2026-08",
    });
    expect(wrapped.state.gameplay.eventLifecycle.macroStories).toHaveLength(1);
    expect(wrapped.state.gameplay.eventLifecycle.pending).not.toBeNull();
  });

  it("is checksum deterministic and rejects an identical command after acceptance", () => {
    const leftInitial = configuredState();
    const rightInitial = configuredState();
    const left = processMonthlyTurnV2(leftInitial, command(leftInitial));
    const right = processMonthlyTurnV2(rightInitial, command(rightInitial));

    expect(sha256Canonical(left.state)).toBe(sha256Canonical(right.state));
    expect(() => processMonthlyTurnV2(left.state, command(leftInitial))).toThrow(
      expect.objectContaining({ code: "DUPLICATE_COMMAND" }),
    );
  });

  it("builds reconciled checkpoint evidence from exact monthly records", () => {
    const initial = configuredState();
    const result = processMonthlyTurnV2(
      initial,
      command(initial, {
        financialKernelVersion: "2.0.0",
        eventSchedulerVersion: CAUSAL_EVENT_SCHEDULER_V1_VERSION,
      }),
      NO_FOLLOW_UP_EVENTS,
    );
    const checkpoint = buildCheckpointEvidenceV2(initial, result.state, [result.record]);

    expect(checkpoint).toMatchObject({
      evidenceVersion: "checkpoint-v2.1",
      monthsProcessed: 1,
      monthlyCommandIds: ["cmd.month.2026-07"],
      taxTraceIds: ["tax.cmd.month.2026-07"],
      totalGrossIncomeCents: 1_000_000,
      totalTaxCents: 200_000,
      totalAfterTaxCashIncomeCents: 730_000,
    });
    expect(checkpoint.totalRequiredCashCents).toBe(result.record.requiredCashCents);
    expect(checkpoint.totalDebtInterestCents).toBe(
      result.record.debtService.totalInterestCents,
    );
    expect(checkpoint.end.exposure).toBeNull();
    expect(checkpoint.end.financialIndependenceTargetCents).toBe(
      projectFinancialGoal(
        result.state.finances,
        result.state.gameplay.financialGoal,
      ).targetCents,
    );
    expect(checkpoint.end.investableAssetsCents).toBe(
      projectFinancialGoal(
        result.state.finances,
        result.state.gameplay.financialGoal,
      ).investableAssetsCents,
    );
    expect(checkpoint.end.netWorthCents).toBe(
      calculateNetWorth(result.state.finances),
    );
    expect(checkpoint.totalLiquidationCostCents).toBe(
      result.record.funding?.liquidationCostCents ?? 0,
    );
    expect(() =>
      buildCheckpointEvidenceV2(initial, result.state, [
        { ...result.record, processedMonth: simulationMonth("2026-06") },
      ]),
    ).toThrow(expect.objectContaining({ code: "RECORD_GAP" }));
  });

  it("exposes due career evidence only as a transitional financial close", () => {
    let current = configuredState();
    current = reduceDetailedFinanceCommand(current, {
      schemaVersion: 2,
      id: "cmd.upskill.monthly",
      type: "take_detailed_action",
      expectedRevision: current.revision,
      effectiveMonth: current.currentMonth,
      payload: {
        action: { type: "start_upskill", programId: "upskill.certificate" },
      },
    });
    const noEvents = {
      eventSchedulingPolicy: {
        version: "fairness-v1" as const,
        minimumChancePpm: 0,
        maximumChancePpm: 0,
      },
    };
    for (let index = 0; index < 2; index += 1) {
      current = processMonthlyTurnV2(
        current,
        command(
          current,
          { financialKernelVersion: "2.0.0" },
          `cmd.upskill.month.${current.currentMonth}`,
        ),
        noEvents,
      ).state;
    }

    const closingCommand = command(
      current,
      { financialKernelVersion: "2.0.0" },
      `cmd.upskill.month.${current.currentMonth}`,
    );
    const direct = directFinancialMonth(current, closingCommand);

    expectTypeOf(direct.state).not.toMatchTypeOf<GameStateV2>();
    expect(direct.state).toMatchObject({
      closingStateKind: "financial_closing_v2",
      currentMonth: "2026-10",
    });
    expect(direct.state).not.toHaveProperty("revision");
    expect(direct.state).not.toHaveProperty("acceptedCommandIds");
    expect(direct.state).not.toHaveProperty("outcome");
    expect(direct.state.gameplay.careerDevelopment.pending).toHaveLength(1);

    current = processMonthlyTurnV2(
      current,
      closingCommand,
      noEvents,
    ).state;

    expect(current.currentMonth).toBe("2026-10");
    expect(current.gameplay.careerDevelopment.pending).toEqual([]);
    expect(current.gameplay.careerDevelopment.history).toHaveLength(1);
    expect(current.gameplay.employment).toMatchObject({
      annualGrossSalaryCents: 12_300_000,
    });
    expect(validateGameStateV2(current)).toEqual([]);
  });

  it("exposes an expiring macro story only as a transitional financial close", () => {
    const initial = configuredState();
    const first = processMonthlyTurnV2(
      initial,
      command(initial, { financialKernelVersion: "2.0.0" }),
      {
        eventSchedulingPolicy: NO_FOLLOW_UP_EVENTS.eventSchedulingPolicy,
        macroStoryPolicy: {
          version: "macro-story-v1",
          monthlyChancePpm: 1_000_000,
          minimumDurationMonths: 1,
          maximumDurationMonths: 1,
        },
      },
    );
    const nextCommand = command(first.state, {
      financialKernelVersion: "2.0.0",
    });
    const direct = directFinancialMonth(first.state, nextCommand);

    expectTypeOf(direct.state).not.toMatchTypeOf<GameStateV2>();
    expect(direct.state).toMatchObject({
      closingStateKind: "financial_closing_v2",
      currentMonth: "2026-09",
    });
    expect(direct.state).not.toHaveProperty("revision");
    expect(direct.state).not.toHaveProperty("acceptedCommandIds");
    expect(direct.state).not.toHaveProperty("outcome");
    expect(direct.state.gameplay.eventLifecycle.macroStories).toHaveLength(1);

    const wrapped = processMonthlyTurnV2(
      first.state,
      nextCommand,
      NO_FOLLOW_UP_EVENTS,
    );
    expect(wrapped.state.gameplay.eventLifecycle.macroStories).toEqual([]);
    expect(validateGameStateV2(wrapped.state)).toEqual([]);
  });

  it("applies a persisted macro story on the following monthly market draw", () => {
    const initial = configuredState();
    const first = processMonthlyTurnV2(initial, command(initial), {
      eventSchedulingPolicy: {
        version: "fairness-v1",
        minimumChancePpm: 0,
        maximumChancePpm: 0,
      },
      macroStoryPolicy: {
        version: "macro-story-v1",
        monthlyChancePpm: 1_000_000,
        minimumDurationMonths: 2,
        maximumDurationMonths: 2,
      },
    });
    const story = first.state.gameplay.eventLifecycle.macroStories[0]!;
    expect(story.startedMonth).toBe("2026-08");
    const second = processMonthlyTurnV2(
      first.state,
      command(first.state),
      {
        eventSchedulingPolicy: {
          version: "fairness-v1",
          minimumChancePpm: 0,
          maximumChancePpm: 0,
        },
        macroStoryPolicy: {
          version: "macro-story-v1",
          monthlyChancePpm: 0,
          minimumDurationMonths: 2,
          maximumDurationMonths: 2,
        },
      },
    );
    expect(second.record.market.appliedReturnModifiersPpm).toEqual(
      story.returnModifiersPpm,
    );
    expect(second.state.gameplay.eventLifecycle.macroStories[0]?.storyId).toBe(
      story.storyId,
    );
  });

  it("adjudicates a covered health claim and commits its accumulator with payment", () => {
    const initial = configuredState();
    const result = processMonthlyTurnV2(
      initial,
      command(initial, {
        insuranceClaim: {
          type: "health",
          grossAmountCents: moneyCents(200_000),
          covered: true,
        },
      }),
    );

    expect(result.record.insurancePlayerCostCents).toBe(184_000);
    expect(result.state.gameplay.insurance).toMatchObject({
      healthDeductiblePaidCents: 180_000,
      healthOutOfPocketPaidCents: 184_000,
    });
    expect(result.record.nonDebtObligationsPaidCents).toBeGreaterThan(
      result.state.finances.requiredObligationsCents - 11_000,
    );
  });

  it("queues a fair event after the completed month and blocks progression until choice", () => {
    const initial = configuredState();
    const result = processMonthlyTurnV2(initial, command(initial), {
      eventSchedulingPolicy: {
        version: "fairness-v1",
        minimumChancePpm: 1_000_000,
        maximumChancePpm: 1_000_000,
      },
    });

    expect(result.record.scheduledEvent).toEqual(
      result.state.gameplay.eventLifecycle.pending,
    );
    expect(result.record.scheduledEvent).toMatchObject({
      scheduledMonth: "2026-08",
      expiresMonth: "2026-09",
    });
    const nextCommand = {
      ...command(result.state),
      id: "cmd.month.2026-08",
      effectiveMonth: result.state.currentMonth,
      expectedRevision: result.state.revision,
    };
    expect(() => processMonthlyTurnV2(result.state, nextCommand)).toThrow(
      expect.objectContaining({ code: "PENDING_EVENT" }),
    );
  });

  it("records bankruptcy without partial funding when a claim exceeds all liquidity", () => {
    const initial = configuredState();
    const result = processMonthlyTurnV2(
      initial,
      command(initial, {
        insuranceClaim: {
          type: "health",
          grossAmountCents: moneyCents(10_000_000),
          covered: false,
        },
      }),
    );

    expect(result.state.outcome).toMatchObject({ kind: "bankruptcy", grade: "F" });
    expect(result.record.funding).toBeNull();
    expect(result.record.nonDebtObligationsPaidCents).toBe(0);
    expect(result.record.recurringAllocations).toBeNull();
    expect(
      result.state.ledger.transactions.some(
        ({ reasonCode }) => reasonCode === "monthly_non_debt_obligations_v2",
      ),
    ).toBe(false);
  });

  it("wraps invalid tax evidence as an atomic transition failure", () => {
    const initial = configuredState();
    const invalid = command(initial);
    const bad = {
      ...invalid,
      payload: {
        ...invalid.payload,
        taxEvidence: { ...invalid.payload.taxEvidence, stateCode: "CA" },
      },
    };
    expect(() => processMonthlyTurnV2(initial, bad)).toThrow(
      expect.objectContaining({ code: "TRANSITION_INVARIANT" }),
    );
    expect(initial.revision).toBe(1);
    expect(initial.ledger.transactions).toHaveLength(1);
  });
});
