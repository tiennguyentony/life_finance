import { formatMoney } from "./play-model";
import type { PolicyPreviewSession } from "./policy-preview-model";

function formatSignedMoney(cents: number): string {
  if (cents > 0) return `+${formatMoney(cents)}`;
  return formatMoney(cents);
}

function formatRatePpm(ratePpm: number): string {
  return `${(ratePpm / 10_000).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })}%`;
}

function formatEmergencyTarget(targetPpm: number | undefined): string {
  return targetPpm === undefined
    ? "historical default"
    : `${(targetPpm / 1_000_000).toLocaleString("en-US", {
        maximumFractionDigits: 2,
      })} months`;
}

function formatCoverageIds(ids: readonly string[] | undefined): string {
  return ids === undefined
    ? "onboarding selection"
    : ids.length === 0
      ? "none"
      : ids.join(", ");
}

const STRATEGY_RATE_FIELDS = [
  ["401(k)", "preTax401kSalaryRatePpm"],
  ["HSA", "preTaxHsaSalaryRatePpm"],
  ["Broad index", "afterTaxBroadIndexRatePpm"],
  ["Sector", "afterTaxSectorRatePpm"],
  ["Speculative", "afterTaxSpeculativeRatePpm"],
  ["IRA", "afterTaxIraRatePpm"],
  ["Extra debt", "afterTaxExtraDebtRatePpm"],
] as const;

export function PolicyPreviewPanel({
  session,
  busy,
  onApprove,
  onCancel,
}: Readonly<{
  session: PolicyPreviewSession;
  busy: boolean;
  onApprove: () => void;
  onCancel: () => void;
}>) {
  const { response } = session;
  const effects = [
    ["Cash", response.effects.cashChangeCents],
    ["Automatic liquidity", response.effects.automaticLiquidityChangeCents],
    ["Term debt principal", response.effects.termDebtPrincipalChangeCents],
    ["Revolving credit used", response.effects.revolvingCreditUsedChangeCents],
    ["Annual living cost", response.effects.annualLivingCostChangeCents],
    ["Required obligations", response.effects.requiredObligationsChangeCents],
  ] as const;

  return (
    <section className="play-panel policy-preview" aria-live="polite">
      <div className="section-heading">
        <div>
          <p className="hero-kicker">No changes applied yet</p>
          <h2>Review exact engine effects</h2>
        </div>
        <p>
          {response.commandType === "set_recurring_strategy"
            ? "Recurring strategy policy"
            : response.actionPolicyVersion
              ? `Action policy ${response.actionPolicyVersion}`
              : "Frozen historical action policy"}
        </p>
      </div>

      <dl className="policy-preview-effects">
        {effects.map(([label, cents]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{formatSignedMoney(cents)}</dd>
          </div>
        ))}
      </dl>

      <div className="policy-preview-evidence">
        <div>
          <h3>Persistent policy effects</h3>
          {response.policyChanges.length === 0 ? (
            <p>None. This decision has only immediate balance-sheet effects.</p>
          ) : (
            <ul>
              {response.policyChanges.map((change) =>
                change.kind === "annual_living_cost" ? (
                  <li key={`${change.kind}.${change.effectiveMonth}`}>
                    Annual living cost: {formatMoney(change.previousAnnualLivingCostCents)} -&gt;{" "}
                    {formatMoney(change.resultingAnnualLivingCostCents)}
                  </li>
                ) : (
                  <li key={`${change.kind}.${change.effectiveMonth}`}>
                    Recurring strategy replaces the prior policy from {change.effectiveMonth}.
                    <ul>
                      <li>
                        Emergency target: {formatEmergencyTarget(change.previous.emergencyFundTargetMonthsPpm)} -&gt;{" "}
                        {formatEmergencyTarget(change.resulting.emergencyFundTargetMonthsPpm)}
                      </li>
                      <li>
                        Insurance: {formatCoverageIds(change.previous.insuranceCoverageIds)} -&gt;{" "}
                        {formatCoverageIds(change.resulting.insuranceCoverageIds)}
                      </li>
                      {STRATEGY_RATE_FIELDS.map(([label, field]) => (
                        <li key={field}>
                          {label}: {formatRatePpm(change.previous[field])} -&gt;{" "}
                          {formatRatePpm(change.resulting[field])}
                        </li>
                      ))}
                    </ul>
                  </li>
                ),
              )}
            </ul>
          )}
        </div>

        <div>
          <h3>Ledger effects</h3>
          {response.appendedLedgerTransactions.length === 0 ? (
            <p>No journal transaction is appended by this policy replacement.</p>
          ) : (
            <ul>
              {response.appendedLedgerTransactions.map((transaction) => (
                <li key={transaction.id}>
                  {transaction.description} ({transaction.postings.length} balanced postings)
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="play-note">
        Approval applies command {session.command.id} at revision {session.command.expectedRevision}. Editing the draft or advancing the run clears this preview.
      </p>
      <div className="play-button-row">
        <button disabled={busy} onClick={onApprove} type="button">
          Approve exact preview
        </button>
        <button className="play-quiet" disabled={busy} onClick={onCancel} type="button">
          Cancel preview
        </button>
      </div>
    </section>
  );
}
