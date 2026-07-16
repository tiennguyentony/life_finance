import { US_2026_SCENARIO_CATALOG } from "../data/scenario-catalog";
import { sha256Canonical } from "./canonical";
import { moneyCents, ratePpm, type MoneyCents } from "./domain/money";
import { monthsBetween, simulationMonth } from "./domain/month";
import {
  FINANCIAL_GOAL_VERSION,
  projectFinancialGoal,
} from "./financial-goals-v2";
import {
  ENGINE_V2_VERSION,
  GAME_STATE_V2_SCHEMA_VERSION,
} from "./game-state-v2";
import { recordExposureSnapshotV2 } from "./exposure-v2";
import {
  createNativeGameStateV2,
  NativeGameStateV2Error,
} from "./native-game-state-v2";
import {
  ONBOARDING_DEFAULTS_V1_VERSION,
  ONBOARDING_LOCATION_DEFAULTS_V1_VERSION,
  ONBOARDING_V1_VERSION,
  type NormalizedOnboardingV1,
  type OnboardingAssumptionV1,
  type OnboardingDraftV1,
  type OnboardingFieldProvenanceV1,
  type OnboardingIssueCodeV1,
  type OnboardingIssueV1,
  type OnboardingReviewV1,
  type OnboardingTermDebtDraftV1,
  type PeriodizedMoneyV1,
  type ConfirmedOnboardingReviewV1,
  type OnboardedGameStateResultV1,
  type OnboardingInitializationEvidenceV1,
} from "./onboarding-v1-contracts";
import {
  ONBOARDING_PERSONAS_V1,
  ONBOARDING_PERSONA_V1_VERSION,
} from "./onboarding-personas-v1";
import { analyzeRiskV1, RISK_ANALYZER_V1_VERSION } from "./risk-v1";
import {
  resolveScenarioCatalogSelection,
  type ResolvedScenario,
  type ScenarioCatalog,
  type ScenarioCatalogSelection,
} from "./scenario-catalog";

export const ONBOARDING_DEFAULTS_V1 = deepFreeze({
  version: ONBOARDING_DEFAULTS_V1_VERSION,
  locationDefaultsVersion: ONBOARDING_LOCATION_DEFAULTS_V1_VERSION,
  catalogVersion: US_2026_SCENARIO_CATALOG.version,
  startMonth: "2026-07",
  locationId: "location.seattle",
  careerId: "career.software",
  householdId: "household.single",
  benefitsPackageId: "benefits.corporate_flex",
  healthPlanId: "health.hdhp_hsa",
  retirementPlanId: "retirement.401k_standard",
  insuranceCoverageIds: ["insurance.renters"] as const,
  scenarioId: "scenario.fresh_start",
  revolvingCreditLimitCents: 1_000_000,
  wellbeing: { burnoutPpm: 100_000, happinessPpm: 800_000 },
  runtimeDifficulty: "normal" as const,
} as const);

type MutableEvidence = {
  issues: OnboardingIssueV1[];
  assumptions: OnboardingAssumptionV1[];
  provenance: OnboardingFieldProvenanceV1[];
};

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function addIssue(
  evidence: MutableEvidence,
  path: string,
  code: OnboardingIssueCodeV1,
  severity: OnboardingIssueV1["severity"] = "invalid",
) {
  evidence.issues.push({ path, code, severity });
}

function addAssumption(
  evidence: MutableEvidence,
  path: string,
  code: OnboardingAssumptionV1["code"],
  sourceId: string = "onboarding.product-defaults",
  sourceVersion: string = ONBOARDING_DEFAULTS_V1_VERSION,
) {
  evidence.assumptions.push({ path, code, sourceId, sourceVersion });
}

function addProvenance(
  evidence: MutableEvidence,
  path: string,
  source: OnboardingFieldProvenanceV1["source"],
  sourceId: string = "onboarding.typed-input",
  sourceVersion: string = ONBOARDING_V1_VERSION,
) {
  evidence.provenance.push({ path, source, sourceId, sourceVersion });
}

function annualize(
  value: PeriodizedMoneyV1 | undefined,
  path: string,
  evidence: MutableEvidence,
): MoneyCents | null {
  if (value === undefined) return null;
  if (
    value === null ||
    typeof value !== "object" ||
    !Number.isSafeInteger(value.amountCents) ||
    value.amountCents < 0 ||
    (value.period !== "annual" && value.period !== "monthly")
  ) {
    addIssue(evidence, path, "INVALID_MONEY");
    return null;
  }
  const annual =
    value.period === "annual"
      ? BigInt(value.amountCents)
      : BigInt(value.amountCents) * BigInt(12);
  if (annual > BigInt(Number.MAX_SAFE_INTEGER)) {
    addIssue(evidence, path, "MONEY_OVERFLOW");
    return null;
  }
  return moneyCents(Number(annual));
}

function nonNegativeMoney(
  value: unknown,
  path: string,
  evidence: MutableEvidence,
  fallback = 0,
): MoneyCents {
  const selected = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(selected) || (selected as number) < 0) {
    addIssue(evidence, path, "INVALID_MONEY");
    return moneyCents(0);
  }
  return moneyCents(selected as number);
}

const DEBT_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const DEBT_KINDS = new Set([
  "mortgage",
  "student_loan",
  "auto_loan",
  "personal_loan",
]);

function normalizeTermDebts(
  values: readonly OnboardingTermDebtDraftV1[] | undefined,
  evidence: MutableEvidence,
) {
  if (values !== undefined && !Array.isArray(values)) {
    addIssue(evidence, "finances.termDebts", "INVALID_DEBT");
    return [];
  }
  const seen = new Set<string>();
  return (values ?? [])
    .map((debt, index) => {
      const path = `finances.termDebts.${index}`;
      const idValid = typeof debt?.id === "string" && DEBT_ID.test(debt.id);
      if (!idValid || !DEBT_KINDS.has(debt?.kind)) {
        addIssue(evidence, path, "INVALID_DEBT");
      }
      if (idValid && seen.has(debt.id)) {
        addIssue(evidence, "finances.termDebts", "DUPLICATE_DEBT_ID");
      }
      if (idValid) seen.add(debt.id);
      const principalValid =
        Number.isSafeInteger(debt?.principalCents) && debt.principalCents > 0;
      if (!principalValid) {
        addIssue(evidence, `${path}.principalCents`, "INVALID_DEBT");
      }
      const rateValid =
        Number.isSafeInteger(debt?.annualInterestRatePpm) &&
        debt.annualInterestRatePpm >= 0 &&
        debt.annualInterestRatePpm <= 1_000_000;
      if (!rateValid) {
        addIssue(evidence, `${path}.annualInterestRatePpm`, "INVALID_RATE");
      }
      const paymentValid =
        Number.isSafeInteger(debt?.minimumPaymentCents) &&
        debt.minimumPaymentCents > 0 &&
        principalValid &&
        debt.minimumPaymentCents <= debt.principalCents;
      if (!paymentValid) {
        addIssue(evidence, `${path}.minimumPaymentCents`, "INVALID_DEBT");
      }
      const termValid =
        Number.isSafeInteger(debt?.remainingTermMonths) &&
        debt.remainingTermMonths >= 1 &&
        debt.remainingTermMonths <= 1_200;
      if (!termValid) {
        addIssue(evidence, `${path}.remainingTermMonths`, "INVALID_DEBT");
      }
      return {
        id: idValid ? debt.id : `invalid-debt-${index}`,
        kind: DEBT_KINDS.has(debt?.kind) ? debt.kind : "personal_loan",
        principalCents: moneyCents(principalValid ? debt.principalCents : 0),
        annualInterestRatePpm: ratePpm(
          rateValid ? debt.annualInterestRatePpm : 0,
        ),
        minimumPaymentCents: moneyCents(
          paymentValid ? debt.minimumPaymentCents : 0,
        ),
        remainingTermMonths: termValid ? debt.remainingTermMonths : 1,
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function selectionFromDraft(
  draft: OnboardingDraftV1,
  catalog: ScenarioCatalog,
  evidence: MutableEvidence,
  addSuppliedProvenance: (normalizedPath: string, draftPath: string) => void,
): ScenarioCatalogSelection {
  const locationSupplied = draft.locationId !== undefined;
  const locationKnown =
    locationSupplied &&
    catalog.locations.some(({ id }) => id === draft.locationId);
  const locationId = locationKnown
    ? draft.locationId!
    : ONBOARDING_DEFAULTS_V1.locationId;
  if (!locationSupplied) {
    addAssumption(
      evidence,
      "selection.locationId",
      "DEFAULT_CATALOG_SELECTION",
      "location.seattle",
      ONBOARDING_LOCATION_DEFAULTS_V1_VERSION,
    );
  } else if (!locationKnown) {
    addAssumption(
      evidence,
      "selection.locationId",
      "UNKNOWN_LOCATION_PRODUCT_DEFAULT",
      "location.seattle",
      ONBOARDING_LOCATION_DEFAULTS_V1_VERSION,
    );
  }
  const selection: ScenarioCatalogSelection = {
    catalogVersion:
      draft.catalogVersion ?? ONBOARDING_DEFAULTS_V1.catalogVersion,
    locationId,
    careerId: draft.careerId ?? ONBOARDING_DEFAULTS_V1.careerId,
    householdId: draft.householdId ?? ONBOARDING_DEFAULTS_V1.householdId,
    benefitsPackageId:
      draft.benefitsPackageId ?? ONBOARDING_DEFAULTS_V1.benefitsPackageId,
    healthPlanId:
      draft.healthPlanId === undefined
        ? ONBOARDING_DEFAULTS_V1.healthPlanId
        : draft.healthPlanId,
    retirementPlanId:
      draft.retirementPlanId ?? ONBOARDING_DEFAULTS_V1.retirementPlanId,
    insuranceCoverageIds: [
      ...(draft.insuranceCoverageIds ??
        ONBOARDING_DEFAULTS_V1.insuranceCoverageIds),
    ].sort(),
    scenarioId: draft.scenarioId ?? ONBOARDING_DEFAULTS_V1.scenarioId,
  };
  for (const [path, supplied] of Object.entries({
    catalogVersion: draft.catalogVersion,
    careerId: draft.careerId,
    householdId: draft.householdId,
    benefitsPackageId: draft.benefitsPackageId,
    healthPlanId: draft.healthPlanId,
    retirementPlanId: draft.retirementPlanId,
    insuranceCoverageIds: draft.insuranceCoverageIds,
    scenarioId: draft.scenarioId,
  })) {
    if (supplied === undefined) {
      const assumptionCode =
        path === "catalogVersion"
          ? "DEFAULT_CATALOG_VERSION"
          : path === "insuranceCoverageIds"
            ? "DEFAULT_INSURANCE"
            : "DEFAULT_CATALOG_SELECTION";
      addAssumption(
        evidence,
        `selection.${path}`,
        assumptionCode,
        catalog.id,
        catalog.version,
      );
      addProvenance(
        evidence,
        `selection.${path}`,
        "catalog_default",
        catalog.id,
        catalog.version,
      );
    } else {
      addSuppliedProvenance(`selection.${path}`, path);
    }
  }
  if (locationKnown) {
    addSuppliedProvenance("selection.locationId", "locationId");
  } else {
    addProvenance(
      evidence,
      "selection.locationId",
      "product_default",
      "location.seattle",
      ONBOARDING_LOCATION_DEFAULTS_V1_VERSION,
    );
  }
  return selection;
}

function resolveSelection(
  catalog: ScenarioCatalog,
  selection: ScenarioCatalogSelection,
  evidence: MutableEvidence,
): ResolvedScenario | null {
  try {
    return resolveScenarioCatalogSelection(catalog, selection);
  } catch {
    addIssue(evidence, "selection", "CATALOG_SELECTION_INVALID");
    return null;
  }
}

function canonicalEvidence<T extends { path: string; code?: string }>(
  values: readonly T[],
): readonly T[] {
  return [...values].sort((left, right) => {
    const byPath = left.path.localeCompare(right.path);
    return byPath || (left.code ?? "").localeCompare(right.code ?? "");
  });
}

function draftValueAtPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (current === null || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    return (current as Readonly<Record<string, unknown>>)[segment];
  }, value);
}

function sameDraftValue(left: unknown, right: unknown, path: string): boolean {
  if (left === undefined || right === undefined) return left === right;
  const normalize = (candidate: unknown) =>
    path === "insuranceCoverageIds" && Array.isArray(candidate)
      ? [...candidate].sort()
      : candidate;
  return sha256Canonical(normalize(left)) === sha256Canonical(normalize(right));
}

export function calculateOnboardingReviewChecksumV1(
  review: Omit<OnboardingReviewV1, "reviewChecksum">,
) {
  return sha256Canonical({
    version: review.version,
    defaultsVersion: review.defaultsVersion,
    locationDefaultsVersion: review.locationDefaultsVersion,
    status: review.status,
    normalized: review.normalized,
    issues: review.issues,
    assumptions: review.assumptions,
    provenance: review.provenance,
    preview: review.preview,
  });
}

export function prepareOnboardingReviewV1(
  draft: OnboardingDraftV1,
  dependencies: Readonly<{ catalog?: ScenarioCatalog }> = {},
): OnboardingReviewV1 {
  const catalog = dependencies.catalog ?? US_2026_SCENARIO_CATALOG;
  const evidence: MutableEvidence = { issues: [], assumptions: [], provenance: [] };
  if (draft === null || typeof draft !== "object" || Array.isArray(draft)) {
    addIssue(evidence, "draft", "INVALID_DRAFT");
  } else if (draft.version !== ONBOARDING_V1_VERSION) {
    addIssue(evidence, "version", "UNSUPPORTED_ONBOARDING_VERSION");
  }
  const personaFixture =
    (draft?.sourceMode === "persona" || draft?.sourceMode === "ai_assisted") &&
    typeof draft.personaId === "string" &&
    draft.personaId in ONBOARDING_PERSONAS_V1
      ? ONBOARDING_PERSONAS_V1[
          draft.personaId as keyof typeof ONBOARDING_PERSONAS_V1
        ]
      : null;
  if (draft?.sourceMode === "persona" && personaFixture === null) {
    addIssue(evidence, "personaId", "INVALID_DRAFT");
  } else if (personaFixture !== null) {
    addProvenance(
      evidence,
      "persona",
      "persona_fixture",
      personaFixture.personaId,
      ONBOARDING_PERSONA_V1_VERSION,
    );
  }
  const addSuppliedProvenance = (normalizedPath: string, draftPath = normalizedPath) => {
    const suppliedValue = draftValueAtPath(draft, draftPath);
    const fixtureValue = draftValueAtPath(personaFixture, draftPath);
    if (
      personaFixture !== null &&
      sameDraftValue(suppliedValue, fixtureValue, draftPath)
    ) {
      addProvenance(
        evidence,
        normalizedPath,
        "persona_fixture",
        personaFixture.personaId,
        ONBOARDING_PERSONA_V1_VERSION,
      );
      return;
    }
    addProvenance(
      evidence,
      normalizedPath,
      "user_entered",
      "onboarding.typed-input",
      ONBOARDING_V1_VERSION,
    );
  };

  let startMonth = simulationMonth(ONBOARDING_DEFAULTS_V1.startMonth);
  let startMonthValid = true;
  if (draft?.startMonth === undefined) {
    addAssumption(evidence, "startMonth", "DEFAULT_START_MONTH");
    addProvenance(evidence, "startMonth", "product_default");
  } else {
    try {
      startMonth = simulationMonth(draft.startMonth);
      addSuppliedProvenance("startMonth");
    } catch {
      startMonthValid = false;
      addIssue(evidence, "startMonth", "INVALID_MONTH");
    }
  }

  let birthMonth = startMonth;
  let birthMonthValid = false;
  if (typeof draft?.birthMonth !== "string") {
    addIssue(evidence, "birthMonth", "BIRTH_MONTH_REQUIRED", "needs_input");
  } else {
    try {
      birthMonth = simulationMonth(draft.birthMonth);
      birthMonthValid = true;
      addSuppliedProvenance("birthMonth");
    } catch {
      addIssue(evidence, "birthMonth", "INVALID_MONTH");
    }
  }
  if (startMonthValid && birthMonthValid) {
    const startingAgeYears = Math.floor(monthsBetween(birthMonth, startMonth) / 12);
    if (startingAgeYears < 18 || startingAgeYears > 80) {
      addIssue(evidence, "birthMonth", "AGE_OUT_OF_RANGE");
    }
  }

  const randomSeed = draft?.randomSeed;
  if (randomSeed === undefined) {
    addIssue(evidence, "randomSeed", "RANDOM_SEED_REQUIRED", "needs_input");
  } else if (
    typeof randomSeed !== "string" ||
    randomSeed.length < 1 ||
    randomSeed.length > 256
  ) {
    addIssue(evidence, "randomSeed", "INVALID_RANDOM_SEED");
  } else {
    addSuppliedProvenance("randomSeed");
  }

  const gross = annualize(draft?.grossIncome, "grossIncome", evidence);
  if (draft?.grossIncome === undefined) {
    addIssue(evidence, "grossIncome", "GROSS_INCOME_REQUIRED", "needs_input");
  } else if (draft.grossIncome.basis !== "gross") {
    addIssue(evidence, "grossIncome.basis", "INVALID_INCOME_BASIS");
  } else {
    addSuppliedProvenance("annualGrossSalaryCents", "grossIncome");
  }
  const takeHome = annualize(
    draft?.takeHomeIncome,
    "takeHomeIncome",
    evidence,
  );
  if (draft?.takeHomeIncome !== undefined) {
    if (draft.takeHomeIncome.basis !== "take_home") {
      addIssue(evidence, "takeHomeIncome.basis", "INVALID_INCOME_BASIS");
    } else {
      addAssumption(evidence, "annualTakeHomeEvidenceCents", "TAKE_HOME_DISPLAY_ONLY");
      addSuppliedProvenance("annualTakeHomeEvidenceCents", "takeHomeIncome");
    }
  }
  if (
    gross !== null &&
    takeHome !== null &&
    draft?.grossIncome?.basis === "gross" &&
    draft.takeHomeIncome?.basis === "take_home" &&
    takeHome > gross
  ) {
    addIssue(evidence, "takeHomeIncome", "TAKE_HOME_EXCEEDS_GROSS");
  }

  const essential = annualize(
    draft?.essentialExpenses,
    "essentialExpenses",
    evidence,
  );
  const discretionary = annualize(
    draft?.discretionaryExpenses,
    "discretionaryExpenses",
    evidence,
  );
  const declaredExpenseTotal = BigInt(essential ?? 0) + BigInt(discretionary ?? 0);
  if (declaredExpenseTotal > BigInt(Number.MAX_SAFE_INTEGER)) {
    addIssue(evidence, "declaredExpenses", "MONEY_OVERFLOW");
  }
  const declaredExpenses =
    essential === null && discretionary === null
      ? null
      : {
          essentialAnnualCents: essential ?? moneyCents(0),
          discretionaryAnnualCents: discretionary ?? moneyCents(0),
          totalAnnualCents: moneyCents(
            declaredExpenseTotal > BigInt(Number.MAX_SAFE_INTEGER)
              ? 0
              : Number(declaredExpenseTotal),
          ),
        };
  if (declaredExpenses !== null) {
    for (const path of ["essentialExpenses", "discretionaryExpenses"] as const) {
      if (draft?.[path] === undefined) {
        addAssumption(evidence, path, "DEFAULT_EXPENSE_ZERO");
        addProvenance(evidence, path, "product_default");
      } else {
        addSuppliedProvenance(path);
      }
    }
    addAssumption(
      evidence,
      "declaredExpenses",
      "DECLARED_EXPENSES_AUTHORITATIVE",
    );
  } else {
    addAssumption(
      evidence,
      "declaredExpenses",
      "DEFAULT_CATALOG_LIVING_COST",
      catalog.id,
      catalog.version,
    );
    addProvenance(
      evidence,
      "declaredExpenses",
      "catalog_default",
      catalog.id,
      catalog.version,
    );
  }

  const selection = selectionFromDraft(
    draft ?? ({} as OnboardingDraftV1),
    catalog,
    evidence,
    addSuppliedProvenance,
  );
  const resolved = resolveSelection(catalog, selection, evidence);
  const financeDraft = draft?.finances;
  const cashDefault = resolved?.snapshot.selected.scenario.minimumStartingCashCents ?? 0;
  const cashCents = nonNegativeMoney(
    financeDraft?.cashCents,
    "finances.cashCents",
    evidence,
    cashDefault,
  );
  if (financeDraft?.cashCents === undefined) {
    addAssumption(evidence, "finances.cashCents", "DEFAULT_STARTING_CASH");
    addProvenance(evidence, "finances.cashCents", "catalog_default", catalog.id, catalog.version);
  } else {
    addSuppliedProvenance("finances.cashCents");
  }
  const taxableBroadIndexCents = nonNegativeMoney(
    financeDraft?.taxableBroadIndexCents,
    "finances.taxableBroadIndexCents",
    evidence,
  );
  const taxableSectorCents = nonNegativeMoney(
    financeDraft?.taxableSectorCents,
    "finances.taxableSectorCents",
    evidence,
  );
  const taxableSpeculativeCents = nonNegativeMoney(
    financeDraft?.taxableSpeculativeCents,
    "finances.taxableSpeculativeCents",
    evidence,
  );
  const retirement401kCents = nonNegativeMoney(
    financeDraft?.retirement401kCents,
    "finances.retirement401kCents",
    evidence,
  );
  const retirementIraCents = nonNegativeMoney(
    financeDraft?.retirementIraCents,
    "finances.retirementIraCents",
    evidence,
  );
  const finances = {
    cashCents,
    taxableBroadIndexCents,
    taxableSectorCents,
    taxableSpeculativeCents,
    retirement401kCents,
    retirementIraCents,
    hsaCents: nonNegativeMoney(financeDraft?.hsaCents, "finances.hsaCents", evidence),
    homeValueCents: nonNegativeMoney(
      financeDraft?.homeValueCents,
      "finances.homeValueCents",
      evidence,
    ),
    otherAssetsCents: nonNegativeMoney(
      financeDraft?.otherAssetsCents,
      "finances.otherAssetsCents",
      evidence,
    ),
    termDebts: normalizeTermDebts(financeDraft?.termDebts, evidence),
    revolvingCreditLimitCents: nonNegativeMoney(
      financeDraft?.revolvingCreditLimitCents,
      "finances.revolvingCreditLimitCents",
      evidence,
      ONBOARDING_DEFAULTS_V1.revolvingCreditLimitCents,
    ),
    revolvingCreditUsedCents: nonNegativeMoney(
      financeDraft?.revolvingCreditUsedCents,
      "finances.revolvingCreditUsedCents",
      evidence,
    ),
  };

  for (const path of [
    "taxableBroadIndexCents",
    "taxableSectorCents",
    "taxableSpeculativeCents",
    "retirement401kCents",
    "retirementIraCents",
    "hsaCents",
    "homeValueCents",
    "otherAssetsCents",
    "termDebts",
    "revolvingCreditUsedCents",
  ] as const) {
    if (financeDraft?.[path] === undefined) {
      addAssumption(evidence, `finances.${path}`, "DEFAULT_FINANCE_ZERO");
      addProvenance(evidence, `finances.${path}`, "product_default");
    } else {
      addSuppliedProvenance(`finances.${path}`);
    }
  }
  if (financeDraft?.revolvingCreditLimitCents === undefined) {
    addAssumption(evidence, "finances.revolvingCreditLimitCents", "DEFAULT_CREDIT_LIMIT");
    addProvenance(evidence, "finances.revolvingCreditLimitCents", "product_default");
  } else {
    addSuppliedProvenance("finances.revolvingCreditLimitCents");
  }

  if (financeDraft?.taxableTotalCents !== undefined) {
    const complete = [
      financeDraft.taxableBroadIndexCents,
      financeDraft.taxableSectorCents,
      financeDraft.taxableSpeculativeCents,
    ].every((value) => value !== undefined);
    const actual = taxableBroadIndexCents + taxableSectorCents + taxableSpeculativeCents;
    if (!complete) {
      addIssue(evidence, "finances.taxableTotalCents", "INVALID_ASSET_ALLOCATION");
    } else if (actual !== financeDraft.taxableTotalCents) {
      addIssue(evidence, "finances.taxableTotalCents", "ASSET_TOTAL_MISMATCH");
    }
  }
  if (financeDraft?.retirementTotalCents !== undefined) {
    const complete = [
      financeDraft.retirement401kCents,
      financeDraft.retirementIraCents,
    ].every((value) => value !== undefined);
    const actual = retirement401kCents + retirementIraCents;
    if (!complete) {
      addIssue(evidence, "finances.retirementTotalCents", "INVALID_ASSET_ALLOCATION");
    } else if (actual !== financeDraft.retirementTotalCents) {
      addIssue(evidence, "finances.retirementTotalCents", "ASSET_TOTAL_MISMATCH");
    }
  }
  if (finances.revolvingCreditUsedCents > finances.revolvingCreditLimitCents) {
    addIssue(evidence, "finances.revolvingCreditUsedCents", "INVALID_CREDIT");
  }
  if (
    finances.hsaCents > 0 &&
    resolved?.snapshot.selected.healthPlan?.hsaEligible !== true
  ) {
    addIssue(evidence, "finances.hsaCents", "HSA_INELIGIBLE");
  }

  const runtimeDifficulty = ["guided", "normal", "hard"].includes(
    draft?.runtimeDifficulty ?? "",
  )
    ? draft!.runtimeDifficulty!
    : ONBOARDING_DEFAULTS_V1.runtimeDifficulty;
  if (draft?.runtimeDifficulty === undefined) {
    addAssumption(evidence, "runtimeDifficulty", "DEFAULT_RUNTIME_DIFFICULTY");
    addProvenance(evidence, "runtimeDifficulty", "product_default");
  } else if (!["guided", "normal", "hard"].includes(draft.runtimeDifficulty)) {
    addIssue(evidence, "runtimeDifficulty", "INVALID_RUNTIME_DIFFICULTY");
  } else {
    addSuppliedProvenance("runtimeDifficulty");
  }
  const wellbeingValid =
    draft?.wellbeing !== undefined &&
    Number.isSafeInteger(draft.wellbeing.burnoutPpm) &&
    draft.wellbeing.burnoutPpm >= 0 &&
    draft.wellbeing.burnoutPpm <= 1_000_000 &&
    Number.isSafeInteger(draft.wellbeing.happinessPpm) &&
    draft.wellbeing.happinessPpm >= 0 &&
    draft.wellbeing.happinessPpm <= 1_000_000;
  const wellbeing = wellbeingValid ? draft!.wellbeing! : {
    burnoutPpm: ratePpm(ONBOARDING_DEFAULTS_V1.wellbeing.burnoutPpm),
    happinessPpm: ratePpm(ONBOARDING_DEFAULTS_V1.wellbeing.happinessPpm),
  };
  if (draft?.wellbeing === undefined) {
    addAssumption(evidence, "wellbeing", "DEFAULT_WELLBEING");
    addProvenance(evidence, "wellbeing", "product_default");
  } else if (!wellbeingValid) {
    addIssue(evidence, "wellbeing", "INVALID_WELLBEING");
  } else {
    addSuppliedProvenance("wellbeing");
  }
  if (draft?.financialGoal === undefined) {
    addAssumption(evidence, "financialGoal", "DEFAULT_FINANCIAL_GOAL");
    addProvenance(evidence, "financialGoal", "product_default");
  } else {
    addSuppliedProvenance("financialGoal");
  }
  if (
    draft?.marketRegime !== undefined &&
    !["expansion", "inflation", "recession", "recovery"].includes(
      draft.marketRegime,
    )
  ) {
    addIssue(evidence, "marketRegime", "INVALID_MARKET_REGIME");
  } else if (draft?.marketRegime !== undefined) {
    addSuppliedProvenance("marketRegime");
  }

  let normalized: NormalizedOnboardingV1 | null = null;
  let preview: OnboardingReviewV1["preview"] = null;
  if (
    evidence.issues.length === 0 &&
    resolved !== null &&
    gross !== null &&
    typeof randomSeed === "string"
  ) {
    normalized = {
      version: ONBOARDING_V1_VERSION,
      schemaVersion: 2,
      sourceMode: draft.sourceMode,
      persona:
        personaFixture === null
          ? null
          : {
              id: personaFixture.personaId!,
              version: ONBOARDING_PERSONA_V1_VERSION,
            },
      startMonth,
      birthMonth,
      randomSeed,
      runtimeDifficulty,
      selection,
      annualGrossSalaryCents: gross,
      annualTakeHomeEvidenceCents: takeHome,
      declaredExpenses,
      finances,
      ...(draft.financialGoal === undefined
        ? {}
        : { financialGoal: draft.financialGoal }),
      wellbeing,
      ...(draft.marketRegime === undefined
        ? {}
        : { marketRegime: draft.marketRegime }),
    };
    try {
      const state = createNativeGameStateV2({
        runId: "run.onboarding-review",
        playerId: "player.onboarding-review",
        birthMonth,
        startMonth,
        randomSeed,
        resolvedScenario: resolved,
        annualGrossSalaryCents: gross,
        ...(declaredExpenses === null
          ? {}
          : { annualLivingCostCents: declaredExpenses.totalAnnualCents }),
        ...(draft.financialGoal === undefined
          ? {}
          : { financialGoal: draft.financialGoal }),
        runtimeBalanceDifficulty: runtimeDifficulty,
        finances,
        wellbeing,
        ...(draft.marketRegime === undefined
          ? {}
          : { marketRegime: draft.marketRegime }),
      });
      const goal = projectFinancialGoal(
        state.finances,
        state.gameplay.financialGoal,
      );
      const ownerFinancialGoal = state.gameplay.financialGoal;
      if (ownerFinancialGoal === undefined) {
        throw new Error("native state did not provide its financial-goal owner value");
      }
      const risk = analyzeRiskV1(state);
      preview = {
        owners: {
          stateAndObligations: "createNativeGameStateV2",
          financialGoal: "projectFinancialGoal",
          risk: "analyzeRiskV1",
        },
        ownerVersions: {
          stateAndObligations: ENGINE_V2_VERSION,
          stateSchema: GAME_STATE_V2_SCHEMA_VERSION,
          financialGoal: FINANCIAL_GOAL_VERSION,
          risk: RISK_ANALYZER_V1_VERSION,
        },
        catalogAnnualLivingCostCents:
          resolved.snapshot.derived.annualLivingCostCents,
        declaredAnnualExpensesCents:
          declaredExpenses?.totalAnnualCents ?? null,
        employerMatchTiers:
          resolved.snapshot.selected.retirementPlan.employerMatchTiers,
        requiredMonthlyObligationsCents:
          state.finances.requiredObligationsCents,
        financialGoal: ownerFinancialGoal,
        financialGoalTargetCents: goal.targetCents,
        financialGoalProgressPpm: goal.progressPpm,
        aggregateRiskSeverityPpm: risk.aggregateSeverityPpm,
        riskWeaknessTags: risk.weaknessTags,
      };
    } catch (error) {
      let path = "normalized";
      let code: OnboardingIssueCodeV1 = "SCENARIO_CONSTRAINT";
      if (error instanceof NativeGameStateV2Error) {
        switch (error.code) {
          case "SALARY_OUT_OF_RANGE":
            path = "grossIncome";
            code = "SALARY_OUT_OF_RANGE";
            break;
          case "STARTING_CASH_OUT_OF_RANGE":
            path = "finances.cashCents";
            break;
          case "HSA_INELIGIBLE":
            path = "finances.hsaCents";
            code = "HSA_INELIGIBLE";
            break;
          case "INVALID_OPENING_DEBT":
            path = "finances.termDebts";
            code = "INVALID_DEBT";
            break;
          case "INVALID_FINANCIAL_GOAL":
            path = error.message.includes("target age")
              ? "financialGoal.targetAgeYears"
              : "financialGoal";
            code = "INVALID_FINANCIAL_GOAL";
            break;
          case "CATALOG_CHECKSUM_MISMATCH":
          case "SCENARIO_CONSTRAINT":
            path = "selection";
            break;
        }
      }
      addIssue(evidence, path, code);
      normalized = null;
    }
  }

  const issues = canonicalEvidence(evidence.issues);
  const assumptions = canonicalEvidence(evidence.assumptions);
  const provenance = [...evidence.provenance].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
  const status = issues.some(({ severity }) => severity === "needs_input")
    ? "needs_input"
    : issues.length > 0
      ? "invalid"
      : "ready";
  if (status !== "ready") {
    normalized = null;
    preview = null;
  }
  const withoutChecksum = {
    version: ONBOARDING_V1_VERSION,
    defaultsVersion: ONBOARDING_DEFAULTS_V1_VERSION,
    locationDefaultsVersion: ONBOARDING_LOCATION_DEFAULTS_V1_VERSION,
    status,
    normalized,
    issues,
    assumptions,
    provenance,
    preview,
  } satisfies Omit<OnboardingReviewV1, "reviewChecksum">;
  return deepFreeze({
    ...withoutChecksum,
    reviewChecksum: calculateOnboardingReviewChecksumV1(withoutChecksum),
  }) as OnboardingReviewV1;
}

export class OnboardingConstructionErrorV1 extends Error {
  readonly code: "REVIEW_NOT_READY" | "STALE_REVIEW";

  constructor(code: OnboardingConstructionErrorV1["code"], message: string) {
    super(message);
    this.name = "OnboardingConstructionErrorV1";
    this.code = code;
  }
}

export function constructOnboardedGameStateV1(
  confirmed: ConfirmedOnboardingReviewV1,
  identity: Readonly<{ runId: string; playerId: string }>,
  dependencies: Readonly<{ catalog?: ScenarioCatalog }> = {},
): OnboardedGameStateResultV1 {
  const review = confirmed.review;
  const recomputedChecksum = calculateOnboardingReviewChecksumV1(review);
  if (
    confirmed.confirmed !== true ||
    confirmed.reviewChecksum !== review.reviewChecksum ||
    recomputedChecksum !== review.reviewChecksum
  ) {
    throw new OnboardingConstructionErrorV1(
      "STALE_REVIEW",
      "stale onboarding review must be reviewed and confirmed again",
    );
  }
  if (review.status !== "ready" || review.normalized === null) {
    throw new OnboardingConstructionErrorV1(
      "REVIEW_NOT_READY",
      "onboarding review must be ready before state construction",
    );
  }

  const normalized = review.normalized;
  const catalog = dependencies.catalog ?? US_2026_SCENARIO_CATALOG;
  const resolvedScenario = resolveScenarioCatalogSelection(
    catalog,
    normalized.selection,
  );
  const evidence: OnboardingInitializationEvidenceV1 = {
    version: ONBOARDING_V1_VERSION,
    schemaVersion: 2,
    sourceMode: normalized.sourceMode,
    persona: normalized.persona,
    defaultsVersion: ONBOARDING_DEFAULTS_V1_VERSION,
    locationDefaultsVersion: ONBOARDING_LOCATION_DEFAULTS_V1_VERSION,
    reviewChecksum: review.reviewChecksum,
    normalizedInputChecksum: sha256Canonical(normalized),
    initialRandomSeed: normalized.randomSeed,
    confirmed: true,
    declaredExpenses: normalized.declaredExpenses,
    assumptions: review.assumptions,
    provenance: review.provenance,
    derivedOwners: {
      stateAndObligations: "createNativeGameStateV2",
      financialGoal: "projectFinancialGoal",
      exposure: "recordExposureSnapshotV2",
    },
  };
  const native = createNativeGameStateV2({
    runId: identity.runId,
    playerId: identity.playerId,
    birthMonth: normalized.birthMonth,
    startMonth: normalized.startMonth,
    randomSeed: normalized.randomSeed,
    resolvedScenario,
    annualGrossSalaryCents: normalized.annualGrossSalaryCents,
    ...(normalized.declaredExpenses === null
      ? {}
      : {
          annualLivingCostCents:
            normalized.declaredExpenses.totalAnnualCents,
        }),
    initialization: evidence,
    ...(normalized.financialGoal === undefined
      ? {}
      : { financialGoal: normalized.financialGoal }),
    runtimeBalanceDifficulty: normalized.runtimeDifficulty,
    finances: normalized.finances,
    wellbeing: normalized.wellbeing,
    ...(normalized.marketRegime === undefined
      ? {}
      : { marketRegime: normalized.marketRegime }),
  });
  const state = recordExposureSnapshotV2(native, normalized.startMonth);
  return Object.freeze({
    state,
    stateChecksum: sha256Canonical(state),
    evidence: state.gameplay.initialization!,
  });
}
