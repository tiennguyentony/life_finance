import { describe, expect, it } from "vitest";

import { moneyCents, ratePpm } from "../domain/money";
import {
  ONBOARDING_V1_VERSION,
  type OnboardingDraftV1,
} from "../onboarding-v1-contracts";
import {
  ONBOARDING_DEFAULTS_V1,
  prepareOnboardingReviewV1,
} from "../onboarding-v1";
import {
  ONBOARDING_PERSONAS_V1,
  onboardingDraftForPersonaV1,
} from "../onboarding-personas-v1";
import { presentOnboardingReviewV1 } from "../../data/onboarding-localization-v1";

function completeDraft(
  overrides: Partial<OnboardingDraftV1> = {},
): OnboardingDraftV1 {
  return {
    version: ONBOARDING_V1_VERSION,
    sourceMode: "typed",
    startMonth: "2026-07",
    birthMonth: "1995-01",
    randomSeed: "onboarding-v1-seed",
    runtimeDifficulty: "normal",
    catalogVersion: "us-2026.2",
    locationId: "location.seattle",
    careerId: "career.software",
    householdId: "household.single",
    benefitsPackageId: "benefits.corporate_flex",
    healthPlanId: "health.hdhp_hsa",
    retirementPlanId: "retirement.401k_standard",
    insuranceCoverageIds: ["insurance.renters"],
    scenarioId: "scenario.fresh_start",
    grossIncome: {
      amountCents: 12_000_000,
      period: "annual",
      basis: "gross",
    },
    takeHomeIncome: {
      amountCents: 750_000,
      period: "monthly",
      basis: "take_home",
    },
    essentialExpenses: { amountCents: 200_000, period: "monthly" },
    discretionaryExpenses: { amountCents: 100_000, period: "monthly" },
    finances: {
      cashCents: 2_500_000,
      taxableBroadIndexCents: 1_000_000,
      taxableSectorCents: 200_000,
      taxableSpeculativeCents: 50_000,
      taxableTotalCents: 1_250_000,
      retirement401kCents: 2_000_000,
      retirementIraCents: 500_000,
      retirementTotalCents: 2_500_000,
      hsaCents: 100_000,
      homeValueCents: 0,
      otherAssetsCents: 25_000,
      termDebts: [],
      revolvingCreditLimitCents: 1_000_000,
      revolvingCreditUsedCents: 100_000,
    },
    wellbeing: {
      burnoutPpm: ratePpm(100_000),
      happinessPpm: ratePpm(800_000),
    },
    ...overrides,
  };
}

describe("Onboarding v1 normalization", () => {
  it("normalizes explicit periods exactly without converting annual values twice", () => {
    const review = prepareOnboardingReviewV1(completeDraft());

    expect(review.status).toBe("ready");
    expect(review.normalized).toMatchObject({
      annualGrossSalaryCents: 12_000_000,
      annualTakeHomeEvidenceCents: 9_000_000,
      declaredExpenses: {
        essentialAnnualCents: 2_400_000,
        discretionaryAnnualCents: 1_200_000,
        totalAnnualCents: 3_600_000,
      },
      finances: {
        cashCents: 2_500_000,
        taxableBroadIndexCents: 1_000_000,
        taxableSectorCents: 200_000,
        taxableSpeculativeCents: 50_000,
        retirement401kCents: 2_000_000,
        retirementIraCents: 500_000,
      },
    });
    expect(review.assumptions.map(({ code }) => code)).toContain(
      "TAKE_HOME_DISPLAY_ONLY",
    );
    expect(review.preview).toMatchObject({
      employerMatchTiers: [
        {
          employeeContributionRateUpToPpm: 30_000,
          employerMatchRatePpm: 1_000_000,
        },
        {
          employeeContributionRateUpToPpm: 50_000,
          employerMatchRatePpm: 500_000,
        },
      ],
      ownerVersions: {
        stateAndObligations: "4.1.0",
        stateSchema: 2,
        financialGoal: "financial-goal-v1",
        risk: "risk-v1",
      },
    });
  });

  it("requires gross income instead of reverse-engineering take-home pay", () => {
    const review = prepareOnboardingReviewV1(
      completeDraft({ grossIncome: undefined }),
    );

    expect(review.status).toBe("needs_input");
    expect(review.normalized).toBeNull();
    expect(review.issues).toContainEqual(
      expect.objectContaining({
        path: "grossIncome",
        code: "GROSS_INCOME_REQUIRED",
      }),
    );
  });

  it("rejects annualized take-home evidence that exceeds gross income", () => {
    const review = prepareOnboardingReviewV1(
      completeDraft({
        grossIncome: {
          amountCents: 12_000_000,
          period: "annual",
          basis: "gross",
        },
        takeHomeIncome: {
          amountCents: 1_100_000,
          period: "monthly",
          basis: "take_home",
        },
      }),
    );

    expect(review.status).toBe("invalid");
    expect(review.issues).toContainEqual(
      expect.objectContaining({
        path: "takeHomeIncome",
        code: "TAKE_HOME_EXCEEDS_GROSS",
      }),
    );
  });

  it("rejects a player younger than the supported working-age range at the birth-month field", () => {
    const review = prepareOnboardingReviewV1(
      completeDraft({ birthMonth: "2010-07" }),
    );

    expect(review.status).toBe("invalid");
    expect(review.issues).toContainEqual(
      expect.objectContaining({
        path: "birthMonth",
        code: "AGE_OUT_OF_RANGE",
      }),
    );
  });

  it("reports an impossible FI target against the target-age field", () => {
    const review = prepareOnboardingReviewV1(
      completeDraft({
        financialGoal: {
          version: "financial-goal-v1",
          desiredAnnualSpendingCents: moneyCents(4_000_000),
          safeWithdrawalRatePpm: ratePpm(40_000),
          targetAgeYears: 30,
          source: "player_selected",
        },
      }),
    );

    expect(review.status).toBe("invalid");
    expect(review.issues).toContainEqual(
      expect.objectContaining({
        path: "financialGoal.targetAgeYears",
        code: "INVALID_FINANCIAL_GOAL",
      }),
    );
  });

  it("produces ready deterministic reviews for every stable persona fixture", () => {
    const checksums = Object.keys(ONBOARDING_PERSONAS_V1).map((personaId) => {
      const draft = onboardingDraftForPersonaV1(
        personaId as keyof typeof ONBOARDING_PERSONAS_V1,
        `seed.${personaId}`,
      );
      const first = prepareOnboardingReviewV1(draft);
      const second = prepareOnboardingReviewV1(draft);

      expect(first.status).toBe("ready");
      expect(first.reviewChecksum).toBe(second.reviewChecksum);
      expect(first.normalized?.persona).toEqual({
        id: personaId,
        version: "onboarding-persona-v1",
      });
      expect(first.provenance.map(({ source }) => source)).toContain(
        "persona_fixture",
      );
      return first.reviewChecksum;
    });

    expect(new Set(checksums)).toHaveLength(4);
    expect(checksums.every((checksum) => /^[a-f0-9]{64}$/.test(checksum))).toBe(
      true,
    );
  });

  it("deep-freezes versioned fixtures and returns isolated deeply frozen persona drafts", () => {
    expect(Object.isFrozen(ONBOARDING_DEFAULTS_V1)).toBe(true);
    expect(Object.isFrozen(ONBOARDING_DEFAULTS_V1.wellbeing)).toBe(true);
    expect(Object.isFrozen(ONBOARDING_DEFAULTS_V1.insuranceCoverageIds)).toBe(
      true,
    );
    expect(Object.isFrozen(ONBOARDING_PERSONAS_V1.software)).toBe(true);
    expect(Object.isFrozen(ONBOARDING_PERSONAS_V1.software.grossIncome)).toBe(
      true,
    );
    expect(Object.isFrozen(ONBOARDING_PERSONAS_V1.software.finances)).toBe(
      true,
    );
    expect(Object.isFrozen(ONBOARDING_PERSONAS_V1.software.wellbeing)).toBe(
      true,
    );

    const first = onboardingDraftForPersonaV1("software", "clone-one");
    const second = onboardingDraftForPersonaV1("software", "clone-two");
    expect(first.grossIncome).not.toBe(second.grossIncome);
    expect(first.finances).not.toBe(second.finances);
    expect(first.finances?.termDebts).not.toBe(second.finances?.termDebts);
    expect(first.wellbeing).not.toBe(second.wellbeing);
    expect(first.insuranceCoverageIds).not.toBe(second.insuranceCoverageIds);
    expect(Object.isFrozen(first.grossIncome)).toBe(true);
    expect(Object.isFrozen(first.finances?.termDebts)).toBe(true);
    expect(Object.isFrozen(first.wellbeing)).toBe(true);

    expect(
      Reflect.set(first.grossIncome as object, "amountCents", 1),
    ).toBe(false);
    expect(
      onboardingDraftForPersonaV1("software", "clone-three").grossIncome
        ?.amountCents,
    ).toBe(12_000_000);
  });

  it("distinguishes unchanged persona fixture fields from user edits", () => {
    const review = prepareOnboardingReviewV1({
      ...onboardingDraftForPersonaV1("software", "persona-edit-seed"),
      grossIncome: {
        amountCents: 11_500_000,
        period: "annual",
        basis: "gross",
      },
    });

    expect(review.status).toBe("ready");
    expect(review.provenance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "birthMonth",
          source: "persona_fixture",
          sourceVersion: "onboarding-persona-v1",
        }),
        expect.objectContaining({
          path: "selection.locationId",
          source: "persona_fixture",
          sourceVersion: "onboarding-persona-v1",
        }),
        expect.objectContaining({
          path: "annualGrossSalaryCents",
          source: "user_entered",
          sourceVersion: "onboarding-v1",
        }),
        expect.objectContaining({
          path: "randomSeed",
          source: "user_entered",
          sourceVersion: "onboarding-v1",
        }),
      ]),
    );
  });

  it("records AI-assisted values as user-entered without a server-verifiable binding", () => {
    const review = prepareOnboardingReviewV1(
      completeDraft({
        sourceMode: "ai_assisted",
      }),
    );

    expect(review.status).toBe("ready");
    expect(review.provenance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "annualGrossSalaryCents",
          source: "user_entered",
          sourceVersion: "onboarding-v1",
        }),
        expect.objectContaining({
          path: "selection.locationId",
          source: "user_entered",
          sourceVersion: "onboarding-v1",
        }),
        expect.objectContaining({
          path: "birthMonth",
          source: "user_entered",
          sourceVersion: "onboarding-v1",
        }),
      ]),
    );
  });

  it("applies documented defaults and records versioned assumptions", () => {
    const review = prepareOnboardingReviewV1({
      version: ONBOARDING_V1_VERSION,
      sourceMode: "typed",
      birthMonth: "1995-01",
      randomSeed: "partial-input",
      grossIncome: {
        amountCents: 12_000_000,
        period: "annual",
        basis: "gross",
      },
      finances: { cashCents: 2_500_000 },
    });

    expect(review.status).toBe("ready");
    expect(review.normalized).toMatchObject({
      startMonth: "2026-07",
      runtimeDifficulty: "normal",
      selection: {
        locationId: "location.seattle",
        careerId: "career.software",
        scenarioId: "scenario.fresh_start",
      },
      finances: {
        taxableBroadIndexCents: 0,
        retirement401kCents: 0,
        revolvingCreditLimitCents: 1_000_000,
      },
    });
    expect(review.assumptions.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "DEFAULT_START_MONTH",
        "DEFAULT_CATALOG_VERSION",
        "DEFAULT_CATALOG_SELECTION",
        "DEFAULT_INSURANCE",
        "DEFAULT_RUNTIME_DIFFICULTY",
      ]),
    );
    expect(review.assumptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "selection.locationId",
          code: "DEFAULT_CATALOG_SELECTION",
        }),
        expect.objectContaining({
          path: "selection.catalogVersion",
          code: "DEFAULT_CATALOG_VERSION",
        }),
        expect.objectContaining({
          path: "selection.insuranceCoverageIds",
          code: "DEFAULT_INSURANCE",
        }),
      ]),
    );
    expect(review.assumptions).not.toContainEqual(
      expect.objectContaining({ code: "UNKNOWN_LOCATION_PRODUCT_DEFAULT" }),
    );
    expect(
      review.assumptions.every(
        ({ path, sourceId, sourceVersion }) =>
          path.length > 0 && sourceId.length > 0 && sourceVersion.length > 0,
      ),
    ).toBe(true);
  });

  it("records an explicit zero assumption for an omitted expense component", () => {
    const review = prepareOnboardingReviewV1(
      completeDraft({ discretionaryExpenses: undefined }),
    );

    expect(review.status).toBe("ready");
    expect(review.normalized?.declaredExpenses).toMatchObject({
      essentialAnnualCents: 2_400_000,
      discretionaryAnnualCents: 0,
    });
    expect(review.assumptions).toContainEqual(
      expect.objectContaining({
        path: "discretionaryExpenses",
        code: "DEFAULT_EXPENSE_ZERO",
      }),
    );
  });

  it("records declared-expense provenance against each actual input component", () => {
    const typed = prepareOnboardingReviewV1(completeDraft());
    const aiAssisted = prepareOnboardingReviewV1(
      completeDraft({
        sourceMode: "ai_assisted",
      }),
    );
    const personaEdited = prepareOnboardingReviewV1({
      ...onboardingDraftForPersonaV1("software", "persona-expenses-seed"),
      essentialExpenses: { amountCents: 250_000, period: "monthly" },
      discretionaryExpenses: { amountCents: 50_000, period: "monthly" },
    });

    expect(typed.provenance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "essentialExpenses",
          source: "user_entered",
        }),
        expect.objectContaining({
          path: "discretionaryExpenses",
          source: "user_entered",
        }),
      ]),
    );
    expect(aiAssisted.provenance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "essentialExpenses",
          source: "user_entered",
          sourceVersion: "onboarding-v1",
        }),
        expect.objectContaining({
          path: "discretionaryExpenses",
          source: "user_entered",
          sourceVersion: "onboarding-v1",
        }),
      ]),
    );
    expect(personaEdited.provenance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "essentialExpenses",
          source: "user_entered",
        }),
        expect.objectContaining({
          path: "discretionaryExpenses",
          source: "user_entered",
        }),
      ]),
    );
    expect(
      [...typed.provenance, ...aiAssisted.provenance, ...personaEdited.provenance]
        .some(({ path }) => path === "declaredExpenses"),
    ).toBe(false);
  });

  it("uses the pinned offline location fallback but rejects incompatible known selections", () => {
    const unknown = prepareOnboardingReviewV1(
      completeDraft({ locationId: "location.not-in-catalog" }),
    );
    expect(unknown.status).toBe("ready");
    expect(unknown.normalized?.selection.locationId).toBe("location.seattle");
    expect(unknown.assumptions).toContainEqual(
      expect.objectContaining({
        code: "UNKNOWN_LOCATION_PRODUCT_DEFAULT",
        sourceVersion: "onboarding-location-defaults-v1",
      }),
    );

    const incompatible = prepareOnboardingReviewV1(
      completeDraft({
        scenarioId: "scenario.established_household",
        householdId: "household.single",
      }),
    );
    expect(incompatible.status).toBe("invalid");
    expect(incompatible.issues).toContainEqual(
      expect.objectContaining({ code: "CATALOG_SELECTION_INVALID" }),
    );
  });

  it("rejects ambiguous or inconsistent asset allocations without inventing buckets", () => {
    const base = completeDraft();
    const ambiguous = prepareOnboardingReviewV1(
      completeDraft({
        finances: {
          ...base.finances,
          taxableBroadIndexCents: undefined,
          taxableSectorCents: undefined,
          taxableSpeculativeCents: undefined,
          taxableTotalCents: 1_250_000,
        },
      }),
    );
    expect(ambiguous.status).toBe("invalid");
    expect(ambiguous.issues).toContainEqual(
      expect.objectContaining({
        path: "finances.taxableTotalCents",
        code: "INVALID_ASSET_ALLOCATION",
      }),
    );

    const inconsistent = prepareOnboardingReviewV1(
      completeDraft({
        finances: { ...base.finances, retirementTotalCents: 9_999_999 },
      }),
    );
    expect(inconsistent.status).toBe("invalid");
    expect(inconsistent.issues).toContainEqual(
      expect.objectContaining({ code: "ASSET_TOTAL_MISMATCH" }),
    );
  });

  it("returns field-addressed debt, rate, credit, and HSA validation issues", () => {
    const base = completeDraft();
    const invalidDebt = prepareOnboardingReviewV1(
      completeDraft({
        finances: {
          ...base.finances,
          termDebts: [
            {
              id: "debt.same",
              kind: "student_loan",
              principalCents: -1,
              annualInterestRatePpm: 1_000_001,
              minimumPaymentCents: 0,
              remainingTermMonths: 0,
            },
            {
              id: "debt.same",
              kind: "student_loan",
              principalCents: 100_000,
              annualInterestRatePpm: 50_000,
              minimumPaymentCents: 10_000,
              remainingTermMonths: 12,
            },
          ],
          revolvingCreditLimitCents: 100_000,
          revolvingCreditUsedCents: 100_001,
        },
      }),
    );
    expect(invalidDebt.status).toBe("invalid");
    expect(invalidDebt.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "finances.termDebts.0.principalCents", code: "INVALID_DEBT" }),
        expect.objectContaining({ path: "finances.termDebts.0.annualInterestRatePpm", code: "INVALID_RATE" }),
        expect.objectContaining({ path: "finances.termDebts", code: "DUPLICATE_DEBT_ID" }),
        expect.objectContaining({ path: "finances.revolvingCreditUsedCents", code: "INVALID_CREDIT" }),
      ]),
    );

    const hsa = prepareOnboardingReviewV1(
      completeDraft({
        healthPlanId: "health.ppo_balanced",
        finances: { ...base.finances, hsaCents: 1 },
      }),
    );
    expect(hsa.status).toBe("invalid");
    expect(hsa.issues).toContainEqual(
      expect.objectContaining({ path: "finances.hsaCents", code: "HSA_INELIGIBLE" }),
    );
  });

  it("canonicalizes equivalent debt and coverage ordering", () => {
    const base = completeDraft();
    const debts = [
      {
        id: "debt.auto",
        kind: "auto_loan" as const,
        principalCents: 500_000,
        annualInterestRatePpm: 60_000,
        minimumPaymentCents: 20_000,
        remainingTermMonths: 36,
      },
      {
        id: "debt.student",
        kind: "student_loan" as const,
        principalCents: 1_000_000,
        annualInterestRatePpm: 55_000,
        minimumPaymentCents: 15_000,
        remainingTermMonths: 120,
      },
    ];
    const first = prepareOnboardingReviewV1(
      completeDraft({
        insuranceCoverageIds: [
          "insurance.renters",
          "insurance.short_term_disability",
        ],
        finances: { ...base.finances, termDebts: debts },
      }),
    );
    const second = prepareOnboardingReviewV1(
      completeDraft({
        insuranceCoverageIds: [
          "insurance.short_term_disability",
          "insurance.renters",
        ],
        finances: { ...base.finances, termDebts: [...debts].reverse() },
      }),
    );

    expect(first.status).toBe("ready");
    expect(second.status).toBe("ready");
    expect(first.reviewChecksum).toBe(second.reviewChecksum);
    expect(first.normalized?.finances.termDebts.map(({ id }) => id)).toEqual([
      "debt.auto",
      "debt.student",
    ]);
  });

  it("keeps localized copy outside the authoritative review checksum", () => {
    const review = prepareOnboardingReviewV1(
      completeDraft({ locationId: "location.not-in-catalog" }),
    );
    const checksum = review.reviewChecksum;
    const english = presentOnboardingReviewV1(review, "en-US");
    const unsupportedLocale = presentOnboardingReviewV1(review, "fr-CA");

    expect(english.localizationVersion).toBe("onboarding-en-US-v1");
    expect(unsupportedLocale).toEqual(english);
    expect(english.assumptions).toContainEqual(
      expect.objectContaining({
        code: "UNKNOWN_LOCATION_PRODUCT_DEFAULT",
        message: expect.any(String),
      }),
    );
    expect(review.reviewChecksum).toBe(checksum);
  });
});
