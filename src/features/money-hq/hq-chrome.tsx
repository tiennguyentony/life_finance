"use client";

import Image from "next/image";

import { revolvingAprPercent } from "./hq-derivations";
import {
  formatCents,
  formatCompactCents,
  formatPpmPercent,
  formatTinyMonthLabel,
  type HqView,
} from "./hq-view";
import { HQ_TABS, SPROUT_AVATAR, type HqTabId } from "./hq-tabs";

/* ------------------------------------------------------------------ rings -- */

type RingProps = Readonly<{
  /** 0–100. */
  percent: number;
  label: string;
  sublabel?: string;
  size?: number;
  color?: string;
}>;

const RING_RADIUS = 45;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Progress ring used by the goal card, safety score, and tax rate. */
export function HqRing({
  percent,
  label,
  sublabel,
  size = 96,
  color = "var(--hq-green)",
}: RingProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  // Never collapses to nothing: a sliver of progress stays visible.
  const dash = Math.max(2.8, (clamped / 100) * RING_CIRCUMFERENCE);

  return (
    <svg
      aria-hidden="true"
      style={{ width: size, height: size, flex: "none" }}
      viewBox="0 0 120 120"
    >
      <circle
        cx="60"
        cy="60"
        fill="none"
        r={RING_RADIUS}
        stroke="var(--hq-stage)"
        strokeWidth="13"
      />
      <circle
        cx="60"
        cy="60"
        fill="none"
        r={RING_RADIUS}
        stroke={color}
        strokeDasharray={`${dash} ${RING_CIRCUMFERENCE - dash}`}
        strokeLinecap="round"
        strokeWidth="13"
        transform="rotate(-90 60 60)"
      />
      <text
        style={{ font: "800 22px var(--hq-display)", fill: "var(--hq-ink)" }}
        textAnchor="middle"
        x="60"
        y={sublabel ? 57 : 67}
      >
        {label}
      </text>
      {sublabel ? (
        <text
          style={{ font: "800 10px var(--hq-body-font)", fill: "var(--hq-soft)" }}
          textAnchor="middle"
          x="60"
          y="76"
        >
          {sublabel}
        </text>
      ) : null}
    </svg>
  );
}

const MINI_RING_RADIUS = 17;
const MINI_RING_CIRCUMFERENCE = 2 * Math.PI * MINI_RING_RADIUS;

function MiniRing({ percent }: Readonly<{ percent: number }>) {
  const clamped = Math.max(0, Math.min(100, percent));
  const dash = Math.max(2, (clamped / 100) * MINI_RING_CIRCUMFERENCE);

  return (
    <svg aria-hidden="true" style={{ width: 40, height: 40, flex: "none" }} viewBox="0 0 44 44">
      <circle cx="22" cy="22" fill="none" r={MINI_RING_RADIUS} stroke="var(--hq-stage)" strokeWidth="7" />
      <circle
        cx="22"
        cy="22"
        fill="none"
        r={MINI_RING_RADIUS}
        stroke="var(--hq-green)"
        strokeDasharray={`${dash} ${MINI_RING_CIRCUMFERENCE - dash}`}
        strokeLinecap="round"
        strokeWidth="7"
        transform="rotate(-90 22 22)"
      />
    </svg>
  );
}

/* ----------------------------------------------------------------- topbar -- */

type TopbarProps = Readonly<{
  view: HqView;
  busy: boolean;
  /** Net-worth change across the last recorded month; null hides the chip. */
  monthDeltaCents?: number | null;
  onSavedGames: () => void;
  onNewGame: () => void;
}>;

export function HqTopbar({
  view,
  busy,
  monthDeltaCents = null,
  onSavedGames,
  onNewGame,
}: TopbarProps) {
  const runway = view.emergencyFundMonths;
  const runwayChip =
    runway === null
      ? null
      : {
          label: `${(Math.round(runway * 10) / 10).toFixed(1)} mo`,
          tone: runway >= 3 ? "positive" : runway >= 1 ? "caution" : "negative",
        };

  const deltaChip =
    monthDeltaCents === null
      ? null
      : {
          label: `${monthDeltaCents >= 0 ? "▲" : "▼"} ${formatCents(Math.abs(monthDeltaCents))}`,
          tone: monthDeltaCents >= 0 ? "positive" : "negative",
        };

  const maxTermAprPpm = view.termDebts.reduce(
    (max, debt) => Math.max(max, debt.annualInterestRatePpm),
    0,
  );
  const debtChip =
    view.debtCents <= 0
      ? { label: "debt free", tone: "positive" }
      : view.revolvingUsedCents > 0
        ? { label: `${revolvingAprPercent()}% APR`, tone: "negative" }
        : { label: `${formatPpmPercent(maxTermAprPpm, 1)} APR`, tone: "negative" };

  return (
    <div className="hq-hud-top">
      <div className="hq-identity">
        <Image
          alt="Sprout"
          height={46}
          src={SPROUT_AVATAR}
          unoptimized
          width={46}
        />
        <div>
          <div className="hq-identity-name">Sprout</div>
          <div className="hq-identity-date">
            {formatTinyMonthLabel(view.monthKey)} · MONTH {view.monthNumber}
          </div>
        </div>
      </div>

      <div className="hq-hud-tiles">
        <HudTile chip={runwayChip} label="Cash" value={formatCents(view.cashCents)} />
        <HudTile
          chip={deltaChip}
          label="Net worth"
          value={formatCents(view.netWorthCents)}
        />
        <HudTile
          chip={debtChip}
          label="Debt"
          value={view.debtCents > 0 ? formatCents(view.debtCents) : formatCents(0)}
          valueTone={view.debtCents > 0 ? "debt" : undefined}
        />
        <div className="hq-hud-tile">
          <div>
            <div className="hq-eyebrow">Freedom</div>
            <div className="hq-hud-figure">
              {formatPpmPercent(view.goalProgressPpm, 1)}
            </div>
          </div>
          <MiniRing percent={view.goalProgressPpm / 10_000} />
        </div>
      </div>

      <div className="hq-hud-actions">
        <button
          className="hq-topbar-action"
          disabled={busy}
          onClick={onSavedGames}
          type="button"
        >
          Saves
        </button>
        <button
          className="hq-topbar-action"
          disabled={busy}
          onClick={onNewGame}
          type="button"
        >
          New game
        </button>
      </div>
    </div>
  );
}

type HudTileProps = Readonly<{
  label: string;
  value: string;
  valueTone?: "debt";
  chip: Readonly<{ label: string; tone: string }> | null;
}>;

function HudTile({ label, value, valueTone, chip }: HudTileProps) {
  return (
    <div className="hq-hud-tile">
      <div>
        <div className="hq-eyebrow">{label}</div>
        <div
          className="hq-hud-figure"
          style={valueTone === "debt" ? { color: "var(--hq-red)" } : undefined}
        >
          {value}
        </div>
      </div>
      {chip ? (
        <span
          className="hq-chip"
          data-tone={chip.tone === "neutral" ? undefined : chip.tone}
          style={{ whiteSpace: "nowrap" }}
        >
          {chip.label}
        </span>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- sidebar -- */

type SidebarProps = Readonly<{
  activeTab: HqTabId;
  view: HqView;
  onSelectTab: (tab: HqTabId) => void;
}>;

export function HqSidebar({ activeTab, view, onSelectTab }: SidebarProps) {
  const goalPercent = view.goalProgressPpm / 10_000;

  return (
    <div className="hq-sidebar">
      <nav aria-label="Money HQ sections" className="hq-nav">
        {HQ_TABS.map((tab) => {
          const badge = tab.id === "debt" ? view.debtBadge : 0;
          const isActive = tab.id === activeTab;
          return (
            <button
              aria-current={isActive ? "page" : undefined}
              className="hq-nav-item"
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              type="button"
            >
              <Image
                alt=""
                className="hq-nav-icon"
                height={34}
                src={tab.characterSrc}
                style={{ background: tab.iconTint }}
                unoptimized
                width={34}
              />
              <span className="hq-nav-label">{tab.label}</span>
              {badge > 0 ? (
                <span className="hq-nav-badge">
                  {badge}
                  <span className="sr-only"> item needs attention</span>
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="hq-goal-card" style={{ textAlign: "center" }}>
        <HqRing
          label={formatPpmPercent(view.goalProgressPpm, 1)}
          percent={goalPercent}
          sublabel="TO FREE"
        />
        <div style={{ font: "800 0.75rem var(--hq-display)" }}>
          {formatCents(view.goalCurrentCents)}{" "}
          <span style={{ color: "var(--hq-faint)" }}>
            / {formatCompactCents(view.goalTargetCents)}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- planbar -- */

type PlanBarProps = Readonly<{
  busy: boolean;
  canCommit: boolean;
  summary: readonly string[];
  hint: string | null;
  commitLabel: string;
  onCommit: () => void;
}>;

export function HqPlanBar({
  busy,
  canCommit,
  summary,
  hint,
  commitLabel,
  onCommit,
}: PlanBarProps) {
  return (
    <div className="hq-planbar">
      <span className="hq-eyebrow">Plan</span>
      {summary.length === 0 ? (
        <span className="hq-chip">pick a move</span>
      ) : (
        summary.map((entry) => (
          <span className="hq-chip" data-tone="caution" key={entry}>
            {entry}
          </span>
        ))
      )}
      <div className="hq-planbar-spacer" />
      {hint ? <span className="hq-planbar-hint">{hint}</span> : null}
      <button
        className="hq-live-button"
        disabled={busy || !canCommit}
        onClick={onCommit}
        type="button"
      >
        {busy ? "Saving…" : commitLabel}
      </button>
    </div>
  );
}

/** The month-over-month net-worth delta shown in the topbar, from the trail. */
export function monthDeltaFromTrail(
  trail: readonly Readonly<{ netWorthCents: number }>[],
): number | null {
  if (trail.length < 2) return null;
  return trail.at(-1)!.netWorthCents - trail.at(-2)!.netWorthCents;
}
