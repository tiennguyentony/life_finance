import type { Metadata } from "next";

import { MoneyHqShell } from "@/features/money-hq/money-hq-shell";

export const metadata: Metadata = {
  title: "Money HQ",
  description:
    "Plan a month across budget, debt, investing, career and safety, with every figure sourced from the run's authoritative state.",
};

export default function MoneyHqPage() {
  return <MoneyHqShell />;
}
