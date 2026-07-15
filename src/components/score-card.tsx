import { ProgressRing } from "./progress-ring";

import type { ScoreView } from "@/types/game";

type ScoreCardProps = {
  readonly score: ScoreView;
  readonly kind: "resilience" | "exposure";
};

export function ScoreCard({ score, kind }: ScoreCardProps) {
  return (
    <article className={`score-card score-card-${kind}`}>
      <ProgressRing label={score.label} tone={score.tone} value={score.value} />
      <div>
        <span>{score.label}</span>
        <strong>{kind === "resilience" ? "How hard you are to knock over" : "How much chaos can reach you"}</strong>
        <p>{score.note}</p>
      </div>
    </article>
  );
}

export function ResilienceCard({ score }: { readonly score: ScoreView }) {
  return <ScoreCard kind="resilience" score={score} />;
}

export function ExposureCard({ score }: { readonly score: ScoreView }) {
  return <ScoreCard kind="exposure" score={score} />;
}
