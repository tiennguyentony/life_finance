import type {
  PlayerPolicyPreviewV2Request,
  PlayerPolicyPreviewV2Response,
} from "@/server/api/contracts-v2";

export type PolicyPreviewSession = Readonly<{
  command: PlayerPolicyPreviewV2Request;
  response: PlayerPolicyPreviewV2Response;
  activityMessage: string;
}>;

export function createPolicyPreviewSession(
  command: PlayerPolicyPreviewV2Request,
  response: PlayerPolicyPreviewV2Response,
  activityMessage: string,
): PolicyPreviewSession {
  return { command, response, activityMessage };
}

export function invalidatePolicyPreview(
  session: PolicyPreviewSession | null,
): null {
  void session;
  return null;
}

export function isCurrentPolicyPreviewGeneration(
  requestedGeneration: number,
  currentGeneration: number,
): boolean {
  return (
    Number.isSafeInteger(requestedGeneration) &&
    requestedGeneration >= 0 &&
    requestedGeneration === currentGeneration
  );
}

export function approvedPolicyCommand(
  session: PolicyPreviewSession | null,
  currentRevision: number,
  currentMonth: string,
): PlayerPolicyPreviewV2Request | null {
  if (
    !session ||
    session.command.expectedRevision !== currentRevision ||
    session.command.effectiveMonth !== currentMonth
  ) {
    return null;
  }
  return session.command;
}
