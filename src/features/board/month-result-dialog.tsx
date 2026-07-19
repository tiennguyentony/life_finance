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

  const deltaRows = [
    ["Cash", formatMoneyDelta(result.cashChangeCents)],
    ["Net worth", formatMoneyDelta(result.netWorthChangeCents)],
    ["Debt", formatMoneyDelta(result.debtChangeCents)],
    ["Goal progress", formatProgressDelta(result.goalProgressChangePpm)],
  ] as const;
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

        {checkpoint !== null ? (
          <section className="board-month-result-highlight">
            <h3>12-month checkpoint: {checkpointOutcome}</h3>
            <p>Preparedness score {Math.round(checkpoint.scorePpm / 10_000)}%</p>
            <p>Focus next: {focusLabel}</p>
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
