import type { Metadata } from "next";

import { PsychologyTrapsOverview } from "@/features/psychology-traps/psychology-traps-overview";

export const metadata: Metadata = { title: "Psychology Traps" };

export default function PsychologyTrapsPage() {
  return <PsychologyTrapsOverview />;
}
