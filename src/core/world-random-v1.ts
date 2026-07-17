import {
  nextInt,
  nextUint32,
  randomState,
  type RandomDraw,
  type RandomState,
} from "./domain/rng";

export const WORLD_RANDOM_VERSION_V1 = "named-world-rng-v1" as const;

export type WorldRandomStateV1 = Readonly<{
  version: typeof WORLD_RANDOM_VERSION_V1;
  macro: RandomState;
  eventOpportunity: RandomState;
  eventParameters: RandomState;
  balanceDirector: RandomState;
}>;

const STREAM_NAMES = [
  "macro",
  "eventOpportunity",
  "eventParameters",
  "balanceDirector",
] as const;

export class WorldRandomV1Error extends Error {
  constructor(
    readonly code:
      | "INVALID_WORLD_RANDOM_STATE"
      | "INVALID_SCOPE_IDENTITY"
      | "INVALID_PARAMETER_BOUNDS",
    message: string,
  ) {
    super(message);
    this.name = "WorldRandomV1Error";
  }
}

function namespaceFromState(state: RandomState, suffix: string): string {
  return [
    WORLD_RANDOM_VERSION_V1,
    state.algorithm,
    String(state.value),
    suffix,
  ].join(" | ");
}

function freezeRandomState(state: RandomState): RandomState {
  return Object.freeze({ algorithm: state.algorithm, value: state.value });
}

function buildWorldRandomStateV1(
  streams: Omit<WorldRandomStateV1, "version">,
): WorldRandomStateV1 {
  return Object.freeze({
    version: WORLD_RANDOM_VERSION_V1,
    macro: freezeRandomState(streams.macro),
    eventOpportunity: freezeRandomState(streams.eventOpportunity),
    eventParameters: freezeRandomState(streams.eventParameters),
    balanceDirector: freezeRandomState(streams.balanceDirector),
  });
}

export function initializeNamedWorldRandomV1(
  openingLegacyState: RandomState,
): WorldRandomStateV1 {
  assertRandomState(openingLegacyState, "opening legacy state");

  const derive = (streamName: (typeof STREAM_NAMES)[number]) =>
    randomState(namespaceFromState(openingLegacyState, streamName));

  return buildWorldRandomStateV1({
    macro: derive("macro"),
    eventOpportunity: derive("eventOpportunity"),
    eventParameters: derive("eventParameters"),
    balanceDirector: derive("balanceDirector"),
  });
}

function assertRandomState(value: unknown, label: string): asserts value is RandomState {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).sort().join("|") !== "algorithm|value" ||
    (value as { algorithm?: unknown }).algorithm !== "mulberry32-v1" ||
    !Number.isInteger((value as { value?: unknown }).value) ||
    ((value as { value: number }).value < 0) ||
    ((value as { value: number }).value > 0xffff_ffff)
  ) {
    throw new WorldRandomV1Error(
      "INVALID_WORLD_RANDOM_STATE",
      `${label} must be an exact mulberry32-v1 state`,
    );
  }
}

export function decodeWorldRandomStateV1(value: unknown): WorldRandomStateV1 {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).sort().join("|") !==
      "balanceDirector|eventOpportunity|eventParameters|macro|version" ||
    (value as { version?: unknown }).version !== WORLD_RANDOM_VERSION_V1
  ) {
    throw new WorldRandomV1Error(
      "INVALID_WORLD_RANDOM_STATE",
      `world random state must be exact ${WORLD_RANDOM_VERSION_V1}`,
    );
  }

  const state = value as Record<string, unknown>;
  for (const streamName of STREAM_NAMES) {
    assertRandomState(state[streamName], streamName);
  }

  return buildWorldRandomStateV1({
    macro: state.macro as RandomState,
    eventOpportunity: state.eventOpportunity as RandomState,
    eventParameters: state.eventParameters as RandomState,
    balanceDirector: state.balanceDirector as RandomState,
  });
}

export function decodeOptionalWorldRandomStateV1(
  value: unknown,
): WorldRandomStateV1 | undefined {
  return value === undefined ? undefined : decodeWorldRandomStateV1(value);
}

function requireScopeIdentity(value: string, label: string): string {
  if (value.length === 0 || value.trim() !== value || value.includes("|")) {
    throw new WorldRandomV1Error(
      "INVALID_SCOPE_IDENTITY",
      `${label} must be a non-empty canonical identity without pipe characters`,
    );
  }
  return value;
}

function requireMonth(month: number): number {
  if (!Number.isSafeInteger(month) || month < 0) {
    throw new WorldRandomV1Error(
      "INVALID_SCOPE_IDENTITY",
      "simulation month must be a non-negative safe integer",
    );
  }
  return month;
}

function keyedState(epoch: RandomState, scope: string): RandomState {
  assertRandomState(epoch, "event epoch");
  return randomState(namespaceFromState(epoch, scope));
}

export function eventOpportunityDrawV1(input: Readonly<{
  epoch: RandomState;
  simulationMonth: number;
  templateId: string;
  templateVersion: number;
}>): RandomDraw<number> {
  const templateId = requireScopeIdentity(input.templateId, "template id");
  if (!Number.isSafeInteger(input.templateVersion) || input.templateVersion < 1) {
    throw new WorldRandomV1Error(
      "INVALID_SCOPE_IDENTITY",
      "template version must be a positive safe integer",
    );
  }
  const scope = [
    "event-opportunity",
    String(requireMonth(input.simulationMonth)),
    templateId,
    String(input.templateVersion),
  ].join(" | ");
  return nextInt(keyedState(input.epoch, scope), 1, 1_000_000);
}

export function eventParameterDrawV1(input: Readonly<{
  epoch: RandomState;
  simulationMonth: number;
  templateId: string;
  templateVersion: number;
  parameterId: string;
  minimumInclusive: number;
  maximumInclusive: number;
}>): RandomDraw<number> {
  const templateId = requireScopeIdentity(input.templateId, "template id");
  const parameterId = requireScopeIdentity(input.parameterId, "parameter id");
  if (!Number.isSafeInteger(input.templateVersion) || input.templateVersion < 1) {
    throw new WorldRandomV1Error(
      "INVALID_SCOPE_IDENTITY",
      "template version must be a positive safe integer",
    );
  }
  if (
    !Number.isSafeInteger(input.minimumInclusive) ||
    !Number.isSafeInteger(input.maximumInclusive) ||
    input.maximumInclusive < input.minimumInclusive
  ) {
    throw new WorldRandomV1Error(
      "INVALID_PARAMETER_BOUNDS",
      "event parameter bounds must be ordered safe integers",
    );
  }
  const scope = [
    "event-parameter",
    String(requireMonth(input.simulationMonth)),
    templateId,
    String(input.templateVersion),
    parameterId,
  ].join(" | ");
  return nextInt(
    keyedState(input.epoch, scope),
    input.minimumInclusive,
    input.maximumInclusive,
  );
}

export function advanceEventEpochsV1(
  state: WorldRandomStateV1,
): WorldRandomStateV1 {
  const decoded = decodeWorldRandomStateV1(state);
  return buildWorldRandomStateV1({
    macro: decoded.macro,
    eventOpportunity: nextUint32(decoded.eventOpportunity).nextState,
    eventParameters: nextUint32(decoded.eventParameters).nextState,
    balanceDirector: decoded.balanceDirector,
  });
}

export function withNextMacroStateV1(
  state: WorldRandomStateV1,
  nextMacro: RandomState,
): WorldRandomStateV1 {
  const decoded = decodeWorldRandomStateV1(state);
  assertRandomState(nextMacro, "next macro state");
  return buildWorldRandomStateV1({ ...decoded, macro: nextMacro });
}
