import type { Metadata } from "next";

import { GameShell } from "@/features/game/game-shell";

export const metadata: Metadata = { title: "Brightwater City - Play" };

export default function GamePlayPage() {
  return <GameShell />;
}
