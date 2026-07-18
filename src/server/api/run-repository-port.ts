import type { RunRepository } from "../db/run-repository";
import type {
  AppliedTimeAdvanceV2,
  PreparedTimeAdvanceV2,
} from "../db/run-repository-contracts";

export type V2Repository = Pick<
  RunRepository,
  | "createRunV2"
  | "loadAuthorizedRunV2"
  | "loadAcceptedMonthlyCommandV2"
  | "applyCommandV2"
  | "loadMonthlyTaxEvidenceForCommand"
  | "loadMonthlyTaxEvidenceForContext"
  | "loadCheckpointEvidenceV2"
  | "migrateRunStateToV2"
> &
  Readonly<{
    loadAcceptedTimeAdvanceV2?: (
      runId: string,
      accessSecret: string,
      batchId: string,
      requestFingerprint: string,
    ) => Promise<AppliedTimeAdvanceV2 | null>;
    loadAcceptedCommandV2?: RunRepository["loadAcceptedCommandV2"];
    loadCausalHistoryV1?: RunRepository["loadCausalHistoryV1"];
    runCounterfactualV1?: RunRepository["runCounterfactualV1"];
    previewPlayerPolicyCommandV2?:
      RunRepository["previewPlayerPolicyCommandV2"];
    applyTimeAdvanceV2?: (
      runId: string,
      accessSecret: string,
      prepared: PreparedTimeAdvanceV2,
    ) => Promise<AppliedTimeAdvanceV2>;
  }>;

export type AuthorizedV2State = Awaited<
  ReturnType<V2Repository["loadAuthorizedRunV2"]>
>;
