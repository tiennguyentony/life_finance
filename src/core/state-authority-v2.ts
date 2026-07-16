import type { GameStateV2 } from "./game-state-v2";
import type { PersistedGameState } from "./persisted-game-state";

export type AuthoritativeGameState = GameStateV2;

export class MigrationRequiredError extends Error {
  readonly code = "MIGRATION_REQUIRED" as const;
  readonly sourceSchemaVersion: number;

  constructor(sourceSchemaVersion: number) {
    super(
      `schema-v${sourceSchemaVersion} state must be migrated before gameplay mutation`,
    );
    this.name = "MigrationRequiredError";
    this.sourceSchemaVersion = sourceSchemaVersion;
  }
}

export function requireAuthoritativeGameState(
  state: PersistedGameState,
): GameStateV2 {
  if (state.schemaVersion !== 2) {
    throw new MigrationRequiredError(state.schemaVersion);
  }
  return state;
}
