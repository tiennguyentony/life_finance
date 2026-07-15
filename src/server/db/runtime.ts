import {
  databaseConnectionFromEnvironment,
  type DatabaseConnection,
} from "./client";

let connection: DatabaseConnection | undefined;

export function getDatabaseConnection(): DatabaseConnection {
  connection ??= databaseConnectionFromEnvironment();
  return connection;
}
