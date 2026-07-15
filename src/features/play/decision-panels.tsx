import type { Dispatch, SetStateAction } from "react";

import type { GameStateV2 } from "@/core/game-state-v2";
import {
  EDUCATION_CONCEPTS,
  EDUCATION_CONTENT_VERSION,
  getEducationConcept,
} from "@/data/education-content";

import { ACTION_GUIDANCE, ConceptButton } from "./play-support";
import type { ActionDraft, StrategyDraft } from "./play-types";

type ConceptSelection = Readonly<{
  onSelectConcept: (conceptId: string) => void;
}>;

export function StrategyPanel({
  state,
  draft,
  busy,
  blocked,
  onChange,
  onSave,
  onSelectConcept,
}: Readonly<{
  state: GameStateV2;
  draft: StrategyDraft;
  busy: boolean;
  blocked: boolean;
  onChange: Dispatch<SetStateAction<StrategyDraft>>;
  onSave: () => void;
}> & ConceptSelection) {
  const hasDebt = state.gameplay.debts.termDebts.some(
    ({ principalCents }) => principalCents > 0,
  );
  const hsaStrategy = state.gameplay.benefits.hsaEligible ? draft.hsa : 0;
  const preTaxTotal = draft.retirement + hsaStrategy;
  const afterTaxTotal =
    draft.index + draft.sector + draft.speculative + draft.ira + draft.debt;
  const invalid = preTaxTotal > 100 || afterTaxTotal > 100;

  return (
    <section className="play-panel play-form">
      <div className="section-heading">
        <div><p className="hero-kicker">Recurring every month</p><h2>Offense and resilience</h2></div>
        <ConceptButton conceptId="401k" onSelect={onSelectConcept} />
      </div>
      <p className="play-note">
        401(k) and HSA use gross salary. Index, sector, speculative, IRA, and
        extra debt use cash remaining after tax and required obligations.
      </p>
      <div className="strategy-grid">
        {([
          ["retirement", "401(k)", "401k"],
          ["hsa", "HSA", "hsa"],
          ["index", "Broad index", "broad_index"],
          ["sector", "Sector stocks", "sector_investing"],
          ["speculative", "Speculative", "speculation"],
          ["ira", "IRA", "ira"],
          ["debt", "Extra debt payoff", "dti"],
        ] as const).map(([key, label, conceptId]) => (
          <label key={key}>
            <span>
              {label} <ConceptButton conceptId={conceptId} onSelect={onSelectConcept} />
            </span>
            <input
              disabled={
                (key === "debt" && !hasDebt) ||
                (key === "hsa" && !state.gameplay.benefits.hsaEligible)
              }
              min="0"
              max="100"
              step="0.5"
              type="number"
              value={key === "hsa" ? hsaStrategy : draft[key]}
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  [key]: event.target.valueAsNumber,
                }))
              }
            />
            <small>%</small>
          </label>
        ))}
      </div>
      <div className={`allocation-check ${invalid ? "invalid" : ""}`}>
        <span>Pre-tax total: {preTaxTotal}%</span>
        <span>After-tax total: {afterTaxTotal}%</span>
      </div>
      <button disabled={busy || blocked || invalid} onClick={onSave} type="button">
        Save recurring strategy
      </button>
    </section>
  );
}

export function ActionPanel({
  state,
  draft,
  busy,
  blocked,
  onChange,
  onApply,
  onSelectConcept,
}: Readonly<{
  state: GameStateV2;
  draft: ActionDraft;
  busy: boolean;
  blocked: boolean;
  onChange: (patch: Partial<ActionDraft>) => void;
  onApply: () => void;
}> & ConceptSelection) {
  const snapshot = state.gameplay.catalogSnapshot?.selected;
  const canOwnHome = snapshot?.scenario.allowsHomeOwnership === true;
  const hasHome = state.finances.homeValueCents > 0;
  const hasMortgage = state.gameplay.debts.termDebts.some(
    ({ kind }) => kind === "mortgage",
  );
  const hasDebt = state.gameplay.debts.termDebts.some(
    ({ principalCents }) => principalCents > 0,
  );
  const guidance = ACTION_GUIDANCE[draft.type];

  return (
    <section className="play-panel play-form">
      <div><p className="hero-kicker">One-time levers</p><h2>Act on the balance sheet</h2></div>
      <label>
        Action
        <select
          value={draft.type}
          onChange={(event) =>
            onChange({ type: event.target.value as ActionDraft["type"] })
          }
        >
          <option value="invest_taxable">Invest in broad index</option>
          <option value="invest_sector">Invest in job-correlated sector</option>
          <option value="invest_speculative">Make a speculative investment</option>
          <option value="liquidate_taxable">Sell broad-index investment</option>
          <option value="contribute_ira">Contribute to IRA</option>
          {state.gameplay.benefits.hsaEligible ? <option value="contribute_hsa">Contribute to HSA</option> : null}
          {hasDebt ? <option value="pay_term_debt">Pay highest-priority term debt</option> : null}
          {state.finances.creditUsedCents > 0 ? <option value="pay_revolving_credit">Pay revolving credit</option> : null}
          <option value="draw_revolving_credit">Draw revolving credit</option>
          {state.gameplay.portfolio.retirement401kCents > 0 ? <option value="withdraw_401k">Withdraw 401(k) early</option> : null}
          {state.gameplay.portfolio.retirementIraCents > 0 ? <option value="withdraw_ira">Withdraw IRA early</option> : null}
          {canOwnHome && !hasHome ? <option value="purchase_home">Purchase a home</option> : null}
          {hasHome ? <option value="sell_home">Sell the home</option> : null}
          {hasMortgage ? <option value="refinance_home">Refinance mortgage</option> : null}
          <option value="reduce_lifestyle">Reduce annual lifestyle cost</option>
          <option value="increase_lifestyle">Increase annual lifestyle cost</option>
          <option value="start_upskill">Start an education program</option>
        </select>
      </label>
      <div className="action-guidance">
        <p>{guidance?.summary}</p>
        <ConceptButton conceptId={guidance?.conceptId ?? "liquidity"} onSelect={onSelectConcept} />
      </div>
      {!['sell_home', 'refinance_home', 'start_upskill'].includes(draft.type) ? (
        <label>
          {draft.type === "purchase_home" ? "Purchase price" : "Amount"} (USD)
          <input min="1" step="100" type="number" value={draft.amount} onChange={(event) => onChange({ amount: event.target.valueAsNumber })} />
        </label>
      ) : null}
      {draft.type === "purchase_home" ? (
        <label>
          Down payment (USD)
          <input min="0" step="1000" type="number" value={draft.secondaryAmount} onChange={(event) => onChange({ secondaryAmount: event.target.valueAsNumber })} />
        </label>
      ) : null}
      {draft.type === "purchase_home" || draft.type === "refinance_home" ? (
        <div className="play-inline-fields">
          <label>Mortgage rate %<input min="0" max="50" step="0.1" type="number" value={draft.mortgageRate} onChange={(event) => onChange({ mortgageRate: event.target.valueAsNumber })} /></label>
          <label>Term in months<input min="12" max="480" step="12" type="number" value={draft.mortgageTerm} onChange={(event) => onChange({ mortgageTerm: event.target.valueAsNumber })} /></label>
        </div>
      ) : null}
      {draft.type === "start_upskill" ? (
        <label>
          Program
          <select value={draft.upskillProgram} onChange={(event) => onChange({ upskillProgram: event.target.value as ActionDraft["upskillProgram"] })}>
            <option value="upskill.certificate">Certificate · short / lower cost</option>
            <option value="upskill.bootcamp">Bootcamp · medium duration / raise</option>
            <option value="upskill.degree">Degree · long / highest raise</option>
          </select>
        </label>
      ) : null}
      <button disabled={busy || blocked} onClick={onApply} type="button">Apply action</button>
    </section>
  );
}

export function EducationPanel({
  activeConceptId,
  onChange,
  busy,
  consented,
  lesson,
  onConsentChange,
  onAskAi,
}: Readonly<{
  activeConceptId: string;
  onChange: (conceptId: string) => void;
  busy: boolean;
  consented: boolean;
  lesson: Readonly<{
    source: "openai" | "local_oss" | "deterministic_fallback";
    explanation: Readonly<{
      title: string;
      explanation: string;
      whyItMattersNow: string;
      actionTips: readonly string[];
    }>;
  }> | null;
  onConsentChange: (accepted: boolean) => void;
  onAskAi: () => void;
}>) {
  const activeConcept =
    getEducationConcept(activeConceptId) ?? EDUCATION_CONCEPTS[0]!;

  return (
    <div className="learn-layout">
      <nav className="play-panel glossary-list" aria-label="Financial glossary">
        <p className="hero-kicker">{EDUCATION_CONTENT_VERSION}</p>
        {EDUCATION_CONCEPTS.map((concept) => (
          <button
            className={activeConcept.id === concept.id ? "active" : ""}
            key={concept.id}
            onClick={() => onChange(concept.id)}
            type="button"
          >
            {concept.title}
          </button>
        ))}
      </nav>
      <article className="play-panel concept-card">
        <p className="hero-kicker">What it means</p>
        <h2>{activeConcept.title}</h2>
        <p>{activeConcept.shortDefinition}</p>
        <h3>Why it matters now</h3>
        <p>{activeConcept.whyItMatters}</p>
        <h3>The trade-off</h3>
        <p>{activeConcept.decisionTradeoff}</p>
        <div className="action-guidance">
          <h3>Adaptive AI lesson</h3>
          <p>
            Send a minimized simulation snapshot—never the full ledger or run
            history—to OpenAI GPT-5.6 (or local gpt-oss in development). Encrypted
            prompts and outputs are retained for administrator-only audit; the
            deterministic engine remains authoritative.
          </p>
          <label>
            <input
              checked={consented}
              onChange={(event) => onConsentChange(event.target.checked)}
              type="checkbox"
            />
            I agree to send the minimized, redacted game context for this lesson.
          </label>
          <button disabled={busy || !consented} onClick={onAskAi} type="button">
            {busy ? "Generating lesson…" : "Explain using my current situation"}
          </button>
        </div>
        {lesson ? (
          <div className="concept-card ai-lesson">
            <p className="hero-kicker">
              {lesson.source === "openai"
                ? "GPT-5.6 personalized lesson"
                : lesson.source === "local_oss"
                  ? "Local gpt-oss lesson"
                  : "Reliable curriculum fallback"}
            </p>
            <h3>{lesson.explanation.title}</h3>
            <p>{lesson.explanation.explanation}</p>
            <h3>Why it matters in this run</h3>
            <p>{lesson.explanation.whyItMattersNow}</p>
            <ul>
              {lesson.explanation.actionTips.map((tip) => <li key={tip}>{tip}</li>)}
            </ul>
          </div>
        ) : null}
      </article>
    </div>
  );
}
