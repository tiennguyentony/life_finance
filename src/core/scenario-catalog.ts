import { sha256Canonical } from "./canonical";
import { multiplyMoneyByRate, type MoneyCents, type RatePpm } from "./domain/money";

export const SCENARIO_CATALOG_SCHEMA_VERSION = 1 as const;

export type FilingStatus =
  | "single"
  | "married_filing_jointly"
  | "married_filing_separately"
  | "head_of_household"
  | "qualifying_surviving_spouse";

export type CatalogSource = Readonly<{
  id: string;
  kind: "official_data" | "gameplay_assumption";
  publisher: string;
  title: string;
  url: string | null;
  asOfDate: string;
  note: string;
}>;

type SourcedEntry = Readonly<{
  id: string;
  sourceIds: readonly string[];
}>;

export type SectorCatalogEntry = SourcedEntry &
  Readonly<{
    label: string;
    marketTag: "broad" | "technology" | "healthcare" | "finance" | "public" | "cyclical";
    jobLossVolatilityPpm: RatePpm;
  }>;

export type LocationCatalogEntry = SourcedEntry &
  Readonly<{
    label: string;
    stateCode: string;
    metroCode: string;
    annualLivingCostSingleCents: MoneyCents;
    salaryMultiplierPpm: RatePpm;
  }>;

export type CareerCatalogEntry = SourcedEntry &
  Readonly<{
    label: string;
    socCode: string;
    sectorId: string;
    annualSalaryMinimumCents: MoneyCents;
    annualSalaryMaximumCents: MoneyCents;
    eligibleBenefitsPackageIds: readonly string[];
  }>;

export type HouseholdCatalogEntry = SourcedEntry &
  Readonly<{
    label: string;
    filingStatus: FilingStatus;
    adultCount: number;
    dependentCount: number;
    healthCoverageTier: "self" | "family";
    livingCostMultiplierPpm: RatePpm;
  }>;

export type BenefitPolicyCatalogEntry = SourcedEntry &
  Readonly<{
    policyYear: number;
    employeeRetirementContributionLimitCents: MoneyCents;
    definedContributionAdditionLimitCents: MoneyCents;
    hsaContributionLimitSelfCents: MoneyCents;
    hsaContributionLimitFamilyCents: MoneyCents;
    hdhpMinimumDeductibleSelfCents: MoneyCents;
    hdhpMinimumDeductibleFamilyCents: MoneyCents;
    hdhpMaximumOutOfPocketSelfCents: MoneyCents;
    hdhpMaximumOutOfPocketFamilyCents: MoneyCents;
  }>;

export type HealthPlanCatalogEntry = SourcedEntry &
  Readonly<{
    label: string;
    hsaEligible: boolean;
    monthlyEmployeePremiumSelfCents: MoneyCents;
    monthlyEmployeePremiumFamilyCents: MoneyCents;
    annualDeductibleSelfCents: MoneyCents;
    annualDeductibleFamilyCents: MoneyCents;
    annualOutOfPocketMaximumSelfCents: MoneyCents;
    annualOutOfPocketMaximumFamilyCents: MoneyCents;
    coinsurancePpm: RatePpm;
  }>;

export type RetirementPlanCatalogEntry = SourcedEntry &
  Readonly<{
    label: string;
    employeeAnnualLimitCents: MoneyCents;
    employerMatchTiers: readonly Readonly<{
      employeeContributionRateUpToPpm: RatePpm;
      employerMatchRatePpm: RatePpm;
    }>[];
    employerAnnualAdditionLimitCents: MoneyCents;
  }>;

export type InsuranceCoverageCatalogEntry = SourcedEntry &
  Readonly<{
    label: string;
    kind: "short_term_disability" | "long_term_disability" | "term_life" | "renters";
    monthlyPremiumCents: MoneyCents;
    coverageLimitCents: MoneyCents;
    deductibleCents: MoneyCents;
  }>;

export type BenefitsPackageCatalogEntry = SourcedEntry &
  Readonly<{
    label: string;
    healthPlanIds: readonly string[];
    retirementPlanIds: readonly string[];
    insuranceCoverageIds: readonly string[];
  }>;

export type ScenarioCatalogEntry = SourcedEntry &
  Readonly<{
    label: string;
    allowedLocationIds: readonly string[];
    allowedCareerIds: readonly string[];
    allowedHouseholdIds: readonly string[];
    minimumStartingCashCents: MoneyCents;
    maximumStartingCashCents: MoneyCents;
    allowsStartingTermDebt: boolean;
    allowsHomeOwnership: boolean;
  }>;

export type ScenarioCatalog = Readonly<{
  schemaVersion: typeof SCENARIO_CATALOG_SCHEMA_VERSION;
  id: string;
  version: string;
  effectiveDate: string;
  sources: readonly CatalogSource[];
  benefitPolicy: BenefitPolicyCatalogEntry;
  sectors: readonly SectorCatalogEntry[];
  locations: readonly LocationCatalogEntry[];
  careers: readonly CareerCatalogEntry[];
  households: readonly HouseholdCatalogEntry[];
  healthPlans: readonly HealthPlanCatalogEntry[];
  retirementPlans: readonly RetirementPlanCatalogEntry[];
  insuranceCoverages: readonly InsuranceCoverageCatalogEntry[];
  benefitsPackages: readonly BenefitsPackageCatalogEntry[];
  scenarios: readonly ScenarioCatalogEntry[];
}>;

export type ScenarioCatalogSelection = Readonly<{
  catalogVersion: string;
  locationId: string;
  careerId: string;
  householdId: string;
  benefitsPackageId: string;
  healthPlanId: string;
  retirementPlanId: string;
  insuranceCoverageIds: readonly string[];
  scenarioId: string;
}>;

export type ResolvedScenarioSnapshot = Readonly<{
  catalog: Readonly<{
    id: string;
    version: string;
    effectiveDate: string;
  }>;
  sources: readonly CatalogSource[];
  selected: Readonly<{
    location: LocationCatalogEntry;
    career: CareerCatalogEntry;
    household: HouseholdCatalogEntry;
    benefitPolicy: BenefitPolicyCatalogEntry;
    benefitsPackage: BenefitsPackageCatalogEntry;
    healthPlan: HealthPlanCatalogEntry;
    retirementPlan: RetirementPlanCatalogEntry;
    insuranceCoverages: readonly InsuranceCoverageCatalogEntry[];
    scenario: ScenarioCatalogEntry;
    sector: SectorCatalogEntry;
  }>;
  derived: Readonly<{
    stateCode: string;
    filingStatus: FilingStatus;
    annualSalaryMinimumCents: MoneyCents;
    annualSalaryMaximumCents: MoneyCents;
    annualLivingCostCents: MoneyCents;
    monthlyHealthPremiumCents: MoneyCents;
    hsaAnnualContributionLimitCents: MoneyCents | null;
  }>;
}>;

export type ResolvedScenario = Readonly<{
  snapshot: ResolvedScenarioSnapshot;
  snapshotChecksum: string;
}>;

export type CatalogViolation = Readonly<{
  path: string;
  code: string;
  message: string;
}>;

export class ScenarioCatalogError extends Error {
  readonly code:
    | "INVALID_CATALOG"
    | "VERSION_MISMATCH"
    | "UNKNOWN_ENTRY"
    | "INCOMPATIBLE_SELECTION";
  readonly violations?: readonly CatalogViolation[];

  constructor(
    code: ScenarioCatalogError["code"],
    message: string,
    violations?: readonly CatalogViolation[],
  ) {
    super(message);
    this.name = "ScenarioCatalogError";
    this.code = code;
    this.violations = violations;
  }
}

const IDENTIFIER = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const US_STATE_CODE = /^[A-Z]{2}$/;
const SOC_CODE = /^\d{2}-\d{4}$/;

function violation(path: string, code: string, message: string): CatalogViolation {
  return { path, code, message };
}

function isNonNegativeMoney(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isRate(value: number, maximum = 1_000_000): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

function hasValidDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function duplicates(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

function validateIds(
  values: readonly SourcedEntry[],
  path: string,
  sourceIds: ReadonlySet<string>,
  violations: CatalogViolation[],
): void {
  for (const duplicate of duplicates(values.map(({ id }) => id))) {
    violations.push(violation(path, "duplicate_id", `duplicate id ${duplicate}`));
  }
  for (const [index, entry] of values.entries()) {
    if (!IDENTIFIER.test(entry.id)) {
      violations.push(violation(`${path}.${index}.id`, "invalid_id", "must be a stable identifier"));
    }
    if (entry.sourceIds.length === 0) {
      violations.push(violation(`${path}.${index}.sourceIds`, "missing_source", "must cite at least one source"));
    }
    for (const sourceId of entry.sourceIds) {
      if (!sourceIds.has(sourceId)) {
        violations.push(violation(`${path}.${index}.sourceIds`, "unknown_source", `unknown source ${sourceId}`));
      }
    }
  }
}

function validateReferences(
  values: readonly string[],
  validIds: ReadonlySet<string>,
  path: string,
  violations: CatalogViolation[],
): void {
  for (const duplicate of duplicates(values)) {
    violations.push(violation(path, "duplicate_reference", `duplicate reference ${duplicate}`));
  }
  for (const value of values) {
    if (!validIds.has(value)) {
      violations.push(violation(path, "unknown_reference", `unknown reference ${value}`));
    }
  }
}

export function validateScenarioCatalog(
  catalog: ScenarioCatalog,
): readonly CatalogViolation[] {
  const violations: CatalogViolation[] = [];
  if (catalog.schemaVersion !== SCENARIO_CATALOG_SCHEMA_VERSION) {
    violations.push(violation("schemaVersion", "unsupported_schema", "must be schema version 1"));
  }
  if (!IDENTIFIER.test(catalog.id) || !IDENTIFIER.test(catalog.version)) {
    violations.push(violation("catalog", "invalid_identity", "catalog id and version must be stable identifiers"));
  }
  if (!hasValidDate(catalog.effectiveDate)) {
    violations.push(violation("effectiveDate", "invalid_date", "must be a real ISO calendar date"));
  }

  const sourceIds = new Set(catalog.sources.map(({ id }) => id));
  for (const duplicate of duplicates(catalog.sources.map(({ id }) => id))) {
    violations.push(violation("sources", "duplicate_id", `duplicate source ${duplicate}`));
  }
  for (const [index, source] of catalog.sources.entries()) {
    if (!IDENTIFIER.test(source.id) || !hasValidDate(source.asOfDate)) {
      violations.push(violation(`sources.${index}`, "invalid_source", "source id and date must be valid"));
    }
    if (source.kind === "official_data" && source.url === null) {
      violations.push(violation(`sources.${index}.url`, "missing_url", "official data requires a URL"));
    }
  }

  const collections: readonly [readonly SourcedEntry[], string][] = [
    [[catalog.benefitPolicy], "benefitPolicy"],
    [catalog.sectors, "sectors"],
    [catalog.locations, "locations"],
    [catalog.careers, "careers"],
    [catalog.households, "households"],
    [catalog.healthPlans, "healthPlans"],
    [catalog.retirementPlans, "retirementPlans"],
    [catalog.insuranceCoverages, "insuranceCoverages"],
    [catalog.benefitsPackages, "benefitsPackages"],
    [catalog.scenarios, "scenarios"],
  ];
  for (const [values, path] of collections) {
    if (values.length === 0) {
      violations.push(violation(path, "empty_catalog", "must contain at least one entry"));
    }
    validateIds(values, path, sourceIds, violations);
  }

  const sectorIds = new Set(catalog.sectors.map(({ id }) => id));
  const locationIds = new Set(catalog.locations.map(({ id }) => id));
  const careerIds = new Set(catalog.careers.map(({ id }) => id));
  const householdIds = new Set(catalog.households.map(({ id }) => id));
  const healthPlanIds = new Set(catalog.healthPlans.map(({ id }) => id));
  const retirementPlanIds = new Set(catalog.retirementPlans.map(({ id }) => id));
  const insuranceIds = new Set(catalog.insuranceCoverages.map(({ id }) => id));
  const benefitsIds = new Set(catalog.benefitsPackages.map(({ id }) => id));

  const benefitPolicyMoney = [
    catalog.benefitPolicy.employeeRetirementContributionLimitCents,
    catalog.benefitPolicy.definedContributionAdditionLimitCents,
    catalog.benefitPolicy.hsaContributionLimitSelfCents,
    catalog.benefitPolicy.hsaContributionLimitFamilyCents,
    catalog.benefitPolicy.hdhpMinimumDeductibleSelfCents,
    catalog.benefitPolicy.hdhpMinimumDeductibleFamilyCents,
    catalog.benefitPolicy.hdhpMaximumOutOfPocketSelfCents,
    catalog.benefitPolicy.hdhpMaximumOutOfPocketFamilyCents,
  ];
  if (
    !Number.isSafeInteger(catalog.benefitPolicy.policyYear) ||
    catalog.benefitPolicy.policyYear < 2000 ||
    benefitPolicyMoney.some((value) => !isNonNegativeMoney(value) || value === 0) ||
    catalog.benefitPolicy.employeeRetirementContributionLimitCents >
      catalog.benefitPolicy.definedContributionAdditionLimitCents ||
    catalog.benefitPolicy.hsaContributionLimitSelfCents >
      catalog.benefitPolicy.hsaContributionLimitFamilyCents ||
    catalog.benefitPolicy.hdhpMinimumDeductibleSelfCents >
      catalog.benefitPolicy.hdhpMaximumOutOfPocketSelfCents ||
    catalog.benefitPolicy.hdhpMinimumDeductibleFamilyCents >
      catalog.benefitPolicy.hdhpMaximumOutOfPocketFamilyCents
  ) {
    violations.push(
      violation(
        "benefitPolicy",
        "invalid_benefit_policy",
        "policy year and statutory limits must be positive and internally ordered",
      ),
    );
  }

  for (const [index, sector] of catalog.sectors.entries()) {
    if (!isRate(sector.jobLossVolatilityPpm)) {
      violations.push(violation(`sectors.${index}.jobLossVolatilityPpm`, "invalid_rate", "must be 0..1,000,000 PPM"));
    }
  }
  for (const [index, location] of catalog.locations.entries()) {
    if (!US_STATE_CODE.test(location.stateCode) || !IDENTIFIER.test(location.metroCode)) {
      violations.push(violation(`locations.${index}`, "invalid_jurisdiction", "state and metro codes must be canonical"));
    }
    if (!isNonNegativeMoney(location.annualLivingCostSingleCents) || location.annualLivingCostSingleCents === 0) {
      violations.push(violation(`locations.${index}.annualLivingCostSingleCents`, "invalid_money", "must be positive cents"));
    }
    if (!isRate(location.salaryMultiplierPpm, 3_000_000) || location.salaryMultiplierPpm === 0) {
      violations.push(violation(`locations.${index}.salaryMultiplierPpm`, "invalid_multiplier", "must be positive and at most 3x"));
    }
  }
  for (const [index, career] of catalog.careers.entries()) {
    if (!SOC_CODE.test(career.socCode) || !sectorIds.has(career.sectorId)) {
      violations.push(violation(`careers.${index}`, "invalid_career_reference", "SOC and sector must be valid"));
    }
    if (
      !isNonNegativeMoney(career.annualSalaryMinimumCents) ||
      !isNonNegativeMoney(career.annualSalaryMaximumCents) ||
      career.annualSalaryMinimumCents <= 0 ||
      career.annualSalaryMinimumCents > career.annualSalaryMaximumCents
    ) {
      violations.push(violation(`careers.${index}.annualSalary`, "invalid_range", "salary range must be positive and ordered"));
    }
    validateReferences(career.eligibleBenefitsPackageIds, benefitsIds, `careers.${index}.eligibleBenefitsPackageIds`, violations);
  }
  for (const [index, household] of catalog.households.entries()) {
    if (
      !Number.isSafeInteger(household.adultCount) ||
      !Number.isSafeInteger(household.dependentCount) ||
      household.adultCount < 1 ||
      household.adultCount > 2 ||
      household.dependentCount < 0 ||
      household.dependentCount > 8 ||
      !isRate(household.livingCostMultiplierPpm, 4_000_000) ||
      household.livingCostMultiplierPpm === 0
    ) {
      violations.push(violation(`households.${index}`, "invalid_household", "household counts and multiplier must be bounded"));
    }
    if (
      (household.filingStatus === "married_filing_jointly" ||
        household.filingStatus === "married_filing_separately") !==
      (household.adultCount === 2)
    ) {
      violations.push(violation(`households.${index}.filingStatus`, "incompatible_filing_status", "married filing requires exactly two adults"));
    }
  }
  for (const [index, plan] of catalog.healthPlans.entries()) {
    const money = [
      plan.monthlyEmployeePremiumSelfCents,
      plan.monthlyEmployeePremiumFamilyCents,
      plan.annualDeductibleSelfCents,
      plan.annualDeductibleFamilyCents,
      plan.annualOutOfPocketMaximumSelfCents,
      plan.annualOutOfPocketMaximumFamilyCents,
    ];
    if (money.some((value) => !isNonNegativeMoney(value)) || !isRate(plan.coinsurancePpm)) {
      violations.push(violation(`healthPlans.${index}`, "invalid_health_plan", "money and coinsurance must be bounded"));
    }
    if (
      plan.annualOutOfPocketMaximumSelfCents < plan.annualDeductibleSelfCents ||
      plan.annualOutOfPocketMaximumFamilyCents < plan.annualDeductibleFamilyCents
    ) {
      violations.push(violation(`healthPlans.${index}`, "invalid_cost_sharing", "out-of-pocket maximum cannot be below deductible"));
    }
    if (
      plan.hsaEligible &&
      (plan.annualDeductibleSelfCents <
        catalog.benefitPolicy.hdhpMinimumDeductibleSelfCents ||
        plan.annualDeductibleFamilyCents <
          catalog.benefitPolicy.hdhpMinimumDeductibleFamilyCents ||
        plan.annualOutOfPocketMaximumSelfCents >
          catalog.benefitPolicy.hdhpMaximumOutOfPocketSelfCents ||
        plan.annualOutOfPocketMaximumFamilyCents >
          catalog.benefitPolicy.hdhpMaximumOutOfPocketFamilyCents)
    ) {
      violations.push(violation(`healthPlans.${index}`, "invalid_hdhp", "HSA plan must satisfy the cataloged policy-year HDHP bounds"));
    }
  }
  for (const [index, plan] of catalog.retirementPlans.entries()) {
    if (
      !isNonNegativeMoney(plan.employeeAnnualLimitCents) ||
      !isNonNegativeMoney(plan.employerAnnualAdditionLimitCents) ||
      plan.employeeAnnualLimitCents > plan.employerAnnualAdditionLimitCents ||
      plan.employeeAnnualLimitCents !==
        catalog.benefitPolicy.employeeRetirementContributionLimitCents ||
      plan.employerAnnualAdditionLimitCents !==
        catalog.benefitPolicy.definedContributionAdditionLimitCents
    ) {
      violations.push(violation(`retirementPlans.${index}`, "invalid_policy_limit", "must use the cataloged policy-year contribution limits"));
    }
    let prior = 0;
    for (const [tierIndex, tier] of plan.employerMatchTiers.entries()) {
      if (
        !isRate(tier.employeeContributionRateUpToPpm) ||
        !isRate(tier.employerMatchRatePpm) ||
        tier.employeeContributionRateUpToPpm <= prior
      ) {
        violations.push(violation(`retirementPlans.${index}.employerMatchTiers.${tierIndex}`, "invalid_match_tier", "tiers must be increasing bounded rates"));
      }
      prior = tier.employeeContributionRateUpToPpm;
    }
  }
  for (const [index, coverage] of catalog.insuranceCoverages.entries()) {
    if (
      !isNonNegativeMoney(coverage.monthlyPremiumCents) ||
      !isNonNegativeMoney(coverage.coverageLimitCents) ||
      !isNonNegativeMoney(coverage.deductibleCents) ||
      coverage.deductibleCents > coverage.coverageLimitCents
    ) {
      violations.push(violation(`insuranceCoverages.${index}`, "invalid_coverage", "coverage amounts must be non-negative and ordered"));
    }
  }
  for (const [index, benefits] of catalog.benefitsPackages.entries()) {
    validateReferences(benefits.healthPlanIds, healthPlanIds, `benefitsPackages.${index}.healthPlanIds`, violations);
    validateReferences(benefits.retirementPlanIds, retirementPlanIds, `benefitsPackages.${index}.retirementPlanIds`, violations);
    validateReferences(benefits.insuranceCoverageIds, insuranceIds, `benefitsPackages.${index}.insuranceCoverageIds`, violations);
    if (benefits.healthPlanIds.length === 0 || benefits.retirementPlanIds.length === 0) {
      violations.push(violation(`benefitsPackages.${index}`, "incomplete_package", "benefits require health and retirement options"));
    }
  }
  for (const [index, scenario] of catalog.scenarios.entries()) {
    validateReferences(scenario.allowedLocationIds, locationIds, `scenarios.${index}.allowedLocationIds`, violations);
    validateReferences(scenario.allowedCareerIds, careerIds, `scenarios.${index}.allowedCareerIds`, violations);
    validateReferences(scenario.allowedHouseholdIds, householdIds, `scenarios.${index}.allowedHouseholdIds`, violations);
    if (
      scenario.allowedLocationIds.length === 0 ||
      scenario.allowedCareerIds.length === 0 ||
      scenario.allowedHouseholdIds.length === 0 ||
      !isNonNegativeMoney(scenario.minimumStartingCashCents) ||
      !isNonNegativeMoney(scenario.maximumStartingCashCents) ||
      scenario.minimumStartingCashCents > scenario.maximumStartingCashCents
    ) {
      violations.push(violation(`scenarios.${index}`, "invalid_scenario", "scenario choices and cash bounds must be complete"));
    }
  }
  return violations;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

export function finalizeScenarioCatalog(catalog: ScenarioCatalog): ScenarioCatalog {
  const violations = validateScenarioCatalog(catalog);
  if (violations.length > 0) {
    throw new ScenarioCatalogError(
      "INVALID_CATALOG",
      `scenario catalog violates ${violations.length} invariant${violations.length === 1 ? "" : "s"}`,
      violations,
    );
  }
  return deepFreeze(catalog) as ScenarioCatalog;
}

function requireEntry<T extends { id: string }>(
  values: readonly T[],
  id: string,
  kind: string,
): T {
  const entry = values.find((candidate) => candidate.id === id);
  if (!entry) {
    throw new ScenarioCatalogError("UNKNOWN_ENTRY", `unknown ${kind} ${id}`);
  }
  return entry;
}

function requireAllowed(condition: boolean, message: string): void {
  if (!condition) {
    throw new ScenarioCatalogError("INCOMPATIBLE_SELECTION", message);
  }
}

export function resolveScenarioCatalogSelection(
  catalog: ScenarioCatalog,
  selection: ScenarioCatalogSelection,
): ResolvedScenario {
  const violations = validateScenarioCatalog(catalog);
  if (violations.length > 0) {
    throw new ScenarioCatalogError("INVALID_CATALOG", "cannot resolve an invalid scenario catalog", violations);
  }
  if (selection.catalogVersion !== catalog.version) {
    throw new ScenarioCatalogError(
      "VERSION_MISMATCH",
      `requested catalog ${selection.catalogVersion}, available ${catalog.version}`,
    );
  }
  if (duplicates(selection.insuranceCoverageIds).length > 0) {
    throw new ScenarioCatalogError("INCOMPATIBLE_SELECTION", "insurance selections must be unique");
  }

  const location = requireEntry(catalog.locations, selection.locationId, "location");
  const career = requireEntry(catalog.careers, selection.careerId, "career");
  const household = requireEntry(catalog.households, selection.householdId, "household");
  const benefitsPackage = requireEntry(catalog.benefitsPackages, selection.benefitsPackageId, "benefits package");
  const healthPlan = requireEntry(catalog.healthPlans, selection.healthPlanId, "health plan");
  const retirementPlan = requireEntry(catalog.retirementPlans, selection.retirementPlanId, "retirement plan");
  const insuranceCoverages = selection.insuranceCoverageIds.map((id) =>
    requireEntry(catalog.insuranceCoverages, id, "insurance coverage"),
  );
  const scenario = requireEntry(catalog.scenarios, selection.scenarioId, "scenario");
  const sector = requireEntry(catalog.sectors, career.sectorId, "sector");

  requireAllowed(scenario.allowedLocationIds.includes(location.id), "location is not allowed by scenario");
  requireAllowed(scenario.allowedCareerIds.includes(career.id), "career is not allowed by scenario");
  requireAllowed(scenario.allowedHouseholdIds.includes(household.id), "household is not allowed by scenario");
  requireAllowed(career.eligibleBenefitsPackageIds.includes(benefitsPackage.id), "career is not eligible for benefits package");
  requireAllowed(benefitsPackage.healthPlanIds.includes(healthPlan.id), "health plan is not in benefits package");
  requireAllowed(benefitsPackage.retirementPlanIds.includes(retirementPlan.id), "retirement plan is not in benefits package");
  requireAllowed(
    insuranceCoverages.every(({ id }) => benefitsPackage.insuranceCoverageIds.includes(id)),
    "insurance coverage is not in benefits package",
  );

  const usedSourceIds = new Set<string>([
    ...location.sourceIds,
    ...career.sourceIds,
    ...household.sourceIds,
    ...catalog.benefitPolicy.sourceIds,
    ...benefitsPackage.sourceIds,
    ...healthPlan.sourceIds,
    ...retirementPlan.sourceIds,
    ...insuranceCoverages.flatMap(({ sourceIds }) => sourceIds),
    ...scenario.sourceIds,
    ...sector.sourceIds,
  ]);
  const snapshot: ResolvedScenarioSnapshot = {
    catalog: {
      id: catalog.id,
      version: catalog.version,
      effectiveDate: catalog.effectiveDate,
    },
    sources: catalog.sources.filter(({ id }) => usedSourceIds.has(id)),
    selected: {
      location,
      career,
      household,
      benefitPolicy: catalog.benefitPolicy,
      benefitsPackage,
      healthPlan,
      retirementPlan,
      insuranceCoverages,
      scenario,
      sector,
    },
    derived: {
      stateCode: location.stateCode,
      filingStatus: household.filingStatus,
      annualSalaryMinimumCents: multiplyMoneyByRate(
        career.annualSalaryMinimumCents,
        location.salaryMultiplierPpm,
      ),
      annualSalaryMaximumCents: multiplyMoneyByRate(
        career.annualSalaryMaximumCents,
        location.salaryMultiplierPpm,
      ),
      annualLivingCostCents: multiplyMoneyByRate(
        location.annualLivingCostSingleCents,
        household.livingCostMultiplierPpm,
      ),
      monthlyHealthPremiumCents:
        household.healthCoverageTier === "self"
          ? healthPlan.monthlyEmployeePremiumSelfCents
          : healthPlan.monthlyEmployeePremiumFamilyCents,
      hsaAnnualContributionLimitCents: healthPlan.hsaEligible
        ? household.healthCoverageTier === "self"
          ? catalog.benefitPolicy.hsaContributionLimitSelfCents
          : catalog.benefitPolicy.hsaContributionLimitFamilyCents
        : null,
    },
  };
  const frozen = deepFreeze(snapshot) as ResolvedScenarioSnapshot;
  return Object.freeze({
    snapshot: frozen,
    snapshotChecksum: sha256Canonical(frozen),
  });
}
