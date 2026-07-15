type PlayerHeaderProps = {
  readonly playerName: string;
  readonly month: string;
  readonly runLabel: string;
};

export function PlayerHeader({ playerName, month, runLabel }: PlayerHeaderProps) {
  return (
    <header className="player-header">
      <div>
        <p>{runLabel}</p>
        <h1>{playerName}&apos;s life</h1>
      </div>
      <div className="month-chip">
        <span>Current month</span>
        <strong>{month}</strong>
      </div>
    </header>
  );
}
