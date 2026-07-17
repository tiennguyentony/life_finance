export type TeachingTextFragmentV2 =
  | Readonly<{ kind: "text"; text: string }>
  | Readonly<{ kind: "fact_ref"; factId: string }>
  | Readonly<{ kind: "claim_ref"; claimId: string }>;

export type TeachingTextSectionV2 = Readonly<{
  sectionId: string;
  fragments: readonly TeachingTextFragmentV2[];
}>;

export type TeachingTemplateCopyV2 = Readonly<{
  version: "teaching-copy-v2";
  sections: readonly TeachingTextSectionV2[];
}>;

export type TeachingRewritePolicyV2 = Readonly<{
  allowedFactIds: readonly string[];
  allowedClaimIds: readonly string[];
  requiredFactIds: readonly string[];
  requiredClaimIds: readonly string[];
}>;

export type TeachingRewriteResolutionV2 = Readonly<
  | {
      source: "ai_validated";
      content: TeachingTemplateCopyV2;
    }
  | {
      source: "template_fallback";
      fallbackReason:
        | "provider_outage"
        | "timeout"
        | "malformed_output"
        | "invalid_output";
      content: TeachingTemplateCopyV2;
    }
>;

export type TeachingRewriteOptionsV2 = Readonly<{
  timeoutMs?: number;
}>;

const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,191}$/;
const UNSUPPORTED_NUMERIC_OR_CAUSAL_TEXT =
  /[0-9$€£¥%]|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million|billion|dollars?|cents?|percent(?:age)?|ppm|caused?|causes|causing|led\s+to|because\s+of|resulted\s+in|triggered)\b/i;

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value as Readonly<T>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function structurallyValidFragment(value: unknown): value is TeachingTextFragmentV2 {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  const keys = Object.keys(value).sort();
  if (value.kind === "text") {
    return keys.join(",") === "kind,text" && typeof value.text === "string";
  }
  if (value.kind === "fact_ref") {
    return keys.join(",") === "factId,kind" && typeof value.factId === "string";
  }
  if (value.kind === "claim_ref") {
    return keys.join(",") === "claimId,kind" && typeof value.claimId === "string";
  }
  return false;
}

function semanticTextValid(text: string): boolean {
  return (
    text.trim().length > 0 &&
    text.length <= 180 &&
    !UNSUPPORTED_NUMERIC_OR_CAUSAL_TEXT.test(text)
  );
}

function deterministicTemplateTextValid(text: string): boolean {
  return text.trim().length > 0 && text.length <= 500;
}

function textTokens(text: string): readonly string[] {
  return text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
}

function preservesServerOwnedSemantics(
  fragment: TeachingTextFragmentV2,
  templateFragment: TeachingTextFragmentV2 | undefined,
): boolean {
  if (!templateFragment || fragment.kind !== templateFragment.kind) return false;
  if (fragment.kind === "fact_ref") {
    return templateFragment.kind === "fact_ref" &&
      fragment.factId === templateFragment.factId;
  }
  if (fragment.kind === "claim_ref") {
    return templateFragment.kind === "claim_ref" &&
      fragment.claimId === templateFragment.claimId;
  }
  return templateFragment.kind === "text" &&
    textTokens(fragment.text).join("\u0000") ===
      textTokens(templateFragment.text).join("\u0000");
}

function uniqueIdentifiers(values: readonly string[]): boolean {
  return (
    values.every((value) => IDENTIFIER.test(value)) &&
    new Set(values).size === values.length
  );
}

export function createTeachingTemplateCopyV2(
  sections: readonly TeachingTextSectionV2[],
): TeachingTemplateCopyV2 {
  if (
    sections.length === 0 ||
    sections.length > 12 ||
    !uniqueIdentifiers(sections.map(({ sectionId }) => sectionId))
  ) {
    throw new RangeError("teaching template sections must be unique and bounded");
  }
  for (const section of sections) {
    if (section.fragments.length === 0 || section.fragments.length > 8) {
      throw new RangeError("teaching template fragments must be bounded");
    }
    for (const fragment of section.fragments) {
      if (
        (fragment.kind === "text" && !deterministicTemplateTextValid(fragment.text)) ||
        (fragment.kind === "fact_ref" && !IDENTIFIER.test(fragment.factId)) ||
        (fragment.kind === "claim_ref" && !IDENTIFIER.test(fragment.claimId))
      ) {
        throw new RangeError("teaching template contains an invalid fragment");
      }
    }
  }
  return deepFreeze({
    version: "teaching-copy-v2",
    sections: sections.map((section) => ({
      sectionId: section.sectionId,
      fragments: section.fragments.map((fragment) => ({ ...fragment })),
    })),
  }) as TeachingTemplateCopyV2;
}

function structurallyParseResponse(
  value: unknown,
): readonly TeachingTextSectionV2[] | null {
  if (!isRecord(value) || !Array.isArray(value.sections)) return null;
  const sections: TeachingTextSectionV2[] = [];
  for (const section of value.sections) {
    if (
      !isRecord(section) ||
      Object.keys(section).sort().join(",") !== "fragments,sectionId" ||
      typeof section.sectionId !== "string" ||
      !Array.isArray(section.fragments) ||
      !section.fragments.every(structurallyValidFragment)
    ) {
      return null;
    }
    sections.push({
      sectionId: section.sectionId,
      fragments: section.fragments,
    });
  }
  return sections;
}

function validateRewrite(
  fallback: TeachingTemplateCopyV2,
  policy: TeachingRewritePolicyV2,
  sections: readonly TeachingTextSectionV2[],
): TeachingTemplateCopyV2 | null {
  if (
    !uniqueIdentifiers(policy.allowedFactIds) ||
    !uniqueIdentifiers(policy.allowedClaimIds) ||
    !uniqueIdentifiers(policy.requiredFactIds) ||
    !uniqueIdentifiers(policy.requiredClaimIds)
  ) {
    return null;
  }
  const allowedFacts = new Set(policy.allowedFactIds);
  const allowedClaims = new Set(policy.allowedClaimIds);
  if (
    policy.requiredFactIds.some((id) => !allowedFacts.has(id)) ||
    policy.requiredClaimIds.some((id) => !allowedClaims.has(id)) ||
    sections.length !== fallback.sections.length ||
    sections.some(
      (section, index) => section.sectionId !== fallback.sections[index]?.sectionId,
    )
  ) {
    return null;
  }
  const seenFacts = new Set<string>();
  const seenClaims = new Set<string>();
  for (const [sectionIndex, section] of sections.entries()) {
    const templateSection = fallback.sections[sectionIndex]!;
    if (
      section.fragments.length === 0 ||
      section.fragments.length > 8 ||
      section.fragments.length !== templateSection.fragments.length
    ) return null;
    for (const [fragmentIndex, fragment] of section.fragments.entries()) {
      if (fragment.kind === "text") {
        if (
          !semanticTextValid(fragment.text) ||
          !preservesServerOwnedSemantics(
            fragment,
            templateSection.fragments[fragmentIndex],
          )
        ) return null;
      } else if (fragment.kind === "fact_ref") {
        if (
          !allowedFacts.has(fragment.factId) ||
          !preservesServerOwnedSemantics(
            fragment,
            templateSection.fragments[fragmentIndex],
          )
        ) return null;
        seenFacts.add(fragment.factId);
      } else {
        if (
          !allowedClaims.has(fragment.claimId) ||
          !preservesServerOwnedSemantics(
            fragment,
            templateSection.fragments[fragmentIndex],
          )
        ) return null;
        seenClaims.add(fragment.claimId);
      }
    }
  }
  if (
    policy.requiredFactIds.some((id) => !seenFacts.has(id)) ||
    policy.requiredClaimIds.some((id) => !seenClaims.has(id))
  ) {
    return null;
  }
  return createTeachingTemplateCopyV2(sections);
}

export async function resolveOptionalTeachingRewriteV2(
  fallback: TeachingTemplateCopyV2,
  policy: TeachingRewritePolicyV2,
  requestRewrite: (signal: AbortSignal) => Promise<unknown>,
  options: TeachingRewriteOptionsV2 = {},
): Promise<TeachingRewriteResolutionV2> {
  const timeoutMs = options.timeoutMs ?? 2_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) {
    throw new RangeError("teaching rewrite timeout must be between 1 and 10000 ms");
  }
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let response: unknown;
  try {
    response = await Promise.race([
      requestRewrite(controller.signal),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(new Error("teaching rewrite timed out"));
        }, timeoutMs);
      }),
    ]);
  } catch {
    return Object.freeze({
      source: "template_fallback",
      fallbackReason: timedOut ? "timeout" : "provider_outage",
      content: fallback,
    });
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
  const sections = structurallyParseResponse(response);
  if (!sections) {
    return Object.freeze({
      source: "template_fallback",
      fallbackReason: "malformed_output",
      content: fallback,
    });
  }
  const content = validateRewrite(fallback, policy, sections);
  if (!content) {
    return Object.freeze({
      source: "template_fallback",
      fallbackReason: "invalid_output",
      content: fallback,
    });
  }
  return Object.freeze({ source: "ai_validated", content });
}
