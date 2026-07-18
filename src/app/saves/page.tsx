import type { Metadata } from "next";

import { SavedGamesPanel } from "@/features/saves/saved-games-panel";

export const metadata: Metadata = { title: "Saved games" };

export default function SavesPage() {
  return (
    <main className="screen saves-screen">
      <header className="screen-heading">
        <p>Your games</p>
        <h1>Continue where you left off.</h1>
        <span>Restoring a previous game archives the current one. Nothing is deleted.</span>
      </header>
      <SavedGamesPanel />
    </main>
  );
}
