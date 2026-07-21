"use client";

import { hqTab } from "../hq-tabs";
import { HqScreenHead } from "../hq-ui";
import {
  projectCareerPrograms,
  type CareerProgramProjection,
} from "../hq-derivations";
import { formatCents, formatCompactCents } from "../hq-view";
import type { ScreenProps } from "./screen-props";

export function CareerScreen({
  busy,
  onSelectPlan,
  plans,
  run,
  selectedPlanId,
  view,
}: ScreenProps) {
  const layoff = hqTab("career");
  const projections = projectCareerPrograms();
  const maxPayback = Math.max(
    ...projections.map(({ paybackMonths }) => paybackMonths),
    1,
  );

  // Board plan ids are "startup.<name>", program ids "upskill.<name>".
  const projectionForPlan = (planId: string): CareerProgramProjection | null =>
    projections.find(
      ({ program }) =>
        planId === `startup.${program.id.replace("upskill.", "")}`,
    ) ?? null;

  return (
    <div className="hq-screen">
      <HqScreenHead
        characterName={layoff.characterName}
        characterSrc={layoff.characterSrc}
        line="Stale skills are my snack."
        lineTone="negative"
        title="Career"
      >
        {run.income.annualGrossSalaryCents === null ? (
          <span className="hq-chip" data-tone="negative">
            no active salary
          </span>
        ) : (
          <span className="hq-chip">
            salary {formatCents(run.income.annualGrossSalaryCents)}/yr
          </span>
        )}
      </HqScreenHead>

      <div className="hq-grid-3">
        {plans.map((plan) => {
          const projection = projectionForPlan(plan.id);
          const blocked = plan.disabledReason !== null;
          const selected = plan.id === selectedPlanId;
          return (
            <button
              aria-pressed={selected}
              className="hq-choice"
              disabled={busy || blocked}
              key={plan.id}
              onClick={() => onSelectPlan(plan.id)}
              style={{ borderRadius: 22, gap: "0.375rem" }}
              type="button"
            >
              {selected ? <span className="hq-choice-flag">Selected</span> : null}
              {blocked ? (
                <span className="hq-choice-flag" data-tone="blocked">
                  Unavailable
                </span>
              ) : null}
              <span className="hq-choice-title" style={{ fontSize: "1.125rem" }}>
                {plan.label}
              </span>
              {projection ? (
                <>
                  <span style={{ font: "800 1.875rem var(--hq-display)", color: "var(--hq-ink)" }}>
                    {formatCents(projection.program.costCents)}
                  </span>
                  <span className="hq-chip" data-tone="positive" style={{ alignSelf: "start" }}>
                    +{formatCents(projection.program.annualSalaryIncreaseCents)}/yr on completion
                  </span>
                  <span
                    style={{
                      display: "block",
                      marginTop: "0.25rem",
                      font: "800 0.6875rem var(--hq-body-font)",
                      color: "var(--hq-muted)",
                    }}
                  >
                    PAYS FOR ITSELF IN
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span
                      style={{
                        flex: 1,
                        height: 10,
                        borderRadius: 999,
                        background: "var(--hq-stage)",
                        overflow: "hidden",
                        display: "block",
                      }}
                    >
                      <span
                        style={{
                          display: "block",
                          width: `${Math.min(100, (projection.paybackMonths / maxPayback) * 100)}%`,
                          height: "100%",
                          background: "var(--hq-green)",
                          borderRadius: 999,
                        }}
                      />
                    </span>
                    <b style={{ font: "800 0.8125rem var(--hq-display)" }}>
                      {projection.paybackMonths} mo
                    </b>
                  </span>
                  <span className="hq-chip" style={{ alignSelf: "start", marginTop: "0.25rem" }}>
                    {projection.program.durationMonths} months ·{" "}
                    10-yr +{formatCompactCents(projection.tenYearUpsideCents)}
                  </span>
                </>
              ) : (
                <span className="hq-choice-body">{plan.description}</span>
              )}
              {blocked ? (
                <span className="hq-note" data-tone="negative" style={{ marginTop: "0.375rem" }}>
                  {plan.disabledReason}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="hq-chip-row" style={{ marginTop: 0 }}>
        <span className="hq-chip">cash upfront</span>
        <span className="hq-chip">needs a job</span>
        <span className="hq-chip">raise lands on completion</span>
        <span className="hq-chip" data-tone="caution">
          you hold {formatCents(view.cashCents)}
        </span>
      </div>

      {run.career.pendingProgramIds.length > 0 ? (
        <p className="hq-note" data-tone="caution" style={{ margin: 0 }}>
          In progress:{" "}
          {run.career.pendingProgramIds
            .map((id) => id.replace("upskill.", ""))
            .join(", ")}
          . The salary bump lands in a month result when it completes.
        </p>
      ) : null}
    </div>
  );
}
