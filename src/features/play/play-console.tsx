"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { GameStateV2 } from "@/core/game-state-v2";
import type {
  AdvanceTimeV2Response,
  CheckpointV2Response,
  CommandV2Response,
  GameCommandV2Public,
  PlayerPolicyPreviewV2Request,
  PlayerPolicyPreviewV2Response,
} from "@/server/api/contracts-v2";
import type { AiExplanationApiResponse } from "@/server/ai/education-contracts";
import type { AiWorldEventApiResponse } from "@/server/ai/world-director-contracts";
import type { AiDebriefApiResponse } from "@/server/ai/debrief-contracts";
import { AI_PRIVACY_NOTICE_VERSION } from "@/server/ai/privacy-notice";
import type {
  TeachingCheckpointResponseV2,
  TeachingDebriefResponseV2,
  TeachingMomentResponseV2,
} from "@/server/teaching/service-v2";
import type { TeachingRewriteApiResponseV2 } from "@/server/teaching/rewrite-service-v2";

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
  strategyDraftFromState,
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
import {
  approvedPolicyCommand,
  createPolicyPreviewSession,
  invalidatePolicyPreview,
  isCurrentPolicyPreviewGeneration,
  type PolicyPreviewSession,
} from "./policy-preview-model";
import { PolicyPreviewPanel } from "./policy-preview-panel";
import { TeachingCheckpointPanelV2 } from "./teaching-checkpoint-panel-v2";
import {
  TeachingDebriefPanelV2,
  TeachingMomentPanelV2,
} from "./teaching-moment-panel-v2";
import {
  rebaseStateBoundCommandV2,
  TeachingRevisionCoordinatorV2,
} from "./teaching-revision-coordinator-v2";

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
  emergencyFundMonths: 6,
  insuranceCoverageIds: null,
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
  const [teachingCheckpoint, setTeachingCheckpoint] =
    useState<TeachingCheckpointResponseV2 | null>(null);
  const [teachingMoment, setTeachingMoment] =
    useState<TeachingMomentResponseV2 | null>(null);
  const [teachingDebrief, setTeachingDebrief] =
    useState<TeachingDebriefResponseV2 | null>(null);
  const [teachingRewrite, setTeachingRewrite] =
    useState<TeachingRewriteApiResponseV2 | null>(null);
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
  const [policyPreview, setPolicyPreview] =
    useState<PolicyPreviewSession | null>(null);
  const policyPreviewGeneration = useRef(0);
  const automaticTeachingRevision = useRef<number | null>(null);
  const deterministicDebriefRevision = useRef<number | null>(null);
  const revisionCoordinator = useRef(new TeachingRevisionCoordinatorV2());
  const authoritativeStateRef = useRef<GameStateV2 | null>(null);
  const pendingBusyOperations = useRef(0);

  const captureRevisionSession = useCallback(
    () => revisionCoordinator.current.captureSession(),
    [],
  );

  const isCurrentRunSession = useCallback(
    (session: number, runId: string) =>
      revisionCoordinator.current.isSessionCurrent(session) &&
      authoritativeStateRef.current?.runId === runId,
    [],
  );

  const invalidateCurrentPolicyPreview = useCallback(() => {
    policyPreviewGeneration.current += 1;
    setPolicyPreview((current) => invalidatePolicyPreview(current));
  }, []);

  const acceptAuthoritativeState = useCallback((nextState: GameStateV2) => {
    authoritativeStateRef.current = nextState;
    invalidateCurrentPolicyPreview();
    setStrategy(strategyDraftFromState(nextState));
    setState(nextState);
  }, [invalidateCurrentPolicyPreview]);

  const acceptTeachingState = useCallback((
    before: GameStateV2,
    nextState: GameStateV2,
  ) => {
    revisionCoordinator.current.recordTeachingOnlyRevision(before, nextState);
    acceptAuthoritativeState(nextState);
  }, [acceptAuthoritativeState]);

  const rebaseAgainstLatestTeachingOnly = <
    TCommand extends Readonly<{
      expectedRevision: number;
      effectiveMonth: string;
    }>,
  >(
    command: TCommand,
    capturedState: GameStateV2,
  ): TCommand => {
    const latest = authoritativeStateRef.current;
    if (
      !latest ||
      latest.runId !== capturedState.runId ||
      !revisionCoordinator.current.canRebaseAcrossTeachingOnly(command, latest)
    ) return command;
    return rebaseStateBoundCommandV2(command, {
      revision: latest.revision,
      currentMonth: latest.currentMonth,
    });
  };

  const runBusyRevisionOperation = <TResult,>(
    label: string,
    operation: () => Promise<TResult>,
  ): Promise<TResult> => {
    const busySession = captureRevisionSession();
    const firstPending = pendingBusyOperations.current === 0;
    pendingBusyOperations.current += 1;
    setBusy(true);
    if (firstPending) setBusyLabel(label);
    return revisionCoordinator.current.run(async () => {
      if (revisionCoordinator.current.isSessionCurrent(busySession)) {
        setBusyLabel(label);
      }
      return operation();
    }).finally(() => {
      if (!revisionCoordinator.current.isSessionCurrent(busySession)) return;
      pendingBusyOperations.current -= 1;
      if (pendingBusyOperations.current === 0) {
        setBusy(false);
        setBusyLabel("");
      }
    });
  };

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
          revisionCoordinator.current.reset();
          authoritativeStateRef.current = result.state;
          setCredential(saved);
          setStrategy(strategyDraftFromState(result.state));
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
    if (
      !state ||
      !credential ||
      state.outcome ||
      automaticTeachingRevision.current === state.revision
    ) return;
    const session = captureRevisionSession();
    void revisionCoordinator.current.run(async () => {
      const current = authoritativeStateRef.current;
      if (
        !isCurrentRunSession(session, credential.runId) ||
        !current ||
        current.runId !== credential.runId ||
        current.outcome ||
        automaticTeachingRevision.current === current.revision
      ) return;
      automaticTeachingRevision.current = current.revision;
      try {
        const result = await apiRequest<TeachingMomentResponseV2>(
          `/api/v2/runs/${credential.runId}/teaching/moment`,
          {
            method: "POST",
            headers: authHeaders(credential.accessSecret),
            body: JSON.stringify({
              expectedRevision: current.revision,
              trigger: "automatic",
            }),
          },
        );
        if (
          !isCurrentRunSession(session, credential.runId) ||
          result.state.runId !== credential.runId
        ) return;
        automaticTeachingRevision.current = result.state.revision;
        setTeachingMoment(result);
        setTeachingRewrite(null);
        if (result.state.revision !== current.revision) {
          acceptTeachingState(current, result.state);
        }
      } catch {
        // Teaching is additive; the authoritative game remains usable if it is unavailable.
      }
    });
  }, [acceptTeachingState, captureRevisionSession, credential, isCurrentRunSession, state]);

  useEffect(() => {
    if (
      !state ||
      !credential ||
      !state.outcome ||
      !("outcomePolicyVersion" in state.outcome) ||
      deterministicDebriefRevision.current === state.revision
    ) return;
    const session = captureRevisionSession();
    void revisionCoordinator.current.run(async () => {
      const current = authoritativeStateRef.current;
      if (
        !isCurrentRunSession(session, credential.runId) ||
        !current ||
        current.runId !== credential.runId ||
        !current.outcome ||
        !("outcomePolicyVersion" in current.outcome) ||
        deterministicDebriefRevision.current === current.revision
      ) return;
      deterministicDebriefRevision.current = current.revision;
      try {
        const result = await apiRequest<TeachingDebriefResponseV2>(
          `/api/v2/runs/${credential.runId}/teaching/debrief`,
          {
            method: "POST",
            headers: authHeaders(credential.accessSecret),
            body: JSON.stringify({
              expectedRevision: current.revision,
              counterfactuals: [],
            }),
          },
        );
        if (isCurrentRunSession(session, credential.runId)) {
          setTeachingDebrief(result);
        }
      } catch {
        // The legacy debrief remains available if verified causal evidence is incomplete.
      }
    });
  }, [captureRevisionSession, credential, isCurrentRunSession, state]);

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
      revisionCoordinator.current.reset();
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(saved));
      setCredential(saved);
      acceptAuthoritativeState(result.state);
      setCheckpoint(null);
      setTeachingCheckpoint(null);
      setTeachingMoment(null);
      setTeachingDebrief(null);
      automaticTeachingRevision.current = null;
      deterministicDebriefRevision.current = null;
      setResumeDecisionId(null);
      setPolicyPreview(null);
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
    if (!credential || !state) return null;
    const capturedState = state;
    const session = captureRevisionSession();
    setError(null);
    return runBusyRevisionOperation("Applying your decision…", async () => {
      if (!isCurrentRunSession(session, credential.runId)) return null;
      try {
        const requestCommand = rebaseAgainstLatestTeachingOnly(command, capturedState);
        const result = await apiRequest<CommandV2Response>(
          `/api/v2/runs/${credential.runId}/commands`,
          {
            method: "POST",
            headers: authHeaders(credential.accessSecret),
            body: JSON.stringify(requestCommand),
          },
        );
        if (
          !isCurrentRunSession(session, credential.runId) ||
          result.state.runId !== credential.runId
        ) return null;
        acceptAuthoritativeState(result.state);
        setCheckpoint(null);
        setTeachingCheckpoint(null);
        setResumeDecisionId(null);
        addActivity(message);
        if (result.monthlyRecord) {
          setTurnHistory((current) => [result.monthlyRecord!, ...current].slice(0, 12));
        }
        return result;
      } catch (caught) {
        if (!isCurrentRunSession(session, credential.runId)) return null;
        setError(caught instanceof Error ? caught.message : "Command failed");
        return null;
      }
    });
  };

  const previewPolicyCommand = async (
    command: PlayerPolicyPreviewV2Request,
    message: string,
  ) => {
    if (!credential || !state) return;
    const capturedState = state;
    const session = captureRevisionSession();
    const requestedGeneration = policyPreviewGeneration.current + 1;
    policyPreviewGeneration.current = requestedGeneration;
    setError(null);
    await runBusyRevisionOperation("Calculating exact engine effects...", async () => {
      if (!isCurrentRunSession(session, credential.runId)) return;
      const requestCommand = rebaseAgainstLatestTeachingOnly(command, capturedState);
      try {
        const response = await apiRequest<PlayerPolicyPreviewV2Response>(
          `/api/v2/runs/${credential.runId}/commands/preview`,
          {
            method: "POST",
            headers: authHeaders(credential.accessSecret),
            body: JSON.stringify(requestCommand),
          },
        );
        if (!isCurrentRunSession(session, credential.runId)) return;
        if (
          isCurrentPolicyPreviewGeneration(
            requestedGeneration,
            policyPreviewGeneration.current,
          )
        ) {
          setPolicyPreview(createPolicyPreviewSession(requestCommand, response, message));
        }
      } catch (caught) {
        if (!isCurrentRunSession(session, credential.runId)) return;
        if (
          isCurrentPolicyPreviewGeneration(
            requestedGeneration,
            policyPreviewGeneration.current,
          )
        ) {
          setPolicyPreview(null);
          setError(caught instanceof Error ? caught.message : "Preview failed");
        }
      }
    });
  };

  const approvePolicyPreview = () => {
    if (!state || !policyPreview) return;
    const approvedCommand = approvedPolicyCommand(
      policyPreview,
      state.revision,
      state.currentMonth,
    );
    if (!approvedCommand) {
      invalidateCurrentPolicyPreview();
      setError("This preview is stale. Review the updated engine effects before approval.");
      return;
    }
    invalidateCurrentPolicyPreview();
    void submit(approvedCommand, policyPreview.activityMessage);
  };

  const saveStrategy = () => {
    if (!state) return;
    void previewPolicyCommand(
      {
        schemaVersion: 2,
        id: commandId("strategy"),
        expectedRevision: state.revision,
        effectiveMonth: state.currentMonth,
        type: "set_recurring_strategy",
        payload: {
          strategy: {
            emergencyFundTargetMonthsPpm: Math.round(
              strategy.emergencyFundMonths * 1_000_000,
            ),
            insuranceCoverageIds:
              [...(
                strategy.insuranceCoverageIds ??
                state.gameplay.recurringStrategy.insuranceCoverageIds ??
                state.gameplay.benefits.insuranceCoverageIds
              )],
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
    const capturedState = state;
    const session = captureRevisionSession();
    setError(null);
    const label = `Simulating up to ${count} month${count === 1 ? "" : "s"}…`;
    await runBusyRevisionOperation(label, async () => {
      if (!isCurrentRunSession(session, credential.runId)) return;
      const baseRequest = {
        schemaVersion: 2 as const,
        id: commandId("advance"),
        expectedRevision: capturedState.revision,
        effectiveMonth: capturedState.currentMonth,
        maxMonths: count,
        mode: resumeDecisionId
          ? {
              kind: "resume" as const,
              resolvedDecisionId: resumeDecisionId,
              months: count,
            }
          : { kind: "months" as const, months: count },
      };
      const request = rebaseAgainstLatestTeachingOnly(baseRequest, capturedState);
      try {
        const result = await apiRequest<AdvanceTimeV2Response>(
          `/api/v2/runs/${credential.runId}/advance`,
          {
            method: "POST",
            headers: authHeaders(credential.accessSecret),
            body: JSON.stringify(request),
          },
        );
        if (
          !isCurrentRunSession(session, credential.runId) ||
          result.state.runId !== credential.runId
        ) return;
        let automaticCheckpoint: TeachingCheckpointResponseV2 | null = null;
        if (result.checkpointInput) {
          try {
            automaticCheckpoint = await apiRequest<TeachingCheckpointResponseV2>(
              `/api/v2/runs/${credential.runId}/teaching/checkpoint?expectedRevision=${result.state.revision}&fromRevision=${request.expectedRevision}`,
              { headers: authHeaders(credential.accessSecret) },
            );
          } catch {
            if (isCurrentRunSession(session, credential.runId)) {
              addActivity("The run advanced, but the verified teaching checkpoint could not be loaded.");
            }
          }
        }
        if (!isCurrentRunSession(session, credential.runId)) return;
        acceptAuthoritativeState(result.state);
        setCheckpoint(
          result.checkpointInput ? { evidence: result.checkpointInput } : null,
        );
        setTeachingCheckpoint(automaticCheckpoint);
        setTurnHistory([]);
        setResumeDecisionId(null);
        addActivity(
          `Advanced ${result.monthsAdvanced} month${result.monthsAdvanced === 1 ? "" : "s"} to ${result.state.currentMonth}; cash ${formatMoney(result.uiChanges.cashChangeCents)}, net worth ${formatMoney(result.uiChanges.netWorthChangeCents)}.`,
        );
        addActivity(describeTimePauseV2(result.pauseReason));
      } catch (caught) {
        if (!isCurrentRunSession(session, credential.runId)) return;
        setError(caught instanceof Error ? caught.message : "Monthly simulation failed");
      }
    });
  };

  const takeAction = () => {
    if (!state) return;
    void previewPolicyCommand(
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
    const session = captureRevisionSession();
    setError(null);
    await runBusyRevisionOperation(
      "Generating a grounded lesson from bounded game context…",
      async () => {
        const current = authoritativeStateRef.current;
        if (
          !isCurrentRunSession(session, credential.runId) ||
          !current ||
          current.runId !== credential.runId
        ) return;
        try {
          const result = await apiRequest<AiExplanationApiResponse>(
            `/api/v2/runs/${credential.runId}/ai/explanation`,
            {
              method: "POST",
              headers: authHeaders(credential.accessSecret),
              body: JSON.stringify({
                conceptId: activeConceptId,
                expectedRevision: current.revision,
                privacyNoticeVersion: AI_PRIVACY_NOTICE_VERSION,
                dataUseAccepted: true,
              }),
            },
          );
          const nextState = result.state as GameStateV2;
          if (
            !isCurrentRunSession(session, credential.runId) ||
            nextState.runId !== credential.runId
          ) return;
          if (result.memoryRecorded) {
            revisionCoordinator.current.recordTeachingOnlyRevision(current, nextState);
          }
          setAiLesson(result);
          acceptAuthoritativeState(nextState);
          addActivity(
            result.source === "deterministic_fallback"
              ? "AI was unavailable; the verified curriculum fallback was shown."
              : `Adaptive lesson generated by ${result.source}.`,
          );
        } catch (caught) {
          if (!isCurrentRunSession(session, credential.runId)) return;
          setError(caught instanceof Error ? caught.message : "Adaptive lesson failed");
        }
      },
    );
  };

  const requestVerifiedLesson = async (conceptId = activeConceptId) => {
    if (!state || !credential) return;
    const session = captureRevisionSession();
    setError(null);
    await runBusyRevisionOperation("Loading verified teaching evidence…", async () => {
      const current = authoritativeStateRef.current;
      if (
        !isCurrentRunSession(session, credential.runId) ||
        !current ||
        current.runId !== credential.runId
      ) return;
      try {
        const result = await apiRequest<TeachingMomentResponseV2>(
          `/api/v2/runs/${credential.runId}/teaching/moment`,
          {
            method: "POST",
            headers: authHeaders(credential.accessSecret),
            body: JSON.stringify({
              expectedRevision: current.revision,
              trigger: "requested_help",
              conceptId,
            }),
          },
        );
        if (
          !isCurrentRunSession(session, credential.runId) ||
          result.state.runId !== credential.runId
        ) return;
        automaticTeachingRevision.current = result.state.revision;
        setTeachingMoment(result);
        setTeachingRewrite(null);
        if (result.state.revision !== current.revision) {
          acceptTeachingState(current, result.state);
        }
        addActivity(`Verified lesson loaded for ${conceptId.replaceAll("_", " ")}.`);
      } catch (caught) {
        if (!isCurrentRunSession(session, credential.runId)) return;
        setError(caught instanceof Error ? caught.message : "Verified lesson failed");
      }
    });
  };

  const requestOptionalTeachingRewrite = async () => {
    if (!state || !credential || !aiConsent || !teachingMoment?.moment) return;
    const session = captureRevisionSession();
    setBusy(true);
    setBusyLabel("Requesting optional wording while keeping verified facts fixed…");
    setError(null);
    try {
      const result = await apiRequest<TeachingRewriteApiResponseV2>(
        `/api/v2/runs/${credential.runId}/teaching/rewrite`,
        {
          method: "POST",
          headers: authHeaders(credential.accessSecret),
          body: JSON.stringify({
            expectedRevision: state.revision,
            privacyNoticeVersion: AI_PRIVACY_NOTICE_VERSION,
            dataUseAccepted: true,
            target: {
              kind: "moment",
              conceptId: teachingMoment.moment.conceptId,
            },
          }),
        },
      );
      if (!isCurrentRunSession(session, credential.runId)) return;
      setTeachingRewrite(result);
      addActivity(
        result.rewrite.source === "ai_validated"
          ? "Optional teaching wording accepted; verified facts were unchanged."
          : "Optional wording was rejected or unavailable; verified local wording was kept.",
      );
    } catch (caught) {
      if (!isCurrentRunSession(session, credential.runId)) return;
      setError(caught instanceof Error ? caught.message : "Optional teaching wording failed");
    } finally {
      if (isCurrentRunSession(session, credential.runId)) {
        setBusy(false);
        setBusyLabel("");
      }
    }
  };

  const createAiWorldEvent = async () => {
    if (!state || !credential || !aiConsent) return;
    const session = captureRevisionSession();
    setBusy(true);
    setBusyLabel("The Hostile Fed is ranking eligible scenarios…");
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
      if (!isCurrentRunSession(session, credential.runId)) return;
      const topCandidate = result.ranking.ranked[0];
      addActivity(
        topCandidate
          ? `The Hostile Fed ranked ${topCandidate.templateId} first using ${result.source}. No event was queued; Runtime Balance keeps approval control.`
          : "The Hostile Fed found no eligible scenarios to rank. No event was queued.",
      );
    } catch (caught) {
      if (!isCurrentRunSession(session, credential.runId)) return;
      setError(caught instanceof Error ? caught.message : "World Director failed");
    } finally {
      if (isCurrentRunSession(session, credential.runId)) {
        setBusy(false);
        setBusyLabel("");
      }
    }
  };

  const createAiDebrief = async () => {
    if (!state || !state.outcome || !credential || !aiConsent) return;
    const session = captureRevisionSession();
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
      if (!isCurrentRunSession(session, credential.runId)) return;
      setAiDebrief(result);
      addActivity(`Final debrief generated by ${result.source}.`);
    } catch (caught) {
      if (!isCurrentRunSession(session, credential.runId)) return;
      setError(caught instanceof Error ? caught.message : "Final debrief failed");
    } finally {
      if (isCurrentRunSession(session, credential.runId)) {
        setBusy(false);
        setBusyLabel("");
      }
    }
  };

  const loadCheckpoint = async () => {
    if (!state || !credential) return;
    const session = captureRevisionSession();
    setBusy(true);
    setBusyLabel("Reconciling checkpoint evidence…");
    setError(null);
    try {
      const fromRevision = Math.max(0, state.revision - 12);
      const result = await apiRequest<TeachingCheckpointResponseV2>(
        `/api/v2/runs/${credential.runId}/teaching/checkpoint?expectedRevision=${state.revision}&fromRevision=${fromRevision}`,
        { headers: authHeaders(credential.accessSecret) },
      );
      if (!isCurrentRunSession(session, credential.runId)) return;
      setTeachingCheckpoint(result);
      addActivity(`Checkpoint loaded from revision ${fromRevision}.`);
    } catch (caught) {
      if (!isCurrentRunSession(session, credential.runId)) return;
      setError(caught instanceof Error ? caught.message : "Checkpoint failed");
    } finally {
      if (isCurrentRunSession(session, credential.runId)) {
        setBusy(false);
        setBusyLabel("");
      }
    }
  };

  const forgetGame = () => {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(RECAP_SESSION_KEY);
    setCredential(null);
    authoritativeStateRef.current = null;
    revisionCoordinator.current.reset();
    pendingBusyOperations.current = 0;
    setBusy(false);
    setBusyLabel("");
    setState(null);
    setCheckpoint(null);
    setTeachingCheckpoint(null);
    setTeachingMoment(null);
    setTeachingDebrief(null);
    setTeachingRewrite(null);
    automaticTeachingRevision.current = null;
    deterministicDebriefRevision.current = null;
    setResumeDecisionId(null);
    invalidateCurrentPolicyPreview();
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
        <button className="play-quiet" disabled={busy} onClick={forgetGame} type="button">
          Start over
        </button>
      </header>

      {error ? <p className="play-error" role="alert">{error}</p> : null}
      {busy ? <p className="play-working" role="status">{busyLabel}</p> : null}

      <TeachingMomentPanelV2
        response={teachingMoment}
        busy={busy}
        onRequestHelp={() => void requestVerifiedLesson(
          teachingMoment?.moment?.conceptId ?? activeConceptId,
        )}
        rewrite={teachingRewrite}
      />

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
        <>
          <TeachingDebriefPanelV2 response={teachingDebrief} />
          <DebriefPanel
            busy={busy}
            consented={aiConsent}
            outcome={state.outcome}
            result={aiDebrief}
            onConsentChange={setAiConsent}
            onCreate={() => void createAiDebrief()}
          />
        </>
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
        <>
          <StrategyPanel
            state={state}
            draft={strategy}
            busy={busy}
            blocked={blocked}
            onChange={(update) => {
              invalidateCurrentPolicyPreview();
              setStrategy(update);
            }}
            onSave={saveStrategy}
            onSelectConcept={selectConcept}
          />
          {policyPreview?.command.type === "set_recurring_strategy" ? (
            <PolicyPreviewPanel
              busy={busy}
              session={policyPreview}
              onApprove={approvePolicyPreview}
              onCancel={invalidateCurrentPolicyPreview}
            />
          ) : null}
        </>
      ) : null}
      {tab === "actions" ? (
        <>
          <ActionPanel
            state={state}
            draft={actionDraft}
            busy={busy}
            blocked={blocked}
            onChange={(patch) => {
              invalidateCurrentPolicyPreview();
              setActionDraft((current) => ({ ...current, ...patch }));
            }}
            onApply={takeAction}
            onSelectConcept={selectConcept}
          />
          {policyPreview?.command.type === "take_detailed_action" ? (
            <PolicyPreviewPanel
              busy={busy}
              session={policyPreview}
              onApprove={approvePolicyPreview}
              onCancel={invalidateCurrentPolicyPreview}
            />
          ) : null}
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
        <>
          <section className="play-panel" aria-label="Verified glossary help">
            <div>
              <p className="hero-kicker">Deterministic help</p>
              <h2>Explain the selected concept from verified run facts</h2>
            </div>
            <button
              disabled={busy}
              onClick={() => void requestVerifiedLesson()}
              type="button"
            >
              Explain with verified evidence
            </button>
            <button
              disabled={busy || !aiConsent || !teachingMoment?.moment}
              onClick={() => void requestOptionalTeachingRewrite()}
              type="button"
            >
              Optional AI wording (facts stay fixed)
            </button>
          </section>
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
        </>
      ) : null}

      {teachingCheckpoint ? (
        <TeachingCheckpointPanelV2 checkpoint={teachingCheckpoint.checkpoint} />
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
