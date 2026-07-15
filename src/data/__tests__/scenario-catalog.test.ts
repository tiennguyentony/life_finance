import { describe, expect, it } from "vitest";

import { moneyCents } from "../../core/domain/money";
import {
  finalizeScenarioCatalog,
  resolveScenarioCatalogSelection,
  ScenarioCatalogError,
  validateScenarioCatalog,
  type ScenarioCatalog,
  type ScenarioCatalogSelection,
} from "../../core/scenario-catalog";

import {
  US_2026_SCENARIO_CATALOG,
  US_2026_SCENARIO_CATALOG_VERSION,
} from "../scenario-catalog";

const selection = {
  catalogVersion: US_2026_SCENARIO_CATALOG_VERSION,
  locationId: "location.seattle",
  careerId: "career.software",
  householdId: "household.single",
  benefitsPackageId: "benefits.corporate_flex",
  healthPlanId: "health.hdhp_hsa",
  retirementPlanId: "retirement.401k_standard",
  insuranceCoverageIds: [
    "insurance.long_term_disability",
    "insurance.renters",
  ],
  scenarioId: "scenario.fresh_start",
} as const satisfies ScenarioCatalogSelection;

describe("versioned US scenario catalog", () => {
  it("is valid, unique, source-attributed, and deeply immutable", () => {
    expect(validateScenarioCatalog(US_2026_SCENARIO_CATALOG)).toEqual([]);
    expect(US_2026_SCENARIO_CATALOG.locations).toHaveLength(5);
    expect(US_2026_SCENARIO_CATALOG.careers).toHaveLength(5);
    expect(US_2026_SCENARIO_CATALOG.sectors).toHaveLength(5);
    expect(Object.isFrozen(US_2026_SCENARIO_CATALOG)).toBe(true);
    expect(Object.isFrozen(US_2026_SCENARIO_CATALOG.sources)).toBe(true);
    expect(Object.isFrozen(US_2026_SCENARIO_CATALOG.scenarios[0]?.allowedCareerIds)).toBe(true);
    expect(
      US_2026_SCENARIO_CATALOG.sources
        .filter(({ kind }) => kind === "official_data")
        .every(({ url }) => url?.startsWith("https://")),
    ).toBe(true);
  });

  it("resolves and freezes exact selected values with deterministic derived values", () => {
    const left = resolveScenarioCatalogSelection(
      US_2026_SCENARIO_CATALOG,
      selection,
    );
    const right = resolveScenarioCatalogSelection(
      US_2026_SCENARIO_CATALOG,
      { ...selection, insuranceCoverageIds: [...selection.insuranceCoverageIds] },
    );

    expect(left.snapshot.catalog.version).toBe("us-2026.2");
    expect(left.snapshot.selected.sector.id).toBe("sector.technology");
    expect(left.snapshot.selected.benefitPolicy.policyYear).toBe(2026);
    expect(left.snapshot.derived).toEqual({
      stateCode: "WA",
      filingStatus: "single",
      annualSalaryMinimumCents: 10_625_000,
      annualSalaryMaximumCents: 18_125_000,
      annualLivingCostCents: 6_500_000,
      monthlyHealthPremiumCents: 11_000,
      hsaAnnualContributionLimitCents: 440_000,
    });
    expect(left.snapshot.sources.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        "bls-oe-wages-2024",
        "irs-retirement-limits-2026",
        "irs-hsa-limits-2026",
        "life-finance-balance-2026-1",
      ]),
    );
    expect(left.snapshotChecksum).toBe(right.snapshotChecksum);
    expect(Object.isFrozen(left.snapshot.selected.insuranceCoverages)).toBe(true);
  });

  it("pins the 2026 statutory retirement, HSA, and HDHP limits", () => {
    for (const retirement of US_2026_SCENARIO_CATALOG.retirementPlans) {
      expect(retirement.employeeAnnualLimitCents).toBe(2_450_000);
      expect(retirement.employerAnnualAdditionLimitCents).toBe(7_200_000);
    }
    expect(
      US_2026_SCENARIO_CATALOG.benefitPolicy.iraContributionLimitCents,
    ).toBe(750_000);
    const hdhp = US_2026_SCENARIO_CATALOG.healthPlans.find(
      ({ id }) => id === "health.hdhp_hsa",
    );
    expect(hdhp).toMatchObject({
      hsaEligible: true,
      annualDeductibleSelfCents: 180_000,
      annualDeductibleFamilyCents: 360_000,
      annualOutOfPocketMaximumSelfCents: 800_000,
      annualOutOfPocketMaximumFamilyCents: 1_600_000,
    });

    const family = resolveScenarioCatalogSelection(US_2026_SCENARIO_CATALOG, {
      ...selection,
      householdId: "household.family_two_children",
    });
    expect(family.snapshot.derived.hsaAnnualContributionLimitCents).toBe(875_000);
    expect(family.snapshot.derived.monthlyHealthPremiumCents).toBe(34_000);
  });

  it("rejects unknown, cross-package, duplicate, and scenario-incompatible selections", () => {
    expect(() =>
      resolveScenarioCatalogSelection(US_2026_SCENARIO_CATALOG, {
        ...selection,
        careerId: "career.unknown",
      }),
    ).toThrow(expect.objectContaining({ code: "UNKNOWN_ENTRY" }));
    expect(() =>
      resolveScenarioCatalogSelection(US_2026_SCENARIO_CATALOG, {
        ...selection,
        careerId: "career.teacher",
      }),
    ).toThrow(expect.objectContaining({ code: "INCOMPATIBLE_SELECTION" }));
    expect(() =>
      resolveScenarioCatalogSelection(US_2026_SCENARIO_CATALOG, {
        ...selection,
        insuranceCoverageIds: ["insurance.renters", "insurance.renters"],
      }),
    ).toThrow(expect.objectContaining({ code: "INCOMPATIBLE_SELECTION" }));
    expect(() =>
      resolveScenarioCatalogSelection(US_2026_SCENARIO_CATALOG, {
        ...selection,
        householdId: "household.single",
        scenarioId: "scenario.established_household",
      }),
    ).toThrow(expect.objectContaining({ code: "INCOMPATIBLE_SELECTION" }));
  });

  it("requires an exact catalog version before resolving any entry", () => {
    expect(() =>
      resolveScenarioCatalogSelection(US_2026_SCENARIO_CATALOG, {
        ...selection,
        catalogVersion: "us-2026.3",
      }),
    ).toThrow(
      expect.objectContaining<Partial<ScenarioCatalogError>>({
        code: "VERSION_MISMATCH",
      }),
    );
  });

  it("keeps old resolved snapshots isolated from later catalog versions", () => {
    const original = resolveScenarioCatalogSelection(
      US_2026_SCENARIO_CATALOG,
      selection,
    );
    const changed = structuredClone(US_2026_SCENARIO_CATALOG) as ScenarioCatalog;
    const changedLocation = {
      ...changed.locations[0]!,
      annualLivingCostSingleCents: moneyCents(7_000_000),
    };
    const nextCatalog = finalizeScenarioCatalog({
      ...changed,
      version: "us-2026.3",
      locations: [changedLocation, ...changed.locations.slice(1)],
    });
    const next = resolveScenarioCatalogSelection(nextCatalog, {
      ...selection,
      catalogVersion: "us-2026.3",
    });

    expect(original.snapshot.derived.annualLivingCostCents).toBe(6_500_000);
    expect(next.snapshot.derived.annualLivingCostCents).toBe(7_000_000);
    expect(next.snapshotChecksum).not.toBe(original.snapshotChecksum);
  });

  it("reports duplicate ids, dangling references, and invalid HSA plans", () => {
    const corrupted = structuredClone(US_2026_SCENARIO_CATALOG) as ScenarioCatalog;
    const invalid = {
      ...corrupted,
      sectors: [...corrupted.sectors, corrupted.sectors[0]!],
      careers: [
        { ...corrupted.careers[0]!, sectorId: "sector.missing" },
        ...corrupted.careers.slice(1),
      ],
      healthPlans: [
        {
          ...corrupted.healthPlans.find(({ id }) => id === "health.hdhp_hsa")!,
          annualDeductibleSelfCents: moneyCents(100_000),
        },
        ...corrupted.healthPlans.filter(({ id }) => id !== "health.hdhp_hsa"),
      ],
    };

    expect(validateScenarioCatalog(invalid)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "duplicate_id" }),
        expect.objectContaining({ code: "invalid_career_reference" }),
        expect.objectContaining({ code: "invalid_hdhp" }),
      ]),
    );
  });
});
