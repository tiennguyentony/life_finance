export const AI_PRIVACY_NOTICE_VERSION = 2 as const;

export const AI_PRIVACY_NOTICE = Object.freeze({
  version: AI_PRIVACY_NOTICE_VERSION,
  title: "How Life Finance uses AI data",
  summary:
    "Life Finance sends minimized, redacted simulation context to the configured AI provider—OpenAI GPT-5.6, Groq-hosted gpt-oss-120b, or local gpt-oss—to generate adversarial events, onboarding extraction, explanations, and educational debriefs. AI never owns financial calculations or directly changes game state.",
  disclosures: Object.freeze([
    "Do not enter names, email addresses, government identifiers, or bank, brokerage, routing, or payment-card account numbers.",
    "Life Finance automatically blocks or redacts recognized direct identifiers before an AI request, but automated redaction may not identify every sensitive detail.",
    "Complete AI prompts and outputs, including failed attempts, are encrypted with AES-256-GCM and retained indefinitely for administrator-only auditing.",
    "AI prompt and output content is not written to normal application logs, and the application provides no audit-content deletion endpoint.",
    "Generated explanations are educational and may be inaccurate; deterministic engine and PolicyEngine results remain authoritative within the simulation and are not professional financial, tax, or legal advice.",
  ]),
} as const);
