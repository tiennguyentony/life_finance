"use client";

import { getEducationConcept } from "../hq-concepts";
import { hqTab } from "../hq-tabs";
import { HqCard, HqChoiceList, HqSpeech, HqUnavailable } from "../hq-ui";
import {
  emergencyFundTargetCents,
  worstCaseHealthYearCents,
} from "../hq-derivations";
import { formatCents, formatMonths, formatPpmPercent } from "../hq-view";
import { ConceptBody } from "./budget-screen";
import type { ScreenProps } from "./screen-props";

export function SafetyScreen({
  busy,
  onSelectPlan,
  plans,
  run,
  selectedPlanId,
  view,
}: ScreenProps) {
  const buddi = hqTab("safety");
  const liquidity = getEducationConcept("liquidity");
  const health = run.benefits?.healthPlan ?? null;
  const coverages = run.benefits?.insuranceCoverages ?? [];
  const monthsHeld = view.emergencyFundMonths;
  const worstCase =
    health === null
      ? null
      : worstCaseHealthYearCents(
          health.annualOutOfPocketMaximumCents,
          health.monthlyPremiumCents,
        );

  return (
    <div className="hq-screen">
      <div className="hq-screen-head">
        <div>
          <h2 className="hq-screen-title">Safety Shelter</h2>
          <p className="hq-screen-subtitle">
            Boring? Maybe. But this page decides whether a bad month becomes a
            bad year.
          </p>
        </div>
        <div className="hq-planbar-spacer" />
        <HqSpeech
          characterName={buddi.characterName}
          characterSrc={buddi.characterSrc}
        >
          When a big bill shows up, I&rsquo;m what catches you. Let&rsquo;s lock
          in a target you can live with.
        </HqSpeech>
      </div>

      <div className="hq-columns">
        <div className="hq-column">
          <HqCard eyebrow="Emergency fund · months of required spending">
            <div className="hq-figure">
              {monthsHeld === null ? "—" : formatMonths(monthsHeld)}
              <span className="hq-figure-unit">
                {" "}
                held ({formatCents(view.cashCents)} cash)
              </span>
            </div>

            {monthsHeld === null ? (
              <HqUnavailable>
                With no required monthly spending recorded, a buffer measured in
                months cannot be calculated.
              </HqUnavailable>
            ) : (
              <>
                <div className="hq-meter" data-size="lg">
                  <div
                    className="hq-meter-fill"
                    data-tone={monthsHeld >= 6 ? undefined : "caution"}
                    style={{ width: `${Math.min(100, (monthsHeld / 6) * 100)}%` }}
                  />
                </div>
                <div className="hq-chip-row">
                  <span className="hq-chip">
                    3 mo ·{" "}
                    {formatCents(emergencyFundTargetCents(view.monthlyRequiredCents, 3))}
                  </span>
                  <span className="hq-chip">
                    6 mo ·{" "}
                    {formatCents(emergencyFundTargetCents(view.monthlyRequiredCents, 6))}
                  </span>
                  <span className="hq-chip">
                    required {formatCents(view.monthlyRequiredCents)}/mo
                  </span>
                  {view.emergencyTargetMonths !== null ? (
                    <span className="hq-chip" data-tone="positive">
                      target set: {view.emergencyTargetMonths} months
                    </span>
                  ) : (
                    <span className="hq-chip" data-tone="caution">
                      no target locked in
                    </span>
                  )}
                </div>
              </>
            )}

            <p className="hq-note" style={{ marginTop: "0.75rem" }}>
              Setting the target changes your <b>recurring strategy</b>, not
              today&rsquo;s cash — the engine routes future spare dollars to the
              buffer before extra investing.
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
          <HqCard eyebrow="Your insurance">
            {run.benefits === null ? (
              <HqUnavailable>
                This run has no benefits snapshot, so its plan details are
                unknown. Runs started on the current engine record them.
              </HqUnavailable>
            ) : (
              <>
                {health ? (
                  <>
                    <div style={{ font: "800 0.9375rem var(--hq-display)" }}>
                      {health.label}
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gap: "0.5rem",
                        gridTemplateColumns: "repeat(auto-fit, minmax(8rem, 1fr))",
                        marginTop: "0.5rem",
                      }}
                    >
                      <PlanStat
                        caption="the cost of being covered"
                        label="Premium"
                        value={`${formatCents(health.monthlyPremiumCents)}/mo`}
                      />
                      <PlanStat
                        caption="you pay this before help kicks in"
                        label="Deductible"
                        value={formatCents(health.annualDeductibleCents)}
                      />
                      <PlanStat
                        caption="your worst-case year"
                        label="Out-of-pocket max"
                        value={formatCents(health.annualOutOfPocketMaximumCents)}
                      />
                      <PlanStat
                        caption="your share after the deductible"
                        label="Coinsurance"
                        value={formatPpmPercent(health.coinsurancePpm)}
                      />
                    </div>
                    {worstCase !== null ? (
                      <p className="hq-note" style={{ marginTop: "0.625rem" }}>
                        A low premium is not a cheap plan. Your worst modelled
                        year is <b>{formatCents(worstCase)}</b> — the
                        out-of-pocket maximum plus a year of premiums.
                        {monthsHeld !== null &&
                        view.cashCents >= worstCase
                          ? " Your cash covers it today. That is the point."
                          : " Your cash does not cover it today."}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <HqUnavailable>
                    No health plan is selected in this scenario.
                  </HqUnavailable>
                )}

                <div className="hq-chip-row">
                  {coverages.length === 0 ? (
                    <span className="hq-chip" data-tone="caution">
                      no additional coverage
                    </span>
                  ) : (
                    coverages.map((coverage) => (
                      <span className="hq-chip" data-tone="positive" key={coverage.id}>
                        ✓ {coverage.label} · {formatCents(coverage.monthlyPremiumCents)}/mo
                      </span>
                    ))
                  )}
                </div>
              </>
            )}
          </HqCard>

          {liquidity ? (
            <HqCard accent="gold" style={{ flex: 1 }}>
              <h3 style={{ margin: 0, font: "800 1rem var(--hq-display)" }}>
                Why liquidity beats &ldquo;rich on paper&rdquo;
              </h3>
              <div style={{ marginTop: "0.5rem" }}>
                <ConceptBody concept={liquidity} />
              </div>
            </HqCard>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type PlanStatProps = Readonly<{
  label: string;
  value: string;
  caption: string;
}>;

function PlanStat({ label, value, caption }: PlanStatProps) {
  return (
    <div style={{ padding: "0.5rem 0.75rem", borderRadius: 12, background: "var(--hq-stage)" }}>
      <div style={{ font: "700 0.625rem var(--hq-body-font)", color: "var(--hq-soft)" }}>
        {label}
      </div>
      <div style={{ font: "800 1rem var(--hq-display)" }}>{value}</div>
      <div style={{ font: "600 0.625rem var(--hq-body-font)", color: "var(--hq-muted)" }}>
        {caption}
      </div>
    </div>
  );
}
