"use client";

import Image from "next/image";
import type { ReactNode } from "react";

import {
  type BoardView,
  formatBoardMoney,
} from "./board-model";
import type { BoardMode } from "./board-scene";
import { useModalDialog } from "./use-modal-dialog";

type BoardHudProps = Readonly<{
  actionLabel: string;
  actionHint: string;
  busy: boolean;
  eventReturnFocusTarget: HTMLElement | null;
  eventVisible: boolean;
  mode: BoardMode;
  monthResultDialog: ReactNode;
  planningPanel: ReactNode;
  view: BoardView;
  onTakeAction: () => void;
  onResolveEvent: (choiceId: string) => void;
  /** Placeholder handler for panels that have no screen yet. */
  onStub: (label: string) => void;
  toastMessage: string;
  toastVisible: boolean;
}>;

/** Count badge that hides at zero and caps at "9+" so it never shows a
 * meaningless "0" or overflows its circle at 3+ digits. */
function PanelBadge({ count }: Readonly<{ count: number }>) {
  if (count <= 0) return null;
  return <span className="board-badge">{count > 9 ? "9+" : count}</span>;
}

export function BoardHud({
  actionLabel,
  actionHint,
  busy,
  eventReturnFocusTarget,
  eventVisible,
  mode,
  monthResultDialog,
  planningPanel,
  view,
  onTakeAction,
  onResolveEvent,
  onStub,
  toastMessage,
  toastVisible,
}: BoardHudProps) {
  const eventDialogRef = useModalDialog(eventVisible, {
    returnFocusTarget: eventReturnFocusTarget,
  });
  const goalPercent = Math.min(
    100,
    Math.round((view.goal.current / Math.max(1, view.goal.target)) * 100),
  );
  const [goals, events, journal] = view.sidePanels;
  const eventAmount = view.pendingEvent
    ? Object.entries(view.pendingEvent.parameters).find(([key]) => key.endsWith("_cents"))?.[1]
    : undefined;

  return (
    <div className="board-hud">
      {monthResultDialog}
      <header className="board-hud-top">
        <div className="board-player-card">
          <span className="board-avatar">
            <Image
              alt={view.player.avatarAlt}
              fill
              sizes="52px"
              src={view.player.avatarSrc}
            />
          </span>
          <div className="board-player-meta">
            <strong>{view.player.name}</strong>
            <span>Level {view.player.level}</span>
            <span
              aria-label={`Experience ${view.player.xpPercent} percent`}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={view.player.xpPercent}
              className="board-xp"
              role="progressbar"
            >
              <i style={{ width: `${view.player.xpPercent}%` }} />
            </span>
          </div>
        </div>

        <dl className="board-stat-row">
          {view.stats.map((stat) => (
            <div className={`board-stat board-stat-${stat.tone}`} key={stat.id}>
              <dt>{stat.label}</dt>
              <dd>{formatBoardMoney(stat.amount)}</dd>
            </div>
          ))}
        </dl>

        {mode === "free" ? (
          <div className="board-top-right">
            <span className="board-trophies">Trophies {view.trophies}</span>
            <button className="board-icon-button" onClick={() => onStub("Menu")} type="button">
              Menu
            </button>
          </div>
        ) : null}
      </header>

      {mode === "free" ? (
        <nav aria-label="Board panels" className="board-side board-side-left">
          {[goals!, events!].map((panel) => (
            <button
              className="board-side-button"
              key={panel.id}
              onClick={() => onStub(panel.label)}
              type="button"
            >
              {panel.label}
              <PanelBadge count={panel.badge} />
            </button>
          ))}
        </nav>
      ) : null}
      {mode === "free" ? (
        <nav aria-label="Board journal" className="board-side board-side-right">
          <button
            className="board-side-button"
            onClick={() => onStub(journal!.label)}
            type="button"
          >
            {journal!.label}
            <PanelBadge count={journal!.badge} />
          </button>
        </nav>
      ) : null}

      <footer className="board-hud-bottom">
        <div className="board-calendar">
          <strong>{view.calendar.label}</strong>
          <span>{view.calendar.detail}</span>
        </div>

        <div className="board-goal">
          <span className="board-goal-label">{view.goal.label}</span>
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
            {formatBoardMoney(view.goal.current)} / {formatBoardMoney(view.goal.target)}
          </span>
        </div>

        {mode === "strategy" ? (
          planningPanel ? null : (
            <p className="board-strategy-prompt">Choose your focus for this month</p>
          )
        ) : (
          <button
            className="board-take-action"
            disabled={busy || view.pendingEvent !== null}
            onClick={onTakeAction}
            type="button"
          >
            {actionLabel}
            <small>{actionHint}</small>
          </button>
        )}
      </footer>

      {mode === "strategy" ? planningPanel : null}

      {view.pendingEvent ? (
        <dialog
          aria-labelledby="board-event-title"
          aria-modal="true"
          className="board-event-dialog"
          hidden={!eventVisible}
          onCancel={(event) => event.preventDefault()}
          ref={eventDialogRef}
          role="dialog"
          style={eventVisible ? undefined : { display: "none" }}
        >
          <span>Decision required</span>
          <h2 id="board-event-title">{view.pendingEvent.headline}</h2>
          <p>{view.pendingEvent.body}</p>
          {eventAmount !== undefined ? (
            <p className="board-event-amount">Amount {formatBoardMoney(eventAmount / 100)}</p>
          ) : null}
          <div>
            {view.pendingEvent.choices.map((choice) => (
              <button
                disabled={busy}
                key={choice.id}
                onClick={() => onResolveEvent(choice.id)}
                type="button"
              >
                <strong>{choice.label}</strong>
                <span>{choice.description}</span>
              </button>
            ))}
          </div>
        </dialog>
      ) : null}

      {/* Always mounted so the live region reliably announces on text change;
          `data-visible` drives the enter/exit transition and hides it at rest. */}
      <p aria-live="polite" className="board-toast" data-visible={toastVisible} role="status">
        {toastMessage}
      </p>
    </div>
  );
}
