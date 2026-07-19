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
        monthlyExplanation: CommandResponseMonthlyExplanation;
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
  const operationalEvidence = applied.monthlyRecord !== null &&
      "operationalEventRankerEvidence" in applied.monthlyRecord
    ? applied.monthlyRecord.operationalEventRankerEvidence ?? null
    : null;
  const legacyAiEvidence = applied.monthlyRecord !== null &&
      "scenarioDirectorAiEvidence" in applied.monthlyRecord
    ? applied.monthlyRecord.scenarioDirectorAiEvidence ?? null
    : null;
  const aiDirector: CommandResponseAiDirector = operationalEvidence === null
    ? legacyAiEvidence
    : Object.freeze({
        mode: "operational" as const,
        source: "self_trained_local" as const,
        status: operationalEvidence.status,
        candidateCount: operationalEvidence.candidateCount,
        artifactChecksum: operationalEvidence.artifactChecksum,
        topCandidateId: operationalEvidence.topCandidateId,
        fallbackReason: operationalEvidence.fallbackReason ?? null,
      });
  const monthlyExplanation: CommandResponseMonthlyExplanation =
    applied.monthlyRecord === null
      ? null
      : Object.freeze({
          processedMonth: applied.monthlyRecord.processedMonth,
          grossIncomeCents: applied.monthlyRecord.grossIncomeCents,
          totalTaxCents: applied.monthlyRecord.totalTaxCents,
          afterTaxCashIncomeCents:
            applied.monthlyRecord.afterTaxCashIncomeCents,
          taxBreakdown: applied.monthlyRecord.taxBreakdown ?? null,
          resolvedIncomeCents:
            "resolvedIncomeCents" in applied.monthlyRecord
              ? applied.monthlyRecord.resolvedIncomeCents
              : 0,
          resolvedExpenseCents:
            "resolvedExpenseCents" in applied.monthlyRecord
              ? applied.monthlyRecord.resolvedExpenseCents
              : 0,
          marketValueChangeCents:
            applied.monthlyRecord.marketValueChangeCents,
          annualInflationIncreaseCents:
            applied.monthlyRecord.annualInflationIncreaseCents,
          insurancePlayerCostCents:
            applied.monthlyRecord.insurancePlayerCostCents,
          requiredCashCents: applied.monthlyRecord.requiredCashCents,
          debtInterestCents:
            applied.monthlyRecord.debtService.totalInterestCents,
          debtPaymentCents:
            applied.monthlyRecord.debtService.totalScheduledPaymentCents,
        });
  return Object.freeze({
    run: projectRunView(applied.state),
    stateChecksum: applied.stateChecksum,
    result: Object.freeze({
      idempotentReplay: applied.idempotentReplay,
      aiDirector,
      monthlyExplanation,
    }),
  });
}

export type CommandResponseMonthlyExplanation = Readonly<{
  processedMonth: string;
  grossIncomeCents: number;
  totalTaxCents: number;
  afterTaxCashIncomeCents: number;
  taxBreakdown: import("@/core/payroll-v2").MonthlyTaxBreakdownV1 | null;
  resolvedIncomeCents: number;
  resolvedExpenseCents: number;
  marketValueChangeCents: number;
  annualInflationIncreaseCents: number;
  insurancePlayerCostCents: number;
  requiredCashCents: number;
  debtInterestCents: number;
  debtPaymentCents: number;
}> | null;

export type CommandResponseAiDirector = Readonly<{
  mode: "shadow" | "active";
  source: "openai" | "hosted_oss" | "local_oss" | "deterministic_fallback";
  status: "validated" | "fallback";
  latencyMs: number;
  candidateCount: number;
  topCandidateAgreement: boolean | null;
}> | Readonly<{
  mode: "operational";
  source: "self_trained_local";
  status: "ranked" | "fallback";
  candidateCount: number;
  artifactChecksum: string;
  topCandidateId: string | null;
  fallbackReason: string | null;
}> | null;
