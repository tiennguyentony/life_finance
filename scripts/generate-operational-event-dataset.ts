import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { moneyCents, ratePpm } from "../src/core/domain/money";
import type { GameStateV2 } from "../src/core/game-state-v2";
import {
  extractOperationalEventFeaturesV1,
  OPERATIONAL_EVENT_FEATURE_NAMES_V1,
  scoreOperationalEventTrainingLabelV1,
} from "../src/core/operational-event-ranker-v1";
import { analyzeRiskV1 } from "../src/core/risk-v1";
import { prepareRuntimeBalanceCandidatesV2 } from "../src/core/runtime-balance-controller-v2";
import { scenarioDirectorTagsForCandidateV2 } from "../src/core/scenario-director-context-v2";
import { SCENARIO_DIRECTOR_V2_VERSION } from "../src/core/scenario-director-policy-v2";
import { createBalanceLabPersonaStateV1, BALANCE_LAB_PERSONA_IDS_V1 } from "../src/data/balance-lab-personas-v1";
import {
  ACTIVE_PERSONAL_EVENT_TEMPLATES_V2,
  PERSONAL_EVENT_TEMPLATES_V2,
} from "../src/data/personal-event-templates-v2";

const difficulties = ["guided", "normal", "hard"] as const;
const parameterProfiles = ["low", "middle", "high"] as const;
const outputPath = resolve(process.argv[2] ?? ".ml-dist/event-ranker/training-v1.jsonl");

function unitInterval(key: string): number {
  const prefix = createHash("sha256").update(key).digest().readUInt32BE(0);
  return prefix / 0xffff_ffff;
}

function parameterValue(
  minimum: number,
  maximum: number,
  profile: (typeof parameterProfiles)[number],
  key: string,
): number {
  const base = profile === "low" ? 0.15 : profile === "middle" ? 0.5 : 0.85;
  const jittered = Math.max(0, Math.min(1, base + (unitInterval(key) - 0.5) * 0.2));
  return Math.round(minimum + (maximum - minimum) * jittered);
}

const rows: string[] = [];
let queryCount = 0;
for (const personaId of BALANCE_LAB_PERSONA_IDS_V1) {
  for (const difficulty of difficulties) {
    for (let matchedSeed = 1; matchedSeed <= 24; matchedSeed += 1) {
      for (const parameterProfile of parameterProfiles) {
        const opening = createBalanceLabPersonaStateV1({
          personaId,
          matchedSeed,
          difficulty,
        });
        const balance = opening.gameplay.runtimeBalance;
        if (balance?.version !== 2) throw new Error("training state requires Runtime Balance v2");
        const state = {
          ...opening,
          gameplay: {
            ...opening.gameplay,
            runtimeBalance: { ...balance, pressureUnits: 100 },
          },
        } as GameStateV2;
        const offset = (
          matchedSeed +
          BALANCE_LAB_PERSONA_IDS_V1.indexOf(personaId) * 7 +
          difficulties.indexOf(difficulty) * 11 +
          parameterProfiles.indexOf(parameterProfile) * 5
        ) % ACTIVE_PERSONAL_EVENT_TEMPLATES_V2.length;
        const rotatedTemplates = [
          ...ACTIVE_PERSONAL_EVENT_TEMPLATES_V2.slice(offset),
          ...ACTIVE_PERSONAL_EVENT_TEMPLATES_V2.slice(0, offset),
        ];
        const candidates = rotatedTemplates.map((template) => ({
          template,
          targetedWeakness: "unrelated_hazard" as const,
        }));
        const prepared = prepareRuntimeBalanceCandidatesV2(state, candidates, {
          eventCatalog: PERSONAL_EVENT_TEMPLATES_V2,
          liquidationCostRatePpm: ratePpm(10_000),
          monthlyCashFlowEvidence: {
            monthlyCashInflowCents: moneyCents(1_000_000),
            requiredCashCents: state.finances.requiredObligationsCents,
          },
          parameterSampler: (template) => Object.fromEntries(
            template.parameters.map((parameter) => [
              parameter.id,
              parameterValue(
                parameter.minimum,
                parameter.maximum,
                parameterProfile,
                `${personaId}|${difficulty}|${matchedSeed}|${template.id}|${parameter.id}`,
              ),
            ]),
          ),
        });
        const safe = prepared.filter(
          ({ impact, rejectionCodes }) => impact !== null && rejectionCodes.length === 0,
        );
        if (safe.length < 2) continue;
        const riskSnapshot = analyzeRiskV1(state);
        const input = {
          version: SCENARIO_DIRECTOR_V2_VERSION,
          month: state.currentMonth,
          riskSnapshot,
          macro: { regime: state.marketRegime, tags: [] },
          candidates: candidates.map(({ template, targetedWeakness }) => ({
            templateId: template.id,
            templateVersion: template.version,
            category: template.category,
            tier: template.severityTier,
            targetedWeakness,
            lessonTags: template.lessonTags,
            directorTags: scenarioDirectorTagsForCandidateV2(template, targetedWeakness),
          })),
          recentDecisions: [],
          recentEvents: [],
          lessonExposureCounts: [],
          difficulty,
        } as const;
        const queryId = `${personaId}|${difficulty}|seed-${matchedSeed}|${parameterProfile}`;
        for (const candidate of safe) {
          const feature = extractOperationalEventFeaturesV1(input, candidate);
          rows.push(JSON.stringify({
            version: "operational-event-training-row-v1",
            queryId,
            group: { personaId, difficulty, matchedSeed, parameterProfile },
            templateId: feature.templateId,
            templateVersion: feature.templateVersion,
            featureVersion: feature.version,
            featureChecksum: feature.checksum,
            values: feature.values,
            utility: scoreOperationalEventTrainingLabelV1(feature),
          }));
        }
        queryCount += 1;
      }
    }
  }
}

mkdirSync(dirname(outputPath), { recursive: true });
const header = JSON.stringify({
  version: "operational-event-training-dataset-v1",
  featureNames: OPERATIONAL_EVENT_FEATURE_NAMES_V1,
  queryCount,
  rowCount: rows.length,
});
writeFileSync(outputPath, `${header}\n${rows.join("\n")}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ outputPath, queryCount, rowCount: rows.length })}\n`);
