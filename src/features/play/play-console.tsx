"use client";

import { useEffect, useState } from "react";

import type { GameStateV2 } from "@/core/game-state-v2";
import type {
  AdvanceTimeV2Response,
  CheckpointV2Response,
  CommandV2Response,
  GameCommandV2Public,
} from "@/server/api/contracts-v2";
import type { AiExplanationApiResponse } from "@/server/ai/education-contracts";
import type { AiWorldEventApiResponse } from "@/server/ai/world-director-contracts";
import type { AiDebriefApiResponse } from "@/server/ai/debrief-contracts";
import { AI_PRIVACY_NOTICE_VERSION } from "@/server/ai/privacy-notice";

import { buildDetailedAction } from "./action-builder";
import {
  ActionPanel,
  EducationPanel,
  StrategyPanel,
} from "./decision-panels";
import { EventPanel } from "./event-panel";
import { OnboardingPanel } from "./onboarding-panel";
import { selectionForPreset } from "./onboarding-model";
import { MilestonePanel } from "./milestone-panel";
import { dueLifeMilestones } from "../../core/life-milestones-v2";
import { OverviewPanel } from "./overview-panel";
import {
  buildCreateRequest,
  calculateAgeYears,
  calculateNetWorth,
  describeTimePauseV2,
  formatMoney,
  percentToPpm,
  PLAYER_PRESETS,
} from "./play-model";
import {
  apiRequest,
  authHeaders,
  commandId,
  RECAP_SESSION_KEY,
  SESSION_KEY,
} from "./play-support";
import type {
  ActionDraft,
  MonthlyRecap,
  MilestoneDraft,
  OnboardingDraft,
  PlayTab,
  RunCredential,
  RunResponse,
  StrategyDraft,
} from "./play-types";
import { RunControls } from "./run-controls";
import { WorldDirectorPanel } from "./world-director-panel";
import { DebriefPanel } from "./debrief-panel";

const DEFAULT_ONBOARDING: OnboardingDraft = {
  setupMode: "quick",
  presetId: "software",
  selection: selectionForPreset("software"),
  salary: 120_000,
  cash: 25_000,
  studentDebt: 15_000,
  studentDebtPayment: 250,
  healthPlanId: "health.hdhp_hsa",
  coverageIds: ["insurance.renters"],
  desiredAnnualFiSpending: 65_000,
  safeWithdrawalRate: 4,
  targetAgeYears: 50,
};

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

const DEFAULT_MILESTONE: MilestoneDraft = {
  kind: "travel",
  label: "Major life goal",
  targetMonth: "2027-01",
  estimatedCost: 5_000,
};

export function PlayConsole() {
  const [credential, setCredential] = useState<RunCredential | null>(null);
  const [state, setState] = useState<GameStateV2 | null>(null);
  const [onboarding, setOnboarding] = useState(DEFAULT_ONBOARDING);
  const [strategy, setStrategy] = useState(DEFAULT_STRATEGY);
  const [actionDraft, setActionDraft] = useState(DEFAULT_ACTION);
  const [milestoneDraft, setMilestoneDraft] = useState(DEFAULT_MILESTONE);
  const [aiConsent, setAiConsent] = useState(false);
  const [aiLesson, setAiLesson] = useState<AiExplanationApiResponse | null>(null);
  const [aiDebrief, setAiDebrief] = useState<AiDebriefApiResponse | null>(null);
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
  const [resumeDecisionId, setResumeDecisionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<string[]>([]);

  const addActivity = (message: string) => {
    setActivity((current) => [message, ...current].slice(0, 20));
  };

  const selectConcept = (conceptId: string) => {
    setActiveConceptId(conceptId);
    setAiLesson(null);
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

  const createGame = async () => {
    setBusy(true);
    setBusyLabel("Creating your balance sheet…");
    setError(null);
    try {
      const request = buildCreateRequest(
        onboarding.presetId,
        onboarding.salary,
        onboarding.cash,
        `browser-${crypto.randomUUID()}`,
        {
          studentDebtDollars: onboarding.studentDebt,
          studentDebtPaymentDollars: onboarding.studentDebtPayment,
          healthPlanId: onboarding.healthPlanId,
          insuranceCoverageIds: onboarding.coverageIds,
          selection: onboarding.selection,
          financialGoal: {
            desiredAnnualSpendingDollars:
              onboarding.desiredAnnualFiSpending,
            safeWithdrawalRatePercent: onboarding.safeWithdrawalRate,
            targetAgeYears: onboarding.targetAgeYears,
          },
        },
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
      setResumeDecisionId(null);
      setTurnHistory([]);
      sessionStorage.removeItem(RECAP_SESSION_KEY);
      setActivity([`Created ${PLAYER_PRESETS[onboarding.presetId].label} run.`]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create game");
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  };

  const submit = async (command: GameCommandV2Public, message: string) => {
    if (!credential) return null;
    setBusy(true);
    setBusyLabel("Applying your decision…");
    setError(null);
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
      setResumeDecisionId(null);
      addActivity(message);
      if (result.monthlyRecord) {
        setTurnHistory((current) => [result.monthlyRecord!, ...current].slice(0, 12));
      }
      return result;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Command failed");
      return null;
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
    try {
      setBusyLabel(`Simulating up to ${count} month${count === 1 ? "" : "s"}…`);
      const result = await apiRequest<AdvanceTimeV2Response>(
        `/api/v2/runs/${credential.runId}/advance`,
        {
          method: "POST",
          headers: authHeaders(credential.accessSecret),
          body: JSON.stringify({
            schemaVersion: 2,
            id: commandId("advance"),
            expectedRevision: state.revision,
            effectiveMonth: state.currentMonth,
            maxMonths: count,
            mode: resumeDecisionId
              ? {
                  kind: "resume",
                  resolvedDecisionId: resumeDecisionId,
                  months: count,
                }
              : { kind: "months", months: count },
          }),
        },
      );
      setState(result.state);
      setCheckpoint(
        result.checkpointInput ? { evidence: result.checkpointInput } : null,
      );
      setTurnHistory([]);
      setResumeDecisionId(null);
      addActivity(
        `Advanced ${result.monthsAdvanced} month${result.monthsAdvanced === 1 ? "" : "s"} to ${result.state.currentMonth}; cash ${formatMoney(result.uiChanges.cashChangeCents)}, net worth ${formatMoney(result.uiChanges.netWorthChangeCents)}.`,
      );
      addActivity(describeTimePauseV2(result.pauseReason));
    } catch (caught) {
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
    const command = {
      schemaVersion: 2 as const,
      id: commandId("event"),
      expectedRevision: state.revision,
      effectiveMonth: state.currentMonth,
      type: "resolve_event_choice" as const,
      payload: { eventId: pending.eventId, choiceId },
    };
    void submit(
      command,
      `Event choice accepted: ${choiceId.replaceAll("_", " ")}.`,
    ).then((result) => {
      if (result) setResumeDecisionId(command.id);
    });
  };

  const scheduleMilestone = () => {
    if (!state) return;
    void submit({
      schemaVersion: 2,
      id: commandId("milestone"),
      expectedRevision: state.revision,
      effectiveMonth: state.currentMonth,
      type: "manage_life_milestone",
      payload: {
        action: "schedule",
        milestoneId: `milestone.${crypto.randomUUID()}`,
        kind: milestoneDraft.kind,
        label: milestoneDraft.label,
        targetMonth: milestoneDraft.targetMonth,
        estimatedCostCents: Math.round(milestoneDraft.estimatedCost * 100),
      },
    }, `Milestone scheduled for ${milestoneDraft.targetMonth}.`);
  };

  const resolveMilestone = (
    milestoneId: string,
    resolution: "pay_cash" | "postpone_6_months" | "cancel",
  ) => {
    if (!state) return;
    const command = {
      schemaVersion: 2,
      id: commandId("milestone"),
      expectedRevision: state.revision,
      effectiveMonth: state.currentMonth,
      type: "manage_life_milestone",
      payload: { action: "resolve", milestoneId, resolution },
    } as const;
    void submit(
      command,
      `Milestone decision accepted: ${resolution.replaceAll("_", " ")}.`,
    ).then((result) => {
      if (result && resolution !== "postpone_6_months") {
        setResumeDecisionId(command.id);
      }
    });
  };

  const askAiLesson = async () => {
    if (!state || !credential || !aiConsent) return;
    setBusy(true);
    setBusyLabel("Generating a grounded lesson from bounded game context…");
    setError(null);
    try {
      const result = await apiRequest<AiExplanationApiResponse>(
        `/api/v2/runs/${credential.runId}/ai/explanation`,
        {
          method: "POST",
          headers: authHeaders(credential.accessSecret),
          body: JSON.stringify({
            conceptId: activeConceptId,
            expectedRevision: state.revision,
            privacyNoticeVersion: AI_PRIVACY_NOTICE_VERSION,
            dataUseAccepted: true,
          }),
        },
      );
      setAiLesson(result);
      setState(result.state as GameStateV2);
      addActivity(
        result.source === "deterministic_fallback"
          ? "AI was unavailable; the verified curriculum fallback was shown."
          : `Adaptive lesson generated by ${result.source}.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Adaptive lesson failed");
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  };

  const createAiWorldEvent = async () => {
    if (!state || !credential || !aiConsent) return;
    setBusy(true);
    setBusyLabel("AI World Director is selecting a bounded fair event…");
    setError(null);
    try {
      const result = await apiRequest<AiWorldEventApiResponse>(
        `/api/v2/runs/${credential.runId}/ai/world-event`,
        {
          method: "POST",
          headers: authHeaders(credential.accessSecret),
          body: JSON.stringify({
            expectedRevision: state.revision,
            privacyNoticeVersion: AI_PRIVACY_NOTICE_VERSION,
            dataUseAccepted: true,
          }),
        },
      );
      setState(result.state as GameStateV2);
      addActivity(`World Director queued ${result.source} event targeting ${result.memory.targetedWeaknessId.replaceAll("_", " ")}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "World Director failed");
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  };

  const createAiDebrief = async () => {
    if (!state || !state.outcome || !credential || !aiConsent) return;
    setBusy(true);
    setBusyLabel("Explaining the immutable final grade from run evidence…");
    setError(null);
    try {
      const result = await apiRequest<AiDebriefApiResponse>(
        `/api/v2/runs/${credential.runId}/ai/debrief`,
        {
          method: "POST",
          headers: authHeaders(credential.accessSecret),
          body: JSON.stringify({
            expectedRevision: state.revision,
            privacyNoticeVersion: AI_PRIVACY_NOTICE_VERSION,
            dataUseAccepted: true,
          }),
        },
      );
      setAiDebrief(result);
      addActivity(`Final debrief generated by ${result.source}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Final debrief failed");
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  };

  const loadCheckpoint = async () => {
    if (!state || !credential) return;
    setBusy(true);
    setBusyLabel("Reconciling checkpoint evidence…");
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

  const forgetGame = () => {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(RECAP_SESSION_KEY);
    setCredential(null);
    setState(null);
    setCheckpoint(null);
    setResumeDecisionId(null);
    setTurnHistory([]);
    setActivity([]);
    setAiLesson(null);
    setAiDebrief(null);
    setAiConsent(false);
    setError(null);
  };

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
  const dueMilestone = dueLifeMilestones(state).length > 0;
  const blocked = Boolean(pending || dueMilestone || state.outcome);
  const age = calculateAgeYears(state.player.birthMonth, state.currentMonth);

  return (
    <section className="play-console">
      <header className="play-titlebar">
        <div>
          <p className="hero-kicker">Age {age} · {state.currentMonth}</p>
          <h1>
            {state.outcome
              ? `Grade ${state.outcome.grade}`
              : formatMoney(calculateNetWorth(state))}
          </h1>
          <p>
            {state.outcome
              ? state.outcome.kind.replaceAll("_", " ")
              : `Net worth · revision ${state.revision}`}
          </p>
        </div>
        <button className="play-quiet" onClick={forgetGame} type="button">
          Start over
        </button>
      </header>

      {error ? <p className="play-error" role="alert">{error}</p> : null}
      {busy ? <p className="play-working" role="status">{busyLabel}</p> : null}

      <div className="play-tabs" role="tablist" aria-label="Game sections">
        {(["overview", "strategy", "actions", "learn"] as const).map((item) => (
          <button
            aria-selected={tab === item}
            className={tab === item ? "active" : ""}
            key={item}
            onClick={() => setTab(item)}
            role="tab"
            type="button"
          >
            {item === "learn"
              ? "Learn & glossary"
              : item[0]!.toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>

      {pending ? (
        <EventPanel pending={pending} busy={busy} onChoice={resolveChoice} />
      ) : null}
      {state.outcome ? (
        <DebriefPanel
          busy={busy}
          consented={aiConsent}
          result={aiDebrief}
          onConsentChange={setAiConsent}
          onCreate={() => void createAiDebrief()}
        />
      ) : null}
      {!pending && tab === "learn" ? (
        <WorldDirectorPanel
          state={state}
          busy={busy}
          consented={aiConsent}
          onConsentChange={setAiConsent}
          onCreateEvent={() => void createAiWorldEvent()}
        />
      ) : null}
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
        <>
          <ActionPanel
            state={state}
            draft={actionDraft}
            busy={busy}
            blocked={blocked}
            onChange={(patch) => setActionDraft((current) => ({ ...current, ...patch }))}
            onApply={takeAction}
            onSelectConcept={selectConcept}
          />
          <MilestonePanel
            state={state}
            draft={milestoneDraft}
            busy={busy}
            onChange={(patch) => setMilestoneDraft((current) => ({ ...current, ...patch }))}
            onSchedule={scheduleMilestone}
            onResolve={resolveMilestone}
          />
        </>
      ) : null}
      {tab === "learn" ? (
        <EducationPanel
          activeConceptId={activeConceptId}
          onChange={(conceptId) => {
            setActiveConceptId(conceptId);
            setAiLesson(null);
          }}
          busy={busy}
          consented={aiConsent}
          lesson={aiLesson}
          onConsentChange={setAiConsent}
          onAskAi={() => void askAiLesson()}
        />
      ) : null}

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
