import { describe, expect, it } from "vitest";

import { sha256Canonical } from "../canonical";
import { buildCheckpointEvidenceV2 } from "../checkpoint-v2";
import { moneyCents, ratePpm } from "../domain/money";
import { createInitialGameState } from "../game-state";
import { migrateGameStateV1ToV2 } from "../game-state-v2";

describe("checkpoint-v2.1 compatibility", () => {
  it("keeps the frozen zero-month field shape and canonical checksum", () => {
    const state = migrateGameStateV1ToV2(createInitialGameState({
      runId: "run.checkpoint-v2-compat",
      startMonth: "2029-04",
      randomSeed: "checkpoint-v2-compat",
      player: {
        playerId: "player.checkpoint-v2-compat",
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
    }));
    const evidence = buildCheckpointEvidenceV2(state, state, []);

    expect(Object.keys(evidence).sort()).toEqual([
      "end", "eventChoices", "evidenceVersion", "investableAssetsChangeCents",
      "liabilitiesChangeCents", "monthlyCommandIds", "monthsProcessed",
      "netWorthChangeCents", "start", "taxTraceIds", "totalAfterTaxCashIncomeCents",
      "totalDebtInterestCents", "totalDebtPaymentsCents", "totalGrossIncomeCents",
      "totalInflationIncreaseCents", "totalInsurancePlayerCostCents",
      "totalLiquidationCostCents", "totalMarketValueChangeCents", "totalRequiredCashCents",
      "totalTaxCents",
    ].sort());
    expect(Object.keys(evidence.end)).not.toContain("liquidResourceCoveragePpm");
    expect(sha256Canonical(evidence)).toBe(
      "c94085b3b45109956eaf34b6dbf31fdcaec89c7f54947811ae9ced19b82a5e65",
    );
  });
});
