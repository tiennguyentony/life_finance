import type { Metadata } from "next";

import { GameShell } from "@/features/brightwater/game-shell";

export const metadata: Metadata = { title: "Brightwater City - Play" };

export default function BrightwaterPlayPage() {
  return <GameShell />;
}
