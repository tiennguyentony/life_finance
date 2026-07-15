"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { EmptyState, ErrorState, LoadingState } from "@/components/async-state";
import { useGame } from "@/components/game-provider";
import { getPersonas } from "@/services/player.service";
import type { Persona } from "@/types/game";

export function PersonaGallery() {
  const router = useRouter();
  const { choosePersona } = useGame();
  const [personas, setPersonas] = useState<readonly Persona[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [requestKey, setRequestKey] = useState(0);

  useEffect(() => {
    let active = true;
    getPersonas()
      .then((result) => {
        if (active) {
          setPersonas(result);
          setLoaded(true);
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Personas went missing.");
      });
    return () => {
      active = false;
    };
  }, [requestKey]);

  const handleChoose = useCallback(
    (persona: Persona) => {
      choosePersona(persona.id);
      router.push("/profile");
    },
    [choosePersona, router],
  );

  if (error) {
    return (
      <ErrorState
        message={error}
        onRetry={() => {
          setError(null);
          setPersonas([]);
          setLoaded(false);
          setRequestKey((key) => key + 1);
        }}
      />
    );
  }

  if (loaded && personas.length === 0) {
    return (
      <EmptyState
        action={
          <button
            className="button button-primary"
            onClick={() => {
              setLoaded(false);
              setRequestKey((key) => key + 1);
            }}
            type="button"
          >
            Look again
          </button>
        }
        title="No lives are available yet."
      />
    );
  }

  if (personas.length === 0) {
    return <LoadingState label="Sprout is finding three lives..." />;
  }

  return (
    <div className="screen selection-screen">
      <header className="screen-heading">
        <p>Step 1 of 3</p>
        <h1>Choose your financial fighter.</h1>
        <span>Every life comes with perks, problems, and rent.</span>
      </header>
      <div className="persona-grid">
        {personas.map((persona, index) => (
          <button
            className={`persona-card persona-card-${persona.tone}`}
            key={persona.id}
            onClick={() => handleChoose(persona)}
            style={{ "--card-delay": `${index * 90}ms` } as React.CSSProperties}
            type="button"
          >
            <span className="persona-index">0{index + 1}</span>
            <span className="persona-eyebrow">{persona.eyebrow}</span>
            <strong>{persona.name}</strong>
            <p>{persona.description}</p>
            <div className="persona-stat">
              <b>{persona.stat}</b>
              <span>{persona.statLabel}</span>
            </div>
            <span className="persona-cta">Play this life</span>
          </button>
        ))}
      </div>
    </div>
  );
}
