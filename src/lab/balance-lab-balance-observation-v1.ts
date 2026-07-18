import type { GameStateV2 } from "../core/game-state-v2";
import { assessPreparednessV1, type PreparednessAssessmentV1 } from "../core/preparedness-assessment-v1";
import { analyzeRiskV1 } from "../core/risk-v1";
import {
  assessRuntimeBalanceChallengeV1,
  type RuntimeBalanceChallengeAssessmentV1,
  type RuntimeBalanceChallengeLimitsV1,
} from "../core/runtime-balance-challenge-v1";
import type { RuntimeBalanceDifficultyV2 } from "../core/runtime-balance-policy-v2";

export const BALANCE_LAB_BALANCE_OBSERVATION_V1_VERSION =
  "balance-lab-balance-observation-v1" as const;

type BalanceLabCandidateImpactEvidenceV1 = Readonly<{
  burnMonthsPpm: number;
  negativeCashFlowDurationMonths: number;
  recoveryTimeMonths: number;
}>;

export type BalanceLabRuntimeDecisionEvidenceV1 = Readonly<{
  difficulty: RuntimeBalanceDifficultyV2;
  impactBands: RuntimeBalanceChallengeLimitsV1;
  candidates: readonly Readonly<{
    templateId: string;
    templateVersion: number;
    rank: number;
    evaluated: boolean;
    rejectionCodes: readonly string[];
    impactScorePpm?: number;
    impact?: BalanceLabCandidateImpactEvidenceV1;
  }>[];
  approved?: Readonly<{
    templateId: string;
    templateVersion: number;
  }>;
}>;

export type BalanceLabBalanceObservationRecordV1 = Readonly<{
  turn: Readonly<{
    runtimeBalanceDecision?: BalanceLabRuntimeDecisionEvidenceV1;
  }>;
}>;

export type BalanceLabCandidateChallengeObservationV1 = Readonly<{
  templateId: string;
  templateVersion: number;
  rank: number;
  rejectionCodes: readonly string[];
  assessment: RuntimeBalanceChallengeAssessmentV1;
}>;

export type BalanceLabBalanceObservationV1 = Readonly<{
  version: typeof BALANCE_LAB_BALANCE_OBSERVATION_V1_VERSION;
  monthIndex: number;
  stage: "opening" | "monthly";
  month: GameStateV2["currentMonth"];
  difficulty: RuntimeBalanceDifficultyV2;
  preparedness: PreparednessAssessmentV1;
  candidateChallenges: readonly BalanceLabCandidateChallengeObservationV1[];
  approvedChallenge: BalanceLabCandidateChallengeObservationV1 | null;
}>;

function runtimeDifficulty(state: GameStateV2): RuntimeBalanceDifficultyV2 {
  return state.gameplay.runtimeBalance?.version === 2
    ? state.gameplay.runtimeBalance.difficulty
    : "normal";
}

export function observeBalanceLabMonthV1(
  state: GameStateV2,
  record: BalanceLabBalanceObservationRecordV1 | undefined,
  monthIndex: number,
): BalanceLabBalanceObservationV1 {
  if (!Number.isSafeInteger(monthIndex) || monthIndex < -1) {
    throw new RangeError("balance observation month index must be -1 or a non-negative safe integer");
  }
  if ((record === undefined) !== (monthIndex === -1)) {
    throw new RangeError("opening observations require index -1 and monthly observations require a record");
  }
  const preparedness = assessPreparednessV1(analyzeRiskV1(state));
  const decision = record?.turn.runtimeBalanceDecision;
  const candidateChallenges = Object.freeze(
    (decision?.candidates ?? []).flatMap((candidate) => {
      if (
        !candidate.evaluated ||
        candidate.impactScorePpm === undefined ||
        candidate.impact === undefined
      ) {
        return [];
      }
      return [Object.freeze({
        templateId: candidate.templateId,
        templateVersion: candidate.templateVersion,
        rank: candidate.rank,
        rejectionCodes: Object.freeze([...candidate.rejectionCodes]),
        assessment: assessRuntimeBalanceChallengeV1(
          {
            impactScorePpm: candidate.impactScorePpm,
            burnMonthsPpm: candidate.impact.burnMonthsPpm,
            negativeCashFlowDurationMonths:
              candidate.impact.negativeCashFlowDurationMonths,
            recoveryTimeMonths: candidate.impact.recoveryTimeMonths,
          },
          decision!.impactBands,
        ),
      })];
    }),
  );
  const approved = decision?.approved;
  const approvedChallenge = approved === undefined
    ? null
    : candidateChallenges.find(
        (candidate) =>
          candidate.templateId === approved.templateId &&
          candidate.templateVersion === approved.templateVersion,
      ) ?? null;

  return Object.freeze({
    version: BALANCE_LAB_BALANCE_OBSERVATION_V1_VERSION,
    monthIndex,
    stage: monthIndex === -1 ? "opening" : "monthly",
    month: state.currentMonth,
    difficulty: decision?.difficulty ?? runtimeDifficulty(state),
    preparedness,
    candidateChallenges,
    approvedChallenge,
  });
}
