import { describe, expect, it } from "vitest";

import { REVOLVING_CREDIT_POLICY_V2 } from "@/core/revolving-credit-v2";

import {
  annualToMonthlyCents,
  debtServiceRatioPpm,
  emergencyFundMonths,
  emergencyFundTargetCents,
  projectCareerPrograms,
  projectContributionBuckets,
  projectEmployerMatchMonthlyCents,
  projectRevolvingPayoff,
  revolvingAprPercent,
  worstCaseHealthYearCents,
  type EmployerMatchTier,
  type StrategyRates,
} from "../hq-derivations";

const NO_STRATEGY: StrategyRates = {
  preTax401kSalaryRatePpm: 0,
  preTaxHsaSalaryRatePpm: 0,
  afterTaxBroadIndexRatePpm: 0,
  afterTaxSectorRatePpm: 0,
  afterTaxSpeculativeRatePpm: 0,
  afterTaxIraRatePpm: 0,
  afterTaxExtraDebtRatePpm: 0,
};

// The catalog's real policy: 100% on the first 3%, 50% on the next 2%.
const STANDARD_TIERS: readonly EmployerMatchTier[] = [
  { employeeContributionRateUpToPpm: 30_000, employerMatchRatePpm: 1_000_000 },
  { employeeContributionRateUpToPpm: 50_000, employerMatchRatePpm: 500_000 },
];

describe("revolving payoff projection", () => {
  it("reports the engine's own APR rather than a copied design value", () => {
    expect(revolvingAprPercent()).toBe(
      REVOLVING_CREDIT_POLICY_V2.annualInterestRatePpm / 10_000,
    );
  });

  it("clears a balance faster and cheaper when extra payment is added", () => {
    const minimumsOnly = projectRevolvingPayoff(125_000, 0);
    const accelerated = projectRevolvingPayoff(125_000, 50_000);

    expect(minimumsOnly).not.toBeNull();
    expect(accelerated).not.toBeNull();
    expect(accelerated!.months).toBeLessThan(minimumsOnly!.months);
    expect(accelerated!.totalInterestCents).toBeLessThan(
      minimumsOnly!.totalInterestCents,
    );
    expect(accelerated!.truncated).toBe(false);
  });

  it("charges interest on the way down instead of assuming a free payoff", () => {
    const projection = projectRevolvingPayoff(125_000, 50_000);

    expect(projection!.totalInterestCents).toBeGreaterThan(0);
  });

  it("returns null for a balance that does not exist", () => {
    expect(projectRevolvingPayoff(0, 10_000)).toBeNull();
    expect(projectRevolvingPayoff(-500, 10_000)).toBeNull();
  });

  it("flags a balance that interest prevents from ever clearing", () => {
    // A payment below the monthly interest cannot retire principal.
    const projection = projectRevolvingPayoff(100_000_000, 0);

    expect(projection!.truncated).toBe(true);
  });
});

describe("debt service ratio", () => {
  it("expresses required payments as a share of gross monthly income", () => {
    // $400/mo against $120k/yr gross ($10k/mo) is 4%.
    expect(debtServiceRatioPpm(40_000, 12_000_000)).toBe(40_000);
  });

  it("is undefined without salary rather than dividing by zero", () => {
    expect(debtServiceRatioPpm(40_000, null)).toBeNull();
    expect(debtServiceRatioPpm(40_000, 0)).toBeNull();
  });
});

describe("career program projection", () => {
  it("derives payback and ten-year upside from the catalog", () => {
    const [certificate] = projectCareerPrograms();

    // $2,000 upfront against a $3,000/yr raise ($250/mo) repays in 8 months.
    expect(certificate.program.id).toBe("upskill.certificate");
    expect(certificate.paybackMonths).toBe(8);
    expect(certificate.tenYearUpsideCents).toBe(3_000_000);
  });

  it("covers every catalogued program", () => {
    const projections = projectCareerPrograms();

    expect(projections).toHaveLength(3);
    expect(projections.every(({ paybackMonths }) => paybackMonths > 0)).toBe(true);
  });
});

describe("employer match projection", () => {
  it("walks the tiers instead of applying a single flat rate", () => {
    // $10k/mo, contributing 8%: 100% of the first 3% ($300) + 50% of the next
    // 2% ($100) = $400. The 3% above the top tier earns nothing.
    expect(projectEmployerMatchMonthlyCents(1_000_000, 80_000, STANDARD_TIERS)).toBe(
      40_000,
    );
  });

  it("matches only what the employee actually contributes", () => {
    // Contributing 2% earns 100% of that 2% and nothing from the second tier.
    expect(projectEmployerMatchMonthlyCents(1_000_000, 20_000, STANDARD_TIERS)).toBe(
      20_000,
    );
  });

  it("pays nothing when the employee contributes nothing", () => {
    expect(projectEmployerMatchMonthlyCents(1_000_000, 0, STANDARD_TIERS)).toBe(0);
  });

  it("stops at the top tier however much is contributed", () => {
    const atCap = projectEmployerMatchMonthlyCents(1_000_000, 50_000, STANDARD_TIERS);

    expect(projectEmployerMatchMonthlyCents(1_000_000, 200_000, STANDARD_TIERS)).toBe(
      atCap,
    );
  });
});

describe("contribution buckets", () => {
  it("splits monthly dollars across locked, taxable and debt buckets", () => {
    const buckets = projectContributionBuckets(
      12_000_000,
      {
        ...NO_STRATEGY,
        preTax401kSalaryRatePpm: 80_000,
        preTaxHsaSalaryRatePpm: 20_000,
        afterTaxIraRatePpm: 30_000,
        afterTaxBroadIndexRatePpm: 30_000,
        afterTaxSectorRatePpm: 12_500,
        afterTaxSpeculativeRatePpm: 7_500,
        afterTaxExtraDebtRatePpm: 10_000,
      },
      STANDARD_TIERS,
    );

    expect(buckets.preTax401kMonthlyCents).toBe(80_000);
    expect(buckets.hsaMonthlyCents).toBe(20_000);
    expect(buckets.iraMonthlyCents).toBe(30_000);
    expect(buckets.employerMatchMonthlyCents).toBe(40_000);
    expect(buckets.lockedMonthlyCents).toBe(170_000);
    expect(buckets.taxableMonthlyCents).toBe(50_000);
    expect(buckets.extraDebtMonthlyCents).toBe(10_000);
  });

  it("reports no match when the run has no catalog snapshot", () => {
    const buckets = projectContributionBuckets(
      12_000_000,
      { ...NO_STRATEGY, preTax401kSalaryRatePpm: 80_000 },
      null,
    );

    expect(buckets.employerMatchMonthlyCents).toBe(0);
    expect(buckets.lockedMonthlyCents).toBe(80_000);
  });

  it("contributes nothing without salary", () => {
    const buckets = projectContributionBuckets(
      null,
      { ...NO_STRATEGY, preTax401kSalaryRatePpm: 80_000 },
      STANDARD_TIERS,
    );

    expect(buckets.lockedMonthlyCents).toBe(0);
    expect(buckets.taxableMonthlyCents).toBe(0);
  });
});

describe("safety derivations", () => {
  it("measures the buffer in months of required spending", () => {
    expect(emergencyFundMonths(2_418_000, 369_500)).toBeCloseTo(6.54, 2);
  });

  it("is undefined when there is no required spending to survive", () => {
    expect(emergencyFundMonths(2_418_000, 0)).toBeNull();
  });

  it("sizes a target from required spending", () => {
    expect(emergencyFundTargetCents(369_500, 6)).toBe(2_217_000);
  });

  it("adds a full year of premiums to the out-of-pocket maximum", () => {
    expect(worstCaseHealthYearCents(350_000, 21_000)).toBe(602_000);
  });
});

describe("unit conversion", () => {
  it("converts an annual figure to a monthly one", () => {
    expect(annualToMonthlyCents(12_000_000)).toBe(1_000_000);
  });
});
