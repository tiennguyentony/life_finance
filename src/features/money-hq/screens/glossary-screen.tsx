"use client";

import { useMemo } from "react";

import type { RunViewWire } from "@/contracts/api/contracts";

import { demonstratedConceptIds, EDUCATION_CONCEPTS } from "../hq-concepts";
import { hqTab } from "../hq-tabs";
import { HqScreenHead } from "../hq-ui";

type Props = Readonly<{ run: RunViewWire }>;

export function GlossaryScreen({ run }: Props) {
  const froggy = hqTab("glossary");
  const demonstrated = useMemo(() => demonstratedConceptIds(run), [run]);
  const total = EDUCATION_CONCEPTS.length;
  const learned = demonstrated.size;
  const remaining = total - learned;

  return (
    <div className="hq-screen">
      <HqScreenHead
        characterName={froggy.characterName}
        characterSrc={froggy.characterSrc}
        line={
          remaining === 0
            ? "Ribbit. Every concept spotted!"
            : `Ribbit. ${remaining} to go.`
        }
        lineTone="positive"
        title="Field Guide"
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <b style={{ font: "800 1.25rem var(--hq-display)" }}>
            {learned}
            <span style={{ color: "var(--hq-faint)" }}>/{total}</span>
          </b>
          <div className="hq-meter" style={{ width: 120 }}>
            <div
              className="hq-meter-fill"
              style={{ width: `${total > 0 ? (learned / total) * 100 : 0}%` }}
            />
          </div>
        </div>
      </HqScreenHead>

      <div
        style={{
          display: "grid",
          gap: "0.625rem",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 14rem), 1fr))",
        }}
      >
        {EDUCATION_CONCEPTS.map((concept) => {
          const seen = demonstrated.has(concept.id);
          return (
            <article
              className="hq-card"
              key={concept.id}
              style={{
                borderRadius: 18,
                padding: "0.75rem 0.875rem",
                border: `2px solid ${seen ? "var(--hq-green-border)" : "transparent"}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <b style={{ font: "800 0.84375rem var(--hq-display)" }}>
                  {concept.title}
                </b>
                <div className="hq-planbar-spacer" />
                {seen ? (
                  <span
                    style={{
                      font: "800 0.75rem var(--hq-body-font)",
                      color: "var(--hq-green-deep)",
                    }}
                    title="Demonstrated in your run"
                  >
                    ✓<span className="sr-only"> demonstrated in your run</span>
                  </span>
                ) : null}
              </div>
              <p
                style={{
                  margin: "0.25rem 0 0",
                  font: "600 0.71875rem/1.45 var(--hq-body-font)",
                  color: "var(--hq-muted)",
                }}
              >
                {concept.shortDefinition}
              </p>
            </article>
          );
        })}
      </div>

      <p className="hq-note" style={{ margin: 0 }}>
        A ✓ means your own run&rsquo;s numbers have put the idea to work — not
        just that you read about it.
      </p>
    </div>
  );
}
