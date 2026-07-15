import type { RunRepository } from "../../db/run-repository";

export type V2Repository = Pick<
  RunRepository,
  | "createRunV2"
  | "loadAuthorizedRunV2"
  | "applyCommandV2"
  | "loadMonthlyTaxEvidenceForCommand"
  | "loadMonthlyTaxEvidenceForContext"
  | "loadCheckpointEvidenceV2"
>;

export type AuthorizedV2State = Awaited<
  ReturnType<V2Repository["loadAuthorizedRunV2"]>
>;
