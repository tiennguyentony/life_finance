import type {
  CharacterBanterRequest,
  CharacterBanterResponse,
  RunViewWire,
} from "@/contracts/api/contracts";
import {
  CHARACTER_BANTER_IDS,
  type CharacterBanterId,
  type CharacterBanterTone,
} from "@/core/character-banter";
import type { BoardMonthResult } from "@/features/board/board-model";

export type CharacterBanter = Readonly<{
  id: string;
  characterId: CharacterBanterId;
  characterName: string;
  characterSrc: string;
  message: string;
  citedEvidenceId: string;
  tone: CharacterBanterTone;
}>;

export type CharacterBanterHistoryEntry = Readonly<{
  characterId: CharacterBanterId;
  citedEvidenceId: string;
  message: string;
}>;

const CHARACTER_PRESENTATION: Readonly<Record<
  CharacterBanterId,
  Readonly<{ name: string; src: string }>
>> = Object.freeze({
  sprout: {
    name: "Sprout",
    src: "/assets/characters/sprout/reference/sprout-money.png",
  },
  debtzilla: {
    name: "Debtzilla",
    src: "/assets/characters/debtzilla/debtzilla-bills.png",
  },
  inflato: {
    name: "Inflato",
    src: "/assets/characters/inflato/inflato-shopping.png",
  },
  impulso: {
    name: "Impulso",
    src: "/assets/characters/impulso/impulso-receipt.png",
  },
  bengo: {
    name: "Bengo",
    src: "/assets/characters/bengo/bengo-magic.png",
  },
  buddi: {
    name: "Buddi",
    src: "/assets/characters/buddi/buddi-heart.png",
  },
  lucky_cat: {
    name: "Lucky Cat",
    src: "/assets/characters/luckycat/luckycat-tax.png",
  },
});

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function monthOrdinal(month: string): number | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/u.exec(month);
  if (!match) return null;
  return Number(match[1]) * 12 + Number(match[2]) - 1;
}

export function isCharacterBanterMonth(run: RunViewWire): boolean {
  const start = monthOrdinal(run.startMonth);
  const current = monthOrdinal(run.currentMonth);
  if (start === null || current === null) return false;
  const elapsed = current - start;
  if (elapsed < 1) return false;
  // Two appearances per three months gives the cast frequent screen time but
  // preserves a quiet month between bursts. The run-specific phase keeps
  // different players from receiving the exact same sequence.
  const quietPhase = stableHash(`${run.runId}.ai-banter.phase`) % 3;
  return elapsed % 3 !== quietPhase;
}

const BANTER_HISTORY_VERSION = 1;
const BANTER_HISTORY_LIMIT = 8;

function historyKey(runId: string): string {
  return `life-finance:banter:v${BANTER_HISTORY_VERSION}:${runId}`;
}

function isHistoryEntry(value: unknown): value is CharacterBanterHistoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<CharacterBanterHistoryEntry>;
  return (
    typeof candidate.characterId === "string" &&
    CHARACTER_BANTER_IDS.some((id) => id === candidate.characterId) &&
    typeof candidate.citedEvidenceId === "string" &&
    /^[a-z0-9][a-z0-9._-]{0,127}$/u.test(candidate.citedEvidenceId) &&
    typeof candidate.message === "string" &&
    candidate.message.trim().length > 0 &&
    candidate.message.length <= 240
  );
}

export function loadCharacterBanterHistory(
  runId: string,
  storage: Pick<Storage, "getItem"> = window.localStorage,
): readonly CharacterBanterHistoryEntry[] {
  try {
    const decoded: unknown = JSON.parse(storage.getItem(historyKey(runId)) ?? "[]");
    if (!Array.isArray(decoded)) return [];
    return Object.freeze(decoded.filter(isHistoryEntry).slice(-BANTER_HISTORY_LIMIT));
  } catch {
    return [];
  }
}

export function saveCharacterBanterHistory(
  runId: string,
  history: readonly CharacterBanterHistoryEntry[],
  storage: Pick<Storage, "setItem"> = window.localStorage,
): void {
  try {
    storage.setItem(
      historyKey(runId),
      JSON.stringify(history.filter(isHistoryEntry).slice(-BANTER_HISTORY_LIMIT)),
    );
  } catch {
    // Browser storage is only an anti-repetition aid; gameplay never depends on it.
  }
}

function money(cents: number): string {
  return `$${(Math.abs(cents) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function points(ppm: number): string {
  return `${Math.abs(ppm / 10_000).toFixed(1)} points`;
}

function direction(change: number): "increased" | "decreased" {
  return change > 0 ? "increased" : "decreased";
}

export function characterBanterRequestForMonth(
  run: RunViewWire,
  result: BoardMonthResult,
  recentReactions: readonly CharacterBanterHistoryEntry[],
  variationSeed: number,
): CharacterBanterRequest | null {
  if (
    run.status !== "active" ||
    run.pendingInteraction.kind === "event" ||
    !isCharacterBanterMonth(run)
  ) {
    return null;
  }

  const evidence: CharacterBanterRequest["evidence"] = [
    ...(result.cashChangeCents === 0 ? [] : [
      { id: "cash_change", label: `Cash ${direction(result.cashChangeCents)} this month`, value: money(result.cashChangeCents) },
    ]),
    ...(result.netWorthChangeCents === 0 ? [] : [
      { id: "net_worth_change", label: `Net worth ${direction(result.netWorthChangeCents)} this month`, value: money(result.netWorthChangeCents) },
    ]),
    ...(result.debtChangeCents === 0 ? [] : [
      { id: "debt_change", label: `Debt ${direction(result.debtChangeCents)} this month`, value: money(result.debtChangeCents) },
    ]),
    ...(result.riskSeverityChangePpm === 0 ? [] : [
      { id: "risk_change", label: `Financial risk ${direction(result.riskSeverityChangePpm)} this month`, value: points(result.riskSeverityChangePpm) },
    ]),
    ...(result.preparednessScoreChangePpm === 0 ? [] : [
      { id: "preparedness_change", label: `Preparedness ${direction(result.preparednessScoreChangePpm)} this month`, value: points(result.preparednessScoreChangePpm) },
    ]),
    ...(result.taxableInvestmentsChangeCents === 0 ? [] : [{
      id: "taxable_investment_change",
      label: `Taxable investments ${direction(result.taxableInvestmentsChangeCents)} this month`,
      value: money(result.taxableInvestmentsChangeCents),
    }]),
    ...(result.annualLivingCostChangeCents === 0 ? [] : [{
      id: "annual_living_cost_change",
      label: `Annual living costs ${direction(result.annualLivingCostChangeCents)}`,
      value: money(result.annualLivingCostChangeCents),
    }]),
    ...(result.annualGrossSalaryChangeCents === 0 ? [] : [{
      id: "annual_salary_change",
      label: `Annual salary ${direction(result.annualGrossSalaryChangeCents)}`,
      value: money(result.annualGrossSalaryChangeCents),
    }]),
    ...((result.monthlyExplanation?.totalTaxCents ?? 0) === 0 ? [] : [{
      id: "monthly_tax",
      label: "Tax withheld from income this month",
      value: money(result.monthlyExplanation?.totalTaxCents ?? 0),
    }]),
    ...((result.monthlyExplanation?.debtInterestCents ?? 0) === 0 ? [] : [{
      id: "debt_interest",
      label: "Debt interest charged this month",
      value: money(result.monthlyExplanation?.debtInterestCents ?? 0),
    }]),
  ];
  if (evidence.length === 0) {
    evidence.push({
      id: "selected_plan",
      label: "Plan used this month",
      value: result.planLabel,
    });
  }

  return {
    expectedRevision: run.revision,
    simulationMonth: run.currentMonth,
    planLabel: result.planLabel,
    variationSeed,
    evidence: evidence.slice(0, 12),
    recentLines: recentReactions.slice(-BANTER_HISTORY_LIMIT).map(({ message }) => message),
    recentEvidenceIds: recentReactions
      .slice(-BANTER_HISTORY_LIMIT)
      .map(({ citedEvidenceId }) => citedEvidenceId),
    recentCharacterIds: recentReactions
      .slice(-BANTER_HISTORY_LIMIT)
      .map(({ characterId }) => characterId),
  };
}

export function characterBanterFromResponse(
  response: CharacterBanterResponse,
  month: string,
): CharacterBanter | null {
  if (response.status !== "generated") return null;
  const presentation = CHARACTER_PRESENTATION[response.characterId];
  return Object.freeze({
    id: `banter.${month}.${response.characterId}.${stableHash(response.message)}`,
    characterId: response.characterId,
    characterName: presentation.name,
    characterSrc: presentation.src,
    message: response.message,
    citedEvidenceId: response.citedEvidenceId,
    tone: response.tone,
  });
}
