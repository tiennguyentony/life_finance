"use client";

import { hqTab } from "../hq-tabs";
import { HqCard, HqChoiceList, HqSpeech, HqUnavailable } from "../hq-ui";
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

  return (
    <div className="hq-screen">
      <div className="hq-screen-head">
        <div>
          <h2 className="hq-screen-title">Debt Dungeon</h2>
          <p className="hq-screen-subtitle">
            See every installment, student, mortgage, and revolving balance in one place.
          </p>
        </div>
        <div className="hq-planbar-spacer" />
        <HqSpeech
          characterName={debtzilla.characterName}
          characterSrc={debtzilla.characterSrc}
          tone="hostile"
        >
          Carry that balance, pleeease. Every month it sits there, I nibble{" "}
          <b>{apr}% APR</b>. Crunch crunch.
        </HqSpeech>
      </div>

      <div className="hq-columns">
        <div className="hq-column">
          <HqCard
            aside={
              <span className="hq-chip" data-tone={view.debtCents > 0 ? "negative" : "positive"}>
                {formatCents(view.debtCents)} total debt
              </span>
            }
            eyebrow="Term and installment debts"
          >
            {view.termDebts.length === 0 ? (
              <p className="hq-note" data-tone="positive">
                No active term debt. Event payment plans will appear here as soon as you confirm them.
              </p>
            ) : (
              <div style={{ display: "grid", gap: "0.625rem" }}>
                {view.termDebts.map((debt) => (
                  <div
                    key={debt.id}
                    style={{
                      display: "grid",
                      gap: "0.25rem",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      padding: "0.625rem 0.75rem",
                      borderRadius: 12,
                      background: "var(--hq-stage)",
                    }}
                  >
                    <div>
                      <div style={{ font: "800 0.8125rem var(--hq-display)", color: "var(--hq-ink)" }}>
                        {termDebtLabel(debt)}
                      </div>
                      <div style={{ font: "600 0.6875rem var(--hq-body-font)", color: "var(--hq-muted)" }}>
                        {formatPpmPercent(debt.annualInterestRatePpm, 1)} APR · {debt.remainingTermMonths} {debt.remainingTermMonths === 1 ? "month" : "months"} remaining
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ font: "800 0.875rem var(--hq-display)", color: "var(--hq-red)" }}>
                        {formatCents(debt.principalCents)}
                      </div>
                      <div style={{ font: "600 0.6875rem var(--hq-body-font)", color: "var(--hq-muted)" }}>
                        {formatCents(debt.minimumPaymentCents)}/mo minimum
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </HqCard>

          <HqCard
            aside={
              <span className="hq-chip" data-tone="negative">
                {apr}% APR · scenario credit policy
              </span>
            }
            eyebrow="Revolving credit balance"
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem" }}>
              <div className="hq-figure" data-tone="debt">
                {formatCents(balance)}
              </div>
              <span className="hq-nav-hint">
                of {formatCents(view.revolvingLimitCents)} limit
              </span>
            </div>

            <div className="hq-meter" data-size="lg">
              <div
                className="hq-meter-fill"
                data-tone="negative"
                style={{ width: `${Math.min(100, usedPercent)}%` }}
              />
            </div>

            <div
              style={{
                display: "grid",
                gap: "0.625rem",
                gridTemplateColumns: "repeat(auto-fit, minmax(8rem, 1fr))",
                marginTop: "0.625rem",
              }}
            >
              <MiniStat
                label="Interest this month"
                tone="debt"
                value={formatCents(monthAhead.interestCents)}
              />
              <MiniStat
                label="Next minimum"
                value={formatCents(monthAhead.minimumPaymentCents)}
              />
              <MiniStat
                label="Credit available"
                value={formatCents(view.revolvingAvailableCents)}
              />
              <MiniStat
                label="Debt-service ratio"
                value={
                  view.debtServiceRatioPpm === null
                    ? "No salary"
                    : formatPpmPercent(view.debtServiceRatioPpm)
                }
              />
            </div>
          </HqCard>

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

        <div className="hq-column">
          <HqCard eyebrow="The great net-worth mystery">
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                padding: "0.75rem",
                borderRadius: 14,
                background: "var(--hq-stage)",
              }}
            >
              <MysteryTerm tone="negative">Cash down</MysteryTerm>
              <span style={{ font: "800 1rem var(--hq-display)", color: "var(--hq-soft)" }}>
                +
              </span>
              <MysteryTerm tone="positive">Debt down</MysteryTerm>
              <span style={{ font: "800 1rem var(--hq-display)", color: "var(--hq-soft)" }}>
                =
              </span>
              <MysteryTerm tone="blue">Net worth ±$0</MysteryTerm>
            </div>
            <p
              style={{
                font: "600 0.78125rem var(--hq-body-font)",
                color: "var(--hq-body)",
                lineHeight: 1.5,
                margin: "0.625rem 0 0",
              }}
            >
              Paying debt moves money from one pocket to another <b>today</b>.
              The win is every month after: interest that never gets charged —
              a guaranteed {apr}% return no market can promise.
            </p>
          </HqCard>

          <HqCard eyebrow={`Revolving payoff race · ${formatCents(balance)} balance`}>
            {balance <= 0 ? (
              <p className="hq-note" data-tone="positive">
                No revolving balance. Debtzilla has nothing to feed on.
              </p>
            ) : (
              <>
                <RaceRow
                  label="Minimums only"
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
                      ? Math.max(
                          14,
                          (accelerated.months / minimumsOnly.months) * 100,
                        )
                      : 100
                  }
                />
                {minimumsOnly && accelerated && !minimumsOnly.truncated ? (
                  <p className="hq-note" data-tone="positive" style={{ marginTop: "0.75rem" }}>
                    Paying faster saves{" "}
                    {formatCents(
                      minimumsOnly.totalInterestCents - accelerated.totalInterestCents,
                    )}{" "}
                    of interest. Minimum payments are Debtzilla&rsquo;s favourite
                    food.
                  </p>
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
      </div>
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

type MiniStatProps = Readonly<{
  label: string;
  value: string;
  tone?: "debt";
}>;

function MiniStat({ label, value, tone }: MiniStatProps) {
  return (
    <div style={{ padding: "0.5rem 0.75rem", borderRadius: 12, background: "var(--hq-stage)" }}>
      <div style={{ font: "700 0.625rem var(--hq-body-font)", color: "var(--hq-soft)" }}>
        {label}
      </div>
      <div
        style={{
          font: "800 1rem var(--hq-display)",
          color: tone === "debt" ? "var(--hq-red)" : "var(--hq-ink)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function MysteryTerm({
  children,
  tone,
}: Readonly<{ children: React.ReactNode; tone: "positive" | "negative" | "blue" }>) {
  const palette = {
    positive: { background: "var(--hq-green-soft)", color: "var(--hq-green-deep)" },
    negative: { background: "var(--hq-red-soft)", color: "var(--hq-red)" },
    blue: { background: "var(--hq-blue-soft)", color: "var(--hq-blue)" },
  } as const;

  return (
    <span
      style={{
        ...palette[tone],
        padding: "0.375rem 0.75rem",
        borderRadius: 10,
        font: "800 0.8125rem var(--hq-body-font)",
      }}
    >
      {children}
    </span>
  );
}

type RaceRowProps = Readonly<{
  label: string;
  projection: PayoffProjection | null;
  tone: "positive" | "negative";
  widthPercent: number;
}>;

function RaceRow({ label, projection, tone, widthPercent }: RaceRowProps) {
  if (projection === null) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.625rem" }}>
      <span
        style={{
          width: "7rem",
          flex: "0 0 auto",
          font: "700 0.6875rem var(--hq-body-font)",
          color: "var(--hq-muted)",
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, height: 18, borderRadius: 999, background: "var(--hq-stage)" }}>
        <div
          style={{
            width: `${Math.min(100, widthPercent)}%`,
            minWidth: "8rem",
            height: "100%",
            borderRadius: 999,
            display: "grid",
            placeItems: "center",
            background:
              tone === "positive" ? "var(--hq-green)" : "var(--hq-red-light)",
            font: "800 0.625rem var(--hq-body-font)",
            color: "#fff",
          }}
        >
          {projection.truncated
            ? "never clears"
            : `${projection.months} mo · ${formatCents(projection.totalInterestCents)} interest`}
        </div>
      </div>
    </div>
  );
}
