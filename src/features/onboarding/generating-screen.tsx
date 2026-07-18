"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Sprout } from "@/components/sprout";
import { useOnboarding } from "./onboarding-provider";

const GENERATING_STEPS = [
  "Reading your questionable choices",
  "Estimating your monthly chaos",
  "Giving Sprout access to the numbers",
] as const;

export function GeneratingScreen() {
  const router = useRouter();
  const { generateGame, pendingProfile, error } = useOnboarding();
  const started = useRef(false);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!pendingProfile) {
      router.replace("/start");
      return;
    }

    const firstTimer = window.setTimeout(() => setActiveStep(1), 520);
    const secondTimer = window.setTimeout(() => setActiveStep(2), 1080);
    generateGame()
      .then(() => window.setTimeout(() => router.replace("/board"), 350))
      .catch(() => undefined);

    return () => {
      window.clearTimeout(firstTimer);
      window.clearTimeout(secondTimer);
    };
  }, [generateGame, pendingProfile, router]);

  return (
    <div className="screen generating-screen">
      <div className="generating-visual">
        <div className="loading-orbit" />
        <Sprout emotion={error ? "cry" : "thinking"} priority size="large" />
      </div>
      <div className="generating-copy">
        <p>{error ? "Generation interrupted" : "Building your financial universe"}</p>
        <h1>{error ? "Sprout lost a receipt." : "Crunching your numbers..."}</h1>
        {error ? (
          <>
            <p className="form-error" role="alert">{error}</p>
            <button className="button button-primary" onClick={() => router.replace("/profile")} type="button">
              Back to profile
            </button>
          </>
        ) : (
          <ol className="generating-list">
            {GENERATING_STEPS.map((label, index) => (
              <li className={index <= activeStep ? "generation-step-active" : ""} key={label}>
                <i />
                <span>{label}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
