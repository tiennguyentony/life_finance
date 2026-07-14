import { FeatureShell } from "@/components/feature-shell";
import { CUJS } from "@/core/cuj";

const responsibilities = [
  "Present cash flow, balance sheet, and wellbeing",
  "Collect allocation and lifestyle changes",
  "Orchestrate month advancement without owning formulas",
] as const;

export function DashboardOverview() {
  return (
    <FeatureShell journey={CUJS[1]} responsibilities={responsibilities} />
  );
}
