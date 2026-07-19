"use client";

import Image from "next/image";

import { formatCents, formatPpmPercent, type HqView } from "./hq-view";
import { HQ_TABS, SPROUT_AVATAR, type HqTabId } from "./hq-tabs";

type TopbarProps = Readonly<{
  view: HqView;
  busy: boolean;
  onSavedGames: () => void;
  onNewGame: () => void;
}>;

export function HqTopbar({ view, busy, onSavedGames, onNewGame }: TopbarProps) {
  return (
    <div className="hq-topbar">
      <div className="hq-identity">
        <Image
          alt="Sprout"
          height={42}
          src={SPROUT_AVATAR}
          unoptimized
          width={42}
        />
        <div>
          <div className="hq-identity-name">Sprout</div>
          <div className="hq-meter" style={{ width: 92, height: 7 }}>
            <div
              className="hq-meter-fill"
              style={{ width: `${Math.min(100, view.goalProgressPpm / 10_000)}%` }}
            />
          </div>
        </div>
      </div>

      <HqTopStat
        label="Cash"
        symbol="$"
        tone="cash"
        value={formatCents(view.cashCents)}
      />
      <HqTopStat
        label="Net worth"
        symbol="◆"
        tone="net-worth"
        value={formatCents(view.netWorthCents)}
      />
      <HqTopStat
        label="Debt"
        symbol="!"
        tone="debt"
        value={view.debtCents > 0 ? `−${formatCents(view.debtCents)}` : formatCents(0)}
      />

      <div className="hq-calendar">
        <div className="hq-stat-label">{view.monthLabel}</div>
        <div className="hq-calendar-month">Month {view.monthNumber}</div>
      </div>

      <div className="hq-topbar-spacer" />

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
  );
}

type TopStatProps = Readonly<{
  label: string;
  symbol: string;
  tone: "cash" | "net-worth" | "debt";
  value: string;
}>;

function HqTopStat({ label, symbol, tone, value }: TopStatProps) {
  return (
    <div className="hq-stat">
      <span aria-hidden="true" className="hq-stat-icon" data-tone={tone}>
        {symbol}
      </span>
      <div>
        <div className="hq-stat-label">{label}</div>
        <div className="hq-stat-value" data-tone={tone === "debt" ? "debt" : undefined}>
          {value}
        </div>
      </div>
    </div>
  );
}

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
              <span>
                <span className="hq-nav-label">{tab.label}</span>
                <span className="hq-nav-hint" style={{ display: "block" }}>
                  {tab.hint}
                </span>
              </span>
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

      <div className="hq-goal-card">
        <div className="hq-eyebrow">Goal · financial independence</div>
        <div className="hq-meter" style={{ margin: "0.5rem 0 0.375rem" }}>
          <div
            className="hq-meter-fill"
            data-tone="goal"
            style={{ width: `${Math.max(1, Math.min(100, goalPercent))}%` }}
          />
        </div>
        <div style={{ font: "800 0.75rem var(--hq-display)" }}>
          {formatCents(view.goalCurrentCents)}{" "}
          <span style={{ color: "var(--hq-faint)" }}>
            / {formatCents(view.goalTargetCents)}
          </span>
        </div>
        <div className="hq-nav-hint" style={{ marginTop: "0.25rem" }}>
          {formatPpmPercent(view.goalProgressPpm, 1)} there
        </div>
      </div>
    </div>
  );
}

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
      <span className="hq-eyebrow">This month&rsquo;s plan</span>
      {summary.length === 0 ? (
        <span className="hq-chip">Nothing selected yet</span>
      ) : (
        summary.map((entry) => (
          <span className="hq-chip" key={entry}>
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
