"use client";

import { useState } from "react";

import { LifeFinanceClient } from "@/lib/api-client/client";

type DemoCreator = Readonly<{
  createDemoRun(): Promise<unknown>;
}>;

export async function launchLocalDemo(
  client: DemoCreator,
  navigate: (path: string) => void,
): Promise<void> {
  await client.createDemoRun();
  navigate("/board");
}

export function DemoLaunchButton() {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick(): Promise<void> {
    setStarting(true);
    setError(null);
    try {
      await launchLocalDemo(new LifeFinanceClient(), (path) => {
        window.location.assign(path);
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The local demo could not start.",
      );
      setStarting(false);
    }
  }

  return (
    <span className="landing-demo-control">
      <button
        aria-busy={starting}
        className="landing-demo-button"
        disabled={starting}
        onClick={handleClick}
        type="button"
      >
        {starting ? "Starting demo…" : "Instant demo"}
      </button>
      {error ? <span role="alert">{error}</span> : null}
    </span>
  );
}
