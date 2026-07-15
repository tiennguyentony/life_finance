import { randomUUID } from "node:crypto";

import type { QueueAiWorldEventV2Command } from "../../core/ai-world-event-v2";
import { sha256Canonical } from "../../core/canonical";
import { ratePpm } from "../../core/domain/money";
import { simulationMonth } from "../../core/domain/month";
import {
  demonstratedWeaknessesV2,
  eligiblePersonalEventTemplatesV2,
} from "../../core/event-scheduler-v2";
import type { EventWeakness } from "../../core/events";
import type { GameStateV2 } from "../../core/game-state-v2";
import type { V2Repository } from "../api/v2/repository-port";
import type { AiRoleClient } from "./client";
import { AI_CONTRACT_VERSION, type HostileFedResponse } from "./contracts";
import type { AiEvidenceFact } from "./game-context-types";
import {
  aiWorldEventApiResponseSchema,
  type AiWorldEventApiRequest,
  type AiWorldEventApiResponse,
} from "./world-director-contracts";

export class AiWorldDirectorError extends Error {
  readonly code: "STALE_REVISION" | "WORLD_EVENT_NOT_READY";

  constructor(code: AiWorldDirectorError["code"], message: string) {
    super(message);
    this.name = "AiWorldDirectorError";
    this.code = code;
  }
}

type ClientFactory = (runId: string) => Pick<AiRoleClient, "generate"> &
  Partial<Pick<AiRoleClient, "responseSource">>;

function clampRate(value: number): number {
  return Math.max(0, Math.min(1_000_000, Math.round(value)));
}

function weaknessSignal(
  state: GameStateV2,
  weakness: EventWeakness,
): Readonly<{ severityPpm: number; evidence: readonly AiEvidenceFact[] }> {
  const exposure = state.gameplay.exposure.current!;
  const values: Record<EventWeakness, number> = {
    low_emergency_fund: clampRate(1_000_000 - exposure.emergencyFundMonthsPpm / 3),
    high_credit_utilization: clampRate(exposure.revolvingDebtPpm),
    job_portfolio_correlation: clampRate(exposure.jobInvestmentCorrelationPpm ?? 0),
    portfolio_concentration: clampRate(exposure.portfolioConcentrationPpm),
    uninsured_property: clampRate(exposure.insuranceGapPpm ?? 0),
    high_fixed_costs: clampRate(exposure.debtToIncomePpm ?? 0),
    lifestyle_fragility: clampRate(
      state.gameplay.employment.annualGrossSalaryCents
        ? state.finances.annualLivingCostCents * 1_000_000 /
            state.gameplay.employment.annualGrossSalaryCents
        : 1_000_000,
    ),
    market_timing: clampRate(
      state.finances.retirementCents + state.finances.taxableInvestmentsCents > 0
        ? state.gameplay.portfolio.taxableSpeculativeCents * 1_000_000 /
            (state.finances.retirementCents + state.finances.taxableInvestmentsCents)
        : 0,
    ),
  };
  return Object.freeze({
    severityPpm: values[weakness],
    evidence: Object.freeze([Object.freeze({
      id: `weakness.${weakness}`,
      label: weakness.replaceAll("_", " "),
      value: `${values[weakness]} ppm severity from deterministic exposure metrics`,
    })]),
  });
}

function fallbackSelection(
  candidates: ReturnType<typeof eligiblePersonalEventTemplatesV2>,
  weaknesses: readonly ReturnType<typeof buildWeaknesses>[number][],
): HostileFedResponse {
  const strongest = [...weaknesses].toSorted((left, right) =>
    right.severityPpm - left.severityPpm || left.id.localeCompare(right.id),
  )[0]!;
  const candidate = candidates.find(({ targetsWeaknesses }) => targetsWeaknesses.includes(strongest.id)) ?? candidates[0]!;
  const targeted = candidate.targetsWeaknesses.find((id) => weaknesses.some((weakness) => weakness.id === id))!;
  return {
    templateId: candidate.id,
    templateVersion: candidate.version,
    targetedWeaknessId: targeted,
    parameters: Object.fromEntries(candidate.parameters.map((parameter) => [
      parameter.id,
      Math.round((parameter.minimum + parameter.maximum) / 2),
    ])),
    headline: "Your financial plan meets a real-life stress test",
    narrative: `A bounded ${candidate.tier} event now tests ${targeted.replaceAll("_", " ")}. Choose how to respond before time advances.`,
    rationale: `Selected the strongest demonstrated weakness using deterministic exposure evidence and engine-owned event bounds.`,
    citedEvidenceIds: [`weakness.${targeted}`],
  };
}

function buildWeaknesses(state: GameStateV2) {
  return [...demonstratedWeaknessesV2(state)].map((id) => ({ id, ...weaknessSignal(state, id) }));
}

export class AiWorldDirectorService {
  constructor(
    private readonly repository: V2Repository,
    private readonly clientFactory: ClientFactory,
    private readonly idFactory: () => string = randomUUID,
  ) {}

  async createEvent(runId: string, accessSecret: string, request: AiWorldEventApiRequest): Promise<AiWorldEventApiResponse> {
    const state = await this.repository.loadAuthorizedRunV2(runId, accessSecret);
    if (state.revision !== request.expectedRevision) throw new AiWorldDirectorError("STALE_REVISION", "run changed before world direction started");
    const candidates = eligiblePersonalEventTemplatesV2(state);
    const weaknesses = buildWeaknesses(state);
    if (!state.gameplay.exposure.current || candidates.length === 0 || weaknesses.length === 0) {
      throw new AiWorldDirectorError("WORLD_EVENT_NOT_READY", "process at least one month and demonstrate an eligible financial weakness first");
    }
    let source: AiWorldEventApiResponse["source"] = "deterministic_fallback";
    let selected = fallbackSelection(candidates, weaknesses);
    try {
      const client = this.clientFactory(runId);
      selected = await client.generate<"hostile_fed">({
        contractVersion: AI_CONTRACT_VERSION,
        privacyNoticeVersion: request.privacyNoticeVersion,
        dataUseAccepted: request.dataUseAccepted,
        role: "hostile_fed",
        simulationMonth: state.currentMonth,
        marketRegime: state.marketRegime,
        weaknesses: weaknesses.map((weakness) => ({ ...weakness, severityPpm: ratePpm(weakness.severityPpm), evidence: [...weakness.evidence] })),
        candidates: candidates.map((candidate) => ({
          templateId: candidate.id,
          templateVersion: candidate.version,
          tier: candidate.tier,
          teachingPrinciple: candidate.teachingPrinciple,
          targetsWeaknesses: [...candidate.targetsWeaknesses],
          parameters: candidate.parameters.map(({ id, minimum, maximum }) => ({ id, minimum, maximum })),
        })),
      });
      source = client.responseSource?.() ?? "openai";
    } catch {
      // The same engine-owned candidates and midpoint parameters provide a safe fallback.
    }
    const command: QueueAiWorldEventV2Command = {
      schemaVersion: 2,
      id: `ai.world.${this.idFactory()}`,
      type: "queue_ai_world_event_v2",
      expectedRevision: state.revision,
      effectiveMonth: simulationMonth(state.currentMonth),
      payload: {
        source,
        ...selected,
        targetedWeaknessId: selected.targetedWeaknessId as EventWeakness,
      },
    };
    const applied = await this.repository.applyCommandV2(runId, accessSecret, command);
    const pending = applied.state.gameplay.eventLifecycle.pending!;
    return aiWorldEventApiResponseSchema.parse({
      source,
      eventId: pending.eventId,
      memory: {
        targetedWeaknessId: selected.targetedWeaknessId,
        rationale: selected.rationale,
        citedEvidenceIds: selected.citedEvidenceIds,
      },
      state: applied.state,
      stateChecksum: sha256Canonical(applied.state),
    });
  }
}
