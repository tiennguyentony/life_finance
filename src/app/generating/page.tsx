import type { Metadata } from "next";

import { GeneratingScreen } from "@/features/onboarding/generating-screen";

export const metadata: Metadata = { title: "Generating your life" };

export default function GeneratingPage() {
  return <GeneratingScreen />;
}
