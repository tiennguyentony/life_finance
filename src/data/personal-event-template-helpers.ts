import type { PersonalEventMagnitudeV2 } from "../core/personal-event-v2";

export function parameter(
  parameterId: string,
  multiplierPpm = 1_000_000,
): PersonalEventMagnitudeV2 {
  return { source: "parameter", parameterId, multiplierPpm };
}

export function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
