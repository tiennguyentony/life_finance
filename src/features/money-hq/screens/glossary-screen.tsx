"use client";

import { useMemo, useState } from "react";

import type { RunViewWire } from "@/contracts/api/contracts";

import {
  demonstratedConceptIds,
  groupedConcepts,
  EDUCATION_CONCEPTS,
} from "../hq-concepts";
import { hqTab } from "../hq-tabs";
import { HqCard, HqSpeech } from "../hq-ui";

type Props = Readonly<{ run: RunViewWire }>;

export function GlossaryScreen({ run }: Props) {
  const froggy = hqTab("glossary");
  const [query, setQuery] = useState("");
  const demonstrated = useMemo(() => demonstratedConceptIds(run), [run]);
  const groups = useMemo(() => groupedConcepts(), []);
  const needle = query.trim().toLowerCase();

  const filtered = groups
    .map(({ group, concepts }) => ({
      group,
      concepts: concepts.filter(
        (concept) =>
          needle === "" ||
          concept.title.toLowerCase().includes(needle) ||
          concept.shortDefinition.toLowerCase().includes(needle),
      ),
    }))
    .filter(({ concepts }) => concepts.length > 0);

  return (
    <div className="hq-screen">
      <div className="hq-screen-head">
        <div>
          <h2 className="hq-screen-title">Froggy&rsquo;s Field Guide</h2>
          <p className="hq-screen-subtitle">
            Every concept the game teaches. Ones your own run has put to work are
            marked.
          </p>
        </div>
        <div className="hq-planbar-spacer" />
        <HqSpeech characterName={froggy.characterName} characterSrc={froggy.characterSrc}>
          {demonstrated.size} of {EDUCATION_CONCEPTS.length} showing up in your
          numbers so far. Ribbit.
        </HqSpeech>
      </div>

      <HqCard>
        <label className="hq-eyebrow" htmlFor="hq-glossary-search">
          Search concepts
        </label>
        <input
          className="hq-topbar-action"
          id="hq-glossary-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search concepts…"
          style={{
            display: "block",
            width: "min(24rem, 100%)",
            marginTop: "0.375rem",
            border: "2px solid var(--hq-line-strong)",
            cursor: "text",
          }}
          type="search"
          value={query}
        />
      </HqCard>

      {filtered.length === 0 ? (
        <p className="hq-empty">No concept matches “{query}”.</p>
      ) : (
        filtered.map(({ group, concepts }) => (
          <section key={group.id}>
            <h3 className="hq-eyebrow" style={{ margin: "0 0 0.5rem" }}>
              {group.label}
            </h3>
            <div
              style={{
                display: "grid",
                gap: "0.625rem",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 18rem), 1fr))",
              }}
            >
              {concepts.map((concept) => {
                const learned = demonstrated.has(concept.id);
                return (
                  <article
                    className="hq-card"
                    key={concept.id}
                    style={
                      learned
                        ? { border: "2px solid var(--hq-green-border)" }
                        : undefined
                    }
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        marginBottom: "0.25rem",
                      }}
                    >
                      <h4 style={{ margin: 0, font: "800 0.9375rem var(--hq-display)" }}>
                        {concept.title}
                      </h4>
                      <div className="hq-planbar-spacer" />
                      {learned ? (
                        <span className="hq-chip" data-tone="positive">
                          ✓ in your run
                        </span>
                      ) : null}
                    </div>
                    <p
                      style={{
                        font: "600 0.75rem var(--hq-body-font)",
                        color: "var(--hq-body)",
                        lineHeight: 1.5,
                        margin: "0 0 0.375rem",
                      }}
                    >
                      {concept.shortDefinition}
                    </p>
                    <p
                      style={{
                        font: "600 0.71875rem var(--hq-body-font)",
                        color: "var(--hq-muted)",
                        margin: "0 0 0.25rem",
                      }}
                    >
                      <b>Why it matters:</b> {concept.whyItMatters}
                    </p>
                    <p
                      style={{
                        font: "600 0.71875rem var(--hq-body-font)",
                        color: "var(--hq-muted)",
                        margin: 0,
                      }}
                    >
                      <b>Trade-off:</b> {concept.decisionTradeoff}
                    </p>
                  </article>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
