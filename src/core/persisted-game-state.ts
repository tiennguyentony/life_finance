import {
  finalizeGameState,
  type GameState as GameStateV1,
} from "./game-state";
import {
  finalizeGameStateV2,
  type GameStateV2,
} from "./game-state-v2";

export type PersistedGameState = GameStateV1 | GameStateV2;

export class PersistedGameStateDecodeError extends Error {
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "PersistedGameStateDecodeError";
    this.cause = cause;
  }
}

function schemaVersion(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return (value as Readonly<Record<string, unknown>>).schemaVersion;
}

export function decodePersistedGameState(value: unknown): PersistedGameState {
  try {
    if (schemaVersion(value) === 1) {
      return finalizeGameState(value as GameStateV1);
    }
    if (schemaVersion(value) === 2) {
      return finalizeGameStateV2(value as GameStateV2);
    }
  } catch (cause) {
    throw new PersistedGameStateDecodeError(
      "persisted game state violates its versioned invariants",
      cause,
    );
  }
  throw new PersistedGameStateDecodeError(
    "persisted game state uses an unsupported schema version",
  );
}
