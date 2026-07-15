const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const SSN_PATTERN = /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/gu;
const LABELED_ACCOUNT_PATTERN =
  /\b((?:bank|checking|savings|brokerage|retirement|credit(?: card)?|account|routing)\s*(?:account\s*)?(?:number|no\.?|#)?\s*[:=-]?\s*)([A-Z0-9][A-Z0-9 -]{5,30}[A-Z0-9])\b/giu;
const LONG_DIGIT_IDENTIFIER_PATTERN = /\b(?:\d[ -]?){12,19}\b/gu;

export const PRIVACY_REDACTIONS = Object.freeze({
  email: "[REDACTED_EMAIL]",
  accountNumber: "[REDACTED_ACCOUNT_NUMBER]",
  governmentId: "[REDACTED_GOVERNMENT_ID]",
  name: "[REDACTED_NAME]",
} as const);

export type RedactionKind = keyof typeof PRIVACY_REDACTIONS;

export type RedactionReport = Readonly<{
  text: string;
  counts: Readonly<Record<RedactionKind, number>>;
}>;

function escapedPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceAndCount(
  text: string,
  pattern: RegExp,
  replacement: string | ((match: string, ...groups: string[]) => string),
): { text: string; count: number } {
  let count = 0;
  return {
    text: text.replace(pattern, (...args: string[]) => {
      count += 1;
      return typeof replacement === "string"
        ? replacement
        : replacement(args[0], ...args.slice(1, -2));
    }),
    count,
  };
}

export function redactSensitiveText(
  input: string,
  providedNames: readonly string[] = [],
): RedactionReport {
  let text = input.normalize("NFKC");
  const counts: Record<RedactionKind, number> = {
    email: 0,
    accountNumber: 0,
    governmentId: 0,
    name: 0,
  };

  let result = replaceAndCount(text, EMAIL_PATTERN, PRIVACY_REDACTIONS.email);
  text = result.text;
  counts.email += result.count;

  result = replaceAndCount(text, SSN_PATTERN, PRIVACY_REDACTIONS.governmentId);
  text = result.text;
  counts.governmentId += result.count;

  result = replaceAndCount(
    text,
    LABELED_ACCOUNT_PATTERN,
    (_match, prefix: string) => `${prefix}${PRIVACY_REDACTIONS.accountNumber}`,
  );
  text = result.text;
  counts.accountNumber += result.count;

  result = replaceAndCount(
    text,
    LONG_DIGIT_IDENTIFIER_PATTERN,
    PRIVACY_REDACTIONS.accountNumber,
  );
  text = result.text;
  counts.accountNumber += result.count;

  const uniqueNames = [...new Set(providedNames.map((name) => name.trim()))]
    .filter((name) => name.length >= 2)
    .sort((left, right) => right.length - left.length);
  for (const name of uniqueNames) {
    const namePattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapedPattern(name)}(?![\\p{L}\\p{N}])`, "giu");
    result = replaceAndCount(text, namePattern, PRIVACY_REDACTIONS.name);
    text = result.text;
    counts.name += result.count;
  }

  return Object.freeze({ text, counts: Object.freeze(counts) });
}

export function assertNoKnownSensitiveData(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError("AI prompt payload must be JSON serializable");
  }
  const report = redactSensitiveText(serialized);
  if (
    report.counts.email > 0 ||
    report.counts.accountNumber > 0 ||
    report.counts.governmentId > 0
  ) {
    throw new Error("AI prompt payload contains unredacted sensitive data");
  }
}
