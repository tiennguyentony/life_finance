import { describe, expect, it } from "vitest";

import { sha256Canonical } from "../canonical";
import { moneyCents } from "../domain/money";
import { decodePersistedGameState } from "../persisted-game-state";
import {
  constructOnboardedGameStateV1,
  prepareOnboardingReviewV1,
} from "../onboarding-v1";
import { onboardingDraftForPersonaV1 } from "../onboarding-personas-v1";

describe("Onboarding v1 authoritative state integration", () => {
  it("confirms a review into native state with fresh Risk v1 ownership and no live Exposure snapshot", () => {
    const review = prepareOnboardingReviewV1(
      onboardingDraftForPersonaV1("software", "onboarding-integration-seed"),
    );
    expect(review.status).toBe("ready");

    const first = constructOnboardedGameStateV1(
      { confirmed: true, review, reviewChecksum: review.reviewChecksum },
      { runId: "run.onboarding.integration", playerId: "player.onboarding.integration" },
    );
    const second = constructOnboardedGameStateV1(
      { confirmed: true, review, reviewChecksum: review.reviewChecksum },
      { runId: "run.onboarding.integration", playerId: "player.onboarding.integration" },
    );

    expect(first.stateChecksum).toBe(second.stateChecksum);
    expect(first.state.gameplay.catalogs.scenario.id).toBe("scenario.fresh_start");
    expect(first.state.gameplay.exposure).toEqual({ current: null, history: [] });
    expect(first.state.gameplay.initialization).toMatchObject({
      version: "onboarding-v1",
      schemaVersion: 2,
      sourceMode: "persona",
      initialRandomSeed: "onboarding-integration-seed",
      confirmed: true,
      reviewChecksum: review.reviewChecksum,
      derivedOwners: {
        stateAndObligations: "createNativeGameStateV2",
        financialGoal: "projectFinancialGoal",
        risk: "analyzeRiskV1",
      },
    });
    expect(first.stateChecksum).toBe(sha256Canonical(first.state));

    const loaded = decodePersistedGameState(
      JSON.parse(JSON.stringify(first.state)) as unknown,
    );
    expect(loaded.schemaVersion).toBe(2);
    expect(sha256Canonical(loaded)).toBe(first.stateChecksum);
  });

  it("uses confirmed custom expenses in the native obligation path", () => {
    const draft = {
      ...onboardingDraftForPersonaV1("software", "custom-expense-seed"),
      essentialExpenses: { amountCents: 250_000, period: "monthly" as const },
      discretionaryExpenses: { amountCents: 50_000, period: "monthly" as const },
    };
    const review = prepareOnboardingReviewV1(draft);
    const result = constructOnboardedGameStateV1(
      { confirmed: true, review, reviewChecksum: review.reviewChecksum },
      { runId: "run.custom-expense", playerId: "player.custom-expense" },
    );

    expect(result.state.finances.annualLivingCostCents).toBe(3_600_000);
    expect(result.state.gameplay.initialization?.declaredExpenses).toEqual({
      essentialAnnualCents: 3_000_000,
      discretionaryAnnualCents: 600_000,
      totalAnnualCents: 3_600_000,
    });
    expect(result.state.finances.requiredObligationsCents).toBe(
      300_000 +
        result.state.gameplay.catalogSnapshot!.derived.monthlyHealthPremiumCents +
        result.state.gameplay.catalogSnapshot!.selected.insuranceCoverages.reduce(
          (total, coverage) => total + coverage.monthlyPremiumCents,
          0,
        ),
    );
    expect(review.preview?.requiredMonthlyObligationsCents).toBe(
      result.state.finances.requiredObligationsCents,
    );
    expect(review.preview?.catalogAnnualLivingCostCents).toBe(
      result.state.gameplay.catalogSnapshot!.derived.annualLivingCostCents,
    );
    expect(review.preview?.catalogAnnualLivingCostCents).not.toBe(
      review.preview?.declaredAnnualExpensesCents,
    );
    expect(result.state.gameplay.financialGoal?.desiredAnnualSpendingCents).toBe(
      3_600_000,
    );
  });

  it("rejects stale confirmation before constructing state", () => {
    const review = prepareOnboardingReviewV1(
      onboardingDraftForPersonaV1("teacher", "stale-review-seed"),
    );

    expect(() =>
      constructOnboardedGameStateV1(
        { confirmed: true, review, reviewChecksum: "0".repeat(64) },
        { runId: "run.stale", playerId: "player.stale" },
      ),
    ).toThrowError(/stale onboarding review/i);
  });

  it("rejects confirmation when the displayed owner-derived preview was changed", () => {
    const review = prepareOnboardingReviewV1(
      onboardingDraftForPersonaV1("software", "tampered-preview-seed"),
    );
    if (review.preview === null) throw new Error("expected ready preview");
    const tampered = {
      ...structuredClone(review),
      preview: {
        ...structuredClone(review.preview),
        requiredMonthlyObligationsCents: moneyCents(
          review.preview.requiredMonthlyObligationsCents + 1,
        ),
      },
    };

    expect(() =>
      constructOnboardedGameStateV1(
        {
          confirmed: true,
          review: tampered,
          reviewChecksum: review.reviewChecksum,
        },
        { runId: "run.preview-tamper", playerId: "player.preview-tamper" },
      ),
    ).toThrowError(/stale onboarding review/i);
  });

  it("persists and reloads hybrid persona plus confirmed-AI provenance", () => {
    const draft = {
      ...onboardingDraftForPersonaV1("software", "hybrid-ai-save-load"),
      sourceMode: "ai_assisted" as const,
      locationId: "location.austin",
    };
    const review = prepareOnboardingReviewV1(draft);
    expect(review.status).toBe("ready");
    expect(review.provenance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "finances.cashCents",
          source: "persona_fixture",
        }),
        expect.objectContaining({
          path: "selection.locationId",
          source: "user_entered",
        }),
      ]),
    );

    const result = constructOnboardedGameStateV1(
      { confirmed: true, review, reviewChecksum: review.reviewChecksum },
      { runId: "run.hybrid-ai", playerId: "player.hybrid-ai" },
    );
    const loaded = decodePersistedGameState(
      JSON.parse(JSON.stringify(result.state)),
    );
    expect(loaded.schemaVersion).toBe(2);
    if (loaded.schemaVersion !== 2) throw new Error("expected schema v2");
    expect(loaded.gameplay.initialization?.sourceMode).toBe("ai_assisted");
    expect(loaded.gameplay.initialization?.persona).toEqual({
      id: "software",
      version: "onboarding-persona-v1",
    });
  });

  it("rejects malformed or cross-field initialization evidence during strict load", () => {
    const review = prepareOnboardingReviewV1({
      ...onboardingDraftForPersonaV1("software", "tamper-evidence-seed"),
      essentialExpenses: { amountCents: 200_000, period: "monthly" },
      discretionaryExpenses: { amountCents: 50_000, period: "monthly" },
    });
    const result = constructOnboardedGameStateV1(
      { confirmed: true, review, reviewChecksum: review.reviewChecksum },
      { runId: "run.tamper", playerId: "player.tamper" },
    );
    const tampered = structuredClone(result.state) as unknown as {
      gameplay: {
        initialization: {
          declaredExpenses: {
            essentialAnnualCents: number;
            discretionaryAnnualCents: number;
            totalAnnualCents: number;
          };
        };
      };
    };
    tampered.gameplay.initialization.declaredExpenses.totalAnnualCents += 1;

    expect(() => decodePersistedGameState(tampered)).toThrowError(
      /violates its versioned invariants/i,
    );
  });
});
