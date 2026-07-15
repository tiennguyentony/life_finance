import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  lt,
  lte,
  or,
} from "drizzle-orm";

import type { LifeFinanceDatabase } from "../db/client";
import { transactionalOutbox } from "../db/schema";

export type OutboxDelivery = Readonly<{
  id: string;
  topic: string;
  idempotencyKey: string;
  payload: unknown;
  attemptCount: number;
  createdAt: Date;
}>;

export interface OutboxPublisher {
  publish(delivery: OutboxDelivery): Promise<void>;
}

export type OutboxDispatchResult = Readonly<{
  claimed: number;
  delivered: number;
  retryScheduled: number;
  exhausted: number;
}>;

export class OutboxDispatcherError extends Error {
  readonly code: "INVALID_CONFIGURATION";

  constructor(message: string) {
    super(message);
    this.name = "OutboxDispatcherError";
    this.code = "INVALID_CONFIGURATION";
  }
}

type ClaimedRow = typeof transactionalOutbox.$inferSelect;

function failureCode(error: unknown): string {
  const candidate =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.name
        : "DELIVERY_FAILED";
  const normalized = candidate
    .toUpperCase()
    .replace(/[^A-Z0-9._:-]+/g, "_")
    .slice(0, 128);
  return normalized || "DELIVERY_FAILED";
}

export class TransactionalOutboxDispatcher {
  readonly #db: LifeFinanceDatabase;
  readonly #publisher: OutboxPublisher;
  readonly #clock: () => Date;
  readonly #maximumAttempts: number;
  readonly #leaseMilliseconds: number;
  readonly #baseBackoffMilliseconds: number;
  readonly #maximumBackoffMilliseconds: number;
  readonly #topics: readonly string[] | null;

  constructor(
    db: LifeFinanceDatabase,
    publisher: OutboxPublisher,
    options: Readonly<{
      clock?: () => Date;
      maximumAttempts?: number;
      leaseMilliseconds?: number;
      baseBackoffMilliseconds?: number;
      maximumBackoffMilliseconds?: number;
      topics?: readonly string[];
    }> = {},
  ) {
    this.#db = db;
    this.#publisher = publisher;
    this.#clock = options.clock ?? (() => new Date());
    this.#maximumAttempts = options.maximumAttempts ?? 8;
    this.#leaseMilliseconds = options.leaseMilliseconds ?? 5 * 60_000;
    this.#baseBackoffMilliseconds = options.baseBackoffMilliseconds ?? 5_000;
    this.#maximumBackoffMilliseconds =
      options.maximumBackoffMilliseconds ?? 60 * 60_000;
    this.#topics = options.topics ? Object.freeze([...options.topics]) : null;
    if (
      !Number.isSafeInteger(this.#maximumAttempts) ||
      this.#maximumAttempts < 1 ||
      this.#maximumAttempts > 32 ||
      !Number.isSafeInteger(this.#leaseMilliseconds) ||
      this.#leaseMilliseconds < 1 ||
      !Number.isSafeInteger(this.#baseBackoffMilliseconds) ||
      this.#baseBackoffMilliseconds < 1 ||
      !Number.isSafeInteger(this.#maximumBackoffMilliseconds) ||
      this.#maximumBackoffMilliseconds < this.#baseBackoffMilliseconds
      || (this.#topics !== null &&
        (this.#topics.length === 0 ||
          new Set(this.#topics).size !== this.#topics.length ||
          this.#topics.some((topic) => topic.length === 0 || topic.length > 128)))
    ) {
      throw new OutboxDispatcherError("outbox retry and lease bounds are invalid");
    }
  }

  async #claim(limit: number): Promise<readonly ClaimedRow[]> {
    const now = this.#clock();
    const staleBefore = new Date(now.getTime() - this.#leaseMilliseconds);
    return this.#db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(transactionalOutbox)
        .where(
          and(
            lt(transactionalOutbox.attemptCount, this.#maximumAttempts),
            this.#topics
              ? inArray(transactionalOutbox.topic, this.#topics)
              : undefined,
            or(
              and(
                inArray(transactionalOutbox.status, ["pending", "failed"]),
                lte(transactionalOutbox.availableAt, now),
              ),
              and(
                eq(transactionalOutbox.status, "processing"),
                or(
                  isNull(transactionalOutbox.lockedAt),
                  lte(transactionalOutbox.lockedAt, staleBefore),
                ),
              ),
            ),
          ),
        )
        .orderBy(
          asc(transactionalOutbox.availableAt),
          asc(transactionalOutbox.createdAt),
          asc(transactionalOutbox.id),
        )
        .limit(limit)
        .for("update", { skipLocked: true });
      const claimed: ClaimedRow[] = [];
      for (const row of rows) {
        const [updated] = await tx
          .update(transactionalOutbox)
          .set({
            status: "processing",
            attemptCount: row.attemptCount + 1,
            lockedAt: now,
            deliveredAt: null,
            lastErrorCode: null,
          })
          .where(eq(transactionalOutbox.id, row.id))
          .returning();
        if (updated) claimed.push(updated);
      }
      return Object.freeze(claimed);
    });
  }

  #backoff(attemptCount: number): number {
    return Math.min(
      this.#maximumBackoffMilliseconds,
      this.#baseBackoffMilliseconds * 2 ** Math.max(0, attemptCount - 1),
    );
  }

  async #deliver(row: ClaimedRow): Promise<"delivered" | "retry" | "exhausted"> {
    try {
      await this.#publisher.publish(
        Object.freeze({
          id: row.id,
          topic: row.topic,
          idempotencyKey: row.idempotencyKey,
          payload: row.payload,
          attemptCount: row.attemptCount,
          createdAt: row.createdAt,
        }),
      );
      const [updated] = await this.#db
        .update(transactionalOutbox)
        .set({
          status: "delivered",
          deliveredAt: this.#clock(),
          lockedAt: null,
          lastErrorCode: null,
        })
        .where(
          and(
            eq(transactionalOutbox.id, row.id),
            eq(transactionalOutbox.status, "processing"),
            eq(transactionalOutbox.attemptCount, row.attemptCount),
          ),
        )
        .returning({ id: transactionalOutbox.id });
      return updated ? "delivered" : "retry";
    } catch (error) {
      const exhausted = row.attemptCount >= this.#maximumAttempts;
      const now = this.#clock();
      await this.#db
        .update(transactionalOutbox)
        .set({
          status: "failed",
          lockedAt: null,
          deliveredAt: null,
          lastErrorCode: failureCode(error),
          availableAt: new Date(now.getTime() + this.#backoff(row.attemptCount)),
        })
        .where(
          and(
            eq(transactionalOutbox.id, row.id),
            eq(transactionalOutbox.status, "processing"),
            eq(transactionalOutbox.attemptCount, row.attemptCount),
          ),
        );
      return exhausted ? "exhausted" : "retry";
    }
  }

  async dispatchBatch(limit = 25): Promise<OutboxDispatchResult> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new OutboxDispatcherError("outbox batch size must be 1..100");
    }
    const claimed = await this.#claim(limit);
    const results = await Promise.all(claimed.map((row) => this.#deliver(row)));
    return Object.freeze({
      claimed: claimed.length,
      delivered: results.filter((result) => result === "delivered").length,
      retryScheduled: results.filter((result) => result === "retry").length,
      exhausted: results.filter((result) => result === "exhausted").length,
    });
  }
}
