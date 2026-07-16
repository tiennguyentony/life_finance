import type {
  MissingTeachingDimensionV2,
  TeachingCheckpointV2,
} from "../../core/teaching-presentation-v2";
import type { TeachingFactV2 } from "../../core/teaching-facts-v2";
import { formatTeachingFactValueV2 } from "./teaching-fact-format-v2";

const FACT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  age: "Age",
  after_tax_income: "After-tax income",
  closing_cash: "Closing cash",
  debt_interest: "Debt interest",
  debt_payments: "Debt payments",
  financial_independence_progress: "FI progress",
  financial_independence_target: "FI target",
  gross_income: "Gross income",
  investable_assets_change: "Investable-asset change",
  liabilities_change: "Liabilities change",
  market_value_change: "Market-value change",
  net_worth_change: "Net-worth change",
  total_required_cash: "Total required cash",
});

const MISSING_LABELS: Readonly<
  Record<MissingTeachingDimensionV2["dimensionId"], string>
> = Object.freeze({
  discretionary_spending: "Discretionary spending",
  emergency_fund_months: "Emergency-fund months",
  employee_contributions: "Employee contributions",
  employer_match: "Employer match",
  essential_spending: "Essential spending",
  liquid_solvency: "Liquid solvency",
  current_risks: "Current risks",
});

const SUMMARY_FACT_IDS = new Set([
  "checkpoint.total_gross_income_cents",
  "checkpoint.total_after_tax_income_cents",
  "checkpoint.total_required_cash_cents",
  "checkpoint.total_debt_payments_cents",
  "checkpoint.net_worth_change_cents",
  "checkpoint.closing_cash_cents",
  "checkpoint.fi_progress_ppm",
  "checkpoint.current_risk_score_ppm",
]);

function isDetailedRiskFact(fact: TeachingFactV2): boolean {
  return (
    fact.factId.startsWith("checkpoint.risk.") ||
    fact.factId === "checkpoint.current_debt_to_income_ppm"
  );
}

function FactCard({
  fact,
  summary = false,
}: Readonly<{ fact: TeachingFactV2; summary?: boolean }>) {
  return (
    <div {...(summary ? { "data-teaching-summary-fact": true } : {})}>
      <span>{FACT_LABELS[fact.labelId] ?? fact.labelId.replaceAll("_", " ")}</span>
      <strong>{formatTeachingFactValueV2(fact)}</strong>
      <details>
        <summary>Verified source</summary>
        <code>{fact.source.sourceId}</code>
        <span>{fact.source.field}</span>
      </details>
    </div>
  );
}

export function TeachingCheckpointPanelV2({
  checkpoint,
}: Readonly<{ checkpoint: TeachingCheckpointV2 }>) {
  const summaryFacts = checkpoint.facts.facts.filter(({ factId }) =>
    SUMMARY_FACT_IDS.has(factId),
  );
  const detailedRiskFacts = checkpoint.facts.facts.filter(isDetailedRiskFact);
  const otherFacts = checkpoint.facts.facts.filter(
    (fact) => !SUMMARY_FACT_IDS.has(fact.factId) && !isDetailedRiskFact(fact),
  );
  return (
    <section className="play-panel" aria-label="Teaching checkpoint">
      <div>
        <p className="hero-kicker">Verified teaching checkpoint</p>
        <h2>{checkpoint.monthsAggregated} hidden months summarized</h2>
      </div>
      <div className="cashflow-grid">
        {summaryFacts.map((fact) => (
          <FactCard fact={fact} key={fact.factId} summary />
        ))}
      </div>
      {otherFacts.length > 0 ? (
        <details>
          <summary>Additional verified checkpoint facts</summary>
          <div className="cashflow-grid">
            {otherFacts.map((fact) => <FactCard fact={fact} key={fact.factId} />)}
          </div>
        </details>
      ) : null}
      {detailedRiskFacts.length > 0 ? (
        <details>
          <summary>Detailed risk evidence</summary>
          <div className="cashflow-grid">
            {detailedRiskFacts.map((fact) => <FactCard fact={fact} key={fact.factId} />)}
          </div>
        </details>
      ) : null}
      {checkpoint.missingDimensions.length > 0 ? (
        <div>
          <h3>Unavailable owner data</h3>
          <ul>
            {checkpoint.missingDimensions.map((missing) => (
              <li key={missing.dimensionId}>
                {MISSING_LABELS[missing.dimensionId]}: {missing.reasonCode === "source_unknown" ? "Source unknown" : "Source not recorded"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="play-note">
        Values come from reconciled checkpoint evidence. Policies remain available
        to adjust after reviewing this summary.
      </p>
    </section>
  );
}
