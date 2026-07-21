"use client";

import { hqTab } from "../hq-tabs";
import { HqBanner, HqCard, HqChoiceList, HqScreenHead, HqUnavailable } from "../hq-ui";
import {
  projectRevolvingPayoff,
  revolvingAprPercent,
  revolvingMonthAhead,
  type PayoffProjection,
} from "../hq-derivations";
import { formatCents, formatPpmPercent } from "../hq-view";
import type { ScreenProps } from "./screen-props";

/** The extra payment the payoff race compares against minimums only. */
const RACE_EXTRA_CENTS = 50_000;

export function DebtScreen({
  busy,
  onSelectPlan,
  plans,
  selectedPlanId,
  view,
}: ScreenProps) {
  const debtzilla = hqTab("debt");
  const apr = revolvingAprPercent();
  const balance = view.revolvingUsedCents;
  const minimumsOnly = projectRevolvingPayoff(balance, 0);
  const accelerated = projectRevolvingPayoff(balance, RACE_EXTRA_CENTS);
  const monthAhead = revolvingMonthAhead(balance);
  const usedPercent =
    view.revolvingLimitCents > 0
      ? (balance / view.revolvingLimitCents) * 100
      : 0;
  const totalDebt = Math.max(1, view.debtCents);

  return (
    <div className="hq-screen">
      <HqScreenHead
        characterName={debtzilla.characterName}
        characterSrc={debtzilla.characterSrc}
        line="I eat minimum payments."
        lineTone="negative"
        title="Debt"
      >
        <span
          style={{
            font: "800 1.625rem var(--hq-display)",
            color: view.debtCents > 0 ? "var(--hq-red)" : "var(--hq-green-deep)",
          }}
        >
          {formatCents(view.debtCents)}
        </span>
      </HqScreenHead>

      <div className="hq-columns">
        <HqCard style={{ display: "grid", gap: "0.75rem" }}>
          {view.termDebts.length === 0 && balance <= 0 ? (
            <p className="hq-note" data-tone="positive" style={{ margin: 0 }}>
              No active debt. Event payment plans will appear here as soon as
              you confirm them.
            </p>
          ) : null}

          {view.termDebts.map((debt) => (
            <div key={debt.id}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <b style={{ font: "800 0.9375rem var(--hq-display)" }}>
                  {termDebtLabel(debt)}
                </b>
                <b style={{ font: "800 1.125rem var(--hq-display)", color: "var(--hq-red)" }}>
                  {formatCents(debt.principalCents)}
                </b>
              </div>
              <div className="hq-meter" data-size="lg" style={{ margin: "0.25rem 0" }}>
                <div
                  className="hq-meter-fill"
                  data-tone="negative"
                  style={{
                    width: `${Math.min(100, (debt.principalCents / totalDebt) * 100)}%`,
                  }}
                />
              </div>
              <div className="hq-chip-row" style={{ marginTop: "0.125rem" }}>
                <span className="hq-chip">
                  {formatPpmPercent(debt.annualInterestRatePpm, 1)} APR
                </span>
                <span className="hq-chip">
                  {formatCents(debt.minimumPaymentCents)}/mo minimum
                </span>
                <span className="hq-chip">
                  {debt.remainingTermMonths}{" "}
                  {debt.remainingTermMonths === 1 ? "month" : "months"} remaining
                </span>
              </div>
            </div>
          ))}

          {balance > 0 ? (
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <b style={{ font: "800 0.9375rem var(--hq-display)" }}>Credit card</b>
                <b style={{ font: "800 1.125rem var(--hq-display)", color: "var(--hq-red)" }}>
                  {formatCents(balance)}
                </b>
              </div>
              <div className="hq-meter" data-size="lg" style={{ margin: "0.25rem 0" }}>
                <div
                  className="hq-meter-fill"
                  data-tone="caution"
                  style={{ width: `${Math.min(100, usedPercent)}%` }}
                />
              </div>
              <div className="hq-chip-row" style={{ marginTop: "0.125rem" }}>
                <span className="hq-chip" data-tone="negative">
                  {apr}% APR
                </span>
                <span className="hq-chip">
                  min {formatCents(monthAhead.minimumPaymentCents)}
                </span>
                <span className="hq-chip">
                  {Math.round(usedPercent)}% of limit
                </span>
                <span className="hq-chip" data-tone="negative">
                  +{formatCents(monthAhead.interestCents)} interest/mo
                </span>
              </div>
            </div>
          ) : null}

          {view.debtServiceRatioPpm !== null ? (
            <div className="hq-chip-row" style={{ marginTop: 0 }}>
              <span className="hq-chip">
                debt-service ratio {formatPpmPercent(view.debtServiceRatioPpm)}
              </span>
              <span className="hq-chip">
                credit available {formatCents(view.revolvingAvailableCents)}
              </span>
            </div>
          ) : null}
        </HqCard>

        <HqCard eyebrow={`Payoff race · ${formatCents(balance)}`}>
          {balance <= 0 ? (
            <p className="hq-note" data-tone="positive" style={{ margin: 0 }}>
              No revolving balance. Debtzilla has nothing to feed on.
            </p>
          ) : (
            <>
              <div style={{ display: "grid", gap: "0.625rem", marginTop: "0.75rem" }}>
                <RaceRow
                  label="Minimums"
                  projection={minimumsOnly}
                  tone="negative"
                  widthPercent={100}
                />
                <RaceRow
                  label={`+${formatCents(RACE_EXTRA_CENTS)}/mo`}
                  projection={accelerated}
                  tone="positive"
                  widthPercent={
                    minimumsOnly && accelerated && minimumsOnly.months > 0
                      ? Math.max(6, (accelerated.months / minimumsOnly.months) * 100)
                      : 100
                  }
                />
              </div>
              {minimumsOnly && accelerated && !minimumsOnly.truncated ? (
                <div style={{ marginTop: "0.75rem" }}>
                  <HqBanner
                    label="FAST LANE SAVES"
                    tone="positive"
                    value={formatCents(
                      Math.max(
                        0,
                        minimumsOnly.totalInterestCents - accelerated.totalInterestCents,
                      ),
                    )}
                  />
                </div>
              ) : null}
              {minimumsOnly?.truncated ? (
                <HqUnavailable>
                  At the minimum payment this balance does not clear inside the
                  projection window — interest outruns the payment.
                </HqUnavailable>
              ) : null}
            </>
          )}
        </HqCard>
      </div>

      <h3 className="hq-eyebrow" style={{ margin: "0.125rem 0 -0.25rem" }}>
        Choose one move this month
      </h3>
      <HqChoiceList
        disabled={busy}
        onSelect={onSelectPlan}
        plans={plans}
        selectedPlanId={selectedPlanId}
      />
    </div>
  );
}

function termDebtLabel(debt: HqViewTermDebt): string {
  switch (debt.kind) {
    case "mortgage": return "Mortgage";
    case "student_loan": return "Student loan";
    case "auto_loan": return "Auto loan";
    case "personal_loan": return debt.id.startsWith("debt.event.")
      ? "Event installment plan"
      : "Personal loan";
  }
}

type HqViewTermDebt = ScreenProps["view"]["termDebts"][number];

type RaceRowProps = Readonly<{
  label: string;
  projection: PayoffProjection | null;
  tone: "positive" | "negative";
  widthPercent: number;
}>;

function RaceRow({ label, projection, tone, widthPercent }: RaceRowProps) {
  if (projection === null) return null;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          font: "800 0.75rem var(--hq-body-font)",
        }}
      >
        <span style={{ color: "var(--hq-muted)" }}>{label}</span>
        <b
          style={{
            color: tone === "positive" ? "var(--hq-green-deep)" : "var(--hq-red)",
          }}
        >
          {projection.truncated
            ? "never clears"
            : `${projection.months} mo · ${formatCents(projection.totalInterestCents)} interest`}
        </b>
      </div>
      <div className="hq-meter" data-size="lg" style={{ marginTop: 3 }}>
        <div
          className="hq-meter-fill"
          data-tone={tone === "negative" ? "negative" : undefined}
          style={{ width: `${Math.min(100, widthPercent)}%` }}
        />
      </div>
    </div>
  );
}
