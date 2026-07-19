"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import type { RunViewWire } from "@/contracts/api/contracts";

import { HqCard, HqUnavailable } from "../hq-ui";
import { formatCents, formatMonthLabel } from "../hq-view";
import {
  fetchTeachingDebrief,
  TeachingUnavailableError,
  type TeachingDebriefResponse,
} from "../teaching-client";

const RICHIE = "/assets/characters/richie/richie-chart.png";

type Props = Readonly<{
  run: RunViewWire;
  onBack: () => void;
}>;

export function DebriefScreen({ run, onBack }: Props) {
  const [state, setState] = useState<
    | Readonly<{ kind: "loading" }>
    | Readonly<{ kind: "ready"; data: TeachingDebriefResponse }>
    | Readonly<{ kind: "unavailable"; message: string }>
  >({ kind: "loading" });

  useEffect(() => {
    let active = true;
    fetchTeachingDebrief(run.runId, run.revision)
      .then((data) => {
        if (active) setState({ kind: "ready", data });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({
          kind: "unavailable",
          message:
            error instanceof TeachingUnavailableError
              ? error.message
              : "The debrief could not be loaded.",
        });
      });
    return () => {
      active = false;
    };
  }, [run.runId, run.revision]);

  return (
    <div className="hq-screen">
      <div className="hq-screen-head">
        <Image alt="Richie" className="hq-character" height={96} src={RICHIE} width={96} />
        <div>
          <h2 className="hq-screen-title">Richie&rsquo;s Final Debrief</h2>
          <p className="hq-screen-subtitle">
            Deterministic and evidence-backed. Here is why the run ended the way
            it did.
          </p>
        </div>
        <div className="hq-planbar-spacer" />
        <button className="hq-topbar-action" onClick={onBack} type="button">
          Back to HQ
        </button>
      </div>

      {state.kind === "loading" ? (
        <p className="hq-loading" role="status">
          Replaying the run&rsquo;s evidence…
        </p>
      ) : state.kind === "unavailable" ? (
        <HqUnavailable>
          {state.message} The debrief replays persisted history through the
          engine, so it requires a database-backed run and a finished outcome.
        </HqUnavailable>
      ) : (
        <DebriefBody data={state.data} />
      )}
    </div>
  );
}

function DebriefBody({ data }: Readonly<{ data: TeachingDebriefResponse }>) {
  const { debrief } = data;

  return (
    <>
      <div className="hq-columns">
        <div className="hq-column">
          <HqCard eyebrow="Outcome">
            <div className="hq-figure">{debrief.outcome.grade}</div>
            <div className="hq-chip-row" style={{ marginTop: 0 }}>
              <span className="hq-chip">{debrief.outcome.endReason.replace(/_/g, " ")}</span>
              <span className="hq-chip">{debrief.outcome.reasonCode.replace(/_/g, " ")}</span>
              <span className="hq-chip">
                reached {formatMonthLabel(debrief.outcome.reachedMonth)}
              </span>
            </div>
            <p className="hq-note" style={{ marginTop: "0.75rem" }}>
              Final net worth:{" "}
              <b>{formatCents(debrief.financialDiscipline.displayedNetWorthCents)}</b>
            </p>
          </HqCard>

          <HqCard eyebrow="Verified turning points">
            {debrief.turningPointStatus === "insufficient_verified_history" ||
            debrief.turningPoints.length === 0 ? (
              <HqUnavailable>
                The engine found insufficient verified history to name turning
                points for this run. It reports that rather than inventing a
                narrative.
              </HqUnavailable>
            ) : (
              <div style={{ display: "grid", gap: "0.5rem" }}>
                {debrief.turningPoints.map((point, index) => (
                  <div
                    key={point.nodeId ?? `turning-point-${index}`}
                    style={{
                      padding: "0.625rem 0.75rem",
                      borderRadius: 12,
                      background: "var(--hq-stage)",
                    }}
                  >
                    <div style={{ font: "800 0.84375rem var(--hq-display)" }}>
                      {point.month ? formatMonthLabel(point.month) : `Turn ${index + 1}`}
                    </div>
                    <div className="hq-nav-hint">
                      {(point.kind ?? "event").replace(/_/g, " ")}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {debrief.causalExplanations.length > 0 ? (
              <div style={{ marginTop: "0.625rem", display: "grid", gap: "0.375rem" }}>
                {debrief.causalExplanations.map((explanation) => (
                  <p
                    key={explanation.edgeId}
                    style={{
                      margin: 0,
                      font: "600 0.75rem var(--hq-body-font)",
                      color: "var(--hq-body)",
                    }}
                  >
                    {explanation.text}
                  </p>
                ))}
              </div>
            ) : null}
          </HqCard>
        </div>

        <div className="hq-column">
          <HqCard eyebrow="What went well">
            <DecisionList
              emptyMessage="No strong decision met the evidence bar for this run."
              items={debrief.strongDecisions}
              mark="✓"
              tone="positive"
            />
          </HqCard>

          <HqCard eyebrow="Change opportunities">
            <DecisionList
              emptyMessage="No improvement was supported by verified evidence."
              items={debrief.improvements}
              mark="×"
              tone="negative"
            />
          </HqCard>

          <HqCard eyebrow="The counterfactual machine">
            {debrief.counterfactualStatus.status === "unavailable" ||
            debrief.counterfactuals.length === 0 ? (
              <HqUnavailable>
                No supported counterfactual was available for this run
                ({debrief.counterfactualStatus.reasonCode.replace(/_/g, " ")}).
              </HqUnavailable>
            ) : (
              <div style={{ display: "grid", gap: "0.5rem" }}>
                {debrief.counterfactuals.map((counterfactual) => (
                  <div
                    key={counterfactual.interventionPath}
                    style={{
                      padding: "0.625rem 0.75rem",
                      borderRadius: 12,
                      background: "var(--hq-stage)",
                    }}
                  >
                    <div style={{ font: "800 0.8125rem var(--hq-display)" }}>
                      {counterfactual.interventionPath}
                    </div>
                    <div className="hq-nav-hint">
                      replayed by the real engine over{" "}
                      {counterfactual.comparedMonths} months
                    </div>
                  </div>
                ))}
              </div>
            )}
          </HqCard>
        </div>
      </div>

      {debrief.recommendations.length > 0 ? (
        <HqCard accent="green" eyebrow="For your next run">
          <ol
            style={{
              margin: 0,
              paddingLeft: "1.125rem",
              display: "grid",
              gap: "0.375rem",
              font: "700 0.78125rem var(--hq-body-font)",
              color: "var(--hq-body)",
            }}
          >
            {debrief.recommendations.map((recommendation) => (
              <li key={recommendation.text}>{recommendation.text}</li>
            ))}
          </ol>
        </HqCard>
      ) : null}
    </>
  );
}

type DecisionListProps = Readonly<{
  emptyMessage: string;
  items: readonly Readonly<{ edgeId: string; text: string }>[];
  mark: string;
  tone: "positive" | "negative";
}>;

function DecisionList({ emptyMessage, items, mark, tone }: DecisionListProps) {
  if (items.length === 0) return <HqUnavailable>{emptyMessage}</HqUnavailable>;

  return (
    <div style={{ display: "grid", gap: "0.375rem" }}>
      {items.map((item) => (
        <div
          key={item.edgeId}
          style={{
            display: "flex",
            gap: "0.5rem",
            font: "700 0.78125rem var(--hq-body-font)",
            color: "var(--hq-muted)",
          }}
        >
          <span
            style={{
              color: tone === "positive" ? "var(--hq-green-deep)" : "var(--hq-red)",
            }}
          >
            {mark}
          </span>
          <span>{item.text}</span>
        </div>
      ))}
    </div>
  );
}
