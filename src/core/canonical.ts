import { createHash } from "node:crypto";

export class CanonicalSerializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalSerializationError";
  }
}

function serialize(value: unknown, ancestors: Set<object>, path: string): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) {
        throw new CanonicalSerializationError(`${path} must be a finite number`);
      }
      return JSON.stringify(value);
    case "undefined":
    case "bigint":
    case "function":
    case "symbol":
      throw new CanonicalSerializationError(
        `${path} contains unsupported type ${typeof value}`,
      );
    case "object":
      break;
  }

  if (ancestors.has(value)) {
    throw new CanonicalSerializationError(`${path} contains a cycle`);
  }
  ancestors.add(value);

  let result: string;
  if (Array.isArray(value)) {
    result = `[${Array.from(value, (item, index) =>
      serialize(item, ancestors, `${path}.${index}`),
    )
      .join(",")}]`;
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new CanonicalSerializationError(
        `${path} must contain only plain objects and arrays`,
      );
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new CanonicalSerializationError(
        `${path} must not contain symbol-keyed properties`,
      );
    }

    const entries = Object.keys(value)
      .sort()
      .map((key) => {
        const serializedKey = JSON.stringify(key);
        const serializedValue = serialize(
          (value as Record<string, unknown>)[key],
          ancestors,
          `${path}.${key}`,
        );
        return `${serializedKey}:${serializedValue}`;
      });
    result = `{${entries.join(",")}}`;
  }

  ancestors.delete(value);
  return result;
}

export function canonicalJson(value: unknown): string {
  return serialize(value, new Set<object>(), "$.");
}

export function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}
