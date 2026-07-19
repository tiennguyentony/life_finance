"use client";

import { useEffect, useState } from "react";

import type { RunViewWire } from "@/contracts/api/contracts";

import { hqTab } from "../hq-tabs";
import { revisionMonthsBack, type TrailPoint } from "../run-trail";
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
  /** Recorded months, used to turn a 12-month window into a revision. */
  trail: readonly TrailPoint[];
  onBack: () => void;
}>;

export function CheckpointScreen({ run, trail, onBack }: Props) {
  const froggy = hqTab("glossary");
  const [state, setState] = useState<
    | Readonly<{ kind: "loading" }>
    | Readonly<{ kind: "ready"; data: TeachingCheckpointResponse }>
    | Readonly<{ kind: "unavailable"; message: string }>
  >({ kind: "loading" });

  useEffect(() => {
    let active = true;
    // Revisions are not months: resolving an event also advances a revision.
    // The recorded trail maps months back to the revision that produced them,
    // so a 12-month window asks for the right range instead of guessing.
    const fromRevision =
      revisionMonthsBack(trail, CHECKPOINT_MONTHS) ??
      Math.max(0, run.revision - CHECKPOINT_MONTHS);
    fetchTeachingCheckpoint(run.runId, run.revision, fromRevision)
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
  }, [run.runId, run.revision, trail]);

  const checkpoint = run.beginnerCheckpoint;

  return (
    <div className="hq-screen">
      <div className="hq-screen-head">
        <div>
          <h2 className="hq-screen-title">Froggy&rsquo;s Report Card</h2>
          <p className="hq-screen-subtitle">
            Every number below has a verified source in the ledger.
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
            : "Keep playing — a checkpoint lands once you have a year of months behind you. Ribbit."}
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
        <HqUnavailable>
          No beginner checkpoint has been assessed for this run yet. It is
          produced once the run reaches its twelfth month.
        </HqUnavailable>
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
            {state.message} Checkpoint evidence is served from the persistent
            database, so it is unavailable on the in-memory demo path.
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
