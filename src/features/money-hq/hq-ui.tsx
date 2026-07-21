"use client";

import Image from "next/image";
import type { ReactNode } from "react";

import type { BoardPlan } from "@/features/board/plan-catalog";

import { formatSignedCents } from "./hq-view";

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

type ScreenHeadProps = Readonly<{
  characterSrc?: string;
  characterName?: string;
  title: string;
  /** One short mascot line rendered as a chip next to the title. */
  line?: string;
  lineTone?: "positive" | "negative" | "caution";
  /** Right-aligned extras (chips, totals). */
  children?: ReactNode;
}>;

/** The redesign's compact screen header: mascot · title · one-line chip. */
export function HqScreenHead({
  characterSrc,
  characterName,
  title,
  line,
  lineTone,
  children,
}: ScreenHeadProps) {
  return (
    <div className="hq-screen-head" style={{ gap: "0.625rem" }}>
      {characterSrc ? (
        <Image
          alt={characterName ?? ""}
          height={54}
          src={characterSrc}
          style={{ objectFit: "contain" }}
          unoptimized
          width={54}
        />
      ) : null}
      <h2 className="hq-screen-title">{title}</h2>
      {line ? (
        <span className="hq-chip" data-tone={lineTone} style={{ fontSize: "0.75rem" }}>
          {line}
        </span>
      ) : null}
      <div className="hq-planbar-spacer" />
      {children}
    </div>
  );
}

type MiniTileProps = Readonly<{
  label: string;
  value: string;
  valueTone?: "positive" | "negative";
  caption?: string;
}>;

const MINI_TILE_COLOR: Readonly<Record<string, string>> = {
  positive: "var(--hq-green-deep)",
  negative: "var(--hq-red)",
};

/** Small stage-tinted stat tile used across the redesigned screens. */
export function HqMiniTile({ label, value, valueTone, caption }: MiniTileProps) {
  return (
    <div className="hq-mini-tile">
      <div className="hq-eyebrow">{label}</div>
      <div
        className="hq-mini-tile-value"
        style={valueTone ? { color: MINI_TILE_COLOR[valueTone] } : undefined}
      >
        {value}
      </div>
      {caption ? (
        <div style={{ font: "600 0.625rem var(--hq-body-font)", color: "var(--hq-muted)" }}>
          {caption}
        </div>
      ) : null}
    </div>
  );
}

type BannerProps = Readonly<{
  label: string;
  value: string;
  tone?: "positive" | "negative" | "gold";
}>;

/** Emphasis row like "LEFT OVER $110" or "FAST LANE SAVES $340". */
export function HqBanner({ label, value, tone }: BannerProps) {
  return (
    <div className="hq-banner" data-tone={tone}>
      <span className="hq-banner-label">{label}</span>
      <b className="hq-banner-value">{value}</b>
    </div>
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
      unoptimized
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

export type DeltaTile = Readonly<{
  label: string;
  value: string;
  tone: "positive" | "negative" | "neutral";
}>;

/** Compact tone-tinted tiles for month-over-month deltas. */
export function HqDeltaGrid({ tiles }: Readonly<{ tiles: readonly DeltaTile[] }>) {
  return (
    <div className="hq-delta-grid">
      {tiles.map((tile) => (
        <div className="hq-delta-tile" data-tone={tile.tone} key={tile.label}>
          <span className="hq-delta-label">{tile.label}</span>
          <b className="hq-delta-value">{tile.value}</b>
        </div>
      ))}
    </div>
  );
}

export type FlowBar = Readonly<{
  label: string;
  cents: number;
  /** Overrides the sign-derived tone, e.g. neutral for a zero line. */
  tone?: "positive" | "negative" | "neutral";
  total?: boolean;
}>;

/**
 * Horizontal money-in/money-out bars. Widths share one scale so the eye can
 * compare magnitudes; every value still comes straight from the engine.
 */
export function HqFlowBars({ bars }: Readonly<{ bars: readonly FlowBar[] }>) {
  const maxAbs = Math.max(...bars.map((bar) => Math.abs(bar.cents)), 1);
  return (
    <div className="hq-flow">
      {bars.map((bar) => {
        const tone =
          bar.tone ??
          (bar.cents === 0
            ? ("neutral" as const)
            : bar.cents > 0
              ? ("positive" as const)
              : ("negative" as const));
        const width = Math.max(2, (Math.abs(bar.cents) / maxAbs) * 100);
        return (
          <div
            className="hq-flow-row"
            data-total={bar.total ? "true" : undefined}
            key={bar.label}
          >
            <span className="hq-flow-label">{bar.label}</span>
            <span aria-hidden="true" className="hq-flow-track">
              <i className="hq-flow-bar" data-tone={tone} style={{ width: `${width}%` }} />
            </span>
            <b className="hq-flow-value" data-tone={tone}>
              {formatSignedCents(bar.cents)}
            </b>
          </div>
        );
      })}
    </div>
  );
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
