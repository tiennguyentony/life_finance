import type { Metadata } from "next";

import { GameDashboard } from "@/features/game/game-dashboard";

export const metadata: Metadata = { title: "Your life" };

export default function GamePage() {
  return <GameDashboard />;
}
