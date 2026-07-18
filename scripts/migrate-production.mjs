import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for a production migration");
}

const url = new URL(databaseUrl);
const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
const client = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  ssl: isLocal ? false : "require",
  connect_timeout: 10,
  idle_timeout: 20,
});
const db = drizzle(client);
const migrationLockId = 1_279_676_997;
let locked = false;

try {
  await client`select pg_advisory_lock(${migrationLockId})`;
  locked = true;
  await migrate(db, { migrationsFolder: "drizzle" });
} finally {
  if (locked) {
    await client`select pg_advisory_unlock(${migrationLockId})`;
  }
  await client.end({ timeout: 5 });
}
