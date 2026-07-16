"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { generatePlayer, getPlayerState } from "@/services/player.service";
import {
  getBigCityScenario,
  resolveBigCityEvent,
  runBigCityFastForward,
} from "@/services/scenario.service";
import type {
  PersonaId,
  PlayerView,
  ProfileInput,
  ScenarioEventDecisionId,
} from "@/types/game";

import {
  completeReturnToSimulation,
  createScenarioMachine,
  openPendingEvent,
  receiveConsequence,
  receiveFastForward,
  selectEventDecision,
  startFastForward,
  startReturnToSimulation,
  type ScenarioMachine,
} from "./scenario-machine";

const STORAGE_KEY = "life-finance.big-city-survivor.v1";

type GameOperation =
  | "idle"
  | "loading-scenario"
  | "generating"
  | "fast-forwarding"
  | "resolving-event";

type StoredGame = {
  readonly selectedPersonaId: PersonaId | null;
  readonly pendingProfile: ProfileInput | null;
  readonly player: PlayerView | null;
  readonly machine: ScenarioMachine | null;
};

export type GameController = StoredGame & {
  readonly operation: GameOperation;
  readonly error: string | null;
  readonly hydrated: boolean;
  readonly choosePersona: (personaId: PersonaId) => void;
  readonly queueProfile: (profile: ProfileInput) => void;
  readonly generateGame: () => Promise<void>;
  readonly ensureGame: () => Promise<void>;
  readonly fastForward: () => Promise<void>;
  readonly openEvent: () => void;
  readonly chooseEventDecision: (decisionId: ScenarioEventDecisionId) => Promise<void>;
  readonly startReturn: () => void;
  readonly completeReturn: () => void;
  readonly replaySlice: () => Promise<void>;
  readonly dismissError: () => void;
  readonly resetGame: () => void;
};

const EMPTY_GAME: StoredGame = {
  selectedPersonaId: null,
  pendingProfile: null,
  player: null,
  machine: null,
};

function readStoredGame(): StoredGame {
  if (typeof window === "undefined") return EMPTY_GAME;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return EMPTY_GAME;
    const parsed = JSON.parse(stored) as Partial<StoredGame>;
    return {
      selectedPersonaId: parsed.selectedPersonaId ?? null,
      pendingProfile: parsed.pendingProfile ?? null,
      player: parsed.player ?? null,
      machine: parsed.machine ?? null,
    };
  } catch {
    return EMPTY_GAME;
  }
}

function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}

export function useGameController(): GameController {
  const [game, setGame] = useState<StoredGame>(EMPTY_GAME);
  const [operation, setOperation] = useState<GameOperation>("idle");
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setGame(readStoredGame());
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
  }, [game, hydrated]);

  const choosePersona = useCallback((selectedPersonaId: PersonaId) => {
    setGame((current) => ({ ...current, selectedPersonaId }));
  }, []);

  const queueProfile = useCallback((pendingProfile: ProfileInput) => {
    setGame((current) => ({
      ...current,
      selectedPersonaId: pendingProfile.personaId,
      pendingProfile,
    }));
  }, []);

  const generateGame = useCallback(async () => {
    if (!game.pendingProfile) throw new Error("Choose a persona before generating a game.");

    setOperation("generating");
    setError(null);
    try {
      const result = await generatePlayer(game.pendingProfile, { delayMs: 1700 });
      setGame((current) => ({
        ...current,
        player: result.player,
        machine: createScenarioMachine(result.scenario),
      }));
    } catch (reason) {
      setError(errorMessage(reason, "Sprout lost the paperwork."));
      throw reason;
    } finally {
      setOperation("idle");
    }
  }, [game.pendingProfile]);

  const ensureGame = useCallback(async () => {
    if (game.machine) return;

    setOperation("loading-scenario");
    setError(null);
    try {
      const result = await getPlayerState({ delayMs: 700 });
      setGame((current) => ({
        ...current,
        player: result.player,
        machine: createScenarioMachine(result.scenario),
      }));
    } catch (reason) {
      setError(errorMessage(reason, "The run could not load."));
    } finally {
      setOperation("idle");
    }
  }, [game.machine]);

  const fastForward = useCallback(async () => {
    const currentMachine = game.machine;
    if (!currentMachine || currentMachine.phase !== "active-simulation") return;

    const forwarding = startFastForward(currentMachine);
    setGame((current) => ({ ...current, machine: forwarding }));
    setOperation("fast-forwarding");
    setError(null);
    try {
      const result = await runBigCityFastForward(currentMachine.snapshot, { delayMs: 1050 });
      setGame((current) => ({ ...current, machine: receiveFastForward(forwarding, result) }));
    } catch (reason) {
      setGame((current) => ({ ...current, machine: currentMachine }));
      setError(errorMessage(reason, "Time refused to move."));
    } finally {
      setOperation("idle");
    }
  }, [game.machine]);

  const openEvent = useCallback(() => {
    setGame((current) => {
      if (current.machine?.phase !== "pending-event") return current;
      return { ...current, machine: openPendingEvent(current.machine) };
    });
    setError(null);
  }, []);

  const chooseEventDecision = useCallback(async (decisionId: ScenarioEventDecisionId) => {
    const currentMachine = game.machine;
    if (
      !currentMachine ||
      currentMachine.phase !== "awaiting-decision" ||
      !currentMachine.pendingEvent
    ) return;

    const selected = selectEventDecision(currentMachine, decisionId);
    setGame((current) => ({ ...current, machine: selected }));
    setOperation("resolving-event");
    setError(null);
    try {
      const consequence = await resolveBigCityEvent(
        selected.snapshot,
        currentMachine.pendingEvent,
        decisionId,
        { delayMs: 850 },
      );
      setGame((current) => ({ ...current, machine: receiveConsequence(selected, consequence) }));
    } catch (reason) {
      setError(errorMessage(reason, "That choice did not land."));
    } finally {
      setOperation("idle");
    }
  }, [game.machine]);

  const startReturn = useCallback(() => {
    setGame((current) => {
      if (current.machine?.phase !== "showing-consequence") return current;
      return { ...current, machine: startReturnToSimulation(current.machine) };
    });
  }, []);

  const completeReturn = useCallback(() => {
    setGame((current) => {
      if (current.machine?.phase !== "returning-to-simulation") return current;
      return { ...current, machine: completeReturnToSimulation(current.machine) };
    });
  }, []);

  const replaySlice = useCallback(async () => {
    setOperation("loading-scenario");
    setError(null);
    try {
      const snapshot = await getBigCityScenario({ delayMs: 450 }, game.player ?? undefined);
      setGame((current) => ({ ...current, machine: createScenarioMachine(snapshot) }));
    } catch (reason) {
      setError(errorMessage(reason, "The scenario could not restart."));
    } finally {
      setOperation("idle");
    }
  }, [game.player]);

  const dismissError = useCallback(() => setError(null), []);

  const resetGame = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    setGame(EMPTY_GAME);
    setError(null);
    setOperation("idle");
  }, []);

  return useMemo(() => ({
    ...game,
    operation,
    error,
    hydrated,
    choosePersona,
    queueProfile,
    generateGame,
    ensureGame,
    fastForward,
    openEvent,
    chooseEventDecision,
    startReturn,
    completeReturn,
    replaySlice,
    dismissError,
    resetGame,
  }), [
    game,
    operation,
    error,
    hydrated,
    choosePersona,
    queueProfile,
    generateGame,
    ensureGame,
    fastForward,
    openEvent,
    chooseEventDecision,
    startReturn,
    completeReturn,
    replaySlice,
    dismissError,
    resetGame,
  ]);
}
