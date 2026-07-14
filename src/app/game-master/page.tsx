import type { Metadata } from "next";

import { GameMasterOverview } from "@/features/game-master/game-master-overview";

export const metadata: Metadata = { title: "Game Master" };

export default function GameMasterPage() {
  return <GameMasterOverview />;
}
