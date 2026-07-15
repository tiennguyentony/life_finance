"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { GameStateV2 } from "@/core/game-state-v2";
import type {
  CheckpointV2Response,
  GameCommandV2Public,
} from "@/server/api/contracts-v2";

import {
  buildCreateRequest,
  calculateNetWorth,
  dollarsToCents,
  formatMoney,
  percentToPpm,
  PLAYER_PRESETS,
  type PlayerPresetId,
} from "./play-model";

const SESSION_KEY = "life-finance.developer-run.v1";

type RunCredential = Readonly<{ runId: string; accessSecret: string }>;
type RunResponse = Readonly<{
  state: GameStateV2;
  stateChecksum: string;
  idempotentReplay?: boolean;
  monthlyRecord?: Readonly<{
    processedMonth: string;
    marketValueChangeCents: number;
    annualInflationIncreaseCents: number;
    insurancePlayerCostCents: number;
  }> | null;
}>;

function commandId(kind: string): string {
  return `ui.${kind}.${crypto.randomUUID()}`;
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const apiError = body as { error?: { code?: string; message?: string } } | null;
    throw new Error(
      `${apiError?.error?.code ?? `HTTP_${response.status}`}: ${apiError?.error?.message ?? "Request failed"}`,
    );
  }
  return body as T;
}

function authHeaders(secret: string): HeadersInit {
  return { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };
}

export function PlayConsole() {
  const [credential, setCredential] = useState<RunCredential | null>(null);
  const [state, setState] = useState<GameStateV2 | null>(null);
  const [presetId, setPresetId] = useState<PlayerPresetId>("software");
  const [salary, setSalary] = useState(120_000);
  const [cash, setCash] = useState(25_000);
  const [strategy, setStrategy] = useState({ retirement: 5, hsa: 1, index: 5 });
  const [action, setAction] = useState("invest_taxable");
  const [actionAmount, setActionAmount] = useState(500);
  const [checkpoint, setCheckpoint] = useState<CheckpointV2Response | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<string[]>([]);

  const addActivity = useCallback((message: string) => {
    setActivity((current) => [message, ...current].slice(0, 12));
  }, []);

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

  const createGame = async () => {
    setBusy(true);
    setError(null);
    try {
      const request = buildCreateRequest(
        presetId,
        salary,
        cash,
        `browser-${crypto.randomUUID()}`,
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
      setActivity([`Created ${PLAYER_PRESETS[presetId].label} run.`]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create game");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (command: GameCommandV2Public, message: string) => {
    if (!credential) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<RunResponse>(
        `/api/v2/runs/${credential.runId}/commands`,
        {
          method: "POST",
          headers: authHeaders(credential.accessSecret),
          body: JSON.stringify(command),
        },
      );
      setState(result.state);
      setCheckpoint(null);
      addActivity(message);
      if (result.monthlyRecord) {
        addActivity(
          `${result.monthlyRecord.processedMonth}: market ${formatMoney(result.monthlyRecord.marketValueChangeCents)}, inflation +${formatMoney(result.monthlyRecord.annualInflationIncreaseCents)}.`,
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Command failed");
    } finally {
      setBusy(false);
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
            preTaxHsaSalaryRatePpm: percentToPpm(strategy.hsa),
            afterTaxBroadIndexRatePpm: percentToPpm(strategy.index),
            afterTaxSectorRatePpm: 0,
            afterTaxSpeculativeRatePpm: 0,
            afterTaxIraRatePpm: 0,
            afterTaxExtraDebtRatePpm: 0,
          },
        },
      },
      "Recurring strategy updated.",
    );
  };

  const runMonth = () => {
    if (!state) return;
    void submit(
      {
        schemaVersion: 2,
        id: commandId("month"),
        expectedRevision: state.revision,
        effectiveMonth: state.currentMonth,
        type: "process_month",
        payload: {},
      },
      `Processed month ${state.currentMonth}.`,
    );
  };

  const takeAction = () => {
    if (!state) return;
    const amountCents = dollarsToCents(actionAmount);
    const selectedAction =
      action === "invest_taxable"
        ? { type: "invest_taxable" as const, bucket: "taxableBroadIndexCents" as const, amountCents }
        : action === "contribute_ira"
          ? { type: "contribute_ira" as const, amountCents }
          : action === "contribute_hsa"
            ? { type: "contribute_hsa" as const, amountCents }
            : action === "change_lifestyle"
              ? { type: "change_lifestyle" as const, annualLivingCostDeltaCents: amountCents }
              : { type: "start_upskill" as const, programId: "upskill.certificate" as const };
    void submit(
      {
        schemaVersion: 2,
        id: commandId("action"),
        expectedRevision: state.revision,
        effectiveMonth: state.currentMonth,
        type: "take_detailed_action",
        payload: { action: selectedAction },
      },
      `Action accepted: ${action}.`,
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
      `Event choice accepted: ${choiceId}.`,
    );
  };

  const loadCheckpoint = async () => {
    if (!state || !credential) return;
    setBusy(true);
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
    }
  };

  const forgetGame = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setCredential(null);
    setState(null);
    setCheckpoint(null);
    setActivity([]);
    setError(null);
  };

  const pending = state?.gameplay.eventLifecycle.pending ?? null;
  const netWorth = useMemo(() => (state ? calculateNetWorth(state) : 0), [state]);

  if (!state) {
    return (
      <section className="play-start">
        <div>
          <p className="hero-kicker">Developer play UI</p>
          <h1>Start a financial life.</h1>
          <p className="lede">
            This deliberately simple interface exercises the real production game API.
          </p>
        </div>
        <div className="play-panel play-form">
          <label>
            Character preset
            <select
              value={presetId}
              onChange={(event) => {
                const next = event.target.value as PlayerPresetId;
                setPresetId(next);
                setSalary(PLAYER_PRESETS[next].salaryDollars);
              }}
            >
              {Object.entries(PLAYER_PRESETS).map(([id, preset]) => (
                <option key={id} value={id}>{preset.label}</option>
              ))}
            </select>
          </label>
          <label>
            Annual salary (USD)
            <input min="1" step="1000" type="number" value={salary} onChange={(event) => setSalary(event.target.valueAsNumber)} />
          </label>
          <label>
            Starting cash (USD, $1,000–$25,000)
            <input min="1000" max="25000" step="500" type="number" value={cash} onChange={(event) => setCash(event.target.valueAsNumber)} />
          </label>
          {error ? <p className="play-error" role="alert">{error}</p> : null}
          <button className="play-primary" disabled={busy} onClick={() => void createGame()} type="button">
            {busy ? "Creating…" : "Create new game"}
          </button>
          <p className="play-note">The anonymous run credential is kept only in this browser tab.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="play-console">
      <header className="play-titlebar">
        <div>
          <p className="hero-kicker">Live backend run</p>
          <h1>{state.currentMonth}</h1>
          <p>Revision {state.revision} · {state.outcome ? `${state.outcome.grade} — ${state.outcome.kind}` : "Active"}</p>
        </div>
        <button className="play-quiet" onClick={forgetGame} type="button">Start over</button>
      </header>

      {error ? <p className="play-error" role="alert">{error}</p> : null}

      <div className="play-stats" aria-label="Current financial state">
        <div><span>Net worth</span><strong>{formatMoney(netWorth)}</strong></div>
        <div><span>Cash</span><strong>{formatMoney(state.finances.cashCents)}</strong></div>
        <div><span>Investments</span><strong>{formatMoney(state.finances.taxableInvestmentsCents)}</strong></div>
        <div><span>Retirement</span><strong>{formatMoney(state.finances.retirementCents)}</strong></div>
        <div><span>Credit used</span><strong>{formatMoney(state.finances.creditUsedCents)}</strong></div>
        <div><span>Annual living cost</span><strong>{formatMoney(state.finances.annualLivingCostCents)}</strong></div>
      </div>

      {pending ? (
        <section className="play-panel play-event">
          <p className="hero-kicker">Decision required · {pending.tier}</p>
          <h2>{pending.templateId}</h2>
          <p>Targets: {pending.targetedWeakness.replaceAll("_", " ")}</p>
          <dl>
            {Object.entries(pending.parameters).map(([key, value]) => (
              <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{value}</dd></div>
            ))}
          </dl>
          <div className="play-button-row">
            {pending.choiceIds.map((choiceId) => (
              <button disabled={busy} key={choiceId} onClick={() => resolveChoice(choiceId)} type="button">
                {choiceId.replaceAll("_", " ")}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <div className="play-grid">
          <section className="play-panel play-form">
            <h2>Monthly strategy</h2>
            <label>401(k) % of salary<input min="0" max="100" step="0.5" type="number" value={strategy.retirement} onChange={(event) => setStrategy({ ...strategy, retirement: event.target.valueAsNumber })} /></label>
            <label>HSA % of salary<input min="0" max="100" step="0.5" type="number" value={strategy.hsa} onChange={(event) => setStrategy({ ...strategy, hsa: event.target.valueAsNumber })} /></label>
            <label>Index fund % after obligations<input min="0" max="100" step="0.5" type="number" value={strategy.index} onChange={(event) => setStrategy({ ...strategy, index: event.target.valueAsNumber })} /></label>
            <button disabled={busy || Boolean(state.outcome)} onClick={saveStrategy} type="button">Save strategy</button>
          </section>

          <section className="play-panel play-form">
            <h2>One-time action</h2>
            <label>
              Action
              <select value={action} onChange={(event) => setAction(event.target.value)}>
                <option value="invest_taxable">Invest in broad index</option>
                <option value="contribute_ira">Contribute to IRA</option>
                <option value="contribute_hsa">Contribute to HSA</option>
                <option value="change_lifestyle">Increase annual lifestyle cost</option>
                <option value="start_upskill">Start certificate program</option>
              </select>
            </label>
            {action !== "start_upskill" ? (
              <label>Amount (USD)<input min="1" step="100" type="number" value={actionAmount} onChange={(event) => setActionAmount(event.target.valueAsNumber)} /></label>
            ) : null}
            <button disabled={busy || Boolean(state.outcome)} onClick={takeAction} type="button">Apply action</button>
          </section>
        </div>
      )}

      <section className="play-turn">
        <button className="play-primary" disabled={busy || Boolean(pending) || Boolean(state.outcome)} onClick={runMonth} type="button">
          {busy ? "Working…" : `Run ${state.currentMonth}`}
        </button>
        <button disabled={busy} onClick={() => void loadCheckpoint()} type="button">Load checkpoint</button>
      </section>

      {checkpoint ? (
        <section className="play-panel">
          <h2>Checkpoint · {checkpoint.evidence.monthsProcessed} month(s)</h2>
          <div className="play-stats compact">
            <div><span>Gross income</span><strong>{formatMoney(checkpoint.evidence.totalGrossIncomeCents)}</strong></div>
            <div><span>Tax</span><strong>{formatMoney(checkpoint.evidence.totalTaxCents)}</strong></div>
            <div><span>Net-worth change</span><strong>{formatMoney(checkpoint.evidence.netWorthChangeCents)}</strong></div>
            <div><span>Market change</span><strong>{formatMoney(checkpoint.evidence.totalMarketValueChangeCents)}</strong></div>
          </div>
        </section>
      ) : null}

      <section className="play-panel">
        <h2>Activity</h2>
        {activity.length ? <ol className="play-activity">{activity.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ol> : <p className="play-note">No commands yet.</p>}
      </section>
    </section>
  );
}
