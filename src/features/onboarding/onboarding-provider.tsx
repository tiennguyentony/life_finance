"use client";

import { createContext, useContext } from "react";

import {
  useOnboardingController,
  type OnboardingController,
} from "./use-onboarding-controller";

const OnboardingContext = createContext<OnboardingController | null>(null);

export function OnboardingProvider({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const onboarding = useOnboardingController();
  return (
    <OnboardingContext.Provider value={onboarding}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingController {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error("useOnboarding must be used inside OnboardingProvider");
  }
  return context;
}
