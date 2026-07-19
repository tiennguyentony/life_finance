"use client";

import { hqTab } from "../hq-tabs";
import { HqCard, HqChoiceList, HqSpeech } from "../hq-ui";
import { projectCareerPrograms } from "../hq-derivations";
import { formatCents } from "../hq-view";
import type { ScreenProps } from "./screen-props";

const RULES: readonly Readonly<{ mark: string; text: string }>[] = Object.freeze([
  { mark: "✓", text: "Upskilling requires active employment" },
  { mark: "✓", text: "Cash upfront — no financing here" },
  { mark: "✓", text: "The same program cannot be started twice at once" },
  { mark: "✓", text: "Different programs may run in parallel if you can fund them" },
  { mark: "✓", text: "The catalog raise lands when the program completes" },
]);

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

  return (
    <div className="hq-screen">
      <div className="hq-screen-head">
        <div>
          <h2 className="hq-screen-title">Career Campus</h2>
          <p className="hq-screen-subtitle">
            Your salary is your biggest money machine — upgrades cost cash now
            and pay every month after.
          </p>
        </div>
        <div className="hq-planbar-spacer" />
        <HqSpeech
          characterName={layoff.characterName}
          characterSrc={layoff.characterSrc}
          tone="hostile"
        >
          Stale skills are my favourite snack. Keep learning and I&rsquo;ll have
          to bother someone else…
        </HqSpeech>
      </div>

      <div className="hq-columns">
        <div className="hq-column">
          <h3 className="hq-eyebrow" style={{ margin: "0.125rem 0 -0.25rem" }}>
            Choose one program
          </h3>
          <HqChoiceList
            disabled={busy}
            onSelect={onSelectPlan}
            plans={plans}
            selectedPlanId={selectedPlanId}
          />

          <HqCard eyebrow="What each program is worth">
            <div style={{ display: "grid", gap: "0.5rem" }}>
              {projections.map(({ program, paybackMonths, tenYearUpsideCents }) => (
                <div
                  key={program.id}
                  style={{
                    display: "grid",
                    gap: "0.25rem",
                    padding: "0.625rem 0.75rem",
                    borderRadius: 12,
                    background: "var(--hq-stage)",
                  }}
                >
                  <div style={{ font: "800 0.84375rem var(--hq-display)" }}>
                    {program.id.replace("upskill.", "").replace(/^./, (c) => c.toUpperCase())}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.75rem",
                      font: "700 0.6875rem var(--hq-body-font)",
                      color: "var(--hq-muted)",
                    }}
                  >
                    <span>{formatCents(program.costCents)} upfront</span>
                    <span>{program.durationMonths} months</span>
                    <span>
                      +{formatCents(program.annualSalaryIncreaseCents)}/yr on completion
                    </span>
                    <span style={{ color: "var(--hq-green-deep)" }}>
                      pays for itself in ~{paybackMonths} months
                    </span>
                    <span style={{ color: "var(--hq-green-deep)" }}>
                      10-yr upside +{formatCents(tenYearUpsideCents)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p className="hq-note" style={{ marginTop: "0.625rem" }}>
              Payback and upside are arithmetic, not a market forecast. The
              engine applies the listed raise on completion; the ten-year
              figure assumes that salary then remains unchanged for ten years.
            </p>
          </HqCard>
        </div>

        <div className="hq-column">
          <HqCard eyebrow="The rules of campus">
            <div style={{ display: "grid", gap: "0.375rem" }}>
              {RULES.map((rule) => (
                <div
                  key={rule.text}
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    font: "700 0.78125rem var(--hq-body-font)",
                    color: "var(--hq-muted)",
                  }}
                >
                  <span style={{ color: "var(--hq-green-deep)" }}>{rule.mark}</span>
                  <span>{rule.text}</span>
                </div>
              ))}
            </div>
            {run.career.pendingProgramIds.length > 0 ? (
              <p className="hq-note" data-tone="caution" style={{ marginTop: "0.625rem" }}>
                In progress:{" "}
                {run.career.pendingProgramIds
                  .map((id) => id.replace("upskill.", ""))
                  .join(", ")}
                . The salary bump lands in a month result when it completes.
              </p>
            ) : null}
          </HqCard>

          <HqCard accent="green" style={{ flex: 1 }}>
            <h3 style={{ margin: 0, font: "800 1rem var(--hq-display)" }}>
              Why bother? Compounding, again.
            </h3>
            <p
              style={{
                font: "600 0.78125rem var(--hq-body-font)",
                color: "var(--hq-body)",
                lineHeight: 1.5,
              }}
            >
              A raise repeats in each later paycheck while employment and that
              salary remain active. Early-career salary growth can out-earn an
              investment you can afford right now.
            </p>
            <p className="hq-note" data-tone="positive" style={{ margin: 0 }}>
              You hold {formatCents(view.cashCents)} in cash today. Programs are
              paid upfront, so check your Safety buffer before committing.
            </p>
          </HqCard>
        </div>
      </div>
    </div>
  );
}
