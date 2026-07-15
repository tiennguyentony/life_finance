import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export type LifeFinanceDatabase = PostgresJsDatabase<typeof schema>;

export type DatabaseConnection = Readonly<{
  db: LifeFinanceDatabase;
  close: () => Promise<void>;
}>;

export class DatabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConfigurationError";
  }
}

export function createDatabaseConnection(databaseUrl: string): DatabaseConnection {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new DatabaseConfigurationError("DATABASE_URL must be a valid URL");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new DatabaseConfigurationError("DATABASE_URL must use PostgreSQL");
  }
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const client = postgres(databaseUrl, {
    max: 5,
    prepare: false,
    ssl: isLocal ? false : "require",
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return Object.freeze({
    db: drizzle(client, { schema }),
    close: () => client.end({ timeout: 5 }),
  });
}

export function databaseConnectionFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): DatabaseConnection {
  const databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl) {
    throw new DatabaseConfigurationError("DATABASE_URL is required");
  }
  return createDatabaseConnection(databaseUrl);
}
