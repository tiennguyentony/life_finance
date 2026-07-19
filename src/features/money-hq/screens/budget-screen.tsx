"use client";

import { getEducationConcept } from "../hq-concepts";
import { hqTab } from "../hq-tabs";
import { HqCard, HqChoiceList, HqSpeech, HqUnavailable } from "../hq-ui";
import { formatCents } from "../hq-view";
import type { ScreenProps } from "./screen-props";

export function BudgetScreen({
  busy,
  onSelectPlan,
  plans,
  run,
  selectedPlanId,
  view,
}: ScreenProps) {
  const inflato = hqTab("budget");
  const creep = getEducationConcept("lifestyle_creep");
  const obligations = run.finances.monthlyObligations;
  const monthlyLiving = obligations.livingCostCents;
  const insuranceMonthly =
    obligations.healthPremiumCents +
    obligations.additionalInsurancePremiumsCents;
  const debtMinimums =
    obligations.termDebtMinimumsCents +
    obligations.revolvingCreditMinimumCents;
  const otherRequired = obligations.otherRequiredCents;
  const total = Math.max(1, view.monthlyRequiredCents);
  const share = (part: number) => `${Math.round((part / total) * 100)}%`;

  return (
    <div className="hq-screen">
      <div className="hq-screen-head">
        <div>
          <h2 className="hq-screen-title">Budget Burrow</h2>
          <p className="hq-screen-subtitle">
            Your recurring costs are the ground everything else grows from.
          </p>
        </div>
        <div className="hq-planbar-spacer" />
        <HqSpeech
          characterName={inflato.characterName}
          characterSrc={inflato.characterSrc}
          tone="hostile"
        >
          Nothing personal, kid — prices only go <b>UP</b>. Every month you stand
          still, I gain ground.
        </HqSpeech>
      </div>

      <div className="hq-columns">
        <div className="hq-column">
          <HqCard
            aside={
              <span className="hq-chip">
                {formatCents(view.annualLivingCostCents)}/yr living cost
              </span>
            }
            eyebrow="Required every month"
          >
            <div className="hq-figure">
              {formatCents(view.monthlyRequiredCents)}
              <span className="hq-figure-unit">/mo</span>
            </div>

            <div
              style={{
                display: "flex",
                height: 26,
                borderRadius: 999,
                overflow: "hidden",
                font: "800 0.6875rem var(--hq-body-font)",
                color: "#fff",
              }}
            >
              <div
                style={{
                  width: share(monthlyLiving),
                  background: "var(--hq-blue-bright)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                {formatCents(monthlyLiving)}
              </div>
              {insuranceMonthly > 0 ? (
                <div
                  style={{
                    width: share(insuranceMonthly),
                    background: "var(--hq-purple)",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  {formatCents(insuranceMonthly)}
                </div>
              ) : null}
              {debtMinimums > 0 ? (
                <div
                  style={{
                    width: share(debtMinimums),
                    background: "var(--hq-red-bright)",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  {formatCents(debtMinimums)}
                </div>
              ) : null}
              {otherRequired > 0 ? (
                <div
                  style={{
                    width: share(otherRequired),
                    background: "var(--hq-red-bright)",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  {formatCents(otherRequired)}
                </div>
              ) : null}
            </div>

            <div className="hq-chip-row">
              <span style={{ font: "700 0.6875rem var(--hq-body-font)", color: "var(--hq-blue-bright)" }}>
                ● rent, food, transport, fun
              </span>
              {insuranceMonthly > 0 ? (
                <span style={{ font: "700 0.6875rem var(--hq-body-font)", color: "var(--hq-purple)" }}>
                  ● health plan premium
                </span>
              ) : null}
              {debtMinimums > 0 ? (
                <span style={{ font: "700 0.6875rem var(--hq-body-font)", color: "var(--hq-red-bright)" }}>
                  ● debt minimums
                </span>
              ) : null}
              {otherRequired > 0 ? (
                // Whatever required spending is left once living costs and the
                // health premium are accounted for: debt minimums, other cover.
                <span style={{ font: "700 0.6875rem var(--hq-body-font)", color: "var(--hq-red-bright)" }}>
                  ● event and other obligations
                </span>
              ) : null}
            </div>

            <p className="hq-note" style={{ marginTop: "0.75rem" }}>
              Lower required costs mean a smaller emergency fund <b>and</b> a
              smaller FI target. One trim helps twice.
            </p>
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
          <HqCard eyebrow="What inflation does to this">
            <HqUnavailable>
              A year-ahead cost forecast needs the engine&rsquo;s inflation
              projection, which no API route exposes yet. What is certain: the{" "}
              {formatCents(view.monthlyRequiredCents)} above is this
              month&rsquo;s authoritative figure, and inflation is applied to
              your annual costs every month you play.
            </HqUnavailable>
          </HqCard>

          {creep ? (
            <HqCard accent="gold" style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span
                  style={{
                    display: "grid",
                    placeItems: "center",
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    background: "var(--hq-gold)",
                    color: "var(--hq-gold-ink)",
                    font: "800 0.8125rem var(--hq-display)",
                  }}
                >
                  !
                </span>
                <h3 style={{ margin: 0, font: "800 0.9375rem var(--hq-display)" }}>
                  Watch out: {creep.title.toLowerCase()}
                </h3>
              </div>
              <ConceptBody concept={creep} />
            </HqCard>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type ConceptBodyProps = Readonly<{
  concept: NonNullable<ReturnType<typeof getEducationConcept>>;
}>;

export function ConceptBody({ concept }: ConceptBodyProps) {
  const paragraph = {
    font: "600 0.78125rem var(--hq-body-font)",
    color: "var(--hq-body)",
    lineHeight: 1.5,
    margin: "0 0 0.375rem",
  } as const;

  return (
    <>
      <p style={paragraph}>{concept.shortDefinition}</p>
      <p style={paragraph}>
        <b style={{ color: "var(--hq-gold-deep)" }}>Why it matters:</b>{" "}
        {concept.whyItMatters}
      </p>
      <p style={{ ...paragraph, margin: 0 }}>
        <b style={{ color: "var(--hq-gold-deep)" }}>The trade-off:</b>{" "}
        {concept.decisionTradeoff}
      </p>
    </>
  );
}
