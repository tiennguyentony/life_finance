import {
  commandIntentSchema,
  type CommandIntent,
} from "@/contracts/api/contracts";
import {
  gameCommandV2PublicSchema,
  type CommandV2Response,
  type GameCommandV2Public,
  type GetRunV2Response,
} from "@/server/api/contracts-v2";

import { projectRunView, type RunView } from "./run-view";

export type RunReader = Readonly<{
  getRun(runId: string, accessSecret: string): Promise<GetRunV2Response>;
}>;

export type CommandRunner = RunReader &
  Readonly<{
    submitCommand(
      runId: string,
      accessSecret: string,
      command: GameCommandV2Public,
    ): Promise<CommandV2Response>;
  }>;

export type RunViewResponse = Readonly<{
  run: RunView;
  stateChecksum: string;
}>;

export async function getRun(
  service: RunReader,
  runId: string,
  accessSecret: string,
): Promise<RunViewResponse> {
  const result = await service.getRun(runId, accessSecret);
  return Object.freeze({
    run: projectRunView(result.state),
    stateChecksum: result.stateChecksum,
  });
}

export async function submitCommand(
  service: CommandRunner,
  runId: string,
  accessSecret: string,
  input: CommandIntent,
): Promise<
  RunViewResponse &
    Readonly<{
      result: Readonly<{
        idempotentReplay: boolean;
        aiDirector: CommandResponseAiDirector;
      }>;
    }>
> {
  const intent = commandIntentSchema.parse(input);
  const current = intent.effectiveMonth
    ? null
    : await service.getRun(runId, accessSecret);
  const command = gameCommandV2PublicSchema.parse({
    ...intent,
    schemaVersion: 2,
    effectiveMonth: intent.effectiveMonth ?? current?.state.currentMonth,
  });
  const applied = await service.submitCommand(runId, accessSecret, command);
  const aiDirector = applied.monthlyRecord !== null &&
      "scenarioDirectorAiEvidence" in applied.monthlyRecord
    ? applied.monthlyRecord.scenarioDirectorAiEvidence ?? null
    : null;
  return Object.freeze({
    run: projectRunView(applied.state),
    stateChecksum: applied.stateChecksum,
    result: Object.freeze({
      idempotentReplay: applied.idempotentReplay,
      aiDirector,
    }),
  });
}

type CommandResponseAiDirector = Readonly<{
  mode: "shadow" | "active";
  source: "openai" | "hosted_oss" | "local_oss" | "deterministic_fallback";
  status: "validated" | "fallback";
  latencyMs: number;
  candidateCount: number;
  topCandidateAgreement: boolean | null;
}> | null;
