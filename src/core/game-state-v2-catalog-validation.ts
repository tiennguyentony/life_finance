import { sha256Canonical } from "./canonical";
import type { StateInvariantViolation } from "./game-state";
import type {
  GameStateV2,
  VersionedCatalogSelection,
} from "./game-state-v2";

function violation(
  path: string,
  code: string,
  message: string,
): StateInvariantViolation {
  return { path, code, message };
}

function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validateMoneyRecord(
  values: Readonly<Record<string, number>>,
  prefix: string,
  violations: StateInvariantViolation[],
): void {
  for (const [key, value] of Object.entries(values)) {
    if (!isNonNegativeSafeInteger(value)) {
      violations.push(
        violation(
          `${prefix}.${key}`,
          "invalid_money",
          "must be a non-negative safe integer number of cents",
        ),
      );
    }
  }
}

export function validateCatalogAndBenefitsStateV2(
  state: GameStateV2,
): readonly StateInvariantViolation[] {
  const violations: StateInvariantViolation[] = [];

  const catalogRefs = Object.values(state.gameplay.catalogs);
  if (catalogRefs.some(({ id, version }) => id.length === 0 || version.length === 0)) {
    violations.push(
      violation("gameplay.catalogs", "invalid_catalog_ref", "catalog ids and versions must not be empty"),
    );
  }
  const catalogSnapshot = state.gameplay.catalogSnapshot;
  if ((catalogSnapshot === null) !== (state.gameplay.catalogSnapshotChecksum === null)) {
    violations.push(
      violation(
        "gameplay.catalogSnapshot",
        "incomplete_catalog_snapshot",
        "catalog snapshot and checksum must both be present or absent",
      ),
    );
  }
  if (
    (catalogSnapshot === null && state.migration === null) ||
    (catalogSnapshot !== null && state.migration !== null)
  ) {
    violations.push(
      violation(
        "migration",
        "invalid_v2_provenance",
        "v2 state must be either a journaled v1 migration or a native catalog snapshot",
      ),
    );
  }
  if (catalogSnapshot !== null && state.gameplay.catalogSnapshotChecksum !== null) {
    if (sha256Canonical(catalogSnapshot) !== state.gameplay.catalogSnapshotChecksum) {
      violations.push(
        violation(
          "gameplay.catalogSnapshotChecksum",
          "catalog_checksum_mismatch",
          "must match the canonical resolved catalog snapshot",
        ),
      );
    }
    const snapshotRefs = {
      location: catalogSnapshot.selected.location.id,
      career: catalogSnapshot.selected.career.id,
      household: catalogSnapshot.selected.household.id,
      benefits: catalogSnapshot.selected.benefitsPackage.id,
      scenario: catalogSnapshot.selected.scenario.id,
    };
    for (const [kind, id] of Object.entries(snapshotRefs)) {
      const ref = state.gameplay.catalogs[kind as keyof VersionedCatalogSelection];
      if (ref.id !== id || ref.version !== catalogSnapshot.catalog.version) {
        violations.push(
          violation(
            `gameplay.catalogs.${kind}`,
            "catalog_snapshot_mismatch",
            "catalog reference must match the resolved snapshot",
          ),
        );
      }
    }
  }
  const employment = state.gameplay.employment;
  if (employment.status === "legacy_unknown") {
    if (
      employment.annualGrossSalaryCents !== null ||
      employment.careerId !== null ||
      employment.sectorId !== null ||
      catalogSnapshot !== null
    ) {
      violations.push(
        violation(
          "gameplay.employment",
          "ambiguous_legacy_employment",
          "legacy employment cannot claim cataloged salary or job data",
        ),
      );
    }
  } else if (
    !isNonNegativeSafeInteger(employment.annualGrossSalaryCents) ||
    employment.annualGrossSalaryCents === 0 ||
    catalogSnapshot === null ||
    employment.careerId !== catalogSnapshot.selected.career.id ||
    employment.sectorId !== catalogSnapshot.selected.sector.id ||
    employment.annualGrossSalaryCents <
      catalogSnapshot.derived.annualSalaryMinimumCents ||
    employment.annualGrossSalaryCents >
      catalogSnapshot.derived.annualSalaryMaximumCents
  ) {
    violations.push(
      violation(
        "gameplay.employment",
        "invalid_employment",
        "employment must match the cataloged career, sector, and salary range",
      ),
    );
  }
  const benefits = state.gameplay.benefits;
  if (catalogSnapshot !== null && benefits.status !== "selected") {
    violations.push(
      violation(
        "gameplay.benefits",
        "missing_native_benefits",
        "native v2 state requires selected catalog benefits",
      ),
    );
  }
  if (
    benefits.status === "legacy_unknown" &&
    (benefits.healthPlanId !== null ||
      benefits.hsaEligible !== null ||
      benefits.employerRetirementPlanId !== null ||
      benefits.insuranceCoverageIds.length > 0)
  ) {
    violations.push(
      violation(
        "gameplay.benefits",
        "ambiguous_legacy_benefits",
        "legacy-unknown benefits cannot claim a selected plan or coverage",
      ),
    );
  }
  if (catalogSnapshot !== null && benefits.status === "selected") {
    if (
      benefits.healthPlanId !== catalogSnapshot.selected.healthPlan.id ||
      benefits.hsaEligible !== catalogSnapshot.selected.healthPlan.hsaEligible ||
      benefits.employerRetirementPlanId !==
        catalogSnapshot.selected.retirementPlan.id ||
      benefits.insuranceCoverageIds.length !==
        catalogSnapshot.selected.insuranceCoverages.length ||
      benefits.insuranceCoverageIds.some(
        (id, index) =>
          id !== catalogSnapshot.selected.insuranceCoverages[index]?.id,
      )
    ) {
      violations.push(
        violation(
          "gameplay.benefits",
          "benefits_snapshot_mismatch",
          "selected benefits must exactly match the resolved catalog snapshot",
        ),
      );
    }
  }
  const contributions = state.gameplay.contributions;
  validateMoneyRecord(
    {
      employee401kCents: contributions.employee401kCents,
      employer401kCents: contributions.employer401kCents,
      iraCents: contributions.iraCents,
      hsaCents: contributions.hsaCents,
    },
    "gameplay.contributions",
    violations,
  );
  if (
    catalogSnapshot === null
      ? contributions.policyYear !== null
      : contributions.policyYear !==
          catalogSnapshot.selected.benefitPolicy.policyYear ||
        contributions.employee401kCents >
          catalogSnapshot.selected.benefitPolicy
            .employeeRetirementContributionLimitCents ||
        contributions.iraCents >
          catalogSnapshot.selected.benefitPolicy.iraContributionLimitCents ||
        contributions.hsaCents >
          (catalogSnapshot.derived.hsaAnnualContributionLimitCents ?? 0) ||
        contributions.employee401kCents + contributions.employer401kCents >
          catalogSnapshot.selected.benefitPolicy
            .definedContributionAdditionLimitCents
  ) {
    violations.push(
      violation(
        "gameplay.contributions",
        "contribution_limit_exceeded",
        "year and contributions must satisfy the resolved benefit policy limits",
      ),
    );
  }
  const insurance = state.gameplay.insurance;
  validateMoneyRecord(
    {
      healthDeductiblePaidCents: insurance.healthDeductiblePaidCents,
      healthOutOfPocketPaidCents: insurance.healthOutOfPocketPaidCents,
    },
    "gameplay.insurance",
    violations,
  );
  if (
    insurance.healthDeductiblePaidCents > insurance.healthOutOfPocketPaidCents
  ) {
    violations.push(
      violation(
        "gameplay.insurance",
        "invalid_health_accumulator",
        "deductible paid cannot exceed total out-of-pocket paid",
      ),
    );
  }
  if (catalogSnapshot !== null) {
    const family =
      catalogSnapshot.selected.household.healthCoverageTier === "family";
    const healthPlan = catalogSnapshot.selected.healthPlan;
    const deductible = family
      ? healthPlan.annualDeductibleFamilyCents
      : healthPlan.annualDeductibleSelfCents;
    const outOfPocketMaximum = family
      ? healthPlan.annualOutOfPocketMaximumFamilyCents
      : healthPlan.annualOutOfPocketMaximumSelfCents;
    if (
      insurance.healthDeductiblePaidCents > deductible ||
      insurance.healthOutOfPocketPaidCents > outOfPocketMaximum
    ) {
      violations.push(
        violation(
          "gameplay.insurance",
          "health_accumulator_exceeded",
          "health accumulators cannot exceed selected plan bounds",
        ),
      );
    }
  }
  if (
    catalogSnapshot === null
      ? insurance.policyYear !== null || insurance.coverageUsage.length > 0
      : insurance.policyYear !== catalogSnapshot.selected.benefitPolicy.policyYear
  ) {
    violations.push(
      violation(
        "gameplay.insurance",
        "insurance_policy_mismatch",
        "insurance state must match the resolved benefit policy",
      ),
    );
  }
  const coverageIds = insurance.coverageUsage.map(({ coverageId }) => coverageId);
  if (new Set(coverageIds).size !== coverageIds.length) {
    violations.push(
      violation(
        "gameplay.insurance.coverageUsage",
        "duplicate_coverage_usage",
        "each coverage may have one usage accumulator",
      ),
    );
  }
  for (const [index, usage] of insurance.coverageUsage.entries()) {
    const selectedCoverage = catalogSnapshot?.selected.insuranceCoverages.find(
      ({ id }) => id === usage.coverageId,
    );
    if (
      !isNonNegativeSafeInteger(usage.usedCents) ||
      !benefits.insuranceCoverageIds.includes(usage.coverageId) ||
      !selectedCoverage ||
      usage.usedCents > selectedCoverage.coverageLimitCents
    ) {
      violations.push(
        violation(
          `gameplay.insurance.coverageUsage.${index}`,
          "invalid_coverage_usage",
          "usage must be non-negative and reference selected coverage",
        ),
      );
    }
  }
  if (
    benefits.status === "selected" &&
    (benefits.healthPlanId === null || benefits.hsaEligible === null)
  ) {
    violations.push(
      violation(
        "gameplay.benefits",
        "incomplete_benefits_selection",
        "selected benefits require a health plan and explicit HSA eligibility",
      ),
    );
  }

  return violations;
}
