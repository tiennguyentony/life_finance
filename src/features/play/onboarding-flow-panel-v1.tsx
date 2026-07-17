import type {
  OnboardingAiExtractionResultV1,
  OnboardingDraftV1,
} from "../../core/onboarding-v1-contracts";
import type { OnboardingPersonaIdV1 } from "../../core/onboarding-personas-v1";
import { AI_PRIVACY_NOTICE_VERSION } from "../../server/ai/privacy-notice";
import { PLAYER_PRESETS } from "./onboarding-model";
import { OnboardingManualFieldsV1 } from "./onboarding-manual-fields-v1";
import {
  canConfirmOnboardingReviewV1,
  type OnboardingReviewSessionV1,
} from "./onboarding-review-session-v1";
import { OnboardingReviewPanelV1 } from "./onboarding-review-v1";

const PERSONA_IDS = Object.freeze(
  Object.keys(PLAYER_PRESETS) as OnboardingPersonaIdV1[],
);

function formatAiPatchValueV1(value: unknown): string {
  if (
    value !== null &&
    typeof value === "object" &&
    "amountCents" in value &&
    "period" in value &&
    "basis" in value &&
    typeof value.amountCents === "number" &&
    typeof value.period === "string" &&
    typeof value.basis === "string"
  ) {
    const amount = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value.amountCents / 100);
    return `${amount} · ${value.period} · ${value.basis}`;
  }
  return String(value);
}

export function OnboardingFlowPanelV1({
  session,
  busy,
  busyLabel,
  error,
  aiConsent,
  aiFreeText,
  aiResult,
  onDraftChange,
  onPersonaChange,
  onManualMode,
  onReview,
  onConfirm,
  onAiConsentChange,
  onAiFreeTextChange,
  onParseAi,
  onApplyAi,
}: Readonly<{
  session: OnboardingReviewSessionV1;
  busy: boolean;
  busyLabel: string;
  error: string | null;
  aiConsent: boolean;
  aiFreeText: string;
  aiResult: OnboardingAiExtractionResultV1 | null;
  onDraftChange: (draft: OnboardingDraftV1) => void;
  onPersonaChange: (personaId: OnboardingPersonaIdV1) => void;
  onManualMode: () => void;
  onReview: () => void;
  onConfirm: () => void;
  onAiConsentChange: (accepted: boolean) => void;
  onAiFreeTextChange: (freeText: string) => void;
  onParseAi: () => void;
  onApplyAi: () => void;
}>) {
  const selectedTemplate =
    session.draft.sourceMode === "persona" && session.draft.personaId
      ? session.draft.personaId
      : "manual";
  return (
    <section className="play-start" aria-label="Reviewed onboarding flow">
      <div>
        <p className="hero-kicker">Life Finance · learning simulation</p>
        <h1>Build a life, review the facts, then stress-test it.</h1>
        <p className="lede">
          Every run starts from one typed draft. Product defaults, field
          sources, owner-derived metrics, and the deterministic seed are shown
          before anything is persisted.
        </p>
        <ul className="play-learning-list">
          <li>Choose a stable persona or enter every starting field yourself.</li>
          <li>Use optional AI only to extract candidates you explicitly accept.</li>
          <li>Confirm the checksum-bound review before the authoritative state is created.</li>
        </ul>
      </div>
      <fieldset className="play-onboarding-flow" disabled={busy}>
        <legend>Starting template</legend>
        <label>
          Starting template
          <select
            value={selectedTemplate}
            onChange={(event) => {
              if (event.target.value === "manual") onManualMode();
              else onPersonaChange(event.target.value as OnboardingPersonaIdV1);
            }}
          >
            <option value="manual">Manual typed input</option>
            {PERSONA_IDS.map((personaId) => (
              <option key={personaId} value={personaId}>
                {PLAYER_PRESETS[personaId].label}
              </option>
            ))}
          </select>
        </label>

        <OnboardingManualFieldsV1
          draft={session.draft}
          onChange={onDraftChange}
        />

        <section className="play-panel play-form" aria-label="Optional AI parser">
          <h2>Optional AI parser</h2>
          <p>
            Paste a short description only if useful. The text is sent only
            after consent, stays out of the run and browser storage, and is
            cleared as the request begins. AI amounts remain unconverted
            candidates until you type authoritative values above.
          </p>
          <label>
            Financial description
            <textarea
              maxLength={4_000}
              value={aiFreeText}
              onChange={(event) => onAiFreeTextChange(event.target.value)}
            />
          </label>
          <label>
            <input
              checked={aiConsent}
              type="checkbox"
              onChange={(event) => onAiConsentChange(event.target.checked)}
            />
            I consent to this one optional extraction request under privacy
            notice v{AI_PRIVACY_NOTICE_VERSION}.
          </label>
          <button
            disabled={!aiConsent || aiFreeText.trim().length === 0}
            onClick={onParseAi}
            type="button"
          >
            Extract candidates
          </button>
          {aiResult ? (
            <div aria-label="AI extraction candidates">
              <p>
                <strong>Extraction status:</strong> {aiResult.status}
              </p>
              {Object.entries(aiResult.patch).length > 0 ? (
                <ul>
                  {Object.entries(aiResult.patch).map(([field, value]) => (
                    <li key={field}>{field}: {formatAiPatchValueV1(value)}</li>
                  ))}
                </ul>
              ) : null}
              {aiResult.financialCandidates.length > 0 ? (
                <>
                  <h3>Unconverted financial candidates</h3>
                  <ul>
                    {aiResult.financialCandidates.map((candidate) => (
                      <li key={candidate.field}>
                        <strong>{candidate.field}</strong>: {candidate.valueAsStated}
                        {candidate.period ? ` · ${candidate.period}` : ""}
                        {candidate.basis ? ` · ${candidate.basis}` : ""}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {aiResult.clarificationQuestion ? (
                <p>{aiResult.clarificationQuestion}</p>
              ) : null}
              {aiResult.status === "ready" && Object.keys(aiResult.patch).length > 0 ? (
                <button onClick={onApplyAi} type="button">
                  Apply extracted typed fields
                </button>
              ) : null}
            </div>
          ) : null}
        </section>

        {error ? <p className="play-error" role="alert">{error}</p> : null}
        {busy ? <p className="play-working" role="status">{busyLabel}</p> : null}
        <button className="play-primary" onClick={onReview} type="button">
          Review starting position
        </button>
        {session.review ? (
          <OnboardingReviewPanelV1
            review={session.review}
            current={canConfirmOnboardingReviewV1(session)}
            busy={busy}
            onConfirm={onConfirm}
          />
        ) : null}
      </fieldset>
    </section>
  );
}
