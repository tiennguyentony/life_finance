"use client";

import { useState } from "react";

import type { GameStateV2 } from "@/core/game-state-v2";
import { EventPanel } from "@/features/play/event-panel";
import { OnboardingPanel } from "@/features/play/onboarding-panel";
import { OverviewPanel } from "@/features/play/overview-panel";
import { PlayTabs } from "@/features/play/play-tabs";
import type {
  MonthlyRecap,
  OnboardingDraft,
  PlayTab,
} from "@/features/play/play-types";

const PREVIEW_DRAFT: OnboardingDraft = {
  presetId: "software",
  salary: 120_000,
  cash: 25_000,
  studentDebt: 15_000,
  studentDebtPayment: 250,
  healthPlanId: "health.hdhp_hsa",
  coverageIds: ["insurance.renters"],
};

export function PreviewGallery({
  midRun,
  withEvent,
  recap,
}: Readonly<{
  midRun: GameStateV2;
  withEvent: GameStateV2;
  recap: MonthlyRecap;
}>) {
  const [draft, setDraft] = useState(PREVIEW_DRAFT);
  const [demoTab, setDemoTab] = useState<PlayTab>("overview");
  const pending = withEvent.gameplay.eventLifecycle.pending!;

  return (
    <div className="play-console">
      <h1 className="hud-networth">Design preview</h1>
      <p className="play-note">
        Development-only gallery. States come from the deterministic engine
        factories; nothing here talks to a server.
      </p>

      <h2>Tabs</h2>
      <PlayTabs
        labels={{
          overview: "Overview",
          strategy: "Strategy",
          actions: "Actions",
          learn: "Learn & glossary",
        }}
        listLabel="Preview tabs"
        onChange={setDemoTab}
        tabs={["overview", "strategy", "actions", "learn"] as const}
        value={demoTab}
      />

      <h2>Onboarding</h2>
      <OnboardingPanel
        busy={false}
        busyLabel=""
        draft={draft}
        error={null}
        onChange={setDraft}
        onCreate={() => {}}
      />

      <h2>Pending event</h2>
      <EventPanel busy={false} onChoice={() => {}} pending={pending} />

      <h2>Overview with a processed month</h2>
      <OverviewPanel
        latestTurn={recap}
        onSelectConcept={() => {}}
        state={midRun}
      />

      <h2>Overview before the first month</h2>
      <OverviewPanel
        latestTurn={null}
        onSelectConcept={() => {}}
        state={midRun}
      />
    </div>
  );
}
