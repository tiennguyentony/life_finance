import type {
  TeachingDebriefResponseV2,
  TeachingMomentResponseV2,
} from "../../server/teaching/service-v2";
import type { TeachingFactV2 } from "../../core/teaching-facts-v2";
import type { TeachingRewriteApiResponseV2 } from "../../server/teaching/rewrite-service-v2";
import { formatTeachingCents } from "./teaching-format";
import { formatTeachingFactValueV2 } from "./teaching-fact-format";

export function TeachingMomentPanelV2({
  response,
  busy,
  onRequestHelp,
  rewrite,
}: Readonly<{
  response: TeachingMomentResponseV2 | null;
  busy: boolean;
  onRequestHelp: () => void;
  rewrite: TeachingRewriteApiResponseV2 | null;
}>) {
  if (!response?.moment || !response.facts) return null;
  return (
    <section className="play-panel" aria-label="Verified teaching moment">
      <div>
        <p className="hero-kicker">Verified teaching moment</p>
        <h2>{response.moment.title}</h2>
      </div>
      {response.moment.paragraphs.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      {rewrite ? (
        <aside aria-label="Optional AI wording">
          <p className="hero-kicker">
            {rewrite.rewrite.source === "ai_validated"
              ? "Optional AI wording · facts unchanged"
              : "Verified local wording"}
          </p>
          {rewrite.rewrite.content.sections.flatMap((section) =>
            section.fragments.flatMap((fragment, index) =>
              fragment.kind === "text"
                ? <p key={`${section.sectionId}:${index}`}>{fragment.text}</p>
                : [],
            ),
          )}
        </aside>
      ) : null}
      <div className="cashflow-grid">
        {response.facts.facts.map((fact) => (
          <div key={fact.factId}>
            <span>{fact.labelId.replaceAll("_", " ")}</span>
            <strong>{formatTeachingFactValueV2(fact)}</strong>
            <details>
              <summary>Verified source</summary>
              <code>{fact.source.sourceId}</code>
            </details>
          </div>
        ))}
      </div>
      <button disabled={busy} onClick={onRequestHelp} type="button">
        Explain this verified concept again
      </button>
    </section>
  );
}

export function TeachingDebriefPanelV2({
  response,
}: Readonly<{ response: TeachingDebriefResponseV2 | null }>) {
  if (!response) return null;
  const { debrief } = response;
  const factById = new Map(debrief.facts.facts.map((fact) => [fact.factId, fact]));
  const sourceDetails = (
    label: string,
    sourceIds: readonly string[],
    checksum?: string,
  ) => {
    const uniqueSourceIds = [...new Set(sourceIds)];
    return (
      <details>
        <summary>{label}</summary>
        {uniqueSourceIds.length > 0 ? (
          <ul>{uniqueSourceIds.map((sourceId) => <li key={sourceId}><code>{sourceId}</code></li>)}</ul>
        ) : <p>No additional verified source identifier was recorded.</p>}
        {checksum ? <p>Result checksum <code>{checksum}</code></p> : null}
      </details>
    );
  };
  const factCard = (label: string, factId: string) => {
    const fact = factById.get(factId) as TeachingFactV2 | undefined;
    if (!fact) return null;
    return (
      <div key={factId}>
        <span>{label}</span>
        <strong>{formatTeachingFactValueV2(fact)}</strong>
        {sourceDetails("Verified fact source", [
          fact.source.sourceId,
          ...fact.source.supportingSourceIds,
        ])}
      </div>
    );
  };
  return (
    <section className="play-panel" aria-label="Verified final debrief">
      <div>
        <p className="hero-kicker">Deterministic final debrief</p>
        <h2>Grade {debrief.outcome.grade}</h2>
        <p>{debrief.outcome.reasonCode.replaceAll("_", " ")}</p>
        {sourceDetails("Verified outcome source", [debrief.outcome.sourceId])}
      </div>
      <div className="cashflow-grid">
        {factCard("Net worth", "outcome.net_worth_cents")}
        {factCard("FI progress", "outcome.fi_progress_ppm")}
        {factCard("Liquid shortfall", "outcome.residual_shortfall_cents")}
        {factCard("Retirement readiness", "outcome.retirement_grade")}
      </div>
      <details><summary>Verified turning points</summary>
        {debrief.turningPointStatus === "insufficient_verified_history" ? (
          <p>Not enough verified history exists to rank multiple turning points.</p>
        ) : null}
        <ul>{debrief.turningPoints.map((point) => (
          <li key={point.nodeId}>
            {point.month}: {point.reasonCodes.join(", ").replaceAll("_", " ")}
            {sourceDetails("Verified turning-point sources", point.sourceEvidenceIds)}
          </li>
        ))}</ul>
      </details>
      <details><summary>Causal evidence</summary>
        <ul>{debrief.causalExplanations.map((item) => (
          <li key={item.edgeId}>
            {item.text}{sourceDetails("Verified causal sources", item.sourceEvidenceIds)}
          </li>
        ))}</ul>
      </details>
      <details><summary>Next run</summary>
        <ul>{debrief.recommendations.map((item) => (
          <li key={`${item.text}:${item.sourceEvidenceIds.join(":")}`}>
            {item.text}{sourceDetails("Verified recommendation sources", item.sourceEvidenceIds)}
          </li>
        ))}</ul>
      </details>
      <details><summary>Strong decisions</summary>
        {debrief.strongDecisions.length > 0 ? (
          <ul>{debrief.strongDecisions.map((item) => (
            <li key={item.edgeId}>
              {item.text}{sourceDetails("Verified decision sources", item.sourceEvidenceIds)}
            </li>
          ))}</ul>
        ) : (
          <p>Decision quality not assessed: no verified owner signal distinguishes preparation, response, and bad luck.</p>
        )}
      </details>
      <details><summary>Change opportunities</summary>
        {debrief.improvements.length > 0 ? (
          <ul>{debrief.improvements.map((item) => (
            <li key={item.edgeId}>
              {item.text}{sourceDetails("Verified improvement sources", item.sourceEvidenceIds)}
            </li>
          ))}</ul>
        ) : <p>No verified mistake judgment is available.</p>}
      </details>
      <details><summary>Learning mastery</summary>
        <p>{debrief.mastery.status === "not_assessed"
          ? "Not assessed. Encounters and wealth alone do not prove mastery."
          : debrief.mastery.status}</p>
      </details>
      <details><summary>Verified counterfactuals</summary>
        {debrief.counterfactuals.length > 0 ? (
          <ul>{debrief.counterfactuals.map((item) => (
            <li key={item.resultChecksum}>
              {item.interventionPath.replaceAll("_", " ")}: net-worth difference {formatTeachingCents(item.difference.netWorthCents)} over {item.comparedMonths} compared months.
              {sourceDetails(
                "Verified counterfactual sources",
                item.sourceEvidenceIds,
                item.resultChecksum,
              )}
            </li>
          ))}</ul>
        ) : (
          <p>{response.counterfactualRequestSource === "unavailable"
            ? "Counterfactual unavailable: no verified supported recurring-strategy change could be compared."
            : "No verified counterfactual result is available for this debrief."}</p>
        )}
      </details>
    </section>
  );
}
