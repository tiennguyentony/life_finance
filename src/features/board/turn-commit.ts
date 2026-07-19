import type {
  CommandIntent,
  CommandResponseWire,
  RunViewWire,
} from "@/contracts/api/contracts";

import {
  commandIntentForPlan,
  type BoardPlan,
} from "./plan-catalog";

export type TurnClient = Readonly<{
  submitCommand(runId: string, command: CommandIntent): Promise<CommandResponseWire>;
}>;

export type BoardTurnCommitResult =
  | Readonly<{
      kind: "completed";
      opening: RunViewWire;
      run: RunViewWire;
      planApplied: boolean;
      aiDirector: Exclude<
        CommandResponseWire["result"]["aiDirector"],
        undefined
      >;
      monthlyExplanation: NonNullable<
        CommandResponseWire["result"]["monthlyExplanation"]
      > | null;
    }>
  | Readonly<{ kind: "plan_failed"; run: RunViewWire; error: unknown }>
  | Readonly<{
      kind: "month_failed";
      run: RunViewWire;
      planApplied: boolean;
      error: unknown;
    }>;

export type BoardTurnFailurePhase = "plan" | "month";

export function boardMonthRecoveryMessage(planApplied: boolean): string {
  return planApplied
    ? "Your plan was saved, but the month did not advance."
    : "The month did not advance.";
}

export type BoardTurnRecoveryResult =
  | Readonly<{
      kind: "completed";
      attribution: "selected_plan" | "external_update";
      opening: RunViewWire;
      run: RunViewWire;
    }>
  | Readonly<{ kind: "planning"; run: RunViewWire; error: unknown }>
  | Readonly<{ kind: "finish_month"; run: RunViewWire; error: unknown }>
  | Readonly<{
      kind: "refresh_failed";
      run: RunViewWire;
      error: unknown;
      refreshError: unknown;
    }>;

export function boardRecoveryPlanLabel(
  recovery: BoardTurnRecoveryResult,
  selectedPlanLabel: string,
): string {
  return recovery.kind === "completed" && recovery.attribution === "external_update"
    ? "Board refreshed"
    : selectedPlanLabel;
}

type RecoverBoardTurnFailureInput = Readonly<{
  phase: BoardTurnFailurePhase;
  error: unknown;
  opening: RunViewWire;
  failedRun: RunViewWire;
  getSession: () => Promise<Readonly<{
    session: Readonly<{ run: RunViewWire }> | null;
  }>>;
}>;

function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

function needsSessionRefresh(error: unknown): boolean {
  const code = errorCode(error);
  return code === null ||
    code === "STALE_REVISION" ||
    code === "INVALID_RESPONSE" ||
    code === "RESPONSE_TOO_LARGE";
}

export async function recoverBoardTurnFailure({
  phase,
  error,
  opening,
  failedRun,
  getSession,
}: RecoverBoardTurnFailureInput): Promise<BoardTurnRecoveryResult> {
  if (!needsSessionRefresh(error)) {
    return phase === "plan"
      ? { kind: "planning", run: failedRun, error }
      : { kind: "finish_month", run: failedRun, error };
  }

  let authoritative: RunViewWire;
  try {
    const { session } = await getSession();
    if (!session) throw new Error("No saved session was found.");
    authoritative = session.run;
  } catch (refreshError) {
    return { kind: "refresh_failed", run: failedRun, error, refreshError };
  }

  if (authoritative.currentMonth > opening.currentMonth) {
    return {
      kind: "completed",
      attribution: phase === "plan" ? "external_update" : "selected_plan",
      opening,
      run: authoritative,
    };
  }
  if (phase === "month") {
    return { kind: "finish_month", run: authoritative, error };
  }
  if (errorCode(error) === "STALE_REVISION") {
    return { kind: "planning", run: authoritative, error };
  }
  if (authoritative.revision > failedRun.revision) {
    return { kind: "finish_month", run: authoritative, error };
  }
  return { kind: "planning", run: authoritative, error };
}

type FinishBoardMonthAfterRefreshInput = Readonly<{
  client: TurnClient & Readonly<{
    getSession: RecoverBoardTurnFailureInput["getSession"];
  }>;
  opening: RunViewWire;
  failedRun: RunViewWire;
  error: unknown;
  commandId: string;
}>;

export async function finishBoardMonthAfterRefresh({
  client,
  opening,
  failedRun,
  error,
  commandId,
}: FinishBoardMonthAfterRefreshInput): Promise<BoardTurnRecoveryResult> {
  const recovery = await recoverBoardTurnFailure({
    phase: "month",
    error,
    opening,
    failedRun,
    getSession: () => client.getSession(),
  });
  if (recovery.kind !== "finish_month") return recovery;

  try {
    const response = await client.submitCommand(recovery.run.runId, {
      id: commandId,
      expectedRevision: recovery.run.revision,
      effectiveMonth: recovery.run.currentMonth,
      type: "process_month",
      payload: {},
    });
    return {
      kind: "completed",
      attribution: "selected_plan",
      opening,
      run: response.run,
    };
  } catch (monthError) {
    return recoverBoardTurnFailure({
      phase: "month",
      error: monthError,
      opening,
      failedRun: recovery.run,
      getSession: () => client.getSession(),
    });
  }
}

type CommitBoardTurnInput = Readonly<{
  client: TurnClient;
  opening: RunViewWire;
  plan: BoardPlan;
  createId: (phase: "plan" | "month") => string;
}>;

export async function commitBoardTurn({
  client,
  opening,
  plan,
  createId,
}: CommitBoardTurnInput): Promise<BoardTurnCommitResult> {
  const planCommand = plan.command.type === "none"
    ? null
    : commandIntentForPlan(opening, plan, createId("plan"));
  let run = opening;
  const planApplied = planCommand !== null;

  if (planCommand !== null) {
    try {
      run = (await client.submitCommand(opening.runId, planCommand)).run;
    } catch (error) {
      return { kind: "plan_failed", run: opening, error };
    }
  }

  try {
    const response = await client.submitCommand(run.runId, {
      id: createId("month"),
      expectedRevision: run.revision,
      effectiveMonth: run.currentMonth,
      type: "process_month",
      payload: {},
    });
    return {
      kind: "completed",
      opening,
      run: response.run,
      planApplied,
      aiDirector: response.result.aiDirector ?? null,
      monthlyExplanation: response.result.monthlyExplanation ?? null,
    };
  } catch (error) {
    return { kind: "month_failed", run, planApplied, error };
  }
}
