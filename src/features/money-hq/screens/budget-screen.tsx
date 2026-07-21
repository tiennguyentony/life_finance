"use client";

import { hqTab } from "../hq-tabs";
import { HqCard, HqChoiceList, HqScreenHead } from "../hq-ui";
import { formatCents, formatCompactCents } from "../hq-view";
import type { ScreenProps } from "./screen-props";

/** The "cut this much" thought experiment the design leads with. */
const TRIM_MONTHLY_CENTS = 10_000;

export function BudgetScreen({
  busy,
  onSelectPlan,
  plans,
  run,
  selectedPlanId,
  view,
}: ScreenProps) {
  const inflato = hqTab("budget");
  const obligations = run.finances.monthlyObligations;
  const monthlyLiving = obligations.livingCostCents;
  const insuranceMonthly =
    obligations.healthPremiumCents +
    obligations.additionalInsurancePremiumsCents;
  const debtMinimums =
    obligations.termDebtMinimumsCents +
    obligations.revolvingCreditMinimumCents;
  const eventExpensesDue = obligations.eventExpensesDueCents;
  const eventIncomeDue = obligations.eventIncomeDueCents;
  const otherRequired = obligations.otherRequiredCents;
  const debtAndOther = debtMinimums + otherRequired;
  const total = Math.max(1, view.monthlyRequiredCents);
  const share = (part: number) => `${(part / total) * 100}%`;

  // A dollar of recurring cost removed shrinks the FI target by the same
  // multiple the goal projection uses (1 / safe withdrawal rate).
  const fiMultiplier = 1_000_000 / run.goal.safeWithdrawalRatePpm;
  const trimYearlyCents = TRIM_MONTHLY_CENTS * 12;
  const trimTargetCents = Math.round(trimYearlyCents * fiMultiplier);

  const segments = [
    { key: "living", cents: monthlyLiving, color: "var(--hq-blue-bright)", label: "Living" },
    { key: "insurance", cents: insuranceMonthly, color: "var(--hq-purple)", label: "Insurance" },
    { key: "debt", cents: debtAndOther, color: "var(--hq-red-bright)", label: "Debt + other" },
    { key: "event", cents: eventExpensesDue, color: "var(--hq-gold-deep)", label: "event costs due this month" },
  ].filter((segment) => segment.cents > 0);

  return (
    <div className="hq-screen">
      <HqScreenHead
        characterName={inflato.characterName}
        characterSrc={inflato.characterSrc}
        line="Prices only go UP."
        lineTone="negative"
        title="Budget"
      />

      <div className="hq-columns">
        <HqCard
          aside={
            <span className="hq-chip">
              {formatCents(view.annualLivingCostCents)}/yr living
            </span>
          }
          eyebrow="Bills every month"
        >
          <div
            className="hq-figure"
            style={{ fontSize: "3.125rem", margin: "0.25rem 0 0.625rem" }}
          >
            {formatCents(view.monthlyRequiredCents)}
          </div>

          <div className="hq-seg-bar">
            {segments.map((segment) => (
              <div
                className="hq-seg"
                key={segment.key}
                style={{ width: share(segment.cents), background: segment.color }}
              >
                {formatCents(segment.cents)}
              </div>
            ))}
          </div>

          <div className="hq-chip-row" style={{ marginTop: "0.625rem" }}>
            {segments.map((segment) => (
              <span className="hq-chip" key={segment.key}>
                <i className="hq-mix-dot" style={{ background: segment.color }} />
                {segment.label} {formatCents(segment.cents)}
              </span>
            ))}
          </div>

          {eventIncomeDue > 0 ? (
            <p className="hq-note" data-tone="positive" style={{ marginTop: "0.75rem" }}>
              This month also has {formatCents(eventIncomeDue)} of event income
              scheduled before your expenses are funded.
            </p>
          ) : null}
        </HqCard>

        <HqCard
          accent="gold"
          style={{
            display: "grid",
            alignContent: "center",
            justifyItems: "center",
            textAlign: "center",
            gap: "0.25rem",
          }}
        >
          <div className="hq-eyebrow" style={{ color: "var(--hq-gold-deep)" }}>
            Cut {formatCents(TRIM_MONTHLY_CENTS)}/mo and…
          </div>
          <div style={{ display: "flex", gap: "1.125rem", alignItems: "center" }}>
            <div>
              <div style={{ font: "800 1.875rem var(--hq-display)", color: "var(--hq-green-deep)" }}>
                −{formatCents(trimYearlyCents)}
              </div>
              <div style={{ font: "800 0.625rem var(--hq-body-font)", color: "var(--hq-muted)" }}>
                PER YEAR
              </div>
            </div>
            <div>
              <div style={{ font: "800 1.875rem var(--hq-display)", color: "var(--hq-green-deep)" }}>
                −{formatCompactCents(trimTargetCents)}
              </div>
              <div style={{ font: "800 0.625rem var(--hq-body-font)", color: "var(--hq-muted)" }}>
                OFF FI TARGET
              </div>
            </div>
          </div>
          <p className="hq-note" style={{ margin: "0.375rem 0 0" }}>
            Lower required costs shrink the emergency fund <b>and</b> the FI
            target. One trim helps twice.
          </p>
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
