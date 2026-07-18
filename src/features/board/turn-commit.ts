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
    }>
  | Readonly<{ kind: "plan_failed"; run: RunViewWire; error: unknown }>
  | Readonly<{
      kind: "month_failed";
      run: RunViewWire;
      planApplied: boolean;
      error: unknown;
    }>;

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
      type: "process_month",
      payload: {},
    });
    return { kind: "completed", opening, run: response.run, planApplied };
  } catch (error) {
    return { kind: "month_failed", run, planApplied, error };
  }
}
