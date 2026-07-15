import { migrate } from "drizzle-orm/postgres-js/migrator";

import type { LifeFinanceDatabase } from "./client";

export async function migrateDatabase(
  db: LifeFinanceDatabase,
  migrationsFolder = "drizzle",
): Promise<void> {
  await migrate(db, { migrationsFolder });
}
