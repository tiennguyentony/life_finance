import type { RunViewWire } from "@/contracts/api/contracts";
import {
  EDUCATION_CONCEPTS,
  getEducationConcept,
  type EducationConcept,
} from "@/data/education-content";

export { EDUCATION_CONCEPTS, getEducationConcept, type EducationConcept };

export type ConceptGroup = Readonly<{
  id: string;
  label: string;
  conceptIds: readonly string[];
}>;

/**
 * The glossary's four sections. Every catalogued concept appears in exactly one
 * group; `groupedConcepts` asserts that so a newly added concept cannot go
 * missing from the screen.
 */
export const CONCEPT_GROUPS: readonly ConceptGroup[] = Object.freeze([
  Object.freeze({
    id: "basics",
    label: "Money basics",
    conceptIds: Object.freeze([
      "compounding",
      "financial_independence",
      "emergency_fund",
      "liquidity",
    ]),
  }),
  Object.freeze({
    id: "retirement",
    label: "Retirement accounts",
    conceptIds: Object.freeze([
      "401k",
      "employer_match",
      "hsa",
      "ira",
      "restricted_retirement_assets",
    ]),
  }),
  Object.freeze({
    id: "investing",
    label: "Investing",
    conceptIds: Object.freeze([
      "broad_index",
      "diversification",
      "sector_investing",
      "job_investment_correlation",
      "speculation",
    ]),
  }),
  Object.freeze({
    id: "risk",
    label: "Risk, protection & habits",
    conceptIds: Object.freeze([
      "deductible",
      "dti",
      "exposure",
      "lifestyle_creep",
      "tax_estimate",
    ]),
  }),
]);

export type GroupedConcepts = Readonly<{
  group: ConceptGroup;
  concepts: readonly EducationConcept[];
}>;

export function groupedConcepts(): readonly GroupedConcepts[] {
  const grouped = CONCEPT_GROUPS.map((group) => ({
    group,
    concepts: group.conceptIds
      .map((id) => getEducationConcept(id))
      .filter((concept): concept is EducationConcept => concept !== undefined),
  }));

  const placed = new Set(grouped.flatMap(({ concepts }) => concepts.map(({ id }) => id)));
  const ungrouped = EDUCATION_CONCEPTS.filter(({ id }) => !placed.has(id));

  // A concept added to the catalog without a group still reaches the player.
  return ungrouped.length === 0
    ? grouped
    : [
        ...grouped,
        {
          group: { id: "other", label: "More concepts", conceptIds: ungrouped.map(({ id }) => id) },
          concepts: ungrouped,
        },
      ];
}

/**
 * Concepts the run has demonstrably exercised, derived from authoritative state
 * rather than a stored "seen" flag. This is deliberately conservative: it marks
 * what the player's own numbers now show, so nothing is claimed as learned
 * without evidence in the run.
 */
export function demonstratedConceptIds(run: RunViewWire): ReadonlySet<string> {
  const demonstrated = new Set<string>();
  const { strategy, finances, benefits } = run;

  if (strategy.preTax401kSalaryRatePpm > 0) {
    demonstrated.add("401k");
    demonstrated.add("compounding");
  }
  if (
    strategy.preTax401kSalaryRatePpm > 0 &&
    (benefits?.retirementPlan.employerMatchTiers.length ?? 0) > 0
  ) {
    demonstrated.add("employer_match");
  }
  if (strategy.preTaxHsaSalaryRatePpm > 0) demonstrated.add("hsa");
  if (strategy.afterTaxIraRatePpm > 0) demonstrated.add("ira");
  if (strategy.afterTaxBroadIndexRatePpm > 0) demonstrated.add("broad_index");
  if (strategy.afterTaxSectorRatePpm > 0) {
    demonstrated.add("sector_investing");
    demonstrated.add("job_investment_correlation");
  }
  if (strategy.afterTaxSpeculativeRatePpm > 0) demonstrated.add("speculation");
  if (
    [
      strategy.afterTaxBroadIndexRatePpm,
      strategy.afterTaxSectorRatePpm,
      strategy.afterTaxSpeculativeRatePpm,
    ].filter((rate) => rate > 0).length > 1
  ) {
    demonstrated.add("diversification");
  }
  if ((strategy.emergencyFundTargetMonthsPpm ?? 0) > 0) {
    demonstrated.add("emergency_fund");
    demonstrated.add("liquidity");
  }
  if (finances.creditUsedCents > 0 || strategy.afterTaxExtraDebtRatePpm > 0) {
    demonstrated.add("dti");
  }
  if (finances.retirementCents > 0) demonstrated.add("restricted_retirement_assets");
  if (benefits?.healthPlan) demonstrated.add("deductible");
  if (run.goal.progressPpm > 0) demonstrated.add("financial_independence");
  if (run.risk.weaknessTags.length > 0) demonstrated.add("exposure");
  // Every processed month runs the tax engine, so any advanced run has met it.
  if (run.currentMonth > run.startMonth) demonstrated.add("tax_estimate");

  return demonstrated;
}
