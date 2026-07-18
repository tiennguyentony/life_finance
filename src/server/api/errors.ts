export class RunApiV2Error extends Error {
  readonly code:
    | "STALE_REVISION"
    | "INVALID_EFFECTIVE_MONTH"
    | "RUN_TERMINAL"
    | "RUN_NOT_ACTIVE"
    | "PENDING_EVENT"
    | "TAX_CONTEXT_MISMATCH"
    | "TAX_RESULT_UNUSABLE";

  constructor(code: RunApiV2Error["code"], message: string) {
    super(message);
    this.name = "RunApiV2Error";
    this.code = code;
  }
}
