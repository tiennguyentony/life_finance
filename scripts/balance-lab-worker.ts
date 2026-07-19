import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parentPort, workerData } from "node:worker_threads";

import type { PersonalEventTemplateV2 } from "../src/core/personal-event-v2";
import { createBalanceLabPersonaStateV1 } from "../src/data/balance-lab-personas-v1";
import type { BalanceLabRunSpecV1 } from "../src/lab/balance-lab-v1-contracts";
import { createBalanceLabProductionOwnersV1 } from "../src/lab/balance-lab-v1-production";
import { runOfflineBalanceLabV1 } from "../src/lab/balance-lab-v1-runner";
import { createPinnedQuickTaxEvidenceSourceV1 } from "../src/lab/balance-lab-v1-tax-evidence";

type WorkerInput = Readonly<{
  spec: BalanceLabRunSpecV1;
  eventCatalog: readonly PersonalEventTemplateV2[];
}>;

if (parentPort === null) throw new Error("balance lab worker requires a parent port");
const input = workerData as WorkerInput;
const fixture = JSON.parse(readFileSync(
  join(process.cwd(), "src", "lab", "fixtures", "quick-tax-evidence-v1.json"),
  "utf8",
));
const owners = createBalanceLabProductionOwnersV1({
  createPersonaState: createBalanceLabPersonaStateV1,
  taxEvidence: createPinnedQuickTaxEvidenceSourceV1(fixture),
  personalEventCatalog: input.eventCatalog,
});

parentPort.postMessage(runOfflineBalanceLabV1(input.spec, owners));
