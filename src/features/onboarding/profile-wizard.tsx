"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { LoadingState } from "@/components/async-state";
import { useGame } from "@/components/game-provider";
import { Sprout } from "@/components/sprout";
import { getPersonas } from "@/services/player.service";
import type { Persona, ProfileInput } from "@/types/game";

const STEP_LABELS = ["You", "Where", "Why"] as const;

export function ProfileWizard() {
  const router = useRouter();
  const { selectedPersonaId, choosePersona, queueProfile } = useGame();
  const [personas, setPersonas] = useState<readonly Persona[]>([]);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Omit<ProfileInput, "personaId">>({
    name: "",
    age: "",
    location: "",
    goal: "",
  });

  useEffect(() => {
    let active = true;
    getPersonas({ delayMs: 350 }).then((result) => {
      if (active) setPersonas(result);
    });
    return () => {
      active = false;
    };
  }, []);

  const persona = useMemo(
    () => personas.find((item) => item.id === selectedPersonaId) ?? personas[0],
    [personas, selectedPersonaId],
  );

  if (!persona) {
    return <LoadingState label="Loading your character sheet..." />;
  }

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleContinue() {
    if (step < 2) {
      setStep((current) => current + 1);
      return;
    }

    choosePersona(persona.id);
    queueProfile({ ...form, personaId: persona.id });
    router.push("/generating");
  }

  const canContinue =
    step === 0 ? form.name.trim().length > 0 : step === 1 ? true : form.goal.trim().length > 0;

  return (
    <div className="screen wizard-screen">
      <section className="wizard-panel">
        <div className="wizard-progress" aria-label={`Profile step ${step + 1} of 3`}>
          {STEP_LABELS.map((label, index) => (
            <div className={index <= step ? "wizard-step wizard-step-active" : "wizard-step"} key={label}>
              <i />
              <span>{label}</span>
            </div>
          ))}
        </div>

        <form onSubmit={(event) => { event.preventDefault(); handleContinue(); }}>
          {step === 0 ? (
            <fieldset className="wizard-fieldset" key="identity">
              <legend>Who are we financially endangering?</legend>
              <label>
                Your name
                <input
                  autoFocus
                  onChange={(event) => updateField("name", event.target.value)}
                  placeholder="Mina"
                  value={form.name}
                />
              </label>
              <label>
                Age
                <input
                  inputMode="numeric"
                  onChange={(event) => updateField("age", event.target.value)}
                  placeholder={String(persona.age)}
                  value={form.age}
                />
              </label>
            </fieldset>
          ) : null}

          {step === 1 ? (
            <fieldset className="wizard-fieldset" key="location">
              <legend>Where does your money disappear?</legend>
              <label className="field-wide">
                City
                <input
                  autoFocus
                  onChange={(event) => updateField("location", event.target.value)}
                  placeholder={persona.location}
                  value={form.location}
                />
              </label>
              <button
                className="suggestion-chip"
                onClick={() => updateField("location", persona.location)}
                type="button"
              >
                Use {persona.location}
              </button>
            </fieldset>
          ) : null}

          {step === 2 ? (
            <fieldset className="wizard-fieldset" key="goal">
              <legend>What would feel like winning?</legend>
              <label className="field-wide">
                Your main quest
                <textarea
                  autoFocus
                  onChange={(event) => updateField("goal", event.target.value)}
                  placeholder="Build enough safety to stop panicking at every email..."
                  rows={4}
                  value={form.goal}
                />
              </label>
            </fieldset>
          ) : null}

          <div className="wizard-actions">
            {step > 0 ? (
              <button className="button button-ghost" onClick={() => setStep((current) => current - 1)} type="button">
                Back
              </button>
            ) : <span />}
            <button className="button button-primary" disabled={!canContinue} type="submit">
              {step === 2 ? "Generate my life" : "Continue"}
            </button>
          </div>
        </form>
      </section>
      <aside className={`wizard-persona wizard-persona-${persona.tone}`}>
        <span>Selected life</span>
        <h2>{persona.name}</h2>
        <p>{persona.career}</p>
        <Sprout emotion={step === 2 ? "thinking" : "idle"} size="medium" />
      </aside>
    </div>
  );
}
