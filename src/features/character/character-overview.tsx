import { FeatureShell } from "@/components/feature-shell";
import { CUJS } from "@/core/cuj";

const responsibilities = [
  "Capture player inputs and presets",
  "Resolve location and career catalogs",
  "Hand validated inputs to the starting-state generator",
] as const;

export function CharacterOverview() {
  return (
    <FeatureShell journey={CUJS[0]} responsibilities={responsibilities} />
  );
}
