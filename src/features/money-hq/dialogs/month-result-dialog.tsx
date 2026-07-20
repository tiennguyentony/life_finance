"use client";

import type { BoardMonthResult } from "@/features/board/board-model";
import { useModalDialog } from "@/features/board/use-modal-dialog";

import {
  HqDeltaGrid,
  HqFlowBars,
  type DeltaTile,
  type FlowBar,
} from "../hq-ui";
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

function deltaTone(value: number, goodWhenNegative = false): DeltaTile["tone"] {
  if (value === 0) return "neutral";
  const good = goodWhenNegative ? value < 0 : value > 0;
  return good ? "positive" : "negative";
}

export function HqMonthResultDialog({ onDismiss, result }: Props) {
  const dialogRef = useModalDialog(true, { restoreFocus: !result.hasPendingEvent });
  const explanation = result.monthlyExplanation;
  const taxBreakdown = explanation?.taxBreakdown ?? null;

  const tiles: readonly DeltaTile[] = [
    {
      label: "Cash",
      value: formatSignedCents(result.cashChangeCents),
      tone: deltaTone(result.cashChangeCents),
    },
    {
      label: "Net worth",
      value: formatSignedCents(result.netWorthChangeCents),
      tone: deltaTone(result.netWorthChangeCents),
    },
    {
      label: "Debt",
      value: formatSignedCents(result.debtChangeCents),
      tone: deltaTone(result.debtChangeCents, true),
    },
    {
      label: "Goal progress",
      value: pointsDelta(result.goalProgressChangePpm),
      tone: deltaTone(result.goalProgressChangePpm),
    },
    {
      label: "Risk",
      value: pointsDelta(result.riskSeverityChangePpm),
      tone: deltaTone(result.riskSeverityChangePpm, true),
    },
    {
      label: "Preparedness",
      value: pointsDelta(result.preparednessScoreChangePpm),
      tone: deltaTone(result.preparednessScoreChangePpm),
    },
    ...(result.taxableInvestmentsChangeCents === 0
      ? []
      : [{
          label: "Taxable funds",
          value: formatSignedCents(result.taxableInvestmentsChangeCents),
          tone: deltaTone(result.taxableInvestmentsChangeCents),
        }]),
  ];

  // Monthly cash items only; annual-rate shifts render as chips further down.
  const flows: readonly FlowBar[] = explanation === null
    ? []
    : [
        { label: "Paycheck (gross)", cents: explanation.grossIncomeCents },
        { label: "Taxes withheld", cents: -explanation.totalTaxCents },
        { label: "Bills and essentials", cents: -explanation.requiredCashCents },
        ...(explanation.resolvedIncomeCents === 0
          ? []
          : [{ label: "Event income", cents: explanation.resolvedIncomeCents }]),
        ...(explanation.resolvedExpenseCents === 0
          ? []
          : [{ label: "Event costs", cents: -explanation.resolvedExpenseCents }]),
        ...(explanation.insurancePlayerCostCents === 0
          ? []
          : [{
              label: "Insurance claim",
              cents: -explanation.insurancePlayerCostCents,
            }]),
        { label: "Debt interest", cents: -explanation.debtInterestCents },
        { label: "Debt payments", cents: -explanation.debtPaymentCents },
        { label: "Market movement", cents: explanation.marketValueChangeCents },
      ];

  const ongoingChips: readonly { label: string; tone: "positive" | "negative" }[] = [
    ...(explanation === null || explanation.annualInflationIncreaseCents === 0
      ? []
      : [{
          label: `Inflation ${formatSignedCents(explanation.annualInflationIncreaseCents)}/yr on living costs`,
          tone: "negative" as const,
        }]),
    ...(result.annualLivingCostChangeCents === 0
      ? []
      : [{
          label: `Living costs ${formatSignedCents(result.annualLivingCostChangeCents)}/yr`,
          tone: result.annualLivingCostChangeCents <= 0
            ? ("positive" as const)
            : ("negative" as const),
        }]),
    ...(result.requiredObligationsChangeCents === 0
      ? []
      : [{
          label: `Monthly bills ${formatSignedCents(result.requiredObligationsChangeCents)}/mo`,
          tone: result.requiredObligationsChangeCents <= 0
            ? ("positive" as const)
            : ("negative" as const),
        }]),
    ...(result.annualGrossSalaryChangeCents === 0
      ? []
      : [{
          label: `Salary ${formatSignedCents(result.annualGrossSalaryChangeCents)}/yr`,
          tone: result.annualGrossSalaryChangeCents >= 0
            ? ("positive" as const)
            : ("negative" as const),
        }]),
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
          <HqDeltaGrid tiles={tiles} />
        </section>

        <section className="hq-card" style={{ marginTop: "0.75rem" }}>
          <h3 className="hq-eyebrow" style={{ margin: "0 0 0.5rem" }}>
            Money in, money out
          </h3>
          {explanation === null ? (
            <p className="hq-unavailable">
              This month advanced through a recovery path without a per-line
              breakdown. The tiles above are still authoritative.
            </p>
          ) : (
            <>
              <HqFlowBars bars={flows} />
              {taxBreakdown === null ? null : (
                <div className="hq-chip-row" style={{ marginTop: "0.625rem" }}>
                  <span className="hq-chip">
                    Federal {formatSignedCents(-taxBreakdown.monthlyFederalIncomeTaxCents)}
                  </span>
                  <span className="hq-chip">
                    State {formatSignedCents(-taxBreakdown.monthlyStateIncomeTaxCents)}
                  </span>
                  <span className="hq-chip">
                    Social Security + Medicare{" "}
                    {formatSignedCents(-taxBreakdown.monthlyEmployeePayrollTaxCents)}
                  </span>
                  {taxBreakdown.monthlySelfEmploymentTaxCents === 0 ? null : (
                    <span className="hq-chip">
                      Self-employment{" "}
                      {formatSignedCents(-taxBreakdown.monthlySelfEmploymentTaxCents)}
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        {ongoingChips.length > 0 ? (
          <section className="hq-card" style={{ marginTop: "0.75rem" }}>
            <h3 className="hq-eyebrow" style={{ margin: "0 0 0.5rem" }}>
              Now recurring
            </h3>
            <div className="hq-chip-row">
              {ongoingChips.map((chip) => (
                <span className="hq-chip" data-tone={chip.tone} key={chip.label}>
                  {chip.label}
                </span>
              ))}
            </div>
          </section>
        ) : null}

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
