"use client";

import { hqTab } from "../hq-tabs";
import {
  HqBanner,
  HqCard,
  HqChoiceList,
  HqMiniTile,
  HqScreenHead,
  HqUnavailable,
} from "../hq-ui";
import {
  emergencyFundTargetCents,
  worstCaseHealthYearCents,
} from "../hq-derivations";
import { formatCents, formatPpmPercent } from "../hq-view";
import type { ScreenProps } from "./screen-props";

/** The runway meter always draws on a six-month scale, like the design. */
const RUNWAY_SCALE_MONTHS = 6;

export function SafetyScreen({
  busy,
  onSelectPlan,
  plans,
  run,
  selectedPlanId,
  view,
}: ScreenProps) {
  const buddi = hqTab("safety");
  const health = run.benefits?.healthPlan ?? null;
  const coverages = run.benefits?.insuranceCoverages ?? [];
  const monthsHeld = view.emergencyFundMonths;
  const targetMonths = view.emergencyTargetMonths;
  const worstCase =
    health === null
      ? null
      : worstCaseHealthYearCents(
          health.annualOutOfPocketMaximumCents,
          health.monthlyPremiumCents,
        );
  const markerMonths = targetMonths ?? 3;

  return (
    <div className="hq-screen">
      <HqScreenHead
        characterName={buddi.characterName}
        characterSrc={buddi.characterSrc}
        line="I catch you when it drops."
        lineTone="positive"
        title="Safety"
      />

      <div className="hq-columns">
        <HqCard eyebrow="Emergency runway">
          {monthsHeld === null ? (
            <HqUnavailable>
              With no required monthly spending recorded, a buffer measured in
              months cannot be calculated.
            </HqUnavailable>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.625rem" }}>
                <div
                  className="hq-figure"
                  style={{ fontSize: "3.125rem", margin: "0.125rem 0" }}
                >
                  {(Math.round(monthsHeld * 10) / 10).toFixed(1)}
                  <span className="hq-figure-unit"> mo</span>
                </div>
                {targetMonths !== null ? (
                  <span
                    className="hq-chip"
                    data-tone={monthsHeld >= targetMonths ? "positive" : "caution"}
                  >
                    target {targetMonths} mo{monthsHeld >= targetMonths ? " ✓" : ""}
                  </span>
                ) : (
                  <span className="hq-chip" data-tone="caution">
                    no target locked in
                  </span>
                )}
              </div>

              <div style={{ position: "relative", marginTop: "0.5rem" }}>
                <div className="hq-meter" data-size="lg">
                  <div
                    className="hq-meter-fill"
                    data-tone={
                      monthsHeld >= markerMonths ? undefined : "caution"
                    }
                    style={{
                      width: `${Math.min(100, (monthsHeld / RUNWAY_SCALE_MONTHS) * 100)}%`,
                    }}
                  />
                </div>
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: `${Math.min(100, (markerMonths / RUNWAY_SCALE_MONTHS) * 100)}%`,
                    top: -3,
                    width: 2,
                    height: 18,
                    background: "var(--hq-ink)",
                    opacity: 0.35,
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  font: "800 0.625rem var(--hq-body-font)",
                  color: "var(--hq-soft)",
                  marginTop: 3,
                }}
              >
                <span>0</span>
                <span>
                  3 MO · {formatCents(emergencyFundTargetCents(view.monthlyRequiredCents, 3))}
                </span>
                <span>
                  6 MO · {formatCents(emergencyFundTargetCents(view.monthlyRequiredCents, 6))}
                </span>
              </div>

              {worstCase !== null ? (
                <div style={{ marginTop: "0.75rem" }}>
                  <HqBanner
                    label={`WORST HEALTH YEAR ${formatCents(worstCase)} — CASH ${formatCents(view.cashCents)}`}
                    tone={view.cashCents >= worstCase ? "positive" : "negative"}
                    value={view.cashCents >= worstCase ? "Covered ✓" : "Not covered"}
                  />
                </div>
              ) : null}

              <p className="hq-note" style={{ marginTop: "0.75rem" }}>
                Setting the target changes your <b>recurring strategy</b>, not
                today&rsquo;s cash — the engine routes future spare dollars to
                the buffer before extra investing.
              </p>
            </>
          )}
        </HqCard>

        <HqCard
          aside={
            coverages.length > 0 ? (
              <span className="hq-chip" data-tone="positive">
                ✓ {coverages[0]!.label} {formatCents(coverages[0]!.monthlyPremiumCents)}/mo
              </span>
            ) : (
              <span className="hq-chip" data-tone="caution">
                no additional coverage
              </span>
            )
          }
          eyebrow={health ? health.label : "Your insurance"}
        >
          {run.benefits === null ? (
            <HqUnavailable>
              This run has no benefits snapshot, so its plan details are
              unknown. Runs started on the current engine record them.
            </HqUnavailable>
          ) : health ? (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.5rem",
                  marginTop: "0.625rem",
                }}
              >
                <HqMiniTile
                  caption="the cost of being covered"
                  label="Premium"
                  value={`${formatCents(health.monthlyPremiumCents)}/mo`}
                />
                <HqMiniTile
                  caption="you pay this before help kicks in"
                  label="Deductible"
                  value={formatCents(health.annualDeductibleCents)}
                />
                <HqMiniTile
                  caption="your worst-case year"
                  label="OOP max"
                  value={formatCents(health.annualOutOfPocketMaximumCents)}
                />
                <HqMiniTile
                  caption="your share after the deductible"
                  label="Coinsurance"
                  value={formatPpmPercent(health.coinsurancePpm)}
                />
              </div>
              {coverages.length > 1 ? (
                <div className="hq-chip-row">
                  {coverages.slice(1).map((coverage) => (
                    <span className="hq-chip" data-tone="positive" key={coverage.id}>
                      ✓ {coverage.label} · {formatCents(coverage.monthlyPremiumCents)}/mo
                    </span>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <HqUnavailable>
              No health plan is selected in this scenario.
            </HqUnavailable>
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
