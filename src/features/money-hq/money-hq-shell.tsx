"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  RunViewWire,
  TaxSummaryResponse,
} from "@/contracts/api/contracts";
import {
  plansForDestination,
  type BoardPlan,
} from "@/features/board/plan-catalog";
import {
  characterBanterFromResponse,
  characterBanterRequestForMonth,
  loadCharacterBanterHistory,
  saveCharacterBanterHistory,
  type CharacterBanter,
  type CharacterBanterHistoryEntry,
} from "@/features/banter/character-banter";
import { LifeFinanceClient } from "@/lib/api-client/client";

import { HqCharacterBanter } from "./character-banter";
import { HqEventDialog } from "./dialogs/event-dialog";
import { HqMonthResultDialog } from "./dialogs/month-result-dialog";
import { HqPlanBar, HqSidebar, HqTopbar } from "./hq-chrome";
import { HQ_TABS, hqTab, type HqTabId } from "./hq-tabs";
import { hqViewFromRun } from "./hq-view";
import {
  adjustDraft,
  draftDiffersFromStrategy,
  draftFromStrategy,
  investPlanFromDraft,
  type EditableRate,
  type InvestDraft,
} from "./invest-model";
import { BudgetScreen } from "./screens/budget-screen";
import { CareerScreen } from "./screens/career-screen";
import { CheckpointScreen } from "./screens/checkpoint-screen";
import { DebriefScreen } from "./screens/debrief-screen";
import { DebtScreen } from "./screens/debt-screen";
import { GlossaryScreen } from "./screens/glossary-screen";
import { InvestScreen, type InvestLayout } from "./screens/invest-screen";
import { OverviewScreen } from "./screens/overview-screen";
import { SafetyScreen } from "./screens/safety-screen";
import { TaxScreen, type TaxLoadState } from "./screens/tax-screen";
import {
  appendTrailPoint,
  loadTrail,
  saveTrail,
  trailPointFromRun,
  type TrailPoint,
} from "./run-trail";
import { useHqTurn } from "./use-hq-turn";

/** Full-screen reports that replace the tabbed planning view. */
type HqReport = "checkpoint" | "debrief" | null;

/** A year of months must exist before a year-one report card means anything. */
const CHECKPOINT_MONTHS = 12;

const TOAST_MS = 4000;
// Long enough for assistive technology and a human reader to finish the line.
const BANTER_MS = 6500;

export function MoneyHqShell() {
  const router = useRouter();
  const [run, setRun] = useState<RunViewWire | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<HqTabId>("overview");
  const [selectedPlanIds, setSelectedPlanIds] = useState<
    Readonly<Partial<Record<HqTabId, string>>>
  >({});
  // Null means "no edits yet", so the dials follow the engine until touched.
  const [investDraft, setInvestDraft] = useState<InvestDraft | null>(null);
  const [investLayout, setInvestLayout] = useState<InvestLayout>("buckets");
  const [report, setReport] = useState<HqReport>(null);
  const [taxLoadState, setTaxLoadState] = useState<TaxLoadState>({
    status: "idle",
  });
  const [taxRetry, setTaxRetry] = useState(0);
  const [trail, setTrail] = useState<readonly TrailPoint[]>([]);
  const [toast, setToast] = useState({ message: "", visible: false });
  const [banter, setBanter] = useState<CharacterBanter | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const banterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const banterRequestToken = useRef(0);
  const recentBanterHistory = useRef<readonly CharacterBanterHistoryEntry[]>([]);

  /**
   * Every authoritative run state the server returns is recorded, so the trend
   * chart is a log of real responses rather than a client-side projection.
   */
  const recordRun = useCallback((next: RunViewWire) => {
    setRun(next);
    setTrail((previous) => {
      const updated = appendTrailPoint(previous, trailPointFromRun(next));
      saveTrail(next.runId, updated);
      return updated;
    });
  }, []);

  const turn = useHqTurn({ run, onRun: recordRun });

  useEffect(() => {
    let active = true;
    new LifeFinanceClient()
      .getSession()
      .then(({ session }) => {
        if (!active) return;
        if (!session) {
          router.replace("/start");
          return;
        }
        // Restore anything this browser already recorded before appending.
        setTrail(loadTrail(session.run.runId));
        recentBanterHistory.current = loadCharacterBanterHistory(session.run.runId);
        recordRun(session.run);
      })
      .catch(() => {
        if (active) router.replace("/start");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [router, recordRun]);

  // Tax is intentionally lazy: opening Money HQ stays fast, while the Tax tab
  // always uses the current authoritative run revision and server tax engine.
  useEffect(() => {
    if (activeTab !== "tax" || run === null) return;
    let active = true;
    Promise.resolve()
      .then(() => {
        if (active) setTaxLoadState({ status: "loading" });
        return new LifeFinanceClient().getTaxSummary(run.runId);
      })
      .then((summary: TaxSummaryResponse) => {
        if (active) setTaxLoadState({ status: "ready", summary });
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setTaxLoadState({
          status: "error",
          message:
            reason instanceof Error && reason.message
              ? reason.message
              : "The tax estimate could not be loaded.",
        });
      });
    return () => {
      active = false;
    };
  }, [activeTab, run, taxRetry]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (banterTimer.current) clearTimeout(banterTimer.current);
      banterRequestToken.current += 1;
    };
  }, []);

  const showToast = (message: string) => {
    setToast({ message, visible: true });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(
      () => setToast((previous) => ({ ...previous, visible: false })),
      TOAST_MS,
    );
  };

  const showBanter = (message: CharacterBanter | null) => {
    if (banterTimer.current) clearTimeout(banterTimer.current);
    setBanter(message);
    if (message === null) return;
    banterTimer.current = setTimeout(() => {
      setBanter((current) => current?.id === message.id ? null : current);
    }, BANTER_MS);
  };

  const view = useMemo(() => (run ? hqViewFromRun(run) : null), [run]);

  const tabPlans = useMemo(() => {
    if (!run) return [];
    const destinationId = hqTab(activeTab).destinationId;
    return destinationId ? plansForDestination(run, destinationId) : [];
  }, [run, activeTab]);

  if (loading || !run || !view) {
    return (
      <div className="hq">
        <div className="hq-frame">
          <div className="hq-stage">
            <p className="hq-loading" role="status">
              Loading Money HQ…
            </p>
          </div>
        </div>
      </div>
    );
  }

  const selectedPlanId = selectedPlanIds[activeTab] ?? null;
  // Derived during render: the dials are the single source of truth and the
  // plan follows them, so the plan bar can never show a stale contribution.
  const effectiveInvestDraft = investDraft ?? draftFromStrategy(run.strategy);
  const pendingInvestPlan = draftDiffersFromStrategy(
    effectiveInvestDraft,
    run.strategy,
  )
    ? investPlanFromDraft(effectiveInvestDraft, {
        hsaEligible: run.benefits?.healthPlan?.hsaEligible === true,
        hasActiveTermDebt: run.finances.nonCreditLiabilitiesCents > 0,
      })
    : null;
  const selectedPlan =
    activeTab === "invest"
      ? pendingInvestPlan
      : tabPlans.find((plan) => plan.id === selectedPlanId) ?? null;

  const eventPending = run.pendingInteraction.kind === "event";
  const selectedPlanAllowed =
    selectedPlan === null || selectedPlan.disabledReason === null;
  const canCommit =
    run.capabilities.canAdvance &&
    !eventPending &&
    turn.monthResult === null &&
    selectedPlanAllowed;

  const handleSelectPlan = (planId: string) => {
    setSelectedPlanIds((previous) => ({ ...previous, [activeTab]: planId }));
    turn.clearError();
  };

  // Functional so several clicks inside one render each apply their step
  // instead of all resolving against the same stale draft.
  const handleAdjustInvest = (
    key: EditableRate,
    deltaPpm: number,
    maxPpm: number,
  ) => {
    setInvestDraft((previous) =>
      adjustDraft(previous ?? draftFromStrategy(run.strategy), key, deltaPpm, maxPpm),
    );
  };

  const handleCommit = () => {
    void turn.commit(selectedPlan).then((completed) => {
      if (!completed) return;
      // A committed plan belongs to the month that just ended; clearing the
      // draft lets the dials fall back to the engine's saved strategy.
      setSelectedPlanIds({});
      setInvestDraft(null);
    });
  };

  const handleEventCommitted = (committedRun: RunViewWire, reaction: string) => {
    recordRun(committedRun);
    showToast(reaction);
  };

  const handleDismissMonthResult = () => {
    const result = turn.monthResult;
    turn.dismissResult();
    if (result === null) return;

    const variation = new Uint32Array(1);
    crypto.getRandomValues(variation);
    const request = characterBanterRequestForMonth(
      run,
      result,
      recentBanterHistory.current,
      variation[0]! & 0x7fff_ffff,
    );
    if (request === null) return;

    const token = ++banterRequestToken.current;
    // Cosmetic copy is deliberately generated after the report closes. The
    // player can keep planning while this background request is in flight.
    void new LifeFinanceClient()
      .generateCharacterBanter(run.runId, request)
      .then((response) => {
        if (banterRequestToken.current !== token) return;
        const generated = characterBanterFromResponse(
          response,
          request.simulationMonth,
        );
        if (generated === null) return;
        recentBanterHistory.current = Object.freeze([
          ...recentBanterHistory.current,
          {
            characterId: generated.characterId,
            citedEvidenceId: generated.citedEvidenceId,
            message: generated.message,
          },
        ].slice(-8));
        saveCharacterBanterHistory(run.runId, recentBanterHistory.current);
        showBanter(generated);
      })
      .catch(() => {
        // Banter is optional and must never interrupt or slow the game loop.
      });
  };

  const handleNewGame = () => {
    if (turn.busy) return;
    const confirmed = window.confirm(
      "Start setting up a new game? Your current game remains saved until the new game is successfully created. Creating it will archive this active game.",
    );
    if (confirmed) router.push("/start");
  };

  const planSummary = selectedPlan ? [selectedPlan.label] : [];
  const commitLabel =
    turn.commitMode === "finish_month"
      ? "Finish this month"
      : turn.commitMode === "refresh"
        ? "Refresh"
        : "Live this month!";
  const planHint = eventPending
    ? "Resolve the decision first"
    : selectedPlan?.disabledReason
      ? selectedPlan.disabledReason
    : selectedPlan
      ? null
      : "Choose your focus, then…";

  if (report !== null) {
    return (
      <div className="hq">
        <h1 className="sr-only">Money HQ</h1>
        <div className="hq-frame">
          <div className="hq-stage">
            {report === "checkpoint" ? (
              <CheckpointScreen onBack={() => setReport(null)} run={run} />
            ) : (
              <DebriefScreen onBack={() => setReport(null)} run={run} />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hq">
      <h1 className="sr-only">Money HQ</h1>
      <div className="hq-frame">
        <div className="hq-stage">
          <HqTopbar
            busy={turn.busy}
            onNewGame={handleNewGame}
            onSavedGames={() => router.push("/saves")}
            view={view}
          />

          {banter ? (
            <HqCharacterBanter
              banter={banter}
              onDismiss={() => showBanter(null)}
            />
          ) : null}

          <div className="hq-body">
            <HqSidebar
              activeTab={activeTab}
              onSelectTab={(tab) => {
                setActiveTab(tab);
                turn.clearError();
              }}
              view={view}
            />

            <div className="hq-main">
              {turn.error ? (
                <p className="hq-error" role="alert">
                  {turn.error}
                </p>
              ) : null}

              <HqScreen
                activeTab={activeTab}
                busy={turn.busy}
                investDraft={effectiveInvestDraft}
                investLayout={investLayout}
                onAdjustInvest={handleAdjustInvest}
                onInvestLayout={setInvestLayout}
                onSelectPlan={handleSelectPlan}
                onSelectTab={setActiveTab}
                plans={tabPlans}
                run={run}
                selectedPlanId={selectedPlanId}
                trail={trail}
                taxLoadState={taxLoadState}
                onRetryTax={() => setTaxRetry((value) => value + 1)}
                view={view}
              />

              <div className="hq-chip-row">
                {/*
                  `beginnerCheckpoint` is only populated in the single month
                  that is exactly twelve months from the start, so gating the
                  entry point on it would hide the report card forever after.
                  Once a year of months exists, the report stays reachable.
                */}
                {view.monthNumber > CHECKPOINT_MONTHS ? (
                  <button
                    className="hq-topbar-action"
                    onClick={() => setReport("checkpoint")}
                    type="button"
                  >
                    View the 12-month report →
                  </button>
                ) : null}
                {view.isComplete ? (
                  <button
                    className="hq-topbar-action"
                    onClick={() => setReport("debrief")}
                    type="button"
                  >
                    View the final debrief →
                  </button>
                ) : null}
              </div>

              <HqPlanBar
                busy={turn.busy}
                canCommit={canCommit}
                commitLabel={commitLabel}
                hint={planHint}
                onCommit={handleCommit}
                summary={planSummary}
              />
            </div>
          </div>
        </div>
      </div>

      {eventPending && turn.monthResult === null ? (
        <HqEventDialog
          onCommitted={handleEventCommitted}
          run={run}
        />
      ) : null}

      {turn.monthResult ? (
        <HqMonthResultDialog
          onDismiss={handleDismissMonthResult}
          result={turn.monthResult}
        />
      ) : null}

      <p
        aria-live="polite"
        className="hq-toast"
        data-visible={toast.visible ? "true" : "false"}
        role="status"
      >
        {toast.message}
      </p>
    </div>
  );
}

type ScreenProps = Readonly<{
  activeTab: HqTabId;
  busy: boolean;
  investDraft: InvestDraft;
  investLayout: InvestLayout;
  onAdjustInvest: (key: EditableRate, deltaPpm: number, maxPpm: number) => void;
  onInvestLayout: (layout: InvestLayout) => void;
  onSelectPlan: (planId: string) => void;
  onSelectTab: (tab: HqTabId) => void;
  onRetryTax: () => void;
  plans: readonly BoardPlan[];
  run: RunViewWire;
  selectedPlanId: string | null;
  trail: readonly TrailPoint[];
  taxLoadState: TaxLoadState;
  view: ReturnType<typeof hqViewFromRun>;
}>;

function HqScreen({
  activeTab,
  busy,
  investDraft,
  investLayout,
  onAdjustInvest,
  onInvestLayout,
  onSelectPlan,
  onSelectTab,
  onRetryTax,
  plans,
  run,
  selectedPlanId,
  trail,
  taxLoadState,
  view,
}: ScreenProps) {
  const shared = { busy, onSelectPlan, plans, run, selectedPlanId, view };

  switch (activeTab) {
    case "overview":
      return (
        <OverviewScreen
          onSelectTab={onSelectTab}
          run={run}
          trail={trail}
          view={view}
        />
      );
    case "budget":
      return <BudgetScreen {...shared} />;
    case "tax":
      return (
        <TaxScreen
          loadState={taxLoadState}
          onRetry={onRetryTax}
          onSelectTab={onSelectTab}
        />
      );
    case "debt":
      return <DebtScreen {...shared} />;
    case "invest":
      return (
        <InvestScreen
          busy={busy}
          draft={investDraft}
          layout={investLayout}
          onAdjust={onAdjustInvest}
          onLayout={onInvestLayout}
          run={run}
        />
      );
    case "career":
      return <CareerScreen {...shared} />;
    case "safety":
      return <SafetyScreen {...shared} />;
    case "glossary":
      return <GlossaryScreen run={run} />;
  }
}

export const HQ_TAB_IDS = HQ_TABS.map(({ id }) => id);
