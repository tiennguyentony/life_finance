"use client";

import { formatBoardMoney, type BoardMonthResult } from "./board-model";
import { useModalDialog } from "./use-modal-dialog";

type MonthResultDialogProps = Readonly<{
  busy: boolean;
  onPrimary: () => void;
  onSecondary: () => void;
  primaryLabel: string;
  result: BoardMonthResult | null;
  returnFocusTarget: HTMLElement | null;
  secondaryLabel: string | null;
  summary: string | null;
}>;

function formatMonth(month: string): string {
  const [year, monthNumber] = month.split("-");
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${year}-${monthNumber}-01T00:00:00Z`));
}

function formatMoneyDelta(cents: number): string {
  const formatted = formatBoardMoney(cents / 100);
  return cents > 0 ? `+${formatted}` : formatted;
}

function formatProgressDelta(ppm: number): string {
  const percentagePoints = ppm / 10_000;
  const formatted = `${Math.abs(percentagePoints).toFixed(1)} percentage points`;
  return percentagePoints > 0 ? `+${formatted}` : percentagePoints < 0 ? `-${formatted}` : formatted;
}

function formatRiskDelta(ppm: number): string {
  const delta = formatProgressDelta(ppm);
  return ppm < 0 ? `${delta} (lower risk)` : ppm > 0 ? `${delta} (higher risk)` : delta;
}

function formatBufferTarget(ppm: number): string {
  const months = ppm / 1_000_000;
  return `${Number.isInteger(months) ? months.toFixed(0) : months.toFixed(1)} months`;
}

export function MonthResultDialog({
  busy,
  onPrimary,
  onSecondary,
  primaryLabel,
  result,
  returnFocusTarget,
  secondaryLabel,
  summary,
}: MonthResultDialogProps) {
  const restoreFocus = result ? !result.hasPendingEvent : true;
  const dialogRef = useModalDialog(result !== null, { restoreFocus, returnFocusTarget });

  if (!result) return null;

  const deltaRows: readonly (readonly [string, string])[] = [
    ["Cash", formatMoneyDelta(result.cashChangeCents)],
    ["Net worth", formatMoneyDelta(result.netWorthChangeCents)],
    ["Debt", formatMoneyDelta(result.debtChangeCents)],
    ["Goal progress", formatProgressDelta(result.goalProgressChangePpm)],
    ...(result.taxableInvestmentsChangeCents === 0
      ? []
      : [["Taxable investments", formatMoneyDelta(result.taxableInvestmentsChangeCents)] as const]),
    ...(result.annualLivingCostChangeCents === 0
      ? []
      : [["Annual living cost", formatMoneyDelta(result.annualLivingCostChangeCents)] as const]),
    ...(result.requiredObligationsChangeCents === 0
      ? []
      : [["Required monthly expenses", formatMoneyDelta(result.requiredObligationsChangeCents)] as const]),
    ...(result.annualGrossSalaryChangeCents === 0
      ? []
      : [["Annual salary", formatMoneyDelta(result.annualGrossSalaryChangeCents)] as const]),
    ...(result.emergencyFundTargetMonthsPpm === null
      ? []
      : [["Safety buffer target", formatBufferTarget(result.emergencyFundTargetMonthsPpm)] as const]),
    ...(result.riskSeverityChangePpm === 0
      ? []
      : [["Risk exposure", formatRiskDelta(result.riskSeverityChangePpm)] as const]),
    ...(result.preparednessScoreChangePpm === 0
      ? []
      : [["Financial preparedness", formatProgressDelta(result.preparednessScoreChangePpm)] as const]),
  ];
  const checkpoint = result.beginnerCheckpoint;
  const checkpointOutcome = checkpoint === null
    ? null
    : checkpoint.outcome.charAt(0).toUpperCase() + checkpoint.outcome.slice(1);
  const focusLabel = checkpoint === null
    ? null
    : {
        liquidity: "Emergency fund",
        cash_flow: "Cash flow",
        debt: "Debt management",
        insurance: "Insurance",
        diversification: "Diversification",
      }[checkpoint.weakestComponent];
  const explanation = result.monthlyExplanation;
  const explanationRows: readonly (readonly [string, string])[] =
    explanation === null
      ? []
      : [
          ["Gross employment income", formatMoneyDelta(explanation.grossIncomeCents)],
          ["Taxes and withholding", formatMoneyDelta(-explanation.totalTaxCents)],
          ["After-tax cash income", formatMoneyDelta(explanation.afterTaxCashIncomeCents)],
          ...(explanation.resolvedIncomeCents === 0
            ? []
            : [["Event and other income", formatMoneyDelta(explanation.resolvedIncomeCents)] as const]),
          ...(explanation.resolvedExpenseCents === 0
            ? []
            : [["Event expenses", formatMoneyDelta(-explanation.resolvedExpenseCents)] as const]),
          ["Required cash paid", formatMoneyDelta(-explanation.requiredCashCents)],
          ...(explanation.debtInterestCents === 0
            ? []
            : [["Debt interest included", formatMoneyDelta(-explanation.debtInterestCents)] as const]),
          ...(explanation.debtPaymentCents === 0
            ? []
            : [["Debt payments included", formatMoneyDelta(-explanation.debtPaymentCents)] as const]),
          ...(explanation.insurancePlayerCostCents === 0
            ? []
            : [["Insurance claim cost", formatMoneyDelta(-explanation.insurancePlayerCostCents)] as const]),
          ["Market movement", formatMoneyDelta(explanation.marketValueChangeCents)],
          ...(explanation.annualInflationIncreaseCents === 0
            ? []
            : [["Annual cost added by inflation", formatMoneyDelta(explanation.annualInflationIncreaseCents)] as const]),
        ];

  return (
    <dialog
      aria-labelledby="board-month-result-title"
      aria-modal="true"
      className="board-month-result-dialog"
      onCancel={(event) => event.preventDefault()}
      ref={dialogRef}
      role="dialog"
    >
      <section>
        <header>
          <h2 id="board-month-result-title">
            {formatMonth(result.toMonth)}: {result.hasPendingEvent ? "Review life decision" : "Month complete"}
          </h2>
          <p>Plan: {result.planLabel}</p>
        </header>

        {summary !== null || result.hasPendingEvent ? (
          <p aria-live="assertive" role="status">
            {summary ?? "A life decision is waiting before the next month."}
          </p>
        ) : null}

        {result.completedProgramIds.length > 0 ? (
          <section className="board-month-result-highlight">
            <h3>Course completed</h3>
            <p>{result.completedProgramIds.join(", ")}</p>
          </section>
        ) : null}

        {result.startedProgramIds.length > 0 ? (
          <section className="board-month-result-highlight">
            <h3>Course started</h3>
            <p>{result.startedProgramIds.join(", ")}</p>
          </section>
        ) : null}

        {checkpoint !== null ? (
          <section className="board-month-result-highlight">
            <h3>12-month checkpoint: {checkpointOutcome}</h3>
            <p>Preparedness score {Math.round(checkpoint.scorePpm / 10_000)}%</p>
            <p>Focus next: {focusLabel}</p>
          </section>
        ) : null}

        {explanationRows.length > 0 ? (
          <section className="board-month-result-breakdown">
            <h3>Why the numbers changed</h3>
            <p>Backend-calculated evidence for {formatMonth(explanation!.processedMonth)}.</p>
            <dl className="board-month-result-deltas">
              {explanationRows.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        <dl className="board-month-result-deltas">
          {deltaRows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        <div className="board-month-result-actions">
          <button disabled={busy} onClick={onPrimary} type="button">
            {busy ? "Continuing..." : primaryLabel}
          </button>
          {secondaryLabel === null ? null : (
            <button disabled={busy} onClick={onSecondary} type="button">
              {secondaryLabel}
            </button>
          )}
        </div>
      </section>
    </dialog>
  );
}
