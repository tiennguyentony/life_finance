import { FeatureShell } from "@/components/feature-shell";
import { CUJS } from "@/core/cuj";

const responsibilities = [
  "Evaluate deterministic event eligibility and conditions",
  "Present emergencies and mitigation choices",
  "Send resolved outcomes to an optional narrative adapter",
] as const;

export function GameMasterOverview() {
  return (
    <FeatureShell journey={CUJS[2]} responsibilities={responsibilities} />
  );
}
