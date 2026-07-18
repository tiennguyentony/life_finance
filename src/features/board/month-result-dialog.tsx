"use client";

import { formatBoardMoney, type BoardMonthResult } from "./board-model";
import { useModalDialog } from "./use-modal-dialog";

type MonthResultDialogProps = Readonly<{
  busy: boolean;
  onContinue: () => void;
  result: BoardMonthResult | null;
  returnFocusTarget: HTMLElement | null;
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
  onContinue,
  result,
  returnFocusTarget,
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

        {result.hasPendingEvent ? (
          <p aria-live="assertive" role="status">
            A life decision is waiting before the next month.
          </p>
        ) : null}

        <dl className="board-month-result-deltas">
          {deltaRows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        <button disabled={busy} onClick={onContinue} type="button">
          {busy
            ? "Continuing..."
            : result.hasPendingEvent
              ? "Review decision"
              : `Continue to ${formatMonth(result.toMonth)}`}
        </button>
      </section>
    </dialog>
  );
}
