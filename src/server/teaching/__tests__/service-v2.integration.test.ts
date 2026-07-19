import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { CheckpointEvidenceV2 } from "../../../core/checkpoint-v2";
import { buildCausalHistoryV1, causalNodeV1 } from "../../../core/causal-history-v1";
import { sha256Canonical } from "../../../core/canonical";
import { CounterfactualV1Error } from "../../../core/counterfactual-v1";
import { createInitialGameState } from "../../../core/game-state";
import { finalizeGameStateV2, migrateGameStateV1ToV2 } from "../../../core/game-state-v2";
import { validateGameStateV2 } from "../../../core/game-state-v2-validation";
import { recordLearningInteractionV2 } from "../../../core/learning-interaction-v2";
import type { MonthlyTurnV2Record } from "../../../core/monthly-turn-v2";
import { analyzeRiskV1 } from "../../../core/risk-v1";
import {
  buildTeachingCheckpointFromOwnersV2,
  type TeachingCheckpointOwnerBundleV2,
} from "../../../core/teaching-checkpoint-owner-v2";
import { moneyCents, ratePpm } from "../../../core/domain/money";
import { simulationMonth } from "../../../core/domain/month";
import { TeachingCheckpointPanelV2 } from "../../../features/game/teaching-checkpoint-panel";
import { TeachingMomentPanelV2 } from "../../../features/game/teaching-moment-panel";
import {
  handleGetTeachingCheckpointV2,
  handlePostTeachingDebriefV2,
  handlePostTeachingMomentV2,
} from "../http-v2";
import { TeachingServiceV2 } from "../service-v2";

const checkpointEvidence: CheckpointEvidenceV2 = {
  evidenceVersion: "checkpoint-v2.1",
  start: {
    month: simulationMonth("2029-01"),
    ageYears: 34,
    cashCents: moneyCents(500_000),
    investableAssetsCents: moneyCents(2_000_000),
    liabilitiesCents: moneyCents(900_000),
    netWorthCents: moneyCents(1_600_000),
    annualLivingCostCents: moneyCents(3_600_000),
    financialIndependenceTargetCents: moneyCents(90_000_000),
    financialIndependenceProgressPpm: ratePpm(22_222),
    exposure: null,
  },
  end: {
    month: simulationMonth("2029-04"),
    ageYears: 35,
    cashCents: moneyCents(620_000),
    investableAssetsCents: moneyCents(2_180_000),
    liabilitiesCents: moneyCents(860_000),
    netWorthCents: moneyCents(1_940_000),
    annualLivingCostCents: moneyCents(3_600_000),
    financialIndependenceTargetCents: moneyCents(90_000_000),
    financialIndependenceProgressPpm: ratePpm(24_222),
    exposure: {
      month: simulationMonth("2029-04"),
      scorePpm: ratePpm(300_000),
      emergencyFundMonthsPpm: ratePpm(500_000),
      debtToIncomePpm: ratePpm(200_000),
      revolvingDebtPpm: ratePpm(0),
      insuranceGapPpm: ratePpm(0),
      portfolioConcentrationPpm: ratePpm(400_000),
      jobInvestmentCorrelationPpm: ratePpm(100_000),
    },
  },
  monthsProcessed: 3,
  monthlyCommandIds: ["month.1", "month.2", "month.3"],
  taxTraceIds: ["tax.1", "tax.2", "tax.3"],
  totalGrossIncomeCents: moneyCents(900_000),
  totalTaxCents: moneyCents(180_000),
  totalAfterTaxCashIncomeCents: moneyCents(720_000),
  totalRequiredCashCents: moneyCents(540_000),
  totalMarketValueChangeCents: moneyCents(40_000),
  totalInflationIncreaseCents: moneyCents(3_000),
  totalInsurancePlayerCostCents: moneyCents(24_000),
  totalDebtInterestCents: moneyCents(15_000),
  totalDebtPaymentsCents: moneyCents(75_000),
  totalLiquidationCostCents: moneyCents(0),
  netWorthChangeCents: moneyCents(340_000),
  investableAssetsChangeCents: moneyCents(180_000),
  liabilitiesChangeCents: moneyCents(-40_000),
  eventChoices: [],
};

function checkpointOwnerBundle(): TeachingCheckpointOwnerBundleV2 {
  const ownerState = migrateGameStateV1ToV2(
    createInitialGameState({
      runId: "run.checkpoint-owner",
      startMonth: "2029-04",
      randomSeed: "checkpoint-owner",
      player: {
        playerId: "player.checkpoint-owner",
        birthMonth: "1994-01",
        locationId: "location.test",
        careerTrackId: "career.test",
        filingStatus: "single",
      },
      finances: {
        cashCents: moneyCents(620_000), taxableInvestmentsCents: moneyCents(1_560_000),
        retirementCents: moneyCents(0), homeValueCents: moneyCents(0),
        otherInvestableAssetsCents: moneyCents(0), otherAssetsCents: moneyCents(0),
        nonCreditLiabilitiesCents: moneyCents(860_000), creditLimitCents: moneyCents(100_000),
        creditUsedCents: moneyCents(0), annualLivingCostCents: moneyCents(3_600_000),
        requiredObligationsCents: moneyCents(100_000),
      },
      wellbeing: { burnoutPpm: ratePpm(0), happinessPpm: ratePpm(1_000_000) },
    }),
  );
  const allocation = {
    preTax: {
      employee401kCents: moneyCents(10_000),
      employer401kMatchCents: moneyCents(10_000),
      hsaCents: moneyCents(5_000),
    },
    afterTax: {
      broadIndexCents: moneyCents(15_000), sectorCents: moneyCents(0),
      speculativeCents: moneyCents(0), iraCents: moneyCents(0),
      extraDebtCents: moneyCents(0), retainedCashCents: moneyCents(0),
    },
  };
  const records = [0, 1, 2].map((index) => ({
    commandId: `month.${index + 1}`,
    processedMonth: simulationMonth(`2029-0${index + 1}`),
    nextMonth: simulationMonth(`2029-0${index + 2}`),
    taxTraceId: `tax.${index + 1}`,
    grossIncomeCents: moneyCents(300_000),
    afterTaxCashIncomeCents: moneyCents(240_000),
    requiredCashCents: moneyCents(180_000),
    marketValueChangeCents: moneyCents(index === 2 ? 13_334 : 13_333),
    baseNonDebtObligationsCents: moneyCents(100_000),
    resolvedExpenseCents: moneyCents(55_000),
    debtService: {
      totalScheduledPaymentCents: moneyCents(25_000),
      totalInterestCents: moneyCents(5_000),
    },
    recurringAllocations: allocation,
  })) as unknown as MonthlyTurnV2Record[];
  const endRisk = analyzeRiskV1(ownerState);
  return {
    evidence: checkpointEvidence,
    fromRevision: 6,
    toRevision: 9,
    endingStateChecksum: "a".repeat(64),
    monthlyRecords: records.map((record, index) => ({
      resultingRevision: index + 7,
      recordChecksum: sha256Canonical(record),
      record,
    })),
    startRisk: { ...endRisk, asOfMonth: checkpointEvidence.start.month },
    endRisk,
    endGoal: {
      goal: {
        version: "financial-goal-v1",
        source: "current_lifestyle_default",
        desiredAnnualSpendingCents: checkpointEvidence.end.annualLivingCostCents,
        safeWithdrawalRatePpm: ratePpm(40_000),
        targetAgeYears: 65,
      },
      investableAssetsCents: checkpointEvidence.end.investableAssetsCents,
      targetCents: checkpointEvidence.end.financialIndependenceTargetCents,
      progressPpm: checkpointEvidence.end.financialIndependenceProgressPpm,
      remainingCents: moneyCents(
        checkpointEvidence.end.financialIndependenceTargetCents -
        checkpointEvidence.end.investableAssetsCents,
      ),
    },
  } as TeachingCheckpointOwnerBundleV2;
}

function state(revision: number) {
  return {
    runId: "0f5fad5b-d9cb-4e70-8fd7-3e6df5799c42",
    revision,
    currentMonth: simulationMonth("2029-04"),
  };
}

describe("TeachingServiceV2 checkpoint integration", () => {
  it("publishes current Risk v1 facts without Exposure as a competing teaching owner", () => {
    const checkpoint = buildTeachingCheckpointFromOwnersV2(checkpointOwnerBundle());

    expect(checkpoint.facts.facts).toContainEqual(expect.objectContaining({
      factId: "checkpoint.risk.debt_service_ratio.value",
      source: expect.objectContaining({ kind: "risk_snapshot" }),
    }));
    expect(
      checkpoint.facts.facts.some(({ source }) => source.kind === "exposure_snapshot"),
    ).toBe(false);
  });

  it("rejects tampered owner checksums, tax identity, and displayed aggregates", () => {
    const bundle = checkpointOwnerBundle();
    expect(() => buildTeachingCheckpointFromOwnersV2({
      ...bundle,
      monthlyRecords: bundle.monthlyRecords.map((item, index) =>
        index === 0 ? { ...item, recordChecksum: "f".repeat(64) } : item),
    })).toThrowError("INVALID_INPUT");
    expect(() => buildTeachingCheckpointFromOwnersV2({
      ...bundle,
      evidence: {
        ...bundle.evidence,
        taxTraceIds: ["tax.tampered", ...bundle.evidence.taxTraceIds.slice(1)],
      },
    })).toThrowError("INVALID_INPUT");
    expect(() => buildTeachingCheckpointFromOwnersV2({
      ...bundle,
      evidence: {
        ...bundle.evidence,
        totalMarketValueChangeCents: moneyCents(
          bundle.evidence.totalMarketValueChangeCents + 1,
        ),
      },
    })).toThrowError("INVALID_INPUT");
  });

  it("loads verified repository evidence and projects it through the teaching presentation boundary", async () => {
    const repository = {
      loadAuthorizedRunV2: vi.fn().mockResolvedValue(state(9)),
      loadCheckpointEvidenceV2: vi.fn().mockResolvedValue(checkpointEvidence),
      loadTeachingCheckpointOwnerBundleV2: vi.fn().mockResolvedValue(checkpointOwnerBundle()),
    };
    const service = new TeachingServiceV2(repository);

    const result = await service.getCheckpoint(
      state(9).runId,
      "access-secret",
      { expectedRevision: 9, fromRevision: 6 },
    );

    expect(repository.loadAuthorizedRunV2).toHaveBeenCalledTimes(2);
    expect(repository.loadTeachingCheckpointOwnerBundleV2).toHaveBeenCalledWith(
      state(9).runId,
      "access-secret",
      6,
    );
    expect(result.source).toBe("deterministic_template");
    expect(result.checkpoint.monthsAggregated).toBe(3);
    expect(result.checkpoint.facts.facts).toContainEqual(
      expect.objectContaining({
        factId: "checkpoint.total_gross_income_cents",
        value: { kind: "money_cents", value: 900_000 },
        source: expect.objectContaining({
          kind: "monthly_record",
          field: "records.grossIncomeCents",
          revision: 9,
          sourceId: "monthly:month.1",
          supportingSourceIds: [
            "monthly:month.1",
            "monthly:month.2",
            "monthly:month.3",
          ],
        }),
      }),
    );
    expect(result.checkpoint.facts.facts).toContainEqual(
      expect.objectContaining({
        factId: "checkpoint.total_employer_match_cents",
        value: { kind: "money_cents", value: 30_000 },
      }),
    );
    expect(result.checkpoint.missingDimensions).toEqual([
      { dimensionId: "essential_spending", reasonCode: "source_not_recorded" },
      { dimensionId: "discretionary_spending", reasonCode: "source_not_recorded" },
    ]);

    const html = renderToStaticMarkup(
      createElement(TeachingCheckpointPanelV2, {
        checkpoint: result.checkpoint,
      }),
    );
    expect(html).toContain("3 hidden months summarized");
    expect(html).toContain("$9,000");
    expect(html).toContain("Source not recorded");
    expect(html).toContain("records.grossIncomeCents");
    expect(html).toContain("Additional verified checkpoint facts");
    expect(html).toContain("Detailed risk evidence");
    expect(html.match(/data-teaching-summary-fact/g)?.length ?? 0).toBeLessThanOrEqual(8);
    expect(
      result.checkpoint.facts.facts
        .filter(({ factId }) => factId.includes("risk.emergency_fund_months"))
        .map(({ factId }) => factId),
    ).toEqual([
      "checkpoint.risk.emergency_fund_months.band",
      "checkpoint.risk.emergency_fund_months.value",
    ]);
  });

  it("resolves a trailing month window on the server instead of guessing revisions", async () => {
    const repository = {
      loadAuthorizedRunV2: vi.fn().mockResolvedValue(state(23)),
      loadCheckpointEvidenceV2: vi.fn().mockResolvedValue(checkpointEvidence),
      loadTrailingMonthlyStartRevisionV2: vi.fn().mockResolvedValue(6),
      loadTeachingCheckpointOwnerBundleV2: vi
        .fn()
        .mockResolvedValue(checkpointOwnerBundle()),
    };
    const service = new TeachingServiceV2(repository);

    await service.getCheckpoint(state(23).runId, "access-secret", {
      expectedRevision: 23,
      trailingMonths: 12,
    });

    expect(repository.loadTrailingMonthlyStartRevisionV2).toHaveBeenCalledWith(
      state(23).runId,
      "access-secret",
      12,
    );
    expect(repository.loadTeachingCheckpointOwnerBundleV2).toHaveBeenCalledWith(
      state(23).runId,
      "access-secret",
      6,
    );
  });

  it("rejects a run that changes while checkpoint evidence is loaded", async () => {
    const repository = {
      loadAuthorizedRunV2: vi
        .fn()
        .mockResolvedValueOnce(state(9))
        .mockResolvedValueOnce(state(10)),
      loadCheckpointEvidenceV2: vi.fn().mockResolvedValue(checkpointEvidence),
      loadTeachingCheckpointOwnerBundleV2: vi.fn().mockResolvedValue(checkpointOwnerBundle()),
    };
    const service = new TeachingServiceV2(repository);

    await expect(
      service.getCheckpoint(state(9).runId, "access-secret", {
        expectedRevision: 9,
        fromRevision: 6,
      }),
    ).rejects.toEqual(expect.objectContaining({
      code: "STALE_REVISION",
    }));
  });

  it("exposes the deterministic wrapper through the authenticated HTTP boundary", async () => {
    const repository = {
      loadAuthorizedRunV2: vi.fn().mockResolvedValue(state(9)),
      loadCheckpointEvidenceV2: vi.fn().mockResolvedValue(checkpointEvidence),
      loadTeachingCheckpointOwnerBundleV2: vi.fn().mockResolvedValue(checkpointOwnerBundle()),
    };
    const response = await handleGetTeachingCheckpointV2(
      new Request(
        `http://localhost/api/v2/runs/${state(9).runId}/teaching/checkpoint?expectedRevision=9&fromRevision=6`,
        { headers: { authorization: `Bearer lf_run_${"A".repeat(43)}` } },
      ),
      state(9).runId,
      new TeachingServiceV2(repository),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      source: "deterministic_template",
      checkpoint: {
        version: "teaching-checkpoint-v2",
        monthsAggregated: 3,
      },
    });
  });
});

describe("TeachingServiceV2 moment integration", () => {
  it("rejects an unknown requested-help concept before loading or mutating a run", async () => {
    const repository = {
      loadAuthorizedRunV2: vi.fn(),
      loadCheckpointEvidenceV2: vi.fn(),
      applyCommandV2: vi.fn(),
    };
    const response = await handlePostTeachingMomentV2(
      new Request("http://localhost/api/v2/runs/run.teaching-help/teaching/moment", {
        method: "POST",
        headers: {
          authorization: `Bearer lf_run_${"A".repeat(43)}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          expectedRevision: 0,
          trigger: "requested_help",
          conceptId: "invented_concept",
        }),
      }),
      "run.teaching-help",
      new TeachingServiceV2(repository),
    );

    expect(response.status).toBe(400);
    expect(repository.loadAuthorizedRunV2).not.toHaveBeenCalled();
    expect(repository.applyCommandV2).not.toHaveBeenCalled();
  });

  it("persists the first Risk-owned teaching moment without changing financial or random state", async () => {
    let current = migrateGameStateV1ToV2(
      createInitialGameState({
        runId: "run.teaching-moment",
        startMonth: "2029-04",
        randomSeed: "teaching-moment",
        player: {
          playerId: "player.teaching-moment",
          birthMonth: "1994-01",
          locationId: "location.test",
          careerTrackId: "career.test",
          filingStatus: "single",
        },
        finances: {
          cashCents: moneyCents(10_000),
          taxableInvestmentsCents: moneyCents(0),
          retirementCents: moneyCents(0),
          homeValueCents: moneyCents(0),
          otherInvestableAssetsCents: moneyCents(0),
          otherAssetsCents: moneyCents(0),
          nonCreditLiabilitiesCents: moneyCents(0),
          creditLimitCents: moneyCents(100_000),
          creditUsedCents: moneyCents(0),
          annualLivingCostCents: moneyCents(1_200_000),
          requiredObligationsCents: moneyCents(100_000),
        },
        wellbeing: {
          burnoutPpm: ratePpm(0),
          happinessPpm: ratePpm(1_000_000),
        },
      }),
    );
    const openingFinancialChecksum = sha256Canonical({
      finances: current.finances,
      ledger: current.ledger,
      random: current.random,
    });
    const repository = {
      loadAuthorizedRunV2: vi.fn(async () => current),
      loadCheckpointEvidenceV2: vi.fn(),
      applyCommandV2: vi.fn(async (_runId, _secret, command) => {
        current = recordLearningInteractionV2(current, command);
        return {
          state: current,
          stateChecksum: sha256Canonical(current),
          idempotentReplay: false,
          monthlyRecord: null,
        };
      }),
    };
    const service = new TeachingServiceV2(repository);

    const first = await service.getMoment(current.runId, "access-secret", {
      expectedRevision: 0,
      trigger: "automatic",
    });

    expect(first.moment?.conceptId).toBe("emergency_fund");
    expect(first.moment?.reasonCode).toBe("first_verified_relevance");
    expect(first.facts?.facts[0]).toMatchObject({
      factId: "risk.emergency_fund_months",
      source: {
        sourceId: "risk:2029-04:risk-v1.emergency_fund_months",
        field: "metrics.emergency_fund_months.rawValue",
      },
    });
    expect(current.gameplay.aiLearningMemory?.concepts).toContainEqual(
      expect.objectContaining({ conceptId: "emergency_fund", exposureCount: 1 }),
    );
    expect(
      sha256Canonical({
        finances: current.finances,
        ledger: current.ledger,
        random: current.random,
      }),
    ).toBe(openingFinancialChecksum);
    const html = renderToStaticMarkup(createElement(TeachingMomentPanelV2, {
      response: first,
      busy: false,
      onRequestHelp: () => undefined,
      rewrite: {
        stateChecksum: first.stateChecksum,
        rewrite: {
          source: "ai_validated",
          content: {
            version: "teaching-copy-v2",
            sections: [{
              sectionId: "moment.explanation",
              fragments: [{ kind: "text", text: "Build a verified cash buffer." }],
            }],
          },
        },
      },
    }));
    expect(html).toContain("Verified teaching moment");
    expect(html).toContain("Optional AI wording · facts unchanged");
    expect(html).toContain("Build a verified cash buffer.");
    expect(html).toContain("risk:2029-04:risk-v1.emergency_fund_months");

    const repeated = await service.getMoment(current.runId, "access-secret", {
      expectedRevision: current.revision,
      trigger: "automatic",
    });
    expect(repeated.moment?.conceptId).not.toBe("emergency_fund");
  });

  it("exposes requested help through the authenticated deterministic HTTP boundary", async () => {
    let current = migrateGameStateV1ToV2(
      createInitialGameState({
        runId: "run.teaching-help",
        startMonth: "2029-04",
        randomSeed: "teaching-help",
        player: {
          playerId: "player.teaching-help",
          birthMonth: "1994-01",
          locationId: "location.test",
          careerTrackId: "career.test",
          filingStatus: "single",
        },
        finances: {
          cashCents: moneyCents(100_000), taxableInvestmentsCents: moneyCents(0),
          retirementCents: moneyCents(0), homeValueCents: moneyCents(0),
          otherInvestableAssetsCents: moneyCents(0), otherAssetsCents: moneyCents(0),
          nonCreditLiabilitiesCents: moneyCents(0), creditLimitCents: moneyCents(100_000),
          creditUsedCents: moneyCents(0), annualLivingCostCents: moneyCents(1_200_000),
          requiredObligationsCents: moneyCents(100_000),
        },
        wellbeing: { burnoutPpm: ratePpm(0), happinessPpm: ratePpm(1_000_000) },
      }),
    );
    const repository = {
      loadAuthorizedRunV2: vi.fn(async () => current),
      loadCheckpointEvidenceV2: vi.fn(),
      applyCommandV2: vi.fn(async (_runId, _secret, command) => {
        current = recordLearningInteractionV2(current, command);
        return { state: current };
      }),
    };
    const response = await handlePostTeachingMomentV2(
      new Request("http://localhost/api/v2/runs/run.teaching-help/teaching/moment", {
        method: "POST",
        headers: {
          authorization: `Bearer lf_run_${"A".repeat(43)}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          expectedRevision: 0,
          trigger: "requested_help",
          conceptId: "diversification",
        }),
      }),
      current.runId,
      new TeachingServiceV2(repository),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      source: "deterministic_template",
      moment: {
        conceptId: "diversification",
        reasonCode: "player_requested_help",
      },
      state: { revision: 1 },
    });
  });
});

describe("TeachingServiceV2 debrief boundary", () => {
  it("rejects caller-authored debrief evidence before repository access", async () => {
    const repository = {
      loadAuthorizedRunV2: vi.fn(),
      loadCheckpointEvidenceV2: vi.fn(),
    };
    const response = await handlePostTeachingDebriefV2(
      new Request("http://localhost/api/v2/runs/run.teaching-debrief/teaching/debrief", {
        method: "POST",
        headers: {
          authorization: `Bearer lf_run_${"A".repeat(43)}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          expectedRevision: 5,
          counterfactuals: [],
          strongDecisions: [{ label: "I did great" }],
        }),
      }),
      "run.teaching-debrief",
      new TeachingServiceV2(repository),
    );

    expect(response.status).toBe(400);
    expect(repository.loadAuthorizedRunV2).not.toHaveBeenCalled();
  });

  it("joins the authoritative outcome and Prompt 11 causal history without mutating the run", async () => {
    const initial = migrateGameStateV1ToV2(
      createInitialGameState({
        runId: "run.teaching-debrief",
        startMonth: "2029-04",
        randomSeed: "teaching-debrief",
        player: {
          playerId: "player.teaching-debrief",
          birthMonth: "1960-01",
          locationId: "location.test",
          careerTrackId: "career.test",
          filingStatus: "single",
        },
        finances: {
          cashCents: moneyCents(800_000), taxableInvestmentsCents: moneyCents(2_000_000),
          retirementCents: moneyCents(4_000_000), homeValueCents: moneyCents(0),
          otherInvestableAssetsCents: moneyCents(0), otherAssetsCents: moneyCents(0),
          nonCreditLiabilitiesCents: moneyCents(0), creditLimitCents: moneyCents(100_000),
          creditUsedCents: moneyCents(0), annualLivingCostCents: moneyCents(1_200_000),
          requiredObligationsCents: moneyCents(100_000),
        },
        wellbeing: { burnoutPpm: ratePpm(0), happinessPpm: ratePpm(1_000_000) },
      }),
    );
    const terminalInput = {
      ...initial,
      outcome: {
        outcomePolicyVersion: "1.0.0",
        kind: "retirement_age",
        grade: "D",
        reachedMonth: initial.currentMonth,
        reasonCode: "configured_retirement_age_reached",
        reasonCodes: [
          "configured_retirement_age_reached",
          "financial_independence_target_not_reached",
        ],
        financialIndependence: {
          goalSource: "current_lifestyle_default",
          investableAssetsCents: moneyCents(6_800_000),
          targetCents: moneyCents(30_000_000),
          progressPpm: ratePpm(226_666),
        },
        displayedNetWorthCents: moneyCents(6_800_000),
        automaticLiquidSolvency: {
          requiredCashCents: moneyCents(100_000),
          automaticLiquidityCents: moneyCents(2_800_000),
          residualShortfallCents: moneyCents(0),
          isSolvent: true,
        },
        retirementReadiness: {
          retirementAgeYears: 65,
          currentAgeYears: 69,
          reachedRetirementAge: true,
          gradeIfRetiredNow: "D",
        },
      },
    } as const;
    const violations = validateGameStateV2(terminalInput);
    if (violations.length > 0) throw new Error(JSON.stringify(violations));
    const terminal = finalizeGameStateV2(terminalInput);
    const stateChecksum = sha256Canonical(terminal);
    const outcomeNode = causalNodeV1({
      kind: "end_condition",
      primarySourceEvidenceId: "outcome:0:retirement_age",
      month: terminal.currentMonth,
      resultingRevision: terminal.revision,
      sourceEvidenceIds: ["outcome:0:retirement_age"],
      lessonTags: ["retirement_readiness"],
      affectedValues: [],
    });
    const history = buildCausalHistoryV1({
      runId: terminal.runId,
      fromRevision: 0,
      toRevision: terminal.revision,
      sourceStateChecksum: stateChecksum,
      nodes: [outcomeNode],
      links: [],
      turningPoints: [],
      coverage: {
        beginsAtRevision: 0,
        endsAtRevision: terminal.revision,
        preMigrationHistoryAvailable: true,
        summarizedCommandRanges: [],
        missingEvidence: [],
      },
    });
    const repository = {
      loadAuthorizedRunV2: vi.fn().mockResolvedValue(terminal),
      loadCheckpointEvidenceV2: vi.fn(),
      loadCausalHistoryV1: vi.fn().mockResolvedValue(history),
      runCounterfactualV1: vi.fn(),
    };

    const result = await new TeachingServiceV2(repository).getDebrief(
      terminal.runId,
      "access-secret",
      { expectedRevision: terminal.revision, counterfactuals: [] },
    );

    expect(result.source).toBe("deterministic_template");
    expect(result.counterfactualRequestSource).toBe("unavailable");
    expect(result.stateChecksum).toBe(stateChecksum);
    expect(result.debrief.outcome).toMatchObject({
      grade: "D",
      endReason: "retirement_age",
      sourceId: "outcome:0:retirement_age",
    });
    expect(result.debrief.turningPointStatus).toBe("insufficient_verified_history");
    expect(repository.loadAuthorizedRunV2).toHaveBeenCalledTimes(2);
    expect(repository.runCounterfactualV1).not.toHaveBeenCalled();
    expect(sha256Canonical(terminal)).toBe(stateChecksum);

    const policyNode = causalNodeV1({
      kind: "policy_change",
      primarySourceEvidenceId: "command:strategy.verified",
      month: terminal.currentMonth,
      resultingRevision: terminal.revision,
      sourceEvidenceIds: ["command:strategy.verified"],
      lessonTags: ["recurring_strategy"],
      affectedValues: [],
    });
    const historyWithPolicy = buildCausalHistoryV1({
      runId: terminal.runId,
      fromRevision: 0,
      toRevision: terminal.revision,
      sourceStateChecksum: stateChecksum,
      nodes: [policyNode, outcomeNode],
      links: [],
      turningPoints: [],
      coverage: history.coverage,
    });
    const unsupportedEngine = {
      ...repository,
      loadCausalHistoryV1: vi.fn().mockResolvedValue(historyWithPolicy),
      loadAcceptedCommandV2: vi.fn().mockResolvedValue({
        schemaVersion: 2,
        id: "strategy.verified",
        type: "set_recurring_strategy",
        expectedRevision: terminal.revision,
        effectiveMonth: terminal.currentMonth,
        payload: {
          strategy: {
            emergencyFundTargetMonthsPpm: ratePpm(0),
            insuranceCoverageIds: [],
            preTax401kSalaryRatePpm: ratePpm(100_000),
            preTaxHsaSalaryRatePpm: ratePpm(0),
            afterTaxBroadIndexRatePpm: ratePpm(150_000),
            afterTaxSectorRatePpm: ratePpm(0),
            afterTaxSpeculativeRatePpm: ratePpm(0),
            afterTaxIraRatePpm: ratePpm(0),
            afterTaxExtraDebtRatePpm: ratePpm(0),
          },
        },
      }),
      runCounterfactualV1: vi.fn().mockRejectedValue(
        new CounterfactualV1Error(
          "UNSUPPORTED_INTERVENTION",
          "request.intervention",
          "fixture rejection",
        ),
      ),
    };

    const unavailable = await new TeachingServiceV2(unsupportedEngine).getDebrief(
      terminal.runId,
      "access-secret",
      { expectedRevision: terminal.revision, counterfactuals: [] },
    );

    expect(unsupportedEngine.loadAcceptedCommandV2).toHaveBeenCalledWith(
      terminal.runId,
      "access-secret",
      "strategy.verified",
    );
    expect(unsupportedEngine.runCounterfactualV1).toHaveBeenCalledWith(
      terminal.runId,
      "access-secret",
      {
        version: "counterfactual-v1",
        sourceCommandId: "strategy.verified",
        intervention: {
          kind: "recurring_strategy_field",
          commandId: "strategy.verified",
          field: "afterTaxBroadIndexRatePpm",
          value: 0,
        },
        horizonMonths: 12,
      },
    );
    expect(unavailable.counterfactualRequestSource).toBe("unavailable");
    expect(unavailable.debrief.counterfactuals).toEqual([]);
  });
});
