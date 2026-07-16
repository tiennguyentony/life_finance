"use client";

import { useEffect, useRef, useState } from "react";

import type { GameStateV2 } from "@/core/game-state-v2";
import type {
  CheckpointV2Response,
  CommandV2Response,
  GameCommandV2Public,
} from "@/server/api/contracts-v2";

import { buildDetailedAction } from "./action-builder";
import {
  ActionPanel,
  EducationPanel,
  StrategyPanel,
} from "./decision-panels";
import { EventPanel } from "./event-panel";
import { OnboardingPanel } from "./onboarding-panel";
import { OverviewPanel } from "./overview-panel";
import {
  buildCreateRequest,
  calculateAgeYears,
  calculateNetWorth,
  formatMoney,
  percentToPpm,
  PLAYER_PRESETS,
  type PlayerPresetId,
} from "./play-model";
import {
  apiRequest,
  authHeaders,
  commandId,
  formatMonthLabel,
  RECAP_SESSION_KEY,
  SESSION_KEY,
  signedMoney,
} from "./play-support";
import { PlayTabs } from "./play-tabs";
import type {
  ActionDraft,
  ActivityEntry,
  MonthlyRecap,
  OnboardingDraft,
  PlayTab,
  RunCredential,
  RunResponse,
  StrategyDraft,
} from "./play-types";
import { RunControls } from "./run-controls";
import { useAnimatedNumber } from "./use-animated-number";

function defaultOnboarding(presetId: PlayerPresetId): OnboardingDraft {
  const preset = PLAYER_PRESETS[presetId];
  return {
    presetId,
    salary: preset.salaryDollars,
    cash: preset.defaultCashDollars,
    studentDebt: 15_000,
    studentDebtPayment: 250,
    healthPlanId: preset.healthPlanId,
    coverageIds: ["insurance.renters"],
  };
}

const DEFAULT_STRATEGY: StrategyDraft = {
  retirement: 5,
  hsa: 1,
  index: 5,
  sector: 0,
  speculative: 0,
  ira: 0,
  debt: 0,
};

const DEFAULT_ACTION: ActionDraft = {
  type: "invest_taxable",
  amount: 500,
  secondaryAmount: 20_000,
  mortgageRate: 6.5,
  mortgageTerm: 360,
  upskillProgram: "upskill.certificate",
};

const TABS = ["overview", "strategy", "actions", "learn"] as const;

const TAB_LABELS: Record<PlayTab, string> = {
  overview: "Overview",
  strategy: "Strategy",
  actions: "Actions",
  learn: "Learn & glossary",
};

export function PlayConsole({
  initialPresetId = "software",
}: Readonly<{ initialPresetId?: PlayerPresetId }>) {
  const [credential, setCredential] = useState<RunCredential | null>(null);
  const [state, setState] = useState<GameStateV2 | null>(null);
  const [onboarding, setOnboarding] = useState(() =>
    defaultOnboarding(initialPresetId),
  );
  const [strategy, setStrategy] = useState(DEFAULT_STRATEGY);
  const [actionDraft, setActionDraft] = useState(DEFAULT_ACTION);
  const [checkpoint, setCheckpoint] = useState<CheckpointV2Response | null>(null);
  const [turnHistory, setTurnHistory] = useState<MonthlyRecap[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(
        sessionStorage.getItem(RECAP_SESSION_KEY) ?? "[]",
      ) as MonthlyRecap[];
    } catch {
      return [];
    }
  });
  const [activeConceptId, setActiveConceptId] = useState(
    "financial_independence",
  );
  const [tab, setTab] = useState<PlayTab>("overview");
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [deltaCents, setDeltaCents] = useState<number | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const nextActivityId = useRef(1);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addActivity = (message: string) => {
    setActivity((current) =>
      [{ id: nextActivityId.current++, message }, ...current].slice(0, 20),
    );
  };

  const selectConcept = (conceptId: string) => {
    setActiveConceptId(conceptId);
    setTab("learn");
  };

  useEffect(() => {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    let cancelled = false;
    try {
      const saved = JSON.parse(raw) as RunCredential;
      void apiRequest<RunResponse>(`/api/v2/runs/${saved.runId}`, {
        headers: authHeaders(saved.accessSecret),
      })
        .then((result) => {
          if (cancelled) return;
          setCredential(saved);
          setState(result.state);
        })
        .catch(() => sessionStorage.removeItem(SESSION_KEY));
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    sessionStorage.setItem(RECAP_SESSION_KEY, JSON.stringify(turnHistory));
  }, [turnHistory]);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  const createGame = async () => {
    setBusy(true);
    setBusyLabel("Creating your balance sheet...");
    setError(null);
    try {
      const request = buildCreateRequest(
        onboarding.presetId,
        onboarding.salary,
        onboarding.cash,
        `browser-${crypto.randomUUID()}`,
        onboarding.studentDebt,
        onboarding.studentDebtPayment,
        onboarding.healthPlanId,
        onboarding.coverageIds,
      );
      const result = await apiRequest<RunResponse & RunCredential>("/api/v2/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const saved = { runId: result.runId, accessSecret: result.accessSecret };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(saved));
      setCredential(saved);
      setState(result.state);
      setCheckpoint(null);
      setTurnHistory([]);
      setDeltaCents(null);
      sessionStorage.removeItem(RECAP_SESSION_KEY);
      setActivity([
        {
          id: nextActivityId.current++,
          message: `Created ${PLAYER_PRESETS[onboarding.presetId].label} run.`,
        },
      ]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create game");
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  };

  const submit = async (command: GameCommandV2Public, message: string) => {
    if (!credential || !state) return;
    setBusy(true);
    setBusyLabel("Applying your decision...");
    setError(null);
    const netWorthBefore = calculateNetWorth(state);
    try {
      const result = await apiRequest<CommandV2Response>(
        `/api/v2/runs/${credential.runId}/commands`,
        {
          method: "POST",
          headers: authHeaders(credential.accessSecret),
          body: JSON.stringify(command),
        },
      );
      setState(result.state);
      setCheckpoint(null);
      setDeltaCents(calculateNetWorth(result.state) - netWorthBefore);
      addActivity(message);
      if (result.monthlyRecord) {
        setTurnHistory((current) => [result.monthlyRecord!, ...current].slice(0, 12));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Command failed");
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  };

  const saveStrategy = () => {
    if (!state) return;
    void submit(
      {
        schemaVersion: 2,
        id: commandId("strategy"),
        expectedRevision: state.revision,
        effectiveMonth: state.currentMonth,
        type: "set_recurring_strategy",
        payload: {
          strategy: {
            preTax401kSalaryRatePpm: percentToPpm(strategy.retirement),
            preTaxHsaSalaryRatePpm: percentToPpm(
              state.gameplay.benefits.hsaEligible ? strategy.hsa : 0,
            ),
            afterTaxBroadIndexRatePpm: percentToPpm(strategy.index),
            afterTaxSectorRatePpm: percentToPpm(strategy.sector),
            afterTaxSpeculativeRatePpm: percentToPpm(strategy.speculative),
            afterTaxIraRatePpm: percentToPpm(strategy.ira),
            afterTaxExtraDebtRatePpm: percentToPpm(strategy.debt),
          },
        },
      },
      "Recurring strategy updated.",
    );
  };

  const runMonths = async (count: number) => {
    if (!state || !credential) return;
    setBusy(true);
    setError(null);
    let working = state;
    const netWorthBefore = calculateNetWorth(state);
    const recaps: MonthlyRecap[] = [];
    try {
      for (let index = 0; index < count; index += 1) {
        if (working.outcome || working.gameplay.eventLifecycle.pending) break;
        setBusyLabel(
          `Simulating ${formatMonthLabel(working.currentMonth)} (${index + 1}/${count})...`,
        );
        const result = await apiRequest<CommandV2Response>(
          `/api/v2/runs/${credential.runId}/commands`,
          {
            method: "POST",
            headers: authHeaders(credential.accessSecret),
            body: JSON.stringify({
              schemaVersion: 2,
              id: commandId("month"),
              expectedRevision: working.revision,
              effectiveMonth: working.currentMonth,
              type: "process_month",
              payload: {},
            }),
          },
        );
        working = result.state;
        if (result.monthlyRecord) recaps.unshift(result.monthlyRecord);
      }
      setState(working);
      setCheckpoint(null);
      setDeltaCents(calculateNetWorth(working) - netWorthBefore);
      setTurnHistory((current) => [...recaps, ...current].slice(0, 12));
      addActivity(
        `Processed ${recaps.length} month${recaps.length === 1 ? "" : "s"}; now ${formatMonthLabel(working.currentMonth)}.`,
      );
      if (working.gameplay.eventLifecycle.pending) {
        addActivity("Progress paused for a required personal decision.");
      }
    } catch (caught) {
      setState(working);
      setTurnHistory((current) => [...recaps, ...current].slice(0, 12));
      setError(caught instanceof Error ? caught.message : "Monthly simulation failed");
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  };

  const takeAction = () => {
    if (!state) return;
    void submit(
      {
        schemaVersion: 2,
        id: commandId("action"),
        expectedRevision: state.revision,
        effectiveMonth: state.currentMonth,
        type: "take_detailed_action",
        payload: { action: buildDetailedAction(actionDraft, state) },
      },
      `Action accepted: ${actionDraft.type.replaceAll("_", " ")}.`,
    );
  };

  const resolveChoice = (choiceId: string) => {
    const pending = state?.gameplay.eventLifecycle.pending;
    if (!state || !pending) return;
    void submit(
      {
        schemaVersion: 2,
        id: commandId("event"),
        expectedRevision: state.revision,
        effectiveMonth: state.currentMonth,
        type: "resolve_event_choice",
        payload: { eventId: pending.eventId, choiceId },
      },
      `Event choice accepted: ${choiceId.replaceAll("_", " ")}.`,
    );
  };

  const loadCheckpoint = async () => {
    if (!state || !credential) return;
    setBusy(true);
    setBusyLabel("Reconciling checkpoint evidence...");
    setError(null);
    try {
      const fromRevision = Math.max(0, state.revision - 12);
      const result = await apiRequest<CheckpointV2Response>(
        `/api/v2/runs/${credential.runId}/checkpoint?fromRevision=${fromRevision}`,
        { headers: authHeaders(credential.accessSecret) },
      );
      setCheckpoint(result);
      addActivity(`Checkpoint loaded from revision ${fromRevision}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Checkpoint failed");
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  };

  const requestReset = () => {
    if (!confirmingReset) {
      setConfirmingReset(true);
      resetTimer.current = setTimeout(() => setConfirmingReset(false), 3500);
      return;
    }
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setConfirmingReset(false);
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(RECAP_SESSION_KEY);
    setCredential(null);
    setState(null);
    setCheckpoint(null);
    setTurnHistory([]);
    setActivity([]);
    setError(null);
    setDeltaCents(null);
  };

  const netWorth = state ? calculateNetWorth(state) : 0;
  const animatedNetWorth = useAnimatedNumber(netWorth);

  if (!state) {
    return (
      <OnboardingPanel
        draft={onboarding}
        busy={busy}
        busyLabel={busyLabel}
        error={error}
        onChange={setOnboarding}
        onCreate={() => void createGame()}
      />
    );
  }

  const pending = state.gameplay.eventLifecycle.pending;
  const blocked = Boolean(pending || state.outcome);
  const age = calculateAgeYears(state.player.birthMonth, state.currentMonth);
  const delta = deltaCents !== null && deltaCents !== 0 ? signedMoney(deltaCents) : null;

  return (
    <section className="play-console">
      <header className="play-titlebar">
        <div>
          <div className="chip-row hud-meta">
            <span className="chip">Age {age}</span>
            <span className="chip">{formatMonthLabel(state.currentMonth)}</span>
            <span
              className="chip"
              title="Engine revision: every decision and simulated month advances it"
            >
              Step {state.revision}
            </span>
          </div>
          <h1 className="hud-networth" data-pop key={state.revision}>
            {state.outcome
              ? `Grade ${state.outcome.grade}`
              : formatMoney(animatedNetWorth)}
          </h1>
          <p className="hud-sub">
            {state.outcome ? (
              <span>{state.outcome.kind.replaceAll("_", " ")}</span>
            ) : (
              <>
                <span>Net worth</span>
                {delta ? (
                  <span
                    className={`chip tnum ${
                      delta.tone === "positive" ? "chip-accent" : "chip-danger"
                    }`}
                  >
                    {delta.label} this step
                  </span>
                ) : null}
              </>
            )}
          </p>
        </div>
        <button
          className={confirmingReset ? "btn btn-danger" : "btn btn-quiet"}
          onClick={requestReset}
          type="button"
        >
          {confirmingReset ? "Discard this run?" : "Start over"}
        </button>
      </header>

      {error ? <p className="play-error" role="alert">{error}</p> : null}
      {busy ? (
        <p className="play-working" role="status">
          <span aria-hidden="true" className="working-dots">
            <span />
            <span />
            <span />
          </span>
          {busyLabel || "Working..."}
        </p>
      ) : null}

      <PlayTabs
        labels={TAB_LABELS}
        listLabel="Game sections"
        onChange={setTab}
        tabs={TABS}
        value={tab}
      />

      {pending ? (
        <EventPanel pending={pending} busy={busy} onChoice={resolveChoice} />
      ) : null}

      <div
        aria-labelledby={`tab-${tab}`}
        className="tab-panel"
        id={`panel-${tab}`}
        key={tab}
        role="tabpanel"
      >
        {tab === "overview" ? (
          <OverviewPanel
            state={state}
            latestTurn={turnHistory[0] ?? null}
            onSelectConcept={selectConcept}
          />
        ) : null}
        {tab === "strategy" ? (
          <StrategyPanel
            state={state}
            draft={strategy}
            busy={busy}
            blocked={blocked}
            onChange={setStrategy}
            onSave={saveStrategy}
            onSelectConcept={selectConcept}
          />
        ) : null}
        {tab === "actions" ? (
          <ActionPanel
            state={state}
            draft={actionDraft}
            busy={busy}
            blocked={blocked}
            onChange={(patch) =>
              setActionDraft((current) => ({ ...current, ...patch }))
            }
            onApply={takeAction}
            onSelectConcept={selectConcept}
          />
        ) : null}
        {tab === "learn" ? (
          <EducationPanel
            activeConceptId={activeConceptId}
            onChange={setActiveConceptId}
          />
        ) : null}
      </div>

      <RunControls
        busy={busy}
        blocked={blocked}
        checkpoint={checkpoint}
        activity={activity}
        onRunMonths={(count) => void runMonths(count)}
        onLoadCheckpoint={() => void loadCheckpoint()}
      />
    </section>
  );
}
