"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { SavedRunWire } from "@/contracts/api/contracts";
import { LifeFinanceClient } from "@/lib/api-client/client";

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" })
    .format(new Date(Date.UTC(year!, monthNumber! - 1, 1)));
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function ActiveSaveBanner() {
  const [active, setActive] = useState<SavedRunWire | null>(null);
  useEffect(() => {
    let mounted = true;
    new LifeFinanceClient().listSavedRuns().then(({ saves }) => {
      if (mounted) setActive(saves.find((save) => save.saveStatus === "active") ?? null);
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, []);
  if (!active) return null;
  return (
    <aside className="active-save-banner" aria-label="Current saved game">
      <div>
        <span>Current game</span>
        <strong>{monthLabel(active.currentMonth)}</strong>
        <small>Turn {active.revision} · saved {dateLabel(active.updatedAt)}</small>
      </div>
      <div className="active-save-actions">
        <Link className="button button-primary" href="/board">Continue game</Link>
        <Link className="button button-secondary" href="/saves">All saved games</Link>
      </div>
    </aside>
  );
}

export function SavedGamesPanel() {
  const router = useRouter();
  const [saves, setSaves] = useState<readonly SavedRunWire[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyRunId, setBusyRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    new LifeFinanceClient().listSavedRuns()
      .then((result) => { if (mounted) setSaves(result.saves); })
      .catch((reason: unknown) => {
        if (mounted) setError(reason instanceof Error ? reason.message : "Saved games could not be loaded.");
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const openSave = async (save: SavedRunWire) => {
    if (busyRunId) return;
    setBusyRunId(save.runId);
    setError(null);
    try {
      if (save.saveStatus === "archived") {
        await new LifeFinanceClient().activateSavedRun(save.runId);
      }
      router.push("/board");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The saved game could not be restored.");
      setBusyRunId(null);
    }
  };

  if (loading) return <p className="save-status" role="status">Loading your saved games...</p>;

  return (
    <div className="saved-games-panel">
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {saves.length === 0 ? (
        <div className="save-empty">
          <h2>No saved games yet</h2>
          <p>Choose a starting life to create your first persistent game.</p>
          <Link className="button button-primary" href="/start">Create a game</Link>
        </div>
      ) : (
        <div className="save-grid">
          {saves.map((save, index) => (
            <article className="save-card" data-active={save.saveStatus === "active"} key={save.runId}>
              <span>{save.saveStatus === "active" ? "Current game" : `Previous game ${index}`}</span>
              <h2>{monthLabel(save.currentMonth)}</h2>
              <dl>
                <div><dt>Turn</dt><dd>{save.revision}</dd></div>
                <div><dt>Game</dt><dd>{save.runStatus === "terminal" ? "Completed" : "In progress"}</dd></div>
                <div><dt>Last saved</dt><dd>{dateLabel(save.updatedAt)}</dd></div>
              </dl>
              <button
                className="button button-primary"
                disabled={busyRunId !== null}
                onClick={() => void openSave(save)}
                type="button"
              >
                {busyRunId === save.runId ? "Opening..." : save.saveStatus === "active" ? "Continue" : "Restore and play"}
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
