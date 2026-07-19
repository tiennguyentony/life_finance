"use client";

import Image from "next/image";
import type { ReactNode } from "react";

import type { BoardPlan } from "@/features/board/plan-catalog";

type CardProps = Readonly<{
  accent?: "green" | "gold";
  children: ReactNode;
  eyebrow?: string;
  aside?: ReactNode;
  style?: React.CSSProperties;
}>;

export function HqCard({ accent, aside, children, eyebrow, style }: CardProps) {
  return (
    <section className="hq-card" data-accent={accent} style={style}>
      {eyebrow || aside ? (
        <div className="hq-card-head">
          {eyebrow ? <h3 className="hq-eyebrow" style={{ margin: 0 }}>{eyebrow}</h3> : null}
          <div className="hq-planbar-spacer" />
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  );
}

type SpeechProps = Readonly<{
  characterSrc: string;
  characterName: string;
  children: ReactNode;
  tone?: "friendly" | "hostile";
}>;

export function HqSpeech({
  characterSrc,
  characterName,
  children,
  tone = "friendly",
}: SpeechProps) {
  const bubble = (
    <p className="hq-speech" data-tone={tone === "hostile" ? "hostile" : undefined}>
      {children}
    </p>
  );
  const portrait = (
    <Image
      alt={characterName}
      className="hq-character"
      height={104}
      src={characterSrc}
      width={104}
    />
  );

  return tone === "hostile" ? (
    <>
      {bubble}
      {portrait}
    </>
  ) : (
    <>
      {portrait}
      {bubble}
    </>
  );
}

export type LedgerEntry = Readonly<{
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
  total?: boolean;
}>;

export function HqLedger({ entries }: Readonly<{ entries: readonly LedgerEntry[] }>) {
  return (
    <dl className="hq-ledger">
      {entries.map((entry) => (
        <div
          className="hq-ledger-row"
          data-total={entry.total ? "true" : undefined}
          key={entry.label}
        >
          <dt className="hq-ledger-label">{entry.label}</dt>
          <dd className="hq-ledger-value" data-tone={entry.tone} style={{ margin: 0 }}>
            {entry.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

type MeterProps = Readonly<{
  label: string;
  valueLabel: string;
  percent: number;
  tone?: "positive" | "caution" | "negative" | "goal";
}>;

export function HqMeter({ label, valueLabel, percent, tone }: MeterProps) {
  return (
    <div style={{ marginBottom: "0.625rem" }}>
      <div className="hq-meter-row">
        <span>{label}</span>
        <b>{valueLabel}</b>
      </div>
      <div className="hq-meter">
        <div
          className="hq-meter-fill"
          data-tone={tone}
          style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Rendered where the design shows a panel the engine cannot source yet. Naming
 * the gap keeps the "every number is ledger-backed" promise honest.
 */
export function HqUnavailable({ children }: Readonly<{ children: ReactNode }>) {
  return <p className="hq-unavailable">{children}</p>;
}

type ChoiceListProps = Readonly<{
  plans: readonly BoardPlan[];
  selectedPlanId: string | null;
  disabled: boolean;
  onSelect: (planId: string) => void;
}>;

/**
 * The design's "choose one move" row. Every card, its copy and its effect list
 * come from the board plan catalog, so the preview a player reads is the same
 * one the commit path sends.
 */
export function HqChoiceList({
  plans,
  selectedPlanId,
  disabled,
  onSelect,
}: ChoiceListProps) {
  return (
    <div className="hq-choices">
      {plans.map((plan) => {
        const blocked = plan.disabledReason !== null;
        const selected = plan.id === selectedPlanId;
        return (
          <button
            aria-pressed={selected}
            className="hq-choice"
            disabled={disabled || blocked}
            key={plan.id}
            onClick={() => onSelect(plan.id)}
            type="button"
          >
            {selected ? <span className="hq-choice-flag">Selected</span> : null}
            {blocked ? (
              <span className="hq-choice-flag" data-tone="blocked">
                Unavailable
              </span>
            ) : null}
            <span className="hq-choice-title">{plan.label}</span>
            <span className="hq-choice-body">{plan.description}</span>
            {plan.effects.map((effect) => (
              <span className="hq-choice-effect" key={effect.label}>
                <span>{effect.label}</span>
                <b data-tone={effect.tone}>
                  {effect.value}
                  {effect.certainty === "directional" ? " ~" : ""}
                </b>
              </span>
            ))}
            {blocked ? (
              <span className="hq-note" data-tone="negative" style={{ marginTop: "0.375rem" }}>
                {plan.disabledReason}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
