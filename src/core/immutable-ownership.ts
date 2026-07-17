const VERIFIED_DEEP_FROZEN_GRAPHS = new WeakSet<object>();

export function isDeepFrozenGraph(value: unknown): boolean {
  const visited = new WeakSet<object>();
  const verified: object[] = [];

  function visit(candidate: unknown): boolean {
    if (candidate === null || typeof candidate !== "object") return true;
    if (VERIFIED_DEEP_FROZEN_GRAPHS.has(candidate)) return true;
    if (visited.has(candidate)) return true;
    if (!Object.isFrozen(candidate)) return false;

    visited.add(candidate);
    verified.push(candidate);
    for (const key of Reflect.ownKeys(candidate)) {
      const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
      if (
        descriptor !== undefined &&
        "value" in descriptor &&
        !visit(descriptor.value)
      ) {
        return false;
      }
    }
    return true;
  }

  const result = visit(value);
  if (result) {
    for (const candidate of verified) {
      VERIFIED_DEEP_FROZEN_GRAPHS.add(candidate);
    }
  }
  return result;
}

export function ownForDeepFreeze<T>(value: T): T {
  return isDeepFrozenGraph(value) ? value : structuredClone(value);
}
