"use client";

import { createContext, useContext } from "react";

import {
  useGameController,
  type GameController,
} from "@/features/game/use-game-controller";

const GameContext = createContext<GameController | null>(null);

export function GameProvider({ children }: { readonly children: React.ReactNode }) {
  const game = useGameController();
  return <GameContext.Provider value={game}>{children}</GameContext.Provider>;
}

export function useGame(): GameController {
  const context = useContext(GameContext);
  if (!context) throw new Error("useGame must be used inside GameProvider");
  return context;
}
