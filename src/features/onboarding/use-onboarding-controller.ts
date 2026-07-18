"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { LifeFinanceClient } from "@/lib/api-client/client";
import { createRunFromProfile } from "@/services/player.service";
import type { PersonaId, ProfileInput } from "@/types/game";

const STORAGE_KEY = "life-finance.onboarding.v1";

type StoredOnboarding = {
  readonly selectedPersonaId: PersonaId | null;
  readonly pendingProfile: ProfileInput | null;
};

export type OnboardingController = StoredOnboarding & {
  readonly generating: boolean;
  readonly error: string | null;
  readonly hydrated: boolean;
  readonly choosePersona: (personaId: PersonaId) => void;
  readonly queueProfile: (profile: ProfileInput) => void;
  readonly generateGame: () => Promise<void>;
  readonly resetOnboarding: () => Promise<void>;
};

const EMPTY_ONBOARDING: StoredOnboarding = {
  selectedPersonaId: null,
  pendingProfile: null,
};

function readStoredOnboarding(): StoredOnboarding {
  if (typeof window === "undefined") return EMPTY_ONBOARDING;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return EMPTY_ONBOARDING;
    const parsed = JSON.parse(stored) as Partial<StoredOnboarding>;
    return {
      selectedPersonaId: parsed.selectedPersonaId ?? null,
      pendingProfile: parsed.pendingProfile ?? null,
    };
  } catch {
    return EMPTY_ONBOARDING;
  }
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "Sprout lost the paperwork.";
}

function storeOnboarding(onboarding: StoredOnboarding): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(onboarding));
}

export function useOnboardingController(): OnboardingController {
  const [onboarding, setOnboarding] = useState<StoredOnboarding>(EMPTY_ONBOARDING);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setOnboarding(readStoredOnboarding());
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (hydrated) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(onboarding));
    }
  }, [hydrated, onboarding]);

  const choosePersona = useCallback((selectedPersonaId: PersonaId) => {
    const next = { ...onboarding, selectedPersonaId };
    // Persist before navigation so a remount cannot lose this selection.
    storeOnboarding(next);
    setOnboarding(next);
  }, [onboarding]);

  const queueProfile = useCallback((pendingProfile: ProfileInput) => {
    const next = {
      selectedPersonaId: pendingProfile.personaId,
      pendingProfile,
    };
    // ProfileWizard navigates immediately after this call. Writing here,
    // rather than waiting for an effect, makes that transition durable.
    storeOnboarding(next);
    setOnboarding(next);
  }, []);

  const generateGame = useCallback(async () => {
    if (!onboarding.pendingProfile) {
      throw new Error("Choose a persona before generating a game.");
    }

    setGenerating(true);
    setError(null);
    try {
      await createRunFromProfile(onboarding.pendingProfile);
      setOnboarding(EMPTY_ONBOARDING);
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (reason) {
      setError(errorMessage(reason));
      throw reason;
    } finally {
      setGenerating(false);
    }
  }, [onboarding.pendingProfile]);

  const resetOnboarding = useCallback(async () => {
    try {
      await new LifeFinanceClient().deleteSession();
    } finally {
      window.localStorage.removeItem(STORAGE_KEY);
      setOnboarding(EMPTY_ONBOARDING);
      setError(null);
      setGenerating(false);
    }
  }, []);

  return useMemo(
    () => ({
      ...onboarding,
      generating,
      error,
      hydrated,
      choosePersona,
      queueProfile,
      generateGame,
      resetOnboarding,
    }),
    [
      onboarding,
      generating,
      error,
      hydrated,
      choosePersona,
      queueProfile,
      generateGame,
      resetOnboarding,
    ],
  );
}
