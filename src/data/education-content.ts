export const EDUCATION_CONTENT_VERSION = "education.en-US.2026.1" as const;

export type EducationConcept = Readonly<{
  id: string;
  title: string;
  shortDefinition: string;
  whyItMatters: string;
  decisionTradeoff: string;
}>;

const concepts = [
  {
    id: "financial_independence",
    title: "Financial independence (FI)",
    shortDefinition:
      "FI means your invested assets can support your annual spending without a paycheck. This simulation uses the 4% rule, so the target is 25 times annual living cost.",
    whyItMatters:
      "Every lifestyle increase raises the target, while investing and lowering recurring costs move you closer.",
    decisionTradeoff:
      "Building FI requires saving for tomorrow without leaving too little cash for today.",
  },
  {
    id: "liquidity",
    title: "Liquidity",
    shortDefinition:
      "Liquidity is money you can use quickly to pay a bill. Cash is highly liquid; retirement accounts and home equity are not.",
    whyItMatters:
      "A high net worth does not prevent bankruptcy if the value is locked away when an obligation arrives.",
    decisionTradeoff:
      "More cash improves resilience, but too much idle cash can slow long-term growth.",
  },
  {
    id: "emergency_fund",
    title: "Emergency fund",
    shortDefinition:
      "An emergency fund is liquid cash reserved for unexpected costs or lost income. A common learning target is three to six months of required spending.",
    whyItMatters:
      "It keeps a repair, medical bill, or layoff from forcing an investment sale or expensive credit-card borrowing.",
    decisionTradeoff:
      "Funding the buffer first may delay investing, but it protects investments from forced liquidation.",
  },
  {
    id: "401k",
    title: "401(k)",
    shortDefinition:
      "A 401(k) is an employer-sponsored retirement account. Traditional contributions reduce modeled taxable pay now and grow for retirement.",
    whyItMatters:
      "The selected plan may add an employer match, but the money is not available for ordinary bills.",
    decisionTradeoff:
      "Contributing captures tax advantages and match money; withdrawing early causes withholding and a 10% penalty in this simulation.",
  },
  {
    id: "employer_match",
    title: "Employer match",
    shortDefinition:
      "An employer match is additional retirement money contributed when you contribute your own salary to the workplace plan.",
    whyItMatters:
      "Skipping the matched contribution can mean leaving part of your compensation unused.",
    decisionTradeoff:
      "Capturing the match grows net worth, while your own contribution still reduces current take-home flexibility.",
  },
  {
    id: "hsa",
    title: "Health Savings Account (HSA)",
    shortDefinition:
      "An HSA is a tax-advantaged account for eligible medical costs and requires an HSA-compatible high-deductible health plan.",
    whyItMatters:
      "It can build a medical cushion while reducing modeled taxable pay, and unused funds can carry forward.",
    decisionTradeoff:
      "The contribution reduces current cash and should be considered alongside the plan's deductible and out-of-pocket maximum.",
  },
  {
    id: "ira",
    title: "Individual Retirement Account (IRA)",
    shortDefinition:
      "An IRA is a retirement account opened by an individual rather than through an employer. Annual contributions are limited.",
    whyItMatters:
      "It adds another long-term compounding bucket when workplace-plan saving is not enough or not available.",
    decisionTradeoff:
      "It improves long-term retirement assets but reduces cash available for nearer-term goals.",
  },
  {
    id: "broad_index",
    title: "Broad-market index fund",
    shortDefinition:
      "A broad index fund spreads money across many companies instead of betting on a single stock or industry.",
    whyItMatters:
      "Diversification reduces concentration risk, although the entire market can still fall.",
    decisionTradeoff:
      "It offers liquid long-term growth potential but has short-term volatility and no guaranteed return.",
  },
  {
    id: "sector_investing",
    title: "Sector investing",
    shortDefinition:
      "A sector investment concentrates on one industry, such as technology, finance, or healthcare.",
    whyItMatters:
      "If the investment sector matches your job sector, a downturn can hurt both income security and investments together.",
    decisionTradeoff:
      "Focused exposure can outperform during a boom but increases concentration and market-timing risk.",
  },
  {
    id: "speculation",
    title: "Speculative investing",
    shortDefinition:
      "Speculation takes high uncertainty in pursuit of a large payoff, often based on momentum, hype, or a concentrated thesis.",
    whyItMatters:
      "A dramatic recent gain is not evidence that the next return will be positive.",
    decisionTradeoff:
      "The upside may be large, but losses and forced selling can damage both liquidity and long-term plans.",
  },
  {
    id: "tax_estimate",
    title: "Modeled tax estimate",
    shortDefinition:
      "The game estimates federal and state tax with pinned PolicyEngine rules. It is educational and is not a filed return or professional tax advice.",
    whyItMatters:
      "Tax reduces gross salary before spendable cash, and eligible pre-tax contributions change the modeled result.",
    decisionTradeoff:
      "A tax-advantaged contribution may lower current modeled tax while locking or restricting some of the money.",
  },
  {
    id: "deductible",
    title: "Insurance deductible",
    shortDefinition:
      "A deductible is the covered cost you pay before the health plan starts sharing eligible expenses.",
    whyItMatters:
      "A low monthly premium can still expose you to a large bill before coinsurance and the out-of-pocket cap help.",
    decisionTradeoff:
      "Plan selection balances predictable premiums against the size of possible out-of-pocket costs.",
  },
  {
    id: "dti",
    title: "Debt-to-income ratio (DTI)",
    shortDefinition:
      "DTI compares total debt with annual gross income in this simulation. It is one signal of how much debt pressure the household carries.",
    whyItMatters:
      "Higher debt leaves less room to absorb income loss, rate changes, or new mandatory costs.",
    decisionTradeoff:
      "Paying debt lowers risk and interest but uses cash that could otherwise remain liquid or invested.",
  },
  {
    id: "exposure",
    title: "Exposure score",
    shortDefinition:
      "Exposure summarizes emergency runway, debt, credit use, insurance gaps, concentration, and job-to-investment correlation.",
    whyItMatters:
      "The event system uses demonstrated weaknesses to choose fair, bounded pressure rather than arbitrary punishment.",
    decisionTradeoff:
      "Taking productive risk can grow wealth, but stacking several related risks makes one shock more damaging.",
  },
  {
    id: "compounding",
    title: "Compounding",
    shortDefinition:
      "Compounding occurs when returns can earn later returns. Time and consistent contributions can matter as much as the monthly amount.",
    whyItMatters:
      "Starting earlier gives each contribution more periods to grow before retirement.",
    decisionTradeoff:
      "Long-term compounding requires tolerating short-term volatility without abandoning the plan after a bad month.",
  },
  {
    id: "lifestyle_creep",
    title: "Lifestyle creep",
    shortDefinition:
      "Lifestyle creep is the gradual conversion of higher income into permanently higher recurring spending.",
    whyItMatters:
      "It reduces monthly surplus and raises the FI target because the portfolio must support a larger annual burn.",
    decisionTradeoff:
      "Spending can improve life now, but recurring upgrades are harder to reverse than one-time purchases.",
  },
] as const satisfies readonly EducationConcept[];

export const EDUCATION_CONCEPTS: readonly EducationConcept[] = Object.freeze(
  concepts.map((concept) => Object.freeze({ ...concept })),
);

export function getEducationConcept(id: string): EducationConcept | undefined {
  return EDUCATION_CONCEPTS.find((concept) => concept.id === id);
}

