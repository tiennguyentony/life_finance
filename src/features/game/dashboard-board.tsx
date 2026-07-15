import { ExposureCard, ResilienceCard } from "@/components/score-card";
import { MoneyCard } from "@/components/money-card";
import { PlayerHeader } from "@/components/player-header";
import { Sprout } from "@/components/sprout";
import type { DashboardView } from "@/types/game";

type DashboardBoardProps = {
  readonly dashboard: DashboardView;
  readonly controls?: React.ReactNode;
  readonly muted?: boolean;
};

export function DashboardBoard({ dashboard, controls, muted = false }: DashboardBoardProps) {
  return (
    <div className={`dashboard-board${muted ? " dashboard-board-muted" : ""}`}>
      <PlayerHeader
        month={dashboard.month}
        playerName={dashboard.playerName}
        runLabel={dashboard.runLabel}
      />
      <div className="dashboard-grid">
        <section className="money-grid" aria-label="Financial snapshot">
          <MoneyCard featured stat={dashboard.cash} />
          <MoneyCard stat={dashboard.cashFlow} />
          <MoneyCard stat={dashboard.investments} />
          <MoneyCard stat={dashboard.debt} />
          <MoneyCard featured stat={dashboard.netWorth} />
        </section>
        <section className="dashboard-side">
          <div className="sprout-reaction">
            <Sprout emotion={dashboard.sproutEmotion} size="medium" />
            <div className="sprout-bubble">{dashboard.sproutLine}</div>
          </div>
          <div className="score-stack">
            <ResilienceCard score={dashboard.resilience} />
            <ExposureCard score={dashboard.exposure} />
          </div>
        </section>
      </div>
      {controls ? <div className="game-controls">{controls}</div> : null}
    </div>
  );
}
