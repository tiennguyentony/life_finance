import { FeatureShell } from "@/components/feature-shell";
import { CUJS } from "@/core/cuj";

const responsibilities = [
  "Present simulated hype and private opportunities",
  "Collect speculative decisions",
  "Schedule trap consequences through deterministic core rules",
] as const;

export function PsychologyTrapsOverview() {
  return (
    <FeatureShell journey={CUJS[3]} responsibilities={responsibilities} />
  );
}
