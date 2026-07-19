"use client";

import { useEffect, useState } from "react";

import type { RunViewWire } from "@/contracts/api/contracts";

import { hqTab } from "../hq-tabs";
import { HqCard, HqSpeech, HqUnavailable } from "../hq-ui";
import { formatCents, formatPpmPercent } from "../hq-view";
import {
  factLabel,
  fetchTeachingCheckpoint,
  TeachingUnavailableError,
  type TeachingCheckpointResponse,
  type TeachingFact,
} from "../teaching-client";

const OUTCOME_BANDS = ["bankrupt", "fragile", "developing", "strong"] as const;

/** The engine aggregates at most twelve months into one checkpoint. */
const CHECKPOINT_MONTHS = 12;

type Props = Readonly<{
  run: RunViewWire;
  onBack: () => void;
}>;

export function CheckpointScreen({ run, onBack }: Props) {
  const froggy = hqTab("glossary");
  const [state, setState] = useState<
    | Readonly<{ kind: "loading" }>
    | Readonly<{ kind: "ready"; data: TeachingCheckpointResponse }>
    | Readonly<{ kind: "unavailable"; message: string }>
  >({ kind: "loading" });

  useEffect(() => {
    let active = true;
    // The server resolves months to revisions from persisted monthly records.
    // This stays correct after event/action revisions and on another browser,
    // where the optional local chart trail may be empty.
    fetchTeachingCheckpoint(run.runId, run.revision, CHECKPOINT_MONTHS)
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
              : "The checkpoint could not be loaded.",
        });
      });
    return () => {
      active = false;
    };
  }, [run.runId, run.revision]);

  const checkpoint = run.beginnerCheckpoint;
  const currentWeakest = Object.entries(run.preparedness.components).reduce(
    (weakest, candidate) => candidate[1] < weakest[1] ? candidate : weakest,
  );
  const currentWeakestLabel = currentWeakest[0].replace(/Ppm$/, "").replace(/_/g, " ");

  return (
    <div className="hq-screen">
      <div className="hq-screen-head">
        <div>
          <h2 className="hq-screen-title">Froggy&rsquo;s 12-Month Report</h2>
          <p className="hq-screen-subtitle">
            A rolling year of verified monthly records, ending now.
          </p>
        </div>
        <div className="hq-planbar-spacer" />
        <button className="hq-topbar-action" onClick={onBack} type="button">
          Back to HQ
        </button>
      </div>

      <div className="hq-screen-head">
        <HqSpeech characterName={froggy.characterName} characterSrc={froggy.characterSrc}>
          {checkpoint
            ? `A ${checkpoint.outcome} year. The weakest link was ${checkpoint.weakestComponent.replace("_", " ")} — fix that and next year gets gentler. Ribbit.`
            : `Your current weakest link is ${currentWeakestLabel}. The verified figures below show what drove the last twelve months. Ribbit.`}
        </HqSpeech>
      </div>

      {checkpoint ? (
        <HqCard eyebrow="Year-one outcome">
          <div className="hq-chip-row" style={{ marginTop: 0 }}>
            {OUTCOME_BANDS.map((band) => (
              <span
                className="hq-chip"
                data-tone={
                  band === checkpoint.outcome
                    ? band === "strong"
                      ? "positive"
                      : band === "bankrupt"
                        ? "negative"
                        : "caution"
                    : undefined
                }
                key={band}
                style={
                  band === checkpoint.outcome
                    ? { fontWeight: 800, outline: "2px solid currentColor" }
                    : { opacity: 0.5 }
                }
              >
                {band}
              </span>
            ))}
          </div>
          <div
            style={{
              display: "grid",
              gap: "0.5rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))",
              marginTop: "0.75rem",
            }}
          >
            <SummaryTile
              label="Preparedness band"
              value={checkpoint.preparednessBand}
            />
            <SummaryTile
              label="Score"
              value={formatPpmPercent(checkpoint.scorePpm)}
            />
            <SummaryTile
              label="Weakest component"
              value={checkpoint.weakestComponent.replace("_", " ")}
            />
          </div>
          <p className="hq-note" data-tone="caution" style={{ marginTop: "0.75rem" }}>
            Focus next: <b>{checkpoint.weakestComponent.replace("_", " ")}</b>.
            The event system uses demonstrated weaknesses to choose fair, bounded
            pressure — improving this makes next year gentler.
          </p>
        </HqCard>
      ) : (
        <HqCard eyebrow="Current preparedness">
          <div
            style={{
              display: "grid",
              gap: "0.5rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))",
            }}
          >
            <SummaryTile label="Preparedness band" value={run.preparedness.band} />
            <SummaryTile label="Score" value={formatPpmPercent(run.preparedness.scorePpm)} />
            <SummaryTile label="Weakest component" value={currentWeakestLabel} />
          </div>
          <p className="hq-note" data-tone="caution" style={{ marginTop: "0.75rem" }}>
            The named beginner outcome is captured at the exact year-one
            boundary. This later report uses the current preparedness snapshot
            and the server&rsquo;s trailing twelve-month evidence.
          </p>
        </HqCard>
      )}

      <HqCard
        aside={
          state.kind === "ready" ? (
            <span className="hq-chip">
              {state.data.checkpoint.monthsAggregated} months aggregated
            </span>
          ) : null
        }
        eyebrow="The verified numbers"
      >
        {state.kind === "loading" ? (
          <p className="hq-loading" role="status">
            Loading verified evidence…
          </p>
        ) : state.kind === "unavailable" ? (
          <HqUnavailable>
            {state.message} A 12-month report needs twelve completed monthly
            records for this run.
          </HqUnavailable>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gap: "0.5rem",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 14rem), 1fr))",
              }}
            >
              {state.data.checkpoint.facts.facts.map((fact) => (
                <FactCard fact={fact} key={fact.factId} />
              ))}
            </div>
            {state.data.checkpoint.missingDimensions.length > 0 ? (
              <HqUnavailable>
                Not measured this checkpoint:{" "}
                {state.data.checkpoint.missingDimensions
                  .map(({ dimensionId }) => dimensionId.replace(/_/g, " "))
                  .join(", ")}
                . The engine reports these as unrecorded rather than guessing
                them.
              </HqUnavailable>
            ) : null}
          </>
        )}
      </HqCard>
    </div>
  );
}

function formatFactValue(value: TeachingFact["value"]): string {
  switch (value.kind) {
    case "money_cents":
      return formatCents(value.value);
    case "rate_ppm":
      return formatPpmPercent(value.value, 1);
    case "months_ppm":
      return `${(value.value / 1_000_000).toFixed(1)} months`;
    case "years":
      return `${value.value} years`;
    case "integer":
      return String(value.value);
    case "enum":
      return value.value.replace(/_/g, " ");
    case "boolean":
      return value.value ? "yes" : "no";
  }
}

function FactCard({ fact }: Readonly<{ fact: TeachingFact }>) {
  return (
    <div style={{ padding: "0.625rem 0.75rem", borderRadius: 12, background: "var(--hq-stage)" }}>
      <div style={{ font: "700 0.6875rem var(--hq-body-font)", color: "var(--hq-muted)" }}>
        {factLabel(fact.labelId)}
      </div>
      <div style={{ font: "800 1.125rem var(--hq-display)" }}>
        {formatFactValue(fact.value)}
      </div>
      <div
        style={{
          font: "600 0.5625rem var(--hq-body-font)",
          color: "var(--hq-faint)",
          wordBreak: "break-all",
        }}
        title={`${fact.source.kind} · ${fact.source.sourceId}`}
      >
        {fact.factId}
      </div>
    </div>
  );
}

function SummaryTile({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div style={{ padding: "0.5rem 0.75rem", borderRadius: 12, background: "var(--hq-stage)" }}>
      <div style={{ font: "700 0.625rem var(--hq-body-font)", color: "var(--hq-soft)" }}>
        {label}
      </div>
      <div style={{ font: "800 1rem var(--hq-display)", textTransform: "capitalize" }}>
        {value}
      </div>
    </div>
  );
}
