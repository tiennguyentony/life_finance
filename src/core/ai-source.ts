export const AI_CONTENT_SOURCES = [
  "openai",
  "hosted_oss",
  "local_oss",
  "deterministic_fallback",
] as const;

export type AiContentSource = (typeof AI_CONTENT_SOURCES)[number];
export type AiModelSource = Exclude<AiContentSource, "deterministic_fallback">;

export function isAiContentSource(value: unknown): value is AiContentSource {
  return typeof value === "string" &&
    (AI_CONTENT_SOURCES as readonly string[]).includes(value);
}
