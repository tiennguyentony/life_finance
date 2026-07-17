"use client";

import Image from "next/image";

import {
  BOARD_CALENDAR,
  BOARD_GOAL,
  BOARD_PLAYER,
  BOARD_SIDE_PANELS,
  BOARD_STATS,
  BOARD_TROPHIES,
  formatBoardMoney,
} from "./placeholder-data";

type BoardHudProps = Readonly<{
  actionLabel: string;
  actionHint: string;
  onTakeAction: () => void;
  /** Placeholder handler for panels that have no screen yet. */
  onStub: (label: string) => void;
  toast: string | null;
}>;

export function BoardHud({ actionLabel, actionHint, onTakeAction, onStub, toast }: BoardHudProps) {
  const goalPercent = Math.round((BOARD_GOAL.current / BOARD_GOAL.target) * 100);
  const [goals, events, journal] = BOARD_SIDE_PANELS;

  return (
    <div className="board-hud">
      <header className="board-hud-top">
        <div className="board-player-card">
          <span className="board-avatar">
            <Image
              alt={BOARD_PLAYER.avatarAlt}
              fill
              sizes="52px"
              src={BOARD_PLAYER.avatarSrc}
            />
          </span>
          <div className="board-player-meta">
            <strong>{BOARD_PLAYER.name}</strong>
            <span>Level {BOARD_PLAYER.level}</span>
            <span
              aria-label={`Experience ${BOARD_PLAYER.xpPercent} percent`}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={BOARD_PLAYER.xpPercent}
              className="board-xp"
              role="progressbar"
            >
              <i style={{ width: `${BOARD_PLAYER.xpPercent}%` }} />
            </span>
          </div>
        </div>

        <dl className="board-stat-row">
          {BOARD_STATS.map((stat) => (
            <div className={`board-stat board-stat-${stat.tone}`} key={stat.id}>
              <dt>{stat.label}</dt>
              <dd>{formatBoardMoney(stat.amount)}</dd>
            </div>
          ))}
        </dl>

        <div className="board-top-right">
          <span className="board-trophies">Trophies {BOARD_TROPHIES}</span>
          <button className="board-icon-button" onClick={() => onStub("Menu")} type="button">
            Menu
          </button>
        </div>
      </header>

      <nav aria-label="Board panels" className="board-side board-side-left">
        {[goals!, events!].map((panel) => (
          <button
            className="board-side-button"
            key={panel.id}
            onClick={() => onStub(panel.label)}
            type="button"
          >
            {panel.label}
            <span className="board-badge">{panel.badge}</span>
          </button>
        ))}
      </nav>
      <nav aria-label="Board journal" className="board-side board-side-right">
        <button
          className="board-side-button"
          onClick={() => onStub(journal!.label)}
          type="button"
        >
          {journal!.label}
          <span className="board-badge">{journal!.badge}</span>
        </button>
      </nav>

      <footer className="board-hud-bottom">
        <div className="board-calendar">
          <strong>Day {BOARD_CALENDAR.day}</strong>
          <span>Week {BOARD_CALENDAR.week}</span>
        </div>

        <div className="board-goal">
          <span className="board-goal-label">{BOARD_GOAL.label}</span>
          <span
            aria-label={`Goal progress ${goalPercent} percent`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={goalPercent}
            className="board-goal-bar"
            role="progressbar"
          >
            <i style={{ width: `${goalPercent}%` }} />
          </span>
          <span className="board-goal-amount">
            {formatBoardMoney(BOARD_GOAL.current)} / {formatBoardMoney(BOARD_GOAL.target)}
          </span>
        </div>

        <button className="board-take-action" onClick={onTakeAction} type="button">
          {actionLabel}
          <small>{actionHint}</small>
        </button>
      </footer>

      {toast ? (
        <p className="board-toast" role="status">
          {toast}
        </p>
      ) : null}
    </div>
  );
}
