type ProgressRingProps = {
  readonly value: number;
  readonly label: string;
  readonly tone: "safe" | "watch" | "danger";
};

export function ProgressRing({ value, label, tone }: ProgressRingProps) {
  return (
    <div
      aria-label={`${label}: ${value} out of 100`}
      className={`progress-ring progress-ring-${tone}`}
      role="img"
      style={{ "--ring-value": `${value * 3.6}deg` } as React.CSSProperties}
    >
      <div className="progress-ring-core">
        <strong key={value}>{value}</strong>
        <span>/ 100</span>
      </div>
    </div>
  );
}
