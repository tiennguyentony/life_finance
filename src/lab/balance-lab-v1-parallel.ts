import { canonicalJson } from "../core/canonical";
import {
  decodeBalanceLabRunSpecV1,
  OfflineBalanceLabV1Error,
  type BalanceLabRunSpecV1,
} from "./balance-lab-v1-contracts";
import {
  assembleOfflineBalanceLabResultV1,
  type OfflineBalanceLabResultV1,
} from "./balance-lab-v1-runner";

export const MAX_BALANCE_LAB_WORKERS_V1 = 8;

export type BalanceLabShardRunnerV1 = (
  spec: BalanceLabRunSpecV1,
) => Promise<OfflineBalanceLabResultV1>;

export async function runOfflineBalanceLabShardsV1(
  unsafeSpec: BalanceLabRunSpecV1,
  requestedWorkers: number,
  runShard: BalanceLabShardRunnerV1,
): Promise<OfflineBalanceLabResultV1> {
  const spec = decodeBalanceLabRunSpecV1(unsafeSpec);
  if (
    !Number.isSafeInteger(requestedWorkers) ||
    requestedWorkers < 1 ||
    requestedWorkers > MAX_BALANCE_LAB_WORKERS_V1
  ) {
    throw new RangeError(
      `balance lab workers must be between 1 and ${MAX_BALANCE_LAB_WORKERS_V1}`,
    );
  }
  const workerCount = Math.min(requestedWorkers, spec.matchedSeeds.length);
  const seedsByWorker = Array.from({ length: workerCount }, () => [] as number[]);
  spec.matchedSeeds.forEach((seed, index) => {
    seedsByWorker[index % workerCount]!.push(seed);
  });
  const shardSpecs = seedsByWorker.map((matchedSeeds) =>
    decodeBalanceLabRunSpecV1({ ...spec, matchedSeeds }));
  const shardResults = await Promise.all(shardSpecs.map(runShard));
  shardResults.forEach((result, index) => {
    if (canonicalJson(result.spec) !== canonicalJson(shardSpecs[index])) {
      throw new OfflineBalanceLabV1Error(
        "PRODUCTION_OWNER_VIOLATION",
        `balance lab worker ${index} returned the wrong shard`,
      );
    }
  });
  return assembleOfflineBalanceLabResultV1(
    spec,
    shardResults.flatMap(({ runs }) => runs),
  );
}
