"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { getNextEvent, submitDecision } from "@/services/event.service";
import { generatePlayer, getPlayerState } from "@/services/player.service";
import type {
  DashboardView,
  DecisionId,
  EventResult,
  PersonaId,
  PlayerView,
  ProfileInput,
} from "@/types/game";

const STORAGE_KEY = "life-finance.prototype.v1";

type GameStatus = "idle" | "loading" | "ready" | "error";

type StoredGame = {
  readonly selectedPersonaId: PersonaId | null;
  readonly pendingProfile: ProfileInput | null;
  readonly player: PlayerView | null;
  readonly dashboard: DashboardView | null;
  readonly decisionId: DecisionId | null;
  readonly pendingEvent: EventResult | null;
};

type GameContextValue = StoredGame & {
  readonly status: GameStatus;
  readonly error: string | null;
  readonly hydrated: boolean;
  readonly choosePersona: (personaId: PersonaId) => void;
  readonly queueProfile: (profile: ProfileInput) => void;
  readonly generateGame: () => Promise<void>;
  readonly ensureGame: () => Promise<void>;
  readonly makeDecision: (decisionId: DecisionId) => Promise<void>;
  readonly revealEvent: () => Promise<void>;
  readonly continueAfterEvent: () => void;
  readonly resetGame: () => void;
};

const EMPTY_GAME: StoredGame = {
  selectedPersonaId: null,
  pendingProfile: null,
  player: null,
  dashboard: null,
  decisionId: null,
  pendingEvent: null,
};

const GameContext = createContext<GameContextValue | null>(null);

function readStoredGame(): StoredGame {
  if (typeof window === "undefined") {
    return EMPTY_GAME;
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as StoredGame) : EMPTY_GAME;
  } catch {
    return EMPTY_GAME;
  }
}

export function GameProvider({ children }: { readonly children: React.ReactNode }) {
  const [game, setGame] = useState<StoredGame>(EMPTY_GAME);
  const [status, setStatus] = useState<GameStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Hydrate after mount so server and first client render remain identical.
    const timer = window.setTimeout(() => {
      setGame(readStoredGame());
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (hydrated) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
    }
  }, [game, hydrated]);

  const choosePersona = useCallback((personaId: PersonaId) => {
    setGame((current) => ({ ...current, selectedPersonaId: personaId }));
  }, []);

  const queueProfile = useCallback((pendingProfile: ProfileInput) => {
    setGame((current) => ({
      ...current,
      selectedPersonaId: pendingProfile.personaId,
      pendingProfile,
    }));
  }, []);

  const generateGame = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const pendingProfile = game.pendingProfile;
      if (!pendingProfile) {
        throw new Error("Choose a persona before generating a game.");
      }
      const result = await generatePlayer(pendingProfile, { delayMs: 1700 });
      setGame((current) => ({
        ...current,
        player: result.player,
        dashboard: result.dashboard,
        decisionId: null,
        pendingEvent: null,
      }));
      setStatus("ready");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sprout lost the paperwork.");
      setStatus("error");
      throw reason;
    }
  }, [game.pendingProfile]);

  const ensureGame = useCallback(async () => {
    if (game.dashboard) {
      setStatus("ready");
      return;
    }

    setStatus("loading");
    setError(null);
    try {
      const result = await getPlayerState({ delayMs: 900 });
      setGame((current) => ({
        ...current,
        player: result.player,
        dashboard: result.dashboard,
      }));
      setStatus("ready");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The run could not load.");
      setStatus("error");
    }
  }, [game.dashboard]);

  const makeDecision = useCallback(async (decisionId: DecisionId) => {
    setStatus("loading");
    setError(null);
    try {
      const result = await submitDecision(decisionId, { delayMs: 650 });
      setGame((current) => ({
        ...current,
        decisionId: result.decisionId,
        dashboard: {
          ...result.dashboard,
          playerName: current.player?.name ?? result.dashboard.playerName,
        },
      }));
      setStatus("ready");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That move did not land.");
      setStatus("error");
      throw reason;
    }
  }, []);

  const revealEvent = useCallback(async () => {
    if (!game.decisionId || game.pendingEvent) {
      return;
    }

    setStatus("loading");
    setError(null);
    try {
      const event = await getNextEvent(game.decisionId, { delayMs: 900 });
      setGame((current) => ({ ...current, pendingEvent: event }));
      setStatus("ready");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Life forgot to happen.");
      setStatus("error");
    }
  }, [game.decisionId, game.pendingEvent]);

  const continueAfterEvent = useCallback(() => {
    setGame((current) => {
      if (!current.pendingEvent) {
        return current;
      }
      return {
        ...current,
        dashboard: {
          ...current.pendingEvent.dashboard,
          playerName: current.player?.name ?? current.pendingEvent.dashboard.playerName,
        },
        decisionId: null,
        pendingEvent: null,
      };
    });
    setStatus("ready");
  }, []);

  const resetGame = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    setGame(EMPTY_GAME);
    setError(null);
    setStatus("idle");
  }, []);

  const value = useMemo<GameContextValue>(
    () => ({
      ...game,
      status,
      error,
      hydrated,
      choosePersona,
      queueProfile,
      generateGame,
      ensureGame,
      makeDecision,
      revealEvent,
      continueAfterEvent,
      resetGame,
    }),
    [
      game,
      status,
      error,
      hydrated,
      choosePersona,
      queueProfile,
      generateGame,
      ensureGame,
      makeDecision,
      revealEvent,
      continueAfterEvent,
      resetGame,
    ],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error("useGame must be used inside GameProvider");
  }
  return context;
}
