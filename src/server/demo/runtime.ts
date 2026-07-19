import type { CommandRunner, RunReader } from "@/application/game/use-cases";
import { onboardingDraftForPersonaV1 } from "@/core/onboarding-personas-v1";
import type { CreatedRunV2 } from "@/server/db/run-repository-contracts";
import { OnboardingService } from "@/server/api/onboarding-service";
import { RunService } from "@/server/api/run-service";
import { TeachingServiceV2 } from "@/server/teaching/service-v2";
import type { GameplayDirector } from "@/server/ai/gameplay-director-service";

import { InMemoryRunRepository } from "./in-memory-run-repository";
import { OfflineDemoTaxCalculator } from "./offline-tax-calculator";
import { TaxSummaryService, type TaxSummaryReader } from "@/server/tax/summary";

type PersistentRunServiceFactory = () => CommandRunner;
type PersistentRunReaderFactory = () => RunReader;

export class LocalDemoRuntime {
  readonly #repository: InMemoryRunRepository;
  readonly #onboardingService: OnboardingService;
  #runService: RunService;

  constructor(
    repository: InMemoryRunRepository = new InMemoryRunRepository(),
  ) {
    this.#repository = repository;
    this.#onboardingService = new OnboardingService(repository);
    this.#runService = new RunService(
      repository,
      new OfflineDemoTaxCalculator(),
    );
  }

  hasRun(runId: string): boolean {
    return this.#repository.hasRun(runId);
  }

  configureGameplayDirector(gameplayDirector: GameplayDirector | null): void {
    this.#runService = new RunService(
      this.#repository,
      new OfflineDemoTaxCalculator(),
      undefined,
      {},
      gameplayDirector,
    );
  }

  async createRun(): Promise<CreatedRunV2> {
    const draft = onboardingDraftForPersonaV1(
      "software",
      "local-demo-seed-v1",
    );
    const review = this.#onboardingService.review(draft);
    return this.#onboardingService.confirm({
      draft,
      reviewChecksum: review.reviewChecksum,
    });
  }

  createRunGateway(
    persistentServiceFactory: PersistentRunServiceFactory,
  ): CommandRunner {
    const serviceFor = (runId: string): CommandRunner =>
      this.hasRun(runId) ? this.#runService : persistentServiceFactory();
    return Object.freeze({
      getRun: (runId: string, accessSecret: string) =>
        serviceFor(runId).getRun(runId, accessSecret),
      submitCommand: (runId, accessSecret, command) =>
        serviceFor(runId).submitCommand(runId, accessSecret, command),
    });
  }

  /**
   * A teaching service backed by the in-memory repository, so the year-one
   * checkpoint works on the demo path instead of requiring PostgreSQL.
   */
  createTeachingService(): TeachingServiceV2 {
    return new TeachingServiceV2(this.#repository);
  }

  createTaxSummaryReader(): TaxSummaryReader {
    return new TaxSummaryService(
      this.#repository,
      new OfflineDemoTaxCalculator(),
    );
  }

  createRunReaderGateway(
    persistentReaderFactory: PersistentRunReaderFactory,
  ): RunReader {
    const readerFor = (runId: string): RunReader =>
      this.hasRun(runId) ? this.#runService : persistentReaderFactory();
    return Object.freeze({
      getRun: (runId: string, accessSecret: string) =>
        readerFor(runId).getRun(runId, accessSecret),
    });
  }
}

export function createLocalDemoRuntime(): LocalDemoRuntime {
  return new LocalDemoRuntime();
}

export function isLocalDemoEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return environment.NODE_ENV === "development";
}

type DemoGlobal = typeof globalThis & {
  __lifeFinanceLocalDemoRuntime?: LocalDemoRuntime;
};

export function getLocalDemoRuntime(): LocalDemoRuntime {
  const demoGlobal = globalThis as DemoGlobal;
  demoGlobal.__lifeFinanceLocalDemoRuntime ??= createLocalDemoRuntime();
  return demoGlobal.__lifeFinanceLocalDemoRuntime;
}
