"use client";

import type { BoardMonthResult } from "@/features/board/board-model";
import { useModalDialog } from "@/features/board/use-modal-dialog";

import { HqLedger, type LedgerEntry } from "../hq-ui";
import { formatMonthLabel, formatSignedCents } from "../hq-view";

type Props = Readonly<{
  onDismiss: () => void;
  result: BoardMonthResult;
}>;

function pointsDelta(ppm: number): string {
  const points = ppm / 10_000;
  const formatted = `${Math.abs(points).toFixed(1)} pts`;
  if (points > 0) return `+${formatted}`;
  if (points < 0) return `−${formatted}`;
  return formatted;
}

export function HqMonthResultDialog({ onDismiss, result }: Props) {
  const dialogRef = useModalDialog(true, { restoreFocus: !result.hasPendingEvent });
  const explanation = result.monthlyExplanation;
  const taxBreakdown = explanation?.taxBreakdown ?? null;

  const outcomes: readonly LedgerEntry[] = [
    {
      label: "Cash",
      value: formatSignedCents(result.cashChangeCents),
      tone: result.cashChangeCents >= 0 ? "positive" : "negative",
    },
    {
      label: "Net worth",
      value: formatSignedCents(result.netWorthChangeCents),
      tone: result.netWorthChangeCents >= 0 ? "positive" : "negative",
    },
    {
      label: "Debt",
      value: formatSignedCents(result.debtChangeCents),
      tone: result.debtChangeCents <= 0 ? "positive" : "negative",
    },
    {
      label: "Goal progress",
      value: pointsDelta(result.goalProgressChangePpm),
      tone: result.goalProgressChangePpm >= 0 ? "positive" : "negative",
    },
    {
      label: "Risk",
      value: `${pointsDelta(result.riskSeverityChangePpm)}${
        result.riskSeverityChangePpm < 0 ? " (lower)" : ""
      }`,
      tone: result.riskSeverityChangePpm <= 0 ? "positive" : "negative",
    },
    {
      label: "Preparedness",
      value: pointsDelta(result.preparednessScoreChangePpm),
      tone: result.preparednessScoreChangePpm >= 0 ? "positive" : "negative",
    },
    ...(result.taxableInvestmentsChangeCents === 0
      ? []
      : [{
          label: "Taxable investments",
          value: formatSignedCents(result.taxableInvestmentsChangeCents),
          tone: result.taxableInvestmentsChangeCents >= 0 ? "positive" as const : "negative" as const,
        }]),
    ...(result.annualLivingCostChangeCents === 0
      ? []
      : [{
          label: "Annual living cost",
          value: `${formatSignedCents(result.annualLivingCostChangeCents)}/yr`,
          tone: result.annualLivingCostChangeCents <= 0 ? "positive" as const : "negative" as const,
        }]),
    ...(result.requiredObligationsChangeCents === 0
      ? []
      : [{
          label: "Required monthly obligations",
          value: `${formatSignedCents(result.requiredObligationsChangeCents)}/mo`,
          tone: result.requiredObligationsChangeCents <= 0 ? "positive" as const : "negative" as const,
        }]),
    ...(result.annualGrossSalaryChangeCents === 0
      ? []
      : [{
          label: "Annual gross salary",
          value: `${formatSignedCents(result.annualGrossSalaryChangeCents)}/yr`,
          tone: result.annualGrossSalaryChangeCents >= 0 ? "positive" as const : "negative" as const,
        }]),
  ];

  // Every line below is a field the engine returned for the processed month.
  const ledger: readonly LedgerEntry[] = explanation === null
    ? []
    : [
        {
          label: "Gross employment income",
          value: formatSignedCents(explanation.grossIncomeCents),
          tone: "positive",
        },
        ...(taxBreakdown === null
          ? [{
              label: "Taxes and withholding",
              value: formatSignedCents(-explanation.totalTaxCents),
              tone: "negative" as const,
              total: true,
            }]
          : [
              {
                label: "Federal income tax",
                value: formatSignedCents(-taxBreakdown.monthlyFederalIncomeTaxCents),
                tone: "negative" as const,
              },
              {
                label: "State income tax",
                value: formatSignedCents(-taxBreakdown.monthlyStateIncomeTaxCents),
                tone: taxBreakdown.monthlyStateIncomeTaxCents === 0 ? "neutral" as const : "negative" as const,
              },
              {
                label: "Social Security + Medicare",
                value: formatSignedCents(-taxBreakdown.monthlyEmployeePayrollTaxCents),
                tone: "negative" as const,
              },
              ...(taxBreakdown.monthlySelfEmploymentTaxCents === 0
                ? []
                : [{
                    label: "Self-employment tax",
                    value: formatSignedCents(-taxBreakdown.monthlySelfEmploymentTaxCents),
                    tone: "negative" as const,
                  }]),
              {
                label: "Total taxes and withholding",
                value: formatSignedCents(-explanation.totalTaxCents),
                tone: "negative" as const,
                total: true,
              },
            ]),
        {
          label: "After-tax cash income",
          value: formatSignedCents(explanation.afterTaxCashIncomeCents),
          tone: "positive",
        },
        {
          label: "Required cash paid",
          value: formatSignedCents(-explanation.requiredCashCents),
          tone: "negative",
        },
        ...(explanation.resolvedIncomeCents === 0
          ? []
          : [{
              label: "Event and other income",
              value: formatSignedCents(explanation.resolvedIncomeCents),
              tone: "positive" as const,
            }]),
        ...(explanation.resolvedExpenseCents === 0
          ? []
          : [{
              label: "Event and other expenses",
              value: formatSignedCents(-explanation.resolvedExpenseCents),
              tone: "negative" as const,
            }]),
        ...(explanation.insurancePlayerCostCents === 0
          ? []
          : [{
              label: "Insurance claim cost",
              value: formatSignedCents(-explanation.insurancePlayerCostCents),
              tone: "negative" as const,
            }]),
        {
          label: "Debt interest included",
          value: formatSignedCents(-explanation.debtInterestCents),
          tone: "negative",
        },
        {
          label: "Debt payments included",
          value: formatSignedCents(-explanation.debtPaymentCents),
          tone: "negative",
        },
        {
          label: "Market movement",
          value: formatSignedCents(explanation.marketValueChangeCents),
          tone: explanation.marketValueChangeCents >= 0 ? "positive" : "negative",
        },
        {
          label: "Inflation added to annual costs",
          value: `${formatSignedCents(explanation.annualInflationIncreaseCents)}/yr`,
          tone: "negative",
        },
      ];

  return (
    <dialog className="hq-dialog" ref={dialogRef}>
      <div className="hq">
        <h2 className="hq-dialog-title">
          {formatMonthLabel(result.fromMonth)}: month complete!
        </h2>
        <p className="hq-screen-subtitle">Plan: {result.planLabel}</p>

        <section className="hq-card" style={{ marginTop: "0.75rem" }}>
          <h3 className="hq-eyebrow" style={{ margin: "0 0 0.5rem" }}>
            What changed
          </h3>
          <HqLedger entries={outcomes} />
        </section>

        <section className="hq-card" style={{ marginTop: "0.75rem" }}>
          <h3 className="hq-eyebrow" style={{ margin: "0 0 0.5rem" }}>
            Why the numbers changed
          </h3>
          {explanation === null ? (
            <p className="hq-unavailable">
              This month advanced through a recovery path that does not return a
              per-line breakdown. The balances above are still authoritative.
            </p>
          ) : (
            <>
              <HqLedger entries={ledger} />
              <p className="hq-note" style={{ marginTop: "0.625rem" }}>
                Read it like a paycheck: income − taxes − bills − debt = what is
                left for future you. Every line is calculated by the engine.
              </p>
            </>
          )}
        </section>

        {result.completedProgramIds.length > 0 ? (
          <p className="hq-note" data-tone="positive" style={{ marginTop: "0.75rem" }}>
            Course complete:{" "}
            {result.completedProgramIds.map((id) => id.replace("upskill.", "")).join(", ")}
            . Watch your salary.
          </p>
        ) : null}
        {result.startedProgramIds.length > 0 ? (
          <p className="hq-note" data-tone="caution" style={{ marginTop: "0.5rem" }}>
            Course started:{" "}
            {result.startedProgramIds.map((id) => id.replace("upskill.", "")).join(", ")}
            . The salary bump lands when it finishes.
          </p>
        ) : null}

        <div className="hq-dialog-actions">
          <button autoFocus className="hq-button" onClick={onDismiss} type="button">
            {result.hasPendingEvent ? "Resolve the decision" : "Plan the next month"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
